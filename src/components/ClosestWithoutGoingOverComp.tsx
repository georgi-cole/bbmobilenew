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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  prizeType: CwgoPrizeType;
  seed: number;
  onComplete?: () => void;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const tileVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  eliminated: { opacity: 0.35, scale: 0.9, filter: 'grayscale(80%)' },
  winner: { scale: 1.08, boxShadow: '0 0 24px 6px gold' },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClosestWithoutGoingOverComp({
  participantIds,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const cwgo = useAppSelector((s: RootState) => (s as RootState & { cwgo: CwgoState }).cwgo);
  const players = useAppSelector((s: RootState) => (s as RootState & { game: { players: Array<{ id: string; name: string; isUser?: boolean; compSkill?: number }> } }).game?.players ?? []);

  const [humanGuess, setHumanGuess] = useState('');
  const [inputError, setInputError] = useState('');

  // Derive helper data
  const humanPlayer = players.find((p) => p.isUser);
  const humanId: string | null = humanPlayer?.id ?? null;

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
  const playerName = (id: string) =>
    players.find((p) => p.id === id)?.name ?? id;

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
    <div className="cwgo-screen" style={{ padding: '1.5rem', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 8 }}>
        Don&apos;t Go Over — {prizeLabel}
      </h2>

      {question && (
        <div
          style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1.25rem',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: 4 }}>Question</p>
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{question.prompt}</p>
          {question.unit && (
            <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Answer in: {question.unit}</p>
          )}
        </div>
      )}

      {/* MASS INPUT */}
      {cwgo.status === 'mass_input' && (
        <motion.div
          key="mass-input"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <p style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            All players — enter your best guess without going over!
          </p>
          {humanId && cwgo.aliveIds.includes(humanId) && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              <input
                type="number"
                value={humanGuess}
                onChange={(e) => setHumanGuess(e.target.value)}
                placeholder="Your guess…"
                style={{ padding: '0.5rem', borderRadius: 8, width: 160 }}
                onKeyDown={(e) => e.key === 'Enter' && handleMassSubmit()}
              />
              <button
                onClick={handleMassSubmit}
                style={{ padding: '0.5rem 1rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Submit
              </button>
            </div>
          )}
          {!humanId || !cwgo.aliveIds.includes(humanId) ? (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => {
                  dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
                  dispatch(revealMassResults());
                }}
                style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Reveal Results
              </button>
            </div>
          ) : null}
          {inputError && <p style={{ color: '#f87171', textAlign: 'center' }}>{inputError}</p>}
        </motion.div>
      )}

      {/* MASS REVEAL */}
      {cwgo.status === 'mass_reveal' && (
        <motion.div
          key="mass-reveal"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <p style={{ textAlign: 'center', marginBottom: '0.75rem', fontWeight: 600 }}>
            Results — Answer: <strong>{question?.answer.toLocaleString()}</strong>
          </p>
          <AnimatePresence>
            {cwgo.revealResults.map((r: CwgoResult, i: number) => (
              <motion.div
                key={r.playerId}
                layout
                variants={tileVariants}
                animate={r.isWinner ? 'winner' : r.wentOver ? 'eliminated' : 'visible'}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: r.isWinner ? '#2d4a1e' : r.wentOver ? '#3b1a1a' : '#1e2a3b',
                  borderRadius: 10,
                  padding: '0.65rem 1rem',
                  marginBottom: 8,
                  border: r.isWinner ? '2px solid gold' : '1px solid #333',
                }}
              >
                <span style={{ fontWeight: r.isWinner ? 700 : 400 }}>
                  {r.isWinner ? '🏅 ' : r.wentOver ? '❌ ' : ''}
                  {playerName(r.playerId)}
                </span>
                <span>
                  <strong>{r.guess.toLocaleString()}</strong>
                  <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.85rem' }}>
                    {r.wentOver ? `(over by ${Math.abs(r.diff).toLocaleString()})` : `(diff: ${r.diff.toLocaleString()})`}
                  </span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => dispatch(confirmMassElimination())}
              style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Continue
            </button>
          </div>
        </motion.div>
      )}

      {/* CHOOSE DUEL */}
      {cwgo.status === 'choose_duel' && (
        <motion.div
          key="choose-duel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ textAlign: 'center' }}
        >
          <p style={{ marginBottom: 12 }}>
            <strong>{playerName(cwgo.aliveIds[0])}</strong> is the leader and must pick two players to duel!
          </p>
          <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: 16 }}>
            Remaining players: {cwgo.aliveIds.map((id: string) => playerName(id)).join(', ')}
          </p>
          {/* Derive leaderIsHuman from the current leader rather than a persisted flag */}
          {humanId === cwgo.aliveIds[0] ? (
            <LeaderDuelPicker
              aliveIds={cwgo.aliveIds}
              playerName={playerName}
              onPick={(pair) => dispatch(chooseDuelPair(pair))}
            />
          ) : (
            <button
              onClick={handleAILeaderPickDuel}
              style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              AI Leader Picks Duel
            </button>
          )}
        </motion.div>
      )}

      {/* DUEL INPUT */}
      {cwgo.status === 'duel_input' && cwgo.duelPair && (
        <motion.div
          key="duel-input"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{ textAlign: 'center' }}
        >
          <p style={{ marginBottom: 8, fontSize: '1.05rem' }}>
            ⚔️ Duel: <strong>{playerName(cwgo.duelPair[0])}</strong> vs <strong>{playerName(cwgo.duelPair[1])}</strong>
          </p>
          {humanId && cwgo.duelPair.includes(humanId) ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              <input
                type="number"
                value={humanGuess}
                onChange={(e) => setHumanGuess(e.target.value)}
                placeholder="Your guess…"
                style={{ padding: '0.5rem', borderRadius: 8, width: 160 }}
                onKeyDown={(e) => e.key === 'Enter' && handleDuelSubmit()}
              />
              <button
                onClick={handleDuelSubmit}
                style={{ padding: '0.5rem 1rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Submit
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                dispatch(autoFillAIGuesses({ humanIds: humanId ? [humanId] : [] }));
                dispatch(revealDuelResults());
              }}
              style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: '#4f86f7', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Simulate Duel
            </button>
          )}
          {inputError && <p style={{ color: '#f87171' }}>{inputError}</p>}
        </motion.div>
      )}

      {/* DUEL REVEAL */}
      {cwgo.status === 'duel_reveal' && cwgo.duelPair && (
        <motion.div
          key="duel-reveal"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          style={{ textAlign: 'center' }}
        >
          <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
            Duel Results — Answer: <strong>{question?.answer.toLocaleString()}</strong>
          </p>
          <AnimatePresence>
            {cwgo.revealResults.map((r: CwgoResult, i: number) => (
              <motion.div
                key={r.playerId}
                layout
                variants={tileVariants}
                animate={r.isWinner ? 'winner' : 'eliminated'}
                transition={{ delay: i * 0.15, duration: 0.4 }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: r.isWinner ? '#2d4a1e' : '#3b1a1a',
                  borderRadius: 10,
                  padding: '0.65rem 1rem',
                  marginBottom: 8,
                  border: r.isWinner ? '2px solid gold' : '1px solid #555',
                }}
              >
                <span style={{ fontWeight: r.isWinner ? 700 : 400 }}>
                  {r.isWinner ? '🏅 ' : '❌ '}
                  {playerName(r.playerId)}
                </span>
                <span>
                  <strong>{r.guess.toLocaleString()}</strong>
                  <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.85rem' }}>
                    {r.wentOver ? `(over by ${Math.abs(r.diff).toLocaleString()})` : `(diff: ${r.diff.toLocaleString()})`}
                  </span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          <button
            onClick={() => dispatch(confirmDuelElimination())}
            style={{ marginTop: 16, padding: '0.6rem 1.5rem', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Continue
          </button>
        </motion.div>
      )}

      {/* COMPLETE */}
      {cwgo.status === 'complete' && (
        <motion.div
          key="complete"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', padding: '2rem 0' }}
        >
          <motion.div
            animate={{ rotate: [0, -5, 5, -5, 5, 0] }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ fontSize: '3rem', marginBottom: 8 }}
          >
            🏆
          </motion.div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: 4 }}>
            {playerName(cwgo.aliveIds[0])} wins {prizeLabel}!
          </h3>
          <p style={{ opacity: 0.6, marginBottom: 16 }}>Closest without going over!</p>
          <button
            onClick={() => {
              dispatch(resolveCompetitionOutcome());
              onComplete?.();
            }}
            style={{ padding: '0.7rem 2rem', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            Claim Prize
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Leader Duel Picker (Human) ───────────────────────────────────────────────

function LeaderDuelPicker({
  aliveIds,
  playerName,
  onPick,
}: {
  aliveIds: string[];
  playerName: (id: string) => string;
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
    <div>
      <p style={{ opacity: 0.7, marginBottom: 8 }}>Pick 2 players to duel:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
        {candidates.map((id) => (
          <button
            key={id}
            onClick={() => toggle(id)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 20,
              border: selected.includes(id) ? '2px solid gold' : '1px solid #555',
              background: selected.includes(id) ? '#4a3000' : '#1e2a3b',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: selected.includes(id) ? 700 : 400,
            }}
          >
            {playerName(id)}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          if (selected.length < 2) return;
          onPick([selected[0], selected[1]]);
        }}
        disabled={selected.length < 2}
        style={{
          padding: '0.6rem 1.5rem',
          borderRadius: 8,
          background: selected.length === 2 ? '#7c3aed' : '#4b5563',
          color: '#fff',
          border: 'none',
          cursor: selected.length === 2 ? 'pointer' : 'not-allowed',
        }}
      >
        Send to Duel
      </button>
    </div>
  );
}
