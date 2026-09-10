/**
 * 数值平衡模拟报告：hard AI vs hard AI 1000 局
 * 产出：装备选取率、克制矩阵命中率、放置权/使用权与胜率的相关性、
 *       平均轮数、终局方式分布 —— 供数值调整决策
 */
import { describe, expect, it } from 'vitest';
import type { GameState, Seat } from '../engine';
import {
  DAMAGE_MATRIX,
  EQUIP_NAMES,
  SHIELDS,
  WEAPONS,
  createBot,
  newGame,
  reducer,
} from '../engine';

function emptyEquipCounter(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const w of WEAPONS) r[w] = 0;
  for (const s of SHIELDS) r[s] = 0;
  return r;
}

function playOne(seed: number): GameState {
  const bots = { A: createBot('hard', seed), B: createBot('hard', seed ^ 0x5bf03) };
  let s = newGame({ firstMover: seed % 2 === 0 ? 'A' : 'B' });
  let guard = 0;
  while (s.phase !== 'GAME_OVER') {
    if (++guard > 3000) throw new Error('不收敛');
    let acted = false;
    for (const seat of ['A', 'B'] as Seat[]) {
      const act = bots[seat].chooseAction(s, seat);
      if (!act) continue;
      s = reducer(s, act);
      acted = true;
      if (s.phase === 'GAME_OVER') break;
    }
    if (!acted) throw new Error('死锁');
  }
  return s;
}

describe('数值平衡报告（hard vs hard × 1000）', () => {
  it('生成完整报告', () => {
    const N = 1000;
    const placeCount = { ...emptyEquipCounter() };
    const matrixHits: Record<string, Record<string, number>> = {};
    for (const w of WEAPONS) {
      matrixHits[w] = {};
      for (const s of SHIELDS) matrixHits[w][s] = 0;
    }
    const damageByWeapon = { ...emptyEquipCounter() };
    const stats = {
      A: 0,
      B: 0,
      DRAW: 0,
      rounds: 0,
      damageKills: 0,
      bleedKills: 0,
      identityWinnerWon: 0,
      identityWinnerLost: 0,
      identityDraw: 0,
      weaponUserWonRound: 0,
      roundsTotal: 0,
      cooldownTriggered: 0,
      totalDamage: 0,
    };
    const bidSums = { identity: 0, weapon: 0 };
    let identityDeadlocksTotal = 0;

    for (let i = 1; i <= N; i++) {
      const s = playOne(i * 2654435761);
      stats[s.winner as 'A' | 'B' | 'DRAW']++;
      stats.rounds += s.round;

      let identityWinner: Seat | null = null;
    for (const e of s.log) {
      if (e.kind === 'auctionResolved') {
        bidSums[e.auction] += e.bids.A + e.bids.B;
        if (e.auction === 'identity' && identityWinner === null) identityWinner = e.winner;
      }
      if (e.kind === 'deadlockAwarded' && e.auction === 'identity') {
        identityDeadlocksTotal++;
        if (identityWinner === null) identityWinner = e.seat;
      }
        if (e.kind === 'gameOver') {
          if (e.reason === 'damage') stats.damageKills++;
          else stats.bleedKills++;
        }
        if (e.kind === 'roundResolved') {
          stats.roundsTotal++;
          placeCount[e.weapon]!++;
          placeCount[e.shield]!++;
          matrixHits[e.weapon]![e.shield]!++;
          damageByWeapon[e.weapon]! += e.damage;
          stats.totalDamage += e.damage;
          stats.cooldownTriggered += e.enteredCooldown.length;
        }
      }
      if (s.winner === 'DRAW' || identityWinner === null) stats.identityDraw++;
      else if (s.winner === identityWinner) stats.identityWinnerWon++;
      else stats.identityWinnerLost++;
    }

    const pct = (n: number) => `${((n / N) * 100).toFixed(1)}%`;
    const placeTotal = stats.roundsTotal;
    const placePct = (e: string) =>
      `${((placeCount[e]! / placeTotal) * 100).toFixed(1)}%`;

    const idTotal = stats.identityWinnerWon + stats.identityWinnerLost;
    // eslint-disable-next-line no-console
    console.log(`
╔══════════════════ 数值平衡报告（hard vs hard, N=${N}）══════════════════
║ 总体
║   胜负分布        A ${pct(stats.A)} / B ${pct(stats.B)} / 平局 ${pct(stats.DRAW)}
║   平均轮数        ${(stats.rounds / N).toFixed(2)} 小轮/局
║   终局方式        击杀致死 ${pct(stats.damageKills)} / 流血耗尽 ${pct(stats.bleedKills)}
║   平均每局总伤害  ${(stats.totalDamage / N).toFixed(1)}
║
║ 装备选取率（按每轮登场次数归一）
║   武器            ${WEAPONS.map((w) => `${EQUIP_NAMES[w]} ${placePct(w)}`).join(' · ')}
║   盾牌            ${SHIELDS.map((s) => `${EQUIP_NAMES[s]} ${placePct(s)}`).join(' · ')}
║
║ 克制矩阵命中热力（行=武器，列=盾牌，%按该武器总登场归一）
${WEAPONS.map(
  (w) =>
    `║   ${EQUIP_NAMES[w]!.padEnd(4, '　')}          ${SHIELDS.map(
      (s) => `${EQUIP_NAMES[s]} ${((matrixHits[w]![s]! / placeCount[w]!) * 100).toFixed(0)}%`,
    ).join(' · ')}`,
).join('\n')}
║
║ 每武器总输出（占全部伤害 %）
║   ${WEAPONS.map((w) => `${EQUIP_NAMES[w]} ${((damageByWeapon[w]! / stats.totalDamage) * 100).toFixed(1)}%`).join(' · ')}
║
║ 结构性指标
║   身份竞拍赢家最终获胜率   ${idTotal > 0 ? ((stats.identityWinnerWon / idTotal) * 100).toFixed(1) : 'N/A'}%（${stats.identityDraw} 局平局未计 · ${identityDeadlocksTotal} 局身份竞拍僵局裁决）
║   平均竞拍总消耗（双方合计）身份 ${(bidSums.identity / N).toFixed(1)} 血 · 使用权 ${(bidSums.weapon / N).toFixed(1)} 血/局
║   冷却触发                ${(stats.cooldownTriggered / N).toFixed(1)} 次/局
╚════════════════════════════════════════════════════════════════════════`);

    // 健全性断言（平衡结论交给报告，不设硬阈值）
    expect(stats.rounds / N).toBeGreaterThan(1);
    expect(stats.rounds / N).toBeLessThan(25);
  });
});
