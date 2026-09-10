/**
 * 热座递屏遮罩：双人同屏时防止偷看对方的暗拍/暗放
 */
import { motion } from 'framer-motion';
import type { Seat } from '@engine';
import { seatColor, seatName } from '../game/useGame';
import type { Mode } from '../game/useGame';

export function PassScreen({
  seat,
  mode,
  hint,
  onUnlock,
}: {
  seat: Seat;
  mode: Mode;
  hint: string;
  onUnlock: () => void;
}) {
  const color = seatColor(seat);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-ink/95 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-8"
    >
      {/* 座位徽记 */}
      <motion.div
        initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="w-24 h-24 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: color, boxShadow: `0 0 32px ${color}44, inset 0 0 24px ${color}22` }}
      >
        <span className="font-display text-5xl" style={{ color }}>
          {seat}
        </span>
      </motion.div>

      <div className="text-center">
        <p className="font-kai text-2xl tracking-widest text-bone">请将设备交给{seatName(seat, mode)}</p>
        <p className="mt-2 text-sm text-smoke">{hint}</p>
      </div>

      <button
        type="button"
        onClick={onUnlock}
        className="px-8 h-12 rounded-xl font-kai text-lg tracking-[0.25em] text-ink
          bg-gradient-to-b from-brass-bright to-brass shadow-[0_4px_20px_rgba(201,162,92,0.35)]
          active:scale-95 transition-transform"
      >
        我是{seatName(seat, mode)} · 开始行动
      </button>

      <p className="text-[11px] text-smoke/60">请确认对手无法看到屏幕</p>
    </motion.div>
  );
}
