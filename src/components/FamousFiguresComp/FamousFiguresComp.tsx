/**
 * FamousFiguresComp — React UI for the "Famous Figures" competition.
 *
 * UI states:
 *   round_active  — Base clue + revealed hints. Guess input, Request Hint button, timer, scoreboard.
 *   round_reveal  — Correct answer shown with who got it right. Auto-advances after 3s.
 *   complete      — Winner announcement. Fires onComplete after 4s.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
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
  FAMOUS_FIGURES,
  setAiSubmissionsForRound,
  buildAiSubmissionsForRound,
} from '../../features/famousFigures/famousFiguresSlice';
import type {
  FamousFiguresState,
  FamousFiguresPrizeType,
} from '../../features/famousFigures/famousFiguresSlice';
import { resolveFamousFiguresOutcome } from '../../features/famousFigures/thunks';
import { mulberry32 } from '../../store/rng';
import { getDicebear } from '../../utils/avatar';
import { isAcceptedGuess } from '../../games/famous-figures/fuzzy';
import './FamousFiguresComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const REVEAL_PAUSE_MS = 3000;
const WINNER_SCREEN_DURATION_MS = 4000;

// Timer durations per phase (milliseconds)
const PHASE_DURATIONS: Record<string, number> = {
  clue: 15000,
  hint_1: 15000,
  hint_2: 15000,
  hint_3: 15000,
  hint_4: 11000,
  hint_5: 11000,
  overtime: 15000,
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

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType: FamousFiguresPrizeType;
  seed: number;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FamousFiguresComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
}: Props) {
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

  // ── Local UI state ────────────────────────────────────────────────────────
  const [guessInput, setGuessInput] = useState('');
  const [inputState, setInputState] = useState<'idle' | 'correct' | 'wrong' | 'duplicate'>('idle');
  const [timerSecs, setTimerSecs] = useState(15);
  const inputRef = useRef<HTMLInputElement>(null);
  const ffRef = useRef(ff);
  ffRef.current = ff;
  const completeFiredRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    dispatch(startFamousFigures({ participantIds, competitionType: prizeType, seed }));
    return () => { dispatch(resetFamousFigures()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer per phase ───────────────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'round_active') return;
    const phase = ff.timerPhase;
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

      if (phase === 'done' || phase === 'overtime') {
        dispatch(endRound());
      } else {
        // Advance timer phase (clue→hint_1→…→hint_5→overtime→done)
        // This correctly handles hint_5 expiry by entering overtime rather
        // than calling revealNextHint() which would be a no-op (capped at 5).
        dispatch(advanceTimer());
      }
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
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

    const rng = mulberry32(seed ^ (round * 0x9e3779b9));
    const submissions = buildAiSubmissionsForRound(aiIds, ff.currentFigureIndex, ff.hintsRevealed, rng);
    dispatch(setAiSubmissionsForRound({ round, submissions }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.status, ff.currentRound, ff.hintsRevealed]);

  // Submit AI answers when their submission is available
  useEffect(() => {
    if (ff.status !== 'round_active') return;
    const round = ff.currentRound;
    const aiSubs = ff.aiSubmissions[round];
    if (!aiSubs) return;

    for (const [aiId, correct] of Object.entries(aiSubs)) {
      if (ff.playerCorrect[aiId]) continue;
      if (correct) {
        // AI submits the correct canonical name
        const figure = FAMOUS_FIGURES[ff.currentFigureIndex];
        if (figure) {
          dispatch(submitPlayerGuess({ playerId: aiId, guess: figure.canonicalName }));
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.aiSubmissions, ff.currentRound, ff.status]);

  // ── Auto-advance from reveal ──────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'round_reveal') return;
    const t = setTimeout(() => {
      dispatch(nextRound());
    }, REVEAL_PAUSE_MS);
    return () => clearTimeout(t);
  }, [ff.status, ff.currentRound, dispatch]);

  // ── Complete → fire onComplete ────────────────────────────────────────────
  useEffect(() => {
    if (ff.status !== 'complete') return;
    if (completeFiredRef.current) return;
    completeFiredRef.current = true;

    dispatch(resolveFamousFiguresOutcome());

    const t = setTimeout(() => { onComplete?.(); }, WINNER_SCREEN_DURATION_MS);
    return () => clearTimeout(t);
  }, [ff.status, dispatch, onComplete]);

  // ── Reset input state on new round ───────────────────────────────────────
  useEffect(() => {
    setGuessInput('');
    setInputState('idle');
  }, [ff.currentRound]);

  // ── Guess handler ─────────────────────────────────────────────────────────
  const handleSubmitGuess = useCallback(() => {
    if (!humanId) return;
    if (ff.status !== 'round_active') return;
    if (ff.playerCorrect[humanId]) return;

    const now = Date.now();
    if (now < cooldownUntilRef.current) return;
    const cooldownMs = 800 + Math.random() * 400;
    cooldownUntilRef.current = now + cooldownMs;

    const trimmed = guessInput.trim();
    if (trimmed.length === 0) return;

    const alreadyGuessed = (ff.playerGuesses[humanId] ?? []).includes(trimmed);
    if (alreadyGuessed) {
      setInputState('duplicate');
      return;
    }

    const figure = FAMOUS_FIGURES[ff.currentFigureIndex];
    if (!figure) return;

    // Check correctness locally for immediate UI feedback
    const correct = isAcceptedGuess(trimmed, figure);
    dispatch(submitPlayerGuess({ playerId: humanId, guess: trimmed }));
    setInputState(correct ? 'correct' : 'wrong');
    if (correct) {
      setGuessInput('');
    }
    // Clear feedback after a moment
    setTimeout(() => setInputState('idle'), 1500);
  }, [humanId, ff.status, ff.playerCorrect, ff.playerGuesses, ff.currentFigureIndex, guessInput, dispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSubmitGuess();
    },
    [handleSubmitGuess],
  );

  const handleRequestHint = useCallback(() => {
    dispatch(revealNextHint());
  }, [dispatch]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const figure = FAMOUS_FIGURES[ff.currentFigureIndex] ?? null;
  const humanCorrect = humanId ? ff.playerCorrect[humanId] : false;
  const hintsAllRevealed = ff.hintsRevealed >= 5;
  const canRequestHint =
    ff.status === 'round_active' &&
    !hintsAllRevealed &&
    ff.timerPhase !== 'overtime' &&
    ff.timerPhase !== 'done';

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

  // ── Render: complete ──────────────────────────────────────────────────────
  if (ff.status === 'complete') {
    const winnerId = ff.winnerId ?? '';
    const winnerName = displayName(winnerId);
    const isHumanWinner = winnerId === humanId;
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
          Auto-advancing in 3 seconds…
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

  return (
    <div className="ff-container" data-status="round_active">
      {/* Header */}
      <div className="ff-header">
        <span className="ff-comp-badge">{prizeType}</span>
        <span className="ff-title">Famous Figures</span>
        <span className="ff-round-badge">Round {ff.currentRound + 1} of {ff.totalRounds}</span>
      </div>

      {/* Narration */}
      <p className="ff-narration" aria-live="polite">
        {pickLine(NARRATION.roundStart, ff.currentRound)}
      </p>

      {/* Timer */}
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

      {/* Clue card */}
      {figure && (
        <div className="ff-clue-card" role="region" aria-label="Current clue">
          <div className="ff-clue-label">Clue</div>
          <p className="ff-base-clue">{figure.baseClueFact}</p>
          {ff.hintsRevealed > 0 && (
            <ul className="ff-hint-list" aria-label="Revealed hints">
              {Array.from({ length: ff.hintsRevealed }, (_, i) => (
                <li key={i} className="ff-hint-item">
                  <span className="ff-hint-num">#{i + 1}</span>
                  <span>{figure.hints[i]}</span>
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
        aria-label={`Request hint (${5 - ff.hintsRevealed} remaining)`}
      >
        💡 Request Hint ({ff.hintsRevealed}/5 used)
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
            disabled={ff.status !== 'round_active' || humanCorrect || humanId === null}
          />
          <button
            className="ff-submit-btn"
            onClick={handleSubmitGuess}
            disabled={ff.status !== 'round_active' || humanCorrect || humanId === null || guessInput.trim().length === 0}
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
