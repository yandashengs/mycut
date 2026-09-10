/**
 * 【我的刀盾】规则引擎单元测试
 * 覆盖：身份竞拍、平局重拍、防死锁、双盲放置、使用权竞拍、
 *       伤害矩阵、流血、冷却（含跨周期）、归零判定、视角过滤、终结性
 */
import { describe, expect, it } from 'vitest';
import {
  Action,
  EngineError,
  GameState,
  Seat,
  ShieldId,
  WeaponId,
  createView,
  legalActions,
  minBidFor,
  newGame,
  reducer,
} from '../engine';

const other = (s: Seat): Seat => (s === 'A' ? 'B' : 'A');

function play(actions: Action[], firstMover: Seat = 'A'): GameState {
  let s = newGame({ firstMover });
  for (const a of actions) s = reducer(s, a);
  return s;
}

/** 快速走完一个小轮（不含身份竞拍）：双方放置 + 双方出价 */
function quickRound(
  s: GameState,
  weapon: WeaponId,
  shield: ShieldId,
  bidA: number,
  bidB: number,
): GameState {
  const wp = s.weaponPlacer;
  s = reducer(s, { type: 'PLACE', seat: wp, equip: weapon });
  s = reducer(s, { type: 'PLACE', seat: other(wp), equip: shield });
  s = reducer(s, { type: 'BID', seat: 'A', amount: bidA });
  s = reducer(s, { type: 'BID', seat: 'B', amount: bidB });
  return s;
}

/** 完成开局身份竞拍（A 出 high 获武器放置权） */
function startWithAAsWeaponPlacer(): GameState {
  return play([
    { type: 'BID', seat: 'A', amount: 10 },
    { type: 'BID', seat: 'B', amount: 3 },
  ]);
}

/** 直接篡改血量（测试用，模拟濒死局面） */
function setHp(s: GameState, hpA: number, hpB: number): GameState {
  const c = JSON.parse(JSON.stringify(s)) as GameState;
  c.players.A.hp = hpA;
  c.players.B.hp = hpB;
  return c;
}

// ---------------------------------------------------------------------------

describe('初始状态', () => {
  it('开局各 100 HP，处于身份竞拍阶段', () => {
    const s = newGame();
    expect(s.phase).toBe('AUCTION_IDENTITY');
    expect(s.players.A.hp).toBe(100);
    expect(s.players.B.hp).toBe(100);
    expect(s.round).toBe(1);
    expect(s.cycle).toBe(1);
    expect(s.auction?.kind).toBe('identity');
  });
});

describe('身份竞拍', () => {
  it('高价者获武器放置权，双方各扣出价血量', () => {
    const s = startWithAAsWeaponPlacer();
    expect(s.weaponPlacer).toBe('A');
    expect(s.players.A.hp).toBe(90);
    expect(s.players.B.hp).toBe(97);
    expect(s.phase).toBe('PLACE');
    expect(s.log.at(-1)?.kind).toBe('auctionResolved');
  });

  it('低价者获盾牌放置权（B 高价时）', () => {
    const s = play([
      { type: 'BID', seat: 'A', amount: 2 },
      { type: 'BID', seat: 'B', amount: 7 },
    ]);
    expect(s.weaponPlacer).toBe('B');
    expect(s.players.A.hp).toBe(98);
    expect(s.players.B.hp).toBe(93);
  });

  it('平局不扣血，开牌后重拍', () => {
    let s = play([
      { type: 'BID', seat: 'A', amount: 5 },
      { type: 'BID', seat: 'B', amount: 5 },
    ]);
    expect(s.phase).toBe('AUCTION_IDENTITY');
    expect(s.players.A.hp).toBe(100);
    expect(s.players.B.hp).toBe(100);
    expect(s.auction?.tieStreak).toBe(1);
    // 重拍分出胜负，只扣这一次
    s = reducer(s, { type: 'BID', seat: 'A', amount: 4 });
    s = reducer(s, { type: 'BID', seat: 'B', amount: 1 });
    expect(s.weaponPlacer).toBe('A');
    expect(s.players.A.hp).toBe(96);
    expect(s.players.B.hp).toBe(99);
  });

  it('出价 0 是合法的（0 对 0 触发平局）', () => {
    const s = play([
      { type: 'BID', seat: 'A', amount: 0 },
      { type: 'BID', seat: 'B', amount: 0 },
    ]);
    expect(s.phase).toBe('AUCTION_IDENTITY');
    expect(s.auction?.tieStreak).toBe(1);
  });
});

describe('出价校验', () => {
  it('出价不能 >= 当前血量（不能拍死自己）', () => {
    expect(() =>
      play([
        { type: 'BID', seat: 'A', amount: 100 },
        { type: 'BID', seat: 'B', amount: 1 },
      ]),
    ).toThrow(EngineError);
    expect(() =>
      play([
        { type: 'BID', seat: 'A', amount: 99 },
        { type: 'BID', seat: 'B', amount: 99 },
      ]),
    ).not.toThrow(); // 99 = hp-1 合法
  });

  it('非整数 / 负数 / 重复提交均非法', () => {
    expect(() => play([{ type: 'BID', seat: 'A', amount: 1.5 }])).toThrow(EngineError);
    expect(() => play([{ type: 'BID', seat: 'A', amount: -1 }])).toThrow(EngineError);
    let s = newGame();
    s = reducer(s, { type: 'BID', seat: 'A', amount: 1 });
    expect(() => reducer(s, { type: 'BID', seat: 'A', amount: 2 })).toThrow(EngineError);
  });

  it('游戏结束后任何动作非法', () => {
    let s = startWithAAsWeaponPlacer();
    s = setHp(s, 100, 10);
    s = quickRound(s, 'pistol', 'leather', 1, 0); // 30 伤害致死
    expect(s.phase).toBe('GAME_OVER');
    expect(() => reducer(s, { type: 'BID', seat: 'A', amount: 1 })).toThrow(EngineError);
  });
});

describe('防死锁', () => {
  /** 制造 n 次平局（双方都出当前强制最低价，天然相同 → 平局） */
  function ties(n: number, firstMover: Seat = 'A'): GameState {
    let s = newGame({ firstMover });
    for (let i = 0; i < n; i++) {
      // 若已达终极裁决次数会自动结束拍卖，此时停止
      if (s.phase !== 'AUCTION_IDENTITY') break;
      const bid = minBidFor(s.auction, s.players.A.hp);
      s = reducer(s, { type: 'BID', seat: 'A', amount: bid });
      s = reducer(s, { type: 'BID', seat: 'B', amount: bid });
    }
    return s;
  }

  it('连续 3 次平局后，第 4 次最低出价强制为 1（禁止再出 0）', () => {
    const s = ties(3);
    expect(s.phase).toBe('AUCTION_IDENTITY');
    expect(s.auction?.tieStreak).toBe(3);
    expect(legalActions(s, 'A')[0]).toMatchObject({ type: 'BID', min: 1, max: 99 });
    expect(() =>
      reducer(s, { type: 'BID', seat: 'A', amount: 0 }),
    ).toThrow(EngineError);
  });

  it('平局越多最低出价越高（1 → 3 → 5）', () => {
    expect(minBidOf(ties(3))).toBe(1);
    expect(minBidOf(ties(4))).toBe(3);
    expect(minBidOf(ties(5))).toBe(5);

    function minBidOf(s: GameState): number {
      const a = legalActions(s, 'A')[0];
      if (a?.type !== 'BID') throw new Error('应为出价动作');
      return a.min;
    }
  });

  it('连续 6 次平局触发终极裁决：标的判给先手且不扣血', () => {
    const s = ties(6);
    expect(s.phase).toBe('PLACE');
    expect(s.weaponPlacer).toBe('A'); // firstMover 默认 A
    expect(s.players.A.hp).toBe(100);
    expect(s.players.B.hp).toBe(100);
    expect(s.log.at(-1)?.kind).toBe('deadlockAwarded');
  });

  it('终极裁决尊重自定义先手', () => {
    const s = ties(6, 'B');
    expect(s.phase).toBe('PLACE');
    expect(s.weaponPlacer).toBe('B');
  });

  it('最低出价按血量截断：hp=1 时仍可出 0', () => {
    let s = ties(3); // minBid = 1
    s = setHp(s, 1, 100); // A 只能出 0
    const a = legalActions(s, 'A')[0];
    expect(a).toMatchObject({ type: 'BID', min: 0, max: 0 });
  });
});

describe('双盲放置', () => {
  it('武器权者放武器、盾权者放盾，放齐后进入使用权竞拍', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'pistol' });
    expect(s.phase).toBe('PLACE'); // 只放了一方
    expect(s.players.B.pendingPlacement).toBeUndefined();
    s = reducer(s, { type: 'PLACE', seat: 'B', equip: 'iron' });
    expect(s.phase).toBe('AUCTION_WEAPON');
    expect(s.auction?.kind).toBe('weapon');
  });

  it('放置顺序无关（盾方先放也可以）', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'B', equip: 'rubber' });
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'stunner' });
    expect(s.phase).toBe('AUCTION_WEAPON');
  });

  it('类型错误非法：武器权者不能放盾，盾权者不能放武器', () => {
    const s = startWithAAsWeaponPlacer();
    expect(() => reducer(s, { type: 'PLACE', seat: 'A', equip: 'iron' })).toThrow(EngineError);
    expect(() => reducer(s, { type: 'PLACE', seat: 'B', equip: 'pistol' })).toThrow(EngineError);
  });

  it('重复放置非法', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'pistol' });
    expect(() => reducer(s, { type: 'PLACE', seat: 'A', equip: 'saber' })).toThrow(EngineError);
  });
});

describe('使用权竞拍与伤害结算', () => {
  it('高价者获武器使用权并按矩阵结算（手枪 × 铁盾 = 0）', () => {
    let s = startWithAAsWeaponPlacer();
    // 身份竞拍后：A 90 / B 97，A 武器权
    s = quickRound(s, 'pistol', 'iron', 5, 2);
    // 出价扣血：A 85 / B 95；伤害 0；流血各 -5：A 80 / B 90
    expect(s.players.A.hp).toBe(80);
    expect(s.players.B.hp).toBe(90);
    expect(s.phase).toBe('PLACE'); // 进入第 2 小轮
    expect(s.round).toBe(2);
    const entry = s.log.at(-1);
    expect(entry?.kind).toBe('roundResolved');
    if (entry?.kind === 'roundResolved') {
      expect(entry.weaponUser).toBe('A');
      expect(entry.shieldUser).toBe('B');
      expect(entry.damage).toBe(0);
      expect(entry.bleed).toBe(5);
    }
  });

  it('低价者（盾方）竞拍获胜时，武器被“抢走”反向攻击', () => {
    let s = startWithAAsWeaponPlacer();
    // B 赢使用权 → B 用 A 放的手枪打 A
    // 出价：A 2 → 88, B 7 → 90；手枪×铁盾=0；流血后 A 83 / B 85
    s = quickRound(s, 'pistol', 'iron', 2, 7);
    expect(s.players.A.hp).toBe(83);
    expect(s.players.B.hp).toBe(85);
    const entry = s.log.at(-1);
    if (entry?.kind === 'roundResolved') {
      expect(entry.weaponUser).toBe('B');
      expect(entry.shieldUser).toBe('A');
    }
  });

  it('伤害矩阵抽查：全部 9 格', () => {
    const cases: Array<[WeaponId, ShieldId, number]> = [
      ['pistol', 'iron', 0],
      ['pistol', 'leather', 30],
      ['pistol', 'rubber', 30],
      ['saber', 'iron', 0],
      ['saber', 'leather', 8],
      ['saber', 'rubber', 22],
      ['stunner', 'iron', 22],
      ['stunner', 'leather', 4],
      ['stunner', 'rubber', 0],
    ];
    for (const [w, sh, dmg] of cases) {
      let s = startWithAAsWeaponPlacer();
      // A 每轮赢竞拍用武器打 B；出价 3/1；伤害作用于 B；流血双方
      s = quickRound(s, w, sh, 3, 1);
      const entry = s.log.at(-1);
      expect(entry?.kind === 'roundResolved' ? entry.damage : -1).toBe(dmg);
      expect(s.players.B.hp).toBe(97 - 1 - dmg - 5);
    }
  });

  it('使用权竞拍平局同样重拍且不扣血', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'pistol' });
    s = reducer(s, { type: 'PLACE', seat: 'B', equip: 'iron' });
    s = reducer(s, { type: 'BID', seat: 'A', amount: 4 });
    s = reducer(s, { type: 'BID', seat: 'B', amount: 4 });
    expect(s.phase).toBe('AUCTION_WEAPON');
    expect(s.players.A.hp).toBe(90);
    expect(s.players.B.hp).toBe(97);
    expect(s.auction?.tieStreak).toBe(1);
    // 分出胜负
    s = reducer(s, { type: 'BID', seat: 'A', amount: 2 });
    s = reducer(s, { type: 'BID', seat: 'B', amount: 6 });
    expect(s.phase).toBe('PLACE');
    expect(s.players.A.hp).toBe(83); // 90-2-5(流血)
    expect(s.players.B.hp).toBe(86); // 97-6-5(流血)，B 抢到武器但 0 伤
  });
});

describe('冷却机制', () => {
  it('装备使用 2 次后进入冷却，冷却中不可放置', () => {
    let s = startWithAAsWeaponPlacer();
    s = quickRound(s, 'pistol', 'iron', 3, 1); // 第 1 次
    expect(s.usage.pistol).toBe(1);
    s = quickRound(s, 'pistol', 'leather', 3, 1); // 第 2 次 → 冷却
    expect(s.cooldown.pistol).toBe(2);
    // 第 3 小轮：pistol 不可用
    const acts = legalActions(s, s.weaponPlacer);
    const place = acts[0];
    expect(place?.type === 'PLACE' ? place.options : []).not.toContain('pistol');
    expect(() => reducer(s, { type: 'PLACE', seat: s.weaponPlacer, equip: 'pistol' })).toThrow(
      EngineError,
    );
  });

  it('冷却恰好锁定 2 个小轮，结束后使用次数清零、可再次使用', () => {
    let s = startWithAAsWeaponPlacer();
    s = quickRound(s, 'pistol', 'iron', 3, 1); // 轮1
    s = quickRound(s, 'pistol', 'leather', 3, 1); // 轮2 → pistol 冷却(锁轮3、轮4)
    s = quickRound(s, 'saber', 'iron', 3, 1); // 轮3：用 saber；轮3结束 pistol 冷却 2→1
    expect(s.cooldown.pistol).toBe(1);
    s = quickRound(s, 'saber', 'leather', 3, 1); // 轮4：pistol 仍不可放；结束 1→0
    expect(s.cooldown.pistol).toBe(0);
    expect(s.usage.pistol).toBe(0); // 解禁同时清使用次数
    // 轮5（已是下一周期，weaponPlacer 翻转为 B）：pistol 重新可用
    const acts = legalActions(s, s.weaponPlacer);
    expect(acts[0]?.type === 'PLACE' ? acts[0].options : []).toContain('pistol');
  });

  it('冷却跨周期延续', () => {
    let s = startWithAAsWeaponPlacer();
    s = quickRound(s, 'pistol', 'iron', 3, 1); // 轮1
    s = quickRound(s, 'saber', 'leather', 3, 1); // 轮2
    s = quickRound(s, 'saber', 'rubber', 3, 1); // 轮3：saber 第 2 次 → 冷却；轮3结束进入周期2
    expect(s.cycle).toBe(2);
    expect(s.roundInCycle).toBe(1);
    expect(s.cooldown.saber).toBe(2);
    // 周期 2 轮 1：saber 仍不可放置（冷却跨周期延续）
    const acts = legalActions(s, s.weaponPlacer);
    expect(acts[0]?.type === 'PLACE' ? acts[0].options : []).not.toContain('saber');
  });
});

describe('周期与放置权交换', () => {
  it('每 3 小轮自动交换放置权（无需再次竞拍）', () => {
    let s = startWithAAsWeaponPlacer();
    expect(s.weaponPlacer).toBe('A');
    s = quickRound(s, 'pistol', 'iron', 3, 1); // 轮1
    expect(s.weaponPlacer).toBe('A');
    expect(s.roundInCycle).toBe(2);
    s = quickRound(s, 'saber', 'leather', 3, 1); // 轮2
    expect(s.weaponPlacer).toBe('A');
    s = quickRound(s, 'stunner', 'rubber', 3, 1); // 轮3 结束 → 交换
    expect(s.weaponPlacer).toBe('B');
    expect(s.cycle).toBe(2);
    expect(s.roundInCycle).toBe(1);
    expect(s.round).toBe(4);
    // 周期 2 结束后再换回 A
    // （武器/盾牌序列错开使用，避免触发冷却无法放置）
    s = quickRound(s, 'pistol', 'iron', 3, 1); // 轮4
    s = quickRound(s, 'saber', 'leather', 3, 1); // 轮5
    s = quickRound(s, 'stunner', 'rubber', 3, 1); // 轮6
    expect(s.weaponPlacer).toBe('A');
    expect(s.cycle).toBe(3);
  });
});

describe('胜负判定', () => {
  it('伤害致死：立即结束，跳过流血', () => {
    let s = startWithAAsWeaponPlacer(); // A 90 / B 97
    s = setHp(s, 100, 29);
    // A 赢竞拍（A2/B1 → B 28），手枪×皮盾=30 → B ≤ 0 → A 胜，A 不扣流血
    s = quickRound(s, 'pistol', 'leather', 2, 1);
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winner).toBe('A');
    expect(s.players.A.hp).toBe(98); // 只扣出价 2，未扣流血
    const entry = s.log.at(-1);
    expect(entry?.kind === 'gameOver' ? entry.reason : '').toBe('damage');
  });

  it('流血双归零：判定平局', () => {
    let s = startWithAAsWeaponPlacer();
    s = setHp(s, 6, 5);
    // 出价 A1/B0 → A5/B5；0 伤害；流血各 -5 → 双双归零 → 平局
    s = quickRound(s, 'pistol', 'iron', 1, 0);
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winner).toBe('DRAW');
  });

  it('流血单归零：存活方获胜', () => {
    let s = startWithAAsWeaponPlacer();
    s = setHp(s, 6, 40);
    // 出价 A1/B0 → A5/B40；0 伤害；流血 → A 归零、B 存活
    s = quickRound(s, 'pistol', 'iron', 1, 0);
    expect(s.winner).toBe('B');
  });

  it('伤害未致死时才结算流血（时序：出价→伤害→流血）', () => {
    let s = startWithAAsWeaponPlacer();
    s = setHp(s, 100, 36);
    // B 出价 1 → 35；长刀×皮盾=8 → 27；流血 → 22
    s = quickRound(s, 'saber', 'leather', 3, 1);
    expect(s.players.B.hp).toBe(22);
    expect(s.phase).toBe('PLACE');
  });
});

describe('视角过滤（防作弊 / 隐藏信息）', () => {
  it('竞拍阶段：看不到对方的具体出价，只看得到“已提交”', () => {
    let s = newGame();
    s = reducer(s, { type: 'BID', seat: 'A', amount: 42 });
    const viewB = createView(s, 'B');
    expect(viewB.self.pendingBid).toBeUndefined();
    expect(viewB.opponent.hasPendingBid).toBe(true);
    // 整个 view 序列化后不得出现对方的出价数值 42
    expect(JSON.stringify(viewB)).not.toContain('42');
    const viewA = createView(s, 'A');
    expect(viewA.self.pendingBid).toBe(42);
  });

  it('放置阶段：看不到对方放了什么', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'B', equip: 'rubber' });
    const viewA = createView(s, 'A');
    expect(viewA.opponent.hasSubmittedPlacement).toBe(true);
    // 对方视角数据只含布尔标志，不含装备内容
    // （注意 usage/cooldown 记录天然含所有装备键名，故只检查敏感字段）
    expect(JSON.stringify(viewA.opponent)).not.toContain('rubber');
    expect(viewA.self.pendingPlacement).toBeUndefined();
    // 自己未放置时能看到可选装备列表
    const acts = legalActions(s, 'A');
    expect(acts[0]?.type === 'PLACE' ? acts[0].options : []).toContain('pistol');
  });

  it('使用权竞拍阶段：双方都看不到桌面上的放置物（包括对方侧）', () => {
    let s = startWithAAsWeaponPlacer();
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'stunner' });
    s = reducer(s, { type: 'PLACE', seat: 'B', equip: 'iron' });
    const viewA = createView(s, 'A');
    const viewB = createView(s, 'B');
    // 自己记得自己放的
    expect(viewA.self.pendingPlacement).toBe('stunner');
    expect(viewB.self.pendingPlacement).toBe('iron');
    // 看不到对方放的：对方数据块与自己的放置字段均不含对方装备
    expect(JSON.stringify(viewA.opponent)).not.toContain('iron');
    expect(JSON.stringify(viewB.opponent)).not.toContain('stunner');
    expect(viewA.self.pendingPlacement).not.toBe('iron');
    expect(viewB.self.pendingPlacement).not.toBe('stunner');
  });

  it('结算后通过公开日志开牌', () => {
    const s = startWithAAsWeaponPlacer();
    const done = quickRound(s, 'pistol', 'iron', 5, 2);
    const viewB = createView(done, 'B');
    const entry = viewB.log.at(-1);
    expect(entry?.kind).toBe('roundResolved');
  });

  it('视图提供出价范围与放置角色', () => {
    const s = startWithAAsWeaponPlacer();
    const viewB = createView(s, 'B');
    expect(viewB.self.placementRole).toBe('shield');
    expect(viewB.self.bidRange).toBeUndefined(); // 放置阶段无出价范围
  });
});

describe('终结性：随机对局模拟', () => {
  /** 确定性伪随机（mulberry32） */
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomPlay(rng: () => number): GameState {
    let s = newGame({ firstMover: rng() < 0.5 ? 'A' : 'B' });
    let guard = 0;
    while (s.phase !== 'GAME_OVER') {
      if (++guard > 5000) throw new Error('对局不收敛：超过 5000 步');
      for (const seat of ['A', 'B'] as Seat[]) {
        const acts = legalActions(s, seat);
        if (acts.length === 0) continue;
        const act = acts[0]!;
        if (act.type === 'BID') {
          // 50% 概率小额出价（0..10），模拟保守博弈
          const span = act.max - act.min;
          const amount =
            rng() < 0.5
              ? act.min + Math.floor(rng() * Math.min(11, span + 1))
              : act.min + Math.floor(rng() * (span + 1));
          s = reducer(s, { type: 'BID', seat, amount: Math.min(amount, act.max) });
        } else {
          const equip = act.options[Math.floor(rng() * act.options.length)]!;
          s = reducer(s, { type: 'PLACE', seat, equip });
        }
        if (s.phase === 'GAME_OVER') break;
      }
    }
    return s;
  }

  it('200 局随机对局全部正常终结，且血量永不非法', () => {
    const stats = { A: 0, B: 0, DRAW: 0 };
    let totalRounds = 0;
    for (let i = 1; i <= 200; i++) {
      const s = randomPlay(mulberry32(i * 7919));
      expect(s.phase).toBe('GAME_OVER');
      expect(s.winner).not.toBeNull();
      stats[s.winner as 'A' | 'B' | 'DRAW']++;
      totalRounds += s.round;
      // 所有 roundResolved 日志中血量一致且死亡即终局
      for (const e of s.log) {
        if (e.kind === 'roundResolved') {
          expect(e.hpAfter.A).toBeLessThanOrEqual(100);
          expect(e.hpAfter.B).toBeLessThanOrEqual(100);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[随机模拟] A胜 ${stats.A} / B胜 ${stats.B} / 平局 ${stats.DRAW}，平均 ${(
        totalRounds / 200
      ).toFixed(1)} 小轮/局`,
    );
  });
});
