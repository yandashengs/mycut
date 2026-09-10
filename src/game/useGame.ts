/**
 * 游戏控制器：包住引擎 reducer，管理
 * - 热座（双人同屏）的"递屏遮罩"解锁流程，保证暗拍/暗放的保密性
 * - 训练机器人（P0-C 前的临时随机策略）
 * - 结算揭示队列：新日志条目逐条弹窗开牌，点击继续推进
 *
 * UI 一律通过 createView(state, viewerSeat) 读取脱敏视图，
 * 全量 state 只在本模块与揭示日志（公开信息）中使用。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Action,
  type AILevel,
  type GameState,
  type LogEntry,
  type Seat,
  createBot,
  createView,
  newGame,
  reducer,
} from '@engine';
import { playSfx } from '../audio';

export type Mode = 'hotseat' | 'bot' | 'online';
export const BOT_SEAT: Seat = 'B';

export const AI_LEVEL_NAMES: Record<AILevel, string> = {
  easy: '新手',
  normal: '老练',
  hard: '冷血',
};

export function seatName(seat: Seat, mode: Mode, aiLevel: AILevel = 'normal'): string {
  if (mode === 'bot') return seat === 'A' ? '你' : `${AI_LEVEL_NAMES[aiLevel]}机器人`;
  return seat === 'A' ? '玩家 A' : '玩家 B';
}

export function seatColor(seat: Seat): string {
  return seat === 'A' ? '#e5484d' : '#7d97a8';
}

/** 当前需要行动的一方（引擎允许任意顺序，UI 固定 A 先 B 后） */
export function nextActorOf(state: GameState): Seat | null {
  if (state.phase === 'AUCTION_IDENTITY' || state.phase === 'AUCTION_WEAPON') {
    if (state.players.A.pendingBid === undefined) return 'A';
    if (state.players.B.pendingBid === undefined) return 'B';
    return null;
  }
  if (state.phase === 'PLACE') {
    if (state.players.A.pendingPlacement === undefined) return 'A';
    if (state.players.B.pendingPlacement === undefined) return 'B';
    return null;
  }
  return null;
}

/** 策略机器人（期望伤害评估 + 终局特判，见 engine/ai.ts） */
export function useGame(mode: Mode, aiLevel: AILevel = 'normal') {
  const [state, setState] = useState<GameState>(() => newGame());
  const [seenLog, setSeenLog] = useState(0);
  const [unlockedActor, setUnlockedActor] = useState<Seat | null>(null);
  const botRef = useRef(createBot(aiLevel));
  const stateRef = useRef(state);
  stateRef.current = state;

  const nextActor = useMemo(() => nextActorOf(state), [state]);
  /** 下一条待揭示的公开日志（非空则处于开牌阶段，操作面板隐藏） */
  const pendingEntry: LogEntry | undefined = state.log[seenLog];
  const botThinking = mode === 'bot' && !pendingEntry && nextActor === BOT_SEAT;
  /** 热座：轮到下一位玩家且尚未解锁递屏 */
  const needsPass = mode === 'hotseat' && !pendingEntry && nextActor !== null && unlockedActor !== nextActor;
  /** 当前视角：机器人模式恒为玩家 A；热座为已解锁/待行动方 */
  const viewerSeat: Seat = mode === 'bot' ? 'A' : (unlockedActor ?? nextActor ?? 'A');
  const view = useMemo(() => createView(state, viewerSeat), [state, viewerSeat]);

  const dispatch = useCallback((action: Action) => {
    setState((s) => {
      try {
        const next = reducer(s, action);
        if (next !== s) playSfx('bidSeal'); // 自己的封牌/扣牌动作
        return next;
      } catch (e) {
        // 引擎拒绝非法动作（UI 已按 legalActions 约束，此处为兜底）
        console.error('[engine]', e);
        return s;
      }
    });
    setUnlockedActor(null); // 提交即重新上锁，等待下一位
  }, []);

  const unlock = useCallback((seat: Seat) => setUnlockedActor(seat), []);

  const advance = useCallback(() => {
    // 按即将看毕的日志条目播放对应音效
    const entry = stateRef.current.log[seenLog];
    if (entry) {
      switch (entry.kind) {
        case 'auctionTie':
          playSfx('tie');
          break;
        case 'auctionResolved':
        case 'deadlockAwarded':
          playSfx('flip');
          break;
        case 'roundResolved':
          if (entry.damage > 0) playSfx('hit');
          else playSfx('miss');
          if (entry.enteredCooldown.length > 0) playSfx('cooldown');
          break;
        case 'gameOver': {
          const me = entry.winner;
          if (me === 'DRAW') playSfx('draw');
          else if (mode === 'bot') playSfx(me === 'A' ? 'win' : 'lose');
          else playSfx('win');
          break;
        }
      }
    }
    setSeenLog((n) => n + 1);
  }, [seenLog, mode]);

  const restart = useCallback(() => {
    setState(newGame());
    setSeenLog(0);
    setUnlockedActor(null);
  }, []);

  // 机器人自动行动
  useEffect(() => {
    if (!botThinking) return;
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (nextActorOf(s) !== BOT_SEAT) return;
      const act = botRef.current.chooseAction(s, BOT_SEAT);
      if (!act) return;
      setState((cur) => {
        try {
          return reducer(cur, act);
        } catch {
          return cur;
        }
      });
    }, 650 + Math.random() * 750);
    return () => clearTimeout(t);
  }, [botThinking, state]);

  const gameOver = state.phase === 'GAME_OVER' && !pendingEntry;

  return {
    mode,
    state,
    view,
    viewerSeat,
    nextActor,
    pendingEntry,
    seenLog,
    needsPass,
    botThinking,
    gameOver,
    dispatch,
    unlock,
    advance,
    restart,
  };
}
