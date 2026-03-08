/**
 * BiographyBlitzComp — "Biography Blitz" last-player-standing competition.
 *
 * All contestants answer biography-based questions simultaneously.
 * The fastest correct answer wins the round and eliminates one other
 * contestant.  Repeat until one player remains.
 *
 * Phases (driven by Redux state):
 *   question      — Contestants submit answers (avatar buttons).
 *   reveal        — Correct answer shown; round winner announced.
 *   elimination   — Round winner picks who to eliminate.
 *   round_transition — Brief pause between rounds.
 *   complete      — Final winner announced; onComplete fires.
 *
 * Human flow:
 *   - Tap an avatar button to submit answer.
 *   - If eliminated: spectator mode (watch AI finish) or skip button.
 *
 * AI flow:
 *   - Auto-submits after 700–4000 ms random delay (capped at deadline).
 *   - If round winner: AI auto-picks elimination target.
 */
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initBiographyBlitz,
  submitBiographyBlitzAnswer,
  resolveRound,
  advanceFromReveal,
  pickEliminationTarget,
  startNextRound,
  resetBiographyBlitz,
  buildAiSubmissions,
  resolveBiographyBlitzHumanContestantId,
  chooseBiographyBlitzEliminationTarget,
  getContestantName,
  HIDDEN_DEADLINE_MS,
} from '../../features/biographyBlitz/biography_blitz_logic';
import type { BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic';
import { resolveBiographyBlitzOutcome } from '../../features/biographyBlitz/thunks';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import HOUSEGUESTS from '../../data/houseguests';
import './BiographyBlitzComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Pause on reveal screen before advancing (ms). */
const REVEAL_PAUSE_MS = 2_500;
/** Delay before AI auto-picks elimination target (ms). */
const AI_ELIM_DELAY_MS = 1_800;
/** Time human has to pick before AI fallback fires (ms). */
const HUMAN_ELIM_TIMEOUT_MS = 8_000;
/** Pause on round_transition screen before next question (ms). */
const ROUND_TRANSITION_MS = 1_200;
/** Auto-advance delay on winner screen (ms). */
const WINNER_AUTO_ADVANCE_MS = 2_000;
/** Spectator AI round completion auto-advance (ms). */
const SPECTATOR_ADVANCE_MS = 500;

// ─── Avatar helper ────────────────────────────────────────────────────────────

function avatarForId(id: string): string {
  const hg = HOUSEGUESTS.find(h => h.id === id);
  if (hg) {
    return resolveAvatar({ id: hg.id, name: hg.name, avatar: '' });
  }
  return getDicebear(id);
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
  prizeType: BiographyBlitzCompetitionType;
  seed: number;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BiographyBlitzComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const bb = useAppSelector((s: RootState) => s.biographyBlitz);

  // --- Resolve human contestant id ---
  const humanId = useMemo(() => {
    // Prefer the explicit isHuman flag from participants prop.
    const humanPart = participants?.find(p => p.isHuman);
    if (humanPart) {
      return resolveBiographyBlitzHumanContestantId(participantIds, humanPart.id);
    }
    return resolveBiographyBlitzHumanContestantId(participantIds, null);
  }, [participantIds, participants]);

  // --- Refs for timer cleanup ---
  const aiSubmitTimersRef = useRef<number[]>([]);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const humanElimTimerRef = useRef<number | null>(null);
  const aiElimTimerRef = useRef<number | null>(null);
  const deadlineTimerRef = useRef<number | null>(null);

  function clearAllTimers() {
    aiSubmitTimersRef.current.forEach(t => window.clearTimeout(t));
    aiSubmitTimersRef.current = [];
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (humanElimTimerRef.current !== null) {
      window.clearTimeout(humanElimTimerRef.current);
      humanElimTimerRef.current = null;
    }
    if (aiElimTimerRef.current !== null) {
      window.clearTimeout(aiElimTimerRef.current);
      aiElimTimerRef.current = null;
    }
    if (deadlineTimerRef.current !== null) {
      window.clearTimeout(deadlineTimerRef.current);
      deadlineTimerRef.current = null;
    }
  }

  // --- Helper: get display name for contestant ---
  const getName = useCallback((id: string): string => {
    const part = participants?.find(p => p.id === id);
    if (part) return part.name;
    return getContestantName(id);
  }, [participants]);

  // Capture initial values in refs so the init effect can use them
  // without needing to re-run when props change.
  const initParamsRef = useRef({ participantIds, prizeType, seed, humanId });

  // ── 1. Initialize on mount ────────────────────────────────────────────────
  useEffect(() => {
    const { participantIds: pIds, prizeType: pt, seed: s, humanId: hId } = initParamsRef.current;
    dispatch(initBiographyBlitz({
      participantIds: pIds,
      competitionType: pt,
      seed: s,
      humanContestantId: hId,
      now: Date.now(),
    }));
    return () => {
      clearAllTimers();
      dispatch(resetBiographyBlitz());
    };
  }, [dispatch]); // dispatch is stable; init params captured via ref

  // ── 2. Resolve outcome when complete ─────────────────────────────────────
  useEffect(() => {
    if (bb.phase === 'complete' && !bb.outcomeResolved) {
      dispatch(resolveBiographyBlitzOutcome());
    }
  }, [bb.phase, bb.outcomeResolved, dispatch]);

  // ── 3. Auto-advance winner screen ─────────────────────────────────────────
  useEffect(() => {
    if (bb.phase !== 'complete') return;
    if (autoAdvanceTimerRef.current !== null) return;
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      onComplete?.();
    }, WINNER_AUTO_ADVANCE_MS);
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [bb.phase, onComplete]);

  // ── 4. Question phase: schedule AI submissions + deadline ─────────────────
  useEffect(() => {
    if (bb.phase !== 'question') return;
    if (!bb.currentQuestion) return;

    // Clear any lingering timers from previous rounds.
    clearAllTimers();

    const correctId = bb.currentQuestion.correctAnswerId;
    const questionStartedAt = bb.questionStartedAt ?? Date.now();
    const deadlineAt = bb.hiddenDeadlineAt ?? (questionStartedAt + HIDDEN_DEADLINE_MS);
    const now = Date.now();

    // --- AI submissions ---
    const aiIds = bb.activeContestantIds.filter(
      id => id !== bb.humanContestantId,
    );
    const aiSubs = buildAiSubmissions(bb.seed, bb.round, aiIds, correctId, questionStartedAt);

    for (const [aiId, sub] of Object.entries(aiSubs)) {
      const delay = Math.max(0, sub.submittedAt - now);
      const capDelay = Math.min(delay, deadlineAt - now - 50);
      const t = window.setTimeout(() => {
        dispatch(submitBiographyBlitzAnswer({
          contestantId: aiId,
          answerId: sub.selectedAnswerId,
          now: sub.submittedAt,
        }));
      }, capDelay > 0 ? capDelay : 0);
      aiSubmitTimersRef.current.push(t);
    }

    // --- Hidden deadline: resolve round ---
    const deadlineDelay = Math.max(0, deadlineAt - now);
    deadlineTimerRef.current = window.setTimeout(() => {
      dispatch(resolveRound());
    }, deadlineDelay);

    return () => { clearAllTimers(); };
    // Re-run when round changes (new question).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bb.phase, bb.round, bb.currentQuestionId]);

  // ── 5. Check if all submitted (human + AI) → resolve early ───────────────
  useEffect(() => {
    if (bb.phase !== 'question') return;
    const allSubmitted = bb.activeContestantIds.every(id => id in bb.submissions);
    if (allSubmitted) {
      // Clear the deadline timer since we're resolving early.
      if (deadlineTimerRef.current !== null) {
        window.clearTimeout(deadlineTimerRef.current);
        deadlineTimerRef.current = null;
      }
      dispatch(resolveRound());
    }
  }, [bb.phase, bb.submissions, bb.activeContestantIds, dispatch]);

  // ── 6. Reveal phase: auto-advance after pause ─────────────────────────────
  useEffect(() => {
    if (bb.phase !== 'reveal') return;
    const t = window.setTimeout(() => {
      dispatch(advanceFromReveal());
    }, REVEAL_PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [bb.phase, bb.round, dispatch]);

  // ── 7. Elimination phase: AI auto-picks, or human timeout fallback ────────
  useEffect(() => {
    if (bb.phase !== 'elimination') return;

    const winnerId = bb.roundWinnerId;
    if (!winnerId) return;

    const isHumanWinner = winnerId === bb.humanContestantId;

    if (!isHumanWinner || bb.isSpectating) {
      // AI picks (or human in spectator mode falls back to AI pick).
      aiElimTimerRef.current = window.setTimeout(() => {
        const target = chooseBiographyBlitzEliminationTarget(
          bb.activeContestantIds,
          winnerId,
          bb.seed,
          bb.round,
        );
        if (target) {
          dispatch(pickEliminationTarget({ targetId: target }));
        }
      }, AI_ELIM_DELAY_MS);
    } else {
      // Human is the winner: set a fallback timer so the game doesn't stall.
      humanElimTimerRef.current = window.setTimeout(() => {
        const target = chooseBiographyBlitzEliminationTarget(
          bb.activeContestantIds,
          winnerId,
          bb.seed,
          bb.round,
        );
        if (target) {
          dispatch(pickEliminationTarget({ targetId: target }));
        }
      }, HUMAN_ELIM_TIMEOUT_MS);
    }

    return () => {
      if (aiElimTimerRef.current !== null) { window.clearTimeout(aiElimTimerRef.current); aiElimTimerRef.current = null; }
      if (humanElimTimerRef.current !== null) { window.clearTimeout(humanElimTimerRef.current); humanElimTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bb.phase, bb.round]);

  // ── 8. Round transition: advance to next round ────────────────────────────
  useEffect(() => {
    if (bb.phase !== 'round_transition') return;
    const delay = bb.isSpectating ? SPECTATOR_ADVANCE_MS : ROUND_TRANSITION_MS;
    const t = window.setTimeout(() => {
      dispatch(startNextRound({ now: Date.now() }));
    }, delay);
    return () => window.clearTimeout(t);
  }, [bb.phase, bb.round, bb.isSpectating, dispatch]);

  // ── Human answer handler ──────────────────────────────────────────────────
  const handleHumanAnswer = useCallback((answerId: string) => {
    if (!bb.humanContestantId) return;
    if (bb.phase !== 'question') return;
    if (!bb.activeContestantIds.includes(bb.humanContestantId)) return;
    if (bb.humanContestantId in bb.submissions) return;
    const now = Date.now();
    if (bb.hiddenDeadlineAt !== null && now >= bb.hiddenDeadlineAt) return;
    dispatch(submitBiographyBlitzAnswer({
      contestantId: bb.humanContestantId,
      answerId,
      now,
    }));
  }, [bb.phase, bb.humanContestantId, bb.activeContestantIds, bb.submissions, bb.hiddenDeadlineAt, dispatch]);

  // ── Human elimination pick handler ───────────────────────────────────────
  const handleHumanElimPick = useCallback((targetId: string) => {
    if (bb.phase !== 'elimination') return;
    if (bb.roundWinnerId !== bb.humanContestantId) return;
    if (bb.isSpectating) return;
    // Cancel the AI fallback timer.
    if (humanElimTimerRef.current !== null) {
      window.clearTimeout(humanElimTimerRef.current);
      humanElimTimerRef.current = null;
    }
    dispatch(pickEliminationTarget({ targetId }));
  }, [bb.phase, bb.roundWinnerId, bb.humanContestantId, bb.isSpectating, dispatch]);

  // ── Skip button: fast-forward when spectating ─────────────────────────────
  const handleSkip = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const phase = bb.phase;
  const isSpectating = bb.isSpectating;
  const humanHasSubmitted = bb.humanContestantId !== null
    && bb.humanContestantId in bb.submissions;

  const isHumanWinner = bb.phase === 'elimination'
    && bb.roundWinnerId === bb.humanContestantId;

  // Determine if human answer buttons should be enabled.
  const humanCanAnswer = phase === 'question'
    && !isSpectating
    && bb.humanContestantId !== null
    && bb.activeContestantIds.includes(bb.humanContestantId)
    && !humanHasSubmitted;

  if (phase === 'idle') {
    return (
      <div className="bb-blitz">
        <div className="bb-blitz__header">
          <span className="bb-blitz__title">Biography Blitz</span>
        </div>
        <p style={{ color: '#c0a0d0', textAlign: 'center' }}>Loading…</p>
      </div>
    );
  }

  if (phase === 'complete') {
    const winner = bb.competitionWinnerId;
    const winnerName = winner ? getName(winner) : '?';
    const isHumanWin = winner === bb.humanContestantId;
    return (
      <div className="bb-blitz">
        <div className="bb-blitz__header">
          <span className="bb-blitz__comp-badge">{bb.competitionType}</span>
          <span className="bb-blitz__title">Biography Blitz</span>
          <span className="bb-blitz__round-badge">Final</span>
        </div>
        <div className="bb-blitz__winner-screen">
          <div className="bb-blitz__winner-avatar-wrap">
            {winner && (
              <img
                className="bb-blitz__winner-avatar"
                src={avatarForId(winner)}
                alt={winnerName}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = getDicebear(winner); }}
              />
            )}
          </div>
          <p className="bb-blitz__winner-label">
            {isHumanWin ? '🏆 You win!' : `🏆 ${winnerName} wins!`}
          </p>
          <p className="bb-blitz__winner-sub">
            {bb.competitionType === 'HOH' ? 'New Head of Household' : 'Power of Veto winner'}
          </p>
          <button
            type="button"
            className="bb-blitz__continue-btn"
            onClick={() => onComplete?.()}
          >
            Continue ›
          </button>
        </div>
      </div>
    );
  }

  // ── Contestant grid helper ─────────────────────────────────────────────────
  const renderContestantGrid = (mode: 'answer' | 'elimination') => {
    const targetSet = new Set(
      mode === 'elimination'
        ? bb.activeContestantIds.filter(id => id !== bb.roundWinnerId)
        : bb.activeContestantIds,
    );

    return bb.contestantIds.map(id => {
      const isActive = bb.activeContestantIds.includes(id);
      const isEliminated = bb.eliminatedContestantIds.includes(id);
      const hasSubmitted = id in bb.submissions;
      const submittedAnswerId = bb.submissions[id]?.selectedAnswerId;
      const isCorrect = phase === 'reveal' && submittedAnswerId === bb.correctAnswerId;
      const isWinner = id === bb.roundWinnerId;
      const isEliminationTarget = id === bb.eliminationTargetId;
      const isValidElimTarget = mode === 'elimination' && targetSet.has(id);
      const isHuman = id === bb.humanContestantId;
      const humanSelected = mode === 'answer' && hasSubmitted && isHuman;

      let tileClass = 'bb-blitz__contestant-btn';
      if (isEliminated) tileClass += ' bb-blitz__contestant-btn--eliminated';
      if (!isActive && !isEliminated) tileClass += ' bb-blitz__contestant-btn--out';
      if (phase === 'reveal' && isWinner) tileClass += ' bb-blitz__contestant-btn--winner';
      if (phase === 'reveal' && isCorrect && !isWinner) tileClass += ' bb-blitz__contestant-btn--correct';
      if (isEliminationTarget) tileClass += ' bb-blitz__contestant-btn--evicted';
      if (humanSelected) tileClass += ' bb-blitz__contestant-btn--selected';
      if (isHuman) tileClass += ' bb-blitz__contestant-btn--you';

      const disabled =
        isEliminated ||
        !isActive ||
        (mode === 'answer' && !humanCanAnswer) ||
        (mode === 'elimination' && !isHumanWinner) ||
        (mode === 'elimination' && !isValidElimTarget) ||
        (mode === 'elimination' && isSpectating);

      const onClick = disabled ? undefined :
        mode === 'answer' ? () => handleHumanAnswer(id) :
          () => handleHumanElimPick(id);

      return (
        <button
          key={id}
          type="button"
          className={tileClass}
          onClick={onClick}
          disabled={disabled}
          aria-label={`${getName(id)}${isHuman ? ' (You)' : ''}${isEliminated ? ' – eliminated' : ''}`}
          title={getName(id)}
        >
          <img
            className="bb-blitz__contestant-avatar"
            src={avatarForId(id)}
            alt={getName(id)}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = getDicebear(id); }}
          />
          <span className="bb-blitz__contestant-name">
            {isHuman ? 'You' : getName(id)}
            {phase === 'reveal' && isWinner && ' 🏅'}
            {isEliminationTarget && ' ❌'}
          </span>
          {phase === 'question' && hasSubmitted && (
            <span className="bb-blitz__contestant-submitted" aria-label="Submitted">✓</span>
          )}
        </button>
      );
    });
  };

  return (
    <div className={`bb-blitz${isSpectating ? ' bb-blitz--spectator' : ''}`}>
      {/* Header */}
      <div className="bb-blitz__header">
        <span className="bb-blitz__comp-badge">{bb.competitionType}</span>
        <span className="bb-blitz__title">Biography Blitz</span>
        <span className="bb-blitz__round-badge">
          Round {bb.round + 1} · {bb.activeContestantIds.length} left
        </span>
      </div>

      {/* Hot streak banner */}
      {bb.hotStreakContestantId && (
        <div className="bb-blitz__streak-banner">
          <span className="bb-blitz__streak-icon">🔥</span>
          {' '}{getName(bb.hotStreakContestantId)} is on a hot streak!
        </div>
      )}

      {/* Spectator banner */}
      {isSpectating && (
        <div className="bb-blitz__spectator-banner">
          You've been eliminated — watching the competition continue…
          <button
            type="button"
            className="bb-blitz__skip-btn"
            onClick={handleSkip}
          >
            Skip ›
          </button>
        </div>
      )}

      {/* Question card */}
      {(phase === 'question' || phase === 'reveal') && bb.currentQuestion && (
        <div className="bb-blitz__question-card">
          <p className="bb-blitz__question-prompt">{bb.currentQuestion.prompt}</p>
          {phase === 'question' && !humanHasSubmitted && !isSpectating && bb.humanContestantId && bb.activeContestantIds.includes(bb.humanContestantId) && (
            <p className="bb-blitz__question-hint">Tap the correct houseguest!</p>
          )}
          {phase === 'reveal' && bb.correctAnswerId && (
            <p className="bb-blitz__reveal-correct">
              ✓ Correct: <strong>{getName(bb.correctAnswerId)}</strong>
              {bb.roundWinnerId ? ` — ${getName(bb.roundWinnerId)} wins the round!` : ' — Nobody got it!'}
            </p>
          )}
        </div>
      )}

      {/* Elimination prompt */}
      {phase === 'elimination' && (
        <div className="bb-blitz__question-card">
          {isHumanWinner && !isSpectating
            ? <p className="bb-blitz__question-prompt">You won the round! Choose who to eliminate.</p>
            : <p className="bb-blitz__question-prompt">
                {bb.roundWinnerId ? getName(bb.roundWinnerId) : 'The winner'} is choosing who to eliminate…
              </p>
          }
        </div>
      )}

      {/* Round transition */}
      {phase === 'round_transition' && (
        <div className="bb-blitz__question-card">
          {bb.eliminationTargetId
            ? <p className="bb-blitz__question-prompt">
                {getName(bb.eliminationTargetId)} has been eliminated!
              </p>
            : <p className="bb-blitz__question-prompt">No one eliminated this round. Next question…</p>
          }
        </div>
      )}

      {/* Contestant grid */}
      <div className="bb-blitz__answer-grid">
        {(phase === 'question' || phase === 'reveal')
          ? renderContestantGrid('answer')
          : phase === 'elimination'
            ? renderContestantGrid('elimination')
            : null
        }
      </div>

      {/* Eliminated list */}
      {bb.eliminatedContestantIds.length > 0 && (phase === 'question' || phase === 'reveal' || phase === 'elimination' || phase === 'round_transition') && (
        <div className="bb-blitz__eliminated-strip">
          <span className="bb-blitz__eliminated-label">Eliminated: </span>
          {bb.eliminatedContestantIds.map(id => (
            <span key={id} className="bb-blitz__eliminated-name">
              {getName(id)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
