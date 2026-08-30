/**
 * ClosestWithoutGoingOverComp – "Don't Go Over" competition screen.
 *
 * Phases:
 *   mass_input  → strict qualifier: all players enter guesses
 *   mass_reveal → over-guessers leave, or the slowest furthest valid guess leaves
 *   choose_duel → legacy/persisted 3-player leader pick only
 *   duel_input  → final pair enters guesses
 *   duel_reveal → animated reveal of duel result
 *   complete    → champion announced
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store/store';
import {
  startCwgoCompetition,
  setGuesses,
  setResponseTimes,
  autoFillAIGuesses,
  revealMassResults,
  confirmMassElimination,
  chooseDuelPair,
  revealDuelResults,
  confirmDuelElimination,
  resetCwgo,
} from '../features/cwgo/cwgoCompetitionSlice';
import { resolveCompetitionOutcome } from '../features/cwgo/thunks';
import { CWGO_QUESTIONS } from '../features/cwgo/cwgoQuestions';
import {
  cwgoInputPlaceholder,
  cwgoInputUnit,
  formatCwgoValue,
  parseCwgoGuess,
} from '../features/cwgo/cwgoDisplay';
import { mulberry32 } from '../store/rng';
import type { CwgoPrizeType, CwgoState } from '../features/cwgo/cwgoCompetitionSlice';
import type { CwgoResult } from '../features/cwgo/cwgoHelpers';
import { difficultyLabel } from '../features/cwgo/cwgoHelpers';
import { resolveAvatar, getDicebear } from '../utils/avatar';
import './ClosestWithoutGoingOverComp.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  prizeType: CwgoPrizeType;
  seed: number;
  onComplete?: () => void;
}

/** Minimal player info carried in game state. */
interface GamePlayer {
  id: string;
  name: string;
  avatar: string;
  isUser?: boolean;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const rowVariants = {
  hidden: { opacity: 0, x: -18 },
  visible: { opacity: 1, x: 0 },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/** Swap a broken avatar <img> to the Dicebear fallback. Module-level so sub-components can use it. */
function handleAvatarError(e: React.SyntheticEvent<HTMLImageElement>, name: string) {
  const img = e.currentTarget;
  const fallback = getDicebear(name);
  if (img.src !== fallback) img.src = fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClosestWithoutGoingOverComp({
  participantIds,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const cwgo = useAppSelector((s: RootState) => (s as RootState & { cwgo: CwgoState }).cwgo);
  const players = useAppSelector(
    (s: RootState) =>
      (
        s as RootState & {
          game: { players: GamePlayer[] };
        }
      ).game?.players ?? [],
  );

  const [humanGuess, setHumanGuess] = useState('');
  const [inputError, setInputError] = useState('');
  // Sequential reveal stages for the duel: guesses → answer → outcome
  const [duelRevealStage, setDuelRevealStage] = useState<'guesses' | 'answer' | 'outcome'>('guesses');
  const [spectatorMode, setSpectatorMode] = useState<'playing' | 'pending' | 'watching' | 'skipping'>('playing');
  const questionShownAtRef = useRef(0);
  const exitCompletedRef = useRef(false);

  // Derive helper data
  const humanPlayer = players.find((p) => p.isUser);
  const humanId: string | null = humanPlayer?.id ?? null;

  // ── Avatar helpers ─────────────────────────────────────────────────────────

  function getPlayer(id: string): GamePlayer | undefined {
    return players.find((p) => p.id === id);
  }

  function avatarSrc(id: string): string {
    const p = getPlayer(id);
    if (p) return resolveAvatar({ id: p.id, name: p.name, avatar: p.avatar });
    return getDicebear(id);
  }

  function playerName(id: string): string {
    return getPlayer(id)?.name ?? id;
  }

  // Start competition on mount
  useEffect(() => {
    dispatch(
      startCwgoCompetition({
        participantIds,
        prizeType,
        seed,
      }),
    );
    return () => {
      dispatch(resetCwgo());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Begin timing only after React has committed the fully visible input screen.
  useEffect(() => {
    if (cwgo?.status !== 'mass_input' && cwgo?.status !== 'duel_input') return;
    questionShownAtRef.current = performance.now();
  }, [cwgo?.questionIdx, cwgo?.status]);

  function humanResponseTimeMs(): number {
    return Math.max(0, Math.round(performance.now() - questionShownAtRef.current));
  }

  // ── Duel reveal: advance through suspense stages automatically ────────────────
  // guesses (t=0) → answer revealed (t+1.5s) → outcome shown (t+3.2s)
  // Note: clearTimeout on an already-fired timer ID is a safe no-op in JS.
  useEffect(() => {
    if (cwgo?.status !== 'duel_reveal') return;
    setDuelRevealStage('guesses');
    const t1 = setTimeout(() => setDuelRevealStage('answer'), 1500);
    const t2 = setTimeout(() => setDuelRevealStage('outcome'), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [cwgo?.status]);

  // ── Auto-advance: AI leader in choose_duel ─────────────────────────────────
  // Automatically pick the duel pair after a short delay so old persisted
  // 3-player finals can still resolve cleanly.
  useEffect(() => {
    if (cwgo?.status !== 'choose_duel') return;
    const alive = cwgo.aliveIds;
    const leaderId = cwgo.leaderId ?? alive[0];
    if (humanId === leaderId) return; // Human is leader — no auto-advance

    const t = setTimeout(() => {
      if (alive.length === 2) {
        dispatch(chooseDuelPair([alive[0], alive[1]]));
        return;
      }
      const others = alive.filter((id) => id !== leaderId);
      if (others.length < 2) {
        const fallback = alive.slice(0, 2);
        if (fallback.length === 2) dispatch(chooseDuelPair([fallback[0], fallback[1]]));
        return;
      }
      const rng = mulberry32((cwgo.seed ^ (cwgo.round * 0xf1ea5eed)) >>> 0);
      const shuffled = [...others];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      dispatch(chooseDuelPair([shuffled[0], shuffled[1]]));
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwgo?.status]);

  // ── Auto-advance: AI-only duel input ───────────────────────────────────────
  // When neither duel participant is the human, fill AI guesses and reveal
  // automatically so the user just watches.
  useEffect(() => {
    if (cwgo?.status !== 'duel_input' || !cwgo.duelPair) return;
    if (humanId && cwgo.duelPair.includes(humanId)) return;
    const t = setTimeout(() => {
      dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
      dispatch(revealDuelResults());
    }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwgo?.status, cwgo?.duelPair]);

  // ── Auto-advance: mass_input when human is not competing ───────────────────
  useEffect(() => {
    if (cwgo?.status !== 'mass_input') return;
    if (humanId && cwgo.aliveIds.includes(humanId)) return;
    const t = setTimeout(() => {
      dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
      dispatch(revealMassResults());
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwgo?.status]);

  useEffect(() => {
    if (!cwgo || spectatorMode !== 'skipping') return undefined;
    if (cwgo.status === 'complete') {
      if (!exitCompletedRef.current) {
        exitCompletedRef.current = true;
        dispatch(resolveCompetitionOutcome());
        onComplete?.();
      }
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (cwgo.status === 'mass_input') {
        dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
        dispatch(revealMassResults());
        return;
      }
      if (cwgo.status === 'mass_reveal') {
        dispatch(confirmMassElimination());
        return;
      }
      if (cwgo.status === 'choose_duel') {
        const leaderId = cwgo.leaderId ?? cwgo.aliveIds[0];
        const candidates = cwgo.aliveIds.filter((id) => id !== leaderId);
        const pair = candidates.length >= 2 ? candidates.slice(0, 2) : cwgo.aliveIds.slice(0, 2);
        if (pair.length === 2) dispatch(chooseDuelPair([pair[0], pair[1]]));
        return;
      }
      if (cwgo.status === 'duel_input') {
        dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
        dispatch(revealDuelResults());
        return;
      }
      if (cwgo.status === 'duel_reveal') dispatch(confirmDuelElimination());
    }, 40);
    return () => window.clearTimeout(timer);
  }, [cwgo, dispatch, humanId, onComplete, spectatorMode]);

  if (!cwgo || cwgo.status === 'idle') {
    return <div className="cwgo-loading">Loading competition…</div>;
  }

  const question = CWGO_QUESTIONS[cwgo.questionIdx];
  const questionInputUnit = cwgoInputUnit(question);

  // ── Mass Input ──────────────────────────────────────────────────────────────

  function handleMassSubmit() {
    if (!humanId || !cwgo.aliveIds.includes(humanId)) {
      // Human not participating; just fill AI and reveal
      dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
      dispatch(revealMassResults());
      return;
    }

    const val = parseCwgoGuess(humanGuess, question);
    if (val === null) {
      setInputError('Please enter a valid number.');
      return;
    }
    setInputError('');
    dispatch(setGuesses({ [humanId]: val }));
    dispatch(setResponseTimes({ [humanId]: humanResponseTimeMs() }));
    dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
    setHumanGuess('');
    dispatch(revealMassResults());
  }

  // ── Duel Input ──────────────────────────────────────────────────────────────

  function handleDuelSubmit() {
    if (!cwgo.duelPair) return;
    const isHumanInDuel = humanId && cwgo.duelPair.includes(humanId);

    if (isHumanInDuel) {
      const val = parseCwgoGuess(humanGuess, question);
      if (val === null) {
        setInputError('Please enter a valid number.');
        return;
      }
      setInputError('');
      dispatch(setGuesses({ [humanId]: val }));
      dispatch(setResponseTimes({ [humanId]: humanResponseTimeMs() }));
    }

    // Fill AI guesses for non-human duel participant
    dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
    setHumanGuess('');
    dispatch(revealDuelResults());
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const prizeLabel = prizeType === 'LOH' ? '🏆 Leader of the House' : '🔑 Power of Safety';

  // Hide the question card during choose_duel — the question belongs to the
  // upcoming duel, not the leader-pick phase.
  function handleMassContinue() {
    const humanWasEliminated = humanId !== null && cwgo.lastEliminated.includes(humanId);
    dispatch(confirmMassElimination());
    if (humanWasEliminated) setSpectatorMode('pending');
  }

  function handleDuelContinue() {
    const humanLosesLastLife = humanId !== null
      && cwgo.duelPair?.includes(humanId)
      && cwgo.duelWinnerId !== null
      && cwgo.duelWinnerId !== humanId
      && (cwgo.playerScores[humanId] ?? 3) <= 1;
    dispatch(confirmDuelElimination());
    if (humanLosesLastLife) setSpectatorMode('pending');
  }

  const showQuestion = cwgo.status !== 'choose_duel';

  return (
    <div className="cwgo">
      <h2 className="cwgo__title">Don&apos;t Go Over — {prizeLabel}</h2>

      {cwgo.stage === 'final' && (
        <div className="cwgo-lives" aria-label="Finalist lives">
          {cwgo.aliveIds.map((id) => (
            <span key={id} className="cwgo-lives__player">
              <strong>{playerName(id)}{id === humanId ? ' (You)' : ''}</strong>
              <span aria-label={`${cwgo.playerScores[id] ?? 0} lives`}>
                {'❤️'.repeat(Math.max(0, cwgo.playerScores[id] ?? 0))}
              </span>
            </span>
          ))}
        </div>
      )}

      {showQuestion && question && (
        <div className="cwgo__question">
          <p className="cwgo__question-label">
            Question
            <span
              className={`cwgo__difficulty cwgo__difficulty--${difficultyLabel(
                question.difficulty,
              ).toLowerCase().replace(/\s+/g, '-')}`}
            >
              {difficultyLabel(question.difficulty)}
            </span>
          </p>
          <p className="cwgo__question-text">{question.prompt}</p>
          {questionInputUnit && (
            <p className="cwgo__question-unit">Answer in: {questionInputUnit}</p>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── MASS INPUT ────────────────────────────────────────────────────── */}
        {cwgo.status === 'mass_input' && (
          <motion.div
            key="mass-input"
            className="cwgo-mass-input"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {/* Participant strip */}
            <div className="cwgo-participants">
              {cwgo.aliveIds.map((id) => (
                <CwgoAvatar
                  key={id}
                  id={id}
                  name={playerName(id)}
                  src={avatarSrc(id)}
                  isUser={id === humanId}
                />
              ))}
            </div>

            <p className="cwgo-mass-input__subtitle">
              Enter your best guess without going over!
            </p>

            {humanId && cwgo.aliveIds.includes(humanId) ? (
              <div className="cwgo-mass-input__human-card">
                <div className="cwgo-mass-input__you-row">
                  <div className="cwgo-avatar__ring cwgo-avatar__ring--sm">
                    <img
                      className="cwgo-avatar__img"
                      src={avatarSrc(humanId)}
                      alt={playerName(humanId)}
                      onError={(e) => handleAvatarError(e, playerName(humanId))}
                    />
                  </div>
                  <span>Your guess</span>
                </div>
                <div className="cwgo-mass-input__input-row">
                  <input
                    type="number"
                    min={0}
                    step={question?.scale ? 'any' : 1}
                    className="cwgo-mass-input__input"
                    value={humanGuess}
                    onChange={(e) => setHumanGuess(e.target.value)}
                    placeholder={cwgoInputPlaceholder(question)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMassSubmit()}
                    autoFocus
                  />
                  <button className="cwgo-btn cwgo-btn--primary" onClick={handleMassSubmit}>
                    Submit
                  </button>
                </div>
                {inputError && <p className="cwgo-error">{inputError}</p>}
              </div>
            ) : (
              <div className="cwgo-mass-input__auto-status">
                <p>Players are entering their guesses…</p>
                <div className="cwgo-auto-dots" aria-label="AI players guessing">
                  <span className="cwgo-auto-dots__dot" />
                  <span className="cwgo-auto-dots__dot" />
                  <span className="cwgo-auto-dots__dot" />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── MASS REVEAL ───────────────────────────────────────────────────── */}
        {cwgo.status === 'mass_reveal' && (
          <motion.div
            key="mass-reveal"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            <p className="cwgo-reveal__heading">
              {cwgo.revealResults.every((result) => result.wentOver)
                ? 'Everyone went over — no elimination. New question.'
                : <>Results — Answer: <strong>{formatCwgoValue(question.answer, question, { includeUnit: true })}</strong></>}
            </p>
            <div className="cwgo-results-wrap">
              <div className="cwgo-reveal">
                {cwgo.revealResults.map((r: CwgoResult, i: number) => {
                  const isLastElim = cwgo.lastEliminated.includes(r.playerId);
                  return (
                    <motion.div
                      key={r.playerId}
                      variants={rowVariants}
                      transition={{ delay: i * 0.09, duration: 0.35 }}
                      className={`cwgo-result-row${r.isWinner ? ' cwgo-result-row--winner' : r.wentOver ? ' cwgo-result-row--over' : ''}`}
                    >
                      <div className="cwgo-result-row__avatar-wrap">
                        <div className="cwgo-result-row__avatar-ring">
                          <img
                            className="cwgo-result-row__avatar-img"
                            src={avatarSrc(r.playerId)}
                            alt={playerName(r.playerId)}
                            onError={(e) => handleAvatarError(e, playerName(r.playerId))}
                          />
                        </div>
                        {r.isWinner && <span className="cwgo-result-row__rank">🏅</span>}
                        {r.wentOver && <span className="cwgo-result-row__rank">❌</span>}
                      </div>
                      <div className="cwgo-result-row__info">
                        <div className="cwgo-result-row__name">{playerName(r.playerId)}</div>
                      </div>
                      <div className="cwgo-result-row__guess-wrap">
                        <span className="cwgo-result-row__guess">{formatCwgoValue(r.guess, question)}</span>
                        <span className="cwgo-result-row__diff">
                          {r.wentOver
                            ? `over by ${formatCwgoValue(Math.abs(r.diff), question)}`
                            : `diff: ${formatCwgoValue(r.diff, question)}`}
                        </span>
                        {r.responseTimeMs !== undefined && (
                          <span className="cwgo-result-row__diff">• {(r.responseTimeMs / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                      {isLastElim && (
                        <motion.div
                          className="cwgo-elim-stamp"
                          initial={{ opacity: 0, scale: 1.4 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.09 + 0.5, duration: 0.25 }}
                        >
                          <span className="cwgo-elim-stamp__text">Eliminated</span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
            <div className="cwgo-footer">
              <button
                className="cwgo-btn cwgo-btn--purple cwgo-btn--lg"
                onClick={handleMassContinue}
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* ── CHOOSE DUEL ───────────────────────────────────────────────────── */}
        {cwgo.status === 'choose_duel' && (
          <motion.div
            key="choose-duel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="cwgo-choose">
              {/* Leader card */}
              {(() => {
                const leaderId = cwgo.leaderId ?? cwgo.aliveIds[0];
                const isHumanLeader = humanId === leaderId;
                return (
                  <>
                    <div className="cwgo-choose__leader-row">
                      <div className="cwgo-avatar__ring cwgo-avatar__ring--leader cwgo-avatar__ring--md">
                        <img
                          className="cwgo-avatar__img"
                          src={avatarSrc(leaderId)}
                          alt={playerName(leaderId)}
                          onError={(e) => handleAvatarError(e, playerName(leaderId))}
                        />
                      </div>
                      <div>
                        <p className="cwgo-choose__leader-label">👑 Leader</p>
                        <p className="cwgo-choose__leader-name">{playerName(leaderId)}</p>
                      </div>
                    </div>

                    {isHumanLeader ? (
                      cwgo.aliveIds.length === 2 ? (
                        <>
                          <p className="cwgo-choose__instruction">
                            Only two players remain. Start the deciding duel.
                          </p>
                          <button
                            className="cwgo-btn cwgo-btn--primary"
                            onClick={() =>
                              dispatch(
                                chooseDuelPair([
                                  cwgo.aliveIds[0],
                                  cwgo.aliveIds[1],
                                ]),
                              )
                            }
                          >
                            Start Duel
                          </button>
                        </>
                      ) : (
                        <LeaderDuelPicker
                          aliveIds={cwgo.aliveIds}
                          leaderId={leaderId}
                          playerName={playerName}
                          avatarSrc={avatarSrc}
                          onPick={(pair) => dispatch(chooseDuelPair(pair))}
                        />
                      )
                    ) : (
                      <>
                        <p className="cwgo-choose__instruction">
                          {playerName(leaderId)} is choosing who duels…
                        </p>
                        <div className="cwgo-auto-dots" aria-label="Auto-selecting duel pair">
                          <span className="cwgo-auto-dots__dot" />
                          <span className="cwgo-auto-dots__dot" />
                          <span className="cwgo-auto-dots__dot" />
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}

        {/* ── DUEL INPUT ────────────────────────────────────────────────────── */}
        {cwgo.status === 'duel_input' && cwgo.duelPair && (
          <motion.div
            key="duel-input"
            className="cwgo-duel"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <DuelVsCard
              pair={cwgo.duelPair}
              playerName={playerName}
              avatarSrc={avatarSrc}
            />

            {humanId && cwgo.duelPair.includes(humanId) ? (
              <div className="cwgo-mass-input__human-card">
                <div className="cwgo-mass-input__you-row">
                  <div className="cwgo-avatar__ring cwgo-avatar__ring--sm">
                    <img
                      className="cwgo-avatar__img"
                      src={avatarSrc(humanId)}
                      alt={playerName(humanId)}
                      onError={(e) => handleAvatarError(e, playerName(humanId))}
                    />
                  </div>
                  <span>Your duel guess</span>
                </div>
                <div className="cwgo-mass-input__input-row">
                  <input
                    type="number"
                    min={0}
                    step={question?.scale ? 'any' : 1}
                    className="cwgo-mass-input__input"
                    value={humanGuess}
                    onChange={(e) => setHumanGuess(e.target.value)}
                    placeholder={cwgoInputPlaceholder(question)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDuelSubmit()}
                    autoFocus
                  />
                  <button className="cwgo-btn cwgo-btn--primary" onClick={handleDuelSubmit}>
                    Submit
                  </button>
                </div>
                {inputError && <p className="cwgo-error">{inputError}</p>}
              </div>
            ) : (
              <div className="cwgo-duel__auto-start">
                <p className="cwgo-duel__auto-label">⚔️ Duel starting…</p>
                <div className="cwgo-auto-dots" aria-label="Duel starting">
                  <span className="cwgo-auto-dots__dot" />
                  <span className="cwgo-auto-dots__dot" />
                  <span className="cwgo-auto-dots__dot" />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── DUEL REVEAL ───────────────────────────────────────────────────── */}
        {/* Three sequential stages (auto-timed):
             guesses  → both players' numbers visible, no outcome context
             answer   → correct answer revealed with pop animation
             outcome  → winner/loser styling, life-loss stamp, Continue button */}
        {cwgo.status === 'duel_reveal' && cwgo.duelPair && cwgo.revealResults.length === 2 && (
          <motion.div
            key="duel-reveal"
            className="cwgo-duel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Header: changes per stage */}
            <AnimatePresence mode="wait">
              {duelRevealStage === 'guesses' && (
                <motion.p
                  key="hdr-guesses"
                  className="cwgo-reveal__heading cwgo-reveal__heading--suspense"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                >
                  Guesses locked in 🔒
                </motion.p>
              )}
              {duelRevealStage !== 'guesses' && (
                <motion.p
                  key="hdr-answer"
                  className="cwgo-reveal__heading cwgo-reveal__heading--answer"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                >
                  Answer: <strong>{formatCwgoValue(question.answer, question, { includeUnit: true })}</strong>
                </motion.p>
              )}
            </AnimatePresence>

            <div className="cwgo-duel__vs-card">
              {(() => {
                // Whether the outcome (winner/loser styling) is visible.
                // Hoisted outside map to avoid recomputing on every iteration.
                const showOutcome = duelRevealStage === 'outcome';
                const isRedraw = showOutcome && !cwgo.duelWinnerId;

                return cwgo.revealResults.map((r: CwgoResult, i: number) => {
                  // Build side CSS class once per side rather than inside JSX.
                  const sideClass = [
                    'cwgo-duel__side',
                    showOutcome && !isRedraw && r.isWinner  ? 'cwgo-duel__side--winner'  : '',
                    showOutcome && !isRedraw && !r.isWinner ? 'cwgo-duel__side--loser'   : '',
                    showOutcome && !isRedraw && r.wentOver  ? 'cwgo-duel__side--over'    : '',
                    !showOutcome               ? 'cwgo-duel__side--pending' : '',
                  ].filter(Boolean).join(' ');

                  return (
                  <>
                    <motion.div
                      key={r.playerId}
                      className={sideClass}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.15, duration: 0.4 }}
                    >
                      <div className="cwgo-duel__avatar-ring" style={{ position: 'relative' }}>
                        <img
                          className="cwgo-duel__avatar-img"
                          src={avatarSrc(r.playerId)}
                          alt={playerName(r.playerId)}
                          onError={(e) => handleAvatarError(e, playerName(r.playerId))}
                        />
                        {showOutcome && !isRedraw && !r.isWinner && (
                          <motion.div
                            className="cwgo-duel__elim-overlay"
                            initial={{ opacity: 0, scale: 1.2 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.35 }}
                          >
                            <span className="cwgo-duel__elim-text">
                              {(cwgo.playerScores[r.playerId] ?? 3) <= 1 ? 'Out' : '−1 life'}
                            </span>
                          </motion.div>
                        )}
                      </div>
                      {showOutcome && !isRedraw && r.isWinner && (
                        <motion.div
                          className="cwgo-duel__winner-badge"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 12 }}
                        >
                          🏅
                        </motion.div>
                      )}
                      <p className="cwgo-duel__player-name">{playerName(r.playerId)}</p>
                      <p className="cwgo-duel__score">{formatCwgoValue(r.guess, question)}</p>
                      {r.responseTimeMs !== undefined && (
                        <p className="cwgo-duel__diff">{(r.responseTimeMs / 1000).toFixed(1)}s</p>
                      )}
                      {showOutcome && (
                        <motion.p
                          className="cwgo-duel__diff"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          {r.wentOver
                            ? `over by ${formatCwgoValue(Math.abs(r.diff), question)}`
                            : `diff: ${formatCwgoValue(r.diff, question)}`}
                        </motion.p>
                      )}
                    </motion.div>
                    {i === 0 && (
                      <div key="vs" className="cwgo-duel__vs-sep">
                        <span className="cwgo-duel__vs-label">VS</span>
                      </div>
                    )}
                  </>
                  );
                });
              })()}
            </div>

            {duelRevealStage === 'outcome' && !cwgo.duelWinnerId && (
              <p className="cwgo-reveal__heading">Both players went over — new question.</p>
            )}

            {/* Continue button only appears once the outcome is revealed */}
            <AnimatePresence>
              {duelRevealStage === 'outcome' && (
                <motion.div
                  className="cwgo-footer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <button
                    className="cwgo-btn cwgo-btn--purple cwgo-btn--lg"
                    onClick={handleDuelContinue}
                  >
                      {cwgo.duelWinnerId ? 'Continue' : 'New question'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── COMPLETE ──────────────────────────────────────────────────────── */}
        {cwgo.status === 'complete' && cwgo.aliveIds.length > 0 && (
          <motion.div
            key="complete"
            className="cwgo-complete"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45 }}
            onAnimationStart={() => {
              console.log('[cwgo] GameScreen banner render: champion =', cwgo.aliveIds[0], '| prizeType =', prizeType);
            }}
          >
            <motion.div
              className="cwgo-complete__trophy"
              animate={{ rotate: [0, -8, 8, -8, 8, 0] }}
              transition={{ duration: 0.7, delay: 0.4 }}
            >
              🏆
            </motion.div>
            <motion.div
              className="cwgo-complete__avatar-ring"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, delay: 0.25 }}
            >
              <img
                className="cwgo-complete__avatar-img"
                src={avatarSrc(cwgo.aliveIds[0])}
                alt={playerName(cwgo.aliveIds[0])}
                onError={(e) => handleAvatarError(e, playerName(cwgo.aliveIds[0]))}
              />
            </motion.div>
            <p className="cwgo-complete__title">
              {playerName(cwgo.aliveIds[0])} wins!
            </p>
            <p className="cwgo-complete__prize">
              {prizeLabel}
            </p>
            <p className="cwgo-complete__sub">Closest without going over!</p>
            <button
              className="cwgo-btn cwgo-btn--success cwgo-btn--lg"
              onClick={() => {
                dispatch(resolveCompetitionOutcome());
                onComplete?.();
              }}
            >
              Claim Prize
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {spectatorMode === 'pending' && (
        <div className="cwgo-spectator-overlay" role="dialog" aria-modal="true" aria-labelledby="cwgo-spectator-title">
          <div className="cwgo-spectator-card">
            <span className="cwgo-spectator-card__eyebrow">Eliminated</span>
            <h3 id="cwgo-spectator-title">How would you like to continue?</h3>
            <p>Watch the remaining players at normal speed, or exit while the competition resolves to its winner.</p>
            <div className="cwgo-spectator-card__actions">
              <button className="cwgo-btn cwgo-btn--purple" type="button" onClick={() => setSpectatorMode('watching')}>
                Continue as spectator
              </button>
              <button className="cwgo-btn cwgo-btn--secondary" type="button" onClick={() => setSpectatorMode('skipping')}>
                Exit game
              </button>
            </div>
          </div>
        </div>
      )}

      {spectatorMode === 'skipping' && cwgo.status !== 'complete' && (
        <div className="cwgo-fast-forward" role="status" aria-live="polite">Fast-forwarding to the winner…</div>
      )}
    </div>
  );
}

// ─── CwgoAvatar — small participant chip ──────────────────────────────────────

function CwgoAvatar({
  id,
  name,
  src,
  isUser,
  ringClass,
}: {
  id: string;
  name: string;
  src: string;
  isUser?: boolean;
  ringClass?: string;
}) {
  const [imgSrc, setImgSrc] = useState(src);
  return (
    <div className="cwgo-avatar">
      <div className={`cwgo-avatar__ring${ringClass ? ' ' + ringClass : ''}`}>
        <img
          key={id}
          className="cwgo-avatar__img"
          src={imgSrc}
          alt={name}
          onError={() => setImgSrc(getDicebear(name))}
        />
      </div>
      {isUser && <span className="cwgo-avatar__you">YOU</span>}
      <span className="cwgo-avatar__name">{name}</span>
    </div>
  );
}

// ─── DuelVsCard — pre-reveal face-off display ─────────────────────────────────

function DuelVsCard({
  pair,
  playerName,
  avatarSrc,
}: {
  pair: [string, string];
  playerName: (id: string) => string;
  avatarSrc: (id: string) => string;
}) {
  return (
    <div className="cwgo-duel__vs-card">
      <div key={pair[0]} className="cwgo-duel__side">
        <div className="cwgo-duel__avatar-ring">
          <img
            className="cwgo-duel__avatar-img"
            src={avatarSrc(pair[0])}
            alt={playerName(pair[0])}
            onError={(e) => handleAvatarError(e, playerName(pair[0]))}
          />
        </div>
        <p className="cwgo-duel__player-name">{playerName(pair[0])}</p>
      </div>
      <div className="cwgo-duel__vs-sep">
        <span className="cwgo-duel__vs-label">VS</span>
      </div>
      <div key={pair[1]} className="cwgo-duel__side">
        <div className="cwgo-duel__avatar-ring">
          <img
            className="cwgo-duel__avatar-img"
            src={avatarSrc(pair[1])}
            alt={playerName(pair[1])}
            onError={(e) => handleAvatarError(e, playerName(pair[1]))}
          />
        </div>
        <p className="cwgo-duel__player-name">{playerName(pair[1])}</p>
      </div>
    </div>
  );
}

// ─── LeaderDuelPicker (Human leader) ─────────────────────────────────────────

function LeaderDuelPicker({
  aliveIds,
  leaderId,
  playerName,
  avatarSrc,
  onPick,
}: {
  aliveIds: string[];
  leaderId?: string;
  playerName: (id: string) => string;
  avatarSrc: (id: string) => string;
  onPick: (pair: [string, string]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
    } else if (selected.length < 2) {
      setSelected([...selected, id]);
    }
  };

  const leader = leaderId ?? aliveIds[0];
  const candidates = aliveIds.filter((id) => id !== leader);

  return (
    <div className="cwgo-choose cwgo-choose--picker">
      <p className="cwgo-choose__instruction">Pick 2 players to send to a duel:</p>

      {/* Scrollable body — safe for many players on mobile */}
      <div className="cwgo-choose__scroll-body">
        <div className="cwgo-choose__grid">
          {candidates.map((id) => (
            <button
              key={id}
              type="button"
              className={`cwgo-choose__card${selected.includes(id) ? ' cwgo-choose__card--selected' : ''}`}
              onClick={() => toggle(id)}
            >
              <div className="cwgo-choose__card-avatar">
                <img
                  className="cwgo-choose__card-img"
                  src={avatarSrc(id)}
                  alt={playerName(id)}
                  onError={(e) => handleAvatarError(e, playerName(id))}
                />
              </div>
              <span className="cwgo-choose__card-name">{playerName(id)}</span>
            </button>
          ))}
        </div>

        {/* Preview: show the 2 selected players as a VS mini-card */}
        <AnimatePresence>
          {selected.length === 2 && (
            <motion.div
              className="cwgo-choose__preview"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
            >
              <div className="cwgo-choose__preview-side">
                <div className="cwgo-choose__preview-avatar">
                  <img
                    className="cwgo-choose__preview-img"
                    src={avatarSrc(selected[0])}
                    alt={playerName(selected[0])}
                    onError={(e) => handleAvatarError(e, playerName(selected[0]))}
                  />
                </div>
                <span className="cwgo-choose__preview-name">{playerName(selected[0])}</span>
              </div>
              <span className="cwgo-choose__vs">⚔️ VS ⚔️</span>
              <div className="cwgo-choose__preview-side">
                <div className="cwgo-choose__preview-avatar">
                  <img
                    className="cwgo-choose__preview-img"
                    src={avatarSrc(selected[1])}
                    alt={playerName(selected[1])}
                    onError={(e) => handleAvatarError(e, playerName(selected[1]))}
                  />
                </div>
                <span className="cwgo-choose__preview-name">{playerName(selected[1])}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky footer — always reachable on mobile */}
      <div className="cwgo-choose__footer">
        <button
          type="button"
          className="cwgo-btn cwgo-btn--gold cwgo-btn--lg"
          disabled={selected.length < 2}
          onClick={() => {
            if (selected.length < 2) return;
            onPick([selected[0], selected[1]]);
          }}
        >
          Send to Duel ⚔️
        </button>
      </div>
    </div>
  );
}
