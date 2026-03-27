/**
 * EstimationGame — native React minigame component.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + winnerId + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(effectiveScore)`.
 *
 * Game design:
 *  - 3 rounds of increasing difficulty
 *  - Each round reveals a cluster of objects briefly, then hides them
 *  - Player enters an estimate; score is based on accuracy (closer = higher score)
 *  - Exposure time decreases and object count increases each round
 *  - Deterministic seeded RNG ensures reproducible AI scores
 *  - Canonical last-place derived from final total scores
 *
 * Scoring rules:
 *  - Each round: roundScore = max(0, 100 - |guess - actual| * penaltyPerItem)
 *  - Total score = sum of round scores (0–300)
 *  - Higher total is better (standard ranked competition)
 *  - Ties broken by: lower total absolute error → better final-round score → participant order
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import { mulberry32 } from '../../store/rng';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import { computeRoundScore, deriveLastPlaceId } from './estimationGameUtils';
import { resolveHybridAiScores } from '../../ai/competition/hybridScoreResolver';
import './EstimationGame.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_ROUNDS = 3;

/** Per-round configuration: object count range, exposure time, theme. */
const ROUND_CONFIG = [
  { minCount: 15, maxCount: 30, exposureMs: 1800, label: 'Round 1', theme: 'stars' as const },
  { minCount: 30, maxCount: 55, exposureMs: 1300, label: 'Round 2', theme: 'dots'  as const },
  { minCount: 50, maxCount: 90, exposureMs: 1000, label: 'Round 3', theme: 'gems'  as const },
];

/** Time limit for entering a guess after the reveal (seconds). Increased by 80% from original 15s. */
const GUESS_TIME_LIMIT = 27;

// ── Seeded RNG helpers ────────────────────────────────────────────────────────

/** Generate `count` random positions within [padding, width-padding) × [padding, height-padding). */
function genPositions(rng: () => number, count: number, w: number, h: number, pad: number) {
  return Array.from({ length: count }, () => ({
    x: pad + rng() * (w - 2 * pad),
    y: pad + rng() * (h - 2 * pad),
  }));
}

/**
 * Build the scores map for all participants, resolving AI scores via the
 * hybrid resolver when the session uses the post-human-score resolution path,
 * or falling back to precomputed `session.aiScores` for legacy/endurance sessions.
 */
function buildAllScores(
  session: MinigameSession,
  humanId: string | undefined,
  humanTotal: number,
  players: ReadonlyArray<Player>,
): Record<string, number> {
  let aiScores: Record<string, number>;
  if (session.hybridResolveOnComplete) {
    const aiParticipants = session.participants
      .filter((id) => id !== humanId)
      .map((id) => {
        const p = players.find((pl) => pl.id === id);
        return { id, profile: p?.competitionProfile };
      });
    aiScores = resolveHybridAiScores({
      gameKey: session.key,
      humanScore: humanTotal,
      aiParticipants,
      seed: session.seed,
    });
  } else {
    aiScores = { ...session.aiScores };
  }
  const result = { ...aiScores };
  if (humanId) result[humanId] = humanTotal;
  return result;
}

/**
 * Given a scores map, return participants sorted best → worst.
 * Tie-breaking: lower absolute error total wins (not available here — we use
 * participant order from the session as the absolute deterministic final fallback).
 * The session.participants order is used only as a stable tie-break.
 */
function rankParticipants(
  scores: Record<string, number>,
  participants: string[],
): string[] {
  return [...participants].sort((a, b) => {
    const sa = scores[a] ?? 0;
    const sb = scores[b] ?? 0;
    if (sb !== sa) return sb - sa; // higher score = better rank
    // Stable fallback: preserve participant order
    return participants.indexOf(a) - participants.indexOf(b);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'intro' | 'reveal' | 'guess' | 'feedback' | 'results';

interface ObjectDot {
  x: number;
  y: number;
  r: number;
  color: string;
}

interface RoundResult {
  round: number;
  actual: number;
  guess: number;
  score: number;
}

interface ScoreEntry {
  id: string;
  name: string;
  totalScore: number;
  isHuman: boolean;
}

// ── Theme helpers ─────────────────────────────────────────────────────────────

const THEME_COLORS: Record<string, string[]> = {
  stars: ['#ffe066', '#ffd700', '#fff176', '#ffec42'],
  dots:  ['#6fd3ff', '#4ecbf5', '#82e4ff', '#2db8f0'],
  gems:  ['#b57bee', '#9c4fe0', '#d19ef8', '#7c3aed'],
};

function buildObjects(
  rng: () => number,
  count: number,
  theme: 'stars' | 'dots' | 'gems',
  w: number,
  h: number,
): ObjectDot[] {
  const colors = THEME_COLORS[theme];
  const positions = genPositions(rng, count, w, h, 10);
  return positions.map((pos) => ({
    x: pos.x,
    y: pos.y,
    r: theme === 'gems' ? 5 + rng() * 3 : theme === 'stars' ? 4 + rng() * 2 : 3 + rng() * 2,
    color: colors[Math.floor(rng() * colors.length)],
  }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final total score. */
  onFinish?: (value: number) => void;
  /** Competition seed (used only in MinigameHost path; in HOH path session.seed is used). */
  seed?: number;
  /** When true the game begins immediately on mount (no intro screen). */
  autoStart?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EstimationGame({
  session,
  players = [],
  onFinish,
  seed: propSeed,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  const effectiveSeed = session?.seed ?? propSeed ?? 1;

  // ── State ──────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<GamePhase>(autoStart ? 'reveal' : 'intro');
  const [roundIndex, setRoundIndex] = useState(0);
  const [objects, setObjects] = useState<ObjectDot[]>([]);
  const [actualCount, setActualCount] = useState(0);
  const [guessValue, setGuessValue] = useState('');
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [guessTimeLeft, setGuessTimeLeft] = useState(GUESS_TIME_LIMIT);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Ref for the seeded RNG — advanced per round to ensure determinism
  const rngRef = useRef<(() => number) | null>(null);
  const guessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Seeded round generation ────────────────────────────────────────────────

  const generateRound = useCallback((idx: number) => {
    const cfg = ROUND_CONFIG[idx];
    // Advance the shared RNG by consuming a fresh slice per round
    // (we re-seed per round using seed + roundIndex so rounds are independent)
    const roundSeed = effectiveSeed * 1000 + idx * 37 + 1;
    const rng = mulberry32(roundSeed);
    rngRef.current = rng;

    const count = cfg.minCount + Math.floor(rng() * (cfg.maxCount - cfg.minCount + 1));
    const objs = buildObjects(rng, count, cfg.theme, 300, 180);
    setActualCount(count);
    setObjects(objs);
  }, [effectiveSeed]);

  // ── Start a reveal phase ───────────────────────────────────────────────────

  const startRound = useCallback((idx: number) => {
    generateRound(idx);
    setGuessValue('');
    setPhase('reveal');
  }, [generateRound]);

  // ── Effect: auto-start first round when enabled ──────────────────────────

  useEffect(() => {
    if (autoStart) {
      startRound(0);
    }
  }, [autoStart, startRound]);

  // ── Effect: auto-hide reveal after exposure time ──────────────────────────

  useEffect(() => {
    if (phase !== 'reveal') return;
    const cfg = ROUND_CONFIG[roundIndex];
    const t = setTimeout(() => {
      setPhase('guess');
      setGuessTimeLeft(GUESS_TIME_LIMIT);
      setTimeout(() => inputRef.current?.focus(), 50);
    }, cfg.exposureMs);
    return () => clearTimeout(t);
  }, [phase, roundIndex]);

  // ── Effect: guess countdown timer ─────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'guess') {
      if (guessTimerRef.current) clearInterval(guessTimerRef.current);
      return;
    }
    guessTimerRef.current = setInterval(() => {
      setGuessTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(guessTimerRef.current!);
          // Auto-submit 0 if player hasn't entered anything
          handleSubmitGuess(0, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (guessTimerRef.current) clearInterval(guessTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Submit guess ───────────────────────────────────────────────────────────

  const handleSubmitGuess = useCallback((forceGuess?: number, isAutoSubmit = false) => {
    if (phase !== 'guess' && !isAutoSubmit) return;
    if (guessTimerRef.current) clearInterval(guessTimerRef.current);

    const guess = forceGuess !== undefined ? forceGuess : (parseInt(guessValue, 10) || 0);
    const score = computeRoundScore(actualCount, guess);
    const diff = Math.abs(actualCount - guess);
    const result: RoundResult = { round: roundIndex + 1, actual: actualCount, guess, score };

    setRoundResults((prev) => [...prev, result]);

    // Build feedback message
    let msg: string;
    if (diff === 0) msg = '🎯 Perfect! Exactly right!';
    else if (diff <= 2) msg = `✨ So close! Off by ${diff}`;
    else if (diff <= 8) msg = `👍 Not bad! Off by ${diff}`;
    else if (diff <= 15) msg = `😬 Off by ${diff}`;
    else msg = `💀 Way off! Off by ${diff}`;
    setFeedbackMsg(msg);
    setPhase('feedback');
  }, [phase, guessValue, actualCount, roundIndex]);

  // ── Finish game ────────────────────────────────────────────────────────────

  const finishGame = useCallback(() => {
    const humanTotal = roundResults.reduce((sum, r) => sum + r.score, 0);

    if (session) {
      const allScores = buildAllScores(session, humanId, humanTotal, players);
      const ranked = rankParticipants(allScores, session.participants);

      const entries: ScoreEntry[] = ranked.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return {
          id,
          name: p?.name ?? id,
          totalScore: allScores[id] ?? 0,
          isHuman: id === humanId,
        };
      });

      setScores(entries);
      setPhase('results');
    } else {
      // MinigameHost path
      if (onFinish) onFinish(humanTotal);
    }
  }, [roundResults, session, humanId, players, onFinish]);

  // ── Proceed after feedback ─────────────────────────────────────────────────

  const handleNextRound = useCallback(() => {
    const nextIdx = roundIndex + 1;
    if (nextIdx < NUM_ROUNDS) {
      setRoundIndex(nextIdx);
      startRound(nextIdx);
    } else {
      // All rounds done — show final scoreboard
      finishGame();
    }
  }, [roundIndex, startRound, finishGame]);

  // ── Done handler (dispatches to Redux) ────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const humanTotal = roundResults.reduce((sum, r) => sum + r.score, 0);
    const winnerId = scores.length > 0 ? scores[0].id : undefined;
    const lastPlaceId = winnerId
      ? deriveLastPlaceId(
          Object.fromEntries(scores.map((e) => [e.id, e.totalScore])),
          session.participants,
          winnerId,
        )
      : undefined;
    const payload: CompleteMinigamePayload = { humanScore: humanTotal, lastPlaceId, winnerId };
    dispatch(completeMinigame(payload));
  }, [dispatch, roundResults, scores, session]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (phase !== 'reveal' || objects.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.forEach((obj) => {
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);
      ctx.fillStyle = obj.color;
      ctx.fill();
    });
  }, [phase, objects]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentCfg = ROUND_CONFIG[roundIndex];
  const roundLabel = currentCfg?.label ?? '';
  const themeLabel = currentCfg?.theme ?? 'dots';
  const themeEmoji = themeLabel === 'stars' ? '⭐' : themeLabel === 'gems' ? '💎' : '🔵';
  const progressPct = (guessTimeLeft / GUESS_TIME_LIMIT) * 100;
  const humanRunningTotal = roundResults.reduce((s, r) => s + r.score, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="eg" role="dialog" aria-modal="true" aria-label="Estimation Competition">
      <div className="eg__card">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="eg__header">
          <h2 className="eg__title">🎯 Estimation</h2>
          <p className="eg__subtitle">Count fast. Guess smart.</p>
        </header>

        {/* ── Intro phase ─────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <div className="eg__intro">
            <p className="eg__intro-copy">
              Objects will flash on screen for a brief moment.
              Count as many as you can, then enter your estimate before time runs out!
            </p>
            <div className="eg__rounds-preview">
              {ROUND_CONFIG.map((cfg, i) => (
                <div key={i} className="eg__round-pill">
                  <span className="eg__round-pill-num">R{i + 1}</span>
                  <span className="eg__round-pill-time">{(cfg.exposureMs / 1000).toFixed(1)}s</span>
                </div>
              ))}
            </div>
            <button
              className="eg__start-btn"
              onClick={() => startRound(0)}
              type="button"
            >
              Start Competition ▶
            </button>
          </div>
        )}

        {/* ── Reveal phase ────────────────────────────────────────────── */}
        {phase === 'reveal' && (
          <div className="eg__reveal">
            <div className="eg__round-tag">
              <span>{roundLabel}</span>
              <span className="eg__theme-label">{themeEmoji} {themeLabel}</span>
            </div>
            <div className="eg__canvas-wrap eg__canvas-wrap--visible">
              <canvas
                ref={canvasRef}
                className="eg__canvas"
                width={300}
                height={180}
                aria-label="Object cluster — count carefully!"
              />
              <div className="eg__reveal-overlay" aria-hidden="true">
                <span className="eg__reveal-flash">LOOK!</span>
              </div>
            </div>
            <p className="eg__reveal-hint">Count quickly…</p>
          </div>
        )}

        {/* ── Guess phase ─────────────────────────────────────────────── */}
        {phase === 'guess' && (
          <div className="eg__guess">
            <div className="eg__round-tag">
              <span>{roundLabel}</span>
              <span className="eg__round-score-running">Score so far: {humanRunningTotal}</span>
            </div>
            <div className="eg__canvas-wrap eg__canvas-wrap--hidden" aria-hidden="true">
              <canvas
                className="eg__canvas eg__canvas--hidden"
                width={300}
                height={180}
              />
              <div className="eg__hidden-label">🙈 Hidden!</div>
            </div>
            <div
              className={['eg__timer-bar', progressPct <= 33 ? 'eg__timer-bar--urgent' : ''].filter(Boolean).join(' ')}
              role="progressbar"
              aria-valuenow={guessTimeLeft}
              aria-valuemin={0}
              aria-valuemax={GUESS_TIME_LIMIT}
            >
              <div className="eg__timer-fill" style={{ width: `${progressPct}%` }} />
              <span className="eg__timer-label">{guessTimeLeft}s</span>
            </div>
            <p className="eg__guess-prompt">How many {themeLabel} did you see?</p>
            <input
              ref={inputRef}
              className="eg__guess-input"
              type="number"
              min="0"
              max="200"
              inputMode="numeric"
              placeholder="Enter your estimate…"
              value={guessValue}
              onChange={(e) => setGuessValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitGuess();
              }}
              aria-label="Estimate count"
            />
            <button
              className="eg__submit-btn"
              type="button"
              onClick={() => handleSubmitGuess()}
              disabled={guessValue === ''}
            >
              Lock In ✅
            </button>
          </div>
        )}

        {/* ── Feedback phase ──────────────────────────────────────────── */}
        {phase === 'feedback' && roundResults.length > 0 && (
          <div className="eg__feedback">
            <div className={['eg__feedback-banner', roundResults[roundResults.length - 1].score >= 80 ? 'eg__feedback-banner--great' : roundResults[roundResults.length - 1].score >= 50 ? 'eg__feedback-banner--ok' : 'eg__feedback-banner--bad'].filter(Boolean).join(' ')}>
              <p className="eg__feedback-msg">{feedbackMsg}</p>
              <p className="eg__feedback-detail">
                Actual: <strong>{roundResults[roundResults.length - 1].actual}</strong>
                {' '}· Your guess: <strong>{roundResults[roundResults.length - 1].guess}</strong>
                {' '}· +<strong>{roundResults[roundResults.length - 1].score}</strong> pts
              </p>
            </div>
            <div className="eg__round-scores">
              {roundResults.map((r) => (
                <div key={r.round} className="eg__round-score-row">
                  <span className="eg__round-score-label">Round {r.round}</span>
                  <span className="eg__round-score-pts">+{r.score}</span>
                </div>
              ))}
            </div>
            <button className="eg__next-btn" type="button" onClick={handleNextRound}>
              {roundResults.length >= NUM_ROUNDS ? 'See Final Results →' : 'Next Round →'}
            </button>
          </div>
        )}

        {/* ── Results phase ───────────────────────────────────────────── */}
        {phase === 'results' && scores.length > 0 && (
          <div className="eg__results">
            <p className="eg__winner-line">
              🏆 {scores[0].name} wins!
            </p>
            <ol className="eg__leaderboard">
              {scores.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'eg__entry',
                    entry.isHuman ? 'eg__entry--you' : '',
                    i === 0 ? 'eg__entry--winner' : '',
                    i === scores.length - 1 ? 'eg__entry--last' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="eg__rank" aria-hidden="true">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span className="eg__entry-name">
                    {entry.name}
                    {entry.isHuman && <span className="eg__you-tag"> (You)</span>}
                  </span>
                  <span className="eg__entry-score">{entry.totalScore} pts</span>
                </li>
              ))}
            </ol>
            <div className="eg__round-breakdown">
              <p className="eg__breakdown-title">Your rounds:</p>
              {roundResults.map((r) => (
                <div key={r.round} className="eg__breakdown-row">
                  <span>Round {r.round}: {r.actual} objects · guessed {r.guess}</span>
                  <span className="eg__breakdown-pts">+{r.score}</span>
                </div>
              ))}
            </div>
            {session && (
              <button
                className="eg__done-btn"
                type="button"
                onClick={handleDone}
              >
                Continue ▶
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
