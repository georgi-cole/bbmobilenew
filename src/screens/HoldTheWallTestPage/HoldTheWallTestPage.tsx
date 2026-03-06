/**
 * HoldTheWallTestPage — Dev-only manual QA page for the "Hold the Wall"
 * endurance competition.
 *
 * Access via route: /htw-test (dev builds only)
 *
 * Renders HoldTheWallComp inside a Provider-fed MinigameHost so every stage
 * (rules → countdown → playing → complete) can be exercised without running
 * a full game season.
 */
import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import MinigameHost from '../../components/MinigameHost/MinigameHost';
import { getGame } from '../../minigames/registry';
import type { HoldTheWallPrizeType } from '../../features/holdTheWall/holdTheWallSlice';
import type { Player } from '../../types';

const MOCK_PLAYERS: Player[] = [
  { id: 'u1', name: 'You',   avatar: '🧑', status: 'active', isUser: true },
  { id: 'a1', name: 'Alice', avatar: '👩', status: 'active' },
  { id: 'a2', name: 'Bob',   avatar: '🧔', status: 'active' },
  { id: 'a3', name: 'Carol', avatar: '👩', status: 'active' },
  { id: 'a4', name: 'Dave',  avatar: '🧑', status: 'active' },
  { id: 'a5', name: 'Eve',   avatar: '👩', status: 'active' },
];

export default function HoldTheWallTestPage() {
  const gamePlayers = useAppSelector(
    (s: RootState) => s.game.players as Player[] | undefined,
  );

  const activePlayers = (gamePlayers ?? MOCK_PLAYERS).filter(
    (p) => p.status === 'active' || p.status === 'nominated',
  );
  const participants = activePlayers.slice(0, 6).map((p) => ({
    id: p.id,
    name: p.name,
    isHuman: !!p.isUser,
    precomputedScore: 0,
    previousPR: null,
  }));

  const game = getGame('holdWall')!;

  const [prizeType, setPrizeType] = useState<HoldTheWallPrizeType>('HOH');
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [skipRules, setSkipRules] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(false);
  const [key, setKey] = useState(0);

  function startGame() {
    setKey((k) => k + 1);
    setRunning(true);
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Hold the Wall — Test Page</h1>
      <p style={{ opacity: 0.6, textAlign: 'center', marginBottom: 24, fontSize: '0.9rem' }}>
        Dev-only · {participants.length} participants · AI drops are seeded (deterministic)
      </p>

      {!running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as HoldTheWallPrizeType)}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 6 }}
            >
              <option value="HOH">HOH</option>
              <option value="POV">POV</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Seed:
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 6, width: 100 }}
            />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={skipRules} onChange={(e) => setSkipRules(e.target.checked)} />
            Skip rules screen
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={skipCountdown} onChange={(e) => setSkipCountdown(e.target.checked)} />
            Skip countdown
          </label>
          <button
            onClick={startGame}
            style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#83bfff', color: '#0b1020', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
          >
            Start Hold the Wall
          </button>
        </div>
      )}

      {running && (
        <div>
          <MinigameHost
            key={key}
            game={game}
            gameOptions={{ prizeType, seed }}
            participants={participants}
            onDone={() => setRunning(false)}
            skipRules={skipRules}
            skipCountdown={skipCountdown}
          />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => setRunning(false)}
              style={{ padding: '0.4rem 1rem', borderRadius: 8, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
