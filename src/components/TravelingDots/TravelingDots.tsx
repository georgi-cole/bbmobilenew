/**
 * TravelingDots — native React minigame component (route-planning puzzle).
 *
 * Redesigned gameplay:
 *  - A seeded board with START, FINISH, REQUIRED, BONUS (+pts), and HAZARD (-pts) nodes.
 *  - Player builds a path by tapping nodes one at a time.
 *  - Must visit ALL required nodes before tapping FINISH.
 *  - Score is driven by route efficiency, bonus collection, hazard avoidance, and speed.
 *
 * Supports two rendering modes:
 *  1. LOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(score)`.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import { resolveHybridAiScores } from '../../ai/competition/hybridScoreResolver';
import './TravelingDots.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 360;
const MARGIN = 38;
const TAP_RADIUS = 28; // pixel radius for tap detection
const GAME_DURATION = 90; // seconds
const READY_COUNT = 3;

// ── Score weights ─────────────────────────────────────────────────────────────

const SCORE_COMPLETION = 200;    // flat bonus for finishing the tour
const SCORE_EFFICIENCY_MAX = 500; // up to 500 for route efficiency
const SCORE_BONUS_NODE = 60;     // per bonus node visited
const SCORE_HAZARD_PENALTY = 80; // per hazard node visited
const SCORE_TIME_MAX = 150;      // time bonus
const SCORE_CAP = 1000;

// ── Node types ────────────────────────────────────────────────────────────────

type NodeType = 'start' | 'finish' | 'required' | 'bonus' | 'hazard';

interface BoardNode {
  id: number;
  x: number;
  y: number;
  type: NodeType;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'playing' | 'results';

interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  isHuman: boolean;
}

interface Props {
  session?: MinigameSession;
  players?: Player[];
  onFinish?: (value: number) => void;
  seed?: number;
  autoStart?: boolean;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function dist(a: BoardNode, b: BoardNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Nearest-neighbour TSP heuristic through an ordered sequence of nodes. */
function nearestNeighborPath(nodes: BoardNode[]): { path: BoardNode[]; length: number } {
  if (nodes.length === 0) return { path: [], length: 0 };
  const remaining = [...nodes];
  const path: BoardNode[] = [remaining.splice(0, 1)[0]];
  let totalLen = 0;
  while (remaining.length > 0) {
    const last = path[path.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((n, i) => {
      const d = dist(last, n);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    totalLen += bestDist;
    path.push(remaining.splice(bestIdx, 1)[0]);
  }
  return { path, length: totalLen };
}

/** Total path length for an ordered list of nodes. */
function pathLength(nodes: BoardNode[]): number {
  let len = 0;
  for (let i = 1; i < nodes.length; i++) len += dist(nodes[i - 1], nodes[i]);
  return len;
}

// ── Board generation ──────────────────────────────────────────────────────────

function generateBoard(seed: number): BoardNode[] {
  const rng = seededRng(seed);

  // Generate candidate positions with minimum spacing
  const positions: { x: number; y: number }[] = [];
  const MIN_GAP = 58;
  const MAX_ATTEMPTS = 300;

  const count = 14; // 1 start + 7 required + 3 bonus + 2 hazard + 1 finish
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !placed; attempt++) {
      const x = MARGIN + rng() * (CANVAS_SIZE - 2 * MARGIN);
      const y = MARGIN + rng() * (CANVAS_SIZE - 2 * MARGIN);
      const tooClose = positions.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_GAP);
      if (!tooClose) {
        positions.push({ x, y });
        placed = true;
      }
    }
    // Fallback: place anyway (no infinite loop)
    if (!positions[i]) {
      positions.push({
        x: MARGIN + rng() * (CANVAS_SIZE - 2 * MARGIN),
        y: MARGIN + rng() * (CANVAS_SIZE - 2 * MARGIN),
      });
    }
  }

  // Assign types in order: start, required×7, bonus×3, hazard×2, finish
  const types: NodeType[] = [
    'start',
    'required', 'required', 'required', 'required', 'required', 'required', 'required',
    'bonus', 'bonus', 'bonus',
    'hazard', 'hazard',
    'finish',
  ];

  return positions.map((p, i) => ({ id: i, x: p.x, y: p.y, type: types[i] }));
}

/** Compute the "reference" optimal path length.
 *  Uses nearest-neighbour over start + all required nodes, then adds the final
 *  leg to finish so that finish is always visited last. Used to measure route
 *  efficiency. */
function computeOptimalLength(board: BoardNode[]): number {
  const start = board.find((n) => n.type === 'start')!;
  const finish = board.find((n) => n.type === 'finish')!;
  const required = board.filter((n) => n.type === 'required');

  // Run nearest-neighbour over start + required only, to avoid selecting
  // finish before all required nodes have been visited.
  const { path, length: partialLength } = nearestNeighborPath([start, ...required]);
  const lastNode = path[path.length - 1] ?? start;
  const totalLength = partialLength + dist(lastNode, finish);

  return totalLength;
}

// ── Score calculation ─────────────────────────────────────────────────────────

interface ScoreBreakdown {
  efficiency: number;
  completion: number;
  bonusPoints: number;
  hazardPenalty: number;
  timeBonus: number;
  total: number;
}

function computeScore(
  path: BoardNode[],
  board: BoardNode[],
  optimalLength: number,
  elapsedSeconds: number,
): ScoreBreakdown {
  const allRequired = board.filter((n) => n.type === 'required');
  const visitedTypes = path.map((n) => n.type);
  const requiredVisited = allRequired.filter((n) => path.some((p) => p.id === n.id));
  const finished = path.some((n) => n.type === 'finish');

  // Completion bonus: only if all required visited AND finish reached
  const completion = requiredVisited.length === allRequired.length && finished ? SCORE_COMPLETION : 0;

  // Route efficiency: ratio of optimal to actual player path length
  const playerLen = pathLength(path);
  let efficiency = 0;
  if (playerLen > 0 && completion > 0) {
    const ratio = Math.min(optimalLength / playerLen, 1);
    efficiency = Math.round(SCORE_EFFICIENCY_MAX * Math.pow(ratio, 1.5));
  }

  // Bonus and hazard counts
  const bonusVisited = visitedTypes.filter((t) => t === 'bonus').length;
  const hazardVisited = visitedTypes.filter((t) => t === 'hazard').length;
  const bonusPoints = bonusVisited * SCORE_BONUS_NODE;
  const hazardPenalty = hazardVisited * SCORE_HAZARD_PENALTY;

  // Time bonus: reward speed but cap at GAME_DURATION
  const timeBonus = completion > 0
    ? Math.round(SCORE_TIME_MAX * Math.pow(Math.max(0, 1 - elapsedSeconds / GAME_DURATION), 0.7))
    : 0;

  const total = Math.max(
    0,
    Math.min(SCORE_CAP, completion + efficiency + bonusPoints - hazardPenalty + timeBonus),
  );

  return { efficiency, completion, bonusPoints, hazardPenalty, timeBonus, total };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  start:    '#22c55e',
  finish:   '#a855f7',
  required: '#60a5fa',
  bonus:    '#fbbf24',
  hazard:   '#f87171',
};

const NODE_ICONS: Record<NodeType, string> = {
  start:    'S',
  finish:   'F',
  required: '●',
  bonus:    '★',
  hazard:   '⚠',
};

function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: BoardNode[],
  path: BoardNode[],
  hovered: number | null,
  canFinish: boolean,
) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Background
  ctx.fillStyle = '#12121e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw path lines
  if (path.length >= 2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    path.forEach((n, i) => {
      if (i === 0) ctx.moveTo(n.x, n.y);
      else ctx.lineTo(n.x, n.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Draw dashed line from last path node to finish when player can finish
  if (canFinish && path.length > 0) {
    const last = path[path.length - 1];
    const finishNode = board.find((n) => n.type === 'finish')!;
    ctx.save();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(finishNode.x, finishNode.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw nodes
  board.forEach((node) => {
    const inPath = path.some((p) => p.id === node.id);
    const isHovered = node.id === hovered;
    const isStart = node.type === 'start';
    const isFinish = node.type === 'finish';
    const canReach = isFinish ? canFinish : !inPath;

    const radius = isStart || isFinish ? 14 : 11;
    const color = NODE_COLORS[node.type];

    ctx.save();

    // Glow for hovered reachable node
    if (isHovered && canReach) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    }

    // Fill
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = inPath ? `${color}55` : color;
    ctx.fill();

    // Border for visited nodes
    if (inPath) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Finish: dashed ring when reachable
    if (isFinish && canFinish) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Icon
    ctx.save();
    ctx.fillStyle = inPath ? color : '#fff';
    ctx.font = `bold ${isStart || isFinish ? 11 : 9}px system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(NODE_ICONS[node.type], node.x, node.y);
    ctx.restore();
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

export default function TravelingDots({ session, players = [], onFinish, seed = 1, autoStart = false }: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  const resolvedSeed = session?.seed ?? seed;
  const board = useMemo(() => generateBoard(resolvedSeed), [resolvedSeed]);
  const optimalLength = useMemo(() => computeOptimalLength(board), [board]);

  // ── State ──────────────────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(READY_COUNT);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [path, setPath] = useState<BoardNode[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pathRef = useRef<BoardNode[]>([]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const visitedIds = useMemo(() => new Set(path.map((n) => n.id)), [path]);
  const requiredCount = useMemo(() => board.filter((n) => n.type === 'required').length, [board]);
  const requiredVisitedCount = useMemo(
    () => board.filter((n) => n.type === 'required' && visitedIds.has(n.id)).length,
    [board, visitedIds],
  );
  const canFinish = requiredVisitedCount === requiredCount && path.length > 0 && !visitedIds.has(board.find((n) => n.type === 'finish')!.id);
  const progressPct = (timeLeft / GAME_DURATION) * 100;
  const isUrgent = timeLeft <= 10;

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx, board, path, hovered, canFinish);
  }, [board, path, hovered, canFinish]);

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return;
    if (countdown <= 0) {
      setGamePhase('playing');
      startTimeRef.current = Date.now();
      return;
    }
    if (autoStart && countdown === READY_COUNT) {
      setCountdown(0);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gamePhase, countdown, autoStart]);

  // ── Playing timer ──────────────────────────────────────────────────────────

  const finishGame = useCallback((finalPath: BoardNode[]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const bd = computeScore(finalPath, board, optimalLength, elapsed);
    setBreakdown(bd);
    pathRef.current = finalPath;

    if (session) {
      // For hybrid sessions, resolve AI scores after the human score is known.
      let resolvedAiScores: Record<string, number>;
      if (session.hybridResolveOnComplete) {
        const aiParticipants = session.participants
          .filter((id) => id !== humanId)
          .map((id) => {
            const p = players.find((pl) => pl.id === id);
            return { id, profile: p?.competitionProfile };
          });
        resolvedAiScores = resolveHybridAiScores({
          gameKey: session.key,
          humanScore: bd.total,
          aiParticipants,
          seed: session.seed,
        });
      } else {
        resolvedAiScores = session.aiScores;
      }
      const allScores: Record<string, number> = {
        ...resolvedAiScores,
        ...(humanId ? { [humanId]: bd.total } : {}),
      };
      const entries: ScoreEntry[] = session.participants.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return { id, name: p?.name ?? id, score: allScores[id] ?? 0, isHuman: id === humanId };
      });
      entries.sort((a, b) => b.score - a.score);
      setLeaderboard(entries);
      setGamePhase('results');
    } else {
      if (onFinish) onFinish(bd.total);
    }
  }, [board, optimalLength, session, humanId, players, onFinish]);

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          finishGame(pathRef.current);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  // ── Node hit detection ─────────────────────────────────────────────────────

  const findNodeAt = useCallback((canvasX: number, canvasY: number): BoardNode | null => {
    const scale = CANVAS_SIZE / (canvasRef.current?.getBoundingClientRect().width ?? CANVAS_SIZE);
    const cx = canvasX * scale;
    const cy = canvasY * scale;

    // Priority: finish node first when canFinish, then regular nodes
    for (const node of board) {
      const isFinish = node.type === 'finish';
      if (isFinish && !canFinish) continue;
      if (!isFinish && visitedIds.has(node.id)) continue;
      if (Math.hypot(cx - node.x, cy - node.y) < TAP_RADIUS) return node;
    }
    return null;
  }, [board, visitedIds, canFinish]);

  const handleCanvasInteraction = useCallback((clientX: number, clientY: number) => {
    if (gamePhase !== 'playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(clientX - rect.left, clientY - rect.top);
    if (!node) return;

    const newPath = [...pathRef.current, node];
    pathRef.current = newPath;
    setPath(newPath);

    if (node.type === 'finish') {
      finishGame(newPath);
    }
  }, [gamePhase, findNodeAt, finishGame]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasInteraction(e.clientX, e.clientY);
  }, [handleCanvasInteraction]);

  const handleTouch = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handleCanvasInteraction]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gamePhase !== 'playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    setHovered(node?.id ?? null);
  }, [gamePhase, findNodeAt]);

  const handleMouseLeave = useCallback(() => setHovered(null), []);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (path.length === 0) return;
    const newPath = path.slice(0, -1);
    pathRef.current = newPath;
    setPath(newPath);
  }, [path]);

  // ── Finish button ─────────────────────────────────────────────────────────

  const handleFinish = useCallback(() => {
    if (!canFinish) return;
    const finishNode = board.find((n) => n.type === 'finish')!;
    const newPath = [...pathRef.current, finishNode];
    pathRef.current = newPath;
    setPath(newPath);
    finishGame(newPath);
  }, [canFinish, board, finishGame]);

  // ── Done handler (results → dispatch) ─────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session || !breakdown) return;
    const lastPlaceId = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].id : undefined;
    const payload: CompleteMinigamePayload = { humanScore: breakdown.total, lastPlaceId };
    if (session.key === 'quickTap') {
      dispatch(completeMinigame(payload));
    }
  }, [dispatch, session, breakdown, leaderboard]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="td" role="dialog" aria-modal="true" aria-label="Traveling Dots Competition">
      <div className="td__card">
        <header className="td__header">
          <h2 className="td__title">🗺 Traveling Dots</h2>
          <p className="td__subtitle">Plan the optimal route — avoid hazards, collect bonuses!</p>
        </header>

        {/* ── Ready phase ──────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="td__ready">
            <span className="td__ready-count" aria-live="assertive">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
            <p className="td__ready-hint">
              Visit all blue required nodes, then tap the purple Finish node.
              <br />
              Collect ⭐ bonuses and avoid ⚠ hazards for a better score!
            </p>
          </div>
        )}

        {/* ── Playing phase ────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="td__playing">
            {/* Stats */}
            <div className="td__stats">
              <div className="td__stat">
                <span className="td__stat-value">{requiredVisitedCount}/{requiredCount}</span>
                <span className="td__stat-label">Required</span>
              </div>
              <div className="td__stat">
                <span
                  className={['td__stat-value td__stat-value--timer', isUrgent ? 'urgent' : ''].filter(Boolean).join(' ')}
                  aria-live={isUrgent ? 'assertive' : 'off'}
                >
                  {timeLeft.toFixed(1)}s
                </span>
                <span className="td__stat-label">Time</span>
              </div>
              <div className="td__stat">
                <span className="td__stat-value">{path.length}</span>
                <span className="td__stat-label">Visited</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="td__progress-bar" role="progressbar" aria-valuenow={timeLeft} aria-valuemin={0} aria-valuemax={GAME_DURATION}>
              <div className="td__progress-fill" style={{ width: `${progressPct}%` }} />
            </div>

            {/* Legend */}
            <div className="td__legend" aria-hidden="true">
              {(['start', 'required', 'bonus', 'hazard', 'finish'] as NodeType[]).map((type) => (
                <span key={type} className="td__legend-item">
                  <span className={`td__legend-dot td__legend-dot--${type}`} />
                  {type === 'start' ? 'Start' : type === 'finish' ? 'Finish' : type === 'required' ? 'Required' : type === 'bonus' ? `Bonus (+${SCORE_BONUS_NODE})` : `Hazard (-${SCORE_HAZARD_PENALTY})`}
                </span>
              ))}
            </div>

            {/* Canvas */}
            <div className="td__canvas-wrap">
              <canvas
                ref={canvasRef}
                className="td__canvas"
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                onClick={handleClick}
                onTouchStart={handleTouch}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                aria-label="Route planning board"
              />
            </div>

            {/* Buttons */}
            <div className="td__btn-row">
              <button
                className="td__btn td__btn--undo"
                onClick={handleUndo}
                disabled={path.length === 0}
                type="button"
              >
                ↩ Undo
              </button>
              <button
                className="td__btn td__btn--finish"
                onClick={handleFinish}
                disabled={!canFinish}
                type="button"
              >
                Finish Route
              </button>
            </div>
          </div>
        )}

        {/* ── Results phase ────────────────────────────────────────────── */}
        {gamePhase === 'results' && breakdown && (
          <div className="td__results">
            <div className="td__result-header">
              <p className="td__result-title">
                {breakdown.completion > 0 ? '🎯 Route Complete!' : '⏱ Time\'s Up!'}
              </p>
              <p className="td__result-breakdown">Your score breakdown</p>
            </div>

            <div className="td__score-breakdown">
              <div className="td__breakdown-row">
                <span className="td__breakdown-label">Route completion</span>
                <span className={`td__breakdown-value td__breakdown-value--${breakdown.completion > 0 ? 'positive' : 'neutral'}`}>
                  +{breakdown.completion}
                </span>
              </div>
              <div className="td__breakdown-row">
                <span className="td__breakdown-label">Path efficiency</span>
                <span className={`td__breakdown-value td__breakdown-value--${breakdown.efficiency > 0 ? 'positive' : 'neutral'}`}>
                  +{breakdown.efficiency}
                </span>
              </div>
              {breakdown.bonusPoints > 0 && (
                <div className="td__breakdown-row">
                  <span className="td__breakdown-label">Bonus nodes ⭐</span>
                  <span className="td__breakdown-value td__breakdown-value--positive">+{breakdown.bonusPoints}</span>
                </div>
              )}
              {breakdown.hazardPenalty > 0 && (
                <div className="td__breakdown-row">
                  <span className="td__breakdown-label">Hazard penalty ⚠</span>
                  <span className="td__breakdown-value td__breakdown-value--negative">-{breakdown.hazardPenalty}</span>
                </div>
              )}
              <div className="td__breakdown-row">
                <span className="td__breakdown-label">Speed bonus</span>
                <span className={`td__breakdown-value td__breakdown-value--${breakdown.timeBonus > 0 ? 'positive' : 'neutral'}`}>
                  +{breakdown.timeBonus}
                </span>
              </div>
              <hr className="td__breakdown-divider" />
              <div className="td__total-row">
                <span className="td__total-label">Total score</span>
                <span className="td__total-value">{breakdown.total}</span>
              </div>
            </div>

            {/* Leaderboard (LOH/LOH mode only) */}
            {leaderboard.length > 0 && (
              <ol className="td__leaderboard">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.id}
                    className={[
                      'td__lb-entry',
                      entry.isHuman ? 'td__lb-entry--you' : '',
                      i === 0 ? 'td__lb-entry--winner' : '',
                      i === leaderboard.length - 1 ? 'td__lb-entry--last' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="td__lb-rank" aria-hidden="true">{MEDALS[i] ?? `${i + 1}.`}</span>
                    <span className="td__lb-name">
                      {entry.name}
                      {entry.isHuman && <span className="td__lb-you-tag"> (You)</span>}
                    </span>
                    <span className="td__lb-score">{entry.score} pts</span>
                  </li>
                ))}
              </ol>
            )}

            <button className="td__done-btn" onClick={handleDone} type="button">
              Continue ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
