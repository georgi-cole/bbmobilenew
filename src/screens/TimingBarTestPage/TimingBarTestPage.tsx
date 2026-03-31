/**
 * TimingBarTestPage — Dev-only manual QA page for the Timing Bar minigame.
 *
 * Access via route: /tb-test (dev builds only)
 *
 * Renders TimingBar standalone so every phase can be exercised
 * without running a full game season.
 */
import { useState } from 'react';
import TimingBar from '../../components/TimingBar/TimingBar';

export default function TimingBarTestPage() {
  const [key, setKey] = useState(0);
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [startRound, setStartRound] = useState(1);
  const [lastScore, setLastScore] = useState<number | null>(null);

  function startGame(round = 1) {
    setKey((k) => k + 1);
    setStartRound(round);
    setRunning(true);
    setLastScore(null);
  }

  function handleFinish(score: number) {
    setLastScore(score);
    setRunning(false);
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Timing Bar — Test Page</h1>
      <p style={{ opacity: 0.6, textAlign: 'center', marginBottom: 24, fontSize: '0.9rem' }}>
        Dev-only · AI players seeded (deterministic)
      </p>

      {!running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Seed:
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 6, width: 80 }}
            />
          </label>

          {lastScore !== null && (
            <p style={{ color: '#86efac' }}>
              Last game score: {lastScore.toFixed(1)}%
            </p>
          )}

          <button
            onClick={() => startGame(1)}
            style={{
              padding: '12px 28px',
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Launch Timing Bar ▶
          </button>

          <button
            onClick={() => startGame(2)}
            style={{
              padding: '10px 22px',
              background: 'rgba(139,92,246,0.2)',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#c4b5fd',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Start from Round 2 (demo reduced timer)
          </button>
        </div>
      )}

      {running && (
        <TimingBar
          key={key}
          seed={seed}
          initialRound={startRound}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}
