import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompetitionSkillProfile } from '../../ai/competition/types';
import { mulberry32 } from '../../store/rng';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  aiDecideStep,
  buildAiNumberChoices,
  completeGame,
  expireTimer,
  finaliseOrderSelection,
  initGlassBridge,
  recordHintUsed,
  recordNumberChoice,
  resetGlassBridge,
  resolveStep,
  selectIsGameOver,
  setHumanSpectating,
  startPlaying,
  type TileSide,
} from '../../features/glassBridge/glassBridgeSlice';
import { resolveGlassBridgeOutcome } from '../../features/glassBridge/thunks';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio';
import MinigameCompleteWrapper from '../../components/MinigameHost/MinigameCompleteWrapper';
import CrystalPathShatteredPixiStage from './CrystalPathShatteredPixiStage';
import {
  chooseSideFromHint,
  computeHintLeftBreakChance,
  getPlacementDetail,
  formatTimeRemaining,
  getAiDecisionDelayMs,
  getHintUses,
  getNextPlaybackSpeed,
  getSafeSequenceMs,
  getTimeoutCollapseDuration,
  getWrongSequenceMs,
  ORDER_AI_PICK_FAST_MS,
  ORDER_AI_PICK_SLOW_MS,
  ORDER_REVEAL_DELAY_MS,
  REVEAL_STAGGER_MS,
  REVEAL_TO_PLAY_DELAY_MS,
  STEP_SUSPENSE_DELAY_MS,
  type CrystalPathShatteredAnimation,
} from './crystalPathShatteredLogic';
import './crystalPathShattered.css';

const TIMER_UPDATE_INTERVAL_MS = 250;
const MIN_TIMER_UPDATE_INTERVAL_MS = 120;
const AI_HINT_BASE_PROBABILITY = 0.18;
const AI_HINT_DEPTH_PROGRESSION = 0.34;
const AI_HINT_MAX_PROBABILITY = 0.62;

interface ParticipantInput {
  id: string;
  name: string;
  isHuman: boolean;
  competitionProfile?: CompetitionSkillProfile;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantInput[];
  prizeType?: 'LOH' | 'POS';
  seed?: number;
  onComplete?: () => void;
}

export default function CrystalPathShatteredGame({
  participantIds,
  participants,
  prizeType = 'LOH',
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const gb = useAppSelector((state) => state.glassBridge);
  const sessionSeed = useMemo(() => (seed === 0 || seed === undefined ? cryptoSeed() : seed), [seed]);
  const aiRngRef = useRef(mulberry32(sessionSeed + 2_001));
  const timersRef = useRef<number[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<CrystalPathShatteredAnimation | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [showSpectatorModal, setShowSpectatorModal] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 3>(1);
  const [remainingMs, setRemainingMs] = useState(0);
  const [rowHintCounts, setRowHintCounts] = useState<Record<string, number>>({});
  const { playSafeStep, playDeath, playWinner, playNewTurn } = useGlassBridgeAudio(true);

  const activePlayerId = gb.turnOrder[gb.currentTurnIndex] ?? null;
  const activePlayer = gb.participants.find((participant) => participant.id === activePlayerId) ?? null;
  const humanId = gb.humanPlayerId;
  const humanProgress = humanId ? gb.progress[humanId] : undefined;
  const hintUses = getHintUses(humanProgress?.hintPenaltyMs);
  const isHumanTurn = gb.phase === 'playing' && activePlayerId !== null && Boolean(activePlayer?.isHuman);
  const isResolving = activeAnimation !== null;
  const inputEnabled = isHumanTurn && !isResolving && !showSpectatorModal && !gb.timerExpired;

  const participantsById = useMemo(
    () => new Map(gb.participants.map((participant) => [participant.id, participant])),
    [gb.participants],
  );

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }, []);

  const queueTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(callback, delayMs);
    timersRef.current.push(timeoutId);
    return timeoutId;
  }, []);

  const handleStepChoice = useCallback((chosenSide: TileSide, playerId = activePlayerId) => {
    if (!playerId) return;
    const rowIndex = gb.currentPlayerRow - 1;
    const row = gb.rows[rowIndex];
    if (!row) return;
    const wrong = chosenSide !== row.safeSide;
    const startedAt = Date.now();

    setHintText(null);
    setActiveAnimation({
      type: wrong ? 'wrong' : 'safe',
      side: chosenSide,
      rowIndex,
      playerId,
      startedAt,
    });

    queueTimeout(() => {
      dispatch(resolveStep({ chosenSide, now: Date.now() }));
      if (wrong) {
        playDeath();
        if (playerId === humanId) {
          dispatch(setHumanSpectating(true));
          setShowSpectatorModal(true);
        }
      } else {
        playSafeStep();
        if (gb.currentPlayerRow >= gb.rowsCount) {
          playWinner();
        }
      }
    }, STEP_SUSPENSE_DELAY_MS / playbackSpeed);

    queueTimeout(() => {
      setActiveAnimation(null);
    }, (wrong ? getWrongSequenceMs() : getSafeSequenceMs()) / playbackSpeed);
  }, [activePlayerId, dispatch, gb.currentPlayerRow, gb.rows, gb.rowsCount, humanId, playDeath, playSafeStep, playWinner, playbackSpeed, queueTimeout]);

  const initConfigRef = useRef({
    participantIds,
    participants,
    competitionType: prizeType,
    seed: sessionSeed,
  });

  useEffect(() => {
    dispatch(initGlassBridge(initConfigRef.current));
    return () => {
      clearTimers();
      dispatch(resetGlassBridge());
    };
  }, [clearTimers, dispatch]);

  useEffect(() => {
    if (gb.phase !== 'order_selection') return undefined;
    const allChosen = Object.keys(gb.chosenNumbers).length === participantIds.length;
    if (allChosen) {
      const finalizeDelay = window.setTimeout(() => {
        dispatch(finaliseOrderSelection());
      }, ORDER_REVEAL_DELAY_MS);
      return () => window.clearTimeout(finalizeDelay);
    }

    const aiChoices = buildAiNumberChoices(
      participantIds,
      humanId,
      gb.chosenNumbers,
      aiRngRef.current,
    );
    const nextAi = Object.entries(aiChoices).find(([playerId]) => gb.chosenNumbers[playerId] === undefined);
    if (!nextAi) return undefined;

    const [playerId, choice] = nextAi;
    const humanHasChosen = humanId ? gb.chosenNumbers[humanId] !== undefined : true;
    const delay = humanHasChosen ? ORDER_AI_PICK_FAST_MS : ORDER_AI_PICK_SLOW_MS;
    const timerId = window.setTimeout(() => {
      dispatch(recordNumberChoice({ playerId, number: choice }));
    }, delay / playbackSpeed);
    return () => window.clearTimeout(timerId);
  }, [dispatch, gb.chosenNumbers, gb.phase, humanId, participantIds, playbackSpeed]);

  useEffect(() => {
    if (gb.phase !== 'order_reveal') return undefined;
    const timerId = window.setTimeout(() => {
      dispatch(startPlaying({ now: Date.now() }));
    }, (REVEAL_TO_PLAY_DELAY_MS + gb.turnOrder.length * REVEAL_STAGGER_MS) / playbackSpeed);
    return () => window.clearTimeout(timerId);
  }, [dispatch, gb.phase, gb.turnOrder.length, playbackSpeed]);

  useEffect(() => {
    if (gb.phase !== 'playing' || gb.challengeStartTimeMs === null || gb.globalTimeLimitMs <= 0 || gb.timerExpired) return undefined;

    const updateRemaining = () => {
      const elapsed = Date.now() - gb.challengeStartTimeMs!;
      const nextRemaining = Math.max(0, gb.globalTimeLimitMs - elapsed);
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) {
        dispatch(expireTimer());
      }
    };

    updateRemaining();
    const intervalId = window.setInterval(
      updateRemaining,
      Math.max(MIN_TIMER_UPDATE_INTERVAL_MS, TIMER_UPDATE_INTERVAL_MS / playbackSpeed),
    );
    return () => window.clearInterval(intervalId);
  }, [dispatch, gb.challengeStartTimeMs, gb.globalTimeLimitMs, gb.phase, gb.timerExpired, playbackSpeed]);

  useEffect(() => {
    if (gb.phase === 'playing' && gb.timerExpired && !isResolving) {
      const timerId = window.setTimeout(() => {
        dispatch(completeGame());
      }, getTimeoutCollapseDuration(gb.rowsCount) / playbackSpeed);
      return () => window.clearTimeout(timerId);
    }
    return undefined;
  }, [dispatch, gb.phase, gb.rowsCount, gb.timerExpired, isResolving, playbackSpeed]);

  useEffect(() => {
    if (gb.phase !== 'playing' || isResolving || gb.timerExpired || !activePlayerId || activePlayer?.isHuman) {
      return undefined;
    }

    const row = gb.rows[gb.currentPlayerRow - 1];
    if (!row) return undefined;

    const aiProfile = activePlayer?.competitionProfile;
    const shouldUseHint = activePlayerId in gb.progress
      && getHintUses(gb.progress[activePlayerId]?.hintPenaltyMs) < 3
      && row.revealedSafeSide === null
      && !row.leftBroken
      && !row.rightBroken
      && aiRngRef.current() < Math.min(
        AI_HINT_MAX_PROBABILITY,
        AI_HINT_BASE_PROBABILITY
          + ((gb.currentPlayerRow - 1) / Math.max(1, gb.rowsCount - 1)) * AI_HINT_DEPTH_PROGRESSION,
      );

    const choose = () => {
      const sameRowHintCount = getHintUses(gb.progress[activePlayerId]?.hintPenaltyMs) + 1;
      if (shouldUseHint) {
        dispatch(recordHintUsed({ playerId: activePlayerId }));
        return chooseSideFromHint(row.safeSide, sameRowHintCount, aiRngRef.current);
      }
      return aiDecideStep(row, aiRngRef.current, aiProfile);
    };

    const chosenSide = choose();
    const delay = getAiDecisionDelayMs(row, aiRngRef.current) / playbackSpeed;
    const timerId = window.setTimeout(() => {
      handleStepChoice(chosenSide, activePlayerId);
    }, delay);
    return () => window.clearTimeout(timerId);
  }, [activePlayer, activePlayerId, dispatch, gb.currentPlayerRow, gb.phase, gb.progress, gb.rows, gb.rowsCount, gb.timerExpired, handleStepChoice, isResolving, playbackSpeed]);

  useEffect(() => {
    if (gb.phase === 'playing' && !isResolving && !gb.timerExpired && selectIsGameOver(gb)) {
      dispatch(completeGame());
    }
  }, [dispatch, gb, isResolving]);

  useEffect(() => {
    if (gb.phase === 'playing' && activePlayerId && !isResolving) {
      playNewTurn();
    }
  }, [activePlayerId, gb.phase, isResolving, playNewTurn]);

  const handleNumberPick = useCallback((number: number) => {
    if (!humanId || gb.phase !== 'order_selection' || gb.chosenNumbers[humanId] !== undefined) return;
    dispatch(recordNumberChoice({ playerId: humanId, number }));
  }, [dispatch, gb.chosenNumbers, gb.phase, humanId]);

  const handleHint = useCallback(() => {
    if (!humanId || !isHumanTurn || isResolving || hintUses >= 3) return;
    const rowIndex = gb.currentPlayerRow - 1;
    const row = gb.rows[rowIndex];
    if (!row) return;
    const key = `${humanId}:${rowIndex}`;
    const nextCount = (rowHintCounts[key] ?? 0) + 1;
    const leftBreakChance = computeHintLeftBreakChance(row.safeSide, nextCount);
    dispatch(recordHintUsed({ playerId: humanId }));
    setRowHintCounts((current) => ({ ...current, [key]: nextCount }));
    setHintText(`The chamber whispers: ${leftBreakChance}% chance the LEFT tile breaks.`);
  }, [dispatch, gb.currentPlayerRow, gb.rows, hintUses, humanId, isHumanTurn, isResolving, rowHintCounts]);

  const statusText = useMemo(() => {
    if (gb.timerExpired) {
      return 'Time has expired. The crystal path is collapsing into the void.';
    }
    if (gb.phase === 'order_selection') {
      return 'Draw numbers to decide who steps first.';
    }
    if (gb.phase === 'order_reveal') {
      return 'The draw is locked. The chamber reveals who crosses first.';
    }
    if (gb.phase === 'complete') {
      return 'The chamber has judged the final crossing order.';
    }
    if (activePlayerId) {
      return activePlayerId === humanId
        ? 'Choose a crystal platform.'
        : `${participantsById.get(activePlayerId)?.name ?? 'A player'} is choosing.`;
    }
    return 'The suspended crystal path hums above the abyss.';
  }, [activePlayerId, gb.phase, gb.timerExpired, humanId, participantsById]);

  const displayedRemainingMs = gb.phase === 'playing' ? remainingMs : gb.globalTimeLimitMs;
  const turnLabel = activePlayerId
    ? activePlayerId === humanId
      ? 'You'
      : (participantsById.get(activePlayerId)?.name ?? '—')
    : '—';
  const guidanceText = hintText ?? (
    gb.phase === 'order_selection'
      ? 'Secure your draw quickly so the bridge remains the focal point.'
      : gb.phase === 'order_reveal'
        ? 'The chamber is revealing the crossing order.'
        : 'The active row breathes with light. Tap a crystal tile when you are ready to commit.'
  );
  const showPreludePanel = gb.phase === 'order_selection' || gb.phase === 'order_reveal';

  return (
    <div className="crystal-shattered-shell" aria-label="Crystal Path: Shattered">
      <header className="crystal-shattered-header">
        <div className="crystal-shattered-title-block">
          <p className="crystal-shattered-kicker">Premium Pixi Edition</p>
          <h2>Crystal Path: Shattered</h2>
          <p className="crystal-shattered-subtitle">A glass bridge hangs in a dark theatrical chamber.</p>
        </div>
      </header>
      <div className="crystal-shattered-hud-row" role="group" aria-label="Crystal Path status">
        <div className="crystal-shattered-hud-pill">
          <span>Turn</span>
          <strong>{turnLabel}</strong>
        </div>
        <div className="crystal-shattered-hud-pill">
          <span>Time</span>
          <strong aria-label="Time remaining">{formatTimeRemaining(displayedRemainingMs)}</strong>
        </div>
        <div className="crystal-shattered-hud-pill">
          <span>Hints</span>
          <strong>{Math.max(0, 3 - hintUses)} left</strong>
        </div>
      </div>

      {gb.phase === 'complete' ? (
        <MinigameCompleteWrapper
          className="crystal-shattered-complete"
          onContinue={() => {
            dispatch(resolveGlassBridgeOutcome());
            onComplete?.();
          }}
          continueButtonClassName="crystal-shattered-primary"
          placementsClassName="crystal-shattered-placement-list"
          placementsRole="list"
          placementsAriaLabel="Final placements"
          placementsNode={gb.placements.map((playerId, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const name = playerId === humanId ? 'You' : (participantsById.get(playerId)?.name ?? playerId);
            return (
              <div key={playerId} className="crystal-shattered-placement" role="listitem">
                <span>{medal}</span>
                <span>{name}</span>
                <span>{getPlacementDetail(gb.progress[playerId])}</span>
              </div>
            );
          })}
        >
          <div className="crystal-shattered-complete-hero">
            <p className="crystal-shattered-kicker">Chamber resolved</p>
            <h2>Path Complete</h2>
            <div className="crystal-shattered-trophy" aria-hidden="true">💠</div>
            {gb.winnerId && <p>{gb.winnerId === humanId ? 'You endured the shattered path.' : `${participantsById.get(gb.winnerId)?.name ?? gb.winnerId} endured the shattered path.`}</p>}
          </div>
        </MinigameCompleteWrapper>
      ) : (
        <>
          <section className="crystal-shattered-board-layout">
            {showPreludePanel && (
              <section className={`crystal-shattered-prelude${gb.phase === 'order_reveal' ? ' is-reveal' : ''}`}>
                {gb.phase === 'order_selection' ? (
                  <>
                    <div className="crystal-shattered-prelude-copy">
                      <span className="crystal-shattered-prelude-label">Crystal draw</span>
                      <h3>Choose your crossing number</h3>
                      <p>Lock your place and cross.</p>
                    </div>
                    <div className="crystal-shattered-number-grid">
                      {Array.from({ length: participantIds.length }, (_, index) => index + 1).map((number) => {
                        const taken = Object.values(gb.chosenNumbers).includes(number);
                        return (
                          <button
                            key={number}
                            type="button"
                            className="crystal-shattered-number"
                            disabled={taken || !humanId || gb.chosenNumbers[humanId] !== undefined}
                            onClick={() => handleNumberPick(number)}
                            aria-label={`Pick number ${number}`}
                          >
                            {number}
                          </button>
                        );
                      })}
                    </div>
                    <div className="crystal-shattered-draw-summary">
                      {participantIds.map((playerId) => (
                        <span key={playerId} className="crystal-shattered-draw-pill">
                          <strong>{playerId === humanId ? 'You' : (participantsById.get(playerId)?.name ?? playerId)}</strong>
                          <em>{gb.chosenNumbers[playerId] ?? '…'}</em>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="crystal-shattered-prelude-copy">
                      <span className="crystal-shattered-prelude-label">Order reveal</span>
                      <h3>The chamber locks the crossing order</h3>
                    </div>
                    <div className="crystal-shattered-order-list">
                      {gb.turnOrder.map((playerId, index) => (
                        <div key={playerId} className="crystal-shattered-order-item" style={{ animationDelay: `${index * 90}ms` }}>
                          <span>{index + 1}</span>
                          <strong>{playerId === humanId ? 'You' : (participantsById.get(playerId)?.name ?? playerId)}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            <section className="crystal-shattered-board-panel">
              <div className="crystal-shattered-board-chrome">
                <div className="crystal-shattered-status" role="status">
                  <span className="crystal-shattered-status-label">Chamber status</span>
                  <strong>{statusText}</strong>
                </div>
                <div className="crystal-shattered-toolbar-actions">
                  <button
                    type="button"
                    className="crystal-shattered-secondary"
                    onClick={handleHint}
                    disabled={!isHumanTurn || isResolving || hintUses >= 3 || showSpectatorModal}
                  >
                    Seek guidance ({Math.max(0, 3 - hintUses)} left)
                  </button>
                  {gb.humanSpectating && (
                    <button
                      type="button"
                      className="crystal-shattered-secondary"
                      onClick={() => setPlaybackSpeed((current) => getNextPlaybackSpeed(current))}
                    >
                      Spectator {playbackSpeed}×
                    </button>
                  )}
                </div>
              </div>

              <CrystalPathShatteredPixiStage
                phase={gb.phase}
                rows={gb.rows}
                rowsCount={gb.rowsCount}
                currentPlayerRow={gb.currentPlayerRow}
                currentTurnIndex={gb.currentTurnIndex}
                turnOrder={gb.turnOrder}
                participants={gb.participants}
                progress={gb.progress}
                humanId={humanId}
                inputEnabled={inputEnabled}
                activeAnimation={activeAnimation}
                onTileSelect={(side) => {
                  if (!inputEnabled) return;
                  handleStepChoice(side);
                }}
              />

              <div className="crystal-shattered-board-footer">
                <div className="crystal-shattered-guidance">
                  <span className="crystal-shattered-guidance-label">Guidance</span>
                  <p>{guidanceText}</p>
                </div>
              </div>
            </section>
          </section>

          <section className="crystal-shattered-scoreboard" aria-label="Player standings">
            {gb.participants.map((participant) => {
              const progress = gb.progress[participant.id];
              const isActive = participant.id === activePlayerId;
              return (
                <article key={participant.id} className={`crystal-shattered-score-card${isActive ? ' is-active' : ''}`}>
                  <header>
                    <strong>{participant.id === humanId ? 'You' : participant.name}</strong>
                    <span>{progress?.eliminated ? 'Fallen' : progress?.finishTimeMs !== undefined ? 'Finished' : isActive ? 'Acting' : 'Waiting'}</span>
                  </header>
                  <p>{getPlacementDetail(progress)}</p>
                </article>
              );
            })}
          </section>

          {showSpectatorModal && (
            <div className="crystal-shattered-modal" role="dialog" aria-modal="true" aria-label="Eliminated">
              <div className="crystal-shattered-modal-card">
                <div className="crystal-shattered-modal-icon" aria-hidden="true">❄️</div>
                <h3>You slipped from the crystal path.</h3>
                <p>Your fall is visible below the broken platform. Keep watching or jump straight to the result.</p>
                <div className="crystal-shattered-modal-actions">
                  <button
                    type="button"
                    className="crystal-shattered-secondary"
                    onClick={() => {
                      setShowSpectatorModal(false);
                      dispatch(setHumanSpectating(true));
                    }}
                  >
                    Continue watching
                  </button>
                  <button
                    type="button"
                    className="crystal-shattered-primary"
                    onClick={() => {
                      setShowSpectatorModal(false);
                      dispatch(completeGame());
                    }}
                  >
                    Skip to result
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
