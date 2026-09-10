/**
 * 主菜单：模式选择 + 一图流规则
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AILevel } from '@engine';
import { EquipIcon } from '../icons';
import { CardBack, MatrixGrid } from './cards';
import type { Mode } from '../game/useGame';

export function StartScreen({
  onStart,
  onOnline,
}: {
  onStart: (m: Mode, level?: AILevel) => void;
  onOnline: () => void;
}) {
  const [pickBot, setPickBot] = useState(false);
  return (
    <div className="h-dvh overflow-y-auto grain">
      <div className="min-h-full max-w-lg mx-auto flex flex-col items-center justify-center gap-8 px-6 py-10">
        {/* 标题 */}
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[11px] tracking-[0.7em] text-brass/80 font-display"
          >
            BLADE &amp; SHIELD
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.25em' }}
            transition={{ delay: 0.2, duration: 0.8, ease: 'easeOut' }}
            className="mt-3 font-kai text-5xl text-bone drop-shadow-[0_0_30px_rgba(193,31,46,0.35)]"
          >
            我的刀盾
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-4 font-kai text-base text-blood-bright/90 tracking-[0.3em]"
          >
            血，是这里唯一的筹码
          </motion.p>
        </div>

        {/* 徽记 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 140, damping: 16 }}
          className="flex items-center justify-center gap-4"
        >
          <EquipIcon id="saber" className="w-12 h-12 text-blood-bright/85 -rotate-12" />
          <EquipIcon id="iron" className="w-14 h-14 text-steel/85" />
          <EquipIcon id="pistol" className="w-11 h-11 text-brass/80 rotate-12" />
        </motion.div>

        {/* 模式 */}
        <div className="w-full flex flex-col gap-3">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            onClick={() => setPickBot(true)}
            className={`text-left rounded-2xl border bg-gradient-to-b from-[#8f1622] to-[#5d0e17] border-blood-bright/40
              p-4 pl-5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform`}
          >
            <p className="font-kai text-lg tracking-[0.15em] text-bone">单机 · 战机器人</p>
            <p className="mt-1 text-xs text-smoke">与策略机器人过招，三档难度</p>
          </motion.button>

          {/* 难度选择 */}
          <AnimatePresence>
            {pickBot && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-3 gap-2 pb-1">
                  {(
                    [
                      { lv: 'easy' as AILevel, t: '新手', d: '时常失手' },
                      { lv: 'normal' as AILevel, t: '老练', d: '懂克制矩阵' },
                      { lv: 'hard' as AILevel, t: '冷血', d: '精算期望' },
                    ] as const
                  ).map((o, i) => (
                    <motion.button
                      key={o.lv}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 * i }}
                      onClick={() => onStart('bot', o.lv)}
                      className="rounded-xl border border-ash bg-coal/80 py-3 px-2 flex flex-col items-center gap-1
                        hover:border-blood-bright/50 active:scale-95 transition-all"
                    >
                      <span className="font-kai text-base text-bone">{o.t}</span>
                      <span className="text-[10px] text-smoke">{o.d}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.88 }}
            onClick={onOnline}
            className={`text-left rounded-2xl border bg-gradient-to-b from-[#2a3340] to-[#161d26] border-steel/40
              p-4 pl-5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform`}
          >
            <p className="font-kai text-lg tracking-[0.15em] text-bone">联机对决 · 房间码</p>
            <p className="mt-1 text-xs text-smoke">创建房间发码给对手，异地血战</p>
          </motion.button>

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95 }}
            onClick={() => onStart('hotseat')}
            className={`text-left rounded-2xl border bg-gradient-to-b from-[#3a2c14] to-[#241a0c] border-brass/40
              p-4 pl-5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform`}
          >
            <p className="font-kai text-lg tracking-[0.15em] text-bone">本地热座 · 双人对决</p>
            <p className="mt-1 text-xs text-smoke">同一设备轮流递交，暗拍绝不被偷看</p>
          </motion.button>
        </div>

        {/* 规则速览 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="w-full rounded-2xl border border-ash bg-coal/60 p-5"
        >
          <p className="text-xs tracking-[0.3em] text-brass mb-3">规 则 速 览</p>
          <ul className="space-y-2 text-[13px] leading-relaxed text-bone/75">
            <li>· 双方各 100 HP。一切出价都要扣血，无论输赢。</li>
            <li>· 先暗拍「放置权」：赢家放武器，输家放盾牌。</li>
            <li>· 再暗拍「使用权」：赢家抄起武器，攻击持盾方。</li>
            <li>· 伤害由克制矩阵决定——猜错可能一滴血不掉。</li>
            <li>· 每轮结束双方各流 5 血；装备用满 2 次进冷却。</li>
          </ul>
          <div className="mt-4 pt-3 border-t border-ash/70">
            <p className="text-[11px] text-smoke mb-2">克制矩阵（持盾方受到的伤害）</p>
            <div className="w-fit px-2 py-1.5 rounded-lg bg-ink/50">
              <MatrixGrid />
            </div>
          </div>
        </motion.div>

        <div className="flex gap-2 opacity-60">
          <CardBack size="sm" />
          <CardBack size="sm" tone="#7d97a8" />
          <CardBack size="sm" tone="#e5484d" />
        </div>
      </div>
    </div>
  );
}
