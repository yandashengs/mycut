"""【我的刀盾】联机服务：房间码 + WebSocket 对战。

架构：
- 本服务只做传输与房间管理，零规则逻辑；
- 权威 GameState 存于 Node 引擎子进程（engine-bundle.cjs），经 bridge.py RPC 调用；
- 每次状态变化，向双方各推送其专属 view（createView 脱敏）+ 公开状态 pub。

启动：py -m uvicorn server.main:app --host 127.0.0.1 --port 8000
"""
import os
import secrets
import string
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .bridge import EngineBridge, EngineError

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 去除易混淆字符（0O1IL）
ROOM_CODE_LEN = 4

bridge = EngineBridge()
rooms: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await bridge.start()
    yield


app = FastAPI(title="我的刀盾 · 联机服务", lifespan=lifespan)


# ── HTTP ──────────────────────────────────────────────────────

@app.post("/api/rooms")
async def create_room():
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(ROOM_CODE_LEN))
        if code not in rooms:
            break
    await bridge.new_room(code)
    rooms[code] = {"epoch": 0, "sockets": {"A": None, "B": None}}
    return {"code": code}


@app.get("/api/health")
async def health():
    return {"ok": True, "rooms": len(rooms)}


# ── 广播 ──────────────────────────────────────────────────────

async def broadcast(code: str) -> None:
    room = rooms[code]
    snap = await bridge.state(code)
    peers = {s: room["sockets"][s] is not None for s in ("A", "B")}
    for seat in ("A", "B"):
        ws = room["sockets"][seat]
        if ws is None:
            continue
        await ws.send_json(
            {
                "t": "state",
                "epoch": room["epoch"],
                "peers": peers,
                "view": snap[f"view{seat}"],
                "pub": snap["pub"],
            }
        )


# ── WebSocket ─────────────────────────────────────────────────

@app.websocket("/ws/{code}")
async def ws_endpoint(
    ws: WebSocket,
    code: str,
    seat: str = Query(...),
):
    code = code.strip().upper()
    if seat not in ("A", "B"):
        seat = "B"
    await ws.accept()

    if code not in rooms:
        await ws.send_json({"t": "error", "message": "房间不存在或已解散"})
        await ws.close()
        return
    room = rooms[code]
    if room["sockets"][seat] is not None:
        await ws.send_json({"t": "error", "message": "该座位已被占用"})
        await ws.close()
        return

    room["sockets"][seat] = ws
    await broadcast(code)

    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("t")
            if kind == "act":
                action = msg.get("action") or {}
                # 服务器侧校验：动作座位必须与连接座位一致（防伪造）
                if action.get("seat") != seat:
                    await ws.send_json({"t": "error", "message": "座位不符，动作被拒绝"})
                    continue
                try:
                    await bridge.act(code, seat, action)
                    await broadcast(code)
                except EngineError as e:
                    await ws.send_json({"t": "error", "message": str(e)})
            elif kind == "restart":
                # 仅终局允许重开，防止对局中被恶意重置
                snap = await bridge.state(code)
                if snap["pub"].get("phase") != "GAME_OVER":
                    await ws.send_json({"t": "error", "message": "对局尚未结束，不能重开"})
                    continue
                await bridge.restart(code)
                room["epoch"] += 1
                await broadcast(code)
    except WebSocketDisconnect:
        pass
    finally:
        room["sockets"][seat] = None
        peer = room["sockets"]["A" if seat == "B" else "B"]
        if peer is not None:
            try:
                await peer.send_json({"t": "peerLeft"})
            except Exception:
                pass
        # 双方均离线 → 解散房间并释放引擎内存
        if all(s is None for s in room["sockets"].values()):
            rooms.pop(code, None)
            try:
                await bridge.drop(code)
            except EngineError:
                pass


# ── 生产环境：托管前端构建产物 ────────────────────────────────

_dist = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
