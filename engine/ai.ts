/**
 * 【我的刀盾】策略 AI
 *
 * 设计约束（公平性）：
 * - 只读取「自己座位的私有信息 + 全公开信息」：
 *   自身 pendingPlacement、公开的 HP / 冷却 / 使用次数 / 已开牌日志。
 *   绝不窥视对手的 pendingBid / pendingPlacement。
 *
 * 策略骨架（期望伤害模型）：
 * - 放置：武器方在对手盾牌分布（按可用性均匀）下最大化期望伤害；
 *   盾牌方最小化期望伤害。难度越高越悲观（按对手最优应对加权）。
 * - 出价：使用权竞拍的价值 ≈ 期望伤害的某个比例（赢者打人、输者挨打，
 *   赢输摆动约 2×D）；身份竞拍按「武器位优势 + 盾牌位优势」小额出价。
 * - 终局特判：必杀时全押、濒死时要么搏命要么极限保守。
 */
import type { Action, EquipId, GameState, Seat, ShieldId, WeaponId } from './types';
import { BLEED_PER_ROUND, DAMAGE_MATRIX, SHIELDS, WEAPONS } from './constants';
import { legalActions } from './engine';

export type AILevel = 'easy' | 'normal' | 'hard';

/** 确定性伪随机（mulberry32），种子化保证对局可复现 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LevelTuning {
  /** 出价随机波动幅度 */
  bidNoise: number;
  /** 出价 = 期望伤害 × [lo, hi] 区间内随机系数 */
  bidFactor: [number, number];
  /** 放置评分随机波动 */
  placeNoise: number;
  /** 悲观系数：按对手最优应对加权的权重（0=纯平均，1=纯最坏情况） */
  pessimism: number;
  /** 失误率：完全随机出手的概率 */
  blunder: number;
}

const TUNING: Record<AILevel, LevelTuning> = {
  easy: { bidNoise: 8, bidFactor: [0.15, 0.9], placeNoise: 6, pessimism: 0.2, blunder: 0.22 },
  normal: { bidNoise: 4, bidFactor: [0.35, 0.8], placeNoise: 2, pessimism: 0.55, blunder: 0.05 },
  hard: { bidNoise: 1.5, bidFactor: [0.45, 0.75], placeNoise: 0.4, pessimism: 0.85, blunder: 0 },
};

export interface BotPlayer {
  readonly level: AILevel;
  /** 为 seat 选择动作；无合法动作时返回 null */
  chooseAction(state: GameState, seat: Seat): Action | null;
}

export function createBot(level: AILevel = 'normal', seed = (Date.now() & 0xffffffff) >>> 0): BotPlayer {
  const rng = mulberry32(seed);
  const t = TUNING[level];

  return {
    level,
    chooseAction(state, seat) {
      const act = legalActions(state, seat)[0];
      if (!act) return null;

      // 失误：完全随机（简单机器人专属）
      if (t.blunder > 0 && rng() < t.blunder) {
        if (act.type === 'BID') {
          const amount = act.min + Math.floor(rng() * (act.max - act.min + 1));
          return { type: 'BID', seat, amount };
        }
        const equip = act.options[Math.floor(rng() * act.options.length)];
        return equip ? { type: 'PLACE', seat, equip } : null;
      }

      return act.type === 'BID' ? decideBid(state, seat, act.min, act.max) : decidePlace(state, seat, act.options);
    },
  };

  // ── 放置决策 ────────────────────────────────────────────────

  function decidePlace(state: GameState, seat: Seat, options: EquipId[]): Action | null {
    const role: 'weapon' | 'shield' = seat === state.weaponPlacer ? 'weapon' : 'shield';
    const oppCounters: EquipId[] = (role === 'weapon' ? available(SHIELDS) : available(WEAPONS)) as EquipId[];
    if (oppCounters.length === 0) return null;

    let best: { equip: EquipId; score: number } | null = null;
    for (const e of options) {
      const dmgs = oppCounters.map((c) =>
        role === 'weapon'
          ? DAMAGE_MATRIX[e as WeaponId][c as ShieldId]
          : DAMAGE_MATRIX[c as WeaponId][e as ShieldId],
      );
      const avg = dmgs.reduce((x, y) => x + y, 0) / dmgs.length;
      const worst = role === 'weapon' ? Math.min(...dmgs) : Math.max(...dmgs);
      // 武器方要伤害高（悲观=看最小值），盾牌方要伤害低（悲观=看最大值）
      let score = (1 - t.pessimism) * avg + t.pessimism * worst;
      if (role === 'weapon') score = -score;
      // 轻微避免把用满 2 次的装备再推入冷却
      score -= state.usage[e] * 1.5;
      score += (rng() * 2 - 1) * t.placeNoise;
      if (!best || score > best.score) best = { equip: e, score };
    }
    return best ? { type: 'PLACE', seat, equip: best.equip } : null;

    function available<T extends EquipId>(pool: readonly T[]): T[] {
      return pool.filter((e) => state.cooldown[e] === 0);
    }
  }

  // ── 出价决策 ────────────────────────────────────────────────

  function decideBid(state: GameState, seat: Seat, min: number, max: number): Action {
    const me = state.players[seat];
    const opp = state.players[seat === 'A' ? 'B' : 'A'];

    let value: number;

    if (state.auction?.kind === 'identity') {
      // 身份竞拍：按「武器位 + 盾牌位」的综合优势小额出价
      value = identityValue(state, seat);
    } else {
      // 使用权竞拍：期望伤害 × 系数
      const myPlace = me.pendingPlacement;
      const dmgList = expectedDamages(state, myPlace);
      const avg = dmgList.avg;
      const f = t.bidFactor[0] + rng() * (t.bidFactor[1] - t.bidFactor[0]);
      value = avg * f;

      // 终局特判（仅当自己放的是武器时才可能主动击杀）
      if (myPlace !== undefined && (WEAPONS as readonly string[]).includes(myPlace)) {
        const w = myPlace as WeaponId;
        const shields = SHIELDS.filter((s) => state.cooldown[s] === 0);
        const dmgs = (shields.length ? shields : SHIELDS).map((s) => DAMAGE_MATRIX[w][s]);
        const minD = Math.min(...dmgs);
        const maxD = Math.max(...dmgs);
        if (minD >= opp.hp) {
          // 必杀（无论对手放什么盾）：全押 —— 赢了即终局，出价亏损无所谓
          return clamp(max);
        }
        if (maxD >= opp.hp && avg >= opp.hp * 0.7) {
          value = Math.max(value, max * 0.9); // 大概率击杀，重注
        }
        if (me.hp <= BLEED_PER_ROUND + 1 && maxD >= opp.hp) {
          // 濒死但有机会终结：搏命
          return clamp(max);
        }
      }
      // 濒死且无法击杀：极限保守，保住平局希望
      if (me.hp <= BLEED_PER_ROUND + 1) value = min;
    }

    value += (rng() * 2 - 1) * t.bidNoise;
    return clamp(Math.round(value));

    function clamp(v: number): Action {
      return { type: 'BID', seat, amount: Math.min(Math.max(v, min), max) };
    }
  }

  /** 身份竞拍价值：拿到武器位/盾牌位各自的最优期望的加权和 */
  function identityValue(state: GameState, seat: Seat): number {
    const availW = WEAPONS.filter((w) => state.cooldown[w] === 0);
    const availS = SHIELDS.filter((s) => state.cooldown[s] === 0);
    const ws = availW.length ? availW : [...WEAPONS];
    const ss = availS.length ? availS : [...SHIELDS];
    // 武器位：能打出的期望伤害
    const bestW = Math.max(
      ...ws.map((w) => {
        const dmgs = ss.map((s) => DAMAGE_MATRIX[w][s]);
        return (1 - t.pessimism) * avgOf(dmgs) + t.pessimism * Math.min(...dmgs);
      }),
    );
    // 盾牌位：能规避的期望伤害
    const bestS = Math.max(
      ...ss.map((s) => {
        const dmgs = ws.map((w) => DAMAGE_MATRIX[w][s]);
        return -((1 - t.pessimism) * avgOf(dmgs) + t.pessimism * Math.max(...dmgs));
      }),
    );
    // 开局优势估值：基础 4 血 + 优势加成，并按难度截断
    // （基础为正：放置权附带信息与主动权价值，避免高手对局退化成 0 对 0 僵局）
    const raw = 4 + (bestW + bestS) * 0.4;
    return Math.min(Math.max(raw, 0), 14);
  }

  /** 自己放置物已知时，按对手可用装备分布估算期望伤害 */
  function expectedDamages(
    state: GameState,
    myPlace: EquipId | undefined,
  ): { avg: number; min: number; max: number } {
    if (myPlace === undefined) return { avg: 8, min: 0, max: 30 }; // 无信息先验
    if ((WEAPONS as readonly string[]).includes(myPlace)) {
      const w = myPlace as WeaponId;
      const shields = SHIELDS.filter((s) => state.cooldown[s] === 0);
      const dmgs = (shields.length ? shields : SHIELDS).map((s) => DAMAGE_MATRIX[w][s]);
      return { avg: avgOf(dmgs), min: Math.min(...dmgs), max: Math.max(...dmgs) };
    }
    const s = myPlace as ShieldId;
    const weapons = WEAPONS.filter((w) => state.cooldown[w] === 0);
    const dmgs = (weapons.length ? weapons : WEAPONS).map((w) => DAMAGE_MATRIX[w][s]);
    return { avg: avgOf(dmgs), min: Math.min(...dmgs), max: Math.max(...dmgs) };
  }
}

function avgOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
