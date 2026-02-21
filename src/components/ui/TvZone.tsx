import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers } from '../../store/gameSlice';
import StatusPill from '../ui/StatusPill';
import './TvZone.css';

const PHASE_LABELS: Record<string, string> = {
  week_start:           'Week Start',
  hoh_comp:             'HOH Competition',
  hoh_results:          'HOH Results',
  social_1:             'Social Time',
  nominations:          'Nominations',
  nomination_results:   'Nomination Results',
  pov_comp:             'Veto Competition',
  pov_results:          'Veto Results',
  pov_ceremony:         'Veto Ceremony',
  pov_ceremony_results: 'Veto Ceremony Results',
  social_2:             'Pre-Vote Social',
  live_vote:            'Live Eviction',
  eviction_results:     'Eviction Results',
  week_end:             'Week End',
  final4_eviction:      'Final 4 Eviction',
  final3:               'Final 3',
  final3_comp1:         'Final 3 — Part 1',
  final3_comp2:         'Final 3 — Part 2',
  final3_comp3:         'Final 3 — Part 3 (Final HOH)',
  final3_decision:      'Final HOH Eviction',
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
        <div className="tv-zone__head-pills">
          <StatusPill variant="phase"   icon="📍" label={phaseLabel} />
          <StatusPill variant="week"    icon="📅" label={`S${gameState.season}W${gameState.week}`} />
          <StatusPill variant="players" icon="👥" label={`${alivePlayers.length}/${gameState.players.length}`} />
        </div>

        <div className="tv-zone__head-actions">
          {gameState.isLive && (
            <span className="tv-zone__live-badge" aria-live="polite">LIVE</span>
          )}
          <StatusPill
            variant="dr"
            icon="🚪"
            label="DR"
            onClick={() => navigate('/diary-room')}
            ariaLabel="Open Diary Room"
          />
        </div>
      </div>

      {/* ── Viewport (the "screen") ──────────────────────────────────────── */}
      <div className="tv-zone__viewport" aria-live="polite" aria-atomic="true">
        <div className="tv-zone__scanlines" aria-hidden="true" />
        <div className="tv-zone__vignette"  aria-hidden="true" />
        <p className="tv-zone__now">
          {latestEvent?.text ?? 'Welcome to Big Brother – AI Edition 🏠'}
        </p>
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
