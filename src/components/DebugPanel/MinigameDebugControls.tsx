// MODULE: src/components/DebugPanel/MinigameDebugControls.tsx
// Debug controls for the minigame pool. Shown only when ?debug=1 is in the URL.
// Allows force-selecting a game, setting seed, skipping rules, and fast-forwarding.

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setDebugOverrides, clearDebugOverrides } from '../../store/challengeSlice';
import { getAllGames } from '../../minigames/registry';

const ALL_GAMES = getAllGames().filter((g) => !g.retired);

export default function MinigameDebugControls() {
  const dispatch = useAppDispatch();
  const debug = useAppSelector((s) => s.challenge?.debug ?? {});

  const [localKey, setLocalKey] = useState(debug.forceGameKey ?? '');
  const [localSeed, setLocalSeed] = useState(String(debug.forceSeed ?? ''));
  const [skipRules, setSkipRules] = useState(debug.skipRules ?? false);
  const [fastFwd, setFastFwd] = useState(debug.fastForwardCountdown ?? false);

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
    dispatch(clearDebugOverrides());
  };

  return (
    <section style={{ borderTop: '1px solid #333', marginTop: 12, paddingTop: 12 }}>
      <strong style={{ fontSize: '0.75rem', color: '#e94560', textTransform: 'uppercase' }}>
        🎮 Minigame Debug
      </strong>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Force game key */}
        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>
          Force Game
          <select
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            style={{ marginLeft: 8, background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 4, padding: '2px 4px' }}
          >
            <option value="">(random)</option>
            {ALL_GAMES.map((g) => (
              <option key={g.key} value={g.key}>
                {g.title}
              </option>
            ))}
          </select>
        </label>

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
