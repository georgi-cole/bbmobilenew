import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../store/GameContext';
import StatusPill from '../ui/StatusPill';
import './TvZone.css';

const PHASE_LABELS: Record<string, string> = {
  lobby:            'Lobby',
  opening:          'Season Premiere',
  intermission:     'Strategizing',
  hoh:              'HOH Competition',
  nominations:      'Nominations',
  veto_comp:        'Veto Competition',
  veto_ceremony:    'Veto Ceremony',
  livevote:         'Live Eviction',
  jury:             'Jury Deliberation',
  final3_comp1:     'Final 3 – Part 1',
  final3_comp2:     'Final 3 – Part 2',
  final3_decision:  'Final 3 – Decision',
  social:           'Social Time',
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
 * To inject new content: dispatch ADD_TV_EVENT via useGame().addTvEvent().
 */
export default function TvZone() {
  const { state, alivePlayers } = useGame();
  const navigate = useNavigate();
  const feedRef = useRef<HTMLUListElement>(null);

  const latestEvent = state.tvFeed[0];

  // Auto-scroll feed to top when new event arrives
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.tvFeed.length]);

  const phaseLabel = PHASE_LABELS[state.phase] ?? state.phase;

  return (
    <section className="tv-zone" aria-label="Game action zone">
      {/* ── Head bar ────────────────────────────────────────────────────── */}
      <div className="tv-zone__head">
        <div className="tv-zone__head-pills">
          <StatusPill variant="phase"   icon="📍" label={phaseLabel} />
          <StatusPill variant="week"    icon="📅" label={`S${state.season}W${state.week}`} />
          <StatusPill variant="players" icon="👥" label={`${alivePlayers.length}/${state.players.length}`} />
        </div>

        <div className="tv-zone__head-actions">
          {state.isLive && (
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
        {state.tvFeed.map((ev) => (
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
