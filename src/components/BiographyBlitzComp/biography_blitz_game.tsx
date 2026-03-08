/**
 * BiographyBlitzComp — React UI component for the "Biography Blitz" competition.
 *
 * Broadcast-style presentation with three main UI states:
 *   question  — Displays the current trivia question and answer choices.
 *               Avatar grid: tap a houseguest to select them as the answer.
 *               Text-button fallback when dynamic bio questions are not available.
 *               The human player taps an answer; AI players auto-submit via Redux.
 *   reveal    — Highlights the correct answer; shows who was eliminated.
 *               A short suspense pause before confirmElimination is dispatched.
 *   complete  — Winner screen with announcement; fires onComplete.
 *
 * Cinematic phases (driven by CSS class toggling):
 *   - Question slide-in on new round
 *   - Answer lock shimmer on submission
 *   - Spotlight pulse on correct-answer reveal
 *   - Elimination fade-out for evicted avatars
 *   - Winner zoom for the final survivor
 *
 * NOTE: Pre-game "Get Ready" countdown and rules modal are handled upstream
 * by MinigameHost before this component mounts. Per-question timing (the
 * human answer timeout, the hidden 15 s deadline) is managed here via setTimeout.
 * The testMode flag (from Redux state) collapses all delays to 0 for CI/tests.
 */
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  startBiographyBlitz,
  submitAnswer,
  markDisconnected,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  pickElimination,
  resetBiographyBlitz,
} from '../../features/biographyBlitz/biography_blitz_logic';
import type { BiographyBlitzState, BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic';
import { resolveBiographyBlitzOutcome } from '../../features/biographyBlitz/thunks';
import { BIOGRAPHY_BLITZ_QUESTIONS } from '../../features/biographyBlitz/biographyBlitzQuestions';
import { generateBioQuestions } from '../../features/biographyBlitz/bioQuestionGenerator';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import './BiographyBlitzComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Minimum number of generated bio questions required to prefer avatar mode. */
const MIN_DYNAMIC_QUESTIONS = 3;
const HUMAN_ANSWER_TIMEOUT_MS = 15_000;
/** Suspense pause on reveal screen before advancing to choose_elimination. */
const REVEAL_PAUSE_MS = 3_000;
/** Delay before AI auto-picks an elimination target when AI is the winner. */
const CHOOSE_ELIMINATION_AUTO_DELAY_MS = 2_000;
/** Shimmer animation lasts this long after answer is locked. */
const SHIMMER_DURATION_MS = 600;
/**
 * Time (ms) the human winner has to choose an elimination target before the
 * AI fallback auto-picks on their behalf.  Ensures the game never stalls if
 * the human disconnects or does not respond during the elimination phase.
 */
const HUMAN_ELIM_TIMEOUT_MS = 8_000;
/**
 * Auto-advance delay on the winner screen for unattended / spectator runs.
 * After this delay the onComplete hook is called automatically so the main
 * ceremony flow can resume without requiring a tap.
 */
const WINNER_AUTO_ADVANCE_MS = 1_200;

/**
 * Golden-ratio-derived 32-bit constant used as a round seed multiplier when
 * computing deterministic AI elimination targets. Matches the constant used
 * in the slice's `buildAiSubmissions` so all seeded picks share the same
 * multiplier.
 */
const ELIM_SEED_MULTIPLIER = 0x9e3779b9;

/**
 * Compute a seeded-deterministic index into `candidates` using the
 * competition seed and current round number.  This ensures the AI does not
 * always target position 0 (which is frequently the human player).
 */
function seededEliminationIdx(seed: number, round: number, candidateCount: number): number {
  const idxSeed = ((seed ^ (round * ELIM_SEED_MULTIPLIER)) >>> 0);
  return idxSeed % candidateCount;
}

/**
 * Resolves the in-competition contestant ID for the human player.
 *
 * In competition contexts the session/account user ID can differ from the
 * contestant ID assigned for this specific game (e.g. "houseguest_7" vs
 * "account_abc123").  This resolver tries three sources in priority order:
 *
 *  1. localPlayerId  — explicit contestant ID supplied by the parent (highest fidelity).
 *  2. sessionUserId  — authoritative account ID from Redux, matched directly
 *                      against the contestant roster keys in playerMap.
 *  3. isHuman flag   — contestant explicitly marked isHuman in playerMap
 *                      (set from participantsProp or game slice's isUser flag).
 *
 * Returns null when no human contestant can be identified (AI-only or
 * pure-spectator context).
 */
function resolveHumanContestantId(
  playerMap: Record<string, { name: string; isHuman: boolean; avatar: string }>,
  sessionUserId: string | null,
  localPlayerId: string | null,
): string | null {
  // 1. Explicit localPlayerId override — caller knows the contestant ID directly.
  if (localPlayerId && localPlayerId in playerMap) {
    console.debug('[BiographyBlitz] humanContestantId resolved from localPlayerId', { localPlayerId });
    return localPlayerId;
  }

  // 2. Session user ID matched directly against the contestant roster.
  //    Works when the account ID equals the contestant ID (the common case).
  if (sessionUserId && sessionUserId in playerMap) {
    console.debug('[BiographyBlitz] humanContestantId resolved from sessionUserId', { sessionUserId });
    return sessionUserId;
  }

  // 3. Fall back to any contestant explicitly flagged isHuman in the playerMap.
  //    Covers competitions where account ID ≠ contestant ID and the mapping is
  //    surfaced via participantsProp[x].isHuman or game.players[x].isUser.
  const fromFlag = Object.entries(playerMap).find(([, v]) => v.isHuman)?.[0] ?? null;
  if (fromFlag !== null) {
    console.debug('[BiographyBlitz] humanContestantId resolved from isHuman flag', {
      fromFlag,
      sessionUserId,
      localPlayerId,
    });
    return fromFlag;
  }

  console.debug('[BiographyBlitz] humanContestantId could not be resolved — AI-only or spectator', {
    sessionUserId,
    localPlayerId,
    rosterKeys: Object.keys(playerMap),
  });
  return null;
}

// ─── Narration ────────────────────────────────────────────────────────────────

const NARRATION = {
  question: [
    "Alright houseguests — it's time to prove you know your housemates! 📖",
    "Think carefully — one wrong answer and you're heading to the couch! 🛋️",
    "No conferring, no peeking! This is Biography Blitz, not a study group! 🙅",
    "Put your thinking cap on! The clock is ticking! ⏱️",
    "You either know the bios or you're going home! Which is it? 🎤",
  ],
  correct: [
    "CORRECT! You clearly did your homework! 📚",
    "Nailed it! Gold star for you! ⭐",
    "Right on the money! You were paying attention! 💰",
    "That's correct! You should've been a detective! 🔍",
  ],
  wrong: [
    "Oh no — that's WRONG! Looks like someone didn't study! 😬",
    "Incorrect! Time to pack your bags… wait, you can't! 🧳",
    "Buzz! Wrong answer! Did you even read the bios?! 📋",
    "Nope! So much for social awareness! 👀",
  ],
  eliminated: [
    "{name} couldn't keep up with the biography blitz — eliminated! 💥",
    "{name} got the wrong answer — they're out of here! 🚪",
    "{name} didn't know their housemates well enough — goodbye! 👋",
    "The knowledge drain claims {name} — eliminated! 📉",
  ],
  voided: [
    "Everyone got that wrong — we'll let that one slide! Moving on! 🤷",
    "Wow, nobody knew that one! Question voided — next round! 🎲",
    "Not a single correct answer! That was a tough one — next question! 😅",
  ],
  chooseElimination: [
    "{winner} answered correctly! Now choose one houseguest to eliminate… 🎯",
    "{winner} got it right and earns the power to eliminate! Choose your target! ⚡",
    "{winner} is the round winner! Pick one houseguest to send home! 🚪",
    "{winner} knows the bios! Use that knowledge — who goes home? 💀",
  ],
  chooseEliminationYou: [
    "You answered correctly! Now tap a houseguest to eliminate them! 🎯",
    "You got it right! Choose who to send packing! ⚡",
    "Power is yours! Tap to eliminate one houseguest! 🚪",
    "You've earned the right to choose! Who goes home? 💀",
  ],
  winner: [
    "WE HAVE OUR BIOGRAPHY BLITZ CHAMPION! 🏆",
    "WINNER! Your knowledge of your housemates is UNRIVALLED! 👑",
    "BIOGRAPHY BLITZ CHAMPION! You know everyone's deepest secrets! 🎉",
  ],
  streak: [
    "🔥 HOT STREAK! {name} is ON FIRE!",
    "🔥 {name} can't be stopped — HOT STREAK!",
    "🔥 Two in a row for {name}! They're BLAZING!",
  ],
};

function pickLine(lines: string[], index: number): string {
  return lines[index % lines.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  /** Matches the `prizeType` convention used by other competition components. */
  prizeType: BiographyBlitzCompetitionType;
  seed: number;
  onComplete?: () => void;
  /** Collapse all animation delays for CI / Storybook test mode. */
  testMode?: boolean;
  /**
   * Explicit in-competition contestant ID for the local human player.
   * Use this when the session/account user ID (from Redux game state) differs
   * from the contestant ID assigned for this specific competition (e.g. when
   * houseguest IDs ≠ account IDs).  Takes priority over sessionUserId and the
   * isHuman prop flag during humanContestantId resolution.
   */
  localPlayerId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Avatar helper ─────────────────────────────────────────────────────────────

/**
 * FallbackAvatar — renders an <img> with a two-step fallback chain:
 *  1. resolveAvatar() for the player (local file first, e.g. avatars/Finn.png)
 *  2. Dicebear SVG (on first load error)
 *  3. Initials text node (if Dicebear also fails)
 */
function FallbackAvatar({
  id,
  name,
  avatar,
  className,
  altText,
}: {
  id: string;
  name: string;
  avatar: string;
  className?: string;
  altText?: string;
}) {
  const [src, setSrc] = useState(() =>
    resolveAvatar({ id, name, avatar }),
  );
  const [showInitials, setShowInitials] = useState(false);

  function handleError() {
    const dicebear = getDicebear(name);
    if (src !== dicebear) {
      setSrc(dicebear);
    } else {
      setShowInitials(true);
    }
  }

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

  if (showInitials) {
    return (
      <span className={`bb-blitz__avatar-initials ${className ?? ''}`} aria-label={altText ?? name}>
        {initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={altText ?? name}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
}

export default function BiographyBlitzComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
  testMode: testModeProp = false,
  localPlayerId,
}: Props) {
  const dispatch = useAppDispatch();
  const bb = useAppSelector(
    (s: RootState) =>
      (s as RootState & { biographyBlitz: BiographyBlitzState }).biographyBlitz,
  );
  const storePlayers = useAppSelector(
    (s: RootState) =>
      (
        s as RootState & {
          game: { players: Array<{ id: string; name: string; avatar?: string; isUser?: boolean }> };
        }
      ).game?.players ?? [],
  );

  // Authoritative session user id — the player flagged isUser:true in the
  // game slice.  Passed to resolveHumanContestantId as the second-priority
  // source when no localPlayerId prop is supplied.
  const sessionUserId = useAppSelector(
    (s: RootState) =>
      (
        s as RootState & {
          game: { players: Array<{ id: string; isUser?: boolean }> };
        }
      ).game?.players?.find((p) => p.isUser)?.id ?? null,
  );

  // Effective test mode: prop OR Redux flag.
  const testMode = testModeProp || bb.testMode;

  // Derive timing based on test mode.
  const revealPause = testMode ? 0 : REVEAL_PAUSE_MS;
  const chooseElimDelay = testMode ? 0 : CHOOSE_ELIMINATION_AUTO_DELAY_MS;
  const humanTimeout = testMode ? 100 : HUMAN_ANSWER_TIMEOUT_MS;
  const humanElimTimeout = testMode ? 0 : HUMAN_ELIM_TIMEOUT_MS;
  const winnerAutoAdvance = testMode ? 0 : WINNER_AUTO_ADVANCE_MS;

  // Build player info map (memoised to avoid re-creating each render).
  // participantIds.join is a stable dependency key that changes only when
  // the roster changes (which never happens mid-game).
  const playerMap = useMemo(() => {
    const m: Record<string, { name: string; isHuman: boolean; avatar: string }> = {};
    if (participantsProp) {
      for (const p of participantsProp) {
        m[p.id] = { name: p.name, isHuman: p.isHuman, avatar: '' };
      }
    }
    for (const p of storePlayers) {
      if (participantIds.includes(p.id)) {
        // Preserve isHuman=true that may have been set by participantsProp —
        // do not overwrite it with isUser=false from the store.
        const alreadyHuman = m[p.id]?.isHuman ?? false;
        m[p.id] = { name: p.name, isHuman: alreadyHuman || !!p.isUser, avatar: p.avatar ?? '' };
      }
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsProp, storePlayers, participantIds.join(',')]);

  // Resolve the in-competition contestant ID for the human player.
  // Uses a three-tier priority: localPlayerId prop → sessionUserId (Redux) → isHuman flag.
  // See resolveHumanContestantId above for full rationale.
  const humanContestantId = resolveHumanContestantId(
    playerMap,
    sessionUserId,
    localPlayerId ?? null,
  );

  function displayName(id: string): string {
    return playerMap[id]?.name ?? id;
  }

  function playerAvatar(id: string): string {
    return playerMap[id]?.avatar ?? '';
  }

  // Ref to avoid stale closures in effects.
  const bbRef = useRef(bb);
  bbRef.current = bb;

  // Generate dynamic bio questions from live contestant data.
  // participantIds.join is used as a dependency key — stable as long as the
  // roster doesn't change mid-game (which it never does in practice).
  const dynamicQuestions = useMemo(
    () => generateBioQuestions(participantIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participantIds.join(',')],
  );

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    dispatch(
      startBiographyBlitz({
        participantIds,
        competitionType: prizeType,
        seed,
        testMode: testModeProp,
        dynamicQuestions: dynamicQuestions.length >= MIN_DYNAMIC_QUESTIONS ? dynamicQuestions : [],
      }),
    );
    return () => {
      dispatch(resetBiographyBlitz());
    };
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Human answer timeout (hidden 15 s deadline) ───────────────────────────
  useEffect(() => {
    if (bb.status !== 'question') return;
    if (!humanContestantId) return;
    // Skip timeout when the human has already been eliminated — they are not
    // in activeContestants and cannot submit, so the game must not wait for them.
    if (!bb.activeContestants.includes(humanContestantId)) return;
    if (humanContestantId in bb.submissions) return;

    console.debug('[BiographyBlitz] Human answer timeout started', {
      humanContestantId,
      round: bb.round,
      activeContestants: bb.activeContestants,
    });

    const t = setTimeout(() => {
      const current = bbRef.current;
      if (current.status !== 'question') return;
      if (!current.activeContestants.includes(humanContestantId)) return;
      if (humanContestantId in current.submissions) return;
      console.debug('[BiographyBlitz] Human timed out — marking disconnected', { humanContestantId });
      // Mark as disconnected/timed-out so they are treated as wrong.
      dispatch(markDisconnected(humanContestantId));
    }, humanTimeout);

    return () => clearTimeout(t);
  }, [bb.status, bb.round, bb.currentQuestionId, bb.submissions, bb.activeContestants, humanContestantId, humanTimeout, dispatch]);

  // ── Auto-fill AI and trigger reveal when all active contestants submitted ─
  useEffect(() => {
    if (bb.status !== 'question') return;
    const allSubmitted = bb.activeContestants.every((id) => id in bb.submissions);
    if (!allSubmitted) return;

    console.debug('[BiographyBlitz] All active contestants submitted — revealing results', {
      round: bb.round,
      activeContestants: bb.activeContestants,
      submissions: bb.submissions,
    });

    const t = setTimeout(() => {
      dispatch(revealResults());
    }, testMode ? 0 : 600);
    return () => clearTimeout(t);
  }, [bb.status, bb.round, bb.activeContestants, bb.submissions, testMode, dispatch]);

  // ── When human answers, fill remaining AI answers immediately ─────────────
  useEffect(() => {
    if (bb.status !== 'question') return;
    if (!humanContestantId) return;
    // Skip when the human is eliminated — handled by the all-AI effect below.
    if (!bb.activeContestants.includes(humanContestantId)) return;
    if (!(humanContestantId in bb.submissions)) return;
    dispatch(autoFillAIAnswers(humanContestantId));
  }, [bb.status, bb.submissions, bb.activeContestants, humanContestantId, dispatch]);

  // ── All-AI round OR human eliminated: fill everyone immediately ───────────
  // Runs when (a) there is no human player at all, or (b) the human has been
  // eliminated and is no longer in activeContestants.  In either case there is
  // no human input to wait for, so AI answers are submitted immediately.
  useEffect(() => {
    if (bb.status !== 'question') return;
    const humanIsActive = humanContestantId !== null && bb.activeContestants.includes(humanContestantId);
    if (humanIsActive) return; // human can still answer — handled by the effect above

    console.debug('[BiographyBlitz] AI-only round (human absent/eliminated) — auto-filling', {
      round: bb.round,
      activeContestants: bb.activeContestants,
      humanContestantId,
      humanIsActive,
      eliminatedContestants: bb.eliminatedContestants,
    });

    dispatch(autoFillAIAnswers(null));
  }, [bb.status, bb.round, bb.currentQuestionId, bb.activeContestants, bb.eliminatedContestants, humanContestantId, dispatch]);

  // ── Auto-advance from reveal after suspense pause → choose_elimination ────
  useEffect(() => {
    if (bb.status !== 'reveal') return;
    const t = setTimeout(() => {
      dispatch(confirmElimination());
    }, revealPause);
    return () => clearTimeout(t);
  }, [bb.status, bb.round, revealPause, dispatch]);

  // ── Auto-pick elimination when AI is the (sole/first) winner ─────────────
  // When the human is NOT a round winner (or has been eliminated), the AI
  // auto-picks deterministically after a short delay.
  useEffect(() => {
    if (bb.status !== 'choose_elimination') return;
    // Human is an active winner → they must choose manually; do not auto-pick.
    if (humanContestantId !== null && bb.roundWinnerIds.includes(humanContestantId) && bb.activeContestants.includes(humanContestantId)) return;
    if (bb.eliminationCandidates.length === 0) return;

    console.debug('[BiographyBlitz] AI elimination auto-pick scheduled', {
      round: bb.round,
      roundWinnerIds: bb.roundWinnerIds,
      eliminationCandidates: bb.eliminationCandidates,
      humanContestantId,
    });

    const t = setTimeout(() => {
      const current = bbRef.current;
      if (current.status !== 'choose_elimination') return;
      if (current.eliminationCandidates.length === 0) return;
      // Deterministically pick a target using seed + round so the AI does not
      // always target index 0 (which tends to be the human player when they
      // answered incorrectly and appear first in the participant list).
      const pickIdx = seededEliminationIdx(current.seed, current.round, current.eliminationCandidates.length);
      const target = current.eliminationCandidates[pickIdx];
      console.debug('[BiographyBlitz] AI picked elimination target', {
        candidates: current.eliminationCandidates,
        pickIdx,
        target,
      });
      dispatch(pickElimination({ targetId: target }));
    }, chooseElimDelay);

    return () => clearTimeout(t);
  }, [bb.status, bb.round, humanContestantId, bb.roundWinnerIds, bb.eliminationCandidates, bb.activeContestants, chooseElimDelay, dispatch]);

  // ── Human winner elimination timeout (AI fallback after 8 s) ─────────────
  // When the human IS the round winner and must pick an elimination target,
  // start a safety timer.  If the human has not tapped within humanElimTimeout
  // ms (default 8 000 ms) the AI picks on their behalf so the game never stalls.
  useEffect(() => {
    if (bb.status !== 'choose_elimination') return;
    // Only activate when the human is the active round winner who must choose.
    if (humanContestantId === null || !bb.roundWinnerIds.includes(humanContestantId)) return;
    if (!bb.activeContestants.includes(humanContestantId)) return;
    if (bb.eliminationCandidates.length === 0) return;

    const t = setTimeout(() => {
      const current = bbRef.current;
      if (current.status !== 'choose_elimination') return;
      if (current.eliminationCandidates.length === 0) return;
      // Fallback: AI picks using same seeded-deterministic logic.
      const pickIdx = seededEliminationIdx(current.seed, current.round, current.eliminationCandidates.length);
      console.debug('[BiographyBlitz] Human elim timeout — AI fallback pick', {
        target: current.eliminationCandidates[pickIdx],
      });
      dispatch(pickElimination({ targetId: current.eliminationCandidates[pickIdx] }));
    }, humanElimTimeout);

    return () => clearTimeout(t);
  }, [bb.status, bb.round, humanContestantId, bb.roundWinnerIds, bb.eliminationCandidates, bb.activeContestants, humanElimTimeout, dispatch]);

  // ── Resolve outcome when game is complete (does NOT auto-fire onComplete) ──
  const outcomeResolvedRef = useRef(false);

  useEffect(() => {
    if (bb.status !== 'complete') return;
    if (outcomeResolvedRef.current) return;
    outcomeResolvedRef.current = true;
    dispatch(resolveBiographyBlitzOutcome());
  }, [bb.status, dispatch]);

  // ── Winner screen auto-advance (fallback for unattended / spectator runs) ─
  // After winnerAutoAdvance ms the onComplete hook fires automatically so the
  // main ceremony flow resumes without requiring a manual tap.  In test mode
  // this collapses to 0 ms for immediate resolution.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (bb.status !== 'complete') return;
    const t = setTimeout(() => {
      onCompleteRef.current?.();
    }, winnerAutoAdvance);
    return () => clearTimeout(t);
  }, [bb.status, winnerAutoAdvance]);

  // ── Answer handler ────────────────────────────────────────────────────────

  const handleAnswerSelect = useCallback(
    (answerId: string) => {
      if (!humanContestantId) return;
      if (bb.status !== 'question') return;
      if (humanContestantId in bb.submissions) return; // single-submission enforcement
      dispatch(submitAnswer({ contestantId: humanContestantId, answerId }));
    },
    [humanContestantId, bb.status, bb.submissions, dispatch],
  );

  // ── Elimination pick handler (human winner picks target) ──────────────────

  const handleEliminationPick = useCallback(
    (targetId: string) => {
      if (bb.status !== 'choose_elimination') return;
      if (!bb.eliminationCandidates.includes(targetId)) return;
      dispatch(pickElimination({ targetId }));
    },
    [bb.status, bb.eliminationCandidates, dispatch],
  );

  // ── Derived values ────────────────────────────────────────────────────────

  const activeQuestionBank =
    bb.dynamicQuestions.length > 0 ? bb.dynamicQuestions : BIOGRAPHY_BLITZ_QUESTIONS;

  const currentQuestion = bb.currentQuestionId
    ? activeQuestionBank.find((q) => q.id === bb.currentQuestionId) ?? null
    : null;

  /** True when the human player has been eliminated (no longer in activeContestants). */
  const humanIsEliminated =
    humanContestantId !== null && !bb.activeContestants.includes(humanContestantId);

  const humanAnswer = humanContestantId ? bb.submissions[humanContestantId] : null;
  const humanAnsweredCorrectly =
    (bb.status === 'reveal' || bb.status === 'choose_elimination') &&
    humanAnswer === bb.correctAnswerId;

  const voidedRound = bb.status === 'reveal' && bb.eliminationCandidates.length === 0 && bb.roundWinnerIds.length === 0;

  // Avatar mode: dynamic questions where answer IDs are contestant IDs.
  const avatarMode =
    bb.dynamicQuestions.length > 0 &&
    currentQuestion !== null &&
    currentQuestion.answers.some((a) => participantIds.includes(a.id));

  // Is the human the one who gets to pick the elimination target?
  // Requires the human to be active (not eliminated) AND a round winner.
  const humanIsChooser =
    bb.status === 'choose_elimination' &&
    humanContestantId !== null &&
    !humanIsEliminated &&
    bb.roundWinnerIds.includes(humanContestantId);

  // ── Render ────────────────────────────────────────────────────────────────

  if (bb.status === 'idle') {
    return (
      <div className="bb-blitz bb-blitz--loading" aria-live="polite">
        <p>Loading Biography Blitz…</p>
      </div>
    );
  }

  if (bb.status === 'complete') {
    const winnerId = bb.winnerId ?? '';
    const winnerName = displayName(winnerId);
    const winnerAvatarVal = playerAvatar(winnerId);
    const isHumanWinner = winnerId === humanContestantId;
    return (
      <div className="bb-blitz bb-blitz--complete" aria-live="assertive">
        <div className="bb-blitz__winner-badge" aria-hidden="true">🏆</div>
        <h2 className="bb-blitz__winner-title">
          {pickLine(NARRATION.winner, bb.round)}
        </h2>
        <div className="bb-blitz__winner-avatar bb-blitz__winner-avatar--zoom">
          <FallbackAvatar
            id={winnerId}
            name={winnerName}
            avatar={winnerAvatarVal}
            className="bb-blitz__avatar-img"
            altText={winnerName}
          />
        </div>
        <p className="bb-blitz__winner-name">
          {winnerName}
          {isHumanWinner && <span className="bb-blitz__you-badge"> (You!)</span>}
        </p>
        <p className="bb-blitz__winner-subtitle">
          {prizeType} Winner — {bb.round + 1} round{bb.round !== 0 ? 's' : ''} played
        </p>
        <button
          className="bb-blitz__confirm-btn"
          onClick={() => onComplete?.()}
          aria-label="Continue game"
          type="button"
        >
          Continue ›
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bb-blitz${humanIsEliminated ? ' bb-blitz--spectator' : ''}`}
      data-status={bb.status}
      data-test-mode={testMode ? 'true' : undefined}
    >
      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="bb-blitz__header">
        <span className="bb-blitz__comp-badge">{prizeType}</span>
        <span className="bb-blitz__title">Biography Blitz</span>
        <span className="bb-blitz__round-badge">Round {bb.round + 1}</span>
      </div>

      {/* Spectator banner — shown after the human is eliminated ─────────── */}
      {humanIsEliminated && (
        <div className="bb-blitz__spectator-banner" role="status" aria-live="polite">
          <span aria-hidden="true">👀 </span>You've been eliminated — watching as a spectator
        </div>
      )}

      {/* Hot streak banner ───────────────────────────────────────────────── */}
      {bb.hotStreakOwner && bb.status === 'question' && (
        <div className="bb-blitz__streak-banner" role="status" aria-live="polite">
          {pickLine(NARRATION.streak, bb.round).replace(
            '{name}',
            bb.hotStreakOwner === humanContestantId ? 'You' : displayName(bb.hotStreakOwner),
          )}
        </div>
      )}

      {/* Contestant strip ────────────────────────────────────────────────── */}
      <div className="bb-blitz__contestants" aria-label="Active contestants">
        {bb.activeContestants.map((id) => {
          const name = displayName(id);
          const avatarVal = playerAvatar(id);
          const hasAnswered = id in bb.submissions;
          const isHumanPlayer = id === humanContestantId;
          let pillClass = 'bb-blitz__contestant-pill';
          if (hasAnswered) pillClass += ' bb-blitz__contestant-pill--answered';
          if (isHumanPlayer) pillClass += ' bb-blitz__contestant-pill--you';
          if (bb.status === 'reveal' || bb.status === 'choose_elimination') {
            const correct = bb.submissions[id] === bb.correctAnswerId;
            pillClass += correct
              ? ' bb-blitz__contestant-pill--correct'
              : ' bb-blitz__contestant-pill--wrong';
          }
          if (id === bb.hotStreakOwner) pillClass += ' bb-blitz__contestant-pill--streak';
          return (
            <div key={id} className={pillClass} aria-label={name}>
              <FallbackAvatar
                id={id}
                name={name}
                avatar={avatarVal}
                className="bb-blitz__pill-avatar"
                altText=""
              />
              <span className="bb-blitz__pill-name">{isHumanPlayer ? 'You' : name}</span>
              {hasAnswered && bb.status === 'question' && (
                <span className="bb-blitz__pill-check" aria-hidden="true">✓</span>
              )}
              {id === bb.hotStreakOwner && (
                <span className="bb-blitz__streak-icon" aria-hidden="true">🔥</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Narration banner ────────────────────────────────────────────────── */}
      <p className="bb-blitz__narration" aria-live="polite">
        {bb.status === 'choose_elimination'
          ? humanIsChooser
            ? pickLine(NARRATION.chooseEliminationYou, bb.round)
            : pickLine(NARRATION.chooseElimination, bb.round).replace(
                '{winner}',
                displayName(bb.roundWinnerIds[0] ?? ''),
              )
          : bb.status === 'reveal'
            ? voidedRound
              ? pickLine(NARRATION.voided, bb.round)
              : pickLine(NARRATION.correct, bb.round)
            : bb.status === 'question' && bb.lastEliminatedId !== null
              ? pickLine(NARRATION.eliminated, bb.round).replace(
                  '{name}',
                  displayName(bb.lastEliminatedId),
                )
              : pickLine(NARRATION.question, bb.round)}
      </p>

      {/* Choose elimination screen ──────────────────────────────────────── */}
      {bb.status === 'choose_elimination' && humanIsChooser && (
        <div
          className="bb-blitz__elim-picker bb-blitz__elim-picker--cinematic"
          role="group"
          aria-label="Choose a houseguest to eliminate"
        >
          <p className="bb-blitz__elim-picker-title" aria-hidden="true">
            ☠️ Choose your target
          </p>
          <div className="bb-blitz__elim-candidates">
            {bb.eliminationCandidates.map((candidateId) => {
              const cname = displayName(candidateId);
              const cavatar = playerAvatar(candidateId);
              return (
                <button
                  key={candidateId}
                  className="bb-blitz__elim-candidate-btn"
                  onClick={() => handleEliminationPick(candidateId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEliminationPick(candidateId);
                    }
                  }}
                  aria-label={`Eliminate ${cname}`}
                  type="button"
                >
                  <span className="bb-blitz__avatar-wrapper">
                    <FallbackAvatar
                      id={candidateId}
                      name={cname}
                      avatar={cavatar}
                      className="bb-blitz__avatar-img"
                      altText={cname}
                    />
                  </span>
                  <span className="bb-blitz__avatar-name">{cname}</span>
                  <span className="bb-blitz__elim-icon" aria-hidden="true">🚪</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI is choosing — show suspense overlay */}
      {bb.status === 'choose_elimination' && !humanIsChooser && (
        <div className="bb-blitz__elim-waiting" aria-live="polite">
          <span className="bb-blitz__elim-waiting-icon" aria-hidden="true">⚡</span>
          <span>{displayName(bb.roundWinnerIds[0] ?? '')} is choosing…</span>
        </div>
      )}

      {/* Question card ───────────────────────────────────────────────────── */}
      {currentQuestion && bb.status !== 'choose_elimination' && (
        <div
          className="bb-blitz__question-card bb-blitz__question-card--reveal"
          role="region"
          aria-label="Current question"
        >
          <p className="bb-blitz__question-prompt">{currentQuestion.prompt}</p>

          {avatarMode ? (
            /* ── Avatar grid (dynamic bio questions) ── */
            <div
              className="bb-blitz__avatar-grid"
              role="group"
              aria-label="Select the correct houseguest"
            >
              {currentQuestion.answers.map((answer) => {
                const isSelected = humanAnswer === answer.id;
                const isCorrect = bb.status === 'reveal' && answer.id === bb.correctAnswerId;
                const isWrong =
                  bb.status === 'reveal' &&
                  answer.id !== bb.correctAnswerId &&
                  answer.id === humanAnswer;
                const isLocked = isSelected && bb.status === 'question';
                const isDisabled =
                  bb.status !== 'question' ||
                  humanAnswer !== null ||
                  humanContestantId === null ||
                  humanIsEliminated; // spectator — human can no longer answer
                // Hot streak bonus: visually dim a provably-wrong answer for
                // the streak owner. The bonus never reveals the correct answer.
                const isStreakBonusWrong =
                  bb.hotStreakOwner === humanContestantId &&
                  bb.hotStreakBonusWrongAnswerId === answer.id &&
                  bb.status === 'question' &&
                  !isSelected;

                const answerName = displayName(answer.id);

                let cls = 'bb-blitz__avatar-btn';
                if (isSelected) cls += ' bb-blitz__avatar-btn--selected';
                if (isLocked) cls += ' bb-blitz__avatar-btn--locked';
                if (isCorrect) cls += ' bb-blitz__avatar-btn--correct';
                if (isWrong) cls += ' bb-blitz__avatar-btn--wrong';
                if (isStreakBonusWrong) cls += ' bb-blitz__avatar-btn--bonus-hint';
                if (isDisabled && !isCorrect && !isWrong) {
                  cls += ' bb-blitz__avatar-btn--disabled';
                }

                return (
                  <button
                    key={answer.id}
                    className={cls}
                    onClick={() => handleAnswerSelect(answer.id)}
                    onTouchStart={(e) => {
                      // Prevent ghost click on mobile.
                      e.preventDefault();
                      handleAnswerSelect(answer.id);
                    }}
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    aria-label={`Select ${answerName}${isStreakBonusWrong ? ' (unlikely)' : ''}`}
                    tabIndex={isDisabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAnswerSelect(answer.id);
                      }
                    }}
                  >
                    <span className="bb-blitz__avatar-wrapper">
                      <FallbackAvatar
                        id={answer.id}
                        name={answerName}
                        avatar={playerAvatar(answer.id)}
                        className="bb-blitz__avatar-img"
                        altText={answerName}
                      />
                      {isLocked && (
                        <span className="bb-blitz__lock-icon" aria-hidden="true">🔒</span>
                      )}
                      {isCorrect && (
                        <span className="bb-blitz__spotlight-icon" aria-hidden="true">✓</span>
                      )}
                      {isWrong && (
                        <span className="bb-blitz__wrong-icon" aria-hidden="true">✗</span>
                      )}
                    </span>
                    <span className="bb-blitz__avatar-name">{answerName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* ── Text-button mode (static question bank fallback) ── */
            <ul className="bb-blitz__answers" role="list">
              {currentQuestion.answers.map((answer) => {
                const isSelected = humanAnswer === answer.id;
                const isCorrect = bb.status === 'reveal' && answer.id === bb.correctAnswerId;
                const isWrong =
                  bb.status === 'reveal' &&
                  answer.id !== bb.correctAnswerId &&
                  answer.id === humanAnswer;

                let cls = 'bb-blitz__answer-btn';
                if (isSelected && bb.status === 'question') cls += ' bb-blitz__answer-btn--selected';
                if (isCorrect) cls += ' bb-blitz__answer-btn--correct';
                if (isWrong) cls += ' bb-blitz__answer-btn--wrong';

                return (
                  <li key={answer.id} role="listitem">
                    <button
                      className={cls}
                      onClick={() => handleAnswerSelect(answer.id)}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        handleAnswerSelect(answer.id);
                      }}
                      disabled={
                        bb.status !== 'question' || humanAnswer !== null || humanContestantId === null || humanIsEliminated
                      }
                      aria-pressed={isSelected}
                      aria-label={answer.text}
                      tabIndex={
                        bb.status !== 'question' || humanAnswer !== null || humanContestantId === null || humanIsEliminated
                          ? -1
                          : 0
                      }
                    >
                      <span className="bb-blitz__answer-letter" aria-hidden="true">
                        {answer.id.toUpperCase()}
                      </span>
                      <span className="bb-blitz__answer-text">{answer.text}</span>
                      {isCorrect && (
                        <span className="bb-blitz__answer-badge" aria-hidden="true">✓</span>
                      )}
                      {isWrong && (
                        <span className="bb-blitz__answer-badge" aria-hidden="true">✗</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Human feedback banner ───────────────────────────────────────────── */}
      {(bb.status === 'reveal' || bb.status === 'choose_elimination') && humanContestantId && (
        <p
          className={`bb-blitz__feedback ${
            humanAnsweredCorrectly ? 'bb-blitz__feedback--correct' : 'bb-blitz__feedback--wrong'
          }`}
          aria-live="assertive"
        >
          {humanAnsweredCorrectly
            ? pickLine(NARRATION.correct, bb.round)
            : pickLine(NARRATION.wrong, bb.round)}
        </p>
      )}

      {/* Eliminated list ─────────────────────────────────────────────────── */}
      {bb.eliminatedContestants.length > 0 && (
        <div className="bb-blitz__eliminated" aria-label="Eliminated contestants">
          <span className="bb-blitz__eliminated-label">Eliminated: </span>
          {bb.eliminatedContestants.map((id) => (
            <span key={id} className="bb-blitz__eliminated-name">
              {displayName(id)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Export timing constants so Storybook / integration tests can import them.
export { HUMAN_ANSWER_TIMEOUT_MS, REVEAL_PAUSE_MS, CHOOSE_ELIMINATION_AUTO_DELAY_MS, SHIMMER_DURATION_MS, HUMAN_ELIM_TIMEOUT_MS, WINNER_AUTO_ADVANCE_MS };
