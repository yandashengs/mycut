/**
 * 联机大厅：创建房间（拿房间码等对手） / 输码加入
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Seat } from '@engine';

export function OnlineLobby({
  onEnter,
  onBack,
}: {
  onEnter: (code: string, seat: Seat) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error('服务器无响应');
      const data = (await res.json()) as { code: string };
      onEnter(data.code, 'A');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
      setBusy(false);
    }
  };

  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 4) {
      setErr('房间码为 4 位字符');
      return;
    }
    onEnter(c, 'B');
  };

  return (
    <div className="h-dvh overflow-y-auto grain">
      <div className="min-h-full max-w-lg mx-auto flex flex-col items-center justify-center gap-8 px-6 py-10">
        <div className="text-center">
          <p className="text-[11px] tracking-[0.7em] text-brass/80 font-display">ONLINE DUEL</p>
          <h1 className="mt-3 font-kai text-4xl text-bone tracking-[0.2em]">联机对决</h1>
          <p className="mt-3 font-kai text-sm text-blood-bright/90 tracking-[0.25em]">
            一码一局，血战到底
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          {/* 创建房间 */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            disabled={busy}
            onClick={create}
            className={`text-left rounded-2xl border bg-gradient-to-b from-[#8f1622] to-[#5d0e17] border-blood-bright/40
              p-4 pl-5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform
              ${busy ? 'opacity-60' : ''}`}
          >
            <p className="font-kai text-lg tracking-[0.15em] text-bone">创建房间</p>
            <p className="mt-1 text-xs text-smoke">生成 4 位房间码，把码发给对手</p>
          </motion.button>

          {/* 加入房间 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-brass/40 bg-gradient-to-b from-[#3a2c14] to-[#241a0c] p-4"
          >
            <p className="font-kai text-lg tracking-[0.15em] text-bone">加入房间</p>
            <div className="mt-2.5 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="输入 4 位房间码"
                autoFocus
                className="flex-1 h-11 rounded-xl border border-ash bg-ink/60 px-4
                  font-display text-xl tracking-[0.4em] text-bone placeholder:text-sm
                  placeholder:tracking-normal placeholder:font-body placeholder:text-xs
                  focus:outline-none focus:border-brass/60 transition-colors"
              />
              <button
                type="button"
                onClick={join}
                className="h-11 px-5 rounded-xl font-kai tracking-[0.2em] text-ink
                  bg-gradient-to-b from-brass-bright to-brass active:scale-95 transition-transform"
              >
                加入
              </button>
            </div>
          </motion.div>

          {err && <p className="text-center text-xs text-blood-bright">{err}</p>}
        </div>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-smoke tracking-[0.3em] hover:text-bone transition-colors"
        >
          ← 返回主菜单
        </button>
      </div>
    </div>
  );
}

/** 等待对手界面（已连接但对手未入座） */
export function WaitingRoom({ code, onExit }: { code: string; onExit: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默
    }
  };
  return (
    <div className="h-dvh flex flex-col items-center justify-center gap-8 px-8 grain">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        className="text-center"
      >
        <p className="text-xs tracking-[0.5em] text-smoke">房间码</p>
        <button
          type="button"
          onClick={copy}
          className="mt-4 font-display text-6xl tracking-[0.3em] text-bone drop-shadow-[0_0_24px_rgba(201,162,92,0.35)]
            active:scale-95 transition-transform"
          aria-label="复制房间码"
        >
          {code}
        </button>
        <p className="mt-3 text-[11px] text-smoke">{copied ? '已复制 ✓' : '点击复制，发给你的对手'}</p>
      </motion.div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-brass/70"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </div>
        <p className="font-kai text-base text-bone/80 tracking-[0.25em]">等待对手入座…</p>
      </div>

      <button
        type="button"
        onClick={onExit}
        className="text-xs text-smoke tracking-[0.3em] hover:text-bone transition-colors"
      >
        取消并返回
      </button>
    </div>
  );
}
