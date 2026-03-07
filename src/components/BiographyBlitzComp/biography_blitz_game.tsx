/**
 * BiographyBlitzComp — React UI component for the "Biography Blitz" competition.
 *
 * Broadcast-style presentation with three main UI states:
 *   question  — Displays the current trivia question and answer choices.
 *               The human player taps an answer; AI players auto-submit via Redux.
 *   reveal    — Highlights the correct answer and shows who was eliminated.
 *               A short pause before confirmElimination is dispatched.
 *   complete  — Winner screen with confetti-style announcement; fires onComplete.
 *
 * NOTE: The pre-game "Get Ready" countdown and rules modal are handled upstream
 * by MinigameHost before this component mounts. Per-question timing (e.g. the
 * human answer timeout) is managed within this component.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  startBiographyBlitz,
  submitAnswer,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  resetBiographyBlitz,
} from '../../features/biographyBlitz/biography_blitz_logic';
import type { BiographyBlitzState, BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic';
import { resolveBiographyBlitzOutcome } from '../../features/biographyBlitz/thunks';
import { BIOGRAPHY_BLITZ_QUESTIONS } from '../../features/biographyBlitz/biographyBlitzQuestions';
import { getDicebear } from '../../utils/avatar';
import './BiographyBlitzComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Ms to wait on the reveal screen before auto-advancing. */
const REVEAL_PAUSE_MS = 3000;
/** Ms to show the winner screen before firing onComplete. */
const WINNER_SCREEN_DURATION_MS = 5000;
/** Ms the human has to answer before AI auto-fill triggers. */
const HUMAN_ANSWER_TIMEOUT_MS = 15000;

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
    "{names} couldn't keep up with the biography blitz — eliminated! 💥",
    "{names} got the wrong answer — they're out of here! 🚪",
    "{names} didn't know their housemates well enough — goodbye! 👋",
    "The knowledge drain claims {names} — eliminated! 📉",
  ],
  voided: [
    "Everyone got that wrong — we'll let that one slide! Moving on! 🤷",
    "Wow, nobody knew that one! Question voided — next round! 🎲",
    "Not a single correct answer! That was a tough one — next question! 😅",
  ],
  winner: [
    "WE HAVE OUR BIOGRAPHY BLITZ CHAMPION! 🏆",
    "WINNER! Your knowledge of your housemates is UNRIVALLED! 👑",
    "BIOGRAPHY BLITZ CHAMPION! You know everyone's deepest secrets! 🎉",
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
  /** Matches the `prizeType` convention used by other authoritative competition components. */
  prizeType: BiographyBlitzCompetitionType;
  seed: number;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BiographyBlitzComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const bb = useAppSelector(
    (s: RootState) =>
      (s as RootState & { biographyBlitz: BiographyBlitzState }).biographyBlitz,
  );
  const storePlayers = useAppSelector(
    (s: RootState) =>
      (s as RootState & { game: { players: Array<{ id: string; name: string; isUser?: boolean }> } })
        .game?.players ?? [],
  );

  // Build player name/avatar map
  const playerMap: Record<string, { name: string; isHuman: boolean }> = {};
  if (participantsProp) {
    for (const p of participantsProp) {
      playerMap[p.id] = { name: p.name, isHuman: p.isHuman };
    }
  }
  for (const p of storePlayers) {
    if (participantIds.includes(p.id)) {
      playerMap[p.id] = { name: p.name, isHuman: !!p.isUser };
    }
  }

  const humanId: string | null =
    Object.entries(playerMap).find(([, v]) => v.isHuman)?.[0] ?? null;

  function displayName(id: string): string {
    return playerMap[id]?.name ?? id;
  }

  // Refs to prevent stale-closure issues in effects
  const bbRef = useRef(bb);
  bbRef.current = bb;

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    dispatch(
      startBiographyBlitz({ participantIds, competitionType: prizeType, seed }),
    );
    return () => {
      dispatch(resetBiographyBlitz());
    };
    // Run once on mount only — deps are intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Human answer timeout: auto-submit wrong after HUMAN_ANSWER_TIMEOUT_MS ─
  const humanAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (bb.status !== 'question') return;
    if (!humanId) return;
    // If human has already answered, no timeout needed.
    if (humanId in bb.submissions) return;

    humanAnswerTimerRef.current = setTimeout(() => {
      const current = bbRef.current;
      if (current.status !== 'question') return;
      if (humanId in current.submissions) return;
      // Pick the first wrong answer as the default "missed" submission.
      const question = BIOGRAPHY_BLITZ_QUESTIONS.find(
        (q) => q.id === current.currentQuestionId,
      );
      if (!question) return;
      const wrongAnswer = question.answers.find(
        (a) => a.id !== question.correctAnswerId,
      );
      if (wrongAnswer) {
        dispatch(submitAnswer({ contestantId: humanId, answerId: wrongAnswer.id }));
      }
    }, HUMAN_ANSWER_TIMEOUT_MS);

    return () => {
      if (humanAnswerTimerRef.current !== null) {
        clearTimeout(humanAnswerTimerRef.current);
      }
    };
  }, [bb.status, bb.currentQuestionId, bb.submissions, humanId, dispatch]);

  // ── Auto-fill AI and trigger reveal when all active contestants submitted ─
  useEffect(() => {
    if (bb.status !== 'question') return;

    const allSubmitted = bb.activeContestants.every((id) => id in bb.submissions);
    if (!allSubmitted) return;

    // Small delay for UX — let the human see "Submitted" feedback briefly.
    const t = setTimeout(() => {
      dispatch(revealResults());
    }, 600);
    return () => clearTimeout(t);
  }, [bb.status, bb.activeContestants, bb.submissions, dispatch]);

  // ── When human answers, immediately fill AI so we can advance ────────────
  useEffect(() => {
    if (bb.status !== 'question') return;
    if (!humanId) return;
    if (!(humanId in bb.submissions)) return;

    // Human has answered — auto-fill remaining AI contestants now.
    dispatch(autoFillAIAnswers(humanId));
  }, [bb.status, bb.submissions, humanId, dispatch]);

  // ── When status reaches 'question' with no human, fill AI immediately ────
  useEffect(() => {
    if (bb.status !== 'question') return;
    if (humanId !== null) return;
    // All-AI round — auto-fill everyone.
    dispatch(autoFillAIAnswers(null));
  }, [bb.status, bb.currentQuestionId, humanId, dispatch]);

  // ── Auto-advance from reveal after pause ──────────────────────────────────
  useEffect(() => {
    if (bb.status !== 'reveal') return;

    const t = setTimeout(() => {
      dispatch(confirmElimination());
    }, REVEAL_PAUSE_MS);
    return () => clearTimeout(t);
  }, [bb.status, bb.round, dispatch]);

  // ── Resolve outcome and fire onComplete when complete ─────────────────────
  const completeFiredRef = useRef(false);

  useEffect(() => {
    if (bb.status !== 'complete') return;
    if (completeFiredRef.current) return;
    completeFiredRef.current = true;

    dispatch(resolveBiographyBlitzOutcome());

    const t = setTimeout(() => {
      onComplete?.();
    }, WINNER_SCREEN_DURATION_MS);
    return () => clearTimeout(t);
  }, [bb.status, dispatch, onComplete]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAnswerClick = useCallback(
    (answerId: string) => {
      if (!humanId) return;
      if (bb.status !== 'question') return;
      if (humanId in bb.submissions) return; // already answered
      dispatch(submitAnswer({ contestantId: humanId, answerId }));
    },
    [humanId, bb.status, bb.submissions, dispatch],
  );

  // ── Derived values ────────────────────────────────────────────────────────

  const currentQuestion = bb.currentQuestionId
    ? BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === bb.currentQuestionId) ?? null
    : null;

  const humanAnswer = humanId ? bb.submissions[humanId] : null;
  const humanAnsweredCorrectly =
    bb.status === 'reveal' && humanAnswer === bb.correctAnswerId;

  const eliminatedThisRound =
    bb.status === 'reveal' && bb.correctAnswerId
      ? bb.activeContestants.filter((id) => bb.submissions[id] !== bb.correctAnswerId)
      : [];
  const voidedRound = eliminatedThisRound.length === bb.activeContestants.length;
  const actuallyEliminated = voidedRound ? [] : eliminatedThisRound;

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
    const isHumanWinner = winnerId === humanId;
    return (
      <div className="bb-blitz bb-blitz--complete" aria-live="assertive">
        <div className="bb-blitz__winner-badge" aria-hidden="true">🏆</div>
        <h2 className="bb-blitz__winner-title">
          {pickLine(NARRATION.winner, bb.round)}
        </h2>
        <div className="bb-blitz__winner-avatar">
          <img
            src={getDicebear(winnerName)}
            alt={winnerName}
            className="bb-blitz__avatar-img"
          />
        </div>
        <p className="bb-blitz__winner-name">
          {winnerName}
          {isHumanWinner && <span className="bb-blitz__you-badge"> (You!)</span>}
        </p>
        <p className="bb-blitz__winner-subtitle">
          {prizeType} Winner — {bb.round + 1} round{bb.round !== 0 ? 's' : ''} played
        </p>
      </div>
    );
  }

  return (
    <div className="bb-blitz" data-status={bb.status}>
      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="bb-blitz__header">
        <span className="bb-blitz__comp-badge">{prizeType}</span>
        <span className="bb-blitz__title">Biography Blitz</span>
        <span className="bb-blitz__round-badge">Round {bb.round + 1}</span>
      </div>

      {/* Contestant strip ────────────────────────────────────────────────── */}
      <div className="bb-blitz__contestants" aria-label="Active contestants">
        {bb.activeContestants.map((id) => {
          const name = displayName(id);
          const hasAnswered = id in bb.submissions;
          const isHumanPlayer = id === humanId;
          let pillClass = 'bb-blitz__contestant-pill';
          if (hasAnswered) pillClass += ' bb-blitz__contestant-pill--answered';
          if (isHumanPlayer) pillClass += ' bb-blitz__contestant-pill--you';
          if (bb.status === 'reveal') {
            const correct = bb.submissions[id] === bb.correctAnswerId;
            pillClass += correct
              ? ' bb-blitz__contestant-pill--correct'
              : ' bb-blitz__contestant-pill--wrong';
          }
          return (
            <div key={id} className={pillClass} aria-label={name}>
              <img
                src={getDicebear(name)}
                alt=""
                aria-hidden="true"
                className="bb-blitz__pill-avatar"
              />
              <span className="bb-blitz__pill-name">{isHumanPlayer ? 'You' : name}</span>
              {hasAnswered && bb.status === 'question' && (
                <span className="bb-blitz__pill-check" aria-hidden="true">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Narration banner ────────────────────────────────────────────────── */}
      <p className="bb-blitz__narration" aria-live="polite">
        {bb.status === 'reveal'
          ? voidedRound
            ? pickLine(NARRATION.voided, bb.round)
            : actuallyEliminated.length > 0
              ? pickLine(NARRATION.eliminated, bb.round).replace(
                  '{names}',
                  actuallyEliminated.map((id) => displayName(id)).join(' & '),
                )
              : pickLine(NARRATION.correct, bb.round)
          : pickLine(NARRATION.question, bb.round)}
      </p>

      {/* Question card ───────────────────────────────────────────────────── */}
      {currentQuestion && (
        <div className="bb-blitz__question-card" role="region" aria-label="Current question">
          <p className="bb-blitz__question-prompt">{currentQuestion.prompt}</p>
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
                    onClick={() => handleAnswerClick(answer.id)}
                    disabled={
                      bb.status !== 'question' || humanAnswer !== null || humanId === null
                    }
                    aria-pressed={isSelected}
                    aria-label={answer.text}
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
        </div>
      )}

      {/* Human feedback banner ───────────────────────────────────────────── */}
      {bb.status === 'reveal' && humanId && (
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
