/**
 * WildcardWesternTestPage — Dev-only manual QA page for Wildcard Western.
 *
 * Access via route: /ww-test (dev builds only)
 */
import { useMemo, useState } from 'react';
import WildcardWesternComp from '../../components/WildcardWesternComp/WildcardWesternComp';

const ALL_PARTICIPANTS = [
  { id: 'user', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'finn', name: 'Finn', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'mimi', name: 'Mimi', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'rae', name: 'Rae', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'nova', name: 'Nova', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'zeke', name: 'Zeke', isHuman: false, precomputedScore: 0, previousPR: null },
];

export default function WildcardWesternTestPage() {
  const [prizeType, setPrizeType] = useState<'HOH' | 'POV'>('HOH');
  const [seed, setSeed] = useState(42);
  const [playerCount, setPlayerCount] = useState(4);
  const [running, setRunning] = useState(false);
  const [keepOnComplete, setKeepOnComplete] = useState(true);
  const [gameKey, setGameKey] = useState(0);

  const participants = useMemo(
    () => ALL_PARTICIPANTS.slice(0, Math.max(2, Math.min(playerCount, ALL_PARTICIPANTS.length))),
    [playerCount],
  );
  const participantIds = participants.map((p) => p.id);

  function startGame() {
    setGameKey((k) => k + 1);
    setRunning(true);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a16',
        color: '#eef2ff',
        fontFamily: 'inherit',
      }}
    >
      {!running ? (
        <div
          style={{
            padding: '2rem',
            maxWidth: 520,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <h1 style={{ textAlign: 'center', color: '#d4a017', marginBottom: 4 }}>
            Wildcard Western — Test Page
          </h1>
          <p style={{ opacity: 0.7, textAlign: 'center', fontSize: '0.92rem', margin: 0 }}>
            Dev-only · elimination trivia showdown · deterministic seeded flow
          </p>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as 'HOH' | 'POV')}
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
              style={{ padding: '0.3rem 0.6rem', borderRadius: 6, width: 120 }}
            />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Players:
            <select
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 6 }}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={keepOnComplete}
              onChange={(e) => setKeepOnComplete(e.target.checked)}
            />
            Stay on final screen after completion
          </label>

          <div style={{ textAlign: 'center', opacity: 0.75, fontSize: '0.9rem' }}>
            Players: {participants.map((p) => p.name).join(', ')}
          </div>

          <button
            onClick={startGame}
            style={{
              padding: '0.7rem 1.6rem',
              borderRadius: 10,
              background: '#d4a017',
              color: '#2d1b0e',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Start Wildcard Western
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <WildcardWesternComp
              key={gameKey}
              participantIds={participantIds}
              participants={participants}
              prizeType={prizeType}
              seed={seed}
              standalone={true}
              onComplete={keepOnComplete ? undefined : () => setRunning(false)}
            />
          </div>
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.4)' }}>
            <button
              onClick={() => setRunning(false)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: 8,
                background: '#374151',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
