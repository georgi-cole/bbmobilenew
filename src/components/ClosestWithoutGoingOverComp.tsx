/**
 * ClosestWithoutGoingOverComp – "Don't Go Over" competition screen.
 *
 * Phases:
 *   mass_input  → all players enter guesses
 *   mass_reveal → animated reveal with elimination
 *   choose_duel → leader picks two players to duel
 *   duel_input  → duel pair enters guesses
 *   duel_reveal → animated reveal of duel result
 *   complete    → champion announced
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store/store';
import {
  startCwgoCompetition,
  setGuesses,
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
import { mulberry32 } from '../store/rng';
import type { CwgoPrizeType, CwgoState } from '../features/cwgo/cwgoCompetitionSlice';
import type { CwgoResult } from '../features/cwgo/cwgoHelpers';
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

  if (!cwgo || cwgo.status === 'idle') {
    return <div className="cwgo-loading">Loading competition…</div>;
  }

  const question = CWGO_QUESTIONS[cwgo.questionIdx];

  // ── Mass Input ──────────────────────────────────────────────────────────────

  function handleMassSubmit() {
    if (!humanId || !cwgo.aliveIds.includes(humanId)) {
      // Human not participating; just fill AI and reveal
      dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
      dispatch(revealMassResults());
      return;
    }

    const val = Number(humanGuess);
    if (!humanGuess || isNaN(val)) {
      setInputError('Please enter a valid number.');
      return;
    }
    setInputError('');
    dispatch(setGuesses({ [humanId]: val }));
    dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
    setHumanGuess('');
    dispatch(revealMassResults());
  }

  // ── Duel Input ──────────────────────────────────────────────────────────────

  function handleDuelSubmit() {
    if (!cwgo.duelPair) return;
    const isHumanInDuel = humanId && cwgo.duelPair.includes(humanId);

    if (isHumanInDuel) {
      const val = Number(humanGuess);
      if (!humanGuess || isNaN(val)) {
        setInputError('Please enter a valid number.');
        return;
      }
      setInputError('');
      dispatch(setGuesses({ [humanId]: val }));
    }

    // Fill AI guesses for non-human duel participant
    dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
    setHumanGuess('');
    dispatch(revealDuelResults());
  }

  // ── Choose Duel (Leader Picks) ──────────────────────────────────────────────

  function handleAILeaderPickDuel() {
    if (cwgo.status !== 'choose_duel') return;
    const leader = cwgo.aliveIds[0];
    const others = cwgo.aliveIds.filter((id: string) => id !== leader);
    if (others.length < 2) return;

    // Deterministic seeded Fisher-Yates shuffle — avoids compSkill (not in Player type)
    // and avoids putting RNG calls inside the sort comparator (which is non-deterministic).
    const rng = mulberry32((cwgo.seed ^ (cwgo.round * 0xf1ea5eed)) >>> 0);
    const shuffled = [...others];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Leader sends the first two from the shuffled list to duel
    dispatch(chooseDuelPair([shuffled[0], shuffled[1]]));
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const prizeLabel = prizeType === 'HOH' ? '🏆 Head of Household' : '🔑 Power of Veto';

  return (
    <div className="cwgo">
      <h2 className="cwgo__title">Don&apos;t Go Over — {prizeLabel}</h2>

      {question && (
        <div className="cwgo__question">
          <p className="cwgo__question-label">Question</p>
          <p className="cwgo__question-text">{question.prompt}</p>
          {question.unit && (
            <p className="cwgo__question-unit">Answer in: {question.unit}</p>
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
                    className="cwgo-mass-input__input"
                    value={humanGuess}
                    onChange={(e) => setHumanGuess(e.target.value)}
                    placeholder="Enter number…"
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
              <button
                className="cwgo-btn cwgo-btn--primary"
                onClick={() => {
                  dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
                  dispatch(revealMassResults());
                }}
              >
                Reveal Results
              </button>
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
              Results — Answer: <strong>{question?.answer.toLocaleString()}</strong>
            </p>
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
                      <span className="cwgo-result-row__guess">{r.guess.toLocaleString()}</span>
                      <span className="cwgo-result-row__diff">
                        {r.wentOver
                          ? `over by ${Math.abs(r.diff).toLocaleString()}`
                          : `diff: ${r.diff.toLocaleString()}`}
                      </span>
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
            <div className="cwgo-continue-row">
              <button
                className="cwgo-btn cwgo-btn--purple cwgo-btn--lg"
                onClick={() => dispatch(confirmMassElimination())}
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
              <div className="cwgo-choose__leader-row">
                <div className="cwgo-avatar__ring cwgo-avatar__ring--leader cwgo-avatar__ring--md">
                  <img
                    className="cwgo-avatar__img"
                    src={avatarSrc(cwgo.aliveIds[0])}
                    alt={playerName(cwgo.aliveIds[0])}
                    onError={(e) => handleAvatarError(e, playerName(cwgo.aliveIds[0]))}
                  />
                </div>
                <div>
                  <p className="cwgo-choose__leader-label">👑 Leader</p>
                  <p className="cwgo-choose__leader-name">{playerName(cwgo.aliveIds[0])}</p>
                </div>
              </div>

              {humanId === cwgo.aliveIds[0] ? (
                <LeaderDuelPicker
                  aliveIds={cwgo.aliveIds}
                  playerName={playerName}
                  avatarSrc={avatarSrc}
                  onPick={(pair) => dispatch(chooseDuelPair(pair))}
                />
              ) : (
                <>
                  <p className="cwgo-choose__instruction">
                    {playerName(cwgo.aliveIds[0])} is choosing two players to duel…
                  </p>
                  <button
                    className="cwgo-btn cwgo-btn--primary"
                    onClick={handleAILeaderPickDuel}
                  >
                    Pick Duel
                  </button>
                </>
              )}
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
                    className="cwgo-mass-input__input"
                    value={humanGuess}
                    onChange={(e) => setHumanGuess(e.target.value)}
                    placeholder="Enter number…"
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
              <button
                className="cwgo-btn cwgo-btn--primary"
                onClick={() => {
                  dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
                  dispatch(revealDuelResults());
                }}
              >
                Watch the Duel
              </button>
            )}
          </motion.div>
        )}

        {/* ── DUEL REVEAL ───────────────────────────────────────────────────── */}
        {cwgo.status === 'duel_reveal' && cwgo.duelPair && cwgo.revealResults.length === 2 && (
          <motion.div
            key="duel-reveal"
            className="cwgo-duel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="cwgo-reveal__heading">
              Answer: <strong>{question?.answer.toLocaleString()}</strong>
            </p>
            <div className="cwgo-duel__vs-card">
              {cwgo.revealResults.map((r: CwgoResult, i: number) => (
                <motion.div
                  key={r.playerId}
                  className={`cwgo-duel__side${r.isWinner ? ' cwgo-duel__side--winner' : ' cwgo-duel__side--loser'}${r.wentOver ? ' cwgo-duel__side--over' : ''}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.2, duration: 0.4 }}
                >
                  <div className="cwgo-duel__avatar-ring" style={{ position: 'relative' }}>
                    <img
                      className="cwgo-duel__avatar-img"
                      src={avatarSrc(r.playerId)}
                      alt={playerName(r.playerId)}
                      onError={(e) => handleAvatarError(e, playerName(r.playerId))}
                    />
                    {!r.isWinner && (
                      <motion.div
                        className="cwgo-duel__elim-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.2 + 0.55, duration: 0.3 }}
                      >
                        <span className="cwgo-duel__elim-text">Out</span>
                      </motion.div>
                    )}
                  </div>
                  {r.isWinner && (
                    <motion.div
                      className="cwgo-duel__winner-badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.6, stiffness: 300 }}
                    >
                      🏅
                    </motion.div>
                  )}
                  <p className="cwgo-duel__player-name">{playerName(r.playerId)}</p>
                  <p className="cwgo-duel__score">{r.guess.toLocaleString()}</p>
                  <p className="cwgo-duel__diff">
                    {r.wentOver
                      ? `over by ${Math.abs(r.diff).toLocaleString()}`
                      : `diff: ${r.diff.toLocaleString()}`}
                  </p>
                  {/* Insert VS separator between the two sides */}
                  {i === 0 && (
                    <div className="cwgo-duel__vs-sep cwgo-duel__vs-sep--between">
                      <span className="cwgo-duel__vs-label">VS</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="cwgo-continue-row">
              <button
                className="cwgo-btn cwgo-btn--purple cwgo-btn--lg"
                onClick={() => dispatch(confirmDuelElimination())}
              >
                Continue
              </button>
            </div>
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
      {pair.map((id) => (
        <div key={id} className="cwgo-duel__side">
          <div className="cwgo-duel__avatar-ring">
            <img
              className="cwgo-duel__avatar-img"
              src={avatarSrc(id)}
              alt={playerName(id)}
              onError={(e) => handleAvatarError(e, playerName(id))}
            />
          </div>
          <p className="cwgo-duel__player-name">{playerName(id)}</p>
        </div>
      ))}
      <div className="cwgo-duel__vs-sep">
        <span className="cwgo-duel__vs-label">VS</span>
      </div>
    </div>
  );
}

// ─── LeaderDuelPicker (Human leader) ─────────────────────────────────────────

function LeaderDuelPicker({
  aliveIds,
  playerName,
  avatarSrc,
  onPick,
}: {
  aliveIds: string[];
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

  const leader = aliveIds[0];
  const candidates = aliveIds.filter((id) => id !== leader);

  return (
    <div className="cwgo-choose">
      <p className="cwgo-choose__instruction">Pick 2 players to send to a duel:</p>

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
  );
}
