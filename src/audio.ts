/**
 * 音效系统：Web Audio 实时合成，零音频资源
 *
 * 浏览器策略：首次用户交互后惰性初始化 AudioContext；
 * 提供 localStorage 静音开关（muted），UI 中可切换。
 */

export type SfxName =
  | 'bidSeal' // 封牌出价：低频扣牌
  | 'flip' // 翻筹码/开牌
  | 'hit' // 伤害命中
  | 'miss' // 完全格挡
  | 'cooldown' // 装备锁定
  | 'tie' // 平局
  | 'win' // 胜利
  | 'lose' // 败北
  | 'draw'; // 同归于尽

const MUTE_KEY = 'blade-shield:muted';

let ctx: AudioContext | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// ── 基础合成原语 ─────────────────────────────────────────────

interface ToneOpts {
  freq: number;
  to?: number; // 滑向频率
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.18, delay = 0 }: ToneOpts): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  delay?: number;
  lowpass?: number; // 截止频率
  highpass?: number;
}

function noise({ dur, gain = 0.2, delay = 0, lowpass, highpass }: NoiseOpts): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = src;
  if (lowpass !== undefined) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node = node.connect(f);
  }
  if (highpass !== undefined) {
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = highpass;
    node = node.connect(f);
  }
  node.connect(g).connect(c.destination);
  src.start(t0);
}

// ── 音色库 ───────────────────────────────────────────────────

const SFX: Record<SfxName, () => void> = {
  bidSeal() {
    tone({ freq: 160, to: 70, dur: 0.12, type: 'triangle', gain: 0.3 });
    noise({ dur: 0.05, gain: 0.1, lowpass: 900 });
  },
  flip() {
    tone({ freq: 500, to: 900, dur: 0.09, type: 'square', gain: 0.06 });
    tone({ freq: 900, to: 1400, dur: 0.08, type: 'sine', gain: 0.08, delay: 0.06 });
  },
  hit() {
    noise({ dur: 0.22, gain: 0.35, lowpass: 1400 });
    tone({ freq: 110, to: 45, dur: 0.28, type: 'sawtooth', gain: 0.32 });
    tone({ freq: 220, to: 90, dur: 0.15, type: 'square', gain: 0.1, delay: 0.02 });
  },
  miss() {
    noise({ dur: 0.3, gain: 0.12, highpass: 3000 });
    tone({ freq: 1200, to: 300, dur: 0.25, type: 'sine', gain: 0.06 });
  },
  cooldown() {
    tone({ freq: 1800, dur: 0.05, type: 'square', gain: 0.07 });
    tone({ freq: 1200, dur: 0.05, type: 'square', gain: 0.07, delay: 0.07 });
  },
  tie() {
    tone({ freq: 440, dur: 0.12, type: 'triangle', gain: 0.12 });
    tone({ freq: 440, dur: 0.12, type: 'triangle', gain: 0.12, delay: 0.14 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.14, delay: i * 0.1 }),
    );
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.14, delay: i * 0.12 }),
    );
  },
  draw() {
    tone({ freq: 330, dur: 0.3, type: 'triangle', gain: 0.13 });
    tone({ freq: 330, dur: 0.3, type: 'triangle', gain: 0.13, delay: 0.35 });
    tone({ freq: 262, dur: 0.45, type: 'triangle', gain: 0.13, delay: 0.7 });
  },
};

export function playSfx(name: SfxName): void {
  try {
    SFX[name]();
  } catch {
    // 音频失败静默降级，不影响游戏
  }
}
