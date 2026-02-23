import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers } from '../../store/gameSlice';
import StatusPill from '../ui/StatusPill';
import TVLog from '../TVLog/TVLog';
import TvAnnouncementOverlay, {
  type Announcement,
} from './TvAnnouncementOverlay/TvAnnouncementOverlay';
import TvAnnouncementModal from './TvAnnouncementModal/TvAnnouncementModal';
import type { TvEvent } from '../../types';
import './TvZone.css';
import './TvZoneEnhancements.css';

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

// ─── Announcement configuration ──────────────────────────────────────────────

/** Recognised major-key identifiers that trigger an inline TV announcement. */
const MAJOR_KEYS = new Set([
  'week_start',
  'nomination_ceremony',
  'veto_competition',
  'veto_ceremony',
  'live_eviction',
  'final4',
  'final3',
  'final_hoh',
  'jury',
  'twist',
]);

/** Maps a major key to its announcement title and subtitle. */
const ANNOUNCEMENT_META: Record<string, { title: string; subtitle: string; isLive: boolean; autoDismissMs: number | null }> = {
  week_start:           { title: 'New Week Begins',            subtitle: 'The game resets — alliances shift.',          isLive: false, autoDismissMs: 4000 },
  nomination_ceremony:  { title: 'Nomination Ceremony',        subtitle: 'Two houseguests are going on the block.',     isLive: true,  autoDismissMs: null },
  veto_competition:     { title: 'Power of Veto Competition',  subtitle: 'Six players compete for the golden veto.',   isLive: true,  autoDismissMs: 4000 },
  veto_ceremony:        { title: 'Veto Ceremony',              subtitle: 'Will the veto be used?',                     isLive: true,  autoDismissMs: 4000 },
  live_eviction:        { title: 'Live Eviction',              subtitle: 'The house votes to evict.',                  isLive: true,  autoDismissMs: null },
  final4:               { title: 'Final 4',                    subtitle: 'Only four players remain.',                  isLive: true,  autoDismissMs: null },
  final3:               { title: 'Final 3',                    subtitle: 'The endgame begins.',                        isLive: true,  autoDismissMs: null },
  final_hoh:            { title: 'Final Head of Household',    subtitle: 'The most powerful decision of the game.',    isLive: true,  autoDismissMs: null },
  jury:                 { title: 'Jury Votes',                 subtitle: 'The jury decides the winner.',               isLive: true,  autoDismissMs: null },
  twist:                { title: 'Twist Alert!',               subtitle: 'Big Brother has a surprise.',                isLive: true,  autoDismissMs: 4000 },
};

/** Extract the major key from a TvEvent using meta.major or ev.major heuristics. */
function extractMajorKey(ev: TvEvent): string | null {
  const key = ev.meta?.major ?? ev.major;
  if (!key) return null;
  return MAJOR_KEYS.has(key) ? key : null;
}

/** Build an Announcement object for the given major key and event. */
function buildAnnouncement(key: string, ev: TvEvent): Announcement {
  const meta = ANNOUNCEMENT_META[key] ?? {
    title: key.replace(/_/g, ' ').toUpperCase(),
    subtitle: ev.text,
    isLive: false,
    autoDismissMs: 4000,
  };
  return { key, ...meta };
}


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

  const latestEvent = gameState.tvFeed[0];

  // ── Announcement state ──────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  // Keep the modal key alive independently so the modal stays open even if
  // the overlay dismisses (e.g. via auto-dismiss) while the user is reading.
  const [modalAnnouncementKey, setModalAnnouncementKey] = useState<string | null>(null);
  // Track which event the user has manually dismissed so the overlay doesn't
  // reappear for the same event after dismissal.
  const [dismissedEventId, setDismissedEventId] = useState<string | null>(null);

  // Derive the active announcement directly during render — no effect needed.
  const activeAnnouncement = useMemo<Announcement | null>(() => {
    if (!latestEvent) return null;
    if (latestEvent.id === dismissedEventId) return null;
    const majorKey = extractMajorKey(latestEvent);
    return majorKey ? buildAnnouncement(majorKey, latestEvent) : null;
  }, [latestEvent, dismissedEventId]);

  const handleDismiss = useCallback(() => {
    if (latestEvent) setDismissedEventId(latestEvent.id);
  }, [latestEvent]);
  const handleInfo = useCallback(() => {
    if (activeAnnouncement) setModalAnnouncementKey(activeAnnouncement.key);
    setModalOpen(true);
  }, [activeAnnouncement]);
  const handleModalClose = useCallback(() => setModalOpen(false), []);

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

            {/* Inline announcement overlay */}
            {activeAnnouncement && (
              <TvAnnouncementOverlay
                announcement={activeAnnouncement}
                onInfo={handleInfo}
                onDismiss={handleDismiss}
                paused={modalOpen}
              />
            )}
          </div>

          {/* Continue FAB — visible when a manual-dismiss announcement is active */}
          {activeAnnouncement && activeAnnouncement.autoDismissMs === null && (
            <button
              className="tv-zone__continue-fab"
              onClick={handleDismiss}
              aria-label="Continue"
            >
              Continue ▶
            </button>
          )}
        </div>
      </div>

      {/* ── Event log (TVLog with duplicate suppression, 2 visible rows) ──── */}
      <TVLog
        entries={gameState.tvFeed}
        mainTVMessage={latestEvent?.text}
        maxVisible={2}
      />

      {/* ── Phase-info modal ─────────────────────────────────────────────── */}
      {modalAnnouncementKey && (
        <TvAnnouncementModal
          announcementKey={modalAnnouncementKey}
          open={modalOpen}
          onClose={handleModalClose}
        />
      )}
    </section>
  );
}
