import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers } from '../../store/gameSlice';
import StatusPill from '../ui/StatusPill';
import './TvZone.css';

// Compact phase labels — edit these strings to change what appears in the HUD pill.
const PHASE_LABELS: Record<string, string> = {
  week_start:           'WEEK START',
  hoh_comp:             'HOH COMP',
  hoh_results:          'HOH RESULTS',
  social_1:             'SOCIAL',
  nominations:          'NOMS',
  nomination_results:   'NOMS RESULTS',
  pov_comp:             'POV COMP',
  pov_results:          'POV RESULTS',
  pov_ceremony:         'VETO',
  pov_ceremony_results: 'VETO RESULTS',
  social_2:             'SOCIAL',
  live_vote:            'VOTE',
  eviction_results:     'EVICTION',
  week_end:             'WEEK END',
  final4_eviction:      'F4 EVICT',
  final3:               'FINAL 3',
  final3_comp1:         'F3 P1',
  final3_comp2:         'F3 P2',
  final3_comp3:         'F3 P3',
  final3_decision:      'FINAL HOH',
  jury:                 'JURY',
};

/**
 * TvZone — the central "TV-like" action zone.
 *
 * Structure:
 *   ┌──────────────────────────────┐
 *   │  tvHead: phase pill | timer | DR btn
 *   ├──────────────────────────────┤
 *   │  tvViewport: latest event   │
 *   │  (scanlines + vignette)     │
 *   └──────────────────────────────┘
 *   │  tvFeed: scrollable log     │
 *
 * To inject new content: dispatch addTvEvent() action via useAppDispatch().
 */
export default function TvZone() {
  const gameState = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const navigate = useNavigate();
  const feedRef = useRef<HTMLUListElement>(null);

  const latestEvent = gameState.tvFeed[0];

  // Auto-scroll feed to top when new event arrives
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [gameState.tvFeed.length]);

  const phaseLabel = PHASE_LABELS[gameState.phase] ?? gameState.phase;

  return (
    <section className="tv-zone" aria-label="Game action zone">
      {/* ── Head bar ────────────────────────────────────────────────────── */}
      <div className="tv-zone__head">
        {/* Left: pinned phase pill */}
        <div className="tv-zone__head-phase">
          <StatusPill variant="phase" icon="📍" label={phaseLabel} />
        </div>

        {/* Center: scrollable single-row status pills */}
        <ul className="tv-zone__head-pills" aria-label="Game status pills">
          <li><StatusPill variant="week"    icon="📅" label={`S${gameState.season}W${gameState.week}`} /></li>
          <li><StatusPill variant="players" icon="👥" label={`${alivePlayers.length}/${gameState.players.length}`} /></li>
          {gameState.twistActive && (
            <li><StatusPill variant="twist" icon="🌀" label="TWIST" /></li>
          )}
        </ul>

        <div className="tv-zone__head-actions">
          {gameState.isLive && (
            <span className="tv-zone__live-badge" aria-live="polite">LIVE</span>
          )}
          <StatusPill
            variant="dr"
            icon="🎤"
            label="DR"
            onClick={() => navigate('/diary-room')}
            ariaLabel="Open Diary Room"
          />
        </div>
      </div>

      {/* ── Bezel + Viewport ────────────────────────────────────────────────── */}
      <div className="tv-zone__bezel">
        <div className="tv-zone__bezel-frame">
          <div className="tv-zone__bezel-brand" aria-hidden="true">
            <span className="tv-zone__bezel-brand__text">BB</span>
          </div>

          <div className="tv-zone__viewport" role="region" aria-label="Live game events display" aria-live="polite" aria-atomic="true">
            <div className="tv-zone__scanlines" aria-hidden="true" />
            <div className="tv-zone__vignette"  aria-hidden="true" />
            <div className="tv-zone__glare"     aria-hidden="true" />
            <p className="tv-zone__now">
              {latestEvent?.text ?? 'Welcome to Big Brother – AI Edition 🏠'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Event feed ──────────────────────────────────────────────────── */}
      <ul className="tv-zone__feed" ref={feedRef} aria-label="Game event log">
        {gameState.tvFeed.map((ev) => (
          <li key={ev.id} className={`tv-zone__feed-item tv-zone__feed-item--${ev.type}`}>
            <span className="tv-zone__feed-type" aria-hidden="true">
              {{ game: '🎮', social: '💬', vote: '🗳️', twist: '🌀', diary: '📖' }[ev.type]}
            </span>
            <span className="tv-zone__feed-text">{ev.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
