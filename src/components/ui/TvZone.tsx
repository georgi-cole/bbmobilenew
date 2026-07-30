import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  startTransition,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { CupidArrowPair, Phase, Player } from '../../types'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectAlivePlayers } from '../../store/gameSlice'
import { savedStateKeyForProfile, saveSeasonSnapshot } from '../../store/saveStatePersistence'
import { DEFAULT_SETTINGS, setAudio } from '../../store/settingsSlice'
import type { RootState } from '../../store/store'
import GameTopChip from '../GameTopChip/GameTopChip'
import TVLog from '../TVLog/TVLog'
import TvAnnouncementOverlay, {
  type Announcement,
} from './TvAnnouncementOverlay/TvAnnouncementOverlay'
import TvAnnouncementModal from './TvAnnouncementModal/TvAnnouncementModal'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import AnimatedVoteResultsModal, {
  type PublicEvictionTiebreakDisplay,
  type VoteTally,
} from '../AnimatedVoteResultsModal/AnimatedVoteResultsModal'
import PublicSaveReveal from '../PublicSaveReveal/PublicSaveReveal'
import { isVisibleInMainLog, isVisibleOnTv } from '../../services/activityService'
import type { TvEvent } from '../../types'
import TopUtilityButton from '../TopUtilityButton/TopUtilityButton'
import { getViewportMessageKey } from './tvZoneKeys'
import { LIVE_VOTE_PITCHES_EVENT_KEY } from '../../constants/tvEvents'
import {
  formatCycleAriaLabel,
  formatCycleLabel,
  formatPhaseLabel,
} from '../../utils/gameStatusLanguage'
import ShockIntroOverlay from './ShockIntroOverlay/ShockIntroOverlay'
import ConfessionalSpotlightOverlay from '../FloatingActionBar/ConfessionalSpotlightOverlay'
import DemocraciaResultsReveal from './DemocraciaResultsReveal/DemocraciaResultsReveal'
import './TvZone.css'
import './TvZoneEnhancements.css'
import './ShockDangerMode.css'

const NOOP = () => {}

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
  'democracia',
  'cupid_arrow',
  'cupid_arrow_broken',
  'tribunal_phase',
  'twist',
  'loh_comp_announcement',
  'pos_comp_announcement',
])

/** Maps a major key to its announcement title and subtitle. */
const ANNOUNCEMENT_META: Record<
  string,
  { title: string; subtitle: string; isLive: boolean; autoDismissMs: number | null }
> = {
  nomination_ceremony: {
    title: 'Nomination Ceremony',
    subtitle: 'Two players are nominated for elimination.',
    isLive: true,
    autoDismissMs: null,
  },
  veto_ceremony: {
    title: 'Safety Ceremony',
    subtitle: 'Will the Power of Safety be used?',
    isLive: true,
    autoDismissMs: null,
  },
  live_eviction: {
    title: 'Live Elimination',
    subtitle: 'The house votes to eliminate.',
    isLive: true,
    autoDismissMs: null,
  },
  final4: {
    title: 'Final 4 — Safety Ceremony',
    subtitle: 'Only four players remain.',
    isLive: true,
    autoDismissMs: null,
  },
  final3_announcement: {
    title: 'The Finale',
    subtitle: 'Three players remain — the three-part Final LOH begins.',
    isLive: true,
    autoDismissMs: null,
  },
  final_hoh: {
    title: 'Final LOH Decision',
    subtitle: 'The most powerful decision of the game.',
    isLive: true,
    autoDismissMs: null,
  },
  jury: {
    title: 'Tribunal Votes',
    subtitle: 'The Tribunal decides the winner.',
    isLive: true,
    autoDismissMs: null,
  },
  battle_back: {
    title: 'Back 2 the Game',
    subtitle: 'Eliminated players compete for a second chance.',
    isLive: true,
    autoDismissMs: null,
  },
  double_eviction: {
    title: 'Double Elimination!',
    subtitle: 'Tonight the LOH nominates three. Two will be eliminated.',
    isLive: true,
    autoDismissMs: null,
  },
  cupid_arrow: {
    title: "Cupid's Arrow",
    subtitle:
      'The house is bound into eight pairs. Every triumph, vote, danger, and fall is shared.',
    isLive: true,
    autoDismissMs: null,
  },
  cupid_arrow_broken: {
    title: "Cupid's Spell Is Broken",
    subtitle: 'Four pairs have fallen. Cupid leaves the house, and every survivor now plays alone.',
    isLive: true,
    autoDismissMs: null,
  },
  vip_veto: {
    title: 'Double Trouble!',
    subtitle: 'The holder may use the power twice this ceremony. 👑',
    isLive: true,
    autoDismissMs: null,
  },
  diamond_pov: {
    title: 'Halo Exchange!',
    subtitle: 'The holder may name the backup nominee. 😇',
    isLive: true,
    autoDismissMs: null,
  },
  coup_detat: {
    title: 'Detox!',
    subtitle: 'Both nominees cleared. Holder names two backup nominees. ⚡',
    isLive: true,
    autoDismissMs: null,
  },
  spotlight_veto: {
    title: 'Force Majeure!',
    subtitle: 'The holder is forced to use the power this ceremony. ✨',
    isLive: true,
    autoDismissMs: null,
  },
  democracia: {
    title: 'DEMOCRACIA!',
    subtitle: 'The house will elect the new Leader of the House by secret vote.',
    isLive: true,
    autoDismissMs: null,
  },
  tribunal_phase: {
    title: `Congrats all, you've just made it to tribunal.`,
    subtitle: 'Your voices will crown the winner.',
    isLive: true,
    autoDismissMs: null,
  },
  twist: {
    title: 'Shock Alert!',
    subtitle: 'The Big Eye has a surprise.',
    isLive: true,
    autoDismissMs: null,
  },
  loh_comp_announcement: {
    title: 'LOH Competition',
    subtitle: 'Power is up for grabs — who will become Leader of the House?',
    isLive: true,
    autoDismissMs: null,
  },
  pos_comp_announcement: {
    title: 'Power of Safety',
    subtitle: "It's time for the Power of Safety competition!",
    isLive: true,
    autoDismissMs: null,
  },
}

/**
 * Extract the major key from a TvEvent using explicit meta.major or ev.major
 * fields. Battle Back is the one allowed text heuristic fallback (legacy twist
 * events without a major key can still trigger the Battle Back announcement).
 */
function extractMajorKey(ev: TvEvent): string | null {
  const key = ev.meta?.major ?? ev.major ?? null
  const hasBattleBackCopy = ev.type === 'twist' && /battle back|back 2 the game/i.test(ev.text)

  // Legacy Battle Back events may still be tagged as a generic twist (or missing a major).
  if ((key === 'twist' || !key) && hasBattleBackCopy) return 'battle_back'
  if (!key) return null
  return MAJOR_KEYS.has(key) ? key : null
}

/** Build an Announcement object for the given major key and event. */
function buildAnnouncement(key: string, ev: TvEvent): Announcement {
  const meta = ANNOUNCEMENT_META[key] ?? {
    title: key.replace(/_/g, ' ').toUpperCase(),
    subtitle: ev.text,
    isLive: false,
    autoDismissMs: 4500,
  }
  return { key, ...meta }
}

function isDetoxSequenceEvent(event: TvEvent | undefined): event is TvEvent {
  return event?.meta?.sequence === 'detox_safety'
}

/**
 * Derive an announcement key from the current game phase and alive player count.
 * Only the phases explicitly listed here will trigger an overlay — all others
 * (week_start, loh_comp, pos_comp, final3_comp1/2/3, …) remain normal text.
 * Note: loh_comp_announcement and pos_comp_announcement DO trigger overlays;
 * loh_comp and pos_comp themselves do not (they enter the actual minigame flow).
 */
function getPhaseAnnouncementKey(
  phase: Phase,
  aliveCount: number,
  doubleEvictionActive: boolean
): string | null {
  if (phase === 'loh_comp_announcement') return 'loh_comp_announcement'
  if (phase === 'democracia_vote') return 'democracia'
  if (phase === 'pos_comp_announcement') return 'pos_comp_announcement'
  if (phase === 'pos_ceremony') return aliveCount === 4 ? 'final4' : 'veto_ceremony'
  if (phase === 'nominations')
    return doubleEvictionActive ? 'double_eviction' : 'nomination_ceremony'
  if (phase === 'live_vote') return 'live_eviction'
  if (phase === 'final3') return aliveCount === 3 ? 'final3_announcement' : null
  if (phase === 'final3_decision') return 'final_hoh'
  if (phase === 'jury') return 'jury'
  return null
}

// Duration (ms) the main viewport text stays faded after an announcement is dismissed,
// preventing jarring text transitions between the overlay disappearing and new text.
const POST_DISMISS_FADE_MS = 300
const DOUBLE_EVICTION_SPOTLIGHT_MS = 1700
const LIVE_VOTE_CUTOUT_PADDING = 12
const LIVE_VOTE_CUTOUT_RADIUS = 18
const DETOX_MESSAGE_HOLD_MS = 1500
const CONTINUOUS_MAJOR_ANNOUNCEMENT_KEYS = new Set([
  'loh_tiebreak_tie',
  'loh_tiebreak_deciding',
  'loh_tiebreak_decision',
])

/**
 * Announcement keys that trigger the cinematic shock intro sequence:
 *   1. Full-screen stinger (ShockIntroOverlay)
 *   2. TV announcement (existing TvAnnouncementOverlay)
 *   3. Info-button spotlight (ConfessionalSpotlightOverlay reused)
 */
const SHOCK_ANNOUNCEMENT_KEYS = new Set([
  'twist',
  'double_eviction',
  'vip_veto',
  'diamond_pov',
  'coup_detat',
  'spotlight_veto',
  'battle_back',
  'battle_back_shock',
  'battle_back_rules',
  'battle_back_challenge',
  'democracia',
  'cupid_arrow',
  'cupid_arrow_broken',
  'tribunal_phase',
])

type QueuedShockAnnouncement = {
  announcement: Announcement
  eventId: string
}

type TvZonePublicSaveReveal = {
  nominees: Player[]
  approvals: Record<string, number>
  savedId: string
  pairs?: CupidArrowPair[]
}

type TvZoneVoteResultsReveal = {
  nominees: VoteTally[]
  evictee?: Player | null
  evicteeIds?: string[]
  onTiebreakerRequired?: (tiedNomineeIds: string[]) => void
  publicTiebreak?: PublicEvictionTiebreakDisplay | null
  onPublicTiebreakResolved?: (evicteeIds: string[]) => void
  onDone: () => void
}

type TvZoneDemocraciaResultsReveal = {
  mode: 'winner' | 'tie' | 'message'
  title: string
  subtitle: string
  participants: Array<{
    player: Player
    voteCount: number
  }>
  onDone: () => void
}

type LiveVoteBackdropMetrics = {
  viewportWidth: number
  viewportHeight: number
  cutout: {
    x: number
    y: number
    w: number
    h: number
  }
}

type TvZoneProps = {
  publicSaveReveal?: TvZonePublicSaveReveal | null
  onPublicSaveDone?: () => void
  voteResultsReveal?: TvZoneVoteResultsReveal | null
  democraciaResultsReveal?: TvZoneDemocraciaResultsReveal | null
  mainLogMaxVisible?: number
  priorityAnnouncement?: Announcement | null
  onPriorityAnnouncementDismiss?: () => void
  externalAnnouncement?: Announcement | null
  onExternalAnnouncementDismiss?: () => void
  /** Fallback text shown in the viewport when no fresh event is available and the screen would otherwise go blank. */
  viewportFallbackMessage?: string
  /** Compact board occupancy chip shown when the roster header yields space to the board. */
  occupancyChip?: {
    label: string
    ariaLabel: string
  } | null
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
export default function TvZone(props: TvZoneProps) {
  const dispatch = useAppDispatch()
  const { onPriorityAnnouncementDismiss, onExternalAnnouncementDismiss } = props
  const gameState = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const doubleEvictionActive = useAppSelector((s) => s.game.doubleEviction?.weekActive ?? false)
  const isGuest = useAppSelector((s: RootState) => s.profiles.isGuest)
  const activeProfileId = useAppSelector((s: RootState) => s.profiles.activeProfileId)
  const hasPendingChallenge = useAppSelector((s: RootState) => s.challenge.pending != null)
  const reduxStore = useStore<RootState>()
  const audioSettings = useAppSelector((s) => s.settings?.audio ?? DEFAULT_SETTINGS.audio)

  // Filter entries for the TV viewport (excludes DR-only events).
  const tvVisibleFeed = useMemo(() => gameState.tvFeed.filter(isVisibleOnTv), [gameState.tvFeed])
  // Filter entries for the main-screen log strip (excludes DR-only events).
  const mainLogFeed = useMemo(() => gameState.tvFeed.filter(isVisibleInMainLog), [gameState.tvFeed])
  const mainLogMaxVisible = props.mainLogMaxVisible ?? 2
  const occupancyChip = props.occupancyChip ?? null

  const latestEvent = tvVisibleFeed[0]
  const announcementPrerollEvent = useMemo(() => {
    const prerollId = latestEvent?.meta?.announcementPrerollEventId
    if (typeof prerollId !== 'string') return null
    return tvVisibleFeed.find((event) => event.id === prerollId) ?? null
  }, [latestEvent, tvVisibleFeed])
  const publicSaveRevealActive = Boolean(props.publicSaveReveal)
  const voteResultsRevealActive = Boolean(props.voteResultsReveal)
  const democraciaResultsRevealActive = Boolean(props.democraciaResultsReveal)
  const priorityAnnouncement = props.priorityAnnouncement ?? null
  const externalAnnouncement = props.externalAnnouncement ?? null

  // ── Development logging ─────────────────────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('TvZone latestEvent:', latestEvent)
    }
  }, [latestEvent])

  // ── Announcement state ──────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  // Keep the modal key alive independently so the modal stays open even if
  // the overlay dismisses (e.g. via auto-dismiss) while the user is reading.
  const [modalAnnouncementKey, setModalAnnouncementKey] = useState<string | null>(null)
  // Track which event the user has manually dismissed so the overlay doesn't
  // reappear for the same event after dismissal.
  const [dismissedEventId, setDismissedEventId] = useState<string | null>(null)
  // Track which phase was dismissed to avoid re-showing within the same phase.
  const [dismissedPhase, setDismissedPhase] = useState<Phase | null>(null)
  // Phase-triggered announcement (set on phase transition, cleared on dismiss or non-popup phase).
  const [phaseAnnouncement, setPhaseAnnouncement] = useState<Announcement | null>(null)
  // Brief post-dismiss text fade (POST_DISMISS_FADE_MS) to avoid jarring text transitions.
  const [postDismissBlocked, setPostDismissBlocked] = useState(false)
  // Short-lived TV spotlight effect for Double Eviction special announcements.
  const [deSpotlightActive, setDeSpotlightActive] = useState(false)
  const [saveStatus, setSaveStatus] = useState<null | 'saved' | 'error'>(null)
  // Save feedback dialog — shows a mobile-friendly confirmation after save.
  const [saveFeedbackOpen, setSaveFeedbackOpen] = useState(false)
  const [saveFeedbackIsError, setSaveFeedbackIsError] = useState(false)
  const [detoxMessageQueue, setDetoxMessageQueue] = useState<TvEvent[]>([])
  const [detoxMessageIndex, setDetoxMessageIndex] = useState(0)
  // A single reducer action can append the shock activation and its practical
  // consequence (for example a Force Majeure replacement) at once. Keep the
  // shock broadcast in a small FIFO so the consequence never hides its stinger.
  const [shockAnnouncementQueue, setShockAnnouncementQueue] = useState<QueuedShockAnnouncement[]>(
    []
  )
  const dismissBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deSpotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detoxMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detoxSequenceLatestIdRef = useRef<string | null>(null)
  const shockSequenceLatestIdRef = useRef<string | null>(null)
  const seenShockEventIdsRef = useRef(new Set<string>())
  // Tracks the previous phase to detect phase transitions.
  const previousPhaseRef = useRef<Phase | null>(null)
  // Stable ref so phase-transition effect always reads the latest latestEvent.
  const latestEventRef = useRef(latestEvent)
  // Update the ref after each render so the phase-transition effect always has
  // the freshest value without needing latestEvent in its own dependency array.
  const tvZoneRef = useRef<HTMLElement | null>(null)
  const liveVoteBackdropMaskId = useId().replace(/:/g, '-') + '-live-vote-mask'
  const [liveVoteBackdropMetrics, setLiveVoteBackdropMetrics] =
    useState<LiveVoteBackdropMetrics | null>(null)

  useLayoutEffect(() => {
    latestEventRef.current = latestEvent
  })

  useLayoutEffect(() => {
    if (!voteResultsRevealActive) return

    const updateBackdropMetrics = () => {
      const zone = tvZoneRef.current
      if (!zone || typeof window === 'undefined') return

      const rect = zone.getBoundingClientRect()
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth || Math.ceil(rect.right)
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || Math.ceil(rect.bottom)

      setLiveVoteBackdropMetrics({
        viewportWidth,
        viewportHeight,
        cutout: {
          x: rect.left - LIVE_VOTE_CUTOUT_PADDING,
          y: rect.top - LIVE_VOTE_CUTOUT_PADDING,
          w: rect.width + LIVE_VOTE_CUTOUT_PADDING * 2,
          h: rect.height + LIVE_VOTE_CUTOUT_PADDING * 2,
        },
      })
    }

    updateBackdropMetrics()
    const handleViewportChange = () => updateBackdropMetrics()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleViewportChange) : null
    if (observer && tvZoneRef.current) observer.observe(tvZoneRef.current)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      observer?.disconnect()
    }
  }, [voteResultsRevealActive])

  const activeDetoxEvent = detoxMessageQueue[detoxMessageIndex]
  const displayedEvent = activeDetoxEvent ?? latestEvent
  const detoxMessageActive = Boolean(activeDetoxEvent)

  // ── Shock announcement sequence state ────────────────────────────────────────
  // Phase A: full-screen shock stinger (ShockIntroOverlay).
  const [shockIntroActive, setShockIntroActive] = useState(false)
  // Phase C: info-button spotlight (ConfessionalSpotlightOverlay reused).
  const [shockInfoSpotlightActive, setShockInfoSpotlightActive] = useState(false)
  // Ref forwarded to the TvAnnouncementOverlay info button for spotlight targeting.
  const announcementInfoButtonRef = useRef<HTMLButtonElement | null>(null)
  // The end of Cupid's Arrow is a season climax, not an ordinary feed item.
  // Keep an explicit broadcast alive so a Confessional prompt or phase card
  // cannot bury the full-screen dissociation sequence.
  const [cupidBreakAnnouncement, setCupidBreakAnnouncement] = useState<Announcement | null>(null)
  const previousCupidStatusRef = useRef(gameState.cupidArrow?.status ?? 'inactive')

  useEffect(() => {
    const previousStatus = previousCupidStatusRef.current
    const nextStatus = gameState.cupidArrow?.status ?? 'inactive'
    previousCupidStatusRef.current = nextStatus

    if (previousStatus === 'active' && nextStatus === 'broken') {
      startTransition(() => {
        setCupidBreakAnnouncement(
          buildAnnouncement('cupid_arrow_broken', {
            id: `cupid-arrow-break-${Date.now()}`,
            text: "Cupid's Arrow has ended.",
            type: 'twist',
            timestamp: Date.now(),
            meta: { major: 'cupid_arrow_broken' },
          })
        )
      })
    } else if (nextStatus !== 'broken') {
      startTransition(() => setCupidBreakAnnouncement(null))
    }
  }, [gameState.cupidArrow?.status])

  // ── Phase-transition announcement detection ──────────────────────────────────
  // Fires whenever the game phase or alive-player count changes.
  // Also allows an in-place upgrade for nomination-phase overlays when
  // Double Eviction activates after the phase has already been entered.
  useEffect(() => {
    const currentPhase = gameState.phase
    const prevPhase = previousPhaseRef.current
    previousPhaseRef.current = currentPhase
    const democraciaPreVoteActive =
      currentPhase === 'loh_comp_announcement' && gameState.democracia?.active === true
    const key = democraciaPreVoteActive
      ? 'democracia'
      : getPhaseAnnouncementKey(currentPhase, alivePlayers.length, doubleEvictionActive)
    const keyChangedInPlace =
      prevPhase === currentPhase &&
      phaseAnnouncement?.key !== null &&
      phaseAnnouncement?.key !== undefined &&
      phaseAnnouncement?.key !== key

    // Skip on initial mount (no previous phase) and when phase/key haven't changed.
    if (prevPhase === null || (prevPhase === currentPhase && !keyChangedInPlace)) return
    const ev = latestEventRef.current
    // Batch all state updates as a non-urgent transition (satisfies react-hooks/set-state-in-effect
    // by deferring setState calls into a callback rather than calling them synchronously).
    startTransition(() => {
      if (key && (currentPhase !== dismissedPhase || keyChangedInPlace)) {
        const stub: TvEvent = {
          id: 'phase-transition-stub',
          text: '',
          type: 'game',
          timestamp: Date.now(),
        }
        setPhaseAnnouncement(buildAnnouncement(key, ev ?? stub))
        // Suppress any concurrent event-based popup with the same key to prevent duplication.
        if (ev && extractMajorKey(ev) === key) {
          setDismissedEventId(ev.id)
        }
      } else {
        // Entering a non-popup phase: clear any stale phase announcement.
        // Also clear the dismissed guard so the same phase can show its popup again in a later week.
        if (dismissedPhase && currentPhase !== dismissedPhase) {
          setDismissedPhase(null)
        }
        setPhaseAnnouncement(null)
      }
    })
  }, [
    gameState.phase,
    gameState.democracia?.active,
    alivePlayers.length,
    dismissedPhase,
    doubleEvictionActive,
    phaseAnnouncement?.key,
  ])

  // Event-based announcement: only explicit meta.major / ev.major (no text heuristics).
  const eventAnnouncement = useMemo<Announcement | null>(() => {
    const announcementEvent = announcementPrerollEvent ?? latestEvent
    if (!announcementEvent) return null
    if (announcementEvent.id === dismissedEventId) return null
    const majorKey = extractMajorKey(announcementEvent)
    return majorKey ? buildAnnouncement(majorKey, announcementEvent) : null
  }, [announcementPrerollEvent, latestEvent, dismissedEventId])
  const eventAnnouncementSource = announcementPrerollEvent ?? latestEvent

  // Capture shock events that are no longer the latest feed item by the time
  // React renders. This is common when a special veto immediately creates a
  // replacement-nominee event in the same state update.
  useEffect(() => {
    const latestVisibleId = tvVisibleFeed[0]?.id ?? null
    const previousLatestId = shockSequenceLatestIdRef.current
    shockSequenceLatestIdRef.current = latestVisibleId

    if (previousLatestId === null || latestVisibleId === previousLatestId) {
      if (previousLatestId === null && latestVisibleId) {
        const initialKey = extractMajorKey(tvVisibleFeed[0])
        if (initialKey && SHOCK_ANNOUNCEMENT_KEYS.has(initialKey)) {
          seenShockEventIdsRef.current.add(latestVisibleId)
        }
      }
      return
    }

    const previousIndex = tvVisibleFeed.findIndex((event) => event.id === previousLatestId)
    const newEventCount = previousIndex === -1 ? 1 : previousIndex
    const newEvents = tvVisibleFeed.slice(0, newEventCount)
    const queued = [...newEvents].reverse().flatMap((event) => {
      const key = extractMajorKey(event)
      if (!key || !SHOCK_ANNOUNCEMENT_KEYS.has(key)) return []
      if (seenShockEventIdsRef.current.has(event.id)) return []
      seenShockEventIdsRef.current.add(event.id)

      // The top event is already visible through the normal event path.
      // Queue only a shock that was immediately followed by another event.
      if (event.id === latestVisibleId) return []
      return [{ announcement: buildAnnouncement(key, event), eventId: event.id }]
    })

    if (queued.length === 0) return
    startTransition(() => {
      setShockAnnouncementQueue((current) => [...current, ...queued])
    })
  }, [tvVisibleFeed])

  // The core game phase remains jury while the post-finale sequence plays.
  // Replace its stale Tribunal Votes card with the resolved winner on the
  // main screen, through the interview and Public Favorite handoff.
  const winnerBroadcast = useMemo(() => {
    const finale = gameState.seasonFinale
    if (!finale || !['winnerInterview', 'publicFavoriteSetup'].includes(finale.phase)) return null

    return gameState.players.find((player) => player.id === finale.winnerId) ?? null
  }, [gameState.players, gameState.seasonFinale])

  const eventAnnouncementHasShockPriority =
    eventAnnouncement != null && SHOCK_ANNOUNCEMENT_KEYS.has(eventAnnouncement.key)
  const queuedShockAnnouncement = shockAnnouncementQueue[0] ?? null

  // A shock event must finish its fullscreen → Faux TV → info spotlight sequence
  // before a simultaneous phase card (for example the first LOH competition)
  // is allowed to take over the TV.
  const activeAnnouncement =
    cupidBreakAnnouncement ??
    queuedShockAnnouncement?.announcement ??
    (eventAnnouncementHasShockPriority ? eventAnnouncement : null) ??
    priorityAnnouncement ??
    externalAnnouncement ??
    phaseAnnouncement ??
    eventAnnouncement
  const activeAnnouncementSequenceId =
    queuedShockAnnouncement?.eventId ??
    (activeAnnouncement === eventAnnouncement ? eventAnnouncementSource?.id : null) ??
    activeAnnouncement?.key ??
    ''
  const isShockAnnouncement =
    activeAnnouncement != null && SHOCK_ANNOUNCEMENT_KEYS.has(activeAnnouncement.key)
  const showInlineAnnouncement =
    winnerBroadcast == null &&
    activeAnnouncement != null &&
    !(shockIntroActive && isShockAnnouncement)
  const showOccupancyChip =
    occupancyChip != null && !showInlineAnnouncement && winnerBroadcast == null
  const suppressStaleLiveVotePitchMessage =
    displayedEvent?.meta?.key === LIVE_VOTE_PITCHES_EVENT_KEY && gameState.phase !== 'social_2'
  const hasFallbackViewportMessage = Boolean(props.viewportFallbackMessage)
  const hideViewportMessage =
    (postDismissBlocked && !hasFallbackViewportMessage) ||
    (suppressStaleLiveVotePitchMessage && !hasFallbackViewportMessage) ||
    !!activeAnnouncement ||
    winnerBroadcast != null ||
    publicSaveRevealActive ||
    voteResultsRevealActive ||
    democraciaResultsRevealActive
  // When the stale pitch message is suppressed but a fallback is available, use the
  // fallback instead of the suppressed event text so the viewport stays meaningful.
  const viewportDisplayText =
    suppressStaleLiveVotePitchMessage && hasFallbackViewportMessage
      ? props.viewportFallbackMessage
      : (displayedEvent?.text ??
        props.viewportFallbackMessage ??
        'Welcome to The Big Eye – AI Edition 🏠')
  const baseViewportMessageKey = getViewportMessageKey(displayedEvent)
  const viewportMessageKey = detoxMessageActive
    ? `${baseViewportMessageKey}-${detoxMessageIndex}`
    : baseViewportMessageKey
  let mainTvMessage: string | undefined
  if (winnerBroadcast) {
    mainTvMessage = winnerBroadcast.name + ' wins The Big Eye'
  } else if (activeAnnouncement) {
    mainTvMessage = activeAnnouncement.title
  } else if (suppressStaleLiveVotePitchMessage) {
    mainTvMessage = hasFallbackViewportMessage ? props.viewportFallbackMessage : undefined
  } else {
    mainTvMessage = displayedEvent?.text
  }

  useEffect(() => {
    const latestVisibleId = tvVisibleFeed[0]?.id ?? null
    const previousLatestId = detoxSequenceLatestIdRef.current
    detoxSequenceLatestIdRef.current = latestVisibleId

    if (previousLatestId === null || latestVisibleId === previousLatestId) return

    const previousIndex = tvVisibleFeed.findIndex((event) => event.id === previousLatestId)
    const newEventCount = previousIndex === -1 ? 1 : previousIndex
    const newEvents = tvVisibleFeed.slice(0, newEventCount)
    const detoxEvents = newEvents.filter(isDetoxSequenceEvent)
    if (detoxEvents.length === 0) return

    startTransition(() => {
      setDetoxMessageQueue(detoxEvents.reverse())
      setDetoxMessageIndex(0)
    })
  }, [tvVisibleFeed])

  useEffect(() => {
    if (detoxMessageTimerRef.current !== null) {
      clearTimeout(detoxMessageTimerRef.current)
      detoxMessageTimerRef.current = null
    }
    if (detoxMessageQueue.length === 0) return

    detoxMessageTimerRef.current = setTimeout(() => {
      startTransition(() => {
        if (detoxMessageIndex < detoxMessageQueue.length - 1) {
          setDetoxMessageIndex((index) => index + 1)
        } else {
          setDetoxMessageQueue([])
          setDetoxMessageIndex(0)
        }
      })
      detoxMessageTimerRef.current = null
    }, DETOX_MESSAGE_HOLD_MS)

    return () => {
      if (detoxMessageTimerRef.current !== null) {
        clearTimeout(detoxMessageTimerRef.current)
        detoxMessageTimerRef.current = null
      }
    }
  }, [detoxMessageIndex, detoxMessageQueue])

  const handleDismiss = useCallback(() => {
    const currentAnnouncement = activeAnnouncement
    const skipPostDismissFade =
      currentAnnouncement != null && CONTINUOUS_MAJOR_ANNOUNCEMENT_KEYS.has(currentAnnouncement.key)
    if (cupidBreakAnnouncement) {
      setCupidBreakAnnouncement(null)
    } else if (queuedShockAnnouncement) {
      setDismissedEventId(queuedShockAnnouncement.eventId)
      setShockAnnouncementQueue((queue) => queue.slice(1))
    } else if (priorityAnnouncement) {
      onPriorityAnnouncementDismiss?.()
    } else if (externalAnnouncement) {
      // External announcements are used as one-off pre-roll overlays (e.g. ad
      // break copy) for the *current* phase. If an internal phase/event
      // announcement was queued behind the same render, clear it too so the TV
      // does not immediately show a second overlay after the break message.
      if (phaseAnnouncement) {
        setDismissedPhase(gameState.phase)
        setPhaseAnnouncement(null)
      } else if (eventAnnouncementSource) {
        setDismissedEventId(eventAnnouncementSource.id)
      }
      onExternalAnnouncementDismiss?.()
    } else if (eventAnnouncementHasShockPriority && eventAnnouncementSource) {
      setDismissedEventId(eventAnnouncementSource.id)
    } else if (phaseAnnouncement) {
      setDismissedPhase(gameState.phase)
      setPhaseAnnouncement(null)
    } else if (eventAnnouncementSource) {
      setDismissedEventId(eventAnnouncementSource.id)
    }
    if (skipPostDismissFade) {
      setPostDismissBlocked(false)
      if (dismissBlockTimerRef.current !== null) {
        clearTimeout(dismissBlockTimerRef.current)
        dismissBlockTimerRef.current = null
      }
      return
    }
    setPostDismissBlocked(true)
    if (dismissBlockTimerRef.current !== null) clearTimeout(dismissBlockTimerRef.current)
    dismissBlockTimerRef.current = setTimeout(
      () => setPostDismissBlocked(false),
      POST_DISMISS_FADE_MS
    )
  }, [
    activeAnnouncement,
    cupidBreakAnnouncement,
    queuedShockAnnouncement,
    priorityAnnouncement,
    externalAnnouncement,
    eventAnnouncementHasShockPriority,
    eventAnnouncementSource,
    phaseAnnouncement,
    gameState.phase,
    onPriorityAnnouncementDismiss,
    onExternalAnnouncementDismiss,
  ])

  // Cleanup post-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissBlockTimerRef.current !== null) clearTimeout(dismissBlockTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) clearTimeout(saveStatusTimerRef.current)
    }
  }, [])

  // Play a short TV-only spotlight intro for Double Eviction announcements,
  // then return the surrounding UI to normal while keeping the announcement visible.
  useEffect(() => {
    const isSpecialAnnouncement =
      activeAnnouncement?.key === 'double_eviction' ||
      activeAnnouncement?.key === 'vip_veto' ||
      activeAnnouncement?.key === 'diamond_pov' ||
      activeAnnouncement?.key === 'coup_detat' ||
      activeAnnouncement?.key === 'spotlight_veto'

    if (!isSpecialAnnouncement || !showInlineAnnouncement) {
      startTransition(() => {
        setDeSpotlightActive(false)
      })
      if (deSpotlightTimerRef.current !== null) {
        clearTimeout(deSpotlightTimerRef.current)
        deSpotlightTimerRef.current = null
      }
      return
    }

    startTransition(() => {
      setDeSpotlightActive(true)
    })
    if (deSpotlightTimerRef.current !== null) clearTimeout(deSpotlightTimerRef.current)
    deSpotlightTimerRef.current = setTimeout(() => {
      startTransition(() => {
        setDeSpotlightActive(false)
      })
      deSpotlightTimerRef.current = null
    }, DOUBLE_EVICTION_SPOTLIGHT_MS)

    return () => {
      if (deSpotlightTimerRef.current !== null) {
        clearTimeout(deSpotlightTimerRef.current)
        deSpotlightTimerRef.current = null
      }
    }
  }, [activeAnnouncement?.key, showInlineAnnouncement])

  // ── Shock intro sequence ──────────────────────────────────────────────────────
  // Fires whenever the active announcement key changes.
  // - Shock key  → start the stinger (phase A); spotlight cleared.
  // - Non-shock  → clear both phases (handles dismissal mid-sequence).
  useEffect(() => {
    const key = activeAnnouncement?.key ?? null
    const isShock = key !== null && SHOCK_ANNOUNCEMENT_KEYS.has(key)
    startTransition(() => {
      if (isShock) {
        setShockIntroActive(true)
        setShockInfoSpotlightActive(false)
      } else {
        setShockIntroActive(false)
        setShockInfoSpotlightActive(false)
      }
    })
  }, [activeAnnouncementSequenceId, activeAnnouncement?.key])

  const handleShockIntroComplete = useCallback(() => {
    startTransition(() => {
      setShockIntroActive(false)
      setShockInfoSpotlightActive(true)
    })
  }, [])

  const handleShockSpotlightComplete = useCallback(() => {
    startTransition(() => setShockInfoSpotlightActive(false))
  }, [])

  // When the user opens the info modal during the spotlight, complete the spotlight cleanly.
  const handleInfo = useCallback(() => {
    if (shockInfoSpotlightActive) {
      startTransition(() => setShockInfoSpotlightActive(false))
    }
    if (activeAnnouncement) {
      setModalAnnouncementKey(activeAnnouncement.key)
      setModalOpen(true)
    }
  }, [activeAnnouncement, shockInfoSpotlightActive])

  // Listen for central FAB 'tv:announcement-dismiss' events
  useEffect(() => {
    const handler = () => handleDismiss()
    window.addEventListener('tv:announcement-dismiss', handler)
    return () => window.removeEventListener('tv:announcement-dismiss', handler)
  }, [handleDismiss])

  // The Cupid-break broadcast is deliberately persistent through its full
  // cinematic and TV handoff. Once the player presses Play, clear that one
  // card so the next Safety/shock announcement can take the screen.
  useEffect(() => {
    const handlePlay = () => {
      if (cupidBreakAnnouncement) handleDismiss()
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => window.removeEventListener('ui:playPressed', handlePlay)
  }, [cupidBreakAnnouncement, handleDismiss])

  const handleModalClose = useCallback(() => setModalOpen(false), [])

  // ── Shock danger-mode body classes ───────────────────────────────────────────
  // body--shock-active: applied for the full shock pipeline duration, shifts the
  //   app theme from purple to dark-red danger mode.
  // app--shock-shake: added briefly at stinger start on <html> to drive the
  //   CSS shake animation on .game-screen-shell; removed after 600 ms (longer
  //   than the 480 ms animation so the class is always present for the full shake).
  const shockShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cupidShockKey =
    activeAnnouncement?.key === 'cupid_arrow' || activeAnnouncement?.key === 'cupid_arrow_broken'

  useEffect(() => {
    const shockSequenceActive = shockIntroActive || shockInfoSpotlightActive || detoxMessageActive
    if (shockSequenceActive && cupidShockKey) {
      document.body.classList.add('body--cupid-shock')
      document.body.classList.remove('body--shock-active')
    } else if (shockSequenceActive) {
      document.body.classList.add('body--shock-active')
      document.body.classList.remove('body--cupid-shock')
    } else {
      document.body.classList.remove('body--shock-active')
      document.body.classList.remove('body--cupid-shock')
    }
    return () => {
      document.body.classList.remove('body--shock-active')
      document.body.classList.remove('body--cupid-shock')
    }
  }, [cupidShockKey, shockIntroActive, shockInfoSpotlightActive, detoxMessageActive])

  useEffect(() => {
    if (!shockIntroActive) return
    // Add shake class; animation is 480 ms — remove after 600 ms.
    document.documentElement.classList.add('app--shock-shake')
    if (shockShakeTimerRef.current !== null) clearTimeout(shockShakeTimerRef.current)
    shockShakeTimerRef.current = setTimeout(() => {
      document.documentElement.classList.remove('app--shock-shake')
      shockShakeTimerRef.current = null
    }, 600)
  }, [shockIntroActive])

  // Clean up shake class and danger mode on unmount.
  useEffect(() => {
    return () => {
      if (shockShakeTimerRef.current !== null) clearTimeout(shockShakeTimerRef.current)
      if (detoxMessageTimerRef.current !== null) clearTimeout(detoxMessageTimerRef.current)
      document.documentElement.classList.remove('app--shock-shake')
      document.body.classList.remove('body--shock-active')
      document.body.classList.remove('body--cupid-shock')
    }
  }, [])

  const phaseLabel = formatPhaseLabel(gameState.phase)
  const isAtGameStart = gameState.week === 1 && gameState.phase === 'week_start'
  const canSave = !isGuest && Boolean(activeProfileId) && !isAtGameStart && !hasPendingChallenge
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
              : 'Save game'
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
              : 'Save game'

  // Distinguish the double-eviction spotlight from the live-vote focus state.
  const isDeSpotlight = deSpotlightActive
  const isLiveVoteFocus = voteResultsRevealActive

  const handleSave = useCallback(() => {
    if (!canSave || !activeProfileId) return

    const currentState = reduxStore.getState()
    const key = savedStateKeyForProfile(activeProfileId)
    const ok = saveSeasonSnapshot(key, {
      version: 1,
      profileId: activeProfileId,
      savedAt: new Date().toISOString(),
      game: currentState.game,
      finale: currentState.finale,
      social: currentState.social,
    })
    setSaveStatus(ok ? 'saved' : 'error')
    setSaveFeedbackIsError(!ok)
    setSaveFeedbackOpen(true)

    if (saveStatusTimerRef.current !== null) clearTimeout(saveStatusTimerRef.current)
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
  }, [activeProfileId, canSave, reduxStore])

  return (
    <section
      className={[
        'tv-zone',
        isDeSpotlight ? 'tv-zone--de-spotlight' : '',
        isLiveVoteFocus ? 'tv-zone--live-vote-focus' : '',
        detoxMessageActive ? 'tv-zone--detox-stream' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={tvZoneRef}
      aria-label="Game action zone"
      style={{ '--de-spotlight-ms': `${DOUBLE_EVICTION_SPOTLIGHT_MS}ms` } as CSSProperties}
    >
      {/* ── Double Eviction spotlight backdrop (portal to body) ──────────── */}
      {isDeSpotlight &&
        createPortal(<div className="tv-zone-de-backdrop" aria-hidden="true" />, document.body)}
      {isLiveVoteFocus &&
        liveVoteBackdropMetrics &&
        createPortal(
          <div className="tv-zone-live-vote-backdrop" aria-hidden="true">
            <svg
              className="tv-zone-live-vote-backdrop__svg"
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${liveVoteBackdropMetrics.viewportWidth} ${liveVoteBackdropMetrics.viewportHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <mask
                  id={liveVoteBackdropMaskId}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x={0}
                    y={0}
                    width={liveVoteBackdropMetrics.viewportWidth}
                    height={liveVoteBackdropMetrics.viewportHeight}
                    fill="white"
                  />
                  <rect
                    x={liveVoteBackdropMetrics.cutout.x}
                    y={liveVoteBackdropMetrics.cutout.y}
                    width={liveVoteBackdropMetrics.cutout.w}
                    height={liveVoteBackdropMetrics.cutout.h}
                    rx={LIVE_VOTE_CUTOUT_RADIUS}
                    ry={LIVE_VOTE_CUTOUT_RADIUS}
                    fill="black"
                  />
                </mask>
                <linearGradient id={`${liveVoteBackdropMaskId}-shade`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#030812" stopOpacity="0.38" />
                  <stop offset="100%" stopColor="#02060c" stopOpacity="0.56" />
                </linearGradient>
                <radialGradient id={`${liveVoteBackdropMaskId}-glow`} cx="50%" cy="34%" r="70%">
                  <stop offset="0%" stopColor="#78a8ff" stopOpacity="0.08" />
                  <stop offset="16%" stopColor="#78a8ff" stopOpacity="0.04" />
                  <stop offset="30%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect
                x={0}
                y={0}
                width={liveVoteBackdropMetrics.viewportWidth}
                height={liveVoteBackdropMetrics.viewportHeight}
                fill={`url(#${liveVoteBackdropMaskId}-glow)`}
                mask={`url(#${liveVoteBackdropMaskId})`}
              />
              <rect
                x={0}
                y={0}
                width={liveVoteBackdropMetrics.viewportWidth}
                height={liveVoteBackdropMetrics.viewportHeight}
                fill={`url(#${liveVoteBackdropMaskId}-shade)`}
                mask={`url(#${liveVoteBackdropMaskId})`}
              />
            </svg>
          </div>,
          document.body
        )}

      {/* ── Head bar ────────────────────────────────────────────────────── */}
      <div className="tv-zone__head">
        {/* Left: pinned phase chip */}
        <div className="tv-zone__head-phase">
          <GameTopChip label={phaseLabel} tone="accent" className="tv-zone__head-chip" />
        </div>

        {/* Center: scrollable single-row status chips */}
        <ul className="tv-zone__head-pills" aria-label="Game status chips">
          <li>
            <GameTopChip
              label={formatCycleLabel(gameState.week)}
              ariaLabel={formatCycleAriaLabel(gameState.season, gameState.week)}
              tone="neutral"
              className="tv-zone__head-chip"
            />
          </li>
        </ul>

        <div className="tv-zone__head-actions">
          {gameState.isLive && (
            <span className="tv-zone__live-badge" aria-live="polite">
              LIVE
            </span>
          )}
          {/* Alive/total moved to the Housemates occupancy chip so this header can host direct audio toggles. */}
          <TopUtilityButton
            icon="music"
            ariaLabel="Music"
            pressed={audioSettings.musicOn}
            title={audioSettings.musicOn ? 'Music on' : 'Music off'}
            onClick={() => dispatch(setAudio({ musicOn: !audioSettings.musicOn }))}
          />
          <TopUtilityButton
            icon="sound"
            ariaLabel="Sound effects"
            pressed={audioSettings.sfxOn}
            title={audioSettings.sfxOn ? 'Sound effects on' : 'Sound effects off'}
            onClick={() => dispatch(setAudio({ sfxOn: !audioSettings.sfxOn }))}
          />
          <TopUtilityButton
            icon="save"
            ariaLabel={saveChipAriaLabel}
            title={saveChipTitle}
            onClick={handleSave}
            disabled={!canSave}
          />
        </div>
      </div>

      {/* ── Bezel + Viewport ────────────────────────────────────────────────── */}
      <div className="tv-zone__bezel">
        <div className="tv-zone__bezel-frame">
          {showOccupancyChip && (
            <span className="tv-zone__occupancy-chip" aria-label={occupancyChip.ariaLabel}>
              {occupancyChip.label}
            </span>
          )}

          <div
            className="tv-zone__viewport"
            role="region"
            aria-label="Live game events display"
            aria-live="polite"
            aria-atomic="true"
          >
            <p
              key={viewportMessageKey}
              aria-hidden={hideViewportMessage}
              className={[
                'tv-zone__now',
                detoxMessageActive ? 'tv-zone__now--detox-stream' : '',
                hideViewportMessage ? 'tv-zone__now--hidden' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={hideViewportMessage ? { opacity: 0 } : undefined}
            >
              {viewportDisplayText}
            </p>

            {/* Twist badge — broadcast-style corner ribbon anchored to the viewport */}
            {gameState.twistActive && (
              <div className="tv-zone__twist-badge" aria-hidden="true">
                <span>🌀</span>
                SHOCK
              </div>
            )}

            {winnerBroadcast && (
              <div className="tv-zone__winner-broadcast" role="status" aria-live="polite">
                <div className="tv-zone__winner-sparkles" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="tv-zone__winner-kicker">Final verdict</span>
                <strong className="tv-zone__winner-name">{winnerBroadcast.name}</strong>
                <span className="tv-zone__winner-copy">wins The Big Eye</span>
                <span className="tv-zone__winner-footer">The Tribunal has spoken</span>
              </div>
            )}

            {/* Inline announcement overlay */}
            {showInlineAnnouncement && activeAnnouncement && (
              <TvAnnouncementOverlay
                key={activeAnnouncement.key}
                announcement={activeAnnouncement}
                onInfo={handleInfo}
                onDismiss={handleDismiss}
                paused={modalOpen}
                infoButtonRef={announcementInfoButtonRef}
              />
            )}

            {props.publicSaveReveal && (
              <PublicSaveReveal
                nominees={props.publicSaveReveal.nominees}
                approvals={props.publicSaveReveal.approvals}
                savedId={props.publicSaveReveal.savedId}
                pairs={props.publicSaveReveal.pairs}
                onDone={props.onPublicSaveDone ?? NOOP}
              />
            )}

            {props.democraciaResultsReveal && (
              <DemocraciaResultsReveal
                mode={props.democraciaResultsReveal.mode}
                title={props.democraciaResultsReveal.title}
                subtitle={props.democraciaResultsReveal.subtitle}
                participants={props.democraciaResultsReveal.participants}
                onDone={props.democraciaResultsReveal.onDone}
              />
            )}
            {props.voteResultsReveal && (
              <AnimatedVoteResultsModal
                nominees={props.voteResultsReveal.nominees}
                evictee={props.voteResultsReveal.evictee}
                evicteeIds={props.voteResultsReveal.evicteeIds}
                onTiebreakerRequired={props.voteResultsReveal.onTiebreakerRequired}
                publicTiebreak={props.voteResultsReveal.publicTiebreak}
                onPublicTiebreakResolved={props.voteResultsReveal.onPublicTiebreakResolved}
                onDone={props.voteResultsReveal.onDone}
                variant="tv"
                countdownMs={3000}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Event log (TVLog with duplicate suppression, compact two-line mobile feed) ──── */}
      <TVLog
        entries={mainLogFeed}
        mainTVMessage={mainTvMessage}
        maxVisible={mainLogMaxVisible}
        mobileTwoLineMode={mainLogMaxVisible <= 2}
        inlineVisible={mainLogMaxVisible > 0}
      />

      {/* ── Phase-info modal ─────────────────────────────────────────────── */}
      {modalAnnouncementKey && (
        <TvAnnouncementModal
          announcementKey={modalAnnouncementKey}
          open={modalOpen}
          onClose={handleModalClose}
        />
      )}

      {/* ── Shock announcement sequence ───────────────────────────────────── */}
      {/* Phase A: full-screen cinematic stinger */}
      <ShockIntroOverlay
        key={activeAnnouncementSequenceId}
        active={shockIntroActive}
        shockKey={activeAnnouncement?.key ?? ''}
        announcement={activeAnnouncement}
        cupidPairs={gameState.cupidArrow?.pairs ?? []}
        onComplete={handleShockIntroComplete}
      />
      {/* Phase C: info-button spotlight — reuses the same visual language as the
           confessional prompt spotlight. The target ref is forwarded to the ℹ️
           button inside TvAnnouncementOverlay. */}
      <ConfessionalSpotlightOverlay
        active={shockInfoSpotlightActive}
        targetRef={announcementInfoButtonRef}
        onComplete={handleShockSpotlightComplete}
      />

      {/* ── Save feedback dialog ──────────────────────────────────────────── */}
      <ConfirmExitModal
        open={saveFeedbackOpen}
        title={saveFeedbackIsError ? 'Save failed' : 'Saved'}
        description={
          saveFeedbackIsError ? 'Please try again.' : 'Your season is ready to resume later.'
        }
        confirmLabel="OK"
        showCancel={false}
        onConfirm={() => setSaveFeedbackOpen(false)}
        onCancel={() => setSaveFeedbackOpen(false)}
      />
    </section>
  )
}
