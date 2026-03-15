/**
 * SilentSaboteurComp — React UI for the "Silent Saboteur" minigame.
 *
 * Phases: intro → select_saboteur → select_victim → voting → reveal →
 *         round_transition → (loop) → final2_jury → winner → complete
 *
 * Human interactions:
 *   - select_victim  (if human is saboteur): choose a target
 *   - voting         (if human is active): vote for suspected saboteur
 *   - final2_jury    (if human is a juror): vote for who planted the bomb
 *
 * All AI actions are dispatched automatically via useEffect timers.
 * Timer expiry calls endVotingPhase (abstentions allowed — no auto-random vote).
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store/store';
import {
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  endVotingPhase,
  advanceReveal,
  startNextRound,
  submitJuryVote,
  advanceWinner,
} from '../../features/silentSaboteur/silentSaboteurSlice';
import { resolveSilentSaboteurOutcome } from '../../features/silentSaboteur/thunks';
import { pickVictimForAi, pickVoteForAi, pickVoteForAiOrAbstain, getValidSaboteurCandidates, fnv1a32 } from '../../features/silentSaboteur/helpers';
import { mulberry32 } from '../../store/rng';
import type {
  SilentSaboteurPrizeType,
} from '../../features/silentSaboteur/silentSaboteurSlice';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import './SilentSaboteurComp.css';

// ─── Centralized timing constants ─────────────────────────────────────────────

const SILENT_SABOTEUR_TIMINGS = {
  /** Intro hold before advancing. */
  INTRO_MS: 7000,
  /** AI saboteur cinematic screen length. */
  SABOTEUR_CHOOSING_MS: 3500,
  /** Human saboteur timeout fallback. */
  SELECT_VICTIM_TIMEOUT_MS: 10_000,
  /** AI voting stagger window minimum. */
  AI_VOTE_STAGGER_MIN_MS: 3200,
  /** AI voting stagger window maximum. */
  AI_VOTE_STAGGER_MAX_MS: 5000,
  /** Voting phase shared timer — 120 seconds. */
  VOTING_TIMER_MS: 120_000,
  /** Jury vote shared timer — 120 seconds. */
  JURY_TIMER_MS: 120_000,
  /** Delay between sequential vote reveals. */
  VOTE_REVEAL_STEP_MS: 520,
  /** Pause after all votes revealed before showing elimination card. */
  REVEAL_RESULT_PAUSE_MS: 1500,
  /** Elimination card hold time. */
  ELIMINATION_HOLD_MS: 2800,
  /** Round transition hold. */
  ROUND_TRANSITION_MS: 2000,
  /** Countdown ticker interval. */
  TIMER_TICK_MS: 250,
} as const;

const SILENT_SABOTEUR_VOTE_JITTER_MS = 90;
const SILENT_SABOTEUR_VOTE_JITTER_SPAN = (SILENT_SABOTEUR_VOTE_JITTER_MS * 2) + 1;

type RevealStage = 'votes' | 'accusationResult' | 'elimination';

/**
 * Local state machine for the Final-2 staged cinematic flow.
 * Controlled entirely by the component; does not affect Redux state.
 *
 *  FINAL2_INTRO ──(button)──▶ FINAL2_VOTING
 *  FINAL2_VOTING ──(jury votes done, Redux → winner)──▶ FINAL2_VERDICT_LOCKED
 *  FINAL2_VERDICT_LOCKED ──(button)──▶ FINAL2_REVEAL
 *  FINAL2_REVEAL ──(1.5s delay + button)──▶ FINAL2_WINNER
 *  FINAL2_WINNER ──(button)──▶ (dispatch advanceWinner → complete → onComplete)
 */
type Final2Stage =
  | 'FINAL2_INTRO'
  | 'FINAL2_VOTING'
  | 'FINAL2_VERDICT_LOCKED'
  | 'FINAL2_REVEAL'
  | 'FINAL2_WINNER';

// ─── Social Map types ─────────────────────────────────────────────────────────

type RelationshipCategory = 'Hostile' | 'Unfriendly' | 'Neutral' | 'Friendly' | 'Loyal';

interface SuspectCard {
  id: string;
  name: string;
  relationship: RelationshipCategory;
  /** 0–4: 0 = most hostile, 4 = most loyal */
  relationshipStrength: number;
  traits: [string, string];
  hint: string;
}

const PERSONALITY_TRAITS = [
  'Calculating', 'Impulsive', 'Loyal', 'Deceptive', 'Observant',
  'Paranoid', 'Strategic', 'Emotional', 'Ruthless', 'Diplomatic',
  'Overconfident', 'Cautious', 'Charming', 'Secretive', 'Outspoken',
];

const RELATIONSHIP_LABELS: RelationshipCategory[] = [
  'Hostile', 'Unfriendly', 'Neutral', 'Friendly', 'Loyal',
];

const RELATIONSHIP_COLORS: Record<RelationshipCategory, string> = {
  Hostile: '#ef4444',
  Unfriendly: '#f97316',
  Neutral: '#64748b',
  Friendly: '#22c55e',
  Loyal: '#3b82f6',
};

function isDicebearAvatarUrl(src: string): boolean {
  try {
    return new URL(src, 'https://example.invalid').hostname === 'api.dicebear.com';
  } catch {
    return false;
  }
}

const isNonDicebearAvatar = (src: string) => !isDicebearAvatarUrl(src);

function buildSuspectCards(
  suspects: string[],
  victimId: string,
  seed: number,
  getName: (id: string) => string,
): SuspectCard[] {
  return suspects.map((id) => {
    const idHash = fnv1a32(id);
    const victimHash = fnv1a32(victimId);
    const cardSeed = ((seed ^ idHash ^ victimHash ^ 0xdecafbad) >>> 0);
    const rng = mulberry32(cardSeed);
    const relIdx = Math.floor(rng() * 5);
    const traitAIdx = Math.floor(rng() * PERSONALITY_TRAITS.length);
    const traitA = PERSONALITY_TRAITS[traitAIdx];
    // Ensure traitB is distinct from traitA
    const remainingTraits = PERSONALITY_TRAITS.filter((_, i) => i !== traitAIdx);
    const traitB = remainingTraits[Math.floor(rng() * remainingTraits.length)];
    const relationship = RELATIONSHIP_LABELS[relIdx];
    const hints: Record<RelationshipCategory, string> = {
      Hostile:    `${getName(id)} had reason to want ${getName(victimId)} out of the game.`,
      Unfriendly: `${getName(id)} has had friction with ${getName(victimId)} before.`,
      Neutral:    `${getName(id)}'s connection to ${getName(victimId)} is unclear.`,
      Friendly:   `${getName(id)} and ${getName(victimId)} seemed close — could be a cover.`,
      Loyal:      `${getName(id)} vouched for ${getName(victimId)}. Too close to be suspicious?`,
    };
    return {
      id,
      name: getName(id),
      relationship,
      relationshipStrength: relIdx,
      traits: [traitA, traitB],
      hint: hints[relationship],
    };
  });
}

/** Format milliseconds as mm:ss (e.g. 01:42). */
function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: SilentSaboteurPrizeType;
  seed: number;
  onComplete?: () => void;
  standalone?: boolean;
}

function areAnimationsDisabled() {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function emitSilentSaboteurEvent(type: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(`silentSaboteur:${type}`, { detail }));
  } catch {
    // ignore — optional presentation hook only
  }
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function getAvatarGridRows(ids: string[], dense = false): string[][] {
  const denseLayouts: Record<number, number[]> = {
    2: [2],
    3: [1, 2],
    4: [2, 2],
    5: [3, 2],
    6: [3, 3],
    7: [4, 3],
    8: [4, 4],
    9: [3, 3, 3],
    10: [4, 3, 3],
    11: [4, 4, 3],
    12: [4, 4, 4],
  };
  const exactLayouts: Record<number, number[]> = {
    2: [2],
    3: [1, 2],
    4: [2, 2],
    6: [3, 3],
    8: [4, 4],
    9: [3, 3, 3],
    12: [4, 4, 4],
  };

  const layout = (dense ? denseLayouts : exactLayouts)[ids.length];
  if (layout) {
    const rows: string[][] = [];
    let cursor = 0;
    for (const size of layout) {
      rows.push(ids.slice(cursor, cursor + size));
      cursor += size;
    }
    return rows;
  }

  if (ids.length <= 1) return [ids];

  const maxColumns = ids.length >= 10 ? 4 : ids.length >= 7 ? 4 : 3;
  const rowCount = Math.ceil(ids.length / maxColumns);
  const baseSize = Math.floor(ids.length / rowCount);
  const remainder = ids.length % rowCount;
  const sizes = Array.from(
    { length: rowCount },
    (_, idx) => baseSize + (idx >= rowCount - remainder ? 1 : 0),
  );

  const rows: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    rows.push(ids.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

function buildStaggeredDelays(ids: string[], seed: number) {
  const orderedIds = [...ids].sort((a, b) => {
    const aKey = (fnv1a32(a) ^ seed) >>> 0;
    const bKey = (fnv1a32(b) ^ seed) >>> 0;
    return aKey - bKey;
  });
  const durationRange =
    SILENT_SABOTEUR_TIMINGS.AI_VOTE_STAGGER_MAX_MS - SILENT_SABOTEUR_TIMINGS.AI_VOTE_STAGGER_MIN_MS;
  const totalDuration =
    SILENT_SABOTEUR_TIMINGS.AI_VOTE_STAGGER_MIN_MS + (((seed >>> 0) % (durationRange + 1)));
  const firstDelay = Math.min(900, Math.max(450, Math.floor(totalDuration * 0.25)));
  const lastDelay = Math.max(firstDelay, totalDuration);

  return orderedIds.map((id, idx) => {
    const ratio = orderedIds.length <= 1 ? 1 : idx / (orderedIds.length - 1);
    const baseDelay = Math.round(firstDelay + ((lastDelay - firstDelay) * ratio));
    const jitterSeed =
      (((fnv1a32(id) ^ seed) >>> 0) % SILENT_SABOTEUR_VOTE_JITTER_SPAN)
      - SILENT_SABOTEUR_VOTE_JITTER_MS;
    const delay = Math.max(350, Math.min(totalDuration, baseDelay + jitterSeed));
    return { id, delay };
  });
}

/**
 * Renders a Silent Saboteur player portrait using the shared avatar resolver.
 * Prefers local portrait image assets, explicitly skips Dicebear, and falls
 * back to emoji/initials only when no real image can be shown.
 *
 * The keyed wrapper intentionally remounts the inner stateful renderer when the
 * displayed player changes, so image-error fallback state never leaks from one
 * portrait to the next across rounds.
 */
function HouseguestPortrait({
  id,
  name,
  avatar = '',
  sizeClass = '',
}: {
  id: string;
  name: string;
  avatar?: string;
  sizeClass?: string;
}) {
  const candidates = useMemo(
    () => resolveAvatarCandidates({ id, name, avatar }).filter(isNonDicebearAvatar),
    [id, name, avatar],
  );

  return (
    <HouseguestPortraitInner
      key={id}
      id={id}
      name={name}
      avatar={avatar}
      candidates={candidates}
      sizeClass={sizeClass}
    />
  );
}

function HouseguestPortraitInner({
  id,
  name,
  avatar = '',
  candidates,
  sizeClass = '',
}: {
  id: string;
  name: string;
  avatar?: string;
  candidates: string[];
  sizeClass?: string;
}) {
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  const src = candidates[candidateIdx] ?? '';

  if (showFallback || !src) {
    const fallback = isEmoji(avatar) ? avatar : getInitial(name);
    return (
      <div className={`ss-victim-avatar ${sizeClass}`} aria-hidden="true">
        {fallback}
      </div>
    );
  }

  return (
    <div className={`ss-victim-avatar ${sizeClass}`} aria-hidden="true">
      <img
        src={src}
        alt=""
        className="ss-victim-avatar__img"
        data-testid={`ss-portrait-${id}`}
        onError={() => {
          if (candidateIdx < candidates.length - 1) {
            setCandidateIdx((idx) => idx + 1);
          } else {
            setShowFallback(true);
          }
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SilentSaboteurComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
  standalone = false,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const ss = useSelector(
    (s: RootState & { silentSaboteur?: ReturnType<typeof import('../../features/silentSaboteur/silentSaboteurSlice').default> }) =>
      s.silentSaboteur,
  );

  const [bombRevealVisible, setBombRevealVisible] = useState(false);
  const [revealStage, setRevealStage] = useState<RevealStage>('votes');
  const [revealedVoteCount, setRevealedVoteCount] = useState(0);
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [socialMapOpen, setSocialMapOpen] = useState(false);
  /** Locks manual non-Final-2 CTA clicks until the beat changes. */
  const [majorBeatActionLocked, setMajorBeatActionLocked] = useState(false);

  // ── Final-2 cinematic local state ──────────────────────────────────────────
  /** Current stage of the Final-2 cinematic flow; null = not in Final-2 mode. */
  const [final2Stage, setFinal2Stage] = useState<Final2Stage | null>(null);
  /** True after the 1.5-second reveal delay has elapsed in FINAL2_REVEAL. */
  const [final2RevealDone, setFinal2RevealDone] = useState(false);
  /** Locks manual Final-2 CTA clicks until the stage changes. */
  const [final2ActionLocked, setFinal2ActionLocked] = useState(false);
  /**
   * Captured finalist IDs at the moment the game enters final2_jury.
   * Persists through the winner/complete transition when activeIds may differ.
   */
  const final2FinalistIdsRef = useRef<string[]>([]);

  /**
   * True once the Final-2 cinematic begins (set when final2Stage is first assigned).
   * Stays true until the final Continue is clicked so the complete effect can gate
   * the onComplete callback.
   *
   * Note: this is a per-instance ref (initialized to false on every mount), so
   * unmounting and remounting the component always starts clean — no explicit
   * cleanup needed.
   */
  const isFinal2CinematicActiveRef = useRef(false);
  /**
   * Set to true when Redux reaches 'complete' while the Final-2 cinematic is still
   * running.  The parent is notified only after the user clicks the winner Continue.
   */
  const pendingCompletionRef = useRef(false);

  // Guard: prevent duplicate timer-driven phase advances
  const votingTimerFiredRef = useRef(false);

  const animationsDisabled = areAnimationsDisabled();

  // Resolve name lookup
  const nameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of (participants ?? [])) {
      map[p.id] = p.name;
    }
    return map;
  }, [participants]);

  const getName = useCallback(
    (id: string) => nameMap[id] ?? id,
    [nameMap],
  );

  // Derive values from state (using defaults when ss is not yet initialized)
  const phase = ss?.phase ?? 'idle';
  const eliminatedIds = ss?.eliminatedIds ?? [];
  const humanPlayerId = ss?.humanPlayerId ?? null;
  const saboteurId = ss?.saboteurId ?? null;
  const victimId = ss?.victimId ?? null;
  const revealInfo = ss?.revealInfo ?? null;
  const final2SaboteurId = ss?.final2SaboteurId ?? null;
  const final2VictimId = ss?.final2VictimId ?? null;
  const winnerId = ss?.winnerId ?? null;
  const round = ss?.round ?? 0;

  // Stable references for array/object-typed state to avoid exhaustive-deps warnings
  const activeIds = useMemo(() => ss?.activeIds ?? [], [ss?.activeIds]);
  const votes = useMemo(() => ss?.votes ?? {}, [ss?.votes]);
  const juryVotes = useMemo(() => ss?.juryVotes ?? {}, [ss?.juryVotes]);
  const revealVoteEntries = useMemo<Array<[string, string]>>(
    () => (revealInfo ? Object.entries(revealInfo.votes) : []),
    [revealInfo],
  );

  const isHumanActive = humanPlayerId !== null && activeIds.includes(humanPlayerId);
  const isHumanSaboteur = humanPlayerId !== null && saboteurId === humanPlayerId;
  const isHumanJuror = humanPlayerId !== null && eliminatedIds.includes(humanPlayerId);
  const final2Mode = phase === 'final2_jury';
  /**
   * ID of the finalist the jury majority accused of planting the bomb.
   * Computed from juryVotes once voting is complete (phase ≥ winner).
   */
  const juryVoteMeta = useMemo(() => {
    const vals = Object.values(juryVotes);
    const total = vals.length;
    if (total === 0) {
      return {
        counts: {} as Record<string, number>,
        leaderIds: [] as string[],
        majorityId: null as string | null,
        total: 0,
      };
    }
    const counts: Record<string, number> = {};
    for (const v of vals) counts[v] = (counts[v] ?? 0) + 1;
    let maxCount = 0;
    for (const count of Object.values(counts)) {
      if (count > maxCount) {
        maxCount = count;
      }
    }
    const leaderIds = Object.entries(counts)
      .filter(([, count]) => count === maxCount)
      .map(([id]) => id);
    const majorityId = leaderIds.length === 1 && maxCount > total / 2 ? leaderIds[0] : null;
    return { counts, leaderIds, majorityId, total };
  }, [juryVotes]);
  const juryAccusedId = juryVoteMeta.majorityId;


  const countdownDurationMs = final2Mode
    ? SILENT_SABOTEUR_TIMINGS.JURY_TIMER_MS
    : SILENT_SABOTEUR_TIMINGS.VOTING_TIMER_MS;
  const remainingCountdownMs =
    countdownStartedAt == null
      ? countdownDurationMs
      : Math.max(0, countdownDurationMs - (countdownNow - countdownStartedAt));

  // Valid suspect targets for the human voter in normal rounds
  const humanVoteCandidates = useMemo(
    () => getValidSaboteurCandidates(activeIds, humanPlayerId ?? '', victimId),
    [activeIds, humanPlayerId, victimId],
  );

  // ── Init ───────────────────────────────────────────────────────────────────
  // Empty deps: intentionally fires once on mount. participantIds/prizeType/seed
  // are stable for the lifetime of the competition.
  useEffect(() => {
    const humanId = participants?.find((p) => p.isHuman)?.id ?? null;
    dispatch(
      initSilentSaboteur({
        participantIds,
        prizeType,
        seed,
        humanPlayerId: humanId,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase-driven side effects (all hooks unconditionally declared)
  // ─────────────────────────────────────────────────────────────────────────

  // Intro: auto-advance
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => dispatch(advanceIntro()), SILENT_SABOTEUR_TIMINGS.INTRO_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch]);

  // Bomb reveal: cinematic hold before showing voting UI.
  useEffect(() => {
    if (phase !== 'voting' || !victimId) {
      setBombRevealVisible(false);
      return;
    }
    setBombRevealVisible(true);
    // Reset the timer-fired guard so endVotingPhase can fire when this new
    // voting phase's 120-second timer expires (guard prevents duplicate dispatches).
    votingTimerFiredRef.current = false;
    emitSilentSaboteurEvent('bomb-planted', { victimId, round });
  }, [phase, victimId, round]);

  // select_victim: AI saboteur auto-picks; human saboteur has timeout fallback.
  useEffect(() => {
    if (phase !== 'select_victim' || !saboteurId) return;

    if (!isHumanSaboteur) {
      // AI saboteur: hold on the anonymous cinematic screen before acting.
      const t = setTimeout(() => {
        const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
        dispatch(selectVictim({ victimId: victim }));
      }, SILENT_SABOTEUR_TIMINGS.SABOTEUR_CHOOSING_MS);
      return () => clearTimeout(t);
    }

    // Human saboteur: timeout fallback
    const t = setTimeout(() => {
      const candidates = activeIds.filter((id) => id !== saboteurId);
      if (candidates.length > 0) {
        const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
        dispatch(selectVictim({ victimId: victim }));
      }
    }, SILENT_SABOTEUR_TIMINGS.SELECT_VICTIM_TIMEOUT_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, saboteurId]); // intentional: one timer per phase entry

  // voting: AI voters auto-vote.
  // Human voter may vote voluntarily or abstain (no forced auto-vote fallback).
  // Timer expiry handled in a separate effect below.
  useEffect(() => {
    if (phase !== 'voting' || bombRevealVisible) return;

    const aiVoters = activeIds.filter((id) => id !== humanPlayerId);
    const delays: ReturnType<typeof setTimeout>[] = [];

    for (const { id: voterId, delay } of buildStaggeredDelays(aiVoters, seed ^ round ^ fnv1a32(victimId ?? ''))) {
      if (votes[voterId] !== undefined) continue;
      const t = setTimeout(() => {
        // AI vote: valid suspects = activePlayers - self - victim
        const accused = pickVoteForAiOrAbstain(seed, round, voterId, activeIds, victimId);
        if (accused == null) return;
        dispatch(submitVote({ voterId, accusedId: accused }));
      }, delay);
      delays.push(t);
    }

    return () => delays.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bombRevealVisible]); // intentional: one batch per visible voting phase

  // voting timer: starts when bomb reveal ends; dispatches endVotingPhase on expiry.
  // Opening the Social Map does NOT pause or reset this timer.
  useEffect(() => {
    if (phase !== 'voting' || bombRevealVisible) return;
    const delay = animationsDisabled
      ? 50
      : SILENT_SABOTEUR_TIMINGS.VOTING_TIMER_MS;
    const t = setTimeout(() => {
      if (votingTimerFiredRef.current) return; // prevent duplicate
      votingTimerFiredRef.current = true;
      dispatch(endVotingPhase());
    }, delay);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bombRevealVisible]); // intentional: one timer per visible voting phase

  // Visible countdown start for voting / jury voting.
  useEffect(() => {
    const countdownActive = (phase === 'voting' && !bombRevealVisible) || phase === 'final2_jury';
    if (!countdownActive) {
      setCountdownStartedAt(null);
      return;
    }
    const now = Date.now();
    setCountdownStartedAt(now);
    setCountdownNow(now);
  }, [phase, bombRevealVisible]);

  // Countdown ticker.
  useEffect(() => {
    if (countdownStartedAt == null) return;
    const i = setInterval(() => setCountdownNow(Date.now()), SILENT_SABOTEUR_TIMINGS.TIMER_TICK_MS);
    return () => clearInterval(i);
  }, [countdownStartedAt]);

  // Social map: close automatically when voting phase ends
  useEffect(() => {
    if (phase !== 'voting') {
      setSocialMapOpen(false);
    }
  }, [phase]);

  // reveal: sequential vote reveal followed by manual accusation and elimination beats.
  useEffect(() => {
    if (phase !== 'reveal' || !revealInfo) {
      setRevealedVoteCount(0);
      setRevealStage('votes');
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const voteStepMs = animationsDisabled ? 0 : SILENT_SABOTEUR_TIMINGS.VOTE_REVEAL_STEP_MS;
    const resultPauseMs = animationsDisabled ? 0 : SILENT_SABOTEUR_TIMINGS.REVEAL_RESULT_PAUSE_MS;
    const voteCount = revealVoteEntries.length;

    if (voteStepMs === 0) {
      setRevealedVoteCount(voteCount);
      setRevealStage('accusationResult');
      emitSilentSaboteurEvent(
        revealInfo.reason === 'saboteur_caught' ? 'saboteur-caught' : 'explosion',
        { eliminatedId: revealInfo.eliminatedId, victimId: revealInfo.victimId },
      );
      return () => timers.forEach(clearTimeout);
    }

    setRevealedVoteCount(0);
    setRevealStage('votes');

    revealVoteEntries.forEach(([voterId, accusedId], idx) => {
      timers.push(
        setTimeout(() => {
          setRevealedVoteCount(idx + 1);
          emitSilentSaboteurEvent('vote-reveal', { voterId, accusedId, round });
        }, voteStepMs * (idx + 1)),
      );
    });

    const votesDoneAt = voteStepMs * Math.max(voteCount, 1);
    timers.push(
      setTimeout(() => {
        setRevealStage('accusationResult');
        emitSilentSaboteurEvent(
          revealInfo.reason === 'saboteur_caught' ? 'saboteur-caught' : 'explosion',
          { eliminatedId: revealInfo.eliminatedId, victimId: revealInfo.victimId },
        );
      }, votesDoneAt + resultPauseMs),
    );

    return () => timers.forEach(clearTimeout);
  }, [phase, revealInfo, revealVoteEntries, round, animationsDisabled]);

  // final2_jury: 120s shared timer; human juror timeout dispatches jury vote.
  useEffect(() => {
    if (phase !== 'final2_jury') return;
    if (!isHumanJuror || !final2SaboteurId || !final2VictimId) return;
    if (humanPlayerId && juryVotes[humanPlayerId] !== undefined) return;

    const delay = animationsDisabled ? 50 : SILENT_SABOTEUR_TIMINGS.JURY_TIMER_MS;
    const t = setTimeout(() => {
      if (!humanPlayerId) return;
      const finalists = [final2SaboteurId, final2VictimId];
      const accused = pickVoteForAi(seed, 9999, humanPlayerId, finalists, null);
      const safeAccused = finalists.includes(accused) ? accused : finalists[0];
      dispatch(submitJuryVote({ jurorId: humanPlayerId, accusedId: safeAccused }));
    }, delay);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, juryVotes]); // intentional: one timer per phase/vote-change

  // ── Final-2 cinematic effects ──────────────────────────────────────────────

  // Detect Final-2 game entry: capture finalists and set initial cinematic stage.
  useEffect(() => {
    if (phase !== 'final2_jury' || final2Stage !== null) return;
    final2FinalistIdsRef.current = [...activeIds];
    isFinal2CinematicActiveRef.current = true;
    setFinal2Stage('FINAL2_INTRO');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, final2Stage]); // stable: only needs phase and whether we've started

  // Detect jury verdict complete: Redux transitions final2_jury → winner (or complete).
  // Also handles the case where Redux has already advanced past 'winner' to 'complete'
  // before the user reaches FINAL2_VOTING (fast AI-only games).
  useEffect(() => {
    if (final2Stage !== 'FINAL2_VOTING') return;
    if (phase !== 'winner' && phase !== 'complete') return;
    setFinal2Stage('FINAL2_VERDICT_LOCKED');
  }, [phase, final2Stage]);

  // AI jurors auto-vote during FINAL2_VOTING.
  // Runs once per juryVotes change so newly-needed timers are set after each vote.
  useEffect(() => {
    if (final2Stage !== 'FINAL2_VOTING' || phase !== 'final2_jury') return;
    if (!final2SaboteurId || !final2VictimId) return;

    const aiJurors = eliminatedIds.filter(
      (id) => id !== humanPlayerId && juryVotes[id] === undefined,
    );
    if (aiJurors.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const finalists = [final2SaboteurId, final2VictimId];
    for (const { id: jurorId, delay } of buildStaggeredDelays(aiJurors, seed ^ 9999 ^ round)) {
      const t = setTimeout(() => {
        const accused = pickVoteForAi(seed, 9999, jurorId, finalists, null);
        const safeAccused = finalists.includes(accused) ? accused : finalists[0];
        dispatch(submitJuryVote({ jurorId, accusedId: safeAccused }));
      }, animationsDisabled ? 0 : delay);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final2Stage, phase, juryVotes]); // one batch per vote-change

  // Reveal sequence: 1.5-second delay before saboteur is unmasked.
  useEffect(() => {
    if (final2Stage !== 'FINAL2_REVEAL') {
      setFinal2RevealDone(false);
      return;
    }
    const delayMs = animationsDisabled ? 0 : 1500;
    const t = setTimeout(() => setFinal2RevealDone(true), delayMs);
    return () => clearTimeout(t);
  }, [final2Stage, animationsDisabled]);

  // Final-2 CTA buttons are single-fire per stage. Unlock once the stage changes.
  useEffect(() => {
    setFinal2ActionLocked(false);
  }, [final2Stage]);

  // Non-Final-2 beat CTA buttons are single-fire per beat. Unlock when the
  // visible non-Final-2 informational beat changes; Final-2 has its own lock.
  useEffect(() => {
    setMajorBeatActionLocked(false);
  }, [phase, bombRevealVisible, revealStage]);

  useEffect(() => {
    if (phase !== 'winner' || !winnerId) return;
    emitSilentSaboteurEvent('victory', { winnerId });
  }, [phase, winnerId]);

  // complete: dispatch outcome + notify parent.
  // During Final-2 cinematic, defer the parent notification until the user
  // clicks the final Continue button (see handleFinal2WinnerContinue).
  useEffect(() => {
    if (phase !== 'complete') return;
    if (!standalone) {
      dispatch(resolveSilentSaboteurOutcome());
    }
    if (isFinal2CinematicActiveRef.current) {
      // Cinematic is still running — store the pending completion and do NOT
      // call onComplete() yet; it will be called in handleFinal2WinnerContinue.
      pendingCompletionRef.current = true;
    } else {
      onComplete?.();
    }
  // onComplete is intentionally excluded: stable callback ref; adding it would
  // cause double-fires when the host re-renders the component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dispatch, standalone]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    (accusedId: string) => {
      if (!humanPlayerId || votes[humanPlayerId] !== undefined) return;
      // Client-side guard: victim cannot be accused in normal rounds
      if (accusedId === victimId) return;
      dispatch(submitVote({ voterId: humanPlayerId, accusedId }));
    },
    [dispatch, humanPlayerId, votes, victimId],
  );

  const handleSelectVictim = useCallback(
    (id: string) => {
      dispatch(selectVictim({ victimId: id }));
    },
    [dispatch],
  );

  const handleJuryVote = useCallback(
    (accusedId: string) => {
      if (!humanPlayerId) return;
      if (juryVotes[humanPlayerId] !== undefined) return;
      dispatch(submitJuryVote({ jurorId: humanPlayerId, accusedId }));
    },
    [dispatch, humanPlayerId, juryVotes],
  );

  const handleWinnerContinue = useCallback(() => {
    if (majorBeatActionLocked) return;
    setMajorBeatActionLocked(true);
    dispatch(advanceWinner());
  }, [dispatch, majorBeatActionLocked]);

  const handleBombRevealContinue = useCallback(() => {
    if (majorBeatActionLocked) return;
    setMajorBeatActionLocked(true);
    setBombRevealVisible(false);
  }, [majorBeatActionLocked]);

  const handleRevealAccusationContinue = useCallback(() => {
    if (majorBeatActionLocked) return;
    setMajorBeatActionLocked(true);
    setRevealStage('elimination');
  }, [majorBeatActionLocked]);

  const handleRevealEliminationContinue = useCallback(() => {
    if (majorBeatActionLocked) return;
    setMajorBeatActionLocked(true);
    dispatch(advanceReveal());
  }, [dispatch, majorBeatActionLocked]);

  const handleRoundTransitionContinue = useCallback(() => {
    if (majorBeatActionLocked) return;
    setMajorBeatActionLocked(true);
    dispatch(startNextRound());
  }, [dispatch, majorBeatActionLocked]);

  // ── Final-2 cinematic handlers ─────────────────────────────────────────────

  const handleFinal2ProceedToVoting = useCallback(() => {
    if (final2ActionLocked) return;
    setFinal2ActionLocked(true);
    setFinal2Stage('FINAL2_VOTING');
  }, [final2ActionLocked]);

  const handleFinal2RevealTruth = useCallback(() => {
    if (final2ActionLocked) return;
    setFinal2ActionLocked(true);
    setFinal2Stage('FINAL2_REVEAL');
  }, [final2ActionLocked]);

  const handleFinal2RevealContinue = useCallback(() => {
    if (final2ActionLocked) return;
    setFinal2ActionLocked(true);
    setFinal2Stage('FINAL2_WINNER');
  }, [final2ActionLocked]);

  /**
   * Final step of the Final-2 cinematic.
   * - Clears the cinematic active flag so the complete effect won't gate again.
   * - If Redux already reached 'complete' (pendingCompletion was set), call
   *   onComplete() directly.
   * - If Redux is still at 'winner', dispatch advanceWinner() → 'complete' →
   *   the complete effect will call onComplete() since the gate is now cleared.
   *
   * onComplete is included in the useCallback deps so that if the parent provides
   * a new reference between renders, the click handler always invokes the latest
   * version.  This is safe for useCallback (no risk of double-fires unlike useEffect).
   */
  const handleFinal2WinnerContinue = useCallback(() => {
    if (final2ActionLocked) return;
    setFinal2ActionLocked(true);
    isFinal2CinematicActiveRef.current = false;
    if (pendingCompletionRef.current) {
      pendingCompletionRef.current = false;
      onComplete?.();
    } else {
      dispatch(advanceWinner());
    }
  }, [dispatch, final2ActionLocked, onComplete]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render (early-exit guard after all hooks)
  // ─────────────────────────────────────────────────────────────────────────

  if (!ss) return null;

  return (
    <div className="ss-wrap" aria-live="polite">

      {phase === 'intro' && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-intro-card ss-cinematic">
            <div className="ss-bomb-icon" aria-hidden="true">💣</div>
            <h1 className="ss-title">Silent Saboteur</h1>
            <p className="ss-subtitle">Someone among you has planted a bomb…</p>
            <p className="ss-tagline">Read the room. Protect the victim. Expose the saboteur.</p>
            <AvatarTileGrid
              playerIds={activeIds}
              getName={getName}
              ariaLabel="Houseguests"
              compact={true}
              showNames={false}
            />
          </div>
        </div>
      )}

      {(phase === 'select_saboteur' || phase === 'select_victim') && (
        <div className="ss-stage ss-stage--centered">
          {phase === 'select_saboteur' && (
            <div className="ss-phase-card ss-cinematic">
              <p className="ss-phase-eyebrow">Hidden role assignment in progress</p>
              <p className="ss-phase-label">🔍 Selecting tonight&apos;s saboteur…</p>
            </div>
          )}

          {phase === 'select_victim' && (
            isHumanSaboteur ? (
              <div className="ss-phase-card ss-cinematic">
                <p className="ss-phase-eyebrow">Silent decision</p>
                <p className="ss-phase-label">💣 You are the saboteur.</p>
                <p className="ss-hint">Choose carefully. Your victim will shape the entire investigation.</p>
                <div className="ss-alert ss-alert--danger">You are the saboteur. Choose carefully.</div>
                <AvatarTileGrid
                  playerIds={activeIds.filter((id) => id !== saboteurId)}
                  getName={getName}
                  ariaLabel="Choose a target"
                  onSelect={handleSelectVictim}
                  selectedId={victimId}
                  variant="danger"
                />
              </div>
            ) : (
              <div className="ss-anonymous-screen ss-cinematic">
                <div className="ss-anonymous-screen__halo" aria-hidden="true" />
                <div className="ss-anonymous-screen__figure" aria-hidden="true">
                  <span className="ss-anonymous-screen__hood" />
                  <span className="ss-anonymous-screen__body" />
                </div>
                <p className="ss-phase-eyebrow ss-phase-eyebrow--danger">Silent decision</p>
                <p className="ss-anonymous-screen__title">The saboteur is choosing their next target…</p>
                <p className="ss-hint">No one else can see what happens in the dark.</p>
              </div>
            )
          )}
        </div>
      )}

      {phase === 'voting' && victimId && bombRevealVisible && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-bomb-reveal-stage">
            <div className="ss-bomb-reveal-emojis" aria-hidden="true">
              {['😱', '😨', '⚡', '💥', '😱', '⚡'].map((icon, idx) => (
                <span key={`${icon}-${idx}`} className="ss-bomb-reveal-emojis__item">{icon}</span>
              ))}
            </div>
            <div className="ss-phase-card ss-phase-card--bomb ss-bomb-reveal-card ss-cinematic" data-testid="ss-bomb-reveal">
              <p className="ss-phase-eyebrow ss-phase-eyebrow--danger">Bomb reveal</p>
              <h2 className="ss-reveal-title">A bomb has been planted.</h2>
              <VictimNotice
                playerId={victimId}
                name={getName(victimId)}
                subtitle="Find the saboteur before it detonates."
                spotlight={true}
                cinematic={true}
              />
              <ActionFooter>
                <button
                  className="ss-btn ss-action-btn ss-action-btn--reveal"
                  onClick={handleBombRevealContinue}
                  aria-label="Continue"
                  data-testid="ss-bomb-reveal-continue-btn"
                  disabled={majorBeatActionLocked}
                >
                  Continue
                </button>
              </ActionFooter>
            </div>
          </div>
        </div>
      )}

      {phase === 'voting' && victimId && !bombRevealVisible && (
        <div className="ss-phase-card ss-phase-card--vote">
          <VictimNotice
            playerId={victimId}
            name={getName(victimId)}
            subtitle="Who planted the bomb?"
          />
          <CountdownTimer
            remainingMs={remainingCountdownMs}
            totalMs={SILENT_SABOTEUR_TIMINGS.VOTING_TIMER_MS}
          />
          <h2 className="ss-phase-label">🗳️ Round {round + 1} — Investigation</h2>
          <p className="ss-hint">
            {isHumanActive && votes[humanPlayerId!] === undefined
              ? 'Study the room and accuse the saboteur. You may also abstain.'
              : isHumanActive
              ? '✅ Vote locked. Waiting for others or timer to expire…'
              : 'You are watching the investigation unfold.'}
          </p>
          {isHumanActive && votes[humanPlayerId!] === undefined ? (
            <>
              <AvatarTileGrid
                playerIds={humanVoteCandidates}
                getName={getName}
                ariaLabel="Accuse a saboteur"
                onSelect={handleVote}
                selectedId={humanPlayerId ? votes[humanPlayerId] : undefined}
                dense={true}
                variant="vote"
              />
              {/* Victim displayed separately — not accusable */}
              <div className="ss-victim-row">
                <span className="ss-victim-row__label">💣 In danger:</span>
                <span className="ss-victim-row__name">{getName(victimId)}</span>
                <span className="ss-victim-row__tag">Cannot be accused</span>
              </div>
            </>
          ) : (
            <AvatarTileGrid
              playerIds={activeIds.filter((id) => id !== victimId)}
              getName={getName}
              ariaLabel="Active suspects"
              compact={true}
              dense={true}
              showVoteState={true}
              votedIds={Object.keys(votes)}
              selectedId={humanPlayerId ? votes[humanPlayerId] : undefined}
            />
          )}
          {/* Social Map toggle */}
          <button
            className="ss-btn ss-btn--social-map"
            onClick={() => setSocialMapOpen(true)}
            aria-label="Open Social Map"
          >
            🗺️ Social Map
          </button>
          <ProgressMeter
            label="Vote Progress"
            participantIds={activeIds}
            submissions={votes}
            getName={getName}
            noun="votes"
          />
          {/* Social Map overlay */}
          {socialMapOpen && victimId && (
            <SocialMapOverlay
              victimId={victimId}
              suspects={humanVoteCandidates}
              seed={seed}
              remainingMs={remainingCountdownMs}
              totalMs={SILENT_SABOTEUR_TIMINGS.VOTING_TIMER_MS}
              getName={getName}
              onClose={() => setSocialMapOpen(false)}
              onVote={isHumanActive && votes[humanPlayerId!] === undefined ? handleVote : null}
            />
          )}
        </div>
      )}

      {phase === 'reveal' && revealInfo && (
        <div className={`ss-stage ${revealStage === 'votes' ? '' : 'ss-stage--centered'}`}>
          <div
            className={`ss-phase-card ss-cinematic ${
              revealStage === 'elimination'
                ? revealInfo.reason === 'saboteur_caught'
                  ? 'ss-phase-card--success'
                  : 'ss-phase-card--danger'
                : 'ss-phase-card--resolution'
            }`}
          >
            {revealStage === 'votes' ? (
              <>
                <p className="ss-phase-eyebrow">Vote reveal sequence</p>
                <h2 className="ss-phase-label">⚖️ The votes are coming in…</h2>
                <VoteRevealBoard
                  entries={revealVoteEntries}
                  revealedCount={revealedVoteCount}
                  getName={getName}
                />
                <p className="ss-hint hint-small">
                  {revealedVoteCount}/{revealVoteEntries.length} vote
                  {revealVoteEntries.length === 1 ? '' : 's'} revealed
                </p>
              </>
            ) : revealStage === 'accusationResult' ? (
              <>
                <p className="ss-phase-eyebrow">Accusation result</p>
                <h2 className="ss-reveal-title">
                  {revealInfo.reason === 'saboteur_caught'
                    ? 'The saboteur has been exposed!'
                    : 'The bomb detonates…'}
                </h2>
                {revealInfo.victimOverride && (
                  <p className="ss-override-badge">⚡ Victim Override Rule Applied</p>
                )}
                <VoteRevealBoard
                  entries={revealVoteEntries}
                  revealedCount={revealVoteEntries.length}
                  getName={getName}
                  settledFocusId={revealInfo.accusedId}
                />
                {revealInfo.reason === 'saboteur_caught' ? (
                  <p className="ss-reveal-body">
                    The house correctly identified <strong>{getName(revealInfo.saboteurId)}</strong>.
                  </p>
                ) : (
                  <p className="ss-reveal-body">
                    The house accused <strong>{getName(revealInfo.accusedId)}</strong>. The real saboteur stayed hidden.
                  </p>
                )}
                <VoteBreakdown
                  votes={revealInfo.votes}
                  saboteurId={revealInfo.saboteurId}
                  getName={getName}
                />
                <ActionFooter>
                  <button
                    className="ss-btn ss-action-btn"
                    onClick={handleRevealAccusationContinue}
                    aria-label="Continue"
                    data-testid="ss-reveal-result-continue-btn"
                    disabled={majorBeatActionLocked}
                  >
                    Continue
                  </button>
                </ActionFooter>
              </>
            ) : (
              <>
                <p className="ss-phase-eyebrow">
                  {revealInfo.reason === 'saboteur_caught' ? 'Saboteur caught' : 'Bomb detonated'}
                </p>
                <HouseguestPortrait
                  id={revealInfo.eliminatedId}
                  name={getName(revealInfo.eliminatedId)}
                  sizeClass="ss-victim-avatar--xl"
                />
                <h2 className="ss-reveal-title">
                  {getName(revealInfo.eliminatedId)} has been eliminated.
                </h2>
                <p className="ss-reveal-body">
                  {revealInfo.reason === 'saboteur_caught'
                    ? 'The saboteur has been removed from the game. The house survives another round.'
                    : `The sabotage succeeds. ${getName(revealInfo.victimId)} is gone.`}
                </p>
                <ActionFooter>
                  <button
                    className="ss-btn ss-action-btn"
                    onClick={handleRevealEliminationContinue}
                    aria-label="Continue"
                    data-testid="ss-elimination-continue-btn"
                    disabled={majorBeatActionLocked}
                  >
                    Continue
                  </button>
                </ActionFooter>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'round_transition' && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-cinematic">
            <p className="ss-phase-eyebrow">Aftermath</p>
            <p className="ss-phase-label">⏳ {activeIds.length} players remain…</p>
            <p className="ss-hint">The room steadies, but the suspicion never does. Another sabotage is coming.</p>
            <AvatarTileGrid
              playerIds={activeIds}
              getName={getName}
              ariaLabel="Remaining players"
              compact={true}
            />
            <ActionFooter>
              <button
                className="ss-btn ss-action-btn"
                onClick={handleRoundTransitionContinue}
                aria-label="Continue"
                data-testid="ss-round-transition-continue-btn"
                disabled={majorBeatActionLocked}
              >
                Continue
              </button>
            </ActionFooter>
          </div>
        </div>
      )}

      {/* Final-2 fallback: neutral loading screen shown for the single render
          frame before the FINAL2_INTRO cinematic stage is set. Does NOT reveal
          any role information (no victim/suspect labels). */}
      {phase === 'final2_jury' && final2Stage === null && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-final2 ss-cinematic">
            <p className="ss-phase-eyebrow">🏁 Final 2</p>
            <h2 className="ss-phase-label">Two finalists remain.</h2>
            <p className="ss-hint">One of them is the last saboteur.</p>
            <p className="ss-hint hint-small">Preparing the jury finale…</p>
          </div>
        </div>
      )}

      {/* Original winner screen — only for non-Final-2 games. */}
      {phase === 'winner' && winnerId && final2Stage === null && (
        <div className="ss-winner-card ss-cinematic">
          <div className="ss-confetti" aria-hidden="true">
            {Array.from({ length: 12 }, (_, idx) => (
              <span key={idx} className="ss-confetti-piece" />
            ))}
          </div>
          <div className="ss-trophy" aria-hidden="true">🏆</div>
          <p className="ss-phase-eyebrow">Winner reveal</p>
          <h2 className="ss-winner-name">{getName(winnerId)}</h2>
          <p className="ss-winner-label">wins Silent Saboteur!</p>
          {humanPlayerId === winnerId && <p className="ss-hint">🎉 You survived every round and solved the mystery.</p>}
          <ActionFooter>
            <button
              className="ss-btn ss-action-btn"
              onClick={handleWinnerContinue}
              aria-label="Continue"
              data-testid="ss-winner-continue-btn"
              disabled={majorBeatActionLocked}
            >
              Continue
            </button>
          </ActionFooter>
        </div>
      )}

      {/* ── Final-2 Cinematic Screens ────────────────────────────────────────── */}

      {/* FINAL2_INTRO: Two finalists introduced, no role info revealed. */}
      {final2Stage === 'FINAL2_INTRO' && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-final2 ss-cinematic" data-testid="ss-final2-intro">
            <p className="ss-phase-eyebrow">🏁 Final 2 — Jury Deduction Finale</p>
            <h2 className="ss-phase-label">The Final Confrontation</h2>
            <p className="ss-hint">
              Two players remain. One planted the bomb. The eliminated jury will decide.
            </p>
            <Final2FinalistsMuted
              finalistIds={final2FinalistIdsRef.current}
              getName={getName}
            />
            <p className="ss-hint hint-small">
              {eliminatedIds.length} jury member{eliminatedIds.length === 1 ? '' : 's'} will cast the deciding vote
            </p>
            <ActionFooter>
              <button
                className="ss-btn ss-action-btn"
                onClick={handleFinal2ProceedToVoting}
                aria-label="Proceed to Jury Decision"
                data-testid="ss-final2-proceed-btn"
                disabled={final2ActionLocked}
              >
                Proceed to Jury Decision
              </button>
            </ActionFooter>
          </div>
        </div>
      )}

      {/* FINAL2_VOTING: Jury votes. No victim/saboteur labels visible. */}
      {final2Stage === 'FINAL2_VOTING' && final2SaboteurId && final2VictimId && (
        <div className="ss-phase-card ss-final2 ss-cinematic" data-testid="ss-final2-voting">
          <p className="ss-phase-eyebrow">🏁 Final 2 — Jury Phase</p>
          <h2 className="ss-phase-label">Who planted the bomb?</h2>
          <CountdownTimer
            remainingMs={remainingCountdownMs}
            totalMs={SILENT_SABOTEUR_TIMINGS.JURY_TIMER_MS}
          />
          <p className="ss-hint">
            {isHumanJuror && juryVotes[humanPlayerId!] === undefined
              ? 'Cast your vote. Which finalist planted the bomb?'
              : isHumanJuror
              ? '✅ Vote cast. Waiting for the final verdict…'
              : 'Awaiting the jury verdict…'}
          </p>
          <Final2FinalistsMuted
            finalistIds={final2FinalistIdsRef.current}
            getName={getName}
            compact={true}
          />
          {/* Human jury vote buttons — no role labels */}
          {isHumanJuror && juryVotes[humanPlayerId!] === undefined && (
            <AvatarTileGrid
              playerIds={final2FinalistIdsRef.current}
              getName={getName}
              ariaLabel="Vote for a finalist"
              onSelect={handleJuryVote}
              selectedId={humanPlayerId ? juryVotes[humanPlayerId] : undefined}
              variant="vote"
            />
          )}
          <ProgressMeter
            label="Jury Votes"
            participantIds={eliminatedIds}
            submissions={juryVotes}
            getName={getName}
            noun="jury votes"
          />
        </div>
      )}

      {/* FINAL2_VERDICT_LOCKED: All jury votes in; awaiting reveal. */}
      {final2Stage === 'FINAL2_VERDICT_LOCKED' && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-final2 ss-cinematic" data-testid="ss-final2-verdict-locked">
            <p className="ss-phase-eyebrow">⚖️ Verdict Locked</p>
            <h2 className="ss-phase-label">The jury has spoken.</h2>
            <p className="ss-hint">The votes are sealed. The truth is about to be revealed.</p>
            <Final2FinalistsMuted
              finalistIds={final2FinalistIdsRef.current}
              getName={getName}
            />
            <ActionFooter>
              <button
                className="ss-btn ss-action-btn ss-action-btn--reveal"
                onClick={handleFinal2RevealTruth}
                aria-label="Reveal the Truth"
                data-testid="ss-final2-reveal-btn"
                disabled={final2ActionLocked}
              >
                Reveal the Truth
              </button>
            </ActionFooter>
          </div>
        </div>
      )}

      {/* FINAL2_REVEAL: Accused highlighted → saboteur unmasked after 1.5s. */}
      {final2Stage === 'FINAL2_REVEAL' && (
        <div className="ss-stage ss-stage--centered">
          <div className="ss-phase-card ss-final2 ss-cinematic" data-testid="ss-final2-reveal">
            <p className="ss-phase-eyebrow">🔍 The Truth Revealed</p>
            {!final2RevealDone ? (
              <>
                <h2 className="ss-phase-label">
                  {juryAccusedId ? 'The jury accused…' : 'The jury could not agree…'}
                </h2>
                <Final2FinalistsReveal
                  finalistIds={final2FinalistIdsRef.current}
                  accusedId={juryAccusedId}
                  getName={getName}
                  revealDone={false}
                  saboteurId={null}
                />
              </>
            ) : (
              <>
                <h2 className="ss-phase-label">
                  {juryAccusedId === final2SaboteurId
                    ? 'The saboteur has been exposed!'
                    : 'The bomb detonates…'}
                </h2>
                <Final2FinalistsReveal
                  finalistIds={final2FinalistIdsRef.current}
                  accusedId={juryAccusedId}
                  getName={getName}
                  revealDone={true}
                  saboteurId={final2SaboteurId}
                />
                {juryAccusedId === final2SaboteurId ? (
                  <p className="ss-hint">
                    The jury exposed <strong>{getName(final2SaboteurId ?? '')}</strong>.{' '}
                    <strong>{getName(final2VictimId ?? '')}</strong> wins.
                  </p>
                ) : juryAccusedId ? (
                  <p className="ss-hint">
                    The jury accused <strong>{getName(juryAccusedId)}</strong>, but the saboteur stayed hidden.{' '}
                    <strong>{getName(winnerId ?? '')}</strong> wins.
                  </p>
                ) : (
                  <p className="ss-hint">
                    The jury split their vote. The majority failed to expose the saboteur, so{' '}
                    <strong>{getName(winnerId ?? '')}</strong> wins.
                  </p>
                )}
                <ActionFooter>
                  <button
                    className="ss-btn ss-action-btn"
                    onClick={handleFinal2RevealContinue}
                    aria-label="Continue"
                    data-testid="ss-final2-reveal-continue-btn"
                    disabled={final2ActionLocked}
                  >
                    Continue
                  </button>
                </ActionFooter>
              </>
            )}
          </div>
        </div>
      )}

      {/* FINAL2_WINNER: Winner celebration with manual Continue. */}
      {final2Stage === 'FINAL2_WINNER' && winnerId && (
        <div className="ss-winner-card ss-cinematic" data-testid="ss-final2-winner">
          <div className="ss-confetti" aria-hidden="true">
            {Array.from({ length: 12 }, (_, idx) => (
              <span key={idx} className="ss-confetti-piece" />
            ))}
          </div>
          <div className="ss-trophy" aria-hidden="true">🏆</div>
          <p className="ss-phase-eyebrow">Winner reveal</p>
          <h2 className="ss-winner-name">{getName(winnerId)}</h2>
          <p className="ss-winner-label">wins Silent Saboteur!</p>
          {humanPlayerId === winnerId && (
            <p className="ss-hint">🎉 You survived every round and solved the mystery.</p>
          )}
          <ActionFooter>
            <button
              className="ss-btn ss-action-btn"
              onClick={handleFinal2WinnerContinue}
              aria-label="Continue"
              data-testid="ss-final2-winner-continue-btn"
              disabled={final2ActionLocked}
            >
              Continue
            </button>
          </ActionFooter>
        </div>
      )}

      {phase === 'complete' && (
        <div className="ss-phase-card ss-cinematic">
          <p className="ss-phase-eyebrow">Competition complete</p>
          <p className="ss-phase-label">✅ Silent Saboteur has ended.</p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function VictimNotice({
  playerId,
  name,
  subtitle,
  spotlight = false,
  cinematic = false,
}: {
  playerId: string;
  name: string;
  subtitle: string;
  spotlight?: boolean;
  cinematic?: boolean;
}) {
  return (
    <div className={`ss-victim-card ${spotlight ? 'ss-victim-card--spotlight' : ''} ${cinematic ? 'ss-victim-card--cinematic' : ''}`}>
      <HouseguestPortrait id={playerId} name={name} sizeClass={cinematic ? 'ss-victim-avatar--xl' : ''} />
      <div className="ss-victim-copy">
        <p className="ss-victim-eyebrow">💣 {name} is in danger</p>
        <p className="ss-victim-name">{name}</p>
        <p className="ss-victim-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function CountdownTimer({
  remainingMs,
  totalMs,
  compact = false,
}: {
  remainingMs: number;
  totalMs: number;
  compact?: boolean;
}) {
  const clampedRemaining = Math.max(0, remainingMs);
  const percent = totalMs <= 0 ? 0 : Math.max(0, Math.min(100, (clampedRemaining / totalMs) * 100));
  const isWarning = clampedRemaining <= 20_000;
  const mmss = formatMmSs(clampedRemaining);
  return (
    <div
      className={`ss-countdown ${isWarning ? 'ss-countdown--warning' : ''} ${compact ? 'ss-countdown--compact' : ''}`}
      aria-label={`Time remaining: ${mmss}`}
    >
      <div className="ss-countdown__row">
        {!compact && <span className="ss-countdown__label">⏱ Time remaining</span>}
        <strong className={`ss-countdown__value ${isWarning ? 'ss-countdown__value--warning' : ''}`}>{mmss}</strong>
      </div>
      <div className="ss-countdown__track">
        <div className="ss-countdown__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AvatarTileGrid({
  playerIds,
  getName,
  ariaLabel,
  onSelect,
  selectedId,
  votedIds = [],
  eliminatedIds = [],
  settledFocusId,
  showNames = true,
  compact = false,
  showVoteState = false,
  dense = false,
  variant = 'default',
}: {
  playerIds: string[];
  getName: (id: string) => string;
  ariaLabel: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  votedIds?: string[];
  eliminatedIds?: string[];
  settledFocusId?: string | null;
  showNames?: boolean;
  compact?: boolean;
  showVoteState?: boolean;
  dense?: boolean;
  variant?: 'default' | 'vote' | 'danger';
}) {
  const rows = getAvatarGridRows(playerIds, dense);
  const votedSet = new Set(votedIds);
  const eliminatedSet = new Set(eliminatedIds);
  const dimNonFocused = settledFocusId != null;

  return (
    <div className={`ss-avatar-grid ${compact ? 'ss-avatar-grid--compact' : ''}`} aria-label={ariaLabel}>
      {rows.map((row, rowIdx) => (
        <div key={`${ariaLabel}-${rowIdx}`} className="ss-avatar-grid__row">
          {row.map((id) => {
            const isSelected = selectedId === id || settledFocusId === id;
            const isEliminated = eliminatedSet.has(id);
            const isVoted = votedSet.has(id);
            const className = [
              'ss-avatar-tile',
              `ss-avatar-tile--${variant}`,
              onSelect ? 'ss-avatar-tile--interactive' : '',
              isSelected ? 'ss-avatar-tile--selected' : '',
              isVoted ? 'ss-avatar-tile--voted' : '',
              isEliminated ? 'ss-avatar-tile--eliminated' : '',
              dimNonFocused && !isSelected ? 'ss-avatar-tile--dimmed' : '',
              compact ? 'ss-avatar-tile--compact' : '',
            ].filter(Boolean).join(' ');

            const content = (
              <>
                <div className="ss-avatar-tile__portrait">
                  <HouseguestPortrait
                    id={id}
                    name={getName(id)}
                    sizeClass={compact ? 'ss-victim-avatar--md' : 'ss-victim-avatar--lg'}
                  />
                  {isSelected && <span className="ss-avatar-tile__badge" aria-hidden="true">🫵</span>}
                  {!isSelected && showVoteState && isVoted && (
                    <span className="ss-avatar-tile__badge ss-avatar-tile__badge--vote" aria-hidden="true">🗳️</span>
                  )}
                  {isEliminated && (
                    <span className="ss-avatar-tile__badge ss-avatar-tile__badge--eliminated" aria-hidden="true">❌</span>
                  )}
                </div>
                {showNames && <span className="ss-avatar-tile__name">{getName(id)}</span>}
              </>
            );

            const ariaPrefix =
              variant === 'danger'
                ? 'Plant bomb on'
                : variant === 'vote'
                  ? 'Accuse'
                  : variant === 'jury'
                    ? 'Vote for'
                    : 'Select';

            return onSelect ? (
              <button
                key={id}
                className={className}
                onClick={() => onSelect(id)}
                aria-label={`${ariaPrefix} ${getName(id)}`}
                type="button"
              >
                {content}
              </button>
            ) : (
              <div key={id} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ProgressMeter({
  label,
  participantIds,
  submissions,
  getName,
  noun,
}: {
  label: string;
  participantIds: string[];
  submissions: Record<string, string>;
  getName: (id: string) => string;
  noun: string;
}) {
  const submitted = Object.keys(submissions).length;
  const percent = participantIds.length === 0 ? 0 : (submitted / participantIds.length) * 100;

  return (
    <div className="ss-progress-card" aria-label={`${submitted} of ${participantIds.length} ${noun} submitted`}>
      <div className="ss-progress-card__row">
        <span className="ss-progress-card__label">{label}</span>
        <strong className="ss-progress-card__value">
          {submitted}/{participantIds.length}
        </strong>
      </div>
      <div className="ss-progress-card__track">
        <div className="ss-progress-card__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="ss-progress-card__dots">
        {participantIds.map((id) => (
          <span
            key={id}
            className={`ss-vote-dot ${submissions[id] !== undefined ? 'ss-vote-dot--cast' : ''}`}
            title={getName(id)}
          >
            {submissions[id] !== undefined ? '✅' : '⏳'}
          </span>
        ))}
      </div>
    </div>
  );
}

function VoteBreakdown({
  votes,
  saboteurId,
  getName,
}: {
  votes: Record<string, string>;
  saboteurId: string;
  getName: (id: string) => string;
}) {
  const saboteurVotes = Object.values(votes).filter((v) => v === saboteurId).length;
  return (
    <p className="ss-vote-breakdown">
      Votes on the saboteur (<strong>{getName(saboteurId)}</strong>):{' '}
      <strong>{saboteurVotes}</strong> of <strong>{Object.values(votes).length}</strong>
    </p>
  );
}

function VoteRevealBoard({
  entries,
  revealedCount,
  getName,
  settledFocusId,
}: {
  entries: Array<[string, string]>;
  revealedCount: number;
  getName: (id: string) => string;
  settledFocusId?: string | null;
}) {
  const shownEntries = entries.slice(0, revealedCount);
  const voteCounts = new Map<string, number>();
  const firstSeenOrder = new Map<string, number>();

  shownEntries.forEach(([, accusedId], idx) => {
    voteCounts.set(accusedId, (voteCounts.get(accusedId) ?? 0) + 1);
    if (!firstSeenOrder.has(accusedId)) {
      firstSeenOrder.set(accusedId, idx);
    }
  });

  const lastAccusedId = shownEntries.length > 0 ? shownEntries[shownEntries.length - 1][1] : null;
  const revealedTargets = Array.from(voteCounts.entries())
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) return countDiff;
      return (firstSeenOrder.get(a[0]) ?? 0) - (firstSeenOrder.get(b[0]) ?? 0);
    })
    .map(([id, count]) => ({ id, count }));

  return (
    <div className="ss-vote-board" aria-label="Vote reveal sequence">
      {shownEntries.length > 0 && (
        <p className="ss-vote-board__headline">
          Vote {shownEntries.length}: <strong>{getName(lastAccusedId ?? '')}</strong>
        </p>
      )}
      {revealedTargets.length > 0 ? (
        <div className="ss-vote-board__grid">
          {revealedTargets.map(({ id, count }) => {
            const isFocused = settledFocusId === id;
            const isDimmed = settledFocusId != null && !isFocused;
            const isPulsing = settledFocusId == null && lastAccusedId === id;
            return (
              <div
                key={id}
                className={[
                  'ss-vote-board__tile',
                  isFocused ? 'ss-vote-board__tile--focused' : '',
                  isDimmed ? 'ss-vote-board__tile--dimmed' : '',
                  isPulsing ? 'ss-vote-board__tile--pulse' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="ss-vote-board__portrait-wrap">
                  <HouseguestPortrait id={id} name={getName(id)} sizeClass="ss-victim-avatar--lg" />
                  <span className="ss-vote-board__count" aria-label={`${count} vote${count === 1 ? '' : 's'}`}>
                    {count}
                  </span>
                </div>
                <span className="ss-vote-board__name">{getName(id)}</span>
                <span className="ss-vote-board__icons" aria-hidden="true">
                  {Array.from({ length: count }, (_, idx) => (
                    <span key={`${id}-vote-${idx}`}>🗳️</span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ss-vote-board__placeholder">Waiting for the first vote…</div>
      )}
    </div>
  );
}

// ─── Final-2 Cinematic Sub-components ─────────────────────────────────────────

function ActionFooter({ children }: { children: ReactNode }) {
  return <div className="ss-action-footer">{children}</div>;
}

/**
 * Displays both finalists with muted (grayscale/dim) treatment and a lock icon.
 * Does NOT show any role information (no victim/saboteur labels).
 */
function Final2FinalistsMuted({
  finalistIds,
  getName,
  compact = false,
}: {
  finalistIds: string[];
  getName: (id: string) => string;
  compact?: boolean;
}) {
  return (
    <ul className="ss-final2-finalists" aria-label="Finalists">
      {finalistIds.map((id) => (
        <li key={id} className={`ss-final2-finalist ${compact ? 'ss-final2-finalist--compact' : ''}`}>
          <div className="ss-final2-finalist__portrait">
            <HouseguestPortrait
              id={id}
              name={getName(id)}
              sizeClass={compact ? 'ss-victim-avatar--md' : 'ss-victim-avatar--lg'}
            />
            <span className="ss-final2-finalist__overlay-icon" aria-hidden="true">🔒</span>
          </div>
          <span className="ss-final2-finalist__name">{getName(id)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Displays both finalists during the reveal sequence.
 * Before revealDone: highlights only the accused player.
 * After revealDone: shows the accused highlight AND unmasked saboteur label.
 */
function Final2FinalistsReveal({
  finalistIds,
  accusedId,
  getName,
  revealDone,
  saboteurId,
}: {
  finalistIds: string[];
  accusedId: string | null;
  getName: (id: string) => string;
  revealDone: boolean;
  saboteurId: string | null;
}) {
  return (
    <ul className="ss-final2-finalists" aria-label="Finalists reveal">
      {finalistIds.map((id) => {
        const isAccused = id === accusedId;
        const isSaboteur = revealDone && id === saboteurId;
        const isVictim = revealDone && saboteurId !== null && id !== saboteurId;
        return (
          <li
            key={id}
            className={[
              'ss-final2-finalist',
              revealDone ? 'ss-final2-finalist--revealed' : '',
              isAccused ? 'ss-final2-finalist--accused' : '',
              isSaboteur ? 'ss-final2-finalist--saboteur' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="ss-final2-finalist__portrait">
              <HouseguestPortrait id={id} name={getName(id)} sizeClass="ss-victim-avatar--lg" />
              {isAccused && !revealDone && (
                <span className="ss-final2-finalist__overlay-icon" aria-hidden="true">🫵</span>
              )}
              {isSaboteur && (
                <span className="ss-final2-finalist__overlay-icon" aria-hidden="true">💣</span>
              )}
            </div>
            <span className="ss-final2-finalist__name">{getName(id)}</span>
            {revealDone && (
              <span
                className={`ss-final2-finalist__role-badge ${
                  isSaboteur
                    ? 'ss-final2-finalist__role-badge--saboteur'
                    : isVictim
                    ? 'ss-final2-finalist__role-badge--victim'
                    : ''
                }`}
              >
                {isSaboteur ? 'Saboteur' : 'Victim'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SocialMapOverlay({
  victimId,
  suspects,
  seed,
  remainingMs,
  totalMs,
  getName,
  onClose,
  onVote,
}: {
  victimId: string;
  suspects: string[];
  seed: number;
  remainingMs: number;
  totalMs: number;
  getName: (id: string) => string;
  onClose: () => void;
  onVote: ((id: string) => void) | null;
}) {
  const cards = useMemo(
    () => buildSuspectCards(suspects, victimId, seed, getName),
    // getName is stable via useCallback, suspects/victimId/seed are stable per round
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suspects, victimId, seed],
  );

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="ss-social-map-backdrop"
      role="dialog"
      aria-label="Social Map"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="ss-social-map">
        {/* Header with timer */}
        <div className="ss-social-map__header">
          <div className="ss-social-map__header-left">
            <span className="ss-social-map__title">🗺️ Social Map</span>
            <p className="ss-social-map__subtitle">Who had a reason to target {getName(victimId)}?</p>
          </div>
          <div className="ss-social-map__header-right">
            <CountdownTimer remainingMs={remainingMs} totalMs={totalMs} compact={true} />
          </div>
          <button
            className="ss-social-map__close"
            onClick={onClose}
            aria-label="Close Social Map"
          >
            ✕
          </button>
        </div>

        {/* Victim panel */}
        <div className="ss-social-map__victim-panel">
          <HouseguestPortrait id={victimId} name={getName(victimId)} sizeClass="ss-victim-avatar--lg" />
          <div>
            <p className="ss-social-map__victim-label">💣 {getName(victimId)} has the bomb</p>
            <p className="ss-social-map__victim-hint">Who planted it?</p>
          </div>
        </div>

        {/* Mini graph: victim in center, suspects around */}
        {suspects.length > 0 && (
          <div className="ss-social-map__graph" aria-hidden="true">
            <div className="ss-social-map__graph-center">
              <HouseguestPortrait id={victimId} name={getName(victimId)} sizeClass="ss-victim-avatar--sm" />
              <span className="ss-social-map__graph-label">{getName(victimId)}</span>
            </div>
            {cards.map((card) => (
              <div key={card.id} className="ss-social-map__graph-node">
                <div
                  className="ss-social-map__graph-line"
                  style={{ borderColor: RELATIONSHIP_COLORS[card.relationship] }}
                />
                <HouseguestPortrait id={card.id} name={card.name} sizeClass="ss-victim-avatar--sm" />
                <span className="ss-social-map__graph-label">{card.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Suspect cards */}
        <div className="ss-social-map__cards">
          {cards.map((card) => (
            <div key={card.id} className="ss-social-map__card">
              <div className="ss-social-map__card-header">
                <HouseguestPortrait id={card.id} name={card.name} sizeClass="ss-victim-avatar--sm" />
                <div className="ss-social-map__card-identity">
                  <strong className="ss-social-map__card-name">{card.name}</strong>
                  <span
                    className="ss-social-map__card-rel"
                    style={{ color: RELATIONSHIP_COLORS[card.relationship] }}
                  >
                    {card.relationship}
                  </span>
                </div>
                <div className="ss-social-map__card-strength">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={`ss-social-map__dot ${i <= card.relationshipStrength ? 'ss-social-map__dot--active' : ''}`}
                      style={i <= card.relationshipStrength ? { background: RELATIONSHIP_COLORS[card.relationship] } : undefined}
                    />
                  ))}
                </div>
              </div>
              <div className="ss-social-map__card-traits">
                {card.traits.map((t) => (
                  <span key={t} className="ss-social-map__trait">{t}</span>
                ))}
              </div>
              <p className="ss-social-map__card-hint">{card.hint}</p>
              {onVote && (
                <button
                  className="ss-btn ss-btn--vote ss-btn--sm"
                  onClick={() => { onVote(card.id); onClose(); }}
                  aria-label={`Accuse ${card.name}`}
                >
                  🫵 Accuse {card.name}
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="ss-btn ss-btn--secondary ss-social-map__close-btn" onClick={onClose}>
          Close Social Map
        </button>
      </div>
    </div>
  );
}
