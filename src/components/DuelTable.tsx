/**
 * 对决桌面：对手区（上）→ 桌面（放置槽 + 阶段信息）→ 军械库 → 自己区（血条 + 操作面板）
 * 视角随递屏/模式切换，"自己"永远在下方
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AILevel, GameState, PlayerView, Seat } from '@engine';
import { EQUIP_NAMES, SHIELDS, WEAPONS } from '@engine';
import type { EquipId } from '@engine';
import { BOT_SEAT, seatColor, seatName } from '../game/useGame';
import type { Mode } from '../game/useGame';
import { EquipIcon } from '../icons';
import { isMuted, toggleMute } from '../audio';
import { CardBack, EquipCard } from './cards';
import { BidPanel, PlacePanel, WaitingPanel } from './ControlPanels';
import { RuleSheet } from './RuleSheet';

const ALL_EQUIPS: EquipId[] = [...WEAPONS, ...SHIELDS];

export function DuelTable({
  state,
  view,
  viewerSeat,
  mode,
  aiLevel,
  botThinking,
  onDispatch,
  onExit,
}: {
  state: GameState;
  view: PlayerView;
  viewerSeat: Seat;
  mode: Mode;
  aiLevel: AILevel;
  botThinking: boolean;
  onDispatch: (a: { type: 'BID'; seat: Seat; amount: number } | { type: 'PLACE'; seat: Seat; equip: EquipId }) => void;
  onExit: () => void;
}) {
  const oppSeat = view.opponent.seat;
  const oppPlaced = view.opponent.hasSubmittedPlacement || state.phase === 'AUCTION_WEAPON';
  const selfPlaced = view.self.pendingPlacement;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muteState, setMuteState] = useState(isMuted());

  const phaseTitle =
    state.phase === 'AUCTION_IDENTITY'
      ? '身份竞拍'
      : state.phase === 'PLACE'
        ? '双盲放置'
        : state.phase === 'AUCTION_WEAPON'
          ? '使用权竞拍'
          : '终局';

  const auctionLabel =
    state.phase === 'AUCTION_IDENTITY' ? '本周期武器放置权' : '武器使用权';

  return (
    <div className="h-dvh max-w-lg mx-auto flex flex-col gap-2 px-3 pt-3 pb-3">
      {/* 顶栏：回合信息 + 规则/静音/退出 */}
      <div className="flex items-center justify-between text-[11px] text-smoke">
        <span className="font-display tracking-widest">
          CYCLE {state.cycle} · ROUND {state.roundInCycle}/3
        </span>
        <motion.span
          key={phaseTitle}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-kai tracking-[0.3em] text-brass"
        >
          {phaseTitle}
        </motion.span>
        <span className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="tracking-widest hover:text-brass-bright transition-colors"
            aria-label="规则速查"
          >
            规则
          </button>
          <button
            type="button"
            onClick={() => setMuteState(toggleMute())}
            className="tracking-widest hover:text-bone transition-colors"
            aria-label={muteState ? '开启音效' : '静音'}
          >
            {muteState ? '🔇' : '🔊'}
          </button>
          <button type="button" onClick={onExit} className="tracking-widest hover:text-bone transition-colors">
            离场 ✕
          </button>
        </span>
      </div>

      {/* 对手血条 */}
      <HpBar seat={oppSeat} hp={view.opponent.hp} mode={mode} aiLevel={aiLevel} />

      {/* 桌面 */}
      <div className="relative flex-1 min-h-0 rounded-2xl border border-ash/70 bg-gradient-to-b from-[#191114] via-[#120d10] to-[#171013] grain overflow-hidden">
        {/* 对手放置槽 */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <Slot
            filled={oppPlaced}
            label={`${seatName(oppSeat, mode, aiLevel)} · ${
              oppSeat === state.weaponPlacer ? '武器方' : '盾牌方'
            }`}
            tone={seatColor(oppSeat)}
          >
            <CardBack tone={seatColor(oppSeat)} size="sm" />
          </Slot>
        </div>

        {/* 中线 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none">
          <div className="w-3/4 h-px bg-gradient-to-r from-transparent via-brass/30 to-transparent" />
          <span className="font-display text-[10px] tracking-[0.5em] text-smoke/60">
            {state.phase === 'PLACE' ? '双 盲 放 置' : '暗　拍　中'}
          </span>
          <div className="w-3/4 h-px bg-gradient-to-r from-transparent via-brass/30 to-transparent" />
          <p className="mt-1 text-[10px] text-smoke/70">
            武器方 {seatName(state.weaponPlacer, mode, aiLevel)} · 盾牌方{' '}
            {seatName(state.weaponPlacer === 'A' ? 'B' : 'A', mode, aiLevel)}
          </p>
        </div>

        {/* 机器人思考指示 */}
        {botThinking && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2">
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-xs text-steel"
            >
              训练机器人正在琢磨…
            </motion.p>
          </div>
        )}

        {/* 自己放置槽 */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <Slot
            filled={selfPlaced !== undefined}
            label={`你 · ${viewerSeat === state.weaponPlacer ? '武器方' : '盾牌方'}`}
            tone={seatColor(viewerSeat)}
            flip
          >
            {selfPlaced && (
              <motion.div
                key={selfPlaced}
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              >
                <EquipCard
                  id={selfPlaced}
                  size="sm"
                  usage={view.usage[selfPlaced]}
                  cooldown={view.cooldown[selfPlaced]}
                />
              </motion.div>
            )}
          </Slot>
        </div>
      </div>

      {/* 军械库 */}
      <div className="flex items-center justify-between gap-1 rounded-xl border border-ash/70 bg-coal/70 px-2 py-1.5">
        {ALL_EQUIPS.map((id) => (
          <ArmoryChip key={id} id={id} usage={view.usage[id]} cooldown={view.cooldown[id]} />
        ))}
      </div>

      {/* 自己血条 */}
      <HpBar seat={viewerSeat} hp={view.self.hp} mode={mode} aiLevel={aiLevel} self />

      {/* 操作区 */}
      <ControlArea
        view={view}
        viewerSeat={viewerSeat}
        state={state}
        mode={mode}
        auctionLabel={auctionLabel}
        botThinking={botThinking}
        onDispatch={onDispatch}
      />

      {/* 规则速查抽屉 */}
      <RuleSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

// ──────────────────────────────────────────────── 放置槽

function Slot({
  filled,
  label,
  tone,
  flip,
  children,
}: {
  filled: boolean;
  label: string;
  tone: string;
  flip?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-[4.6rem] h-[6.1rem] rounded-xl flex items-center justify-center transition-all
          ${filled ? '' : 'border border-dashed'}`}
        style={filled ? undefined : { borderColor: `${tone}44` }}
      >
        {filled ? (
          children
        ) : (
          <span className="text-[10px] text-smoke/50 font-kai writing-vertical tracking-widest">
            {label}
          </span>
        )}
      </div>
      <span className="text-[10px] text-smoke/60">{label}</span>
    </div>
  );
}

// ──────────────────────────────────────────────── 血条

function HpBar({
  seat,
  hp,
  mode,
  aiLevel,
  self,
}: {
  seat: Seat;
  hp: number;
  mode: Mode;
  aiLevel: AILevel;
  self?: boolean;
}) {
  const color = seatColor(seat);
  const pct = Math.max(0, Math.min(100, hp));
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-kai tracking-wider truncate" style={{ color }}>
        {seatName(seat, mode, aiLevel)}
      </span>
      <div className="flex-1 h-2.5 rounded-full hp-track overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              seat === 'A'
                ? 'linear-gradient(90deg,#6e1018,#e5484d)'
                : 'linear-gradient(90deg,#31465a,#7d97a8)',
          }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </div>
      <motion.span
        key={hp}
        initial={{ scale: 1.35, color: '#ece3d4' }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="w-12 text-right font-display text-xl tabular-nums"
        style={{ color }}
      >
        {Math.max(0, hp)}
      </motion.span>
    </div>
  );
}

// ──────────────────────────────────────────────── 军械库芯片

function ArmoryChip({ id, usage, cooldown }: { id: EquipId; usage: number; cooldown: number }) {
  const cooling = cooldown > 0;
  return (
    <div
      title={`${EQUIP_NAMES[id]}${cooling ? ` · 冷却剩 ${cooldown} 轮` : ` · 已用 ${usage}/2`}`}
      className={`relative flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg border
        ${cooling ? 'border-brass/40 text-smoke/60' : 'border-ash text-bone/85'}`}
    >
      <EquipIcon id={id} className={`w-5 h-5 ${cooling ? 'text-smoke/60' : ''}`} />
      <div className="flex gap-0.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`w-1 h-1 rounded-full ${i < usage && !cooling ? 'bg-brass' : 'bg-smoke/25'}`}
          />
        ))}
      </div>
      {cooling && (
        <span className="absolute -top-1.5 -right-1 min-w-4 px-0.5 h-4 rounded-full bg-brass text-ink text-[9px] font-bold flex items-center justify-center font-display">
          {cooldown}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────── 操作区

function ControlArea({
  view,
  viewerSeat,
  state,
  mode,
  auctionLabel,
  botThinking,
  onDispatch,
}: {
  view: PlayerView;
  viewerSeat: Seat;
  state: GameState;
  mode: Mode;
  auctionLabel: string;
  botThinking: boolean;
  onDispatch: (a: { type: 'BID'; seat: Seat; amount: number } | { type: 'PLACE'; seat: Seat; equip: EquipId }) => void;
}) {
  if (state.phase === 'GAME_OVER') {
    return (
      <div className="rounded-2xl border border-ash bg-coal/70 p-4 text-center text-sm text-smoke">
        胜负已分
      </div>
    );
  }

  // 机器人代管 B 座位：B 的面板不渲染
  if (mode === 'bot' && viewerSeat === BOT_SEAT) return null;

  // 竞拍阶段
  if (state.phase === 'AUCTION_IDENTITY' || state.phase === 'AUCTION_WEAPON') {
    if (view.self.pendingBid === undefined && !botThinking) {
      return (
        <BidPanel
          view={view}
          auctionLabel={auctionLabel}
          onBid={(amount) => onDispatch({ type: 'BID', seat: viewerSeat, amount })}
        />
      );
    }
    return (
      <WaitingPanel
        text="出价已封牌，等待开牌…"
        ownEquip={state.phase === 'AUCTION_WEAPON' ? view.self.pendingPlacement : undefined}
      />
    );
  }

  // 放置阶段
  if (state.phase === 'PLACE') {
    if (view.self.pendingPlacement === undefined) {
      return <PlacePanel view={view} onPlace={(equip) => onDispatch({ type: 'PLACE', seat: viewerSeat, equip })} />;
    }
    return <WaitingPanel text="装备已暗放，等待对手…" ownEquip={view.self.pendingPlacement} />;
  }

  return null;
}
