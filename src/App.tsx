import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AILevel, Seat } from '@engine';
import type { Mode } from './game/useGame';
import { useGame } from './game/useGame';
import { useOnlineGame } from './game/useOnlineGame';
import { StartScreen } from './components/StartScreen';
import { DuelTable } from './components/DuelTable';
import { PassScreen } from './components/PassScreen';
import { BattleLog } from './components/BattleLog';
import { GameOverScreen, RevealStage } from './components/RevealStage';
import { OnlineLobby, WaitingRoom } from './components/OnlineLobby';

type Screen =
  | { k: 'menu' }
  | { k: 'local'; mode: Mode; aiLevel: AILevel }
  | { k: 'lobby' }
  | { k: 'online'; code: string; seat: Seat };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ k: 'menu' });

  return (
    <AnimatePresence mode="wait">
      {screen.k === 'menu' && (
        <StartScreen
          key="menu"
          onStart={(m, level) => setScreen({ k: 'local', mode: m, aiLevel: level ?? 'normal' })}
          onOnline={() => setScreen({ k: 'lobby' })}
        />
      )}

      {screen.k === 'lobby' && (
        <OnlineLobby
          key="lobby"
          onEnter={(code, seat) => setScreen({ k: 'online', code, seat })}
          onBack={() => setScreen({ k: 'menu' })}
        />
      )}

      {screen.k === 'online' && (
        <OnlineGameScreen
          key={`online-${screen.code}-${screen.seat}`}
          code={screen.code}
          seat={screen.seat}
          onExit={() => setScreen({ k: 'menu' })}
        />
      )}

      {screen.k === 'local' && (
        <LocalGameScreen
          key="game"
          mode={screen.mode}
          aiLevel={screen.aiLevel}
          onExit={() => setScreen({ k: 'menu' })}
        />
      )}
    </AnimatePresence>
  );
}

// ── 本地（热座 / 机器人）──────────────────────────────────────

function LocalGameScreen({
  mode,
  aiLevel,
  onExit,
}: {
  mode: Mode;
  aiLevel: AILevel;
  onExit: () => void;
}) {
  const g = useGame(mode, aiLevel);
  const [showLog, setShowLog] = useState(false);

  const passHint = (() => {
    if (g.state.phase === 'AUCTION_IDENTITY' || g.state.phase === 'AUCTION_WEAPON') {
      return '请秘密输入你的出价';
    }
    if (g.state.phase === 'PLACE') {
      return `你是${g.state.weaponPlacer === g.nextActor ? '武器' : '盾牌'}放置方，请暗选装备`;
    }
    return '';
  })();

  return (
    <div className="grain h-dvh">
      <DuelTable
        state={g.state}
        view={g.view}
        viewerSeat={g.viewerSeat}
        mode={mode}
        aiLevel={aiLevel}
        botThinking={g.botThinking}
        onDispatch={g.dispatch}
        onExit={onExit}
      />

      {/* 热座递屏遮罩 */}
      <AnimatePresence>
        {g.needsPass && g.nextActor && (
          <PassScreen
            key={`pass-${g.nextActor}-${g.state.round}-${g.state.phase}`}
            seat={g.nextActor as Seat}
            mode={mode}
            hint={passHint}
            onUnlock={() => g.unlock(g.nextActor as Seat)}
          />
        )}
      </AnimatePresence>

      {/* 开牌揭示队列 */}
      <AnimatePresence>
        {g.pendingEntry && (
          <RevealStage
            key={`reveal-${g.seenLog}`}
            entry={g.pendingEntry}
            state={g.state}
            mode={mode}
            aiLevel={aiLevel}
            onContinue={g.advance}
          />
        )}
      </AnimatePresence>

      {/* 终局大屏 */}
      {g.gameOver && !showLog && (
        <GameOverScreen
          state={g.state}
          mode={mode}
          aiLevel={aiLevel}
          onRestart={g.restart}
          onExit={onExit}
          onShowLog={() => setShowLog(true)}
        />
      )}

      {/* 战报回放 */}
      <AnimatePresence>
        {showLog && (
          <BattleLog
            key="battlelog"
            state={g.state}
            mode={mode}
            aiLevel={aiLevel}
            onClose={() => setShowLog(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── 联机对局 ──────────────────────────────────────────────────

function OnlineGameScreen({
  code,
  seat,
  onExit,
}: {
  code: string;
  seat: Seat;
  onExit: () => void;
}) {
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const g = useOnlineGame(
    code,
    seat,
    () => setNotice({ title: '对手已离线', message: '对手离开了房间，本局无法继续' }),
    (message) => setNotice({ title: '服务器提示', message }),
  );

  // 连接失败 / 房间不存在 / 座位被占 → 提示层
  if (notice) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-6 px-8 grain">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <p className="text-[11px] tracking-[0.5em] text-blood-bright/80 font-display">DISCONNECTED</p>
          <h1 className="mt-3 font-kai text-3xl text-bone tracking-[0.2em]">{notice.title}</h1>
          <p className="mt-4 font-kai text-sm text-smoke tracking-[0.15em]">{notice.message}</p>
        </motion.div>
        <button
          type="button"
          onClick={onExit}
          className="px-8 h-11 rounded-xl font-kai tracking-[0.2em] text-ink
            bg-gradient-to-b from-brass-bright to-brass active:scale-95 transition-transform"
        >
          返回主菜单
        </button>
      </div>
    );
  }

  // 未就绪（连接中 / 等待对手入座）
  if (!g.connected || !g.peersOk || !g.state || !g.view) {
    return <WaitingRoom code={code} onExit={onExit} />;
  }

  return (
    <div className="grain h-dvh">
      <DuelTable
        state={g.state}
        view={g.view}
        viewerSeat={g.viewerSeat}
        mode="online"
        aiLevel="normal"
        botThinking={false}
        onDispatch={g.dispatch}
        onExit={onExit}
      />

      {/* 开牌揭示队列 */}
      <AnimatePresence>
        {g.pendingEntry && (
          <RevealStage
            key={`reveal-${g.seenLog}`}
            entry={g.pendingEntry}
            state={g.state}
            mode="online"
            aiLevel="normal"
            onContinue={g.advance}
          />
        )}
      </AnimatePresence>

      {/* 终局大屏 */}
      {g.gameOver && !showLog && (
        <GameOverScreen
          state={g.state}
          mode="online"
          aiLevel="normal"
          onRestart={g.restart}
          onExit={onExit}
          onShowLog={() => setShowLog(true)}
        />
      )}

      {/* 战报回放 */}
      <AnimatePresence>
        {showLog && (
          <BattleLog
            key="battlelog"
            state={g.state}
            mode="online"
            aiLevel="normal"
            onClose={() => setShowLog(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
