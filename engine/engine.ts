/**
 * 【我的刀盾】核心规则引擎
 *
 * 已钉死的规则裁定（与设计文档一致）：
 *  1. 竞拍平局 → 重拍，本次出价不扣血；只有分出胜负那一次，双方才各扣自己的出价
 *  2. 防死锁：同一场竞拍连续平局 ≥3 次后最低出价递增（1, 3, 5, ...），
 *     连续平局 ≥6 次时标的直接判给 firstMover（不扣血），保证游戏必然终结
 *  3. 使用权竞拍平局处理与身份竞拍一致
 *  4. 结算时序：出价扣血（出价 ≤ hp-1，永不致死）→ 伤害 → 流血；
 *     伤害致死后跳过流血；流血阶段双归零 = 平局
 *  5. 冷却从下一小轮起算，锁定 2 个小轮；冷却结束后使用次数清零
 *  6. 冷却状态跨周期延续；每 3 小轮双方直接交换放置权，无需再竞拍
 */
import type {
  Action,
  EquipId,
  GameState,
  LegalAction,
  LogEntry,
  PlayerView,
  Seat,
  ShieldId,
  WeaponId,
} from './types';
import {
  BLEED_PER_ROUND,
  COOLDOWN_ROUNDS,
  DAMAGE_MATRIX,
  INITIAL_HP,
  SHIELDS,
  TIE_FORCED_AWARD,
  TIE_MINBID_THRESHOLD,
  USAGE_LIMIT,
  WEAPONS,
} from './constants';

/** 引擎错误：动作非法时抛出（携带机器可读的错误码） */
export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

const other = (seat: Seat): Seat => (seat === 'A' ? 'B' : 'A');
const isWeapon = (e: EquipId): boolean => (WEAPONS as readonly string[]).includes(e);

const ALL_EQUIPS: readonly EquipId[] = [...WEAPONS, ...SHIELDS];

function zeroedRecord(): Record<EquipId, number> {
  const r = {} as Record<EquipId, number>;
  for (const e of ALL_EQUIPS) r[e] = 0;
  return r;
}

/** 状态完全可序列化，深拷贝用于保证 reducer 纯度 */
function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

export function newGame(opts: { firstMover?: Seat } = {}): GameState {
  return {
    phase: 'AUCTION_IDENTITY',
    round: 1,
    cycle: 1,
    roundInCycle: 1,
    // 占位：身份竞拍开牌后立即被覆盖
    weaponPlacer: opts.firstMover ?? 'A',
    firstMover: opts.firstMover ?? 'A',
    players: {
      A: { hp: INITIAL_HP },
      B: { hp: INITIAL_HP },
    },
    auction: { kind: 'identity', tieStreak: 0 },
    placements: {},
    usage: zeroedRecord(),
    cooldown: zeroedRecord(),
    log: [],
    winner: null,
  };
}

/**
 * 防死锁最低出价：连续平局 <3 次时为 0；之后 1, 3, 5, ... 递增。
 * 按该玩家血量截断（出价必须 ≤ hp-1），保证任何血量下总存在合法出价。
 */
export function minBidFor(auction: { tieStreak: number } | null, hp: number): number {
  if (!auction || auction.tieStreak < TIE_MINBID_THRESHOLD) return 0;
  const raw = 1 + (auction.tieStreak - TIE_MINBID_THRESHOLD) * 2;
  return Math.min(raw, Math.max(0, hp - 1));
}

/** 纯函数 reducer：唯一的状态转移入口 */
export function reducer(state: GameState, action: Action): GameState {
  if (state.phase === 'GAME_OVER') {
    throw new EngineError('GAME_OVER', '游戏已结束，不能再执行动作');
  }
  const s = cloneState(state);
  switch (action.type) {
    case 'BID':
      handleBid(s, action);
      break;
    case 'PLACE':
      handlePlace(s, action);
      break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// 出价（身份竞拍 / 使用权竞拍共用）
// ---------------------------------------------------------------------------

function handleBid(s: GameState, action: Extract<Action, { type: 'BID' }>): void {
  if (s.phase !== 'AUCTION_IDENTITY' && s.phase !== 'AUCTION_WEAPON') {
    throw new EngineError('WRONG_PHASE', `当前阶段 ${s.phase} 不可出价`);
  }
  const p = s.players[action.seat];
  if (p.pendingBid !== undefined) {
    throw new EngineError('ALREADY_BID', '本回合已提交出价，等待开牌');
  }
  const min = minBidFor(s.auction, p.hp);
  const max = p.hp - 1;
  if (!Number.isInteger(action.amount)) {
    throw new EngineError('BID_NOT_INTEGER', '出价必须是整数');
  }
  if (action.amount < min || action.amount > max) {
    throw new EngineError(
      'BID_OUT_OF_RANGE',
      `出价必须在 [${min}, ${max}]（不能出不低于当前血量的分数把自己拍死${min > 0 ? `；防死锁强制最低出价 ${min}` : ''}）`,
    );
  }
  p.pendingBid = action.amount;

  if (s.players.A.pendingBid !== undefined && s.players.B.pendingBid !== undefined) {
    resolveAuction(s);
  }
}

/** 双方出价齐备，开牌结算 */
function resolveAuction(s: GameState): void {
  const auction = s.auction!;
  const a = s.players.A.pendingBid!;
  const b = s.players.B.pendingBid!;
  const clearBids = () => {
    s.players.A.pendingBid = undefined;
    s.players.B.pendingBid = undefined;
  };

  // —— 平局：出价不扣血，开牌后重拍 ——
  if (a === b) {
    auction.tieStreak++;
    s.log.push({
      kind: 'auctionTie',
      auction: auction.kind,
      bids: { A: a, B: b },
      tieStreak: auction.tieStreak,
    });
    clearBids();

    if (auction.tieStreak >= TIE_FORCED_AWARD) {
      // 终极防死锁：标的判给先手，不扣血
      const seat = s.firstMover;
      s.log.push({ kind: 'deadlockAwarded', auction: auction.kind, seat });
      s.auction = null;
      if (auction.kind === 'identity') {
        s.weaponPlacer = seat;
        s.phase = 'PLACE';
      } else {
        resolveCombat(s, seat);
      }
    }
    return;
  }

  // —— 分出胜负：双方各扣自己的出价（出价 ≤ hp-1，扣后 hp ≥ 1，不会致死） ——
  const winner: Seat = a > b ? 'A' : 'B';
  s.players.A.hp -= a;
  s.players.B.hp -= b;
  clearBids();
  s.auction = null;

  s.log.push({
    kind: 'auctionResolved',
    auction: auction.kind,
    winner,
    bids: { A: a, B: b },
    hpAfter: { A: s.players.A.hp, B: s.players.B.hp },
  });

  if (auction.kind === 'identity') {
    // 高价者获武器放置权（本周期 3 个小轮），低价者获盾牌放置权
    s.weaponPlacer = winner;
    s.phase = 'PLACE';
  } else {
    // 高价者获武器使用权，直接进入伤害结算
    resolveCombat(s, winner);
  }
}

// ---------------------------------------------------------------------------
// 放置（双盲）
// ---------------------------------------------------------------------------

function handlePlace(s: GameState, action: Extract<Action, { type: 'PLACE' }>): void {
  if (s.phase !== 'PLACE') {
    throw new EngineError('WRONG_PHASE', `当前阶段 ${s.phase} 不可放置`);
  }
  const seat = action.seat;
  const p = s.players[seat];
  if (p.pendingPlacement !== undefined) {
    throw new EngineError('ALREADY_PLACED', '本回合已提交放置');
  }
  const role: 'weapon' | 'shield' = seat === s.weaponPlacer ? 'weapon' : 'shield';
  if (role === 'weapon' && !isWeapon(action.equip)) {
    throw new EngineError('WRONG_EQUIP_TYPE', '武器放置权持有者只能放置武器');
  }
  if (role === 'shield' && isWeapon(action.equip)) {
    throw new EngineError('WRONG_EQUIP_TYPE', '盾牌放置权持有者只能放置盾牌');
  }
  if (s.cooldown[action.equip] > 0) {
    throw new EngineError('EQUIP_COOLDOWN', `装备 ${action.equip} 冷却中，剩余 ${s.cooldown[action.equip]} 小轮`);
  }
  p.pendingPlacement = action.equip;

  // 双方都提交后，聚合放置结果并进入使用权竞拍
  const wa = s.weaponPlacer;
  const sa = other(wa);
  if (s.players[wa].pendingPlacement !== undefined && s.players[sa].pendingPlacement !== undefined) {
    s.placements = {
      weapon: s.players[wa].pendingPlacement as WeaponId,
      shield: s.players[sa].pendingPlacement as ShieldId,
    };
    s.auction = { kind: 'weapon', tieStreak: 0 };
    s.phase = 'AUCTION_WEAPON';
  }
}

// ---------------------------------------------------------------------------
// 伤害结算（使用权竞拍结束后自动执行）
// ---------------------------------------------------------------------------

function resolveCombat(s: GameState, weaponUser: Seat): void {
  const weapon = s.placements.weapon!;
  const shield = s.placements.shield!;
  const shieldUser = other(weaponUser);
  const weaponPlacerSeat = s.weaponPlacer;
  const shieldPlacerSeat = other(weaponPlacerSeat);
  const damage = DAMAGE_MATRIX[weapon][shield];

  // 时序：先伤害，后流血；伤害致死则跳过流血
  s.players[shieldUser].hp -= damage;
  let bleed = 0;
  let gameOver: { winner: Seat | 'DRAW'; reason: 'damage' | 'bleed' } | null = null;

  if (s.players[shieldUser].hp <= 0) {
    gameOver = { winner: weaponUser, reason: 'damage' };
  } else {
    bleed = BLEED_PER_ROUND;
    s.players.A.hp -= bleed;
    s.players.B.hp -= bleed;
    const deadA = s.players.A.hp <= 0;
    const deadB = s.players.B.hp <= 0;
    if (deadA && deadB) gameOver = { winner: 'DRAW', reason: 'bleed' };
    else if (deadA) gameOver = { winner: 'B', reason: 'bleed' };
    else if (deadB) gameOver = { winner: 'A', reason: 'bleed' };
  }

  // 冷却结算：
  // 1) 先递减既有冷却（归零时清空使用次数，装备重新可用）
  // 2) 再登记本回合登场装备的使用次数（满 2 次进入冷却，从下一小轮起锁定 2 轮）
  for (const e of ALL_EQUIPS) {
    if (s.cooldown[e] > 0) {
      s.cooldown[e]--;
      if (s.cooldown[e] === 0) s.usage[e] = 0;
    }
  }
  const enteredCooldown: EquipId[] = [];
  for (const e of [weapon, shield] as EquipId[]) {
    s.usage[e]++;
    if (s.usage[e] >= USAGE_LIMIT) {
      s.cooldown[e] = COOLDOWN_ROUNDS;
      enteredCooldown.push(e);
    }
  }

  s.log.push({
    kind: 'roundResolved',
    round: s.round,
    cycle: s.cycle,
    weapon,
    shield,
    weaponPlacer: weaponPlacerSeat,
    shieldPlacer: shieldPlacerSeat,
    weaponUser,
    shieldUser,
    damage,
    bleed,
    hpAfter: { A: s.players.A.hp, B: s.players.B.hp },
    enteredCooldown,
  });

  // 清理本回合放置（结算后已通过日志公开）
  s.placements = {};
  s.players.A.pendingPlacement = undefined;
  s.players.B.pendingPlacement = undefined;
  s.auction = null;

  if (gameOver) {
    s.phase = 'GAME_OVER';
    s.winner = gameOver.winner;
    s.log.push({
      kind: 'gameOver',
      winner: gameOver.winner,
      reason: gameOver.reason,
      round: s.round,
    });
    return;
  }

  // 周期推进：3 小轮为一大周期，结束后直接交换放置权
  if (s.roundInCycle === 3) {
    s.cycle++;
    s.roundInCycle = 1;
    s.weaponPlacer = other(s.weaponPlacer);
  } else {
    s.roundInCycle = (s.roundInCycle + 1) as 1 | 2 | 3;
  }
  s.round++;
  s.phase = 'PLACE';
}

// ---------------------------------------------------------------------------
// 合法动作 & 视角过滤（前端 / AI 唯一允许接触的接口）
// ---------------------------------------------------------------------------

export function legalActions(state: GameState, seat: Seat): LegalAction[] {
  if (state.phase === 'GAME_OVER') return [];
  const p = state.players[seat];

  if (state.phase === 'AUCTION_IDENTITY' || state.phase === 'AUCTION_WEAPON') {
    if (p.pendingBid !== undefined) return [];
    return [
      {
        type: 'BID',
        seat,
        min: minBidFor(state.auction, p.hp),
        max: p.hp - 1,
      },
    ];
  }

  // PLACE 阶段
  if (p.pendingPlacement !== undefined) return [];
  const role: 'weapon' | 'shield' = seat === state.weaponPlacer ? 'weapon' : 'shield';
  const pool: readonly EquipId[] = role === 'weapon' ? WEAPONS : SHIELDS;
  const options = pool.filter((e) => state.cooldown[e] === 0);
  return [{ type: 'PLACE', seat, role, options }];
}

/**
 * 脱敏的公开状态——广播给全体观战者、裁判、双方均可见的部分。
 * 用于联机传输：每个客户端用此 + 自己的私有信息重建完整 PlayerView。
 * 不包含任何 pendingBid / pendingPlacement 内容。
 */
export interface PublicState {
  phase: GameState['phase'];
  round: number;
  cycle: number;
  roundInCycle: number;
  weaponPlacer: Seat;
  firstMover: Seat;
  hp: Record<Seat, number>;
  usage: Record<EquipId, number>;
  cooldown: Record<EquipId, number>;
  log: LogEntry[];
  winner: GameState['winner'];
  /** 隐私元信息：每位玩家是否已提交当前动作（不含内容） */
  hasBid: Record<Seat, boolean>;
  hasPlacement: Record<Seat, boolean>;
}

export function toPublicState(state: GameState): PublicState {
  const inAuction = state.phase === 'AUCTION_IDENTITY' || state.phase === 'AUCTION_WEAPON';
  return {
    phase: state.phase,
    round: state.round,
    cycle: state.cycle,
    roundInCycle: state.roundInCycle,
    weaponPlacer: state.weaponPlacer,
    firstMover: state.firstMover,
    hp: { A: state.players.A.hp, B: state.players.B.hp },
    usage: { ...state.usage },
    cooldown: { ...state.cooldown },
    log: state.log,
    winner: state.winner,
    hasBid: {
      A: inAuction && state.players.A.pendingBid !== undefined,
      B: inAuction && state.players.B.pendingBid !== undefined,
    },
    hasPlacement: {
      A: state.phase === 'PLACE' && state.players.A.pendingPlacement !== undefined,
      B: state.phase === 'PLACE' && state.players.B.pendingPlacement !== undefined,
    },
  };
}

export function createView(state: GameState, seat: Seat): PlayerView {
  const self = state.players[seat];
  const opp = state.players[other(seat)];
  const inAuction = state.phase === 'AUCTION_IDENTITY' || state.phase === 'AUCTION_WEAPON';

  const view: PlayerView = {
    phase: state.phase,
    round: state.round,
    cycle: state.cycle,
    roundInCycle: state.roundInCycle,
    weaponPlacer: state.weaponPlacer,
    firstMover: state.firstMover,
    self: {
      seat,
      hp: self.hp,
      pendingBid: self.pendingBid,
      pendingPlacement: self.pendingPlacement,
      placementRole: seat === state.weaponPlacer ? 'weapon' : 'shield',
    },
    opponent: {
      seat: other(seat),
      hp: opp.hp,
      hasPendingBid: inAuction && opp.pendingBid !== undefined,
      hasSubmittedPlacement: state.phase === 'PLACE' && opp.pendingPlacement !== undefined,
    },
    usage: { ...state.usage },
    cooldown: { ...state.cooldown },
    log: state.log,
    winner: state.winner,
  };

  if (inAuction && self.pendingBid === undefined) {
    view.self.bidRange = {
      min: minBidFor(state.auction, self.hp),
      max: self.hp - 1,
    };
  }
  return view;
}
