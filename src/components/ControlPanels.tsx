/**
 * 操作面板：出价（滑块 + 步进 + 血量预览） / 放置（选牌） / 等待提示
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { EquipId, PlayerView } from '@engine';
import { EQUIP_NAMES, SHIELDS, WEAPONS } from '@engine';
import { EquipCard } from './cards';

// ──────────────────────────────────────────────── 出价面板

interface BidPanelProps {
  view: PlayerView;
  auctionLabel: string;
  onBid: (amount: number) => void;
}

export function BidPanel({ view, auctionLabel, onBid }: BidPanelProps) {
  const range = view.self.bidRange;
  const [value, setValue] = useState(range?.min ?? 0);

  // 竞拍场景切换时重置
  useEffect(() => {
    if (range) setValue(range.min);
  }, [range?.min, range?.max]);

  if (!range) return null;
  const locked = range.min === range.max;
  const v = Math.min(Math.max(value, range.min), range.max);
  const step = (d: number) => setValue(Math.min(Math.max(v + d, range.min), range.max));

  return (
    <motion.div
      key={`bid-${view.round}-${view.phase}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-ash bg-coal/90 grain p-4"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs tracking-widest text-brass">暗拍 · {auctionLabel}</span>
        <span className="text-[11px] text-smoke">
          HP <span className="font-display text-bone">{view.self.hp}</span>
          <span className="mx-1 text-smoke/50">→</span>
          <span className="font-display text-blood-bright">{view.self.hp - v}</span>
        </span>
      </div>

      {/* 大数字 */}
      <div className="flex items-center justify-center gap-3 my-2">
        <span className="font-display text-5xl tabular-nums text-bone drop-shadow-[0_0_12px_rgba(229,72,77,0.35)]">
          {v}
        </span>
        <span className="text-xs text-smoke self-end pb-1.5">点血</span>
      </div>

      {/* 滑块 */}
      <input
        type="range"
        className="bid-slider"
        min={range.min}
        max={range.max}
        step={1}
        value={v}
        disabled={locked}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="出价"
      />

      {/* 步进 */}
      <div className="flex justify-center gap-1.5 mt-2 mb-3">
        {[-10, -1, +1, +10].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => step(d)}
            className="w-11 h-8 rounded-lg border border-ash text-sm font-display text-smoke
              hover:text-bone hover:border-brass/50 active:scale-95 transition-all"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setValue(range.max)}
          className="h-8 px-3 rounded-lg border border-blood/40 text-xs text-blood-bright
            hover:bg-blood/15 active:scale-95 transition-all"
        >
          豪赌 {range.max}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onBid(v)}
        className="w-full h-11 rounded-xl font-kai text-base tracking-[0.2em] text-bone
          bg-gradient-to-b from-[#8f1622] to-[#5d0e17] border border-blood-bright/40
          shadow-[0_4px_16px_rgba(193,31,46,0.35)] active:scale-[0.98] transition-transform"
      >
        封牌出价 · 押 {v} 血
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-smoke text-center">
        {locked
          ? '血量仅剩 1，只能出 0'
          : '出价高于对手即胜出；平局不扣血重新暗拍；胜负已分则双方各扣出价'}
      </p>
    </motion.div>
  );
}

// ──────────────────────────────────────────────── 放置面板

interface PlacePanelProps {
  view: PlayerView;
  onPlace: (equip: EquipId) => void;
}

export function PlacePanel({ view, onPlace }: PlacePanelProps) {
  const role = view.self.placementRole;
  const pool: EquipId[] = role === 'weapon' ? [...WEAPONS] : [...SHIELDS];
  const [pick, setPick] = useState<EquipId | null>(null);

  return (
    <motion.div
      key={`place-${view.round}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-ash bg-coal/90 grain p-4"
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs tracking-widest text-brass">
          双盲放置 · 你是{role === 'weapon' ? '武器' : '盾牌'}方
        </span>
        <span className="text-[11px] text-smoke">对手看不到你的选择</span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1 px-0.5">
        {pool.map((id) => (
          <EquipCard
            key={id}
            id={id}
            size="md"
            selected={pick === id}
            usage={view.usage[id]}
            cooldown={view.cooldown[id]}
            onClick={() => setPick(id)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!pick}
        onClick={() => pick && onPlace(pick)}
        className={`w-full h-11 mt-3 rounded-xl font-kai text-base tracking-[0.2em] transition-all
          ${pick
            ? 'text-bone bg-gradient-to-b from-[#8f1622] to-[#5d0e17] border border-blood-bright/40 shadow-[0_4px_16px_rgba(193,31,46,0.35)] active:scale-[0.98]'
            : 'text-smoke/50 border border-ash bg-ink/40'}`}
      >
        {pick ? `扣下 ${EQUIP_NAMES[pick]}` : '选择一件装备暗放'}
      </button>
    </motion.div>
  );
}

// ──────────────────────────────────────────────── 等待面板

export function WaitingPanel({ text, ownEquip }: { text: string; ownEquip?: EquipId }) {
  return (
    <div className="rounded-2xl border border-ash bg-coal/70 grain p-4 flex items-center gap-3">
      {ownEquip && <EquipCard id={ownEquip} size="sm" />}
      <div>
        <p className="text-sm text-bone/80">{text}</p>
        <p className="flex gap-1 mt-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-brass/70"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </p>
      </div>
    </div>
  );
}
