/**
 * 联机对局钩子：WebSocket 连接 + 服务器推送的状态同步
 *
 * 服务器为权威：所有动作经 WS 发给服务器验证执行，
 * 每次状态变化收到 { view（本座视角）, pub（公开状态）, epoch, peers }。
 * 本地只维护"已看日志进度"（seenLog）驱动开牌揭示队列。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameState, LogEntry, PlayerView, Seat } from '@engine';

export interface OnlineGame {
  view: PlayerView | null;
  /** 公开状态 + 占位 players，形状兼容 DuelTable 等现有组件 */
  state: GameState | null;
  viewerSeat: Seat;
  peersOk: boolean;
  connected: boolean;
  pendingEntry: LogEntry | undefined;
  seenLog: number;
  gameOver: boolean;
  dispatch: (action: Action) => void;
  advance: () => void;
  restart: () => void;
}

export function useOnlineGame(
  code: string,
  seat: Seat,
  onPeerLeft: () => void,
  onServerError: (message: string) => void,
): OnlineGame {
  const [view, setView] = useState<PlayerView | null>(null);
  const [pub, setPub] = useState<Record<string, unknown> | null>(null);
  const [peers, setPeers] = useState({ A: false, B: false });
  const [connected, setConnected] = useState(false);
  const [seenLog, setSeenLog] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const epochRef = useRef(-1);
  const onPeerLeftRef = useRef(onPeerLeft);
  onPeerLeftRef.current = onPeerLeft;
  const onServerErrorRef = useRef(onServerError);
  onServerErrorRef.current = onServerError;

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/${code}?seat=${seat}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as {
        t: string;
        epoch?: number;
        peers?: { A: boolean; B: boolean };
        view?: PlayerView;
        pub?: Record<string, unknown>;
        message?: string;
      };
      switch (msg.t) {
        case 'state': {
          if (msg.epoch !== undefined && msg.epoch !== epochRef.current) {
            epochRef.current = msg.epoch;
            setSeenLog(0); // 新一局，重置开牌队列
          }
          if (msg.peers) setPeers(msg.peers);
          if (msg.view) setView(msg.view);
          if (msg.pub) setPub(msg.pub);
          break;
        }
        case 'peerLeft':
          onPeerLeftRef.current();
          break;
        case 'error':
          onServerErrorRef.current(msg.message ?? '未知错误');
          break;
      }
    };
    return () => {
      ws.onclose = null;
      ws.close();
    };
  }, [code, seat]);

  // pub + 占位 players → 组件需要的 GameState 形状（隐藏字段恒为 undefined）
  const state = useMemo<GameState | null>(() => {
    if (!pub) return null;
    const p = pub as unknown as {
      phase: GameState['phase'];
      round: number;
      cycle: number;
      roundInCycle: number;
      weaponPlacer: Seat;
      firstMover: Seat;
      hp: Record<Seat, number>;
      usage: Record<string, number>;
      cooldown: Record<string, number>;
      log: LogEntry[];
      winner: GameState['winner'];
    };
    return {
      phase: p.phase,
      round: p.round,
      cycle: p.cycle,
      roundInCycle: p.roundInCycle,
      weaponPlacer: p.weaponPlacer,
      firstMover: p.firstMover,
      players: {
        A: { hp: p.hp.A, pendingBid: undefined, pendingPlacement: undefined },
        B: { hp: p.hp.B, pendingBid: undefined, pendingPlacement: undefined },
      },
      placements: {},
      usage: p.usage,
      cooldown: p.cooldown,
      log: p.log,
      winner: p.winner,
      auction: null,
    } as GameState;
  }, [pub]);

  const pendingEntry: LogEntry | undefined = state?.log[seenLog];
  const gameOver = state?.phase === 'GAME_OVER' && !pendingEntry;

  const dispatch = useCallback((action: Action) => {
    wsRef.current?.send(JSON.stringify({ t: 'act', action }));
  }, []);

  const advance = useCallback(() => setSeenLog((n) => n + 1), []);

  const restart = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ t: 'restart' }));
  }, []);

  return {
    view,
    state,
    viewerSeat: seat,
    peersOk: peers.A && peers.B,
    connected,
    pendingEntry,
    seenLog,
    gameOver,
    dispatch,
    advance,
    restart,
  };
}
