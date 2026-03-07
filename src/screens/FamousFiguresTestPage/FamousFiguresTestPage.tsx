/**
 * FamousFiguresTestPage — Dev-only manual QA page for the "Famous Figures"
 * trivia competition.
 *
 * Access via route: /ff-test (dev builds only)
 *
 * Renders FamousFiguresComp directly so gameplay can be exercised without
 * running a full game season.
 */
import { useState } from 'react';
import FamousFiguresComp from '../../components/FamousFiguresComp/FamousFiguresComp';
import type { FamousFiguresPrizeType } from '../../features/famousFigures/famousFiguresSlice';

const ALL_PARTICIPANTS = [
  { id: 'u1', name: 'You',   isHuman: true },
  { id: 'a1', name: 'Alice', isHuman: false },
  { id: 'a2', name: 'Bob',   isHuman: false },
];

export default function FamousFiguresTestPage() {
  const [prizeType, setPrizeType] = useState<FamousFiguresPrizeType>('HOH');
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [skipWinnerAnimation, setSkipWinnerAnimation] = useState(true);
  const [soloMode, setSoloMode] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const [keepOnComplete, setKeepOnComplete] = useState(true);

  const participants = soloMode ? ALL_PARTICIPANTS.slice(0, 1) : ALL_PARTICIPANTS;
  const participantIds = participants.map((p) => p.id);

  function startGame() {
    setGameKey((k) => k + 1);
    setRunning(true);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a1a2e', color: '#e8f4ff', fontFamily: 'inherit' }}>
      {!running ? (
        <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <h1 style={{ textAlign: 'center', color: '#88ccff', marginBottom: 4 }}>Famous Figures — Test Page</h1>
          <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '0.9rem', margin: 0 }}>
            Dev-only · {participants.length} participant{participants.length > 1 ? 's' : ''}{participants.length > 1 ? ' (You + 2 AI)' : ' (You only)'} · seeded RNG
          </p>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as FamousFiguresPrizeType)}
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
            <input
              type="checkbox"
              checked={skipWinnerAnimation}
              onChange={(e) => setSkipWinnerAnimation(e.target.checked)}
            />
            Skip winner animation (show final scoreboard)
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={keepOnComplete}
              onChange={(e) => setKeepOnComplete(e.target.checked)}
            />
            Stay on final screen (don't auto-reset after complete)
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={soloMode}
              onChange={(e) => setSoloMode(e.target.checked)}
            />
            Solo mode (human only — no AI opponents)
          </label>

          <button
            onClick={startGame}
            style={{
              padding: '0.6rem 1.5rem',
              borderRadius: 8,
              background: '#1a6aff',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Start Famous Figures
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <FamousFiguresComp
            key={gameKey}
            participantIds={participantIds}
            participants={participants}
            prizeType={prizeType}
            seed={seed}
            skipWinnerAnimation={skipWinnerAnimation}
            onComplete={keepOnComplete ? undefined : () => setRunning(false)}
          />
          <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(0,0,0,0.4)' }}>
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
