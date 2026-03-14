/**
 * RiskWheelComp — Full-screen multi-round wheel competition component.
 *
 * Rendered by MinigameHost when reactComponentKey === 'RiskWheel'.
 * Also used standalone from RiskWheelTestPage.
 *
 * Changes (v2):
 *  - Bug #1 fixed: AI turns now resolved synchronously via resolveAllAiTurns
 *    (no more stall from setTimeout chains cancelled by React re-renders).
 *  - Bug #2 fixed: "Spin Again" immediately performs the next spin.
 *  - Bug #3 fixed: Proper SVG Wheel-of-Fortune with colored sectors and
 *    rotation animation that lands on the exact result sector.
 *  - Bug #4 fixed: Removed cluttered player-card sidebar; header layout
 *    fixed; festive round-summary leaderboard.
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '../../store/store';
import type { RootState } from '../../store/store';
import {
  initRiskWheel,
  performSpin,
  advanceFrom666,
  playerStop,
  playerSpinAgain,
  advanceFromTurnComplete,
  resolveAllAiTurns,
  advanceFromRoundSummary,
  markRiskWheelOutcomeResolved,
  WHEEL_SECTORS,
  computeEliminationCount,
  pickSectorIndex,
  type RiskWheelCompetitionType,
} from '../../features/riskWheel/riskWheelSlice';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './RiskWheelComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPIN_DURATION_MS = 2200;
const AI_RESOLVE_DELAY_MS = 600;

function areAnimationsDisabled(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function animDelay(ms: number): number {
  return areAnimationsDisabled() ? 0 : ms;
}

const N_SECTORS = WHEEL_SECTORS.length;
const DEG_PER_SECTOR = 360 / N_SECTORS;

function getTargetRotation(currentRotation: number, sectorIndex: number): number {
  // Bring sectorIndex to the top (pointer at 12 o'clock).
  // At rotation 0, sector 0 is centered at the top.
  // sector i center is at i * DEG_PER_SECTOR degrees clockwise from the top.
  // To bring sector i to the top the wheel must rotate so that i * DEG_PER_SECTOR ≡ 0 (mod 360).
  // That means rotation ≡ -i * DEG_PER_SECTOR (mod 360).
  const targetBase = -(sectorIndex * DEG_PER_SECTOR);
  // We want at least 5 full rotations beyond current position.
  const minTarget = currentRotation + 5 * 360;
  const k = Math.ceil((minTarget - targetBase) / 360);
  return k * 360 + targetBase;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType?: RiskWheelCompetitionType;
  seed: number;
  onComplete?: () => void;
  standalone?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getName(id: string, participants: MinigameParticipant[] | undefined): string {
  return participants?.find((p) => p.id === id)?.name ?? id;
}

/** Format a numeric score with a leading '+' for non-negative values. */
function formatScore(score: number): string {
  return `${score >= 0 ? '+' : ''}${score}`;
}

// ─── Sector colour palette ────────────────────────────────────────────────────

const SECTOR_COLORS: string[] = [
  '#1d4ed8', // 10  – blue
  '#1d4ed8', // 30  – blue
  '#0891b2', // 50  – cyan
  '#059669', // 100 – green
  '#059669', // 150 – green
  '#047857', // 200 – dark green
  '#b45309', // 500 – amber
  '#d97706', // 750 – gold
  '#f59e0b', // 1000 – bright gold
  '#374151', // 0   – gray
  '#92400e', // SKIP – orange-brown
  '#1d4ed8', // 3.14 – blue
  '#b91c1c', // -100 – red
  '#991b1b', // -200 – dark red
  '#7f1d1d', // BANKRUPT – deepest red
  '#5b21b6', // 666 – purple
];

// ─── SVG Wheel ────────────────────────────────────────────────────────────────

function sectorPath(i: number, n: number, r: number): string {
  const slice = (2 * Math.PI) / n;
  const start = i * slice - Math.PI / 2; // start at 12 o'clock
  const end = start + slice;
  const x1 = r * Math.cos(start);
  const y1 = r * Math.sin(start);
  const x2 = r * Math.cos(end);
  const y2 = r * Math.sin(end);
  const large = slice > Math.PI ? 1 : 0;
  return `M 0 0 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

interface WheelSvgProps {
  rotation: number;
  transitioning: boolean;
  onTransitionEnd?: () => void;
}

function WheelSvg({ rotation, transitioning, onTransitionEnd }: WheelSvgProps) {
  const R = 95;
  const LABEL_R = 72;

  return (
    <div className="rw-wheel-outer">
      {/* Pointer indicator */}
      <div className="rw-wheel-pointer" aria-hidden="true">▼</div>
      <div
        className="rw-wheel-svg-wrapper"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: transitioning
            ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.6, 0.1, 1)`
            : 'none',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        <svg
          viewBox="-100 -100 200 200"
          aria-hidden="true"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Sectors */}
          {WHEEL_SECTORS.map((sector, i) => {
            const slice = (2 * Math.PI) / N_SECTORS;
            const midAngle = i * slice - Math.PI / 2 + slice / 2;
            const lx = LABEL_R * Math.cos(midAngle);
            const ly = LABEL_R * Math.sin(midAngle);
            const textAngleDeg = (midAngle * 180) / Math.PI + 90;
            return (
              <g key={i}>
                <path
                  d={sectorPath(i, N_SECTORS, R)}
                  fill={SECTOR_COLORS[i] ?? '#374151'}
                  stroke="#0a0a16"
                  strokeWidth="1.2"
                />
                <text
                  x={lx.toFixed(3)}
                  y={ly.toFixed(3)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={sector.label.length > 4 ? '7' : '8.5'}
                  fontWeight="800"
                  fontFamily="inherit"
                  transform={`rotate(${textAngleDeg.toFixed(1)}, ${lx.toFixed(3)}, ${ly.toFixed(3)})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {sector.label}
                </text>
              </g>
            );
          })}
          {/* Outer ring */}
          <circle cx="0" cy="0" r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
          {/* Center hub */}
          <circle cx="0" cy="0" r="12" fill="#0f0f1e" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          <text x="0" y="4.5" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.8)">
            ★
          </text>
        </svg>
      </div>
    </div>
  );
}

// ─── Score display ────────────────────────────────────────────────────────────

function ScoreDisplay({ score, animating }: { score: number; animating?: boolean }) {
  const cls = `rw-score-value${animating ? ' rw-score-bump' : ''}`;
  const colour = score < 0 ? '#ef4444' : score === 0 ? '#9ca3af' : '#34d399';
  return (
    <span className={cls} style={{ color: colour }}>
      {formatScore(score)}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RiskWheelComp({
  participantIds,
  participants,
  prizeType = 'HOH',
  seed,
  onComplete,
  standalone = false,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const rw = useSelector((s: RootState) => s.riskWheel);

  // Wheel rotation state
  const [wheelAngle, setWheelAngle] = useState(0);
  const [wheelTransitioning, setWheelTransitioning] = useState(false);
  const wheelAngleRef = useRef(0);

  const [spinning, setSpinning] = useState(false);
  const isInitialisedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // ── Initialise on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialisedRef.current) return;
    isInitialisedRef.current = true;
    dispatch(
      initRiskWheel({
        participantIds,
        competitionType: prizeType,
        seed,
        humanPlayerId: participants?.find((p) => p.isHuman)?.id ?? null,
      }),
    );
  // Only run once on mount; participantIds/prizeType/seed are stable for the
  // lifetime of this game session and dispatch is a stable Redux reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Outcome resolved callback ────────────────────────────────────────────
  useEffect(() => {
    if (!rw || rw.phase !== 'complete' || rw.outcomeResolved || standalone) return;
    dispatch(markRiskWheelOutcomeResolved());
  // dispatch and standalone are stable; only phase/outcomeResolved need to re-trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.phase, rw?.outcomeResolved]);

  useEffect(() => {
    if (!rw || rw.phase !== 'complete' || !rw.outcomeResolved || standalone) return;
    onCompleteRef.current?.();
  // onCompleteRef is a stable ref; outcomeResolved is the only signal needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.outcomeResolved]);

  const currentId = rw?.activePlayerIds[rw.currentPlayerIndex] ?? null;
  const humanId = rw?.humanPlayerId ?? null;
  const isHumanTurn = currentId !== null && currentId === humanId;

  // ── AI automation (Bug #1 fix) ───────────────────────────────────────────
  // When an AI player's turn is active, resolve all AI turns synchronously
  // after a brief pause (so the UI can update before scores populate).
  useEffect(() => {
    if (!rw || spinning) return;
    const { phase } = rw;
    const activeId = rw.activePlayerIds[rw.currentPlayerIndex] ?? null;
    const isAiTurn = activeId !== null && activeId !== rw.humanPlayerId;

    if (!isAiTurn) return;
    if (phase === 'round_summary' || phase === 'complete' || phase === 'idle') return;
    // Also advance past 666 animation for AI (handled inside resolveAllAiTurns)
    // and past turn_complete for AI

    const t = setTimeout(() => {
      dispatch(resolveAllAiTurns());
    }, animDelay(AI_RESOLVE_DELAY_MS));

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.phase, rw?.currentPlayerIndex]);

  // ── Human 666 animation ───────────────────────────────────────────────────
  // After landing on 666 on a human turn, auto-advance after showing
  // the devil animation (1800 ms). AI 666 is handled by resolveAllAiTurns.
  useEffect(() => {
    if (!rw || rw.phase !== 'six_six_six' || !isHumanTurn) return;
    const t = setTimeout(() => dispatch(advanceFrom666()), animDelay(1800));
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.phase, isHumanTurn]);

  // ── Spin helper ──────────────────────────────────────────────────────────
  const performHumanSpin = useCallback((fromDecision: boolean) => {
    if (!rw || spinning) return;
    if (fromDecision) {
      if (rw.phase !== 'awaiting_decision' || !isHumanTurn) return;
    } else {
      if (rw.phase !== 'awaiting_spin' || !isHumanTurn) return;
    }

    // Pre-compute the target sector (same RNG call that performSpin() will use)
    const targetIdx = pickSectorIndex(rw.seed, rw.rngCallCount);
    const targetAngle = getTargetRotation(wheelAngleRef.current, targetIdx);

    if (fromDecision) {
      // Move from awaiting_decision → awaiting_spin first (sync)
      dispatch(playerSpinAgain());
    }

    setSpinning(true);
    // Start the CSS transition
    setWheelTransitioning(true);
    setWheelAngle(targetAngle);
    wheelAngleRef.current = targetAngle;

    // Dispatch the actual spin after the animation completes (+100ms buffer)
    const spinDur = animDelay(SPIN_DURATION_MS) + 100;
    setTimeout(() => {
      dispatch(performSpin());
      setSpinning(false);
      setWheelTransitioning(false);
    }, spinDur);
  }, [dispatch, rw, isHumanTurn, spinning]);

  const handleHumanSpin = useCallback(() => performHumanSpin(false), [performHumanSpin]);
  const handleSpinAgain = useCallback(() => performHumanSpin(true), [performHumanSpin]);

  // ─────────────────────────────────────────────────────────────────────────
  if (!rw || rw.phase === 'idle') {
    return <div className="rw-root rw-loading"><p>Loading…</p></div>;
  }

  const {
    phase, round, activePlayerIds, roundScores, eliminatedPlayerIds,
    currentSpinCount, lastSectorIndex, last666Effect,
    eliminatedThisRound, winnerId, initialPlayerCount, allPlayerIds,
  } = rw;

  const currentScore = currentId ? (roundScores[currentId] ?? 0) : 0;
  const currentName = currentId ? getName(currentId, participants) : '';
  const sector = lastSectorIndex !== null ? WHEEL_SECTORS[lastSectorIndex] : null;

  // ── Phase: complete ──────────────────────────────────────────────────────
  if (phase === 'complete') {
    const winnerName = winnerId ? getName(winnerId, participants) : '—';
    return (
      <div className="rw-root rw-winner-screen">
        <div className="rw-winner-confetti" aria-hidden="true">
          {['🎉','✨','🏆','⭐','🎊','✨','🎉'].map((e, i) => (
            <span key={i} className="rw-confetti-piece">{e}</span>
          ))}
        </div>
        <div className="rw-winner-crown" aria-hidden="true">🏆</div>
        <h1 className="rw-winner-title">WINNER</h1>
        <p className="rw-winner-name">{winnerName}</p>
        <p className="rw-winner-subtitle">
          won the Risk Wheel {prizeType} Competition!
        </p>
        {standalone && (
          <button className="rw-btn rw-btn--primary" onClick={() => onCompleteRef.current?.()}>
            Continue
          </button>
        )}
      </div>
    );
  }

  // ── Phase: round_summary ─────────────────────────────────────────────────
  if (phase === 'round_summary') {
    const sortedActive = [...activePlayerIds].sort(
      (a, b) => (roundScores[b] ?? 0) - (roundScores[a] ?? 0),
    );
    const isLastRound = round >= 3;
    return (
      <div className="rw-root rw-round-summary">
        <div className="rw-summary-header">
          <span className="rw-summary-round-badge">Round {round}</span>
          <h2 className="rw-summary-title">Results</h2>
        </div>
        <ul className="rw-summary-list" aria-label="Round scoreboard">
          {sortedActive.map((id, rank) => {
            const isOut = eliminatedThisRound.includes(id);
            const score = roundScores[id] ?? 0;
            return (
              <li key={id} className={`rw-summary-row${isOut ? ' rw-summary-row--out' : ''}${rank === 0 ? ' rw-summary-row--top' : ''}`}>
                <span className="rw-summary-rank">#{rank + 1}</span>
                <span className="rw-summary-name">{getName(id, participants)}</span>
                <span className={`rw-summary-score${score < 0 ? ' rw-summary-score--neg' : ''}`}>
                  {formatScore(score)}
                </span>
                {isOut && <span className="rw-summary-badge rw-summary-badge--out" aria-label="Eliminated">🚪 OUT</span>}
                {!isOut && rank === 0 && <span className="rw-summary-badge rw-summary-badge--top">⭐ TOP</span>}
              </li>
            );
          })}
        </ul>
        {eliminatedThisRound.length > 0 && (
          <p className="rw-summary-elim-msg" aria-live="assertive">
            👋{' '}
            {eliminatedThisRound.map((id) => getName(id, participants)).join(', ')}{' '}
            {eliminatedThisRound.length === 1 ? 'has been' : 'have been'} eliminated.
          </p>
        )}
        <button
          className="rw-btn rw-btn--primary rw-btn--lg"
          onClick={() => dispatch(advanceFromRoundSummary())}
        >
          {isLastRound ? '🏆 See Winner' : `▶ Start Round ${round + 1}`}
        </button>
      </div>
    );
  }

  // ── Phase: active turn ───────────────────────────────────────────────────
  const elimCount = computeEliminationCount(initialPlayerCount, round, activePlayerIds.length);
  const isDevil = phase === 'six_six_six';

  // Build score summary for non-current players (mini scoreboard)
  const otherPlayers = allPlayerIds.filter((id) => id !== currentId);

  return (
    <div className={`rw-root rw-game${isDevil ? ' rw-devil-mode' : ''}`}>
      {/* Header */}
      <header className="rw-header">
        <div className="rw-header-left">
          <span className="rw-round-badge" aria-label={`Round ${round} of 3`}>
            R{round}/3
          </span>
          <span className="rw-prize-badge">{prizeType}</span>
        </div>
        {elimCount > 0 && (
          <div className="rw-header-center">
            <span className="rw-elim-warn" aria-label={`${elimCount} player${elimCount === 1 ? '' : 's'} eliminated this round`}>
              ⚠ {elimCount} out this round
            </span>
          </div>
        )}
      </header>

      {/* Main play area */}
      <main className="rw-main" aria-label={`${currentName}'s turn`}>
        {/* Current player info */}
        <div className="rw-current-player">
          <span className="rw-current-label">
            {isHumanTurn ? '🎯 Your turn' : `${currentName}'s turn`}
          </span>
          <ScoreDisplay score={currentScore} animating={!spinning} />
          {/* Spin counter pips */}
          <div className="rw-spins-row" aria-label={`${currentSpinCount} of 3 spins used`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`rw-spin-dot${i < currentSpinCount ? ' rw-spin-dot--used' : ''}`}
                aria-hidden="true"
              />
            ))}
            <span className="rw-spins-label">{currentSpinCount}/3</span>
          </div>
        </div>

        {/* Wheel */}
        <WheelSvg
          rotation={wheelAngle}
          transitioning={wheelTransitioning}
        />

        {/* Result chip */}
        {!spinning && sector && phase !== 'awaiting_spin' && (
          <div
            className={`rw-result-chip${sector.type === 'devil' ? ' rw-result-chip--devil' : sector.type === 'bankrupt' ? ' rw-result-chip--bankrupt' : ''}`}
            aria-live="polite"
          >
            {sector.type === 'bankrupt' && '💀 BANKRUPT — score reset!'}
            {sector.type === 'skip' && '⏭ SKIP — turn ended'}
            {sector.type === 'zero' && '○ Zero — no change'}
            {sector.type === 'points' && (
              <>{(sector.value ?? 0) >= 0 ? '+' : ''}{sector.value} pts</>
            )}
            {sector.type === 'devil' && (
              <>
                😈 666 —{' '}
                {last666Effect === 'add' ? (
                  <span className="rw-666-add">+666 !</span>
                ) : last666Effect === 'subtract' ? (
                  <span className="rw-666-sub">−666 !</span>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* AI status */}
        {!isHumanTurn && (
          <p className="rw-ai-status" aria-live="polite">
            ⚡ Resolving AI turns…
          </p>
        )}

        {/* Action buttons */}
        <div className="rw-actions" aria-live="polite">
          {phase === 'awaiting_spin' && isHumanTurn && (
            <button
              className="rw-btn rw-btn--spin"
              onClick={handleHumanSpin}
              disabled={spinning}
              aria-label="Spin the wheel"
            >
              🎡 Spin
            </button>
          )}

          {phase === 'awaiting_decision' && isHumanTurn && (
            <>
              <button
                className="rw-btn rw-btn--spin"
                onClick={handleSpinAgain}
                disabled={spinning}
                aria-label="Spin again"
              >
                🎡 Spin Again
              </button>
              <button
                className="rw-btn rw-btn--bank"
                onClick={() => dispatch(playerStop())}
                aria-label={`Stop and bank ${currentScore} points`}
              >
                🏦 Stop &amp; Bank{' '}
                <span className="rw-bank-score">{formatScore(currentScore)}</span>
              </button>
            </>
          )}

          {phase === 'turn_complete' && isHumanTurn && (
            <button
              className="rw-btn rw-btn--primary"
              onClick={() => {
                dispatch(advanceFromTurnComplete());
                dispatch(resolveAllAiTurns());
              }}
              aria-label="Continue to next player"
            >
              Continue ▶
            </button>
          )}
        </div>

        {/* Mini scoreboard */}
        {otherPlayers.length > 0 && (
          <div className="rw-mini-scores" aria-label="Other players' scores">
            {otherPlayers.map((id) => {
              const isElim = eliminatedPlayerIds.includes(id);
              const sc = roundScores[id] ?? 0;
              return (
                <span key={id} className={`rw-mini-score-chip${isElim ? ' rw-mini-score-chip--out' : ''}`}>
                  <span className="rw-mini-score-name">{getName(id, participants)}</span>
                  <span className={`rw-mini-score-val${sc < 0 ? ' neg' : ''}`}>
                    {formatScore(sc)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
