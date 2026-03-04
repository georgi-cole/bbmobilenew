/**
 * CwgoTestPage — Dev-only manual QA page for testing the "Don't Go Over"
 * (Closest Without Going Over) competition.
 *
 * Access via route: /cwgo-test (dev builds only)
 *
 * Renders ClosestWithoutGoingOverComp with mock participants drawn from the
 * current game state (or fallback mock players), allowing end-to-end testing
 * of the CWGO flow without running a full game season.
 */
import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import ClosestWithoutGoingOverComp from '../../components/ClosestWithoutGoingOverComp';
import type { CwgoPrizeType } from '../../features/cwgo/cwgoCompetitionSlice';
import type { Player } from '../../types';

const MOCK_PLAYERS: Player[] = [
  { id: 'u1', name: 'You', avatar: '🧑', status: 'active', isUser: true },
  { id: 'a1', name: 'Alice', avatar: '👩', status: 'active' },
  { id: 'a2', name: 'Bob', avatar: '🧑', status: 'active' },
  { id: 'a3', name: 'Carol', avatar: '👩', status: 'active' },
  { id: 'a4', name: 'Dave', avatar: '🧑', status: 'active' },
  { id: 'a5', name: 'Eve', avatar: '👩', status: 'active' },
];

export default function CwgoTestPage() {
  const gamePlayers = useAppSelector(
    (s: RootState) => s.game.players as Player[] | undefined,
  );

  const activePlayers = (gamePlayers ?? MOCK_PLAYERS).filter(
    (p) => p.status === 'active' || p.status === 'nominated',
  );

  const participantIds = activePlayers.slice(0, 6).map((p) => p.id);

  const [prizeType, setPrizeType] = useState<CwgoPrizeType>('HOH');
  const [seed, setSeed] = useState(12345);
  const [running, setRunning] = useState(false);
  const [key, setKey] = useState(0);

  function startGame() {
    setKey((k) => k + 1);
    setRunning(true);
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 16 }}>CWGO Test Page</h1>
      <p style={{ opacity: 0.6, textAlign: 'center', marginBottom: 24, fontSize: '0.9rem' }}>
        Dev-only — testing "Don't Go Over" competition with{' '}
        {participantIds.length} participants
      </p>

      {!running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Prize:
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value as CwgoPrizeType)}
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
          <button
            onClick={startGame}
            style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            Start CWGO Competition
          </button>
        </div>
      )}

      {running && (
        <div>
          <ClosestWithoutGoingOverComp
            key={key}
            participantIds={participantIds}
            prizeType={prizeType}
            seed={seed}
            onComplete={() => setRunning(false)}
          />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => { setRunning(false); }}
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
