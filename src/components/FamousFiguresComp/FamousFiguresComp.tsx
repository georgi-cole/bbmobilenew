/**
 * FamousFiguresComp — React UI for the "Famous Figures" competition.
 *
 * UI states:
 *   round_active  — Base clue + revealed hints. Guess input, Request Hint button, timer, scoreboard.
 *   round_reveal  — Correct answer shown with who got it right. Auto-advances after 3s.
 *   complete      — Winner announcement. Fires onComplete after 4s.
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  startFamousFigures,
  revealNextHint,
  advanceTimer,
  submitPlayerGuess,
  endRound,
  nextRound,
  resetFamousFigures,
  finishAllRounds,
  FAMOUS_FIGURES,
  setAiSubmissionsForRound,
  buildAiSubmissionsForRound,
  getPlayerFigureIndex,
} from '../../features/famousFigures/famousFiguresSlice';
import type {
  FamousFiguresState,
  FamousFiguresPrizeType,
} from '../../features/famousFigures/famousFiguresSlice';
import { resolveFamousFiguresOutcome } from '../../features/famousFigures/thunks';
import { mulberry32 } from '../../store/rng';
import { getDicebear, resolveAvatar } from '../../utils/avatar';
import { isAcceptedGuess, normalizeForMatching } from '../../games/famous-figures/fuzzy';
import { getHintText } from '../../games/famous-figures/hints';
import './FamousFiguresComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Duration (ms) to display the round-reveal screen before advancing to the
 * next round. Short but non-zero to avoid visual jank; can be overridden via
 * the `revealPauseMs` prop.
 */
const DEFAULT_REVEAL_PAUSE_MS = 1500;

const WINNER_SCREEN_DURATION_MS = 4000;

// Timer durations per phase (milliseconds).
// All active phases use 10 s so the full round stays under 80 s even with all
// hints revealed and an overtime window.
const PHASE_DURATIONS: Record<string, number> = {
  clue: 10000,
  hint_1: 10000,
  hint_2: 10000,
  hint_3: 10000,
  hint_4: 10000,
  hint_5: 10000,
  overtime: 10000,
  done: 0,
};

// ─── Narration ────────────────────────────────────────────────────────────────

const NARRATION = {
  roundStart: [
    "A mysterious figure from history awaits — who could it be? 🕵️",
    "Can you name this famous face from the past? Put your knowledge to the test! 📜",
    "History is full of legends. Do you know this one? 🏛️",
    "Time to prove your historical knowledge! Who is hiding in these clues? 🔍",
  ],
  correct: [
    "Correct! You clearly paid attention in history class! 📚",
    "Nailed it! You're a true history buff! ⭐",
    "Right on! Your knowledge of the past is impressive! 🏆",
    "That's correct! A legendary answer for a legendary figure! 🎖️",
  ],
  wrong: [
    "Not quite — brush up on your history! 📖",
    "Incorrect! More hints might help reveal the truth! 💡",
    "That's not right — keep thinking! The answer is in the clues! 🧩",
    "Wrong answer — history has a way of surprising us! 😬",
  ],
  reveal: [
    "Time's up! Let's see who our mystery figure was! 🎭",
    "The reveal moment has arrived! Was your guess right? 🎪",
    "Mystery solved! Here is your famous figure! ✨",
    "And the historical figure is... drum roll please! 🥁",
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
  avatar?: string;
}

/**
 * Metadata attached to each pending AI submission timeout so the cleanup
 * handler can cancel stale timeouts on round advance or unmount.
 */
type PendingAiTimeout = {
  /** The underlying setTimeout handle. */
  id: ReturnType<typeof setTimeout>;
  /** The AI player id to submit a guess for. */
  aiId: string;
  /** Global round index the submission belongs to. */
  round: number;
};

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType: FamousFiguresPrizeType;
  seed: number;
  onComplete?: () => void;
  /**
   * When true (default), skip the winner animation on match completion and
   * show the final scoreboard immediately instead. The `onComplete` callback
   * still fires after `WINNER_SCREEN_DURATION_MS` so players can read the
   * results. Set to false to restore the animated winner card.
   */
  skipWinnerAnimation?: boolean;
  /**
   * Duration (ms) to hold the round-reveal screen before advancing to the
   * next round. Must be non-zero to avoid visual jank. Defaults to
   * `DEFAULT_REVEAL_PAUSE_MS` (1500 ms).
   */
  revealPauseMs?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FamousFiguresComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
  skipWinnerAnimation = true,
  revealPauseMs = DEFAULT_REVEAL_PAUSE_MS,
}: Props) {
  // Guard: the reveal pause must always be positive to prevent visual jank.
  const safeRevealPauseMs = revealPauseMs > 0 ? revealPauseMs : DEFAULT_REVEAL_PAUSE_MS;
  const dispatch = useAppDispatch();
  const ff = useAppSelector(
    (s: RootState) =>
      (s as RootState & { famousFigures: FamousFiguresState }).famousFigures,
  );
  const storePlayers = useAppSelector(
    (s: RootState) =>
      (s as RootState & { game: { players: Array<{ id: string; name: string; avatar?: string; isUser?: boolean }> } })
        .game?.players ?? [],
  );

  // ── Build player map ──────────────────────────────────────────────────────
  const playerMap: Record<string, { name: string; isHuman: boolean; avatar: string }> = {};
  if (participantsProp) {
    for (const p of participantsProp) {
      playerMap[p.id] = {
        name: p.name,
        isHuman: p.isHuman,
        avatar: p.avatar ?? getDicebear(p.name),
      };
    }
  }
  for (const p of storePlayers) {
    if (participantIds.includes(p.id)) {
      playerMap[p.id] = {
        name: p.name,
        isHuman: !!p.isUser,
        avatar: resolveAvatar({ id: p.id, name: p.name, avatar: p.avatar ?? '' }),
      };
    }
  }

  const humanId: string | null =
    Object.entries(playerMap).find(([, v]) => v.isHuman)?.[0] ?? null;

  function displayName(id: string): string {
    return playerMap[id]?.name ?? id;
  }

  function playerAvatar(id: string): string {
    return playerMap[id]?.avatar ?? getDicebear(displayName(id));
  }

  // ── Effective seed ────────────────────────────────────────────────────────
  // When no explicit seed is provided (seed === 0), use Date.now() so each
  // production match gets fresh randomisation. Test pages can pass a non-zero
  // seed for fully deterministic behaviour.
  const effectiveSeed = useMemo(() => (seed !== 0 ? seed : Math.floor(Date.now())), [seed]);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [guessInput, setGuessInput] = useState('');
  const [inputState, setInputState] = useState<'idle' | 'correct' | 'wrong' | 'duplicate'>('idle');
  const [timerSecs, setTimerSecs] = useState(10);
  /**
   * Local hint counter for rounds where the human is playing ahead of the
   * global round. Reset to 0 whenever the human's cursor advances.
   */
  const [humanAheadHints, setHumanAheadHints] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ffRef = useRef(ff);
  ffRef.current = ff;
  const completeFiredRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);
  /**
   * Explicit ref to the currently active phase interval + timeout.
   *
   * Double-timer fix: React guarantees the effect cleanup function runs before
   * the effect re-executes when `[ff.timerPhase, ff.currentRound, ff.status]`
   * changes, so a stale interval/timeout is always cleared first.  This ref
   * provides an additional explicit cancel so that any late-firing stale
   * callback that slipped past the closure guards cannot start a second timer.
   */
  const activeTimerRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> } | null>(null);
  // ── AI submission tracking ────────────────────────────────────────────────
  // Tracks the round for which we have already scheduled AI submissions so we
  // only schedule once per round regardless of how many timer-phase changes
  // occur. Resets when the round advances.
  const aiSubmitScheduledRoundRef = useRef<number>(-1);
  // Pending AI submission timeouts — cleared on round advance or unmount.
  const pendingAiTimeoutsRef = useRef<PendingAiTimeout[]>([]);
  // 300 ms debounce for the hint button — prevents rapid clicking from
  // advancing multiple hint stages in one gesture.
  const hintCooldownUntilRef = useRef<number>(0);

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    dispatch(startFamousFigures({ participantIds, competitionType: prizeType, seed: effectiveSeed }));
    return () => { dispatch(resetFamousFigures()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer per phase ───────────────────────────────────────────────────────
  // Double-timer fix: React runs the previous effect's cleanup (clearInterval +
  // clearTimeout) before re-executing this effect whenever the dependency array
  // [ff.timerPhase, ff.currentRound, ff.status] changes — this guarantees stale
  // timers are cancelled before the new phase timer starts.  The `activeTimerRef`
  // below provides an extra explicit cancel layer so that any late-firing stale
  // callback that survived the closure guards cannot accidentally start a second
  // concurrent timer.
  useEffect(() => {
    if (ff.status !== 'round_active') return;

    // Cancel any previously active timers before starting new ones.
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current.interval);
      clearTimeout(activeTimerRef.current.timeout);
      activeTimerRef.current = null;
    }

    const phase = ff.timerPhase;
    const capturedRound = ff.currentRound;
    const duration = PHASE_DURATIONS[phase] ?? 15000;
    if (duration === 0) return;

    setTimerSecs(Math.round(duration / 1000));

    const interval = setInterval(() => {
      setTimerSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const timeout = setTimeout(() => {
      const current = ffRef.current;
      if (current.status !== 'round_active') return;
      if (current.timerPhase !== phase) return;
      // Stale-timer guard: discard callbacks that belong to a previous round.
      if (current.currentRound !== capturedRound) return;

      if (phase === 'done' || phase === 'overtime') {
        dispatch(endRound());
      } else {
        // Advance timer phase (clue→hint_1→…→hint_5→overtime→done)
        // This correctly handles hint_5 expiry by entering overtime rather
        // than calling revealNextHint() which would be a no-op (capped at 5).
        dispatch(advanceTimer());
      }
    }, duration);

    activeTimerRef.current = { interval, timeout };

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      activeTimerRef.current = null;
    };
  // Re-run when the phase changes or the round changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.timerPhase, ff.currentRound, ff.status]);

  // ── AI submissions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'round_active') return;
    const round = ff.currentRound;
    if (ff.aiSubmissions[round]) return; // already generated

    const aiIds = participantIds.filter((id) => id !== humanId);
    if (aiIds.length === 0) return;

    const rng = mulberry32(effectiveSeed ^ (round * 0x9e3779b9));
    // Build per-AI submissions using each AI's own figure for this round.
    const submissions: Record<string, boolean> = {};
    for (const aiId of aiIds) {
      const aiFigIdx = getPlayerFigureIndex(ff, aiId, round);
      const aiResult = buildAiSubmissionsForRound([aiId], aiFigIdx, ff.hintsRevealed, rng);
      submissions[aiId] = aiResult[aiId] ?? false;
    }
    dispatch(setAiSubmissionsForRound({ round, submissions }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.status, ff.currentRound, ff.hintsRevealed]);

  // Cancel any pending AI submission timeouts when the round advances (or on
  // unmount). This prevents stale submissions from firing after the round ends.
  useEffect(() => {
    return () => {
      pendingAiTimeoutsRef.current.forEach((entry) => clearTimeout(entry.id));
      pendingAiTimeoutsRef.current = [];
      // Reset so the new round can schedule its own submissions.
      aiSubmitScheduledRoundRef.current = -1;
    };
  }, [ff.currentRound]);

  // Schedule AI answers with a random delay after the clue phase expires.
  //
  // We only schedule ONCE per round (aiSubmitScheduledRoundRef guards this) so
  // that subsequent timer-phase changes (hint_2, hint_3 …) or hint-button clicks
  // that also advance the phase do NOT re-trigger a second batch of submissions.
  //
  // The random 2–8 s delay means the AI doesn't snap-close the round the
  // instant the clue phase ends — the human always has meaningful play time.
  useEffect(() => {
    if (ff.status !== 'round_active') return;
    // Wait until the clue phase has passed (human gets the full 15 s base clue).
    if (ff.timerPhase === 'clue') return;

    const round = ff.currentRound;
    // Only schedule once per round regardless of subsequent phase changes.
    if (aiSubmitScheduledRoundRef.current === round) return;

    const aiSubs = ff.aiSubmissions[round];
    if (!aiSubs) return;

    aiSubmitScheduledRoundRef.current = round;
    for (const [aiId, correct] of Object.entries(aiSubs)) {
      if (!correct) continue;
      // Skip AI players who somehow already answered (defensive check).
      if (ff.playerCorrect[aiId]) continue;
      // Random delay within 2–8 s so the AI doesn't autopilot-close the round.
      const delay = 2000 + Math.random() * 6000;
      const t = setTimeout(() => {
        pendingAiTimeoutsRef.current = pendingAiTimeoutsRef.current.filter((e) => e.id !== t);
        // Bail out if the round ended before the AI's delay elapsed.
        const current = ffRef.current;
        if (current.status !== 'round_active') return;
        if (current.currentRound !== round) return; // stale round guard
        if (current.playerCorrect[aiId]) return;
        // Use the AI's personal figure for this round.
        const aiFigIdx = getPlayerFigureIndex(current, aiId, round);
        const aiFigure = FAMOUS_FIGURES[aiFigIdx];
        if (!aiFigure) return;
        dispatch(submitPlayerGuess({ playerId: aiId, guess: aiFigure.canonicalName, timestamp: Date.now() }));
      }, delay);
      pendingAiTimeoutsRef.current.push({ id: t, aiId, round });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.aiSubmissions, ff.currentRound, ff.status, ff.timerPhase]);

  // ── Auto-advance from reveal ──────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'round_reveal') return;
    const t = setTimeout(() => {
      dispatch(nextRound());
    }, safeRevealPauseMs);
    return () => clearTimeout(t);
  }, [ff.status, ff.currentRound, dispatch, safeRevealPauseMs]);

  // ── Complete → fire onComplete ────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'complete') return;
    if (completeFiredRef.current) return;
    completeFiredRef.current = true;

    dispatch(resolveFamousFiguresOutcome());

    const t = setTimeout(() => { onComplete?.(); }, WINNER_SCREEN_DURATION_MS);
    return () => clearTimeout(t);
  }, [ff.status, dispatch, onComplete]);

  // ── Reset input state when human advances to next figure ─────────────────
  // Fires on cursor advance (human played ahead) AND on global nextRound.
  // Only humanCursor needs to be in the dependency array — every other value
  // we care about (guessInput, inputState, humanAheadHints) is local state
  // being *set* here, not read, so listing them would create an infinite loop.
  const humanCursor = humanId !== null ? (ff.playerRoundCursor[humanId] ?? 0) : 0;
  useEffect(() => {
    setGuessInput('');
    setInputState('idle');
    setHumanAheadHints(0);
  // humanCursor is the only trigger needed — see comment above.
  }, [humanCursor]);

  // ── Guess handler ─────────────────────────────────────────────────────────
  const handleSubmitGuess = useCallback(() => {
    if (!humanId) return;
    if (ff.status !== 'round_active') return;
    // Block if human has finished all personal rounds
    if (humanCursor >= ff.totalRounds) return;
    // Block if human already answered this personal round
    if (humanCursor !== (ff.playerRoundCursor[humanId] ?? 0)) return;

    const now = Date.now();
    if (now < cooldownUntilRef.current) return;
    const cooldownMs = 800 + Math.random() * 400;
    cooldownUntilRef.current = now + cooldownMs;

    const trimmed = guessInput.trim();
    if (trimmed.length === 0) return;

    // Local duplicate check for current global round only (to match slice logic).
    // Use normalizeForMatching so the comparison is case-insensitive and
    // particle-stripped — consistent with the slice's own duplicate guard.
    const isAheadRound = humanCursor > ff.currentRound;
    if (!isAheadRound) {
      const normalizedTrimmed = normalizeForMatching(trimmed);
      const alreadyGuessed = (ff.playerGuesses[humanId] ?? []).some(
        (g) => normalizeForMatching(g) === normalizedTrimmed,
      );
      if (alreadyGuessed) {
        setInputState('duplicate');
        return;
      }
    }

    // Resolve the figure for the human's current personal round from the
    // shared matchFigureOrder.  Fall back to getPlayerFigureIndex for legacy.
    const humanFigIdx =
      ff.matchFigureOrder.length > humanCursor
        ? ff.matchFigureOrder[humanCursor]
        : getPlayerFigureIndex(
            {
              matchFigureOrder: ff.matchFigureOrder,
              playerFigureQueues: ff.playerFigureQueues,
              figureOrder: ff.figureOrder,
              currentFigureIndex: ff.currentFigureIndex,
            },
            humanId,
            humanCursor,
          );
    const localFigure = FAMOUS_FIGURES[humanFigIdx];
    if (!localFigure) return;

    // Check correctness locally for immediate UI feedback
    const correct = isAcceptedGuess(trimmed, localFigure);
    // Pass targetRound so the slice knows which round the human is answering.
    dispatch(submitPlayerGuess({ playerId: humanId, guess: trimmed, targetRound: humanCursor, timestamp: Date.now() }));
    setInputState(correct ? 'correct' : 'wrong');
    if (correct) {
      setGuessInput('');
    }
    // Clear feedback after a moment
    setTimeout(() => setInputState('idle'), 1500);
  }, [
    humanId,
    humanCursor,
    ff.status,
    ff.totalRounds,
    ff.playerRoundCursor,
    ff.playerGuesses,
    ff.currentRound,
    ff.matchFigureOrder,
    ff.playerFigureQueues,
    ff.figureOrder,
    ff.currentFigureIndex,
    guessInput,
    dispatch,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSubmitGuess();
    },
    [handleSubmitGuess],
  );

  const handleRequestHint = useCallback(() => {
    if (ff.status !== 'round_active') return;
    // 300 ms client-side debounce
    const now = Date.now();
    if (now < hintCooldownUntilRef.current) return;
    hintCooldownUntilRef.current = now + 300;

    // When human is ahead of the global round, manage hints locally so we
    // don't mutate the global hintsRevealed for the ongoing AI round.
    if (humanCursor > ff.currentRound) {
      if (humanAheadHints >= 5) return;
      setHumanAheadHints((prev) => Math.min(prev + 1, 5));
      return;
    }

    if (ff.hintsRevealed >= 5) return;
    dispatch(revealNextHint());
  }, [ff.status, ff.hintsRevealed, ff.currentRound, humanCursor, humanAheadHints, dispatch]);

  // "Finish Match" — cancel all pending AI timeouts and atomically complete
  // all remaining rounds via the finishAllRounds slice action.
  const handleFinishMatch = useCallback(() => {
    pendingAiTimeoutsRef.current.forEach((e) => clearTimeout(e.id));
    pendingAiTimeoutsRef.current = [];
    dispatch(finishAllRounds());
  }, [dispatch]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // The human's active personal round is their cursor position.  With the
  // shared matchFigureOrder all players see the same figure per global round,
  // but the human can advance ahead of the global round immediately after
  // answering correctly.
  const humanIsAhead = humanId !== null && humanCursor > ff.currentRound;
  // Resolve the human's current figure from the shared matchFigureOrder.
  const humanFigureIdx =
    humanId !== null && ff.matchFigureOrder.length > humanCursor
      ? ff.matchFigureOrder[humanCursor]
      : humanId !== null
        ? getPlayerFigureIndex(ff, humanId, humanCursor)
        : ff.currentFigureIndex;
  // Always show the human's own figure — on round_reveal this is the figure
  // they were actually being tested on. When there is no local human player,
  // fall back to the global currentFigureIndex.
  const figure = FAMOUS_FIGURES[humanFigureIdx] ?? null;
  // For hints: when ahead of the global round use the local counter so we
  // don't mutate the global hintsRevealed for the ongoing AI round.
  const effectiveHintsRevealed = humanIsAhead ? humanAheadHints : ff.hintsRevealed;
  // humanCorrect: true only if the human has already answered their CURRENT
  // personal round. When the human is ahead, they are on a fresh round (cursor
  // has already moved) so correct = false until they answer the new figure.
  let humanCorrect = false;
  if (humanId) {
    if (humanIsAhead) {
      // Cursor has advanced — human is on a new round not yet answered.
      humanCorrect = false;
    } else {
      humanCorrect = ff.playerCorrect[humanId] ?? false;
    }
  }
  const hintsAllRevealed = effectiveHintsRevealed >= 5;
  const canRequestHint =
    ff.status === 'round_active' &&
    humanCursor < ff.totalRounds &&
    !humanCorrect &&
    !hintsAllRevealed &&
    (humanIsAhead || (ff.timerPhase !== 'overtime' && ff.timerPhase !== 'done'));

  // True when the local human player has solved all their personal rounds but
  // the global match has not yet transitioned to 'complete' (the timer for the
  // last round is still running for other players).
  // (humanIsAhead is already derived above; mid-round advance shows next figure
  // immediately, no mid-match waiting screen needed.)
  const humanAllDone =
    humanId !== null &&
    humanCursor >= ff.totalRounds &&
    ff.status !== 'complete';

  // True when the global match has exhausted all rounds and is no longer active.
  const matchRoundsExhausted =
    ff.currentRound >= ff.totalRounds - 1 && ff.status !== 'round_active';

  // Number of participants who haven't yet finished all their personal rounds.
  const remainingPlayersCount = matchRoundsExhausted
    ? 0
    : participantIds.filter(
        (id) => (ff.playerRoundCursor[id] ?? 0) < ff.totalRounds,
      ).length;

  const timerPct = (() => {
    const dur = PHASE_DURATIONS[ff.timerPhase] ?? 15000;
    if (dur === 0) return 0;
    return Math.max(0, Math.min(100, (timerSecs / (dur / 1000)) * 100));
  })();

  const timerClass =
    timerPct > 50
      ? 'ff-timer-fill'
      : timerPct > 25
        ? 'ff-timer-fill ff-timer-fill--warning'
        : 'ff-timer-fill ff-timer-fill--danger';

  // ── Render: loading ───────────────────────────────────────────────────────
  if (ff.status === 'idle') {
    return (
      <div className="ff-container ff-container--loading" aria-live="polite">
        <p>Loading Famous Figures…</p>
      </div>
    );
  }

  // ── Render: personal waiting screen (all personal rounds done) ────────────
  // Shown only when the human has finished ALL their personal rounds and the
  // global match hasn't yet completed.  Mid-round advancement is handled by
  // showing the next figure immediately in the round_active render below.
  if (humanAllDone) {
    const humanTotal = humanId ? (ff.playerScores[humanId] ?? 0) : 0;
    const personalScores = humanId ? (ff.playerPersonalRoundScores[humanId] ?? []) : [];
    const allRoundScores = Array.from(
      { length: ff.totalRounds },
      (_, i) => personalScores[i] ?? 0,
    );
    return (
      <div className="ff-container ff-container--waiting">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">Your Rounds Done!</span>
        </div>

        <div className="ff-personal-results">
          <div className="ff-personal-results-title">Your Results</div>
          <div className="ff-personal-results-score">{humanTotal} pts</div>
          <div className="ff-personal-results-rounds">
            [{allRoundScores.join(', ')}]
          </div>
        </div>

        <div className="ff-waiting-banner" aria-live="polite">
          ⏳ Waiting for other players to finish…
          {remainingPlayersCount > 0 && (
            <span className="ff-waiting-banner-sub">
              {remainingPlayersCount} player{remainingPlayersCount !== 1 ? 's' : ''} still playing
            </span>
          )}
        </div>

        <button
          className="ff-fastforward-btn ff-fastforward-btn--finish"
          onClick={handleFinishMatch}
          type="button"
          aria-label="Finish match and see results"
        >
          🏁 Finish Match
        </button>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
      </div>
    );
  }

  // ── Render: complete ──────────────────────────────────────────────────────
  if (ff.status === 'complete') {
    const winnerId = ff.winnerId ?? '';
    const winnerName = displayName(winnerId);
    const isHumanWinner = winnerId === humanId;

    if (skipWinnerAnimation) {
      // Show the final scoreboard immediately — no trophy animation.
      return (
        <div className="ff-container ff-container--complete ff-container--final-scores" aria-live="assertive">
          <div className="ff-header">
            <span className="ff-comp-badge">{prizeType}</span>
            <span className="ff-title">Famous Figures</span>
            <span className="ff-round-badge">Final Results</span>
          </div>

          <div className="ff-winner-banner" role="status">
            🏆&nbsp;{winnerName}
            {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
            &nbsp;wins!&nbsp;
            <span className="ff-winner-banner-sub">{prizeType} Winner — {ff.playerScores[winnerId] ?? 0} pts</span>
          </div>

          {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}

          <button
            className="ff-continue-btn"
            onClick={() => onComplete?.()}
            aria-label="Continue game"
            type="button"
          >
            Continue ›
          </button>
        </div>
      );
    }

    // Original animated winner card (skipWinnerAnimation === false)
    return (
      <div className="ff-container ff-container--complete" aria-live="assertive">
        <div className="ff-winner-card">
          <div className="ff-winner-trophy" aria-hidden="true">🏆</div>
          <h2 className="ff-winner-title">Famous Figures Champion!</h2>
          <div className="ff-winner-avatar">
            <img
              src={playerAvatar(winnerId)}
              alt={winnerName}
              onError={(e) => { e.currentTarget.src = getDicebear(winnerName); }}
            />
          </div>
          <p className="ff-winner-name">
            {winnerName}
            {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
          </p>
          <p className="ff-winner-subtitle">
            {prizeType} Winner — Total Score: {ff.playerScores[winnerId] ?? 0}
          </p>
          <button
            className="ff-continue-btn"
            onClick={() => onComplete?.()}
            aria-label="Continue game"
            type="button"
          >
            Continue ›
          </button>
        </div>
      </div>
    );
  }

  // ── Render: reveal ────────────────────────────────────────────────────────
  if (ff.status === 'round_reveal') {
    const winnersThisRound = ff.correctPlayers;
    return (
      <div className="ff-container" data-status="round_reveal">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">Round {ff.currentRound + 1} of {ff.totalRounds}</span>
        </div>

        <p className="ff-narration" aria-live="polite">
          {pickLine(NARRATION.reveal, ff.currentRound)}
        </p>

        <div className="ff-reveal-card" aria-live="assertive">
          <div className="ff-reveal-label">The Answer Was</div>
          <div className="ff-reveal-name">{figure?.canonicalName ?? '—'}</div>
          {winnersThisRound.length > 0 ? (
            <div className="ff-reveal-winners">
              ✅ Correct: {winnersThisRound.map((id) => displayName(id)).join(', ')}
            </div>
          ) : (
            <div className="ff-reveal-no-winner">No one guessed correctly this round!</div>
          )}
        </div>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}

        <p style={{ fontSize: '0.75rem', color: '#557799', margin: 0 }}>
          Next round loading…
        </p>
      </div>
    );
  }

  // ── Render: round_active ──────────────────────────────────────────────────
  const inputFieldClass = [
    'ff-input-field',
    inputState === 'correct' ? 'ff-input-field--correct' : '',
    inputState === 'wrong' ? 'ff-input-field--shake' : '',
  ].filter(Boolean).join(' ');

  const feedbackMsg =
    inputState === 'correct' ? '✅ Correct!' :
    inputState === 'wrong' ? '❌ Not quite, try again!' :
    inputState === 'duplicate' ? 'Already guessed that.' : '';

  const feedbackClass =
    inputState === 'correct' ? 'ff-input-feedback ff-input-feedback--correct' :
    inputState === 'wrong' ? 'ff-input-feedback ff-input-feedback--wrong' :
    inputState === 'duplicate' ? 'ff-input-feedback ff-input-feedback--duplicate' :
    'ff-input-feedback';

  // Show the human's personal round number (cursor + 1) when they are ahead,
  // otherwise show the global round number.
  const displayRound = humanIsAhead ? humanCursor + 1 : ff.currentRound + 1;

  return (
    <div className="ff-container" data-status="round_active">
      {/* Header */}
      <div className="ff-header">
        <span className="ff-comp-badge">{prizeType}</span>
        <span className="ff-title">Famous Figures</span>
        <span className="ff-round-badge">Round {displayRound} of {ff.totalRounds}</span>
      </div>

      {/* Narration */}
      <p className="ff-narration" aria-live="polite">
        {pickLine(NARRATION.roundStart, humanCursor)}
      </p>

      {/* Timer — only relevant for the global round (not shown when playing ahead) */}
      {!humanIsAhead && (
        <div
          className="ff-timer"
          aria-label={`Timer: ${timerSecs} seconds remaining`}
          role="timer"
        >
          <div className="ff-timer-bar">
            <div
              className={timerClass}
              style={{ width: `${timerPct}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="ff-timer-label">{timerSecs}s</span>
        </div>
      )}

      {/* Clue card */}
      {figure && (
        <div className="ff-clue-card" role="region" aria-label="Current clue">
          <div className="ff-clue-label">Clue</div>
          <p className="ff-base-clue">{figure.baseClueFact}</p>
          {effectiveHintsRevealed > 0 && (
            <ul className="ff-hint-list" aria-label="Revealed hints">
              {Array.from({ length: effectiveHintsRevealed }, (_, i) => (
                <li key={i} className="ff-hint-item">
                  <span className="ff-hint-num">#{i + 1}</span>
                  <span>{getHintText(figure, i)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Request hint button */}
      <button
        className="ff-hint-btn"
        onClick={handleRequestHint}
        disabled={!canRequestHint}
        aria-label={`Request hint (${5 - effectiveHintsRevealed} remaining)`}
      >
        💡 Request Hint ({effectiveHintsRevealed}/5 used)
      </button>

      {/* Guess input */}
      <div className="ff-input-area">
        <div className="ff-input-row">
          <input
            ref={inputRef}
            className={inputFieldClass}
            type="text"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your guess…"
            aria-label="Guess the famous figure"
            disabled={ff.status !== 'round_active' || humanCorrect || humanId === null || humanCursor >= ff.totalRounds}
          />
          <button
            className="ff-submit-btn"
            onClick={handleSubmitGuess}
            disabled={ff.status !== 'round_active' || humanCorrect || humanId === null || guessInput.trim().length === 0 || humanCursor >= ff.totalRounds}
            aria-label="Submit guess"
          >
            Submit
          </button>
        </div>
        <div className={feedbackClass} aria-live="assertive">
          {feedbackMsg}
        </div>
      </div>

      {/* Scoreboard */}
      {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
    </div>
  );
}

// ─── Scoreboard helper ────────────────────────────────────────────────────────

function renderScoreboard(
  ff: FamousFiguresState,
  participantIds: string[],
  humanId: string | null,
  displayName: (id: string) => string,
  playerAvatar: (id: string) => string,
) {
  const sorted = [...participantIds].sort(
    (a, b) => (ff.playerScores[b] ?? 0) - (ff.playerScores[a] ?? 0),
  );

  return (
    <div className="ff-scoreboard" aria-label="Scoreboard">
      <div className="ff-scoreboard-title">Scoreboard</div>
      <div className="ff-scoreboard-list">
        {sorted.map((id) => {
          const isHuman = id === humanId;
          const name = displayName(id);
          const total = ff.playerScores[id] ?? 0;
          const roundScores = ff.playerRoundScores[id] ?? [];
          const correct = ff.playerCorrect[id];
          return (
            <div key={id} className="ff-scoreboard-row">
              <span className="ff-scoreboard-avatar-wrap">
                <img
                  className="ff-scoreboard-avatar"
                  src={playerAvatar(id)}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    const img = e.currentTarget;
                    // one-shot fallback to Dicebear to avoid infinite onError loop
                    img.onerror = null;
                    img.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
                  }}
                />
              </span>
              <span className={`ff-scoreboard-name${isHuman ? ' ff-scoreboard-name--you' : ''}`}>
                {isHuman ? 'You' : name}
              </span>
              <span className="ff-scoreboard-round">
                [{roundScores.join(', ')}]
              </span>
              <span className="ff-scoreboard-total">{total}</span>
              {correct && <span className="ff-scoreboard-correct" aria-label="Correct this round">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
