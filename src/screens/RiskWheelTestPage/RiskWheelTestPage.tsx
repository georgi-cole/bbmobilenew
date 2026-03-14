/**
 * RiskWheelTestPage — Dev-only manual QA page for the "Risk Wheel"
 * multi-round elimination wheel competition.
 *
 * Access via route: /rw-test (dev builds only)
 *
 * Renders RiskWheelComp directly so the full spin/decision/elimination flow
 * can be exercised without running a full season.
 */
import { useMemo, useState } from 'react';
import RiskWheelComp from '../../components/RiskWheelComp/RiskWheelComp';
import type { RiskWheelCompetitionType } from '../../features/riskWheel/riskWheelSlice';

const ALL_PARTICIPANTS = [
  { id: 'user', name: 'You',     isHuman: true,  precomputedScore: 0, previousPR: null },
  { id: 'ava',  name: 'Ava',     isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'rex',  name: 'Rex',     isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'mia',  name: 'Mia',     isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'leo',  name: 'Leo',     isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'zoe',  name: 'Zoe',     isHuman: false, precomputedScore: 0, previousPR: null },
];

export default function RiskWheelTestPage() {
  const [prizeType, setPrizeType] = useState<RiskWheelCompetitionType>('HOH');
  const [seed, setSeed] = useState(42);
  const [playerCount, setPlayerCount] = useState(4);
  const [humanInGame, setHumanInGame] = useState(true);
  const [running, setRunning] = useState(false);
  const [keepOnComplete, setKeepOnComplete] = useState(true);
  const [gameKey, setGameKey] = useState(0);

  const participants = useMemo(() => {
    const pool = humanInGame ? ALL_PARTICIPANTS : ALL_PARTICIPANTS.filter((p) => !p.isHuman);
    return pool.slice(0, Math.max(2, Math.min(playerCount, pool.length)));
  }, [playerCount, humanInGame]);

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
          <h1 style={{ textAlign: 'center', color: '#a5b4fc', marginBottom: 4 }}>
            Risk Wheel — Test Page
          </h1>
          <p style={{ opacity: 0.7, textAlign: 'center', fontSize: '0.92rem', margin: 0 }}>
            Dev-only · 3-round wheel elimination · deterministic seeded flow
          </p>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as RiskWheelCompetitionType)}
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
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={humanInGame}
              onChange={(e) => setHumanInGame(e.target.checked)}
            />
            Include human player (You)
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
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Start Risk Wheel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <RiskWheelComp
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
