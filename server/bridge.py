"""规则引擎 Node 子进程桥接（JSON-lines RPC）。

FastAPI 网关通过本桥接调用 server/engine-bundle.cjs（由 esbuild 从 TS 引擎打包），
保证规则只有 TS 一份实现。协议见 server/engine-rpc.ts。
"""
import asyncio
import json
import shutil
from pathlib import Path
from typing import Any


class EngineError(RuntimeError):
    """引擎拒绝请求（非法动作 / 房间不存在等）"""


class EngineBridge:
    def __init__(self) -> None:
        self.proc: asyncio.subprocess.Process | None = None
        self._id = 0
        self._futures: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._lock = asyncio.Lock()
        self._reader_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.proc is not None:
            return
        node = shutil.which("node")
        if not node:
            raise RuntimeError("未找到 node，联机服务无法启动")
        bundle = Path(__file__).parent / "engine-bundle.cjs"
        if not bundle.exists():
            raise RuntimeError("缺少 engine-bundle.cjs，请先运行 npm run build:engine")
        self.proc = await asyncio.create_subprocess_exec(
            node,
            str(bundle),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        self._reader_task = asyncio.create_task(self._reader())

    async def _reader(self) -> None:
        assert self.proc and self.proc.stdout
        while True:
            line = await self.proc.stdout.readline()
            if not line:
                break
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            fut = self._futures.pop(msg.get("id"), None)  # type: ignore[arg-type]
            if fut is not None and not fut.done():
                fut.set_result(msg)

    async def _call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if self.proc is None or self.proc.stdin is None:
            raise RuntimeError("引擎子进程未启动")
        async with self._lock:
            self._id += 1
            rid = self._id
            fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
            self._futures[rid] = fut
            payload = {"id": rid, "method": method, **params}
            self.proc.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode())
            await self.proc.stdin.drain()
            result = await asyncio.wait_for(fut, timeout=10)
        if not result.get("ok"):
            raise EngineError(result.get("error", "引擎内部错误"))
        return result

    # ── 房间级 API ─────────────────────────────────────────────

    async def new_room(self, room: str) -> None:
        await self._call("new", {"roomId": room})

    async def state(self, room: str) -> dict[str, Any]:
        """返回 {viewA, viewB, pub}"""
        return await self._call("state", {"roomId": room})

    async def act(self, room: str, seat: str, action: dict[str, Any]) -> dict[str, Any]:
        """执行动作，返回 {viewA, viewB, pub}；非法动作抛 EngineError"""
        return await self._call("act", {"roomId": room, "seat": seat, "action": action})

    async def restart(self, room: str) -> None:
        await self._call("restart", {"roomId": room})

    async def drop(self, room: str) -> None:
        await self._call("drop", {"roomId": room})
