import { useState } from 'react';
import GridOfLuck from '../../components/GridOfLuck/GridOfLuck';

const TEST_PARTICIPANTS = [
  { id: 'user', name: 'You', isHuman: true, precomputedScore: 88, previousPR: 88 },
  { id: 'rae', name: 'Rae', isHuman: false, precomputedScore: 84, previousPR: 84 },
  { id: 'nyx', name: 'Nyx', isHuman: false, precomputedScore: 80, previousPR: 80 },
  { id: 'vex', name: 'Vex', isHuman: false, precomputedScore: 76, previousPR: 76 },
  { id: 'mara', name: 'Mara', isHuman: false, precomputedScore: 71, previousPR: 71 },
  { id: 'orion', name: 'Orion', isHuman: false, precomputedScore: 66, previousPR: 66 },
];

export default function GridOfLuckTestPage() {
  const [seed, setSeed] = useState(42);
  const [gameKey, setGameKey] = useState(0);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#06030f',
        color: '#eef2ff',
        padding: '1rem',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: '0 auto 1rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'center',
        }}
      >
        <strong>Grid of Luck — Test Page</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 88, padding: '0.35rem 0.5rem', borderRadius: 8 }}
          />
        </label>
        <button
          type="button"
          onClick={() => setGameKey((key) => key + 1)}
          style={{
            padding: '0.55rem 0.9rem',
            borderRadius: 999,
            border: '1px solid rgba(167, 139, 250, 0.4)',
            background: 'rgba(91, 33, 182, 0.25)',
            color: '#f5f3ff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reset board
        </button>
      </div>

      <div data-testid="grid-of-luck-screenshot-target" style={{ maxWidth: 430, margin: '0 auto' }}>
        <GridOfLuck
          key={gameKey}
          participants={TEST_PARTICIPANTS}
          seed={seed}
          onFinish={() => {}}
        />
      </div>
    </div>
  );
}
