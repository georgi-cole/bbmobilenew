/**
 * RiskWheelComp — Full-screen multi-round wheel competition component.
 *
 * Rendered by MinigameHost when reactComponentKey === 'RiskWheel'.
 * Also used standalone from RiskWheelTestPage.
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
  aiDecide,
  advanceFromTurnComplete,
  advanceFromRoundSummary,
  markRiskWheelOutcomeResolved,
  WHEEL_SECTORS,
  computeEliminationCount,
  type RiskWheelCompetitionType,
} from '../../features/riskWheel/riskWheelSlice';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './RiskWheelComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_ACTION_DELAY_MS = 900;
const AI_RESULT_DELAY_MS = 700;

function areAnimationsDisabled(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function animDelay(ms: number): number {
  return areAnimationsDisabled() ? 0 : ms;
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

function getSectorColour(sectorIndex: number | null): string {
  if (sectorIndex === null) return '#4a5568';
  const s = WHEEL_SECTORS[sectorIndex];
  if (s.type === 'bankrupt') return '#991b1b';
  if (s.type === 'devil') return '#7c3aed';
  if (s.type === 'skip') return '#92400e';
  if (s.type === 'zero') return '#374151';
  if (s.type === 'points' && (s.value ?? 0) < 0) return '#b91c1c';
  if (s.type === 'points' && (s.value ?? 0) >= 500) return '#d97706';
  if (s.type === 'points' && (s.value ?? 0) >= 100) return '#065f46';
  return '#1d4ed8';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreDisplay({ score, animating }: { score: number; animating?: boolean }) {
  const cls = `rw-score-value${animating ? ' rw-score-bump' : ''}`;
  const colour = score < 0 ? '#ef4444' : score === 0 ? '#9ca3af' : '#34d399';
  return (
    <span className={cls} style={{ color: colour }}>
      {score}
    </span>
  );
}

function PlayerTile({
  name,
  score,
  isActive,
  isEliminated,
  spinCount,
  maxSpins,
}: {
  id: string;
  name: string;
  score: number;
  isActive: boolean;
  isEliminated: boolean;
  spinCount?: number;
  maxSpins?: number;
}) {
  return (
    <div
      className={`rw-player-tile${isActive ? ' rw-player-tile--active' : ''}${isEliminated ? ' rw-player-tile--eliminated' : ''}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <span className="rw-player-name">{name}</span>
      <ScoreDisplay score={score} animating={isActive} />
      {isActive && spinCount !== undefined && maxSpins !== undefined && (
        <span className="rw-spin-pips" aria-label={`${spinCount} of ${maxSpins} spins used`}>
          {Array.from({ length: maxSpins }, (_, i) => (
            <span key={i} className={`rw-spin-pip${i < spinCount ? ' rw-spin-pip--used' : ''}`} />
          ))}
        </span>
      )}
      {isEliminated && <span className="rw-eliminated-badge">OUT</span>}
    </div>
  );
}

function WheelDisplay({ sectorIndex, spinning }: { sectorIndex: number | null; spinning: boolean }) {
  const sector = sectorIndex !== null ? WHEEL_SECTORS[sectorIndex] : null;
  const colour = getSectorColour(sectorIndex);
  return (
    <div className={`rw-wheel-display${spinning ? ' rw-wheel-display--spinning' : ''}`}>
      <div
        className="rw-wheel-face"
        style={{ background: spinning ? undefined : colour }}
        aria-label={spinning ? 'Wheel spinning…' : (sector?.label ?? 'Wheel')}
      >
        {spinning ? (
          <span className="rw-wheel-spinner-icon" aria-hidden="true">⚙</span>
        ) : sector ? (
          <span className="rw-wheel-label">{sector.label}</span>
        ) : (
          <span className="rw-wheel-label">?</span>
        )}
      </div>
    </div>
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Outcome resolved callback ────────────────────────────────────────────
  useEffect(() => {
    if (!rw || rw.phase !== 'complete' || rw.outcomeResolved || standalone) return;
    dispatch(markRiskWheelOutcomeResolved());
    // onComplete is called after marking resolved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.phase, rw?.outcomeResolved]);

  useEffect(() => {
    if (!rw || rw.phase !== 'complete' || !rw.outcomeResolved || standalone) return;
    onCompleteRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.outcomeResolved]);

  const currentId = rw?.activePlayerIds[rw.currentPlayerIndex] ?? null;
  const humanId = rw?.humanPlayerId ?? null;
  const isHumanTurn = currentId !== null && currentId === humanId;

  // ── AI automation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rw || spinning) return;
    const { phase } = rw;
    let t2: ReturnType<typeof setTimeout> | undefined;

    if (phase === 'awaiting_spin' && !isHumanTurn) {
      const t = setTimeout(() => {
        setSpinning(true);
        const dur = animDelay(900);
        t2 = setTimeout(() => {
          dispatch(performSpin());
          setSpinning(false);
        }, dur);
      }, animDelay(AI_ACTION_DELAY_MS));
      return () => {
        clearTimeout(t);
        if (t2 !== undefined) {
          clearTimeout(t2);
        }
      };
    }

    if (phase === 'six_six_six') {
      const t = setTimeout(() => dispatch(advanceFrom666()), animDelay(1800));
      return () => clearTimeout(t);
    }

    if (phase === 'awaiting_decision' && !isHumanTurn) {
      const t = setTimeout(() => dispatch(aiDecide()), animDelay(AI_ACTION_DELAY_MS));
      return () => clearTimeout(t);
    }

    if (phase === 'turn_complete' && !isHumanTurn) {
      const t = setTimeout(() => dispatch(advanceFromTurnComplete()), animDelay(AI_RESULT_DELAY_MS));
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw?.phase, rw?.currentPlayerIndex, isHumanTurn, spinning]);

  // ── Human spin ───────────────────────────────────────────────────────────
  const handleHumanSpin = useCallback(() => {
    if (!rw || rw.phase !== 'awaiting_spin' || !isHumanTurn || spinning) return;
    setSpinning(true);
    const dur = animDelay(900);
    setTimeout(() => {
      dispatch(performSpin());
      setSpinning(false);
    }, dur);
  }, [dispatch, rw, isHumanTurn, spinning]);

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
        <h2 className="rw-summary-title">Round {round} Results</h2>
        <ul className="rw-summary-list" aria-label="Round scoreboard">
          {sortedActive.map((id) => {
            const isOut = eliminatedThisRound.includes(id);
            return (
              <li key={id} className={`rw-summary-row${isOut ? ' rw-summary-row--out' : ''}`}>
                <span className="rw-summary-name">{getName(id, participants)}</span>
                <span className="rw-summary-score">{roundScores[id] ?? 0}</span>
                {isOut && <span className="rw-summary-badge" aria-label="Eliminated">ELIMINATED</span>}
              </li>
            );
          })}
        </ul>
        {eliminatedThisRound.length > 0 && (
          <p className="rw-summary-elim-msg" aria-live="assertive">
            {eliminatedThisRound.map((id) => getName(id, participants)).join(', ')}{' '}
            {eliminatedThisRound.length === 1 ? 'has been' : 'have been'} eliminated.
          </p>
        )}
        <button
          className="rw-btn rw-btn--primary"
          onClick={() => dispatch(advanceFromRoundSummary())}
        >
          {isLastRound ? 'See Winner' : `Start Round ${round + 1}`}
        </button>
      </div>
    );
  }

  // ── Phase: active turn ───────────────────────────────────────────────────
  const elimCount = computeEliminationCount(initialPlayerCount, round, activePlayerIds.length);

  return (
    <div className={`rw-root rw-game${phase === 'six_six_six' ? ' rw-devil-mode' : ''}`}>
      {/* Header */}
      <header className="rw-header">
        <span className="rw-round-badge" aria-label={`Round ${round} of 3`}>
          Round {round} / 3
        </span>
        <span className="rw-prize-badge">{prizeType}</span>
        {elimCount > 0 && (
          <span className="rw-elim-warn" aria-label={`${elimCount} player${elimCount === 1 ? '' : 's'} eliminated this round`}>
            ⚠ {elimCount} out this round
          </span>
        )}
      </header>

      {/* Main play area */}
      <main className="rw-main" aria-label={`${currentName}'s turn`}>
        <div className="rw-current-player">
          <span className="rw-current-label">
            {isHumanTurn ? 'Your turn' : `${currentName}'s turn`}
          </span>
          <ScoreDisplay score={currentScore} animating={true} />
        </div>

        <WheelDisplay
          sectorIndex={spinning ? null : lastSectorIndex}
          spinning={spinning}
        />

        {/* Result chip */}
        {!spinning && sector && phase !== 'awaiting_spin' && (
          <div
            className={`rw-result-chip${sector.type === 'devil' ? ' rw-result-chip--devil' : ''}`}
            aria-live="polite"
          >
            {sector.type === 'bankrupt' && '💀 BANKRUPT — score reset!'}
            {sector.type === 'skip' && '⏭ SKIP — turn ended'}
            {sector.type === 'zero' && '○ Zero — no change'}
            {sector.type === 'points' && (
              <>{(sector.value ?? 0) >= 0 ? '+' : ''}{sector.value} points</>
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

        {/* Spin counter dots */}
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
                onClick={() => dispatch(playerSpinAgain())}
                aria-label="Spin again"
              >
                Spin Again
              </button>
              <button
                className="rw-btn rw-btn--bank"
                onClick={() => dispatch(playerStop())}
                aria-label={`Stop and bank ${currentScore} points`}
              >
                Stop &amp; Bank <span className="rw-bank-score">{currentScore}</span>
              </button>
            </>
          )}

          {phase === 'turn_complete' && isHumanTurn && (
            <button
              className="rw-btn rw-btn--primary"
              onClick={() => dispatch(advanceFromTurnComplete())}
              aria-label="Continue to next player"
            >
              Continue
            </button>
          )}

          {!isHumanTurn && (
            <p className="rw-ai-waiting" aria-live="polite">
              {(phase === 'awaiting_spin' || spinning) && `${currentName} is spinning…`}
              {phase === 'awaiting_decision' && `${currentName} is deciding…`}
              {phase === 'turn_complete' && `${currentName}'s turn ended.`}
              {phase === 'six_six_six' && `${currentName} landed 666!`}
            </p>
          )}
        </div>
      </main>

      {/* Roster sidebar */}
      <aside className="rw-roster" aria-label="Players">
        {allPlayerIds.map((id) => {
          const isCurrent = id === currentId && activePlayerIds.includes(id);
          const isElim = eliminatedPlayerIds.includes(id);
          return (
            <PlayerTile
              key={id}
              id={id}
              name={getName(id, participants)}
              score={roundScores[id] ?? 0}
              isActive={isCurrent}
              isEliminated={isElim}
              spinCount={isCurrent ? currentSpinCount : undefined}
              maxSpins={isCurrent ? 3 : undefined}
            />
          );
        })}
      </aside>
    </div>
  );
}
