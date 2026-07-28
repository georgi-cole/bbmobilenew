/**
 * TwistsTestPage — Manual QA page for testing BattleBack and PublicFavorite twists.
 *
 * Access via route: /twists-test (dev builds only)
 *
 * This page lets QA testers and developers:
 *  - Manually trigger the Battle Back competition via SpectatorView with mock juror candidates.
 *    The BattleBack shows a best-of-3 competition (seeded RNG), not voting.
 *  - Manually trigger the PublicFavoriteOverlay with mock candidates.
 *  - Adjust seed for different deterministic competition outcomes.
 *  - View overlay results inline.
 */
import { useState, useMemo } from 'react';
import SpectatorView from '../../components/ui/SpectatorView';
import type { SpectatorVariant } from '../../components/ui/SpectatorView';
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay';
import TwinShockIntroCinematic from '../../components/TwinShockIntroCinematic/TwinShockIntroCinematic';
import TwinShockRevealOverlay from '../../components/TwinShockRevealOverlay/TwinShockRevealOverlay';
import { simulateBattleBackCompetition } from '../../features/twists/battleBackCompetition';
import { mulberry32 } from '../../store/rng';
import type { Player } from '../../types';

// Mock players for testing
const MOCK_JURORS: Player[] = [
  { id: 'j1', name: 'Alice', avatar: '👩', status: 'jury' },
  { id: 'j2', name: 'Bob', avatar: '🧑', status: 'jury' },
  { id: 'j3', name: 'Carol', avatar: '👩', status: 'jury' },
  { id: 'j4', name: 'Dave', avatar: '🧑', status: 'jury' },
];

const MOCK_ALL_PLAYERS: Player[] = [
  { id: 'finn', name: 'Finn', avatar: '🧑', status: 'evicted' },
  { id: 'mimi', name: 'Mimi', avatar: '👩', status: 'evicted' },
  { id: 'rae', name: 'Rae', avatar: '👩', status: 'jury' },
  { id: 'nova', name: 'Nova', avatar: '🧑', status: 'jury' },
  { id: 'kai', name: 'Kai', avatar: '🧑', status: 'active' },
  { id: 'zed', name: 'Zed', avatar: '🧑', status: 'active' },
];

const BASE = import.meta.env.BASE_URL;
const MOCK_EXPOSED_TWIN_REVEAL = {
  type: 'combined' as const,
  playerId: 'lia',
  fromName: 'Lia',
  fromAvatar: `${BASE}assets/skins/Lia_avatar.webp`,
  toName: 'Lia & Ali',
  toAvatar: `${BASE}assets/skins/Ali_lia_avatar.webp`,
};

const MOCK_SECRET_KEPT_TWIN_REVEAL = {
  type: 'ali_enters' as const,
  replacedPlayerId: 'echo',
  replacedPlayerName: 'Echo',
  replacedPlayerAvatar: `${BASE}assets/skins/Echo_avatar.webp`,
  incomingPlayerId: 'ali',
  incomingName: 'Ali',
  incomingAvatar: `${BASE}assets/skins/Ali_avatar.webp`,
};

type TwinScenario = 'exposed' | 'secretKept';

type ActiveOverlay = 'none' | 'battleBack' | 'publicFavorite' | 'twinShock' | 'twinShockAvatar';

export default function TwistsTestPage() {
  const phonePreview = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('phonePreview') === 'true';
  const [seed, setSeed] = useState(42);
  const [awardAmount, setAwardAmount] = useState(25000);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(() => (
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('preview') === 'public-favorite'
      ? 'publicFavorite'
      : 'none'
  ));
  const [twinScenario, setTwinScenario] = useState<TwinScenario>('exposed');
  const [lastResult, setLastResult] = useState<string | null>(null);
  // Seed frozen at the moment the overlay is opened so that changing the
  // seed input while SpectatorView is mounted cannot desync the displayed
  // winner from what useSpectatorSimulation captured on mount.
  const [openSeed, setOpenSeed] = useState(42);

  const bbWinnerId = useMemo(
    () => simulateBattleBackCompetition(MOCK_JURORS.map((p) => p.id), openSeed).winnerId,
    [openSeed],
  );

  const bbVariant = useMemo((): SpectatorVariant => {
    const variants: SpectatorVariant[] = ['holdwall', 'trivia', 'maze'];
    const rng = mulberry32(((openSeed ^ 0xdeadbeef) >>> 0));
    return variants[Math.floor(rng() * variants.length)];
  }, [openSeed]);

  function handleBattleBackDone() {
    const winner = MOCK_JURORS.find((p) => p.id === bbWinnerId);
    setLastResult(`Back 2 the Game winner: ${winner?.name ?? bbWinnerId ?? 'unknown'}`);
    setActiveOverlay('none');
  }

  function handleFavoriteComplete(winnerId: string) {
    setLastResult(`PublicFavorite winner: ${MOCK_ALL_PLAYERS.find((p) => p.id === winnerId)?.name ?? winnerId}`);
    setActiveOverlay('none');
  }

  const activeTwinReveal = twinScenario === 'secretKept'
    ? MOCK_SECRET_KEPT_TWIN_REVEAL
    : MOCK_EXPOSED_TWIN_REVEAL;

  function getTwinTileRect(): DOMRect | null {
    const targetId = activeTwinReveal.type === 'combined'
      ? activeTwinReveal.playerId
      : activeTwinReveal.incomingPlayerId;
    return document.querySelector<HTMLElement>(`[data-player-id="${targetId}"]`)?.getBoundingClientRect() ?? null;
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '500px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>🔬 Twists Test Page</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Manual QA page for Back 2 the Game, Public's Favorite, and both Twin Shock outcomes.
      </p>
      <a
        href="#/phone-preview"
        style={{ display: 'inline-flex', marginBottom: '1.5rem', color: '#f4cf7f', fontSize: '0.85rem', fontWeight: 800 }}
      >
        Open Public Favorite in a phone simulator
      </a>

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
      </div>

      {/* Trigger buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => { setOpenSeed(seed); setLastResult(null); setActiveOverlay('battleBack'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          🏆 Test Back 2 the Game Competition
        </button>
        <button
          type="button"
          onClick={() => { setLastResult(null); setActiveOverlay('publicFavorite'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          ⭐ Test Public's Favorite
        </button>
        <button
          type="button"
          onClick={() => { setTwinScenario('exposed'); setLastResult(null); setActiveOverlay('twinShock'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #6366f1, #0891b2)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          Test Exposed — Lia & Ali as One
        </button>
        <button
          type="button"
          onClick={() => { setTwinScenario('secretKept'); setLastResult(null); setActiveOverlay('twinShock'); }}
          style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #0891b2, #2563eb)', color: '#fff', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 700 }}
        >
          Test Secret Kept — Ali Enters
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
        <p><strong style={{ color: '#f97316' }}>Back 2 the Game candidates ({MOCK_JURORS.length}):</strong> {MOCK_JURORS.map((p) => p.name).join(', ')}</p>
        <p><strong style={{ color: '#7c3aed' }}>PublicFavorite candidates ({MOCK_ALL_PLAYERS.length}):</strong> {MOCK_ALL_PLAYERS.map((p) => p.name).join(', ')}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '1.5rem' }}>
        <div
          data-player-id="lia"
          style={{ width: '92px', padding: '8px', borderRadius: '16px', background: '#151933', textAlign: 'center' }}
        >
          <img src={`${BASE}assets/skins/Ali_lia_avatar.webp`} alt="Lia and Ali preview tile" style={{ display: 'block', width: '76px', height: '76px', borderRadius: '12px', objectFit: 'cover' }} />
          <span style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem' }}>Lia &amp; Ali</span>
        </div>
        <div
          data-player-id="ali"
          style={{ width: '92px', padding: '8px', borderRadius: '16px', background: '#151933', textAlign: 'center' }}
        >
          <img src={`${BASE}assets/skins/Ali_avatar.webp`} alt="Ali preview tile" style={{ display: 'block', width: '76px', height: '76px', borderRadius: '12px', objectFit: 'cover' }} />
          <span style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem' }}>Ali</span>
        </div>
      </div>

      {/* Overlays */}
      {activeOverlay === 'battleBack' && (
        <SpectatorView
          key={MOCK_JURORS.map((p) => p.id).join('-') + '-bb-test-' + openSeed}
          competitorIds={MOCK_JURORS.map((p) => p.id)}
          variant={bbVariant}
          expectedWinnerId={bbWinnerId}
          roundLabel="Back 2 the Game"
          placement="fullscreen"
          onDone={handleBattleBackDone}
        />
      )}
      {activeOverlay === 'publicFavorite' && (
        <PublicFavoriteOverlay
          candidates={MOCK_ALL_PLAYERS}
          seed={seed}
          awardAmount={awardAmount}
          eliminationIntervalMs={phonePreview ? 5600 : 3500}
          onComplete={handleFavoriteComplete}
        />
      )}
      {activeOverlay === 'twinShock' && (
        <TwinShockIntroCinematic
          reveal={activeTwinReveal}
          onComplete={() => setActiveOverlay('twinShockAvatar')}
        />
      )}
      {activeOverlay === 'twinShockAvatar' && (
        <TwinShockRevealOverlay
          reveal={activeTwinReveal}
          getTileRect={getTwinTileRect}
          onDone={() => {
            setLastResult(twinScenario === 'secretKept'
              ? 'Secret kept: Ali entered separately and replaced an evicted housemate.'
              : 'Secret exposed: Lia and Ali now play as one housemate.');
            setActiveOverlay('none');
          }}
        />
      )}
    </div>
  );
}
