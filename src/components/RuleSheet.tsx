/**
 * 对局内规则速查：底部抽屉（克制矩阵 + 规则要点 + 流程图）
 */
import { AnimatePresence, motion } from 'framer-motion';
import { BLEED_PER_ROUND, COOLDOWN_ROUNDS, INITIAL_HP, USAGE_LIMIT } from '@engine';
import { MatrixGrid } from './cards';

export function RuleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto no-scrollbar
              rounded-t-3xl border-t border-brass/30 bg-coal grain shadow-[0_-16px_50px_rgba(0,0,0,0.55)]"
          >
            {/* 把手 */}
            <div className="sticky top-0 z-10 pt-3 pb-2 bg-coal/95 backdrop-blur flex flex-col items-center gap-2">
              <div className="w-10 h-1 rounded-full bg-smoke/40" />
              <p className="font-kai tracking-[0.35em] text-brass text-sm">规 则 速 查</p>
            </div>

            <div className="px-5 pb-8 pt-2 space-y-5 max-w-lg mx-auto">
              {/* 数值卡 */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { v: INITIAL_HP, t: '初始血量' },
                  { v: BLEED_PER_ROUND, t: '每轮流血' },
                  { v: USAGE_LIMIT, t: '冷却阈值' },
                  { v: COOLDOWN_ROUNDS, t: '冷却轮数' },
                ].map((x) => (
                  <div key={x.t} className="rounded-xl border border-ash bg-ink/40 py-2">
                    <p className="font-display text-xl text-bone">{x.v}</p>
                    <p className="text-[10px] text-smoke mt-0.5">{x.t}</p>
                  </div>
                ))}
              </div>

              {/* 克制矩阵 */}
              <section>
                <h3 className="text-xs tracking-[0.3em] text-brass mb-2">克制矩阵（持盾方承伤）</h3>
                <div className="rounded-xl border border-ash bg-ink/50 px-3 py-2.5 w-fit mx-auto">
                  <MatrixGrid />
                </div>
                <p className="mt-2 text-[11px] text-smoke text-center">
                  完全格挡（0）与重创（30）并存——放置与抢夺前先算清这张表
                </p>
              </section>

              {/* 一轮流程 */}
              <section>
                <h3 className="text-xs tracking-[0.3em] text-brass mb-2">小轮流程</h3>
                <ol className="space-y-2">
                  {[
                    ['① 双盲放置', '武器方暗选武器、盾牌方暗选盾牌，互相保密'],
                    ['② 使用权暗拍', '双方暗出价：高者抄起武器，低者持盾挨打'],
                    ['③ 伤害结算', '按矩阵扣血；出价双方也各扣出价血'],
                    ['④ 流血 & 冷却', `双方各流 ${BLEED_PER_ROUND} 血；登场装备使用 +1，满 ${USAGE_LIMIT} 次锁 ${COOLDOWN_ROUNDS} 轮`],
                  ].map(([t, d]) => (
                    <li key={t} className="flex gap-3 rounded-xl border border-ash bg-ink/40 px-3 py-2">
                      <span className="font-kai text-sm text-bone shrink-0 w-24">{t}</span>
                      <span className="text-[12px] text-smoke leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* 关键裁定 */}
              <section>
                <h3 className="text-xs tracking-[0.3em] text-brass mb-2">关键裁定</h3>
                <ul className="space-y-1.5 text-[12px] leading-relaxed text-smoke">
                  <li>· 出价必须 ≤ 当前血量 −1，绝不拍死自己</li>
                  <li>· 竞拍平局：不扣血，重新暗拍</li>
                  <li>· 连续 3 次平局后最低出价被强制抬高（1→3→5…）</li>
                  <li>· 连续 6 次平局：标的直接判给先手，不扣血</li>
                  <li>· 每 3 小轮双方自动交换放置权</li>
                  <li>· 冷却从下一小轮起算，跨周期延续</li>
                  <li>· 伤害致死跳过当轮流血；流血双归零判平局</li>
                </ul>
              </section>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 rounded-xl border border-brass/40 font-kai tracking-[0.3em]
                  text-brass-bright hover:bg-brass/10 active:scale-[0.98] transition-all"
              >
                明白了，回到决斗
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
