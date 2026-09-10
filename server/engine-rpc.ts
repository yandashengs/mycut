/**
 * 规则引擎 Node RPC 子进程
 *
 * 职责：持有全部房间的权威 GameState，通过 stdin/stdout 的 JSON-lines
 * 协议为 FastAPI 网关提供 new / state / act / restart / drop 方法。
 * 规则引擎保持 TS 单一实现，Python 侧零规则逻辑。
 *
 * 协议：请求 { id, method, roomId, ...params }，响应 { id, ok, ...result | error }
 */
import * as readline from 'node:readline';
import { EngineError, createView, legalActions, newGame, reducer, toPublicState } from '../engine';
import type { Action, GameState, Seat } from '../engine';

const games = new Map<string, GameState>();

/** 服务器侧二次校验：动作必须落在 legalActions 范围内 */
function isLegal(state: GameState, seat: Seat, action: Action): boolean {
  return legalActions(state, seat).some((a) => {
    if (a.type !== action.type) return false;
    if (a.type === 'BID' && action.type === 'BID') {
      return action.amount >= a.min && action.amount <= a.max;
    }
    if (a.type === 'PLACE' && action.type === 'PLACE') {
      return a.options.includes(action.equip);
    }
    return false;
  });
}

interface Req {
  id: number;
  method?: string;
  roomId?: string;
  seat?: Seat;
  action?: Action;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function reply(id: number, body: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ id, ...body })}\n`);
}

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let req: Req;
  try {
    req = JSON.parse(text) as Req;
  } catch {
    return;
  }
  const { id, method, roomId } = req;
  try {
    switch (method) {
      case 'new': {
        games.set(roomId!, newGame());
        reply(id, { ok: true });
        break;
      }
      case 'state': {
        const g = games.get(roomId!);
        if (!g) throw new EngineError('ROOM_NOT_FOUND', '房间不存在或已解散');
        reply(id, { ok: true, viewA: createView(g, 'A'), viewB: createView(g, 'B'), pub: toPublicState(g) });
        break;
      }
      case 'act': {
        const g = games.get(roomId!);
        if (!g) throw new EngineError('ROOM_NOT_FOUND', '房间不存在或已解散');
        const { seat, action } = req;
        if (!seat || !action || action.seat !== seat) {
          throw new EngineError('SEAT_MISMATCH', '动作座位与连接座位不符');
        }
        if (!isLegal(g, seat, action)) throw new EngineError('ILLEGAL_ACTION', '非法动作（越界出价/重复提交/冷却中）');
        const next = reducer(g, action);
        games.set(roomId!, next);
        reply(id, {
          ok: true,
          viewA: createView(next, 'A'),
          viewB: createView(next, 'B'),
          pub: toPublicState(next),
        });
        break;
      }
      case 'restart': {
        const g = games.get(roomId!);
        if (!g) throw new EngineError('ROOM_NOT_FOUND', '房间不存在或已解散');
        games.set(roomId!, newGame());
        reply(id, { ok: true });
        break;
      }
      case 'drop': {
        games.delete(roomId!);
        reply(id, { ok: true });
        break;
      }
      default:
        throw new EngineError('UNKNOWN_METHOD', `未知方法 ${String(method)}`);
    }
  } catch (e) {
    reply(id, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// 保持进程存活
setInterval(() => {}, 1 << 30);
