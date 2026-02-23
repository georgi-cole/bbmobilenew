import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Phase } from '../../types';
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

/**
 * Recognised major-key identifiers that can trigger an inline TV announcement
 * via an explicit event.meta.major or ev.major field.
 * Note: week_start and veto_competition are intentionally excluded — those
 * phases show normal text only (no overlay).
 */
const MAJOR_KEYS = new Set([
  'nomination_ceremony',
  'veto_ceremony',
  'live_eviction',
  'final4',
  'final3_announcement',
  'final_hoh',
  'jury',
  'twist',
]);

/** Maps a major key to its announcement title and subtitle. */
const ANNOUNCEMENT_META: Record<string, { title: string; subtitle: string; isLive: boolean; autoDismissMs: number | null }> = {
  nomination_ceremony:  { title: 'Nomination Ceremony',        subtitle: 'Two houseguests are going on the block.',                      isLive: true,  autoDismissMs: null },
  veto_ceremony:        { title: 'Veto Ceremony',              subtitle: 'Will the veto be used?',                                       isLive: true,  autoDismissMs: null },
  live_eviction:        { title: 'Live Eviction',              subtitle: 'The house votes to evict.',                                    isLive: true,  autoDismissMs: null },
  final4:               { title: 'Final 4 — Veto Ceremony',   subtitle: 'Only four players remain.',                                    isLive: true,  autoDismissMs: null },
  final3_announcement:  { title: 'Final 3',                    subtitle: 'Three players remain — the three-part Final HOH begins.',      isLive: true,  autoDismissMs: null },
  final_hoh:            { title: 'Final HOH Decision',         subtitle: 'The most powerful decision of the game.',                      isLive: true,  autoDismissMs: null },
  jury:                 { title: 'Jury Votes',                 subtitle: 'The jury decides the winner.',                                 isLive: true,  autoDismissMs: null },
  twist:                { title: 'Twist Alert!',               subtitle: 'Big Brother has a surprise.',                                  isLive: true,  autoDismissMs: 4500 },
};

/**
 * Extract the major key from a TvEvent using only explicit meta.major or ev.major
 * fields — text heuristics are intentionally removed to prevent scrambled popups.
 */
function extractMajorKey(ev: TvEvent): string | null {
  const key = ev.meta?.major ?? ev.major ?? null;
  if (!key) return null;
  return MAJOR_KEYS.has(key) ? key : null;
}

/** Build an Announcement object for the given major key and event. */
function buildAnnouncement(key: string, ev: TvEvent): Announcement {
  const meta = ANNOUNCEMENT_META[key] ?? {
    title: key.replace(/_/g, ' ').toUpperCase(),
    subtitle: ev.text,
    isLive: false,
    autoDismissMs: 4500,
  };
  return { key, ...meta };
}

/**
 * Derive an announcement key from the current game phase and alive player count.
 * Only the phases explicitly listed here will trigger an overlay — all others
 * (week_start, hoh_comp, pov_comp, final3_comp1/2/3, …) remain normal text.
 */
function getPhaseAnnouncementKey(phase: Phase, aliveCount: number): string | null {
  if (phase === 'pov_ceremony')    return aliveCount === 4 ? 'final4' : 'veto_ceremony';
  if (phase === 'nominations')     return 'nomination_ceremony';
  if (phase === 'live_vote')       return 'live_eviction';
  if (phase === 'final3')          return aliveCount === 3 ? 'final3_announcement' : null;
  if (phase === 'final3_decision') return 'final_hoh';
  if (phase === 'jury')            return 'jury';
  return null;
}


// Duration (ms) the main viewport text stays faded after an announcement is dismissed,
// preventing jarring text transitions between the overlay disappearing and new text.
const POST_DISMISS_FADE_MS = 300;

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

  // ── Development logging ─────────────────────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('TvZone latestEvent:', latestEvent);
    }
  }, [latestEvent?.id]);

  // ── Announcement state ──────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  // Keep the modal key alive independently so the modal stays open even if
  // the overlay dismisses (e.g. via auto-dismiss) while the user is reading.
  const [modalAnnouncementKey, setModalAnnouncementKey] = useState<string | null>(null);
  // Track which event the user has manually dismissed so the overlay doesn't
  // reappear for the same event after dismissal.
  const [dismissedEventId, setDismissedEventId] = useState<string | null>(null);
  // Track which phase was dismissed to avoid re-showing within the same phase.
  const [dismissedPhase, setDismissedPhase] = useState<Phase | null>(null);
  // Phase-triggered announcement (set on phase transition, cleared on dismiss or non-popup phase).
  const [phaseAnnouncement, setPhaseAnnouncement] = useState<Announcement | null>(null);
  // Brief post-dismiss text fade (POST_DISMISS_FADE_MS) to avoid jarring text transitions.
  const [postDismissBlocked, setPostDismissBlocked] = useState(false);
  const dismissBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the previous phase to detect phase transitions.
  const previousPhaseRef = useRef<Phase | null>(null);
  // Stable ref so phase-transition effect always reads the latest latestEvent.
  const latestEventRef = useRef(latestEvent);
  latestEventRef.current = latestEvent;

  // ── Phase-transition announcement detection ──────────────────────────────────
  // Fires whenever the game phase or alive-player count changes.
  // Only triggers on actual transitions (previousPhaseRef !== current phase).
  useEffect(() => {
    const currentPhase = gameState.phase;
    const prevPhase = previousPhaseRef.current;
    previousPhaseRef.current = currentPhase;

    // Skip on initial mount (no previous phase) and when phase hasn't changed.
    if (prevPhase === null || prevPhase === currentPhase) return;

    const key = getPhaseAnnouncementKey(currentPhase, alivePlayers.length);
    if (key && currentPhase !== dismissedPhase) {
      const ev = latestEventRef.current;
      const stub: TvEvent = { id: 'phase-transition-stub', text: '', type: 'game', timestamp: Date.now() };
      setPhaseAnnouncement(buildAnnouncement(key, ev ?? stub));
      // Suppress any concurrent event-based popup with the same key to prevent duplication.
      if (ev && extractMajorKey(ev) === key) {
        setDismissedEventId(ev.id);
      }
    } else {
      // Entering a non-popup phase: clear any stale phase announcement.
      // Also clear the dismissed guard so the same phase can show its popup again in a later week.
      if (dismissedPhase && currentPhase !== dismissedPhase) {
        setDismissedPhase(null);
      }
      setPhaseAnnouncement(null);
    }
  }, [gameState.phase, alivePlayers.length, dismissedPhase]);

  // Event-based announcement: only explicit meta.major / ev.major (no text heuristics).
  const eventAnnouncement = useMemo<Announcement | null>(() => {
    if (!latestEvent) return null;
    if (latestEvent.id === dismissedEventId) return null;
    const majorKey = extractMajorKey(latestEvent);
    return majorKey ? buildAnnouncement(majorKey, latestEvent) : null;
  }, [latestEvent, dismissedEventId]);

  // Active announcement: phase-based takes priority over event-based.
  const activeAnnouncement = phaseAnnouncement ?? eventAnnouncement;

  const handleDismiss = useCallback(() => {
    if (phaseAnnouncement) {
      setDismissedPhase(gameState.phase);
      setPhaseAnnouncement(null);
    } else if (latestEvent) {
      setDismissedEventId(latestEvent.id);
    }
    setPostDismissBlocked(true);
    if (dismissBlockTimerRef.current !== null) clearTimeout(dismissBlockTimerRef.current);
    dismissBlockTimerRef.current = setTimeout(() => setPostDismissBlocked(false), POST_DISMISS_FADE_MS);
  }, [latestEvent, phaseAnnouncement, gameState.phase]);

  // Cleanup post-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissBlockTimerRef.current !== null) clearTimeout(dismissBlockTimerRef.current);
    };
  }, []);

  // Listen for central FAB 'tv:announcement-dismiss' events
  useEffect(() => {
    const handler = () => handleDismiss();
    window.addEventListener('tv:announcement-dismiss', handler);
    return () => window.removeEventListener('tv:announcement-dismiss', handler);
  }, [handleDismiss]);

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
            <p className="tv-zone__now" style={(postDismissBlocked || !!activeAnnouncement) ? { opacity: 0 } : undefined}>
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
        </div>
      </div>

      {/* ── Event log (TVLog with duplicate suppression, 2 visible rows) ──── */}
      <TVLog
        entries={gameState.tvFeed}
        mainTVMessage={activeAnnouncement ? activeAnnouncement.title : latestEvent?.text}
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
