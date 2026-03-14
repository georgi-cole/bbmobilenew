/**
 * GlassBridgeComp — "Glass Bridge — Brutal Mode" elimination minigame.
 *
 * Players cross a bridge of paired glass tiles one row at a time.
 * One wrong choice = elimination.  Broken tiles persist for later players.
 * Winner is determined by fastest completion or furthest progress.
 *
 * Phases (driven by Redux state):
 *   order_selection  — Players pick unique numbers; AI auto-picks.
 *   order_reveal     — Shuffled order displayed with animation.
 *   playing          — Sequential turn-based bridge crossing.
 *   complete         — Final rankings shown; onComplete fires.
 *
 * Human flow:
 *   - Pick a number during order selection.
 *   - During your turn: tap the highlighted tile in the active row to step.
 *   - If eliminated: spectator modal offers "Continue Watching" or "Skip to Result".
 *
 * AI flow:
 *   - Auto-picks order numbers.
 *   - Auto-steps with realistic delay using decision logic from glassBridgeSlice.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initGlassBridge,
  recordNumberChoice,
  finaliseOrderSelection,
  startPlaying,
  resolveStep,
  expireTimer,
  completeGame,
  setHumanSpectating,
  resetGlassBridge,
  buildAiNumberChoices,
  aiDecideStep,
  selectActivePlayerId,
  selectIsGameOver,
  type TileSide,
} from '../../features/glassBridge/glassBridgeSlice';
import { resolveGlassBridgeOutcome } from '../../features/glassBridge/thunks';
import { mulberry32 } from '../../store/rng';
import { getDicebear } from '../../utils/avatar';
import './GlassBridgeComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Delay after order selection complete before revealing. */
const ORDER_REVEAL_DELAY_MS = 600;
/** Delay per item in the order reveal animation (staggered). */
const REVEAL_STAGGER_MS = 350;
/** Auto-advance from reveal to playing (after all items shown). */
const REVEAL_TO_PLAY_DELAY_MS = 1_800;
/** Base delay before AI takes a step (ms). */
const AI_STEP_DELAY_MS = 900;
/** Additional random delay range for AI (ms). */
const AI_STEP_JITTER_MS = 800;
/** Shatter animation duration (ms). Aligned with CSS animation. */
const SHATTER_ANIM_MS = 400;
/** Pause after shatter before advancing turn. */
const POST_SHATTER_DELAY_MS = 300;
/** Suspense pause after selecting a tile before the outcome resolves. */
const STEP_SUSPENSE_DELAY_MS = 260;
/** Auto-advance on complete screen (ms). */
const COMPLETE_AUTO_ADVANCE_MS = 3_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avatarForId(id: string): string {
  return getDicebear(id);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

function formatTimeRemaining(remaining: number): string {
  if (remaining <= 0) return '0:00';
  return formatElapsed(remaining);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GlassBridgeCompetitionType {
  prizeType?: 'HOH' | 'POV';
}

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType?: 'HOH' | 'POV';
  seed: number;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlassBridgeComp({
  participantIds,
  participants,
  prizeType = 'HOH',
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const gb = useAppSelector((s: RootState) => s.glassBridge);

  // ── Resolve human player id ───────────────────────────────────────────────
  const humanId = useMemo(() => {
    const humanPart = participants?.find(p => p.isHuman);
    if (humanPart) return humanPart.id;
    if (participantIds.includes('user')) return 'user';
    return null;
  }, [participantIds, participants]);

  const getName = useCallback(
    (id: string): string => {
      const part = participants?.find(p => p.id === id);
      if (part) return part.name;
      if (id === 'user') return 'You';
      return id;
    },
    [participants],
  );

  // ── Local UI state ────────────────────────────────────────────────────────
  const [showSpectatorModal, setShowSpectatorModal] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [pendingStep, setPendingStep] = useState<{
    actorId: string;
    rowIdx: number;
    side: TileSide;
    isBreak: boolean;
  } | null>(null);
  const [shatteringTile, setShatteringTile] = useState<{
    rowIdx: number;
    side: TileSide;
  } | null>(null);
  const [showEliminationFlash, setShowEliminationFlash] = useState(false);
  const [showScreenShake, setShowScreenShake] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState<number>(gb.globalTimeLimitMs);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const timerIntervalRef = useRef<number | null>(null);
  const aiStepTimerRef = useRef<number | null>(null);
  const autoAdvanceRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const pendingStepRef = useRef<number | null>(null);
  const shatterResolveRef = useRef<number | null>(null);
  const flashResetRef = useRef<number | null>(null);
  const initParamsRef = useRef({ participantIds, prizeType, seed, humanId, participants });

  // Stable RNG for AI step timing (different sub-seed so it doesn't affect bridge layout).
  const aiRngRef = useRef(mulberry32(seed + 9999));

  function clearAllTimers() {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (aiStepTimerRef.current !== null) {
      window.clearTimeout(aiStepTimerRef.current);
      aiStepTimerRef.current = null;
    }
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (pendingStepRef.current !== null) {
      window.clearTimeout(pendingStepRef.current);
      pendingStepRef.current = null;
    }
    if (shatterResolveRef.current !== null) {
      window.clearTimeout(shatterResolveRef.current);
      shatterResolveRef.current = null;
    }
    if (flashResetRef.current !== null) {
      window.clearTimeout(flashResetRef.current);
      flashResetRef.current = null;
    }
  }

  // ── 1. Initialize on mount ────────────────────────────────────────────────
  useEffect(() => {
    const { participantIds: pIds, prizeType: pt, seed: s, humanId: hId, participants: parts } =
      initParamsRef.current;
    dispatch(
      initGlassBridge({
        participantIds: pIds,
        participants: parts?.map(p => ({ ...p, isHuman: p.isHuman })),
        competitionType: pt ?? 'HOH',
        seed: s,
        humanPlayerId: hId,
      }),
    );
    return () => {
      clearAllTimers();
      dispatch(resetGlassBridge());
    };
  }, [dispatch]);

  // ── 2. Order selection: AI auto-picks ────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'order_selection') return;

    const aiRng = mulberry32(seed + 100);
    const aiChoices = buildAiNumberChoices(
      gb.participants.map(p => p.id),
      humanId,
      gb.chosenNumbers,
      aiRng,
    );

    for (const [playerId, number] of Object.entries(aiChoices)) {
      dispatch(recordNumberChoice({ playerId, number }));
    }

    // If human has no choice to make (not present), finalise immediately.
    if (!humanId) {
      // Brief delay for UX even in AI-only games.
      revealTimerRef.current = window.setTimeout(() => {
        dispatch(finaliseOrderSelection());
      }, ORDER_REVEAL_DELAY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase]);

  // ── 3. When all numbers chosen (including human), finalise ───────────────
  useEffect(() => {
    if (gb.phase !== 'order_selection') return;
    if (!humanId) return; // handled above
    const totalChosen = Object.keys(gb.chosenNumbers).length;
    const total = gb.participants.length;
    if (totalChosen < total) return;
    revealTimerRef.current = window.setTimeout(() => {
      dispatch(finaliseOrderSelection());
    }, ORDER_REVEAL_DELAY_MS);
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase, gb.chosenNumbers, gb.participants.length, humanId]);

  // ── 4. Order reveal animation ─────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'order_reveal') {
      setRevealedCount(0);
      return;
    }

    let count = 0;
    const total = gb.turnOrder.length;

    function revealNext() {
      count++;
      setRevealedCount(count);
      if (count < total) {
        revealTimerRef.current = window.setTimeout(revealNext, REVEAL_STAGGER_MS);
      } else {
        // All revealed — advance to playing.
        revealTimerRef.current = window.setTimeout(() => {
          dispatch(startPlaying({ now: Date.now() }));
        }, REVEAL_TO_PLAY_DELAY_MS);
      }
    }

    revealTimerRef.current = window.setTimeout(revealNext, REVEAL_STAGGER_MS);

    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase]);

  // ── 5. Global timer display ───────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing' || gb.challengeStartTimeMs === null) return;
    if (gb.globalTimeLimitMs <= 0) return;

    function tick() {
      const elapsed = Date.now() - (gb.challengeStartTimeMs ?? Date.now());
      const remaining = Math.max(0, gb.globalTimeLimitMs - elapsed);
      setTimerDisplay(remaining);

      if (remaining <= 0 && !gb.timerExpired && !pendingStep) {
        // Expire timer first (eliminates unfinished players) then finalise rankings.
        dispatch(expireTimer());
        dispatch(completeGame());
      }
    }

    timerIntervalRef.current = window.setInterval(tick, 250);
    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase, gb.challengeStartTimeMs, gb.timerExpired, pendingStep, dispatch]);

  // ── 6. AI step automation ──────────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing') return;

    const activeId = selectActivePlayerId(gb);
    if (!activeId) return;

    const isHumanTurn = activeId === humanId && !gb.humanSpectating;
    if (isHumanTurn) return; // human controls their own steps

    if (gb.timerExpired) return;
    if (pendingStep) return;

    // Check if already done.
    const progress = gb.progress[activeId];
    if (!progress || progress.eliminated || progress.finishTimeMs !== undefined) return;

    // AI delay: base + jitter.
    const delay =
      AI_STEP_DELAY_MS + Math.floor(aiRngRef.current() * AI_STEP_JITTER_MS);

    if (aiStepTimerRef.current !== null) {
      window.clearTimeout(aiStepTimerRef.current);
    }

    aiStepTimerRef.current = window.setTimeout(() => {
      // Double-check the game is still in playing state.
      if (gb.phase !== 'playing' || gb.timerExpired) return;

      const rowIdx = gb.currentPlayerRow - 1;
      if (rowIdx < 0 || rowIdx >= gb.rows.length) return;
      const row = gb.rows[rowIdx];

      // Find the active participant's profile.
      const participant = gb.participants.find(p => p.id === activeId);

      const chosenSide = aiDecideStep(row, aiRngRef.current, participant?.competitionProfile);
      const now = Date.now();

      // Check if it's a wrong choice (for animation).
      const isBreak = chosenSide !== row.safeSide;

      const noAnimations =
        typeof document !== 'undefined' && document.body.classList.contains('no-animations');
      const suspenseDelay = noAnimations ? 0 : STEP_SUSPENSE_DELAY_MS;
      const shatterDelay = noAnimations ? 0 : SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS;

      setPendingStep({ actorId: activeId, rowIdx, side: chosenSide, isBreak });
      pendingStepRef.current = window.setTimeout(() => {
        if (isBreak) {
          setShatteringTile({ rowIdx, side: chosenSide });
          setShowEliminationFlash(true);
          setShowScreenShake(true);
          flashResetRef.current = window.setTimeout(() => {
            setShowEliminationFlash(false);
            setShowScreenShake(false);
          }, noAnimations ? 0 : 500);
          shatterResolveRef.current = window.setTimeout(() => {
            setShatteringTile(null);
            setPendingStep(null);
            dispatch(resolveStep({ chosenSide, now }));
            // Game-over detection is handled by effect #7 which watches gb state.
          }, shatterDelay);
          return;
        }

        setPendingStep(null);
        dispatch(resolveStep({ chosenSide, now }));
        // Game-over detection is handled by effect #7 which watches gb state.
      }, suspenseDelay);
    }, delay);

    return () => {
      if (aiStepTimerRef.current !== null) {
        window.clearTimeout(aiStepTimerRef.current);
        aiStepTimerRef.current = null;
      }
    };
  }, [gb.phase, gb.currentTurnIndex, gb.currentPlayerRow, gb.timerExpired, humanId, pendingStep, gb, dispatch]);

  // ── 7. Detect end-of-game conditions ──────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing') return;
    if (selectIsGameOver(gb)) {
      dispatch(completeGame());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.currentTurnIndex, gb.timerExpired, gb.progress]);

  // ── 8. Resolve outcome when complete ─────────────────────────────────────
  useEffect(() => {
    if (gb.phase === 'complete' && !gb.outcomeResolved) {
      dispatch(resolveGlassBridgeOutcome());
    }
  }, [gb.phase, gb.outcomeResolved, dispatch]);

  // ── 9. Auto-advance from complete ────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'complete') return;
    if (autoAdvanceRef.current !== null) return;
    autoAdvanceRef.current = window.setTimeout(() => {
      // Ensure outcome is applied (idempotent) before MinigameHost unmounts.
      dispatch(resolveGlassBridgeOutcome());
      onComplete?.();
    }, COMPLETE_AUTO_ADVANCE_MS);
    return () => {
      if (autoAdvanceRef.current !== null) {
        window.clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
    };
  }, [gb.phase, onComplete, dispatch]);

  // ── 10. Human eliminated → show spectator modal ───────────────────────────
  useEffect(() => {
    if (!humanId) return;
    const progress = gb.progress[humanId];
    if (progress?.eliminated && !gb.humanSpectating && gb.phase === 'playing') {
      setShowSpectatorModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.progress, humanId, gb.phase]);

  // ── Human actions ─────────────────────────────────────────────────────────

  const handleHumanNumberPick = useCallback(
    (number: number) => {
      if (!humanId) return;
      dispatch(recordNumberChoice({ playerId: humanId, number }));
    },
    [humanId, dispatch],
  );

  const handleHumanStep = useCallback(
    (side: TileSide) => {
      if (!humanId) return;
      if (gb.phase !== 'playing') return;
      if (gb.timerExpired) return;
      if (pendingStep) return;

      const activeId = selectActivePlayerId(gb);
      if (activeId !== humanId) return;

      const rowIdx = gb.currentPlayerRow - 1;
      if (rowIdx < 0 || rowIdx >= gb.rows.length) return;
      const row = gb.rows[rowIdx];

      const isBreak = side !== row.safeSide;
      const chosenAt = Date.now();
      const noAnimations =
        typeof document !== 'undefined' && document.body.classList.contains('no-animations');
      const suspenseDelay = noAnimations ? 0 : STEP_SUSPENSE_DELAY_MS;
      const shatterDelay = noAnimations ? 0 : SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS;

      setPendingStep({ actorId: humanId, rowIdx, side, isBreak });
      pendingStepRef.current = window.setTimeout(() => {
        if (isBreak) {
          setShatteringTile({ rowIdx, side });
          setShowEliminationFlash(true);
          setShowScreenShake(true);
          flashResetRef.current = window.setTimeout(() => {
            setShowEliminationFlash(false);
            setShowScreenShake(false);
          }, noAnimations ? 0 : 500);
          shatterResolveRef.current = window.setTimeout(() => {
            setShatteringTile(null);
            setPendingStep(null);
            dispatch(resolveStep({ chosenSide: side, now: chosenAt }));
          }, shatterDelay);
          return;
        }

        setPendingStep(null);
        dispatch(resolveStep({ chosenSide: side, now: chosenAt }));
      }, suspenseDelay);
    },
    [humanId, gb, dispatch, pendingStep],
  );

  const handleContinueWatching = useCallback(() => {
    setShowSpectatorModal(false);
    dispatch(setHumanSpectating(true));
  }, [dispatch]);

  const handleSkipToResult = useCallback(() => {
    setShowSpectatorModal(false);
    // Ensure the game state is complete and outcome resolved before navigating away.
    dispatch(completeGame());
    dispatch(resolveGlassBridgeOutcome());
    onComplete?.();
  }, [dispatch, onComplete]);

  // ── Derived values ────────────────────────────────────────────────────────

  const activeId = selectActivePlayerId(gb);
  const isHumanTurn = activeId === humanId && !gb.humanSpectating;
  const humanProgress = humanId ? gb.progress[humanId] : null;
  const isHumanEliminated = !!humanProgress?.eliminated;
  const pendingActorId = pendingStep?.actorId ?? null;

  const timerClass =
    timerDisplay <= 10_000
      ? 'gb-timer-critical'
      : timerDisplay <= 30_000
        ? 'gb-timer-warning'
        : '';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={`glass-bridge${gb.phase === 'playing' ? ' gb-phase-playing' : ''}${showScreenShake ? ' gb-screen-shake' : ''}`}
      role="main"
      aria-label="Glass Bridge — Brutal Mode"
    >
      {/* HUD */}
      {(gb.phase === 'playing' || gb.phase === 'complete') && (
        <div className="gb-hud" role="banner">
          <span className="gb-hud-title">Glass Bridge</span>
          {gb.phase === 'playing' && gb.challengeStartTimeMs !== null && gb.globalTimeLimitMs > 0 && (
            <span className={`gb-hud-timer ${timerClass}`} aria-label="Time remaining">
              ⏱ {formatTimeRemaining(timerDisplay)}
            </span>
          )}
          {gb.phase === 'playing' && (
            <span className="gb-hud-turn" aria-label="Current turn">
              {activeId
                ? `${getName(activeId)}'s turn`
                : 'Waiting…'}
            </span>
          )}
        </div>
      )}

      {/* ── Order Selection ── */}
      {gb.phase === 'order_selection' && (
        <div className="gb-order-selection">
          <h2>Choose Your Number</h2>
          <p>
            Pick a number from 1 to {gb.participants.length}.<br />
            The reveal order will determine who crosses first.
          </p>
          <div className="gb-number-grid" role="group" aria-label="Number selection">
            {Array.from({ length: gb.participants.length }, (_, i) => i + 1).map(num => {
              const takenByOther = Object.entries(gb.chosenNumbers).some(
                ([pid, n]) => n === num && pid !== humanId,
              );
              const takenByMe = humanId ? gb.chosenNumbers[humanId] === num : false;
              const isTaken = takenByOther;
              const isDisabled = isTaken || !!humanProgress?.eliminated || !humanId;
              const alreadyChose = humanId ? gb.chosenNumbers[humanId] !== undefined : true;

              return (
                <button
                  key={num}
                  className={`gb-number-btn${isTaken ? ' gb-number-taken' : ''}${takenByMe ? ' gb-number-mine' : ''}`}
                  disabled={isDisabled || alreadyChose}
                  onClick={() => handleHumanNumberPick(num)}
                  aria-label={`Pick number ${num}${isTaken ? ' (taken)' : ''}${takenByMe ? ' (your pick)' : ''}`}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {/* Status of who has chosen */}
          <div className="gb-order-waiting-list" aria-label="Selection status">
            {gb.participants.map(p => {
              const chosen = gb.chosenNumbers[p.id];
              const isYou = p.id === humanId;
              return (
                <div
                  key={p.id}
                  className={`gb-order-waiting-item${chosen !== undefined ? ' gb-waiting-done' : ''}`}
                >
                  <span>{isYou ? 'You' : getName(p.id)}</span>
                  <span>{chosen !== undefined ? `#${chosen} ✓` : 'Choosing…'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order Reveal ── */}
      {gb.phase === 'order_reveal' && (
        <div className="gb-order-reveal">
          <h2>Turn Order Revealed</h2>
          <div className="gb-reveal-list" role="list" aria-label="Turn order">
            {gb.turnOrder.slice(0, revealedCount).map((playerId, idx) => {
              const isYou = playerId === humanId;
              return (
                <div
                  key={playerId}
                  className={`gb-reveal-item${isYou ? ' gb-reveal-you gb-reveal-spotlight' : ''}`}
                  role="listitem"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <span className="gb-reveal-pos">{idx + 1}.</span>
                  <span className="gb-reveal-name">
                    {isYou ? '⭐ You' : getName(playerId)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Playing ── */}
      {gb.phase === 'playing' && (
        <div className="gb-playing">
          <div className="gb-active-banner" aria-live="polite">
            {isHumanTurn && !pendingStep
              ? 'Tap a highlighted tile to step.'
              : activeId
                ? `${getName(activeId)} is on the bridge`
                : 'Bridge awaiting next player'}
          </div>
          {/* Bridge */}
          <div className="gb-bridge-container" role="region" aria-label="Glass bridge">
            {gb.rows.map((row, rowIdx) => {
              const rowNum = rowIdx + 1;
              const isCurrentRow = gb.currentPlayerRow === rowNum;
              const depthScale = Math.max(0.82, 1 - rowIdx * 0.015);

              // Find players on this row (those who have reached exactly this row and are active).
              const playersOnRow = gb.turnOrder.filter(pid => {
                const p = gb.progress[pid];
                return (
                  p &&
                  !p.eliminated &&
                  p.finishTimeMs === undefined &&
                  activeId === pid &&
                  isCurrentRow
                );
              });

              return (
                <div
                  key={rowIdx}
                  className={`gb-row${isCurrentRow ? ' gb-row-current' : ' gb-row-dimmed'}`}
                  style={{ transform: `scale(${depthScale})`, opacity: isCurrentRow ? 1 : Math.max(0.46, 1 - rowIdx * 0.03) }}
                >
                  <span className="gb-row-label">{rowNum}</span>
                  <div className="gb-tiles">
                    {(['left', 'right'] as TileSide[]).map(side => {
                      const isBroken = side === 'left' ? row.leftBroken : row.rightBroken;
                      const isShatterAnim =
                        shatteringTile?.rowIdx === rowIdx && shatteringTile?.side === side;
                      const isPendingTile =
                        pendingStep?.rowIdx === rowIdx && pendingStep?.side === side;
                      const canActivate =
                        isHumanTurn &&
                        isCurrentRow &&
                        !isBroken &&
                        !pendingStep;

                      let tileClass = 'gb-tile';
                      if (isBroken || isShatterAnim) tileClass += ' gb-tile-broken';
                      if (isShatterAnim) tileClass += ' gb-tile-shatter';
                      if (canActivate && !isBroken) tileClass += ' gb-tile-active';
                      if (isCurrentRow) tileClass += ' gb-tile-current-row';
                      if (!isCurrentRow) tileClass += ' gb-tile-inactive';
                      if (isPendingTile) tileClass += ' gb-tile-selected';

                      return (
                        <div
                          key={side}
                          className={tileClass}
                          onClick={canActivate ? () => handleHumanStep(side) : undefined}
                          role={canActivate ? 'button' : undefined}
                          tabIndex={canActivate ? 0 : undefined}
                          onKeyDown={
                            canActivate
                              ? e => {
                                  if (e.key === 'Enter' || e.key === ' ') handleHumanStep(side);
                                }
                              : undefined
                          }
                          aria-label={`${side} tile${isBroken ? ' (broken)' : ''}${canActivate ? ' — step here' : ''}`}
                          aria-disabled={isBroken || !canActivate}
                        >
                          <span className="gb-tile-label">{side}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Players currently on this row */}
                  <div className="gb-row-players">
                    {playersOnRow.map(pid => (
                      <div
                        key={pid}
                        className={`gb-player-marker${pid === activeId ? ' gb-player-active' : ''}${pid === humanId ? ' gb-player-you' : ''}${pendingActorId === pid && shatteringTile ? ' gb-player-falling' : ''}`}
                        title={getName(pid)}
                      >
                        <img
                          src={avatarForId(pid)}
                          alt={getName(pid)}
                          width={18}
                          height={18}
                          onError={e => {
                            const img = e.currentTarget as HTMLImageElement;
                            img.style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Player status list */}
          <div className="gb-player-list" role="list" aria-label="Player status">
            {gb.turnOrder.map((pid, turnIdx) => {
              const p = gb.progress[pid];
              if (!p) return null;
              const isActive = activeId === pid;
              const isYou = pid === humanId;

              let statusIcon = '';
              let entryClass = 'gb-player-entry';
              if (isActive) entryClass += ' gb-active-turn';
              if (!isActive && activeId) entryClass += ' gb-entry-muted';
              if (p.eliminated) {
                entryClass += ' gb-entry-eliminated';
                statusIcon = '💀';
              } else if (p.finishTimeMs !== undefined) {
                entryClass += ' gb-entry-finished';
                statusIcon = '✅';
              } else if (isActive) {
                statusIcon = '➡️';
              }

              return (
                <div key={pid} className={entryClass} role="listitem">
                  <div className="gb-player-avatar">
                    <img src={avatarForId(pid)} alt="" width={22} height={22} />
                  </div>
                  <span className="gb-player-name">
                    {isYou ? 'You' : getName(pid)}
                    {turnIdx === 0 && !p.eliminated && p.finishTimeMs === undefined ? (
                      <span style={{ color: '#ff8c42', marginLeft: '0.3rem', fontSize: '0.65rem' }}>
                        [1st]
                      </span>
                    ) : null}
                  </span>
                  <span className="gb-player-progress">
                    {p.finishTimeMs !== undefined
                      ? `✓ ${formatElapsed(p.finishTimeMs)}`
                      : p.eliminated
                        ? `Row ${p.furthestRowReached}`
                        : isActive
                          ? `Row ${gb.currentPlayerRow}`
                          : `${p.furthestRowReached > 0 ? `Row ${p.furthestRowReached}` : 'Waiting'}`}
                  </span>
                  <span className="gb-player-status-icon">{statusIcon}</span>
                </div>
              );
            })}
          </div>

          {isHumanTurn && !isHumanEliminated && (
            <div className="gb-step-hint" aria-live="polite">
              Choose directly on the bridge.
            </div>
          )}
        </div>
      )}

      {/* ── Complete ── */}
      {gb.phase === 'complete' && (
        <div className="gb-complete">
          <div className="gb-complete-hero">
            <h2>Bridge Complete</h2>
            <div className="gb-winner-badge">🏆</div>
            {gb.winnerId && (
              <div className="gb-winner-name">
                {gb.winnerId === humanId ? 'You win!' : `${getName(gb.winnerId)} wins!`}
              </div>
            )}
            <div className="gb-complete-subtitle">
              Finishers are ranked by time. Everyone else is ranked by progress.
            </div>
          </div>

          <div className="gb-placement-list" role="list" aria-label="Final placements">
            {gb.placements.map((pid, idx) => {
              const p = gb.progress[pid];
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
              const isYou = pid === humanId;

              const detail: string = p?.finishTimeMs !== undefined
                ? `Finished ${formatElapsed(p.finishTimeMs)}`
                : p?.furthestRowReached
                  ? `Row ${p.furthestRowReached} / ${gb.rowsCount}`
                  : 'Row 0';

              return (
                <div key={pid} className="gb-placement-item" role="listitem">
                  <span className="gb-placement-rank">{medal}</span>
                  <span className="gb-placement-name">
                    {isYou ? 'You' : getName(pid)}
                  </span>
                  <span className="gb-placement-detail">{detail}</span>
                </div>
              );
            })}
          </div>

          <button
            className="gb-btn-primary"
            onClick={() => {
              // Ensure outcome is applied before MinigameHost unmounts this component.
              dispatch(resolveGlassBridgeOutcome());
              onComplete?.();
            }}
            aria-label="Continue"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── Spectator modal ── */}
      {showSpectatorModal && (
        <div
          className="gb-spectator-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminated"
        >
          <div className="gb-spectator-card">
            <div className="gb-spectator-icon" aria-hidden="true">💀</div>
            <h2>You have been eliminated.</h2>
            <p>You can continue watching the remaining players cross the bridge.</p>
            <div className="gb-spectator-actions">
              <button
                className="gb-btn-watch"
                onClick={handleContinueWatching}
                aria-label="Continue watching"
              >
                Continue Watching
              </button>
              <button
                className="gb-btn-skip"
                onClick={handleSkipToResult}
                aria-label="Skip to result"
              >
                Skip to Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Elimination flash ── */}
      {showEliminationFlash && (
        <div className="gb-elimination-flash" aria-hidden="true" />
      )}
    </div>
  );
}
