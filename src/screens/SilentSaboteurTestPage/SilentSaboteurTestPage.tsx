/**
 * SilentSaboteurTestPage — Dev-only manual QA page for the "Silent Saboteur"
 * elimination competition.
 *
 * Access via route: /ss-test (dev builds only)
 *
 * Renders SilentSaboteurComp directly so the full hidden-role flow can be
 * exercised without running a full season.
 */
import { useMemo, useState } from 'react';
import SilentSaboteurComp from '../../components/SilentSaboteurComp/SilentSaboteurComp';
import type { SilentSaboteurPrizeType } from '../../features/silentSaboteur/silentSaboteurSlice';

const ALL_PARTICIPANTS = [
  { id: 'user', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'a1', name: 'Alice', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'a2', name: 'Bob', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'a3', name: 'Carol', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'a4', name: 'Dave', isHuman: false, precomputedScore: 0, previousPR: null },
];

export default function SilentSaboteurTestPage() {
  const [prizeType, setPrizeType] = useState<SilentSaboteurPrizeType>('HOH');
  const [seed, setSeed] = useState(42);
  const [playerCount, setPlayerCount] = useState(5);
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
          <h1 style={{ textAlign: 'center', color: '#ff7a7a', marginBottom: 4 }}>
            Silent Saboteur — Test Page
          </h1>
          <p style={{ opacity: 0.7, textAlign: 'center', fontSize: '0.92rem', margin: 0 }}>
            Dev-only · hidden-role elimination · deterministic seeded flow
          </p>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as SilentSaboteurPrizeType)}
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
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Start Silent Saboteur
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <SilentSaboteurComp
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
