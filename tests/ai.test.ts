/**
 * 策略 AI 单元测试：合法性、终结性、确定性、难度梯度
 */
import { describe, expect, it } from 'vitest';
import type { GameState, Seat } from '../engine';
import { EngineError, createBot, legalActions, newGame, reducer } from '../engine';

/** 用两个 AI 对战一局，返回终局 */
function aiVsAi(
  levelA: 'easy' | 'normal' | 'hard',
  levelB: 'easy' | 'normal' | 'hard',
  seed: number,
): GameState {
  const bots = {
    A: createBot(levelA, seed),
    B: createBot(levelB, seed ^ 0x9e37),
  };
  let s = newGame({ firstMover: seed % 2 === 0 ? 'A' : 'B' });
  let guard = 0;
  while (s.phase !== 'GAME_OVER') {
    if (++guard > 3000) throw new Error('AI 对局不收敛');
    let acted = false;
    for (const seat of ['A', 'B'] as Seat[]) {
      const act = bots[seat].chooseAction(s, seat);
      if (!act) continue;
      // 关键：AI 的每一步都必须是引擎合法动作
      s = reducer(s, act);
      acted = true;
      if (s.phase === 'GAME_OVER') break;
    }
    if (!acted) throw new Error('双方均无动作但游戏未结束 —— 死锁');
  }
  return s;
}

describe('AI 合法性与终结性', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${level} vs ${level}：300 局全部合法收敛`, () => {
      for (let i = 1; i <= 300; i++) {
        const s = aiVsAi(level, level, i * 104729);
        expect(s.phase).toBe('GAME_OVER');
        expect(s.winner).not.toBeNull();
      }
    });
  }

  it('同种子同级别完全可复现（确定性）', () => {
    for (let i = 1; i <= 20; i++) {
      const s1 = aiVsAi('hard', 'normal', i * 7919);
      const s2 = aiVsAi('hard', 'normal', i * 7919);
      expect(s2.log).toEqual(s1.log);
      expect(s2.winner).toBe(s1.winner);
    }
  });
});

describe('AI 强度梯度', () => {
  it('hard 对 easy 胜率显著 > 50%（300 局）', () => {
    let hardWins = 0;
    let draws = 0;
    const N = 300;
    for (let i = 1; i <= N; i++) {
      // 交替座位消除先手影响
      const hardSeat: Seat = i % 2 === 0 ? 'A' : 'B';
      const s =
        hardSeat === 'A'
          ? aiVsAi('hard', 'easy', i * 31337)
          : aiVsAi('easy', 'hard', i * 31337);
      if (s.winner === 'DRAW') draws++;
      else if (s.winner === hardSeat) hardWins++;
    }
    const rate = hardWins / (N - draws);
    // eslint-disable-next-line no-console
    console.log(`[强度] hard vs easy：胜率 ${(rate * 100).toFixed(1)}%（平局 ${draws}）`);
    expect(rate).toBeGreaterThan(0.6);
  });

  it('hard 对 random 也应有明显优势（对照）', () => {
    // random ≈ easy 的 blunder=1 版本：用 easy 近似，仅验证方向性
    let hardWins = 0;
    let draws = 0;
    const N = 200;
    for (let i = 1; i <= N; i++) {
      const hardSeat: Seat = i % 2 === 0 ? 'A' : 'B';
      const s =
        hardSeat === 'A' ? aiVsAi('hard', 'easy', i * 15487) : aiVsAi('easy', 'hard', i * 15487);
      if (s.winner === 'DRAW') draws++;
      else if (s.winner === hardSeat) hardWins++;
    }
    expect(hardWins / (N - draws)).toBeGreaterThan(0.55);
  });
});

describe('AI 不窥视隐藏信息', () => {
  it('对手已暗拍/暗放时，AI 决策不依赖其内容（篡改对手私有字段不影响出价）', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let base = newGame();
      base = reducer(base, { type: 'BID', seat: 'A', amount: 7 });
      // 副本：篡改 A 的隐藏出价
      const tampered = JSON.parse(JSON.stringify(base)) as GameState;
      tampered.players.A.pendingBid = 88;
      // 两个同种子实例（bot 内部 rng 有状态，不能复用同一实例调用两次）
      const act1 = createBot('hard', seed).chooseAction(base, 'B');
      const act2 = createBot('hard', seed).chooseAction(tampered, 'B');
      expect(act2).toEqual(act1);
    }
  });

  it('AI 动作始终在 legalActions 范围内', () => {
    const bot = createBot('normal', 42);
    let s = newGame();
    for (let i = 0; i < 200 && s.phase !== 'GAME_OVER'; i++) {
      const seat: Seat = i % 2 === 0 ? 'A' : 'B';
      const act = bot.chooseAction(s, seat);
      if (!act) continue;
      if (act.type === 'BID') {
        const la = legalActions(s, seat)[0];
        expect(la?.type).toBe('BID');
        if (la?.type === 'BID') {
          expect(act.amount).toBeGreaterThanOrEqual(la.min);
          expect(act.amount).toBeLessThanOrEqual(la.max);
        }
      } else {
        const la = legalActions(s, seat)[0];
        expect(la?.type === 'PLACE' ? la.options : []).toContain(act.equip);
      }
      expect(() => reducer(s, act)).not.toThrow(EngineError);
      s = reducer(s, act);
    }
  });
});
