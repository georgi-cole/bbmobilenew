/**
 * EstimationGame — native React minigame component.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + winnerId + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(avgAccuracy, tiebreakerMs)`.
 *
 * Game design:
 *  - 5 rounds of increasing difficulty
 *  - Rounds 1–3: count all figures of one type (single type shown)
 *  - Round 4: mixed figures — count ONLY the circles, ignore triangles
 *  - Round 5: mixed figures — count everything EXCEPT the triangles
 *  - Each round reveals figures briefly, then hides them; player guesses the count
 *  - Exposure time decreases each round
 *  - Deterministic seeded RNG with a time-varied fallback seed ensures varied counts
 *
 * Scoring rules:
 *  - Each round: roundScore = max(0, 100 − |guess − actual| × 3)
 *  - Final metric: average accuracy = round(sum of 5 round scores / 5)  — range [0, 100]
 *  - Highest average accuracy wins; ties broken by lower total response time
 *  - Winner = participant with highest final average accuracy
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import { mulberry32 } from '../../store/rng';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import {
  NUM_ROUNDS,
  computeRoundScore,
  computeAverageAccuracy,
  deriveLastPlaceId,
} from './estimationGameUtils';
import { resolveHybridAiScores } from '../../ai/competition/hybridScoreResolver';
import './EstimationGame.css';

// ── Constants ─────────────────────────────────────────────────────────────────

type FigureType = 'circle' | 'triangle' | 'star';
type CountType  = 'all' | 'only' | 'exclude';

interface RoundConfig {
  minCount:      number;
  maxCount:      number;
  exposureMs:    number;
  label:         string;
  figureTypes:   FigureType[];
  countType:     CountType;
  countTarget?:  FigureType;    // used when countType === 'only'
  excludeTarget?: FigureType;   // used when countType === 'exclude'
  instruction:   string;
}

/** Per-round configuration — 5 rounds with escalating difficulty. */
const ROUND_CONFIG: RoundConfig[] = [
  {
    minCount:    15, maxCount:    25, exposureMs: 2000,
    label:       'Round 1 of 5',
    figureTypes: ['circle'],
    countType:   'all',
    instruction: 'Count all the circles',
  },
  {
    minCount:    22, maxCount:    38, exposureMs: 1500,
    label:       'Round 2 of 5',
    figureTypes: ['star'],
    countType:   'all',
    instruction: 'Count all the stars',
  },
  {
    minCount:    35, maxCount:    58, exposureMs: 1100,
    label:       'Round 3 of 5',
    figureTypes: ['circle', 'triangle'],
    countType:   'all',
    instruction: 'Count ALL the shapes (circles + triangles)',
  },
  {
    minCount:    50, maxCount:    75, exposureMs: 800,
    label:       'Round 4 of 5',
    figureTypes: ['circle', 'triangle'],
    countType:   'only',
    countTarget: 'circle',
    instruction: 'Count only the CIRCLES — ignore the triangles!',
  },
  {
    minCount:    60, maxCount:    90, exposureMs: 600,
    label:       'Round 5 of 5',
    figureTypes: ['circle', 'triangle', 'star'],
    countType:   'exclude',
    excludeTarget: 'triangle',
    instruction: 'Count everything EXCEPT the triangles!',
  },
];

/** Time limit for entering a guess after the reveal (seconds). */
const GUESS_TIME_LIMIT = 22;

// ── Figure colors ─────────────────────────────────────────────────────────────

const FIGURE_COLORS: Record<FigureType, string[]> = {
  circle:   ['#6fd3ff', '#4ecbf5', '#82e4ff', '#2db8f0'],
  triangle: ['#fb923c', '#f97316', '#fdba74', '#ea580c'],
  star:     ['#fde68a', '#fcd34d', '#f59e0b', '#fef08a'],
};

// ── Shape helpers ─────────────────────────────────────────────────────────────

interface FigureObject {
  x:     number;
  y:     number;
  r:     number;
  color: string;
  type:  FigureType;
}

function genPositions(
  rng: () => number, count: number, w: number, h: number, pad: number,
) {
  return Array.from({ length: count }, () => ({
    x: pad + rng() * (w - 2 * pad),
    y: pad + rng() * (h - 2 * pad),
  }));
}

function getRadius(rng: () => number, type: FigureType): number {
  if (type === 'circle')   return 4 + rng() * 3;
  if (type === 'triangle') return 5 + rng() * 3;
  return 4 + rng() * 2; // star
}

function buildFigures(
  rng: () => number,
  count: number,
  figureTypes: FigureType[],
  w: number,
  h: number,
): FigureObject[] {
  const positions = genPositions(rng, count, w, h, 12);
  return positions.map((pos) => {
    const type  = figureTypes[Math.floor(rng() * figureTypes.length)];
    const colors = FIGURE_COLORS[type];
    return {
      x:     pos.x,
      y:     pos.y,
      r:     getRadius(rng, type),
      color: colors[Math.floor(rng() * colors.length)],
      type,
    };
  });
}

/** Compute the count players are scored against for the given round config. */
function computeActualCount(objects: FigureObject[], cfg: RoundConfig): number {
  if (cfg.countType === 'all')     return objects.length;
  if (cfg.countType === 'only')    return objects.filter((o) => o.type === cfg.countTarget).length;
  if (cfg.countType === 'exclude') return objects.filter((o) => o.type !== cfg.excludeTarget).length;
  return objects.length;
}

/** Draw a single figure object onto the canvas context. */
function drawFigure(ctx: CanvasRenderingContext2D, obj: FigureObject): void {
  ctx.fillStyle = obj.color;
  ctx.beginPath();

  if (obj.type === 'circle') {
    ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);
    ctx.fill();

  } else if (obj.type === 'triangle') {
    // Equilateral triangle pointing up
    const h = obj.r * 1.5;
    ctx.moveTo(obj.x,          obj.y - h);
    ctx.lineTo(obj.x + obj.r,  obj.y + h * 0.5);
    ctx.lineTo(obj.x - obj.r,  obj.y + h * 0.5);
    ctx.closePath();
    ctx.fill();

  } else {
    // Star: diamond / rotated-square shape for clear visual distinction
    const s = obj.r * 1.4;
    ctx.moveTo(obj.x,     obj.y - s);
    ctx.lineTo(obj.x + s, obj.y);
    ctx.lineTo(obj.x,     obj.y + s);
    ctx.lineTo(obj.x - s, obj.y);
    ctx.closePath();
    ctx.fill();
  }
}

// ── AI score helpers ──────────────────────────────────────────────────────────

/**
 * Build the scores map for all participants.
 * In hybrid mode AI scores are resolved after the human score is known.
 * Scores are 0-100 (average accuracy).
 */
function buildAllScores(
  session: MinigameSession,
  humanId: string | undefined,
  humanAvg: number,
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
      humanScore: humanAvg,
      aiParticipants,
      seed: session.seed,
    });
  } else {
    aiScores = { ...session.aiScores };
  }
  const result = { ...aiScores };
  if (humanId) result[humanId] = humanAvg;
  return result;
}

/**
 * Rank participants by score (higher = better).
 * Tie-break: lower average response time first (passed via secondaryMap);
 * if still equal, stable participant order.
 */
function rankParticipants(
  scores: Record<string, number>,
  participants: string[],
  responseTimeMs?: Record<string, number>,
): string[] {
  return [...participants].sort((a, b) => {
    const sa = scores[a] ?? 0;
    const sb = scores[b] ?? 0;
    if (sb !== sa) return sb - sa;
    // Time tiebreaker: lower total response time wins
    if (responseTimeMs) {
      const ta = responseTimeMs[a] ?? Infinity;
      const tb = responseTimeMs[b] ?? Infinity;
      if (ta !== tb) return ta - tb;
    }
    // Stable final fallback: preserve session participant order
    return participants.indexOf(a) - participants.indexOf(b);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'intro' | 'reveal' | 'guess' | 'feedback' | 'results';

interface RoundResult {
  round:      number;
  actual:     number;
  guess:      number;
  score:      number;
  responseMs: number;  // time taken to submit this guess (ms)
}

interface ScoreEntry {
  id:         string;
  name:       string;
  totalScore: number;  // average accuracy 0-100
  isHuman:    boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  session?:    MinigameSession;
  players?:    Player[];
  onFinish?:   (value: number, tiebreakerMs?: number) => void;
  seed?:       number;
  autoStart?:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EstimationGame({
  session,
  players = [],
  onFinish,
  seed: propSeed,
  autoStart = false,
}: Props) {
  const dispatch  = useAppDispatch();
  const humanId   = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  // Use a stable time-varied fallback seed so standalone runs produce varied counts.
  const fallbackSeedRef = useRef<number>(
    ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFF)) >>> 0) || 1,
  );
  const effectiveSeed = session?.seed ?? propSeed ?? fallbackSeedRef.current;

  // ── State ──────────────────────────────────────────────────────────────────

  const [phase,          setPhase]          = useState<GamePhase>(autoStart ? 'reveal' : 'intro');
  const [roundIndex,     setRoundIndex]     = useState(0);
  const [objects,        setObjects]        = useState<FigureObject[]>([]);
  const [actualCount,    setActualCount]    = useState(0);
  const [guessValue,     setGuessValue]     = useState('');
  const [roundResults,   setRoundResults]   = useState<RoundResult[]>([]);
  const [guessTimeLeft,  setGuessTimeLeft]  = useState(GUESS_TIME_LIMIT);
  const [scores,         setScores]         = useState<ScoreEntry[]>([]);
  const [feedbackMsg,    setFeedbackMsg]    = useState('');

  // Track when the guess phase started (for response-time tiebreaker)
  const guessStartTimeRef  = useRef<number>(0);
  const guessTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef           = useRef<HTMLInputElement>(null);
  const canvasRef          = useRef<HTMLCanvasElement>(null);

  // ── Seeded round generation ────────────────────────────────────────────────

  const generateRound = useCallback((idx: number) => {
    const cfg = ROUND_CONFIG[idx];
    // Per-round seed: XOR-mix effectiveSeed with a round-specific salt to produce
    // independent, varied counts even across closely-spaced effectiveSeed values.
    const roundSeed = ((effectiveSeed ^ ((idx + 1) * 0x6b7f5)) >>> 0) || 1;
    const rng = mulberry32(roundSeed);

    const totalCount = cfg.minCount + Math.floor(rng() * (cfg.maxCount - cfg.minCount + 1));
    const objs       = buildFigures(rng, totalCount, cfg.figureTypes, 300, 180);
    const actual     = computeActualCount(objs, cfg);

    setObjects(objs);
    setActualCount(actual);
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
      guessStartTimeRef.current = Date.now();
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

    const responseMs = Math.max(0, Date.now() - guessStartTimeRef.current);
    const guess  = forceGuess !== undefined ? forceGuess : (parseInt(guessValue, 10) || 0);
    const score  = computeRoundScore(actualCount, guess);
    const diff   = Math.abs(actualCount - guess);
    const result: RoundResult = { round: roundIndex + 1, actual: actualCount, guess, score, responseMs };

    setRoundResults((prev) => [...prev, result]);

    let msg: string;
    if (diff === 0)        msg = '🎯 Perfect! Exactly right!';
    else if (diff <= 2)    msg = `✨ So close! Off by ${diff}`;
    else if (diff <= 8)    msg = `👍 Not bad! Off by ${diff}`;
    else if (diff <= 15)   msg = `😬 Off by ${diff}`;
    else                   msg = `💀 Way off! Off by ${diff}`;
    setFeedbackMsg(msg);
    setPhase('feedback');
  }, [phase, guessValue, actualCount, roundIndex]);

  // ── Finish game ────────────────────────────────────────────────────────────

  const finishGame = useCallback((finalResults: RoundResult[]) => {
    const roundScores   = finalResults.map((r) => r.score);
    const humanAvg      = computeAverageAccuracy(roundScores);
    const totalRespMs   = finalResults.reduce((s, r) => s + r.responseMs, 0);

    if (session) {
      const allScores = buildAllScores(session, humanId, humanAvg, players);
      // For human player, we know the response time; AI tiebreakers are derived
      // from session.aiTiebreakers if available, or remain at Infinity (stable fallback).
      const respMap: Record<string, number> = {};
      if (humanId) respMap[humanId] = totalRespMs;
      const ranked = rankParticipants(allScores, session.participants, respMap);

      const entries: ScoreEntry[] = ranked.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return {
          id,
          name:       p?.name ?? id,
          totalScore: allScores[id] ?? 0,
          isHuman:    id === humanId,
        };
      });

      if (import.meta.env.DEV) {
        console.log('[EstimationDebug] finishGame — session path', {
          humanId, humanAvg, totalRespMs,
          allScores, rankedOrder: ranked,
          computedWinnerId: entries[0]?.id,
        });
      }

      setScores(entries);
      setPhase('results');
    } else {
      // MinigameHost (challenge) path
      if (import.meta.env.DEV) {
        console.log('[EstimationDebug] finishGame — MinigameHost path', { humanAvg, totalRespMs });
      }
      if (onFinish) onFinish(humanAvg, totalRespMs);
    }
  }, [session, humanId, players, onFinish]);

  // ── Proceed after feedback ─────────────────────────────────────────────────

  const handleNextRound = useCallback(() => {
    const nextIdx = roundIndex + 1;
    if (nextIdx < NUM_ROUNDS) {
      setRoundIndex(nextIdx);
      startRound(nextIdx);
    } else {
      // All 5 rounds complete — pass the final results snapshot directly to
      // finishGame to avoid relying on stale roundResults state.
      setRoundResults((prev) => {
        finishGame(prev);
        return prev;
      });
    }
  }, [roundIndex, startRound, finishGame]);

  // ── Done handler (dispatches to Redux) ────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session || scores.length === 0) return;

    // Derive final values from the displayed leaderboard — these are authoritative.
    const scoresMap  = Object.fromEntries(scores.map((e) => [e.id, e.totalScore]));
    const winnerId   = scores[0].id;
    const lastPlaceId = deriveLastPlaceId(scoresMap, session.participants, winnerId);
    // humanAvg: recompute from scores map to ensure it matches the dispatched humanScore
    const humanAvg   = humanId != null ? (scoresMap[humanId] ?? 0) : 0;

    const payload: CompleteMinigamePayload = {
      humanScore: humanAvg,
      lastPlaceId,
      winnerId,
    };

    if (import.meta.env.DEV) {
      console.log('[EstimationDebug] handleDone — dispatching completeMinigame', {
        payload,
        leaderboard: scores.map((e, i) => ({ rank: i + 1, id: e.id, totalScore: e.totalScore })),
        humanId,
        sessionParticipants: session.participants,
      });
    }

    dispatch(completeMinigame(payload));
  }, [dispatch, scores, session, humanId]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'reveal' || objects.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.forEach((obj) => drawFigure(ctx, obj));
  }, [phase, objects]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentCfg       = ROUND_CONFIG[roundIndex];
  const progressPct      = (guessTimeLeft / GUESS_TIME_LIMIT) * 100;
  const lastResult       = roundResults[roundResults.length - 1];
  const runningAvg       = roundResults.length > 0
    ? computeAverageAccuracy(roundResults.map((r) => r.score))
    : 0;
  const isLastRound      = roundIndex === NUM_ROUNDS - 1;
  const isMixedRound     = currentCfg?.figureTypes.length > 1;

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
              Objects flash briefly on screen — count carefully, then enter your
              estimate before time runs out! 5 rounds of increasing difficulty,
              including rounds where you must count <em>only specific shapes</em>.
            </p>
            <div className="eg__rounds-preview">
              {ROUND_CONFIG.map((cfg, i) => (
                <div key={i} className="eg__round-pill">
                  <span className="eg__round-pill-num">R{i + 1}</span>
                  <span className="eg__round-pill-time">{(cfg.exposureMs / 1000).toFixed(1)}s</span>
                </div>
              ))}
            </div>
            <p className="eg__intro-metric">Final score = average accuracy across all 5 rounds</p>
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
              <span>{currentCfg?.label}</span>
              <span className="eg__theme-label">{(currentCfg?.exposureMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="eg__instruction-banner" aria-live="assertive">
              {currentCfg?.instruction}
            </div>
            <div className="eg__canvas-wrap eg__canvas-wrap--visible">
              <canvas
                ref={canvasRef}
                className="eg__canvas"
                width={300}
                height={180}
                aria-label="Figures — count carefully!"
              />
              <div className="eg__reveal-overlay" aria-hidden="true">
                <span className="eg__reveal-flash">LOOK!</span>
              </div>
            </div>
            <p className="eg__reveal-hint">
              {isMixedRound ? currentCfg?.instruction : 'Count quickly…'}
            </p>
          </div>
        )}

        {/* ── Guess phase ─────────────────────────────────────────────── */}
        {phase === 'guess' && (
          <div className="eg__guess">
            <div className="eg__round-tag">
              <span>{currentCfg?.label}</span>
              <span className="eg__round-score-running">Avg so far: {runningAvg}%</span>
            </div>
            <div className="eg__instruction-banner eg__instruction-banner--dim" aria-live="polite">
              {currentCfg?.instruction}
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
              className={[
                'eg__timer-bar',
                progressPct <= 33 ? 'eg__timer-bar--urgent' : '',
              ].filter(Boolean).join(' ')}
              role="progressbar"
              aria-valuenow={guessTimeLeft}
              aria-valuemin={0}
              aria-valuemax={GUESS_TIME_LIMIT}
            >
              <div className="eg__timer-fill" style={{ width: `${progressPct}%` }} />
              <span className="eg__timer-label">{guessTimeLeft}s</span>
            </div>
            <p className="eg__guess-prompt">Your estimate:</p>
            <input
              ref={inputRef}
              className="eg__guess-input"
              type="number"
              min="0"
              max="200"
              inputMode="numeric"
              placeholder="Enter your count…"
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
        {phase === 'feedback' && lastResult && (
          <div className="eg__feedback">
            <div className={[
              'eg__feedback-banner',
              lastResult.score >= 80 ? 'eg__feedback-banner--great'
                : lastResult.score >= 50 ? 'eg__feedback-banner--ok'
                : 'eg__feedback-banner--bad',
            ].filter(Boolean).join(' ')}>
              <p className="eg__feedback-msg">{feedbackMsg}</p>
              <p className="eg__feedback-detail">
                Actual: <strong>{lastResult.actual}</strong>
                {' '}· Your guess: <strong>{lastResult.guess}</strong>
                {' '}· +<strong>{lastResult.score}</strong> pts
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
              {isLastRound ? 'See Final Results →' : 'Next Round →'}
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
                    entry.isHuman  ? 'eg__entry--you'    : '',
                    i === 0        ? 'eg__entry--winner'  : '',
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
                  <span className="eg__entry-score">{entry.totalScore}% avg</span>
                </li>
              ))}
            </ol>
            <div className="eg__round-breakdown">
              <p className="eg__breakdown-title">Your rounds:</p>
              {roundResults.map((r) => (
                <div key={r.round} className="eg__breakdown-row">
                  <span>Round {r.round}: {r.actual} target · guessed {r.guess}</span>
                  <span className="eg__breakdown-pts">+{r.score}</span>
                </div>
              ))}
              <div className="eg__breakdown-row eg__breakdown-row--total">
                <span>Average accuracy</span>
                <span className="eg__breakdown-pts">
                  {computeAverageAccuracy(roundResults.map((r) => r.score))}%
                </span>
              </div>
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
