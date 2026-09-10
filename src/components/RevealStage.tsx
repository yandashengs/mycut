/**
 * 开牌揭示层：新日志条目逐条弹出
 * - auctionTie / auctionResolved：筹码翻面
 * - deadlockAwarded：僵局裁决
 * - roundResolved：战斗结算（矩阵高亮 + 伤害）
 * - gameOver：终局
 */
import { motion } from 'framer-motion';
import type { AILevel, GameState, LogEntry, Seat } from '@engine';
import { EQUIP_NAMES } from '@engine';
import { seatColor, seatName } from '../game/useGame';
import type { Mode } from '../game/useGame';
import { CardBack, EquipCard, MatrixGrid } from './cards';

export function RevealStage({
  entry,
  state,
  mode,
  aiLevel,
  onContinue,
}: {
  entry: LogEntry;
  state: GameState;
  mode: Mode;
  aiLevel: AILevel;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onContinue}
    >
      <motion.div
        initial={{ scale: 0.9, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-brass/25 bg-coal grain p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        {entry.kind === 'auctionTie' && <TieBody entry={entry} mode={mode} aiLevel={aiLevel} />}
        {entry.kind === 'auctionResolved' && <ResolvedBody entry={entry} mode={mode} aiLevel={aiLevel} />}
        {entry.kind === 'deadlockAwarded' && <DeadlockBody entry={entry} mode={mode} aiLevel={aiLevel} />}
        {entry.kind === 'roundResolved' && <RoundBody entry={entry} mode={mode} aiLevel={aiLevel} />}
        {entry.kind === 'gameOver' && <OverBody entry={entry} mode={mode} aiLevel={aiLevel} />}

        {entry.kind !== 'gameOver' && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-4 w-full h-10 rounded-xl border border-brass/40 text-sm tracking-[0.3em] font-kai
              text-brass-bright hover:bg-brass/10 active:scale-[0.98] transition-all"
          >
            继续 ▸
          </button>
        )}
      </motion.div>

      {/* 日志计数 */}
      <span className="absolute bottom-3 right-4 text-[10px] text-smoke/50 font-display tabular-nums">
        {state.log.indexOf(entry) + 1} / {state.log.length}
      </span>
    </motion.div>
  );
}

// ──────────────────────────────────────────────── 出价筹码

function BidChip({
  seat,
  amount,
  mode,
  aiLevel,
  win,
  delay,
}: {
  seat: Seat;
  amount: number;
  mode: Mode;
  aiLevel: AILevel;
  win: boolean;
  delay: number;
}) {
  const color = seatColor(seat);
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 20 }}
      className={`relative w-[5.5rem] h-[5.5rem] rounded-full flex flex-col items-center justify-center
        border-2 border-dashed ${win ? 'scale-110' : 'opacity-70'}`}
      style={{
        borderColor: color,
        background: `radial-gradient(circle at 50% 35%, ${color}26, transparent 70%), #171114`,
        boxShadow: win ? `0 0 24px ${color}66` : 'none',
      }}
    >
      <span className="font-display text-3xl tabular-nums" style={{ color }}>
        {amount}
      </span>
      <span className="text-[10px] text-smoke mt-0.5">{seatName(seat, mode, aiLevel)}</span>
      {win && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.35, type: 'spring', stiffness: 300, damping: 15 }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-brass text-ink font-display text-[11px] flex items-center justify-center"
        >
          胜
        </motion.span>
      )}
    </motion.div>
  );
}

function TieBody({
  entry,
  mode,
  aiLevel,
}: {
  entry: Extract<LogEntry, { kind: 'auctionTie' }>;
  mode: Mode;
  aiLevel: AILevel;
}) {
  return (
    <div>
      <p className="text-center font-kai text-xl tracking-[0.3em] text-brass mb-4">
        {entry.auction === 'identity' ? '身份竞拍' : '使用权竞拍'} · 平局
      </p>
      <div className="flex items-center justify-center gap-6">
        <BidChip seat="A" amount={entry.bids.A} mode={mode} aiLevel={aiLevel} win={false} delay={0.1} />
        <span className="font-display text-2xl text-smoke">=</span>
        <BidChip seat="B" amount={entry.bids.B} mode={mode} aiLevel={aiLevel} win={false} delay={0.25} />
      </div>
      <p className="mt-4 text-center text-sm text-smoke">
        双方出价相同（{entry.bids.A}），不扣血，重新暗拍
        {entry.tieStreak >= 3 && (
          <span className="block mt-1.5 text-blood-bright">
            连续 {entry.tieStreak} 次平局 —— 下次最低出价被强制抬高！
          </span>
        )}
      </p>
    </div>
  );
}

function ResolvedBody({
  entry,
  mode,
  aiLevel,
}: {
  entry: Extract<LogEntry, { kind: 'auctionResolved' }>;
  mode: Mode;
  aiLevel: AILevel;
}) {
  const label =
    entry.auction === 'identity' ? '本周期武器放置权' : '武器使用权';
  return (
    <div>
      <p className="text-center font-kai text-xl tracking-[0.3em] text-brass mb-4">
        {entry.auction === 'identity' ? '身份竞拍' : '使用权竞拍'} · 开牌
      </p>
      <div className="flex items-center justify-center gap-6">
        <BidChip seat="A" amount={entry.bids.A} mode={mode} aiLevel={aiLevel} win={entry.winner === 'A'} delay={0.1} />
        <span className="font-display text-2xl text-smoke">VS</span>
        <BidChip seat="B" amount={entry.bids.B} mode={mode} aiLevel={aiLevel} win={entry.winner === 'B'} delay={0.3} />
      </div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-4 text-center"
      >
        <span className="font-kai text-bone">
          {seatName(entry.winner, mode, aiLevel)} 以 {Math.max(entry.bids.A, entry.bids.B)} 血夺得「{label}」
        </span>
        <span className="block mt-1.5 text-xs text-smoke font-display tabular-nums">
          {seatName('A', mode, aiLevel)} −{entry.bids.A} → {entry.hpAfter.A} HP 　·　 {seatName('B', mode, aiLevel)} −{entry.bids.B} →{' '}
          {entry.hpAfter.B} HP
        </span>
      </motion.p>
    </div>
  );
}

function DeadlockBody({
  entry,
  mode,
  aiLevel,
}: {
  entry: Extract<LogEntry, { kind: 'deadlockAwarded' }>;
  mode: Mode;
  aiLevel: AILevel;
}) {
  return (
    <div className="text-center py-4">
      <p className="font-kai text-xl tracking-[0.3em] text-brass">僵局裁决</p>
      <p className="mt-3 text-sm text-smoke leading-relaxed">
        连续平局次数已达上限，主持人为打破僵局
        <br />
        将「{entry.auction === 'identity' ? '本周期武器放置权' : '武器使用权'}」直接判给
      </p>
      <motion.p
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 220, damping: 16 }}
        className="mt-3 font-kai text-3xl"
        style={{ color: seatColor(entry.seat) }}
      >
        {seatName(entry.seat, mode, aiLevel)}
      </motion.p>
      <p className="mt-2 text-xs text-smoke">（不扣血）</p>
    </div>
  );
}

function RoundBody({
  entry,
  mode,
  aiLevel,
}: {
  entry: Extract<LogEntry, { kind: 'roundResolved' }>;
  mode: Mode;
  aiLevel: AILevel;
}) {
  return (
    <div>
      <p className="text-center font-kai text-lg tracking-[0.25em] text-brass">
        第 {entry.cycle} 周期 · 第 {entry.round} 轮 · 结算
      </p>

      {/* 对阵 */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <EquipCard id={entry.weapon} size="lg" />
          <span className="text-[10px] text-smoke">
            {seatName(entry.weaponUser, mode, aiLevel)} 抢得
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-xl text-blood-bright">VS</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <EquipCard id={entry.shield} size="lg" />
          <span className="text-[10px] text-smoke">
            {seatName(entry.shieldUser, mode, aiLevel)} 持盾
          </span>
        </div>
      </div>

      {/* 矩阵高亮 */}
      <div className="mt-4 mx-auto w-fit px-3 py-2 rounded-xl border border-ash bg-ink/50">
        <MatrixGrid weapon={entry.weapon} shield={entry.shield} />
      </div>

      {/* 伤害 */}
      <motion.div
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 240, damping: 16 }}
        className="mt-4 text-center"
      >
        {entry.damage > 0 ? (
          <>
            <span className="font-display text-5xl tabular-nums text-blood-bright drop-shadow-[0_0_16px_rgba(229,72,77,0.5)]">
              −{entry.damage}
            </span>
            <p className="mt-1 text-xs text-smoke">
              {seatName(entry.weaponUser, mode, aiLevel)} 的{EQUIP_NAMES[entry.weapon]}击穿了
              {seatName(entry.shieldUser, mode, aiLevel)} 的{EQUIP_NAMES[entry.shield]}
            </p>
          </>
        ) : (
          <>
            <span className="font-display text-4xl tracking-widest text-smoke">MISS</span>
            <p className="mt-1 text-xs text-smoke">
              {EQUIP_NAMES[entry.shield]}完全免疫{EQUIP_NAMES[entry.weapon]}，一滴血未流
            </p>
          </>
        )}
      </motion.div>

      {/* 流血与冷却 */}
      <p className="mt-3 text-center text-xs text-smoke font-display tabular-nums">
        {entry.bleed > 0 ? (
          <>流血惩罚 −{entry.bleed} / −{entry.bleed}</>
        ) : (
          <>伤害致死，跳过流血</>
        )}
        {entry.enteredCooldown.length > 0 && (
          <span className="block mt-1 text-brass/90">
            {entry.enteredCooldown.map((e) => EQUIP_NAMES[e]).join('、')} 已用满 2 次，进入 2 轮冷却
          </span>
        )}
      </p>

      {/* 血量 */}
      <div className="mt-3 flex justify-center gap-6 text-xs font-display tabular-nums">
        <span style={{ color: seatColor('A') }}>
          {seatName('A', mode, aiLevel)} {entry.hpAfter.A}
        </span>
        <span className="text-smoke/50">HP</span>
        <span style={{ color: seatColor('B') }}>
          {seatName('B', mode, aiLevel)} {entry.hpAfter.B}
        </span>
      </div>
    </div>
  );
}

function OverBody({
  entry,
  mode,
  aiLevel,
}: {
  entry: Extract<LogEntry, { kind: 'gameOver' }>;
  mode: Mode;
  aiLevel: AILevel;
}) {
  const draw = entry.winner === 'DRAW';
  const color = draw ? '#c9a25c' : seatColor(entry.winner as Seat);
  return (
    <div className="text-center py-2">
      <p className="text-xs tracking-[0.5em] text-smoke">终　局</p>
      <motion.h2
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className="mt-3 font-kai text-4xl tracking-[0.2em]"
        style={{ color, textShadow: `0 0 28px ${color}55` }}
      >
        {draw ? '同归于尽' : `${seatName(entry.winner as Seat, mode, aiLevel)} 胜`}
      </motion.h2>
      <p className="mt-3 text-sm text-smoke">
        {entry.reason === 'damage' ? '最后一击，盾碎人倒' : '双双流尽最后一滴血'}
        <span className="block mt-1 text-xs">鏖战 {entry.round} 个小轮</span>
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────── 终局大屏（日志全部看毕后）

export function GameOverScreen({
  state,
  mode,
  aiLevel,
  onRestart,
  onExit,
  onShowLog,
}: {
  state: GameState;
  mode: Mode;
  aiLevel: AILevel;
  onRestart: () => void;
  onExit: () => void;
  onShowLog: () => void;
}) {
  const draw = state.winner === 'DRAW';
  const color = draw ? '#c9a25c' : seatColor(state.winner as Seat);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-ink/95 backdrop-blur-md p-8"
      style={{ boxShadow: `inset 0 0 120px ${color}22` }}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        className="text-center"
      >
        <p className="text-xs tracking-[0.6em] text-smoke mb-4">FINAL DUEL</p>
        <h2
          className="font-kai text-5xl tracking-[0.15em]"
          style={{ color, textShadow: `0 0 40px ${color}66` }}
        >
          {draw ? '平局' : `${seatName(state.winner as Seat, mode, aiLevel)}获胜`}
        </h2>
        <div className="mt-6 flex items-center justify-center gap-2">
          <CardBack tone={color} size="sm" />
          <span className="font-display text-smoke text-lg">×</span>
          <CardBack tone={color} size="sm" />
        </div>
      </motion.div>

      <div className="flex flex-col gap-3 w-56">
        <button
          type="button"
          onClick={onRestart}
          className="h-12 rounded-xl font-kai text-lg tracking-[0.3em] text-bone
            bg-gradient-to-b from-[#8f1622] to-[#5d0e17] border border-blood-bright/40
            shadow-[0_4px_20px_rgba(193,31,46,0.4)] active:scale-95 transition-transform"
        >
          再战一场
        </button>
        <button
          type="button"
          onClick={onShowLog}
          className="h-11 rounded-xl border border-brass/40 text-sm tracking-[0.3em] font-kai text-brass-bright
            hover:bg-brass/10 active:scale-95 transition-all"
        >
          查看战报
        </button>
        <button
          type="button"
          onClick={onExit}
          className="h-11 rounded-xl border border-ash text-sm tracking-[0.3em] font-kai text-smoke
            hover:text-bone hover:border-brass/50 active:scale-95 transition-all"
        >
          返回主菜单
        </button>
      </div>
    </motion.div>
  );
}
