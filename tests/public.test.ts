/**
 * toPublicState 脱敏测试：联机广播中绝不能泄漏隐藏信息
 */
import { describe, expect, it } from 'vitest';
import { newGame, reducer, toPublicState } from '../engine';

describe('toPublicState 脱敏', () => {
  it('不包含任何 pendingBid / pendingPlacement 内容', () => {
    let s = newGame();
    s = reducer(s, { type: 'BID', seat: 'A', amount: 7 });
    s = reducer(s, { type: 'BID', seat: 'B', amount: 12 });

    const raw = JSON.stringify(s);
    const pub = JSON.stringify(toPublicState(s));

    // 原状态含隐藏数值，公开状态不含
    expect(raw).toContain('7');
    expect(pub).not.toContain('pendingBid');
    expect(pub).not.toContain('pendingPlacement');
    expect(pub).not.toMatch(/"amount":\s*7/);
  });

  it('保留公开信息：hp / 冷却 / 日志 / 阶段', () => {
    // 仅 A 出价（双方都出价会立即结算并清空 pending）
    let s = newGame();
    s = reducer(s, { type: 'BID', seat: 'A', amount: 5 });

    const pub = toPublicState(s);
    expect(pub.hp.A).toBe(s.players.A.hp);
    expect(pub.hp.B).toBe(s.players.B.hp);
    expect(pub.phase).toBe(s.phase);
    expect(pub.log).toEqual(s.log);
    expect(pub.hasBid).toEqual({ A: true, B: false });
  });

  it('放置阶段只暴露“已放置”布尔', () => {
    let s = newGame();
    s = reducer(s, { type: 'BID', seat: 'A', amount: 3 });
    s = reducer(s, { type: 'BID', seat: 'B', amount: 8 });
    // B 赢得武器放置权，A 是盾牌方 → A 放盾
    s = reducer(s, { type: 'PLACE', seat: 'A', equip: 'iron' });

    const pub = toPublicState(s);
    expect(pub.hasPlacement).toEqual({ A: true, B: false });
    // usage/cooldown 键名是公开装备清单；泄漏检查只针对私有字段
    expect(JSON.stringify(pub)).not.toContain('pendingPlacement');
    expect(JSON.stringify(pub)).not.toContain('"equip"');
  });
});
