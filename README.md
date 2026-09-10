# 我的刀盾 · Blade & Shield

> 1v1 心理博弈策略游戏 —— 双盲放置 + 暗拍竞价的「暗拍决斗」
>
> 规则引擎：[TypeScript](./engine)（纯函数、可序列化、单一真相）｜ 前端：React + Vite ｜ 联机：FastAPI + WebSocket

---

## 这是什么

**我的刀盾** 是一款双人（或人机）对决游戏。每小轮双方都**暗中选装备、暗中出价**，再通过两场竞价决定「谁放武器、谁用武器」：

- **武器方**暗选一把武器（手枪 / 长刀 / 电击枪）
- **盾牌方**暗选一面盾（铁盾 / 皮盾 / 橡胶盾）
- 双方再暗拍「武器使用权」，赢家开火，伤害由**克制矩阵**决定

谁先把对手血量打到 0，谁就赢。规则内置**防死锁**与**冷却**机制，保证对局必然收敛、不会退化成无限平局。

---

## 特性

- **三种模式**：同屏热座（`hotseat`）、对战 AI（`bot`）、联网对战（`online`）
- **AI 三档难度**：新手 / 老练 / 冷血，基于「期望伤害」模型，且遵守信息公平性（*绝不偷看对手的暗牌*）
- **双盲博弈**：出价与放置都互相隐藏，直到开牌才公开
- **纯函数规则引擎**：`GameState` 完全可 JSON 序列化，`reducer` 是纯函数，前端 / AI / 服务器共用同一份实现
- **联网即权威**：联机时权威状态跑在 Node 引擎子进程里，FastAPI 只做传输与房间管理（零规则逻辑）
- **防作弊**：服务器校验「动作座位 == 连接座位」，并二次校验动作合法性

---

## 玩法

### 一局的结构

每 3 个小轮为一个**大周期**。每个周期内：

1. **身份竞拍**（仅开局一次）— 暗出价抢「武器放置权」
2. **双盲放置** — 武器方暗选武器、盾牌方暗选盾牌
3. **使用权竞拍** — 暗出价抢「本小轮武器使用权」（赢家发动伤害）
4. **结算** — 按克制矩阵扣血 → 双方各流血 → 推进到下一小轮
5. 每 3 小轮结束，**双方交换放置权**

### 竞价规则

- 出价范围：`0 … 当前血量-1`（不能用光血量把自己拍死）
- 平局 → **重拍且不扣血**；分出胜负 → 双方各扣**自己的**出价
- 身份竞拍赢家：获得本周期（3 小轮）的**武器放置权**；输家拿**盾牌放置权**
- 使用权竞拍赢家：获得该小轮**武器使用权**（即发动伤害的一方）

### 伤害矩阵

| 武器 ＼ 盾牌 | 铁盾 | 皮盾 | 橡胶盾 |
| --- | --- | --- | --- |
| **手枪**   | 0  | 30 | 30 |
| **长刀**   | 0  | 8  | 22 |
| **电击枪** | 22 | 4  | 0  |

### 关键数值（都在 [`engine/constants.ts`](./engine/constants.ts)）

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `INITIAL_HP` | 100 | 初始血量 |
| `BLEED_PER_ROUND` | 5 | 每小轮结束双方各流血 |
| `USAGE_LIMIT` | 2 | 装备累计用满 2 次进入冷却 |
| `COOLDOWN_ROUNDS` | 2 | 冷却锁定的小轮数（跨周期延续） |
| `TIE_MINBID_THRESHOLD` | 3 | 连续平局 ≥3 次后最低出价递增 |
| `TIE_FORCED_AWARD` | 6 | 连续平局 ≥6 次标的直接判给先手（不扣血） |

### 防死锁

- 同一场竞拍连续平局 ≥ 3 次：最低出价从 `1, 3, 5 …` 递增（且按血量截断，恒有合法出价）
- 连续平局 ≥ 6 次：标的直接判给 `firstMover`（不扣血），**保证游戏必然终结**

---

## 技术架构

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   前端 (React + Vite)    │         │   联机服务 (FastAPI)      │
│   src/  (本地: 热座/机器人) │  HTTP/WS │  server/main.py           │
│   仅持有脱敏 PlayerView    │ ──────▶ │  房间码 · 传输 · 防作弊     │
└─────────────────────────┘         └────────────┬─────────────┘
                                                  │ JSON-lines RPC
                                                  ▼
                                    ┌──────────────────────────┐
                                    │  Node 引擎子进程          │
                                    │  server/engine-bundle.cjs │
                                    │  (由 engine/ TS 打包)      │
                                    │  持有全部房间权威状态      │
                                    └──────────────────────────┘

规则真相唯一来源：engine/ (纯 TS)  —— 前端、AI、服务器全部复用同一份 reducer
```

- **`engine/`**：纯 TypeScript 规则引擎（`newGame` / `reducer` / `createView` / `legalActions` / `toPublicState` / `createBot`）
- **`src/`**：React 前端，本地对局控制器 + 组件 + 音效
- **`server/`**：FastAPI 网关 + `bridge.py`（桥接 Node 引擎）+ `engine-rpc.ts`（子进程入口）
- **`server/engine-bundle.cjs`**：`server/engine-rpc.ts` 被 esbuild 打包后的产物（已提交仓库；改引擎后需重新打包）

---

## 目录结构

```
mycut/
├─ engine/                 # 纯 TS 规则引擎（单一真相）
│  ├─ types.ts             # GameState / PlayerView / Action 等类型
│  ├─ constants.ts         # 所有可调数值 + 伤害矩阵
│  ├─ engine.ts            # reducer / 视角过滤 / 合法动作
│  └─ ai.ts                # 策略 AI（easy/normal/hard）
├─ src/                    # React 前端
│  ├─ App.tsx              # 路由：菜单 / 本地局 / 联机局
│  ├─ game/                # useGame（本地） / useOnlineGame（联机）
│  ├─ components/          # 决斗桌、开始/递屏/揭示/终局/大厅等
│  └─ audio.ts             # 音效
├─ server/                 # FastAPI 联机服务
│  ├─ main.py              # 房间码 + WebSocket 网关
│  ├─ bridge.py            # Node 引擎子进程桥接（JSON-lines RPC）
│  └─ engine-rpc.ts        # 引擎子进程入口（打包为 engine-bundle.cjs）
├─ tests/                  # Vitest 单测（引擎平衡 / AI / 公开状态）
├─ build-engine.mjs        # esbuild 打包脚本
├─ requirements.txt        # Python 依赖
└─ vite.config.ts
```

---

## 快速开始

### 本地游玩（热座 / 人机）

只需要 Node 18+：

```bash
npm install
npm run dev
# 打开 http://localhost:5173
```

即可选择 **同屏热座** 或 **对战 AI（新手/老练/冷血）**。

### 联网对战（房间码 + WebSocket）

需要 Node 18+ 与 Python 3.10+。

```bash
# 1. 前端依赖
npm install

# 2. 打包规则引擎子进程（改过 engine/ 后必须重跑）
npm run build:engine          # 生成 server/engine-bundle.cjs

# 3. Python 依赖（建议先建虚拟环境）
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 4. 启动联机服务（端口 8000）
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000

# 5. 另开一个终端启动前端
npm run dev                   # http://localhost:5173，/api 与 /ws 已代理到 8000
```

双方各自打开 `http://localhost:5173` → 进入联机大厅 → 一方「创建房间」拿到 4 位房间码 → 另一方输入房间码入座即可对战。

> **生产部署**：前端走 `npm run build` 生成 `dist/`，FastAPI 检测到 `dist/` 后会自动在根路径托管静态产物。此时仅需启动 `uvicorn server.main:app` 一个进程即可同时提供页面与对战服务。

---

## 开发命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（5173） |
| `npm run build` | 构建前端到 `dist/` |
| `npm run build:engine` | 用 esbuild 打包 `server/engine-rpc.ts` → `server/engine-bundle.cjs` |
| `npm run preview` | 本地预览构建产物 |
| `npm run test` | 运行 Vitest 单测（引擎平衡 / AI 策略 / 公开状态） |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |

---

## 规则引擎 API（供前端 / AI 使用）

引擎只暴露以下入口，且前端与 AI **只允许接触脱敏后的 `PlayerView`**：

| 函数 | 说明 |
| --- | --- |
| `newGame(opts?)` | 初始化一局（可指定 `firstMover` 防对称死锁） |
| `reducer(state, action)` | 唯一状态转移入口（纯函数；非法动作抛 `EngineError`） |
| `legalActions(state, seat)` | 当前座位的合法动作（出价区间 / 可放置装备） |
| `createView(state, seat)` | 生成某座位的脱敏视角 `PlayerView` |
| `toPublicState(state)` | 生成全公开状态（广播/观战用，不含暗牌内容） |
| `createBot(level)` | 创建策略 AI（返回 `chooseAction(state, seat)`） |

```ts
import { newGame, reducer, createView, legalActions } from '@engine';

let state = newGame();
const actions = legalActions(state, 'A'); // 例如 [{ type:'BID', seat:'A', min:0, max:99 }]
state = reducer(state, { type: 'BID', seat: 'A', amount: 12 });
const myView = createView(state, 'A');     // 只看得到自己，看不到对手暗牌
```

---

## AI 难度

| 档位 | 名称 | 策略特征 |
| --- | --- | --- |
| `easy` | 新手 | 高失误率（22%）、出价/放置波动大、乐观 |
| `normal` | 老练 | 低失误、按期望伤害加权、中等悲观 |
| `hard` | 冷血 | 零失误、高度悲观（按对手最优应对加权）、精准终局特判（必杀全押 / 濒死搏命） |

AI 遵守公平性约束：仅读取「自己座位的私有信息 + 全公开信息」，从不窥视对手的 `pendingBid` / `pendingPlacement`。

---

## 已知限制 / 待办

- 联网房间为内存态，服务重启即清空（无持久化）
- AI 为「期望伤害」启发式，非博弈树搜索（P0 阶段临时策略）
- `server/engine-bundle.cjs` 为预打包产物，已提交仓库；**修改 `engine/` 后请运行 `npm run build:engine` 重新打包**，否则联机服务不会生效新规则

---

## 许可证

未指定许可证。如需开源请自行添加 `LICENSE`。
