import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef, startTransition, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Phase } from '../../types';
import { useStore } from 'react-redux';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers } from '../../store/gameSlice';
import { savedStateKeyForProfile, saveSeasonSnapshot } from '../../store/saveStatePersistence';
import type { RootState } from '../../store/store';
import StatusPill from '../ui/StatusPill';
import TVLog from '../TVLog/TVLog';
import TvAnnouncementOverlay, {
  type Announcement,
} from './TvAnnouncementOverlay/TvAnnouncementOverlay';
import TvAnnouncementModal from './TvAnnouncementModal/TvAnnouncementModal';
import { isVisibleInMainLog, isVisibleOnTv } from '../../services/activityService';
import type { TvEvent } from '../../types';
import './TvZone.css';
import './TvZoneEnhancements.css';

// Compact phase labels — edit these strings to change what appears in the HUD pill.
const PHASE_LABELS: Record<string, string> = {
  week_start:               'DAY START',
  hoh_comp_announcement:    'LOH COMP',
  hoh_comp:                 'LOH COMP',
  hoh_results:              'LOH RESULTS',
  social_1:             'SOCIAL',
  nominations:          'NOMS',
  nomination_results:       'NOMS RESULTS',
  pov_comp_announcement:    'POS COMP',
  pov_comp:                 'POS COMP',
  pov_results:          'POS RESULTS',
  pov_ceremony:         'SAFETY',
  pov_ceremony_results: 'SAFETY RESULTS',
  social_2:             'SOCIAL',
  live_vote:            'VOTE',
  eviction_results:     'ELIM',
  week_end:             'DAY END',
  final4_eviction:      'F4 ELIM',
  final3:               'FINAL 3',
  final3_comp1:         'F3 P1',
  final3_comp1_minigame: 'F3 P1',
  final3_comp2:         'F3 P2',
  final3_comp2_minigame: 'F3 P2',
  final3_comp3:         'F3 P3',
  final3_comp3_minigame: 'F3 P3',
  final3_decision:      'FINAL LOH',
  jury:                 'TRIBUNAL',
};

// ─── Announcement configuration ──────────────────────────────────────────────

/**
 * Recognised major-key identifiers that can trigger an inline TV announcement
 * via an explicit event.meta.major or ev.major field.
 * Note: week_start is intentionally excluded — that phase shows normal text only
 * (no overlay).
 */
const MAJOR_KEYS = new Set([
  'nomination_ceremony',
  'veto_ceremony',
  'live_eviction',
  'final4',
  'final3_announcement',
  'final_hoh',
  'jury',
  'battle_back',
  'double_eviction',
  'vip_veto',
  'diamond_pov',
  'coup_detat',
  'spotlight_veto',
  'twist',
  'hoh_comp_announcement',
  'pov_comp_announcement',
]);

/** Maps a major key to its announcement title and subtitle. */
const ANNOUNCEMENT_META: Record<string, { title: string; subtitle: string; isLive: boolean; autoDismissMs: number | null }> = {
  nomination_ceremony:  { title: 'Nomination Ceremony',        subtitle: 'Two housemates are going on the block.',                      isLive: true,  autoDismissMs: null },
  veto_ceremony:        { title: 'Veto Ceremony',              subtitle: 'Will the veto be used?',                                       isLive: true,  autoDismissMs: null },
  live_eviction:        { title: 'Live Elimination',            subtitle: 'The house votes to eliminate.',                                isLive: true,  autoDismissMs: null },
  final4:               { title: 'Final 4 — Veto Ceremony',   subtitle: 'Only four players remain.',                                    isLive: true,  autoDismissMs: null },
  final3_announcement:  { title: 'Final 3',                    subtitle: 'Three players remain — the three-part Final LOH begins.',      isLive: true,  autoDismissMs: null },
  final_hoh:            { title: 'Final LOH Decision',         subtitle: 'The most powerful decision of the game.',                      isLive: true,  autoDismissMs: null },
  jury:                 { title: 'Tribunal Votes',             subtitle: 'The Tribunal decides the winner.',                             isLive: true,  autoDismissMs: null },
  battle_back:          { title: 'Battle Back',                subtitle: 'Eliminated housemates compete for a second chance.',            isLive: true,  autoDismissMs: null },
  double_eviction:      { title: 'Double Elimination!',        subtitle: 'Tonight the LOH nominates three. Two will be eliminated.',      isLive: true,  autoDismissMs: null },
  vip_veto:             { title: 'Double Trouble!',            subtitle: 'The holder may use the power twice this ceremony. 👑',            isLive: true,  autoDismissMs: null },
  diamond_pov:          { title: 'Halo Exchange!',             subtitle: 'The holder may name the replacement nominee. 😇',                 isLive: true,  autoDismissMs: null },
  coup_detat:           { title: 'Detox!',                     subtitle: 'Both nominees cleared. Holder names two replacements. ⚡',       isLive: true,  autoDismissMs: null },
  spotlight_veto:       { title: 'Force Majeure!',             subtitle: 'The holder is forced to use the power this ceremony. ✨',        isLive: true,  autoDismissMs: null },
  twist:                { title: 'Shock Alert!',               subtitle: 'The Big Eye has a surprise.',                                  isLive: true,  autoDismissMs: null },
  hoh_comp_announcement: { title: 'LOH Competition',           subtitle: 'Power is up for grabs — who will become Leader of the House?', isLive: true,  autoDismissMs: null },
  pov_comp_announcement: { title: 'Power of Safety',           subtitle: 'It\'s time for the Power of Safety competition!',              isLive: true,  autoDismissMs: null },
};

/**
 * Extract the major key from a TvEvent using explicit meta.major or ev.major
 * fields. Battle Back is the one allowed text heuristic fallback (legacy twist
 * events without a major key can still trigger the Battle Back announcement).
 */
function extractMajorKey(ev: TvEvent): string | null {
  const key = ev.meta?.major ?? ev.major ?? null;
  const hasBattleBackCopy = ev.type === 'twist' && /battle back/i.test(ev.text);

  // Legacy Battle Back events may still be tagged as a generic twist (or missing a major).
  if ((key === 'twist' || !key) && hasBattleBackCopy) return 'battle_back';
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
 * Note: hoh_comp_announcement and pov_comp_announcement DO trigger overlays;
 * hoh_comp and pov_comp themselves do not (they enter the actual minigame flow).
 */
function getPhaseAnnouncementKey(phase: Phase, aliveCount: number, doubleEvictionActive: boolean): string | null {
  if (phase === 'hoh_comp_announcement') return 'hoh_comp_announcement';
  if (phase === 'pov_comp_announcement') return 'pov_comp_announcement';
  if (phase === 'pov_ceremony')    return aliveCount === 4 ? 'final4' : 'veto_ceremony';
  if (phase === 'nominations')     return doubleEvictionActive ? 'double_eviction' : 'nomination_ceremony';
  if (phase === 'live_vote')       return 'live_eviction';
  if (phase === 'final3')          return aliveCount === 3 ? 'final3_announcement' : null;
  if (phase === 'final3_decision') return 'final_hoh';
  if (phase === 'jury')            return 'jury';
  return null;
}


// Duration (ms) the main viewport text stays faded after an announcement is dismissed,
// preventing jarring text transitions between the overlay disappearing and new text.
const POST_DISMISS_FADE_MS = 300;
const DOUBLE_EVICTION_SPOTLIGHT_MS = 1700;

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
  const doubleEvictionActive = useAppSelector((s) => s.game.doubleEviction?.weekActive ?? false);
  const isGuest = useAppSelector((s: RootState) => s.profiles.isGuest);
  const activeProfileId = useAppSelector((s: RootState) => s.profiles.activeProfileId);
  const hasPendingChallenge = useAppSelector((s: RootState) => s.challenge.pending != null);
  const reduxStore = useStore<RootState>();

  // Filter entries for the TV viewport (excludes DR-only events).
  const tvVisibleFeed = useMemo(
    () => gameState.tvFeed.filter(isVisibleOnTv),
    [gameState.tvFeed],
  );
  // Filter entries for the main-screen log strip (excludes DR-only events).
  const mainLogFeed = useMemo(
    () => gameState.tvFeed.filter(isVisibleInMainLog),
    [gameState.tvFeed],
  );

  const latestEvent = tvVisibleFeed[0];

  // ── Development logging ─────────────────────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('TvZone latestEvent:', latestEvent);
    }
  }, [latestEvent]);

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
  // Short-lived TV spotlight effect for Double Eviction special announcements.
  const [deSpotlightActive, setDeSpotlightActive] = useState(false);
  const [saveStatus, setSaveStatus] = useState<null | 'saved' | 'error'>(null);
  const dismissBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deSpotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the previous phase to detect phase transitions.
  const previousPhaseRef = useRef<Phase | null>(null);
  // Stable ref so phase-transition effect always reads the latest latestEvent.
  const latestEventRef = useRef(latestEvent);
  // Update the ref after each render so the phase-transition effect always has
  // the freshest value without needing latestEvent in its own dependency array.
  useLayoutEffect(() => {
    latestEventRef.current = latestEvent;
  });

  // ── Phase-transition announcement detection ──────────────────────────────────
  // Fires whenever the game phase or alive-player count changes.
  // Also allows an in-place upgrade for nomination-phase overlays when
  // Double Eviction activates after the phase has already been entered.
  useEffect(() => {
    const currentPhase = gameState.phase;
    const prevPhase = previousPhaseRef.current;
    previousPhaseRef.current = currentPhase;
    const key = getPhaseAnnouncementKey(currentPhase, alivePlayers.length, doubleEvictionActive);
    const keyChangedInPlace =
      prevPhase === currentPhase &&
      currentPhase === 'nominations' &&
      phaseAnnouncement?.key !== null &&
      phaseAnnouncement?.key !== undefined &&
      phaseAnnouncement?.key !== key;

    // Skip on initial mount (no previous phase) and when phase/key haven't changed.
    if (prevPhase === null || (prevPhase === currentPhase && !keyChangedInPlace)) return;
    const ev = latestEventRef.current;
    // Batch all state updates as a non-urgent transition (satisfies react-hooks/set-state-in-effect
    // by deferring setState calls into a callback rather than calling them synchronously).
    startTransition(() => {
      if (key && (currentPhase !== dismissedPhase || keyChangedInPlace)) {
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
    });
  }, [gameState.phase, alivePlayers.length, dismissedPhase, doubleEvictionActive, phaseAnnouncement?.key]);

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

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  // Play a short TV-only spotlight intro for Double Eviction announcements,
  // then return the surrounding UI to normal while keeping the announcement visible.
  useEffect(() => {
    if (activeAnnouncement?.key !== 'double_eviction') {
      const isSpecialVetoAnnouncement =
        activeAnnouncement?.key === 'vip_veto' ||
        activeAnnouncement?.key === 'diamond_pov' ||
        activeAnnouncement?.key === 'coup_detat' ||
        activeAnnouncement?.key === 'spotlight_veto';
      if (!isSpecialVetoAnnouncement) {
        startTransition(() => {
          setDeSpotlightActive(false);
        });
        if (deSpotlightTimerRef.current !== null) {
          clearTimeout(deSpotlightTimerRef.current);
          deSpotlightTimerRef.current = null;
        }
        return;
      }
    }

    startTransition(() => {
      setDeSpotlightActive(true);
    });
    if (deSpotlightTimerRef.current !== null) clearTimeout(deSpotlightTimerRef.current);
    deSpotlightTimerRef.current = setTimeout(() => {
      startTransition(() => {
        setDeSpotlightActive(false);
      });
      deSpotlightTimerRef.current = null;
    }, DOUBLE_EVICTION_SPOTLIGHT_MS);

    return () => {
      if (deSpotlightTimerRef.current !== null) {
        clearTimeout(deSpotlightTimerRef.current);
        deSpotlightTimerRef.current = null;
      }
    };
  }, [activeAnnouncement?.key]);

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
  const isAtGameStart = gameState.week === 1 && gameState.phase === 'week_start';
  const canSave = !isGuest && Boolean(activeProfileId) && !isAtGameStart && !hasPendingChallenge;
  const saveChipLabel = '';
  const saveChipIcon = saveStatus === 'saved' ? '✅' : saveStatus === 'error' ? '❌' : '💾';
  const saveChipVariant = saveStatus === 'error' ? 'danger' : 'success';
  const saveChipAriaLabel = isGuest
    ? 'Save (unavailable in guest mode)'
    : !activeProfileId
      ? 'Save (no active profile selected)'
      : hasPendingChallenge
        ? 'Save (unavailable during competition)'
        : isAtGameStart
          ? 'Save (nothing to save yet)'
          : saveStatus === 'saved'
            ? 'Saved!'
            : saveStatus === 'error'
              ? 'Save failed'
              : 'Save game';
  const saveChipTitle = isGuest
    ? 'Save unavailable in guest mode'
    : !activeProfileId
      ? 'No active profile selected'
      : hasPendingChallenge
        ? 'Save unavailable during competition'
        : isAtGameStart
          ? 'Nothing to save yet'
          : saveStatus === 'saved'
            ? 'Saved!'
            : saveStatus === 'error'
              ? 'Save failed — try again'
              : 'Save game';

  // Whether the current announcement is a double eviction (for spotlight effect).
  const isDeSpotlight = deSpotlightActive;

  const handleSave = useCallback(() => {
    if (!canSave || !activeProfileId) return;

    const currentState = reduxStore.getState();
    const key = savedStateKeyForProfile(activeProfileId);
    const ok = saveSeasonSnapshot(key, {
      version: 1,
      profileId: activeProfileId,
      savedAt: new Date().toISOString(),
      game: currentState.game,
      finale: currentState.finale,
      social: currentState.social,
    });
    setSaveStatus(ok ? 'saved' : 'error');

    if (saveStatusTimerRef.current !== null) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), 2000);
  }, [activeProfileId, canSave, reduxStore]);

  return (
    <section
      className={`tv-zone${isDeSpotlight ? ' tv-zone--de-spotlight' : ''}`}
      aria-label="Game action zone"
      style={{ '--de-spotlight-ms': `${DOUBLE_EVICTION_SPOTLIGHT_MS}ms` } as CSSProperties}
    >
      {/* ── Double Eviction spotlight backdrop (portal to body) ──────────── */}
      {isDeSpotlight && createPortal(
        <div className="tv-zone-de-backdrop" aria-hidden="true" />,
        document.body,
      )}

      {/* ── Head bar ────────────────────────────────────────────────────── */}
      <div className="tv-zone__head">
        {/* Left: pinned phase pill */}
        <div className="tv-zone__head-phase">
          <StatusPill variant="phase" icon="📍" label={phaseLabel} />
        </div>

        {/* Center: scrollable single-row status pills */}
        <ul className="tv-zone__head-pills" aria-label="Game status pills">
          <li><StatusPill variant="week"    icon="📅" label={`S${gameState.season}D${gameState.week}`} /></li>
          <li><StatusPill variant="players" icon="👥" label={`${alivePlayers.length}/${gameState.players.length}`} /></li>
        </ul>

        <div className="tv-zone__head-actions">
          {gameState.isLive && (
            <span className="tv-zone__live-badge" aria-live="polite">LIVE</span>
          )}
          <StatusPill
            variant={saveChipVariant}
            icon={saveChipIcon}
            label={saveChipLabel}
            onClick={handleSave}
            disabled={!canSave}
            ariaLabel={saveChipAriaLabel}
            title={saveChipTitle}
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
              {latestEvent?.text ?? 'Welcome to The Big Eye – AI Edition 🏠'}
            </p>

            {/* Twist badge — broadcast-style corner ribbon anchored to the viewport */}
            {gameState.twistActive && (
              <div className="tv-zone__twist-badge" aria-hidden="true">
                <span>🌀</span>
                SHOCK
              </div>
            )}

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
        entries={mainLogFeed}
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
