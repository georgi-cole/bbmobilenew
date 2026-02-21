import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  advance,
  setPhase,
  forceHoH,
  forceNominees,
  forcePovWinner,
  resetGame,
  rerollSeed,
  fastForwardToEviction,
} from '../../store/gameSlice';
import type { Phase } from '../../types';
import './DebugPanel.css';

const PHASES: Phase[] = [
  'week_start',
  'hoh_comp',
  'hoh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pov_comp',
  'pov_results',
  'pov_ceremony',
  'pov_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
];

export default function DebugPanel() {
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get('debug') === '1';

  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<Phase>(game.phase);
  const [selectedHoH, setSelectedHoH] = useState('');
  const [nominee1, setNominee1] = useState('');
  const [nominee2, setNominee2] = useState('');
  const [selectedPov, setSelectedPov] = useState('');

  if (!isDebug) return null;

  const alive = game.players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury',
  );
  const evicted = game.players.filter(
    (p) => p.status === 'evicted' || p.status === 'jury',
  );

  const hohName = game.hohId
    ? game.players.find((p) => p.id === game.hohId)?.name ?? game.hohId
    : '—';
  const povName = game.povWinnerId
    ? game.players.find((p) => p.id === game.povWinnerId)?.name ?? game.povWinnerId
    : '—';
  const nomineeNames = game.nomineeIds.length
    ? game.nomineeIds
        .map((id) => game.players.find((p) => p.id === id)?.name ?? id)
        .join(', ')
    : '—';

  const handleFastForward = () => {
    dispatch(fastForwardToEviction());
  };

  return (
    <>
      <button
        className="dbg-fab"
        onClick={() => setIsOpen((o) => !o)}
        title="Toggle Debug Panel"
        aria-label="Toggle Debug Panel"
      >
        🐛
      </button>

      {isOpen && (
        <aside className="dbg-panel" aria-label="Debug Panel">
          <header className="dbg-panel__header">
            <span>🐛 Debug Panel</span>
            <button
              className="dbg-panel__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close Debug Panel"
            >
              ✕
            </button>
          </header>

          <div className="dbg-panel__body">
            {/* ── Inspector ── */}
            <section className="dbg-section">
              <h3 className="dbg-section__title">Inspector</h3>
              <dl className="dbg-grid">
                <dt>Week</dt>      <dd>{game.week}</dd>
                <dt>Phase</dt>     <dd>{game.phase}</dd>
                <dt>Seed</dt>      <dd>{game.seed}</dd>
                <dt>HOH</dt>       <dd>{hohName}</dd>
                <dt>Nominees</dt>  <dd>{nomineeNames}</dd>
                <dt>POV Winner</dt><dd>{povName}</dd>
                <dt>Alive</dt>     <dd>{alive.length}</dd>
                <dt>Evicted</dt>   <dd>{evicted.length}</dd>
              </dl>

              <details className="dbg-players">
                <summary>Players ({game.players.length})</summary>
                <ul className="dbg-player-list">
                  {game.players.map((p) => (
                    <li key={p.id} className={`dbg-player dbg-player--${p.status.replace('+', '-')}`}>
                      {p.avatar} {p.name}
                      <span className="dbg-player__status">{p.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── Controls ── */}
            <section className="dbg-section">
              <h3 className="dbg-section__title">Controls</h3>

              <div className="dbg-row">
                <label className="dbg-label">Set Phase</label>
                <select
                  className="dbg-select"
                  value={selectedPhase}
                  onChange={(e) => setSelectedPhase(e.target.value as Phase)}
                >
                  {PHASES.map((ph) => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  onClick={() => dispatch(setPhase(selectedPhase))}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(advance())}>
                  Advance Phase
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={handleFastForward}>
                  Fast-fwd → Eviction
                </button>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force HOH</label>
                <select
                  className="dbg-select"
                  value={selectedHoH}
                  onChange={(e) => setSelectedHoH(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedHoH}
                  onClick={() => { dispatch(forceHoH(selectedHoH)); setSelectedHoH(''); }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label">Force Nominees</label>
                <div className="dbg-row">
                  <select
                    className="dbg-select"
                    value={nominee1}
                    onChange={(e) => setNominee1(e.target.value)}
                  >
                    <option value="">— pick 1 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee2}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="dbg-select"
                    value={nominee2}
                    onChange={(e) => setNominee2(e.target.value)}
                  >
                    <option value="">— pick 2 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee1}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    className="dbg-btn"
                    disabled={!nominee1 || !nominee2}
                    onClick={() => {
                      dispatch(forceNominees([nominee1, nominee2]));
                      setNominee1('');
                      setNominee2('');
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force POV</label>
                <select
                  className="dbg-select"
                  value={selectedPov}
                  onChange={(e) => setSelectedPov(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedPov}
                  onClick={() => { dispatch(forcePovWinner(selectedPov)); setSelectedPov(''); }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(rerollSeed())}>
                  Re-roll Seed
                </button>
                <button
                  className="dbg-btn dbg-btn--wide dbg-btn--danger"
                  onClick={() => dispatch(resetGame())}
                >
                  Reset Season
                </button>
              </div>
            </section>
          </div>
        </aside>
      )}
    </>
  );
}
