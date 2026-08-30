// MODULE: src/components/DebugPanel/MinigameDebugControls.tsx
// Debug controls for the minigame pool. Shown only when debug access is granted
// (debug=1, with qa=1 required on production hosts).
// Allows force-selecting a game, setting seed, skipping rules, and fast-forwarding.

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setDebugOverrides, clearDebugOverrides } from '../../store/challengeSlice';
import { getAllGames } from '../../minigames/registry';

const ALL_GAMES = getAllGames().filter((g) => !g.retired || g.vipOnly);

function debugGameTitle(game: (typeof ALL_GAMES)[number]): string {
  return `${game.title}${game.vipOnly ? ' · VIP' : ''}`;
}

export default function MinigameDebugControls() {
  const dispatch = useAppDispatch();
  const debug = useAppSelector((s) => s.challenge?.debug ?? {});

  const [localKey, setLocalKey] = useState(debug.forceGameKey ?? '');
  const [localSeed, setLocalSeed] = useState(String(debug.forceSeed ?? ''));
  const [skipRules, setSkipRules] = useState(debug.skipRules ?? false);
  const [fastFwd, setFastFwd] = useState(debug.fastForwardCountdown ?? false);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);

  const selected = ALL_GAMES.find((game) => game.key === localKey);
  const selectedGameTitle = selected ? debugGameTitle(selected) : '(random)';

  const handleApply = () => {
    dispatch(
      setDebugOverrides({
        forceGameKey: localKey || undefined,
        forceSeed: localSeed ? Number(localSeed) : undefined,
        skipRules,
        fastForwardCountdown: fastFwd,
      }),
    );
  };

  const handleClear = () => {
    setLocalKey('');
    setLocalSeed('');
    setSkipRules(false);
    setFastFwd(false);
    setGamePickerOpen(false);
    dispatch(clearDebugOverrides());
  };

  return (
    <section className="dbg-section">
      <h3 className="dbg-section__title">Minigames</h3>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Force game key */}
        <div className="dbg-minigame-picker">
          <span className="dbg-minigame-picker__label">Force Game</span>
          <button
            type="button"
            className="dbg-minigame-picker__trigger"
            aria-label="Force Game"
            aria-haspopup="listbox"
            aria-expanded={gamePickerOpen}
            onClick={() => setGamePickerOpen((open) => !open)}
          >
            <span>{selectedGameTitle}</span>
            <span aria-hidden="true">{gamePickerOpen ? '▴' : '▾'}</span>
          </button>
          {gamePickerOpen && (
            <div className="dbg-minigame-picker__options" role="listbox" aria-label="Minigame options">
              <button
                type="button"
                role="option"
                aria-selected={localKey === ''}
                className="dbg-minigame-picker__option"
                onClick={() => {
                  setLocalKey('');
                  setGamePickerOpen(false);
                }}
              >
                (random)
              </button>
              {ALL_GAMES.map((game) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={localKey === game.key}
                  className="dbg-minigame-picker__option"
                  key={game.key}
                  onClick={() => {
                    setLocalKey(game.key);
                    setGamePickerOpen(false);
                  }}
                >
                  {debugGameTitle(game)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Force seed */}
        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>
          Seed
          <input
            type="number"
            value={localSeed}
            onChange={(e) => setLocalSeed(e.target.value)}
            placeholder="random"
            style={{ marginLeft: 8, width: 80, background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 4, padding: '2px 4px' }}
          />
        </label>

        {/* Skip rules modal */}
        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>
          <input
            type="checkbox"
            checked={skipRules}
            onChange={(e) => setSkipRules(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Skip Rules Modal
        </label>

        {/* Fast-forward countdown */}
        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>
          <input
            type="checkbox"
            checked={fastFwd}
            onChange={(e) => setFastFwd(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Fast-forward Ready Timer
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleApply}
            style={{ padding: '4px 10px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Apply
          </button>
          <button
            onClick={handleClear}
            style={{ padding: '4px 10px', background: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
