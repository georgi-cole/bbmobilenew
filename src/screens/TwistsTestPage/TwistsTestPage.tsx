/**
 * TwistsTestPage — Manual QA page for testing BattleBack and PublicFavorite twists.
 *
 * Access via route: /twists-test (dev builds only)
 *
 * This page lets QA testers and developers:
 *  - Manually trigger the BattleBackOverlay with mock juror candidates.
 *  - Manually trigger the PublicFavoriteOverlay with mock candidates.
 *  - Adjust seed for different deterministic outcomes.
 *  - Use "slow mode" (long elimination interval) to inspect the voting step.
 *  - View overlay results inline.
 */
import { useState } from 'react';
import BattleBackOverlay from '../../components/BattleBackOverlay/BattleBackOverlay';
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay';
import type { Player } from '../../types';

// Mock players for testing
const MOCK_JURORS: Player[] = [
  { id: 'j1', name: 'Alice', avatar: '👩', status: 'jury' },
  { id: 'j2', name: 'Bob', avatar: '🧑', status: 'jury' },
  { id: 'j3', name: 'Carol', avatar: '👩', status: 'jury' },
  { id: 'j4', name: 'Dave', avatar: '🧑', status: 'jury' },
];

const MOCK_ALL_PLAYERS: Player[] = [
  { id: 'p1', name: 'Alice', avatar: '👩', status: 'evicted' },
  { id: 'p2', name: 'Bob', avatar: '🧑', status: 'evicted' },
  { id: 'p3', name: 'Carol', avatar: '👩', status: 'jury' },
  { id: 'p4', name: 'Dave', avatar: '🧑', status: 'jury' },
  { id: 'p5', name: 'Eve', avatar: '👩', status: 'active' },
  { id: 'p6', name: 'Frank', avatar: '🧑', status: 'active' },
];

type ActiveOverlay = 'none' | 'battleBack' | 'publicFavorite';

/** Slow mode uses a long interval so QA can inspect the voting step. */
const SLOW_ELIM_MS = 60_000;
const FAST_ELIM_MS = 3_500;

export default function TwistsTestPage() {
  const [seed, setSeed] = useState(42);
  const [awardAmount, setAwardAmount] = useState(25000);
  const [slowMode, setSlowMode] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>('none');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const elimIntervalMs = slowMode ? SLOW_ELIM_MS : FAST_ELIM_MS;

  function handleBattleBackComplete(winnerId: string) {
    setLastResult(`BattleBack winner: ${MOCK_JURORS.find((p) => p.id === winnerId)?.name ?? winnerId}`);
    setActiveOverlay('none');
  }

  function handleFavoriteComplete(winnerId: string) {
    setLastResult(`PublicFavorite winner: ${MOCK_ALL_PLAYERS.find((p) => p.id === winnerId)?.name ?? winnerId}`);
    setActiveOverlay('none');
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '500px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>🔬 Twists Test Page</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Manual QA page for BattleBack and Public's Favorite overlays.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.85rem' }}>
          RNG Seed:
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ marginLeft: '0.5rem', width: '80px', background: '#1e1b4b', color: '#fff', border: '1px solid #4f46e5', borderRadius: '0.25rem', padding: '0.2rem 0.4rem' }}
          />
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Award Amount ($):
          <input
            type="number"
            value={awardAmount}
            onChange={(e) => setAwardAmount(Number(e.target.value))}
            style={{ marginLeft: '0.5rem', width: '100px', background: '#1e1b4b', color: '#fff', border: '1px solid #4f46e5', borderRadius: '0.25rem', padding: '0.2rem 0.4rem' }}
          />
        </label>
        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={slowMode}
            onChange={(e) => setSlowMode(e.target.checked)}
          />
          Slow mode (60s elimination) — inspect the voting step
        </label>
      </div>

      {/* Trigger buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => { setLastResult(null); setActiveOverlay('battleBack'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          🔥 Test BattleBack Overlay
        </button>
        <button
          type="button"
          onClick={() => { setLastResult(null); setActiveOverlay('publicFavorite'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          ⭐ Test Public's Favorite Overlay
        </button>
      </div>

      {/* Last result */}
      {lastResult && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.08)', borderRadius: '0.5rem', fontSize: '0.9rem', borderLeft: '3px solid #fbbf24' }}>
          ✅ {lastResult}
        </div>
      )}

      {/* Mock player lists */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
        <p><strong style={{ color: '#f97316' }}>BattleBack candidates ({MOCK_JURORS.length}):</strong> {MOCK_JURORS.map((p) => p.name).join(', ')}</p>
        <p><strong style={{ color: '#7c3aed' }}>PublicFavorite candidates ({MOCK_ALL_PLAYERS.length}):</strong> {MOCK_ALL_PLAYERS.map((p) => p.name).join(', ')}</p>
      </div>

      {/* Overlays */}
      {activeOverlay === 'battleBack' && (
        <BattleBackOverlay
          candidates={MOCK_JURORS}
          seed={seed}
          eliminationIntervalMs={elimIntervalMs}
          onComplete={handleBattleBackComplete}
        />
      )}
      {activeOverlay === 'publicFavorite' && (
        <PublicFavoriteOverlay
          candidates={MOCK_ALL_PLAYERS}
          seed={seed}
          awardAmount={awardAmount}
          eliminationIntervalMs={elimIntervalMs}
          onComplete={handleFavoriteComplete}
        />
      )}
    </div>
  );
}
