/**
 * 联机端到端测试：两个 WebSocket 客户端（A/B）全自动打完一整局
 * 用法：node scripts/online-e2e.mjs [baseUrl]
 * 依赖：服务器已运行（默认 http://127.0.0.1:8000）
 */
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8000';
const WS_BASE = BASE.replace(/^http/, 'ws');

/** 极简自动玩家：出最低价、放第一件可用装备 */
function chooseAction(view, pub) {
  if (view.self.pendingBid !== undefined) return null; // 已出价
  if (view.self.bidRange) {
    return { t: 'act', action: { type: 'BID', seat: view.self.seat, amount: view.self.bidRange.min } };
  }
  if (pub.phase === 'PLACE' && view.self.pendingPlacement === undefined) {
    const pool = view.self.placementRole === 'weapon'
      ? ['pistol', 'saber', 'stunner']
      : ['iron', 'leather', 'rubber'];
    const equip = pool.find((e) => pub.cooldown[e] === 0) ?? pool[0];
    return { t: 'act', action: { type: 'PLACE', seat: view.self.seat, equip } };
  }
  return null;
}

function client(code, seat, onState, onError) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/${code}?seat=${seat}`);
    ws.on('open', () => resolve(ws));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.t === 'state') onState(msg, ws);
      else if (msg.t === 'error') onError(msg);
    });
    ws.on('error', reject);
  });
}

const main = async () => {
  // 1. 建房
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST' });
  const { code } = await res.json();
  console.log(`房间已创建: ${code}`);

  const done = { A: false, B: false };
  const states = { A: null, B: null };
  // 已发送未确认的动作（防止一次广播触发重复发送）
  const inflight = { A: false, B: false };
  let actions = 0;
  let guard = 0;

  const onState = (seat) => (msg, ws) => {
    const { view, pub } = msg;
    states[seat] = { view, pub };
    inflight[seat] = false; // 新状态到达，动作已被引擎消化

    if (pub.phase === 'GAME_OVER') {
      done[seat] = true;
      return;
    }
    if (done[seat]) return; // 已完成本局验证，不再自动行动
    if (inflight[seat]) return;
    const act = chooseAction(view, pub);
    if (act) {
      actions++;
      inflight[seat] = true;
      ws.send(JSON.stringify(act));
    }
  };

  // 出价被拒（跨客户端竞态，如最低价已被防死锁抬升）→ 稍后按最新状态重试
  const onError = (seat) => (msg) => {
    inflight[seat] = false;
    setTimeout(() => {
      const st = states[seat];
      if (!st || done[seat] || st.pub.phase === 'GAME_OVER') return;
      const ws = seat === 'A' ? wsARef.ws : wsBRef.ws;
      const act = chooseAction(st.view, st.pub);
      if (act && ws) {
        actions++;
        inflight[seat] = true;
        ws.send(JSON.stringify(act));
      }
    }, 120);
  };
  const wsARef = { ws: null };
  const wsBRef = { ws: null };

  const wsA = await client(code, 'A', onState('A'), onError('A'));
  const wsB = await client(code, 'B', onState('B'), onError('B'));
  wsARef.ws = wsA;
  wsBRef.ws = wsB;

  // 2. 等待终局（自动玩家互打）
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (++guard > 600) {
        clearInterval(timer);
        reject(new Error('超时：对局未收敛'));
      }
      if (done.A && done.B) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });

  const { pub } = states.A;
  const rounds = pub.log.filter((e) => e.kind === 'roundResolved').length;
  console.log(`对局完成！胜者: ${pub.winner} · 共 ${rounds} 小轮 · 双方合计动作 ${actions} 次`);
  console.log(`最终血量: A=${pub.hp.A} B=${pub.hp.B}`);

  if (pub.winner === null) throw new Error('终局无胜者');
  if (rounds === 0) throw new Error('没有发生过回合结算');
  // 引擎允许致死一击造成负血（过量伤害）；胜者血量必须 > 0，败者 <= 0
  if (pub.winner !== 'DRAW') {
    const loserHp = pub.winner === 'A' ? pub.hp.B : pub.hp.A;
    const winnerHp = pub.winner === 'A' ? pub.hp.A : pub.hp.B;
    if (loserHp > 0 || winnerHp <= 0) throw new Error(`终局血量异常: A=${pub.hp.A} B=${pub.hp.B}`);
  }

  // 3. 重开一局验证 restart（终局后 done=true，自动玩家已停止行动）
  wsA.send(JSON.stringify({ t: 'restart' }));
  await new Promise((r) => setTimeout(r, 800));
  console.log(
    `重开后状态: round=${states.A.pub.round} log=${states.A.pub.log.length} phase=${states.A.pub.phase} hp=${states.A.pub.hp.A}/${states.A.pub.hp.B}`,
  );
  if (states.A.pub.round !== 1 || states.A.pub.log.length !== 0) throw new Error('重开后状态未复位');
  console.log('重开验证通过：状态已复位到第 1 轮');

  wsA.close();
  wsB.close();
  console.log('✅ 端到端测试全部通过');
};

main().catch((e) => {
  console.error('❌ 测试失败:', e.message);
  process.exit(1);
});
