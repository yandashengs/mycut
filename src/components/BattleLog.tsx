/**
 * 战报回放：终局后可滚动的完整对局时间轴
 * 消费公开日志 state.log（含每轮出价/放置/伤害/血量），紧凑卡片式呈现
 */
import { motion } from 'framer-motion';
import type { AILevel, GameState, LogEntry, Seat } from '@engine';
import { EQUIP_NAMES } from '@engine';
import { seatColor, seatName } from '../game/useGame';
import type { Mode } from '../game/useGame';
import { EquipCard } from './cards';

export function BattleLog({
  state,
  mode,
  aiLevel,
  onClose,
}: {
  state: GameState;
  mode: Mode;
  aiLevel: AILevel;
  onClose: () => void;
}) {
  // 按周期分组的日志流
  const groups: LogEntry[][] = [];
  let curCycle = 0;
  for (const e of state.log) {
    if (e.kind === 'roundResolved' && e.cycle !== curCycle) {
      groups.push([]);
      curCycle = e.cycle;
    }
    if (groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(e);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-ink/97 grain flex flex-col"
    >
      {/* 顶栏 */}
      <div className="shrink-0 px-4 py-3 border-b border-ash flex items-center justify-between">
        <p className="font-kai tracking-[0.3em] text-brass text-sm">战 报 回 放</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-smoke tracking-widest hover:text-bone transition-colors"
        >
          关闭 ✕
        </button>
      </div>

      {/* 时间轴 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
        <div className="max-w-lg mx-auto space-y-2.5 pb-8">
          {groups.map((entries, gi) => (
            <div key={gi} className="space-y-2.5">
              {gi > 0 && (
                <p className="pt-2 text-center text-[10px] font-display tracking-[0.4em] text-smoke/50">
                  ── 周期 {gi + 1} ──
                </p>
              )}
              {entries.map((e, i) => (
                <LogRow key={i} entry={e} mode={mode} aiLevel={aiLevel} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────── 单条日志

function LogRow({ entry, mode, aiLevel }: { entry: LogEntry; mode: Mode; aiLevel: AILevel }) {
  switch (entry.kind) {
    case 'auctionTie':
      return (
        <Shell tone="smoke">
          <span className="text-smoke">
            {entry.auction === 'identity' ? '身份竞拍' : '使用权竞拍'}平局 · 双方同出 {entry.bids.A}
            {entry.tieStreak >= 3 && <span className="text-blood-bright">（连续 {entry.tieStreak} 次，抬价强制）</span>}
          </span>
        </Shell>
      );
    case 'deadlockAwarded':
      return (
        <Shell tone="brass">
          <span>
            僵局裁决 ·「{entry.auction === 'identity' ? '放置权' : '使用权'}」判给
            <b style={{ color: seatColor(entry.seat) }}> {seatName(entry.seat, mode, aiLevel)}</b>（不扣血）
          </span>
        </Shell>
      );
    case 'auctionResolved':
      return (
        <Shell tone={seatColor(entry.winner)}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-smoke text-xs shrink-0">
              {entry.auction === 'identity' ? '身份竞拍' : '使用权竞拍'}
            </span>
            <span className="font-display tabular-nums text-sm">
              <SeatHp seat="A" bid={entry.bids.A} hp={entry.hpAfter.A} win={entry.winner === 'A'} mode={mode} aiLevel={aiLevel} />
              <span className="text-smoke/40 mx-1">vs</span>
              <SeatHp seat="B" bid={entry.bids.B} hp={entry.hpAfter.B} win={entry.winner === 'B'} mode={mode} aiLevel={aiLevel} />
            </span>
          </div>
        </Shell>
      );
    case 'roundResolved':
      return (
        <Shell tone={entry.damage > 0 ? '#e5484d' : 'smoke'} pad>
          {/* 轮次头 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-display tracking-widest text-smoke">
              R{entry.round}
            </span>
            <span className="text-[10px] text-smoke">
              {seatName(entry.weaponPlacer, mode, aiLevel)} 放 {EQUIP_NAMES[entry.weapon]} ·{' '}
              {seatName(entry.shieldPlacer, mode, aiLevel)} 放 {EQUIP_NAMES[entry.shield]}
            </span>
          </div>
          {/* 对阵 */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex flex-col items-center gap-0.5">
              <EquipCard id={entry.weapon} size="sm" />
              <span className="text-[9px] text-smoke">{seatName(entry.weaponUser, mode, aiLevel).slice(0, 4)}</span>
            </div>
            {entry.damage > 0 ? (
              <span className="font-display text-2xl tabular-nums text-blood-bright">−{entry.damage}</span>
            ) : (
              <span className="font-display text-lg tracking-widest text-smoke">MISS</span>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <EquipCard id={entry.shield} size="sm" />
              <span className="text-[9px] text-smoke">{seatName(entry.shieldUser, mode, aiLevel).slice(0, 4)}</span>
            </div>
          </div>
          {/* 尾注 */}
          <p className="mt-2 text-center text-[10px] text-smoke font-display tabular-nums">
            {entry.bleed > 0 ? <>流血 −{entry.bleed}/−{entry.bleed} · </> : <>致死一击 · </>}
            <span style={{ color: seatColor('A') }}>A {entry.hpAfter.A}</span>
            <span className="text-smoke/40 mx-1">/</span>
            <span style={{ color: seatColor('B') }}>B {entry.hpAfter.B}</span>
            {entry.enteredCooldown.length > 0 && (
              <span className="text-brass/90">
                {' '}· {entry.enteredCooldown.map((e) => EQUIP_NAMES[e]).join('、')}入冷却
              </span>
            )}
          </p>
        </Shell>
      );
    case 'gameOver':
      return (
        <Shell tone={entry.winner === 'DRAW' ? '#c9a25c' : seatColor(entry.winner as Seat)} pad>
          <p className="text-center font-kai tracking-[0.3em] text-base">
            {entry.winner === 'DRAW'
              ? '同归于尽'
              : `${seatName(entry.winner as Seat, mode, aiLevel)}胜`}
            <span className="block mt-1 text-[10px] font-display tracking-widest text-smoke">
              {entry.reason === 'damage' ? '伤害致死' : '流血耗尽'} · 鏖战 {entry.round} 轮
            </span>
          </p>
        </Shell>
      );
  }
}

// ──────────────────────────────────────────────── 小部件

function Shell({
  tone,
  pad,
  children,
}: {
  tone: string;
  pad?: boolean;
  children: React.ReactNode;
}) {
  const color = tone === 'smoke' ? 'var(--color-smoke)' : tone === 'brass' ? 'var(--color-brass)' : tone;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className={`relative rounded-xl border border-ash bg-coal/70 ${pad ? 'py-3' : 'py-2'} px-3 pl-4`}
      style={{ borderLeft: `2px solid ${color}66` }}
    >
      <span className="absolute left-[3px] top-[calc(50%-2px)] w-1 h-1 rounded-full" style={{ background: color }} />
      <div className="text-[12px] text-bone/85 leading-relaxed">{children}</div>
    </motion.div>
  );
}

function SeatHp({
  seat,
  bid,
  hp,
  win,
  mode,
  aiLevel,
}: {
  seat: Seat;
  bid: number;
  hp: number;
  win: boolean;
  mode: Mode;
  aiLevel: AILevel;
}) {
  return (
    <span style={{ color: seatColor(seat), opacity: win ? 1 : 0.55 }}>
      {seatName(seat, mode, aiLevel).slice(0, 1)} {bid}→{hp}
      {win && <span className="text-brass"> ✦</span>}
    </span>
  );
}
