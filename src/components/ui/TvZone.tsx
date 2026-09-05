import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  startTransition,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { BroadcastOverride, CupidArrowPair, Phase, Player } from '../../types'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  consumeBroadcastEvent,
  finishCupidArrowVisualReturn,
  revealCupidArrowVisuals,
  selectAlivePlayers,
  syncPhaseBroadcasts,
} from '../../store/gameSlice'
import { createSavedSeasonSnapshot, saveRunSnapshot } from '../../store/saveStatePersistence'
import { DEFAULT_SETTINGS, setAudio } from '../../store/settingsSlice'
import { setMusicMix } from '../../store/uiSlice'
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
import {
  calculateEvictionVoteRevealIntervalMs,
  EVICTION_PUBLIC_ESTIMATE_STEPS,
  getEvictionVotingAudioDurationMs,
} from '../../services/sound/publicVotingAudioTiming'
import PublicSaveReveal from '../PublicSaveReveal/PublicSaveReveal'
import { isVisibleInMainLog, isVisibleOnTv } from '../../services/activityService'
import type { TvEvent } from '../../types'
import TopUtilityButton from '../TopUtilityButton/TopUtilityButton'
import { getViewportMessageKey } from './tvZoneKeys'
import {
  getTvPresentationBroadcastLevel,
  isCurrentPhaseBroadcastEvent,
} from './tvZoneBroadcastGuards'
import { getPhaseCardTemplate } from '../../broadcasting/broadcastTemplateCatalog'
import { getDailyAtmosphere, getDailyTransitionTitle } from '../../broadcasting/dailyMoodSystem'
import {
  formatCycleAriaLabel,
  formatCycleLabel,
  formatSurveyevalCycleLabel,
  formatPhaseLabel,
} from '../../utils/gameStatusLanguage'
import ShockIntroOverlay from './ShockIntroOverlay/ShockIntroOverlay'
import ConfessionalSpotlightOverlay from '../FloatingActionBar/ConfessionalSpotlightOverlay'
import DemocraciaResultsReveal from './DemocraciaResultsReveal/DemocraciaResultsReveal'
import VoxAudiencePulseReveal, {
  type VoxAudiencePulseExit,
} from '../VoxAudiencePulseReveal/VoxAudiencePulseReveal'
import './TvZone.css'
import './TvZoneEnhancements.css'
import './ShockDangerMode.css'
import {
  decorateDepressionShockFauxTvText,
  getDepressionShockVisualSnapshot,
  subscribeDepressionShockVisualPhase,
  type DepressionShockVisualPhase,
} from '../../features/twists/depressionShock'

const NOOP = () => {}
const normalizeHubCopy = (value: string) =>
  value
    .replace(/\bhousemates\b/gi, 'players')
    .replace(/\bhouseguests\b/gi, 'players')
    .replace(/\bhousemate\b/gi, 'player')
    .replace(/\bhouseguest\b/gi, 'player')
    .replace(/\bBig Brother\b/gi, 'The Big Eye')
    .replace(/\bPower of Veto\b/gi, 'Power of Safety')
    .replace(/\bveto\b/gi, 'Safety')
    .replace(/\bjury\b/gi, 'Tribunal')
    .replace(/\bjurors\b/gi, 'Tribunal members')
    .replace(/\bjuror\b/gi, 'Tribunal member')
    .replace(/\btwist\b/gi, 'shock')
    .replace(/\bhouse\b/gi, 'hub')
const normalizeAnnouncementCopy = (announcement: Announcement | null): Announcement | null =>
  announcement
    ? {
        ...announcement,
        title: normalizeHubCopy(announcement.title),
        subtitle: normalizeHubCopy(announcement.subtitle),
      }
    : null
const dismissedCriticalBroadcastEventIds = new Set<string>()

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
  'vox_double_eviction',
  'vip_veto',
  'diamond_pov',
  'coup_detat',
  'spotlight_veto',
  'democracia',
  'cupid_arrow',
  'cupid_arrow_broken',
  'vox_populi',
  'twist',
  'loh_comp_announcement',
  'pos_comp_announcement',
  'custom_broadcast',
  'custom_major',
  'custom_critical',
  'depression_shock_start',
  'depression_shock_day_2',
  'depression_shock_chocolates',
  'depression_shock_melancholy',
])

/** Maps a major key to its announcement title and subtitle. */
const ANNOUNCEMENT_META: Record<
  string,
  { title: string; subtitle: string; isLive: boolean; autoDismissMs: number | null }
> = {
  custom_broadcast: {
    // i18n-ignore: Canonical in-world broadcast branding
    title: 'BIG EYE BROADCAST',
    subtitle: '',
    isLive: true,
    autoDismissMs: null,
  },
  custom_major: {
    // i18n-ignore: Canonical in-world broadcast branding
    title: 'BIG EYE BROADCAST',
    subtitle: '',
    isLive: true,
    autoDismissMs: null,
  },
  custom_critical: {
    // i18n-ignore: Canonical in-world broadcast branding
    title: 'SHOCK ANNOUNCEMENT',
    subtitle: '',
    isLive: true,
    autoDismissMs: null,
  },
  depression_shock_start: {
    title: 'Depression Shock',
    subtitle:
      'A storm has settled over the hub. The rain will not let up, and a deep melancholy is changing how the players think, speak, and play.',
    isLive: true,
    autoDismissMs: null,
  },
  depression_shock_day_2: {
    title: 'The colour drains away',
    subtitle:
      'The storm has deepened. Today the hub loses most of its colour. Every familiar room feels colder, flatter, and farther away.',
    isLive: true,
    autoDismissMs: null,
  },
  depression_shock_chocolates: {
    title: 'A small comfort',
    subtitle:
      'The Big Eye has left chocolates for everyone. Wrappers open in the quiet, but the rain keeps speaking louder. 🍫',
    isLive: true,
    autoDismissMs: null,
  },
  depression_shock_melancholy: {
    title: 'Under the weather',
    subtitle: 'The storm continues to press against every room and every conversation.',
    isLive: true,
    autoDismissMs: null,
  },
  depression_shock_end: {
    title: 'The sun returns',
    subtitle:
      'Morning light breaks through the clouds. Colour returns, familiar faces reappear, and the hub finally exhales.',
    isLive: true,
    autoDismissMs: null,
  },
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
    subtitle: 'The hub has spoken. One player’s journey ends tonight.',
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
    subtitle:
      'Tribunal members will face off. Only one can win the right to return to the hub. Press Play to begin the showdown.',
    isLive: true,
    autoDismissMs: null,
  },
  double_eviction: {
    title: 'Double Elimination!',
    subtitle: 'Tonight the LOH nominates three. Two will be eliminated.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_double_eviction: {
    title: 'Double Elimination!',
    subtitle: 'At least three nominees face the public. The audience will eliminate two players.',
    isLive: true,
    autoDismissMs: null,
  },
  cupid_arrow: {
    title: "Cupid's Arrow",
    subtitle: 'The hub is bound into eight pairs. Every triumph, vote, danger, and fall is shared.',
    isLive: true,
    autoDismissMs: null,
  },
  cupid_arrow_broken: {
    title: "Cupid's Spell Is Broken",
    subtitle: 'Four pairs have fallen. Cupid leaves the hub, and every survivor now plays alone.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_populi: {
    title: 'VOX POPULI',
    subtitle:
      'Players nominate in secret. The audience decides who leaves; Public Mode reveals the pulse.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_immunity_comp: {
    title: 'Immunity Competition',
    subtitle: 'The winner is safe today. The last-place finisher goes straight onto the block.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_final4_immunity_comp: {
    title: 'Final 4 Competition',
    subtitle:
      'No immunity is awarded today. Last place begins on the block; the other three each cast one secret vote.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_nominations: {
    title: 'Secret Nominations',
    subtitle: 'Every player privately names two people. Cutoff ties expand the block.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_safety_ceremony: {
    title: 'Power of Safety',
    subtitle:
      'The holder may save a nominee. The original secret-ballot ranking decides whether a backup is needed.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_public_vote: {
    title: 'The Public Decides',
    subtitle: 'The audience is voting to eliminate. The players do not vote.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_final3: {
    title: 'Final 3',
    subtitle: 'One player will win immunity. The audience will decide third place.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_populi_final_three_vote: {
    title: 'The Final Three Verdict',
    subtitle: 'One finalist is immune. The audience is about to end one of the other two journeys.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_populi_final_two: {
    title: 'The Final Two',
    subtitle: 'Two journeys remain. The audience will choose the champion.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_populi_final_vote: {
    title: 'The Final Audience Vote',
    subtitle: 'The last vote of the season is live. One of these finalists will win The Big Eye.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_final3_interlude: {
    title: 'The Final Three',
    subtitle:
      'The hub falls quiet. Every bond, promise, and rivalry now carries final-night weight.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_final3_result: {
    title: 'Final Three Result',
    subtitle: 'The final immunity journey takes another turn.',
    isLive: true,
    autoDismissMs: null,
  },
  vox_populi_finale_ready: {
    title: 'Ready for the Finale?',
    subtitle: 'The final two have made their case. Press Play to open the final audience vote.',
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
    subtitle: 'The hub will elect its new leader by secret vote.',
    isLive: true,
    autoDismissMs: null,
  },
  tribunal_phase: {
    title: 'Welcome to the Tribunal',
    subtitle: 'The game is over for you, but your final vote will decide who deserves the crown.',
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
    subtitle: 'Control is up for winning — who will become Leader of the Hub?',
    isLive: true,
    autoDismissMs: null,
  },
  pos_comp_announcement: {
    title: 'Power of Safety',
    subtitle: 'The winner can protect a nominee and force the block to change.',
    isLive: true,
    autoDismissMs: null,
  },
}

// i18n-ignore: Canonical in-world winner announcement copy
const AUDIENCE_WINNER_SUBTITLE = 'The audience has spoken. The season champion is official.'
// i18n-ignore: Canonical in-world winner announcement copy
const TRIBUNAL_WINNER_SUBTITLE = 'The Tribunal has spoken. The season champion is official.'

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

function isSeasonStartExpansionActivation(event: TvEvent | null | undefined): boolean {
  if (!event || event.meta?.phase !== 'season_start' || event.meta?.week !== 1) return false
  const key = extractMajorKey(event)
  return key === 'vox_populi' || key === 'cupid_arrow'
}

/** Build an Announcement object for the given major key and event. */
function buildAnnouncement(
  key: string,
  ev: TvEvent,
  phase?: Phase,
  overrides?: Record<string, BroadcastOverride>
): Announcement {
  const meta = ANNOUNCEMENT_META[key] ?? {
    title: key.replace(/_/g, ' ').toUpperCase(),
    subtitle: ev.text,
    isLive: false,
    autoDismissMs: 4500,
  }
  const eventTitle = ev.meta?.announcementTitle
  const eventSubtitle = ev.meta?.announcementSubtitle
  const finalFourWinnerMatch =
    key === 'vox_final4_immunity_comp'
      ? ev.text.match(/^(.+?) wins the Final 4 competition\b/i)
      : null
  const migratedFinalFourTitle = finalFourWinnerMatch
    ? `${finalFourWinnerMatch[1]} Wins the Final 4 Competition`
    : null
  const migratedFinalFourSubtitle = finalFourWinnerMatch
    ? 'There is no immunity today. Last place begins on the block, and the other three housemates will each cast one secret vote.'
    : null
  const registryTemplate = phase ? getPhaseCardTemplate(phase, key) : undefined
  const registryOverride = registryTemplate ? overrides?.[registryTemplate.id] : undefined
  return {
    key,
    ...meta,
    title:
      typeof eventTitle === 'string' && eventTitle.trim()
        ? eventTitle
        : (registryOverride?.title ??
          migratedFinalFourTitle ??
          registryTemplate?.title ??
          meta.title),
    subtitle:
      typeof eventSubtitle === 'string' && eventSubtitle.trim()
        ? eventSubtitle
        : (registryOverride?.text ??
          migratedFinalFourSubtitle ??
          registryTemplate?.text ??
          meta.subtitle),
  }
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
  doubleEvictionActive: boolean,
  voxPopuliActive: boolean
): string | null {
  if (phase === 'loh_comp_announcement')
    return voxPopuliActive
      ? aliveCount === 4
        ? 'vox_final4_immunity_comp'
        : 'vox_immunity_comp'
      : 'loh_comp_announcement'
  // Democracia already has its single critical shock card at the LOH
  // announcement phase. Entering the ballot must open the voting UI directly,
  // never replay that same shock as a second full-screen card.
  if (phase === 'democracia_vote') return null
  if (phase === 'pos_comp_announcement') return 'pos_comp_announcement'
  if (phase === 'pos_ceremony')
    return voxPopuliActive ? 'vox_safety_ceremony' : aliveCount === 4 ? 'final4' : 'veto_ceremony'
  if (phase === 'nominations' && voxPopuliActive) return 'vox_nominations'
  if (phase === 'nominations')
    return doubleEvictionActive ? 'double_eviction' : 'nomination_ceremony'
  if (phase === 'live_vote') return voxPopuliActive ? 'vox_public_vote' : 'live_eviction'
  if (phase === 'final3')
    return aliveCount === 3 ? (voxPopuliActive ? 'vox_final3' : 'final3_announcement') : null
  if (phase === 'final3_decision') return voxPopuliActive ? null : 'final_hoh'
  if (phase === 'jury') return 'jury'
  return null
}

// Duration (ms) the main viewport text stays faded after an announcement is dismissed,
// preventing jarring text transitions between the overlay disappearing and new text.
const DOUBLE_EVICTION_SPOTLIGHT_MS = 1700
const LIVE_VOTE_CUTOUT_PADDING = 12
const LIVE_VOTE_CUTOUT_BOTTOM_PADDING = 0
const LIVE_VOTE_CUTOUT_RADIUS = 18
const DETOX_MESSAGE_HOLD_MS = 1500
const VOTE_RESULTS_POST_REVEAL_MS = 1000
const VOTE_RESULTS_OUTCOME_MS = 3000
const PLAY_THROUGH_ANNOUNCEMENT_KEYS = new Set([
  'vox_populi',
  'vox_final3',
  'vox_final3_interlude',
  'vox_final3_result',
  'vox_populi_final_three_vote',
  'vox_populi_final_two',
])

const LEGACY_DAY_END_EVENT = /^Day \d+ has come to an end\. A new day begins soon…(?: ✨)?$/
const LEGACY_DAY_START_EVENT =
  /^Day \d+ (?:has begun\. Get ready\.|begins! 🏠 It's time for the LOH competition\.)$/

function getDailyTransitionPhase(event: TvEvent): Phase | null {
  if (event.meta?.key === 'day_start') return 'week_start'
  if (event.meta?.key === 'day_end') return 'week_end'
  // Saved games created before the phase tags were introduced keep their
  // original history, but should not replay a previous day's transition copy.
  if (LEGACY_DAY_START_EVENT.test(event.text)) return 'week_start'
  if (LEGACY_DAY_END_EVENT.test(event.text)) return 'week_end'
  return null
}

function compactPhaseLabel(phase: Phase): string {
  if (phase.startsWith('loh_')) return 'LOH'
  if (phase.startsWith('pos_') || phase === 'pre_veto_public_save') return 'Safety'
  if (phase.startsWith('nomination')) return 'Noms'
  if (phase.startsWith('social')) return 'Social'
  if (phase.startsWith('final3') || phase === 'final4_eviction') return 'Finale'
  if (phase.startsWith('jury')) return 'Tribunal'
  const labels: Partial<Record<Phase, string>> = {
    season_start: 'Season',
    week_start: 'Day',
    week_end: 'Day End',
    live_vote: 'Vote',
    eviction_results: 'Results',
    democracia_vote: 'Vote',
    democracia_results: 'Results',
  }
  return labels[phase] ?? formatPhaseLabel(phase)
}

/**
 * Announcement keys that receive the cinematic fullscreen shock sequence:
 *   1. Fullscreen stinger (ShockIntroOverlay)
 *   2. Faux-TV announcement card
 *   3. Info-button spotlight
 */
const SHOCK_ANNOUNCEMENT_KEYS = new Set([
  'double_eviction',
  'vox_double_eviction',
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
  'vox_populi',
  'depression_shock_start',
  'depression_shock_day_2',
  // These keys can be configured as fullscreen shocks by the broadcast
  // manager. They must use the same stinger → Faux TV → spotlight sequence
  // as Double Elimination, rather than falling through to a plain card.
  'twist',
  'custom_critical',
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
  resultMode?: 'house' | 'public'
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
  /**
   * Temporarily owns the viewport copy while a full-screen flow is in progress.
   * This keeps an older feed item from showing through a dimmed game background.
   */
  viewportMessageOverride?: string | null
  publicSaveReveal?: TvZonePublicSaveReveal | null
  onPublicSaveDone?: () => void
  voteResultsReveal?: TvZoneVoteResultsReveal | null
  democraciaResultsReveal?: TvZoneDemocraciaResultsReveal | null
  mainLogMaxVisible?: number
  /** Whether the separate House Feed is enabled; weather hides duplicate controls only when false. */
  houseFeedEnabled?: boolean
  rosterLogLauncher?: boolean
  priorityAnnouncement?: Announcement | null
  onPriorityAnnouncementDismiss?: () => void
  externalAnnouncement?: Announcement | null
  onExternalAnnouncementDismiss?: () => void
  /** Compact board occupancy chip shown when the roster header yields space to the board. */
  occupancyChip?: {
    label: string
    ariaLabel: string
  } | null
  audiencePreviewAction?: {
    disabled: boolean
    spotlight?: boolean
    onClick: () => void
  } | null
  audiencePreviewReveal?: {
    players: Player[]
    percentages: Record<string, number>
    onComplete: (reason: VoxAudiencePulseExit) => void
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
  const depressionShockPhase: DepressionShockVisualPhase = useSyncExternalStore(
    subscribeDepressionShockVisualPhase,
    getDepressionShockVisualSnapshot,
    (): DepressionShockVisualPhase => 'inactive'
  )
  const depressionShockRainyTv = depressionShockPhase === 'day1' || depressionShockPhase === 'day2'
  const depressionShockSunnyTv = depressionShockPhase === 'sunbreak'

  // Filter entries for the TV viewport (excludes DR-only events).
  const tvVisibleFeed = useMemo(() => gameState.tvFeed.filter(isVisibleOnTv), [gameState.tvFeed])
  // Filter entries for the main-screen log strip (excludes DR-only events).
  const mainLogFeed = useMemo(() => gameState.tvFeed.filter(isVisibleInMainLog), [gameState.tvFeed])
  const queuedBroadcastEvent = useMemo(() => {
    for (const queuedId of gameState.broadcastQueue ?? []) {
      const event = gameState.tvFeed.find((candidate) => candidate.id === queuedId) ?? null
      if (isCurrentPhaseBroadcastEvent(event, gameState.phase, gameState.week)) return event
    }
    return null
  }, [gameState.broadcastQueue, gameState.phase, gameState.tvFeed, gameState.week])
  // Season-start expansion activations must outrank the onboarding welcome in
  // presentation even when an older/persisted queue was seeded in template
  // order. They remain normal managed events and are consumed normally after
  // the player presses Play.
  const seasonStartExpansionEvent = useMemo(() => {
    if (gameState.phase !== 'season_start' || gameState.week !== 1) return null
    return (
      tvVisibleFeed.find((event) => {
        const key = extractMajorKey(event)
        return (
          (key === 'vox_populi' || key === 'cupid_arrow') && event.meta?.broadcastConsumed !== true
        )
      }) ?? null
    )
  }, [gameState.phase, gameState.week, tvVisibleFeed])
  const queuedBroadcastLevel = getTvPresentationBroadcastLevel(queuedBroadcastEvent)
  const queuedBroadcastIsCard =
    queuedBroadcastLevel === 'major' || queuedBroadcastLevel === 'critical'
  const lastPlainBroadcastEvent = useMemo(() => {
    const id = gameState.lastPlainBroadcastEventId
    if (!id) return null
    const event = gameState.tvFeed.find((candidate) => candidate.id === id)
    if (event?.meta?.phase !== gameState.phase || event?.meta?.week !== gameState.week) return null
    return event
  }, [gameState.lastPlainBroadcastEventId, gameState.phase, gameState.tvFeed, gameState.week])
  const mainLogMaxVisible = props.mainLogMaxVisible ?? 2
  const houseFeedEnabled = props.houseFeedEnabled ?? false
  const occupancyChip = props.occupancyChip ?? null

  const latestEvent = tvVisibleFeed[0]
  const latestUnconsumedEvent =
    tvVisibleFeed.find((event) => event.meta?.broadcastConsumed !== true) ?? null
  // Fresh explicit major broadcasts are authoritative until consumed, even
  // when legacy metadata was normalized after the event was inserted.
  const latestExplicitMajorEvent =
    latestEvent && extractMajorKey(latestEvent) && latestEvent.meta?.broadcastConsumed !== true
      ? latestEvent
      : null
  const announcementPrerollEvent = useMemo(() => {
    const prerollId = latestEvent?.meta?.announcementPrerollEventId
    if (typeof prerollId !== 'string') return null
    return tvVisibleFeed.find((event) => event.id === prerollId) ?? null
  }, [latestEvent, tvVisibleFeed])
  const publicSaveRevealActive = Boolean(props.publicSaveReveal)
  const voteResultsRevealActive = Boolean(props.voteResultsReveal)
  const [voteResultsAudioDurationMs, setVoteResultsAudioDurationMs] = useState<number | null>(null)
  const democraciaResultsRevealActive = Boolean(props.democraciaResultsReveal)
  const priorityAnnouncement = props.priorityAnnouncement ?? null
  const externalAnnouncement = props.externalAnnouncement ?? null

  useEffect(() => {
    if (!voteResultsRevealActive) {
      return
    }
    let cancelled = false
    void getEvictionVotingAudioDurationMs().then((durationMs) => {
      if (!cancelled) setVoteResultsAudioDurationMs(durationMs)
    })
    return () => {
      cancelled = true
    }
  }, [voteResultsRevealActive])

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
  const [, setDismissedPhase] = useState<Phase | null>(null)
  // Phase-triggered announcement (set on phase transition, cleared on dismiss or non-popup phase).
  const [phaseAnnouncement, setPhaseAnnouncement] = useState<Announcement | null>(null)
  // Short-lived TV spotlight effect for Double Eviction special announcements.
  const [deSpotlightActive, setDeSpotlightActive] = useState(false)
  const [cupidOutlinePulseActive, setCupidOutlinePulseActive] = useState(false)
  const [saveStatus, setSaveStatus] = useState<null | 'saved' | 'error'>(null)
  // Save feedback dialog — shows a mobile-friendly confirmation after save.
  const [saveFeedbackOpen, setSaveFeedbackOpen] = useState(false)
  const [saveFeedbackIsError, setSaveFeedbackIsError] = useState(false)
  const [detoxMessageQueue, setDetoxMessageQueue] = useState<TvEvent[]>([])
  const [detoxMessageIndex, setDetoxMessageIndex] = useState(0)
  const [dismissedPriorityEventIds, setDismissedPriorityEventIds] = useState<Set<string>>(
    () => new Set(dismissedCriticalBroadcastEventIds)
  )
  // A single reducer action can append the shock activation and its practical
  // consequence (for example a Force Majeure replacement) at once. Keep the
  // shock broadcast in a small FIFO so the consequence never hides its stinger.
  const [shockAnnouncementQueue, setShockAnnouncementQueue] = useState<QueuedShockAnnouncement[]>(
    []
  )
  const deSpotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cupidOutlinePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detoxMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detoxSequenceLatestIdRef = useRef<string | null>(null)
  const shockSequenceLatestIdRef = useRef<string | null>(null)
  const seenShockEventIdsRef = useRef(new Set<string>())
  // Tracks the previous phase to detect phase transitions.
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
          // Do not extend the transparent cutout below the TV zone. That
          // space belongs to the grid and must remain under the vote mask.
          h: rect.height + LIVE_VOTE_CUTOUT_PADDING + LIVE_VOTE_CUTOUT_BOTTOM_PADDING,
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
  const isBroadcastRelevant = useCallback(
    (event: TvEvent) => {
      const transitionPhase = getDailyTransitionPhase(event)
      return (
        (transitionPhase === null || transitionPhase === gameState.phase) &&
        !(
          extractMajorKey(event) === 'vox_populi_final_three_vote' &&
          (alivePlayers.length !== 3 || gameState.voxPopuli?.publicVoteContext !== 'final3')
        )
      )
    },
    [alivePlayers.length, gameState.phase, gameState.voxPopuli?.publicVoteContext]
  )
  // A critical broadcast is a single viewing experience: once the player has
  // dismissed its major card, do not immediately replay the identical copy as
  // the ordinary "Now" message beneath it. It remains available in the log.
  const latestRelevantEvent = useMemo(
    () =>
      tvVisibleFeed.find(
        (event) =>
          isBroadcastRelevant(event) &&
          event.meta?.broadcastConsumed !== true &&
          ((event.meta?.phase === gameState.phase && event.meta?.week === gameState.week) ||
            // Legacy critical result events were emitted without phase
            // metadata. Keep those broadcasts discoverable, but do not apply
            // this compatibility path to named major warnings that may be
            // stale after the game has moved on.
            (event.meta?.broadcastPriority === 'critical' &&
              event.meta?.major === undefined &&
              event.meta?.phase === undefined) ||
            // Preserve older explicit major events that were persisted before
            // phase/week metadata was added. Ordinary messages stay scoped.
            (extractMajorKey(event) !== null &&
              event.meta?.phase === undefined &&
              event.meta?.week === undefined)) &&
          (event.meta?.broadcastManaged !== true || event.meta?.forceOnTv === true) &&
          !(event.meta?.broadcastPriority === 'critical' && dismissedPriorityEventIds.has(event.id))
      ) ?? null,
    [dismissedPriorityEventIds, gameState.phase, gameState.week, isBroadcastRelevant, tvVisibleFeed]
  )
  // Once a phase card has been acknowledged it leaves the announcement queue,
  // but its copy remains the canonical content for that phase. Include every
  // current-phase source here (not only Minor sources) so dismissing a Major
  // card can never reveal an empty screen.
  const latestCurrentPhaseMessage = useMemo(
    () =>
      tvVisibleFeed.find(
        (event) =>
          (event.meta?.broadcastConsumed !== true ||
            getTvPresentationBroadcastLevel(event) !== 'minor') &&
          ((event.meta?.phase === gameState.phase && event.meta?.week === gameState.week) ||
            (extractMajorKey(event) !== null &&
              event.meta?.phase === undefined &&
              event.meta?.week === undefined)) &&
          isBroadcastRelevant(event)
      ) ?? null,
    [gameState.phase, gameState.week, isBroadcastRelevant, tvVisibleFeed]
  )
  const priorityBroadcastEvent = useMemo(
    () =>
      [...tvVisibleFeed]
        .reverse()
        .find(
          (event) =>
            event.meta?.broadcastPriority === 'critical' &&
            event.meta?.broadcastManaged !== true &&
            event.meta?.week === gameState.week &&
            isBroadcastRelevant(event) &&
            !dismissedPriorityEventIds.has(event.id)
        ) ?? null,
    [dismissedPriorityEventIds, gameState.week, isBroadcastRelevant, tvVisibleFeed]
  )
  const displayedEvent =
    activeDetoxEvent ??
    (!queuedBroadcastIsCard ? queuedBroadcastEvent : null) ??
    priorityBroadcastEvent ??
    latestRelevantEvent ??
    lastPlainBroadcastEvent ??
    latestCurrentPhaseMessage ??
    // Results can advance their phase before their final feed item is tagged
    // with that new phase. Preserve that latest visible result in the faux TV
    // instead of presenting an empty viewport during the handoff.
    latestUnconsumedEvent
  // The weather bulletin has its own full-viewport card. Do not briefly mount
  // the older day-start/day-end transition card underneath it while the
  // bulletin portal resolves its TV target.
  const weatherBulletinIsActive = queuedBroadcastEvent?.meta?.weatherBulletin === true
  // A consumed bulletin remains in history. Only the currently queued one may
  // own the viewport; otherwise it would incorrectly suppress Day Complete.
  const weatherBulletinIsQueued = weatherBulletinIsActive
  // During social_2 the weather controller publishes its dedicated bulletin
  // immediately after the preceding social beat is consumed. There is one
  // queue-empty render between those two updates; do not let the generic
  // latest-event fallback replay an older Day Start/Day End card in that gap.
  // This guard is scoped to social_2 so the normal daily transition cards keep
  // their original presentation everywhere else.
  const dailyTransitionPhase =
    weatherBulletinIsQueued || gameState.phase === 'social_2' || !displayedEvent
      ? null
      : getDailyTransitionPhase(displayedEvent)
  const dailyAtmosphere = dailyTransitionPhase
    ? getDailyAtmosphere(
        gameState.gameId,
        gameState.week,
        dailyTransitionPhase,
        gameState.depressionShock
      )
    : null
  const presentedDailyAtmosphere =
    depressionShockSunnyTv && (!dailyTransitionPhase || dailyTransitionPhase === 'week_start')
      ? 'sunny'
      : dailyAtmosphere
  // Both the inline daily card and the portal-based weather bulletin cover
  // the Faux-TV viewport. The controls must be suppressed for either one;
  // otherwise the older LOG/occupancy controls remain visible behind the
  // full weather bulletin.
  const weatherCardActive = Boolean(
    weatherBulletinIsActive || (dailyTransitionPhase && presentedDailyAtmosphere)
  )
  const dailyMoonPhase = (['crescent', 'half', 'gibbous', 'full'] as const)[
    Math.max(0, gameState.week - 1) % 4
  ]
  const dailyTransitionTitle = getDailyTransitionTitle({
    atmosphere: presentedDailyAtmosphere,
    phase: dailyTransitionPhase ?? gameState.phase,
    week: gameState.week,
  })
  const voteResultsTotal =
    props.voteResultsReveal?.nominees.reduce(
      (sum, nominee) => sum + Math.max(0, Math.round(nominee.voteCount)),
      0
    ) ?? 0
  const syncedVoteRevealIntervalMs =
    props.voteResultsReveal?.resultMode === 'public' &&
    voteResultsAudioDurationMs &&
    voteResultsTotal > 0
      ? calculateEvictionVoteRevealIntervalMs(
          voteResultsAudioDurationMs,
          EVICTION_PUBLIC_ESTIMATE_STEPS,
          VOTE_RESULTS_POST_REVEAL_MS,
          VOTE_RESULTS_OUTCOME_MS
        )
      : undefined
  const detoxMessageActive = Boolean(activeDetoxEvent)

  // ── Shock announcement sequence state ────────────────────────────────────────
  // Phase A: full-screen shock stinger (ShockIntroOverlay).
  const [shockIntroActive, setShockIntroActive] = useState(false)
  const [cupidIntroAcknowledged, setCupidIntroAcknowledged] = useState(false)
  // Phase C: info-button spotlight (ConfessionalSpotlightOverlay reused).
  const [shockInfoSpotlightActive, setShockInfoSpotlightActive] = useState(false)
  // Ref forwarded to the TvAnnouncementOverlay info button for spotlight targeting.
  const announcementInfoButtonRef = useRef<HTMLButtonElement | null>(null)
  // ── Phase-transition announcement detection ──────────────────────────────────
  // Fires whenever the game phase or alive-player count changes.
  // Also allows an in-place upgrade for nomination-phase overlays when
  // Double Eviction activates after the phase has already been entered.
  useLayoutEffect(() => {
    const currentPhase = gameState.phase
    const democraciaPreVoteActive =
      currentPhase === 'loh_comp_announcement' && gameState.democracia?.active === true
    const cardMajor = democraciaPreVoteActive
      ? 'democracia'
      : getPhaseAnnouncementKey(
          currentPhase,
          alivePlayers.length,
          doubleEvictionActive,
          gameState.voxPopuli?.status === 'active'
        )
    dispatch(syncPhaseBroadcasts({ phase: currentPhase, cardMajor }))
    startTransition(() => {
      setPhaseAnnouncement(null)
      setDismissedPhase(null)
    })
  }, [
    dispatch,
    gameState.phase,
    gameState.week,
    gameState.democracia?.active,
    alivePlayers.length,
    doubleEvictionActive,
    gameState.voxPopuli?.status,
    gameState.broadcastOverrides,
    gameState.customBroadcasts,
  ])

  // Event-based announcement: only explicit meta.major / ev.major (no text heuristics).
  const eventAnnouncement = useMemo<Announcement | null>(() => {
    const announcementEvent =
      seasonStartExpansionEvent ??
      (queuedBroadcastIsCard ? queuedBroadcastEvent : null) ??
      announcementPrerollEvent ??
      priorityBroadcastEvent ??
      latestExplicitMajorEvent ??
      latestRelevantEvent
    if (!announcementEvent) return null
    // A phase card can dismiss its own event id while a newer critical Final 3
    // broadcast is waiting. Never let that incidental dismissal bury the
    // waiting broadcast; it must receive its own faux-TV card first.
    const isUndismissedCriticalBroadcast =
      announcementEvent.meta?.broadcastPriority === 'critical' &&
      !dismissedPriorityEventIds.has(announcementEvent.id)
    if (
      announcementEvent !== queuedBroadcastEvent &&
      announcementEvent.id === dismissedEventId &&
      !isUndismissedCriticalBroadcast
    )
      return null
    const majorKey = extractMajorKey(announcementEvent)
    return majorKey ? buildAnnouncement(majorKey, announcementEvent) : null
  }, [
    announcementPrerollEvent,
    seasonStartExpansionEvent,
    queuedBroadcastEvent,
    queuedBroadcastIsCard,
    priorityBroadcastEvent,
    latestExplicitMajorEvent,
    latestRelevantEvent,
    dismissedEventId,
    dismissedPriorityEventIds,
  ])
  const eventAnnouncementSource =
    seasonStartExpansionEvent ??
    (queuedBroadcastIsCard ? queuedBroadcastEvent : null) ??
    announcementPrerollEvent ??
    priorityBroadcastEvent ??
    latestExplicitMajorEvent ??
    latestRelevantEvent

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
      if (event.meta?.broadcastManaged === true && event.meta?.forceOnTv !== true) return []
      const key = extractMajorKey(event)
      if (!key || !SHOCK_ANNOUNCEMENT_KEYS.has(key)) return []
      // Phase-card branches used to emit a second legacy major event beside
      // the card. The manager-controlled card is now the sole presentation
      // source, so do not also enqueue that legacy event as another shock.
      if (getPhaseCardTemplate(gameState.phase, key)) return []
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
  }, [gameState.phase, tvVisibleFeed])

  // The core game phase remains jury while the post-finale sequence plays.
  // Replace its stale Tribunal Votes card with the resolved winner on the
  // main screen, through the interview and Public Favorite handoff.
  const winnerBroadcast = useMemo(() => {
    const finale = gameState.seasonFinale
    if (finale && ['winnerInterview', 'publicFavoriteSetup'].includes(finale.phase)) {
      return gameState.players.find((player) => player.id === finale.winnerId) ?? null
    }
    // finalizeGame marks the winner before the post-finale overlay is created.
    // During that handoff the game route is briefly visible and still reports
    // the Tribunal phase, so use the resolved player record instead of falling
    // back to the stale Tribunal Votes card.
    if (gameState.phase === 'jury') {
      return gameState.players.find((player) => player.isWinner || player.finalRank === 1) ?? null
    }
    return null
  }, [gameState.phase, gameState.players, gameState.seasonFinale])

  const queuedShockAnnouncement = shockAnnouncementQueue[0] ?? null
  const managedEventAnnouncement =
    (queuedBroadcastIsCard && eventAnnouncementSource?.id === queuedBroadcastEvent?.id) ||
    eventAnnouncementSource?.id === seasonStartExpansionEvent?.id
      ? eventAnnouncement
      : null
  const cupidFauxTvAnnouncement = eventAnnouncement?.key === 'cupid_arrow'
  const cupidFollowUpVisible = cupidFauxTvAnnouncement && cupidIntroAcknowledged
  const cupidFollowUpAnnouncement: Announcement = {
    key: 'cupid_arrow',
    // Keep an accessible announcement name even though the faux-TV handoff
    // intentionally hides the visual title. The authored activation text is
    // the actual faux-TV instruction beat, including the live pair names.
    title: "Cupid's Arrow",
    subtitle:
      (typeof eventAnnouncementSource?.meta?.announcementSubtitle === 'string'
        ? eventAnnouncementSource.meta.announcementSubtitle
        : null) ??
      eventAnnouncementSource?.text ??
      'Cupid just made his love concoction.\nCheers to the newly formed couples.\nEvery pair now shares one fate.\nPower, danger, votes, and exits belong to two.\nThe Big Eye is watching. 💘',
    isLive: true,
    autoDismissMs: null,
  }
  const eventAnnouncementHasShockPriority =
    eventAnnouncement != null &&
    (managedEventAnnouncement
      ? isSeasonStartExpansionActivation(eventAnnouncementSource) ||
        queuedBroadcastLevel === 'critical'
      : SHOCK_ANNOUNCEMENT_KEYS.has(eventAnnouncement.key))

  // A shock event must finish its fullscreen → Faux TV → info spotlight sequence
  // before a simultaneous phase card (for example the first LOH competition)
  // is allowed to take over the TV.
  const activeAnnouncement =
    queuedShockAnnouncement?.announcement ??
    (eventAnnouncementHasShockPriority ? eventAnnouncement : null) ??
    priorityAnnouncement ??
    externalAnnouncement ??
    managedEventAnnouncement ??
    phaseAnnouncement ??
    eventAnnouncement
  const displayedAnnouncement = normalizeAnnouncementCopy(activeAnnouncement)
  const activeAnnouncementSequenceId =
    queuedShockAnnouncement?.eventId ??
    (activeAnnouncement === eventAnnouncement ? eventAnnouncementSource?.id : null) ??
    activeAnnouncement?.key ??
    ''
  const isShockAnnouncement =
    activeAnnouncement != null &&
    (activeAnnouncement === managedEventAnnouncement
      ? isSeasonStartExpansionActivation(eventAnnouncementSource) ||
        queuedBroadcastLevel === 'critical'
      : SHOCK_ANNOUNCEMENT_KEYS.has(activeAnnouncement.key))
  const audiencePreviewRevealActive = Boolean(props.audiencePreviewReveal)
  const showInlineAnnouncement =
    winnerBroadcast == null &&
    activeAnnouncement != null &&
    !(shockIntroActive && isShockAnnouncement) &&
    !(cupidFauxTvAnnouncement && !cupidIntroAcknowledged) &&
    !publicSaveRevealActive &&
    !voteResultsRevealActive &&
    !democraciaResultsRevealActive &&
    !audiencePreviewRevealActive
  // Keep the Safety Ceremony bed present through the title card, then duck it
  // under voting and reveal audio until the next phase resumes normal volume.
  useEffect(() => {
    const liveVoteTitleCardActive =
      showInlineAnnouncement &&
      (activeAnnouncement?.key === 'live_eviction' || activeAnnouncement?.key === 'vox_public_vote')
    const shouldDuckSafetyMusic =
      (gameState.phase === 'live_vote' && !liveVoteTitleCardActive) ||
      gameState.phase === 'eviction_results'

    dispatch(setMusicMix(shouldDuckSafetyMusic ? 'ducked' : 'normal'))
  }, [activeAnnouncement?.key, dispatch, gameState.phase, showInlineAnnouncement])

  const showOccupancyChip =
    occupancyChip != null &&
    (!weatherCardActive || houseFeedEnabled) &&
    !cupidFollowUpVisible &&
    (!showInlineAnnouncement || cupidFollowUpVisible) &&
    winnerBroadcast == null
  const viewportMessageOverride = props.viewportMessageOverride?.trim() || null
  const hideViewportMessage =
    !viewportMessageOverride &&
    (!displayedEvent ||
      (!!activeAnnouncement && !cupidFollowUpVisible) ||
      winnerBroadcast != null ||
      weatherBulletinIsActive ||
      publicSaveRevealActive ||
      voteResultsRevealActive ||
      democraciaResultsRevealActive ||
      audiencePreviewRevealActive)
  // Existing saved seasons can still hold the former default welcome copy.
  // Normalize that exact legacy phrase until those broadcasts are regenerated.
  const displayedEventText = displayedEvent?.text
    ? decorateDepressionShockFauxTvText(
        normalizeHubCopy(displayedEvent.text),
        depressionShockPhase,
        `${gameState.gameId}|${gameState.week}|${displayedEvent.id}`
      )
    : undefined
  const viewportDisplayText =
    viewportMessageOverride ??
    (cupidFollowUpVisible
      ? cupidFollowUpAnnouncement.subtitle
      : (dailyTransitionTitle ?? displayedEventText))
  const baseViewportMessageKey = getViewportMessageKey(displayedEvent)
  const viewportMessageKey = viewportMessageOverride
    ? `override-${viewportMessageOverride}`
    : detoxMessageActive
      ? `${baseViewportMessageKey}-${detoxMessageIndex}`
      : baseViewportMessageKey
  let mainTvMessage: string | undefined
  if (viewportMessageOverride) {
    mainTvMessage = viewportMessageOverride
  } else if (winnerBroadcast) {
    mainTvMessage = `${winnerBroadcast.name} won Season ${gameState.season} of The Big Eye`
  } else if (activeAnnouncement) {
    mainTvMessage =
      cupidFauxTvAnnouncement && cupidIntroAcknowledged
        ? cupidFollowUpAnnouncement.subtitle
        : activeAnnouncement.title
  } else {
    mainTvMessage = displayedEventText
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
    // Cupid's opening proclamation can only progress through its own OK
    // button. A central Play press must never consume it before the faux-TV
    // handoff has been shown.
    if (currentAnnouncement?.key === 'cupid_arrow' && !cupidIntroAcknowledged) return
    if (
      currentAnnouncement &&
      priorityBroadcastEvent &&
      extractMajorKey(priorityBroadcastEvent) === currentAnnouncement.key
    ) {
      dismissedCriticalBroadcastEventIds.add(priorityBroadcastEvent.id)
      setDismissedPriorityEventIds((current) => {
        const next = new Set(current)
        next.add(priorityBroadcastEvent.id)
        return next
      })
    }
    if (queuedShockAnnouncement) {
      setDismissedEventId(queuedShockAnnouncement.eventId)
      setShockAnnouncementQueue((queue) => queue.slice(1))
    } else if (managedEventAnnouncement && currentAnnouncement === managedEventAnnouncement) {
      const eventId = eventAnnouncementSource?.id
      if (eventId) {
        setDismissedEventId(eventId)
        dispatch(consumeBroadcastEvent(eventId))
      }
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
  }, [
    activeAnnouncement,
    dispatch,
    queuedShockAnnouncement,
    managedEventAnnouncement,
    queuedBroadcastEvent,
    priorityAnnouncement,
    externalAnnouncement,
    eventAnnouncementHasShockPriority,
    eventAnnouncementSource,
    phaseAnnouncement,
    gameState.phase,
    onPriorityAnnouncementDismiss,
    onExternalAnnouncementDismiss,
    priorityBroadcastEvent,
    cupidIntroAcknowledged,
  ])

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

  // Cupid's post-OK message uses the standard TV stage. Give that handoff the
  // same brief outline pulse as Double Elimination, but in Cupid rose-pink.
  useEffect(() => {
    if (!cupidFollowUpVisible) {
      startTransition(() => setCupidOutlinePulseActive(false))
      if (cupidOutlinePulseTimerRef.current !== null) {
        clearTimeout(cupidOutlinePulseTimerRef.current)
        cupidOutlinePulseTimerRef.current = null
      }
      return
    }

    startTransition(() => setCupidOutlinePulseActive(true))
    if (cupidOutlinePulseTimerRef.current !== null) clearTimeout(cupidOutlinePulseTimerRef.current)
    cupidOutlinePulseTimerRef.current = setTimeout(() => {
      setCupidOutlinePulseActive(false)
      cupidOutlinePulseTimerRef.current = null
    }, DOUBLE_EVICTION_SPOTLIGHT_MS)

    return () => {
      if (cupidOutlinePulseTimerRef.current !== null) {
        clearTimeout(cupidOutlinePulseTimerRef.current)
        cupidOutlinePulseTimerRef.current = null
      }
    }
  }, [cupidFollowUpVisible])

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

  useEffect(() => {
    if (activeAnnouncement?.key !== 'cupid_arrow') {
      startTransition(() => setCupidIntroAcknowledged(false))
    }
  }, [activeAnnouncementSequenceId, activeAnnouncement?.key])

  // Recovery for saves made while the older Cupid flow could consume the
  // announcement before reaching Play. A normal new Cupid activation retains
  // its active announcement until Play, so it still waits for the full reveal.
  useEffect(() => {
    if (
      gameState.cupidArrow?.status === 'active' &&
      !gameState.cupidArrow.visualsRevealed &&
      activeAnnouncement?.key !== 'cupid_arrow' &&
      !shockIntroActive
    ) {
      dispatch(revealCupidArrowVisuals())
    }
  }, [
    activeAnnouncement?.key,
    dispatch,
    gameState.cupidArrow?.status,
    gameState.cupidArrow?.visualsRevealed,
    shockIntroActive,
  ])

  const handleShockIntroComplete = useCallback(() => {
    startTransition(() => {
      setShockIntroActive(false)
      if (activeAnnouncement?.key === 'vox_populi') {
        // The fullscreen Vox proclamation is only beat one. Keep its managed
        // instruction event alive as beat two on the faux TV; the main Play
        // control consumes it and reveals the season welcome as beat three.
        setShockInfoSpotlightActive(false)
      } else if (activeAnnouncement?.key === 'cupid_arrow') {
        // Cupid follows the same three-beat structure. Acknowledging the
        // fullscreen cinematic exposes its live pair message on the faux TV;
        // only the next Play consumes it and advances to the welcome.
        setShockInfoSpotlightActive(false)
        setCupidIntroAcknowledged(true)
      } else if (activeAnnouncement?.key === 'cupid_arrow_broken') {
        // The break reveal is acknowledged first; only then expose the roster
        // and play the one-shot return to the original black-gold portraits.
        // Consume this broadcast now: unlike Cupid's opening, it has no second
        // faux-TV handoff and must not be rendered again as an inline card.
        setShockInfoSpotlightActive(false)
        handleDismiss()
        document.body.classList.remove('body--cupid-returning')
        // Let the full-screen cinematic unmount before swapping the portrait
        // source. Otherwise the entire return beat plays underneath it.
        window.setTimeout(() => {
          document.body.classList.add('body--cupid-returning')
          dispatch(finishCupidArrowVisualReturn())
        }, 240)
        window.setTimeout(() => document.body.classList.remove('body--cupid-returning'), 1780)
      } else if (activeAnnouncement?.key === 'depression_shock_start') {
        // The roster transformation belongs to the Faux-TV handoff. Trigger it
        // only after the standard shock stinger has cleared, so it cannot play
        // unseen beneath the fullscreen introduction.
        setShockInfoSpotlightActive(false)
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event('depression-shock:thunder-presented'))
        })
      } else {
        setShockInfoSpotlightActive(true)
      }
    })
  }, [activeAnnouncement?.key, dispatch, eventAnnouncementSource, handleDismiss])

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
    const handlePlay = (event: Event) => {
      if (queuedBroadcastEvent && (!activeAnnouncement || managedEventAnnouncement)) {
        if (managedEventAnnouncement) {
          // A season-expansion instruction is always the middle beat of the
          // opening sequence. Its Play may consume the instruction, but must
          // never also advance the game before the Big Eye welcome has had a
          // chance to occupy the faux TV (even if a persisted queue was
          // missing that welcome id).
          if (
            isSeasonStartExpansionActivation(eventAnnouncementSource) ||
            (gameState.broadcastQueue?.length ?? 0) > 1
          ) {
            event.preventDefault()
          }
          if (activeAnnouncement?.key === 'depression_shock_chocolates') {
            window.dispatchEvent(new Event('depression-shock:chocolate-presented'))
          }
          handleDismiss()
        } else {
          // A plain message needs to block Play only when another eligible TV
          // item follows it. Acknowledging the final plain message and moving
          // into the next phase should happen on the same button press.
          if ((gameState.broadcastQueue?.length ?? 0) > 1) event.preventDefault()
          dispatch(consumeBroadcastEvent(queuedBroadcastEvent.id))
        }
        return
      }
      if (activeAnnouncement) {
        if (activeAnnouncement.key === 'cupid_arrow' && !cupidFollowUpVisible) {
          event.preventDefault()
          return
        }
        if (activeAnnouncement.key === 'cupid_arrow' && cupidFollowUpVisible) {
          // Hold the Play action for the complete avatar storm and cap landing;
          // Day 1 is generated only after the reveal has finished.
          event.preventDefault()
          dispatch(revealCupidArrowVisuals())
          window.setTimeout(() => {
            handleDismiss()
            dispatch(advance())
          }, 2200)
          return
        }
        if (!PLAY_THROUGH_ANNOUNCEMENT_KEYS.has(activeAnnouncement.key)) {
          event.preventDefault()
        }
        if (activeAnnouncement.key === 'depression_shock_chocolates') {
          window.dispatchEvent(new Event('depression-shock:chocolate-presented'))
        }
        handleDismiss()
        return
      }
      if (priorityBroadcastEvent) {
        event.preventDefault()
        dismissedCriticalBroadcastEventIds.add(priorityBroadcastEvent.id)
        setDismissedPriorityEventIds((current) => {
          const next = new Set(current)
          next.add(priorityBroadcastEvent.id)
          return next
        })
      }
    }
    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [
    activeAnnouncement,
    dispatch,
    handleDismiss,
    managedEventAnnouncement,
    priorityBroadcastEvent,
    queuedBroadcastEvent,
    eventAnnouncementSource,
    gameState.broadcastQueue?.length,
    cupidFollowUpVisible,
  ])

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
    if ((shockSequenceActive || cupidFauxTvAnnouncement) && cupidShockKey) {
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
  }, [
    cupidFauxTvAnnouncement,
    cupidShockKey,
    shockIntroActive,
    shockInfoSpotlightActive,
    detoxMessageActive,
  ])

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

  const phaseLabel =
    gameState.voxPopuli?.status === 'active' && gameState.phase === 'final3_decision'
      ? 'Final Audience Vote'
      : gameState.voxPopuli?.status === 'active' && gameState.phase.startsWith('final3_comp')
        ? 'Final Immunity'
        : formatPhaseLabel(gameState.phase)
  const shortPhaseLabel = compactPhaseLabel(gameState.phase)
  const headerRef = useRef<HTMLDivElement>(null)
  const headerPillsRef = useRef<HTMLUListElement>(null)
  const headerActionsRef = useRef<HTMLDivElement>(null)
  const phaseMeasureRef = useRef<HTMLSpanElement>(null)
  const [compactPhaseChip, setCompactPhaseChip] = useState(false)

  useLayoutEffect(() => {
    const header = headerRef.current
    const pills = headerPillsRef.current
    const actions = headerActionsRef.current
    const phaseMeasure = phaseMeasureRef.current
    if (!header || !pills || !actions || !phaseMeasure) return

    const measure = () => {
      // Full phase text + chip padding, status-chip content, action controls,
      // header padding and inter-column gaps. Shorten only if that real total
      // cannot fit; viewport width alone is deliberately not used.
      const fullPhaseWidth = phaseMeasure.getBoundingClientRect().width + 14
      const requiredWidth = fullPhaseWidth + pills.scrollWidth + actions.offsetWidth + 20
      setCompactPhaseChip(requiredWidth > header.clientWidth + 0.5)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    observer.observe(pills)
    observer.observe(actions)
    return () => observer.disconnect()
  })
  const isAtGameStart =
    gameState.week === 1 && (gameState.phase === 'season_start' || gameState.phase === 'week_start')
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
  const isCupidOutlinePulse = cupidOutlinePulseActive
  const isLiveVoteFocus = voteResultsRevealActive

  const handleSave = useCallback(() => {
    if (!canSave || !activeProfileId) return

    const currentState = reduxStore.getState()
    const ok = saveRunSnapshot(
      activeProfileId,
      createSavedSeasonSnapshot(activeProfileId, currentState)
    )
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
        isCupidOutlinePulse ? 'tv-zone--cupid-outline-pulse' : '',
        isLiveVoteFocus ? 'tv-zone--live-vote-focus' : '',
        detoxMessageActive ? 'tv-zone--detox-stream' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={tvZoneRef}
      aria-label="Game action zone"
      style={
        {
          '--de-spotlight-ms': `${DOUBLE_EVICTION_SPOTLIGHT_MS}ms`,
          '--cupid-outline-pulse-ms': `${DOUBLE_EVICTION_SPOTLIGHT_MS}ms`,
        } as CSSProperties
      }
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
      <div
        ref={headerRef}
        className={`tv-zone__head${compactPhaseChip ? ' tv-zone__head--compact-phase' : ''}`}
      >
        {/* Left: pinned phase chip */}
        <div className="tv-zone__head-phase">
          <span ref={phaseMeasureRef} className="tv-zone__phase-measure" aria-hidden="true">
            {phaseLabel}
          </span>
          <GameTopChip
            label={phaseLabel}
            compactLabel={shortPhaseLabel}
            ariaLabel={phaseLabel}
            tone="accent"
            className="tv-zone__head-chip tv-zone__phase-chip"
          />
        </div>

        {/* Center: scrollable single-row status chips */}
        <ul ref={headerPillsRef} className="tv-zone__head-pills" aria-label="Game status chips">
          <li>
            <GameTopChip
              label={
                gameState.mode === 'survival'
                  ? formatSurveyevalCycleLabel(gameState.week)
                  : formatCycleLabel(gameState.season, gameState.week)
              }
              ariaLabel={
                gameState.mode === 'survival'
                  ? `Day ${gameState.week}`
                  : formatCycleAriaLabel(gameState.season, gameState.week)
              }
              tone="neutral"
              className="tv-zone__head-chip"
            />
          </li>
          {props.audiencePreviewAction && (
            <li>
              <button
                type="button"
                className={[
                  'tv-zone__audience-preview-chip',
                  props.audiencePreviewAction.spotlight
                    ? 'tv-zone__audience-preview-chip--spotlight'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={props.audiencePreviewAction.onClick}
                disabled={props.audiencePreviewAction.disabled}
              >
                <span aria-hidden="true">◉</span>
                {props.audiencePreviewAction.disabled ? 'Checked' : 'Check vote'}
              </button>
            </li>
          )}
        </ul>

        <div ref={headerActionsRef} className="tv-zone__head-actions">
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
            className={[
              'tv-zone__viewport',
              dailyTransitionPhase || depressionShockRainyTv || depressionShockSunnyTv
                ? 'tv-zone__viewport--daily-transition'
                : '',
              dailyTransitionPhase && presentedDailyAtmosphere
                ? `tv-zone__viewport--${dailyTransitionPhase === 'week_start' ? 'day-start' : 'day-end'}-${presentedDailyAtmosphere}`
                : '',
              depressionShockRainyTv ? 'tv-zone__viewport--day-start-rainy' : '',
              depressionShockSunnyTv ? 'tv-zone__viewport--day-start-sunny' : '',
              voteResultsRevealActive ? 'tv-zone__viewport--vote-results' : '',
              props.voteResultsReveal?.resultMode === 'public'
                ? 'tv-zone__viewport--public-results'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="region"
            aria-label="Live game events display"
            aria-live="polite"
            aria-atomic="true"
          >
            {((dailyTransitionPhase && presentedDailyAtmosphere) ||
              depressionShockRainyTv ||
              depressionShockSunnyTv) && (
              <div
                className={`tv-zone__daily-atmosphere tv-zone__daily-atmosphere--${depressionShockRainyTv ? 'rainy' : depressionShockSunnyTv ? 'sunny' : presentedDailyAtmosphere}`}
                data-moon-phase={
                  !depressionShockRainyTv &&
                  !depressionShockSunnyTv &&
                  presentedDailyAtmosphere === 'starry'
                    ? dailyMoonPhase
                    : undefined
                }
                aria-hidden="true"
              >
                <span className="tv-zone__daily-fog" />
                <span className="tv-zone__daily-orb" />
                <span className="tv-zone__daily-cloud tv-zone__daily-cloud--one" />
                <span className="tv-zone__daily-cloud tv-zone__daily-cloud--two" />
                <span className="tv-zone__daily-cloud tv-zone__daily-cloud--three" />
                <span className="tv-zone__daily-rain" />
              </div>
            )}
            <div
              className={[
                'tv-zone__message-stage',
                depressionShockRainyTv
                  ? 'tv-zone__daily-card tv-zone__daily-card--rainy'
                  : depressionShockSunnyTv
                    ? 'tv-zone__daily-card tv-zone__daily-card--sunny'
                    : dailyTransitionPhase && presentedDailyAtmosphere
                      ? `tv-zone__daily-card tv-zone__daily-card--${presentedDailyAtmosphere}`
                      : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <p
                key={viewportMessageKey}
                aria-hidden={hideViewportMessage}
                className={[
                  'tv-zone__now',
                  cupidFollowUpVisible ? 'tv-zone__now--cupid-follow-up' : '',
                  depressionShockRainyTv ? 'tv-zone__now--depression-shock' : '',
                  !detoxMessageActive && displayedEvent ? 'tv-zone__now--quick-transition' : '',
                  detoxMessageActive ? 'tv-zone__now--detox-stream' : '',
                  hideViewportMessage ? 'tv-zone__now--hidden' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={hideViewportMessage ? { opacity: 0 } : undefined}
              >
                {viewportDisplayText}
              </p>
            </div>

            {/* Twist badge — broadcast-style corner ribbon anchored to the viewport */}
            {props.audiencePreviewReveal && (
              <VoxAudiencePulseReveal
                players={props.audiencePreviewReveal.players}
                percentages={props.audiencePreviewReveal.percentages}
                onComplete={props.audiencePreviewReveal.onComplete}
              />
            )}

            {gameState.twistActive && (
              <div className="tv-zone__twist-badge" aria-hidden="true">
                <span>🌀</span>
                SHOCK
              </div>
            )}

            {winnerBroadcast && (
              <TvAnnouncementOverlay
                announcement={{
                  key: 'season_winner',
                  // i18n-ignore: Canonical in-world winner announcement title
                  title: `${winnerBroadcast.name} Won Season ${gameState.season} of The Big Eye`,
                  subtitle:
                    gameState.voxPopuli?.winnerId === winnerBroadcast.id
                      ? AUDIENCE_WINNER_SUBTITLE
                      : TRIBUNAL_WINNER_SUBTITLE,
                  isLive: true,
                  autoDismissMs: null,
                }}
                showInfoButton={false}
              />
            )}

            {/* Cupid hands back to the standard faux-TV message stage after OK.
                Other announcements keep their established title-card overlay. */}
            {showInlineAnnouncement && activeAnnouncement && !cupidFollowUpVisible && (
              <TvAnnouncementOverlay
                key={activeAnnouncement.key}
                announcement={
                  cupidFollowUpVisible ? cupidFollowUpAnnouncement : displayedAnnouncement!
                }
                onInfo={handleInfo}
                onDismiss={handleDismiss}
                paused={modalOpen}
                infoButtonRef={announcementInfoButtonRef}
                hideTitle={cupidFollowUpVisible}
                showInfoButton={cupidFollowUpVisible || activeAnnouncement.key !== 'cupid_arrow'}
                // The pair reveal belongs to the avatar storm. Keeping the
                // follow-up copy short prevents the TV body from colliding
                // with the roster below it.
                cupidPairs={cupidFollowUpVisible ? [] : (gameState.cupidArrow?.pairs ?? [])}
                cupidPlayers={gameState.players}
                // ShockIntroOverlay already owns the only full-screen
                // presentation for this sequence. The inline card is the
                // deliberate faux-TV handoff, so it must never replay the
                // legacy full-screen prelude after OK.
                playShockPrelude={false}
              />
            )}

            {cupidFollowUpVisible && (
              <button
                type="button"
                className="tv-zone__cupid-info-btn"
                onClick={handleInfo}
                aria-label="More info about Cupid's Arrow"
                ref={announcementInfoButtonRef}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.75 12s3.2-5.35 9.25-5.35S21.25 12 21.25 12 18.05 17.35 12 17.35 2.75 12 2.75 12Z" />
                  <circle cx="12" cy="12" r="2.25" />
                  <path d="M12 3.3v1.15M12 19.55v1.15" />
                </svg>
              </button>
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
                resultMode={props.voteResultsReveal.resultMode}
                evictee={props.voteResultsReveal.evictee}
                evicteeIds={props.voteResultsReveal.evicteeIds}
                onTiebreakerRequired={props.voteResultsReveal.onTiebreakerRequired}
                publicTiebreak={props.voteResultsReveal.publicTiebreak}
                onPublicTiebreakResolved={props.voteResultsReveal.onPublicTiebreakResolved}
                onDone={props.voteResultsReveal.onDone}
                revealIntervalMs={syncedVoteRevealIntervalMs}
                postRevealDelayMs={VOTE_RESULTS_POST_REVEAL_MS}
                countdownMs={VOTE_RESULTS_OUTCOME_MS}
                variant="tv"
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
        launcherSuppressed={
          Boolean(props.rosterLogLauncher) || publicSaveRevealActive || activeAnnouncement != null
        }
        launcherHidden={
          gameState.phase === 'week_start' ||
          gameState.phase === 'week_end' ||
          (weatherCardActive && !houseFeedEnabled)
        }
        suppressLauncher={Boolean(props.voteResultsReveal)}
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
        announcement={displayedAnnouncement}
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
