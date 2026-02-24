/**
 * FinalFaceoff — fullscreen overlay for the jury voting finale sequence.
 *
 * Mounted by AppShell when game.phase === 'jury'.
 * Coordinates juror reveals, human-vote UI, tally display, and winner banner.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { Player } from '../../types';
import {
  startFinale,
  revealNextJurorThunk,
  skipAllJurorsThunk,
  castVote,
  finalizeFinale,
  dismissFinale,
  selectFinale,
  selectRevealedJurors,
} from '../../store/finaleSlice';
import { finalizeGame } from '../../store/gameSlice';
import { tallyVotes, aiJurorVote } from '../../utils/juryUtils';
import JurorBubble from './JurorBubble';
import FinalTallyPanel from './FinalTallyPanel';
import FinaleControls from './FinaleControls';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './FinalFaceoff.css';

export default function FinalFaceoff() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const game = useAppSelector((s) => s.game);
  const finale = useAppSelector(selectFinale);
  const revealed = useAppSelector(selectRevealedJurors);

  const jurorListRef = useRef<HTMLDivElement>(null);

  // ── Initialise finale on first render ──────────────────────────────────
  useEffect(() => {
    if (finale.hasStarted) return;

    const finalists = game.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const jurors = game.players.filter((p) => p.status === 'jury');
    const preJury = game.players.filter((p) => p.status === 'evicted');
    const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id);

    dispatch(
      startFinale({
        finalistIds: finalists.map((p) => p.id),
        jurorIds: jurors.map((p) => p.id),
        preJuryIds: preJury.map((p) => p.id),
        humanPlayerIds: humanIds,
        seed: game.seed,
        cfg: {
          enableJuryReturn: game.cfg?.enableJuryReturn,
          americasVoteEnabled: game.cfg?.americasVoteEnabled,
        },
      }),
    );
  }, [dispatch, finale.hasStarted, game.players, game.seed, game.cfg]);

  // ── Auto-finalize once all jurors revealed ─────────────────────────────
  useEffect(() => {
    if (
      finale.isActive &&
      finale.revealOrder.length > 0 &&
      finale.revealedCount >= finale.revealOrder.length &&
      !finale.isComplete
    ) {
      dispatch(finalizeFinale({ seed: game.seed }));
    }
  }, [
    dispatch,
    finale.isActive,
    finale.revealedCount,
    finale.revealOrder.length,
    finale.isComplete,
    game.seed,
    game.cfg?.americasVoteEnabled,
  ]);

  // ── Persist winner to game state once decided ──────────────────────────
  const winnerPersistedRef = useRef(false);
  useEffect(() => {
    if (finale.isComplete && finale.winnerId && finale.runnerUpId && !winnerPersistedRef.current) {
      winnerPersistedRef.current = true;
      dispatch(
        finalizeGame({ winnerId: finale.winnerId, runnerUpId: finale.runnerUpId }),
      );
      navigate('/game-over');
    }
  }, [dispatch, navigate, finale.isComplete, finale.winnerId, finale.runnerUpId]);

  // ── Auto-timeout: if human juror hasn't voted, fall back to AI ────────
  useEffect(() => {
    const awaitingId = finale.awaitingHumanJurorId;
    if (!awaitingId || finale.isComplete) return;
    const timeoutMs = game.cfg?.tVoteReveal ?? 30_000;
    const timer = setTimeout(() => {
      const aiVote = aiJurorVote(awaitingId, finale.finalistIds, game.seed);
      dispatch(castVote({ jurorId: awaitingId, finalistId: aiVote }));
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [
    dispatch,
    finale.awaitingHumanJurorId,
    finale.isComplete,
    finale.finalistIds,
    game.cfg?.tVoteReveal,
    game.seed,
  ]);

  // ── Auto-scroll jury list to bottom on new reveals ─────────────────────
  useEffect(() => {
    if (jurorListRef.current) {
      jurorListRef.current.scrollTop = jurorListRef.current.scrollHeight;
    }
  }, [revealed.length]);

  if (!finale.isActive) return null;

  // Build finalists list with proper type safety (no non-null assertion)
  const finalists: Player[] = [];
  for (const id of finale.finalistIds) {
    const player = game.players.find((p) => p.id === id);
    if (player) finalists.push(player);
  }
  // Only tally votes for jurors that have already been revealed
  const revealedVotesMap: Record<string, string> = {};
  for (const r of revealed) {
    revealedVotesMap[r.jurorId] = r.finalistId;
  }
  const tally = finale.isComplete ? tallyVotes(finale.votes) : tallyVotes(revealedVotesMap);
  const winner = game.players.find((p) => p.id === finale.winnerId);
  const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id);
  // allRevealed: true when all jurors are revealed OR when there are none (skip to tally)
  const allRevealed =
    finale.revealOrder.length === 0 ||
    finale.revealedCount >= finale.revealOrder.length;
  const awaitingHuman = finale.awaitingHumanJurorId;
  const awaitingHumanPlayer = awaitingHuman
    ? game.players.find((p) => p.id === awaitingHuman)
    : null;

  function handleRevealNext() {
    dispatch(revealNextJurorThunk(humanIds));
  }

  function handleSkipAll() {
    dispatch(skipAllJurorsThunk(humanIds, game.seed));
  }

  function handleCastVote(finalistId: string) {
    if (!awaitingHuman) return;
    dispatch(castVote({ jurorId: awaitingHuman, finalistId }));
  }

  function handleDismiss() {
    dispatch(dismissFinale());
  }

  return (
    <div className="fo-overlay" role="dialog" aria-label="Jury Finale">
      {/* Header */}
      <div className="fo-header">
        <h2 className="fo-title">🏛️ The Final Jury</h2>
        <p className="fo-subtitle">
          {finale.isComplete
            ? `${winner ? `${winner.name} wins Big Brother!` : 'Winner declared!'} 🏆`
            : `${finale.revealedCount} / ${finale.revealOrder.length} jurors revealed`}
        </p>
      </div>

      {/* Jury-return notice */}
      {finale.returnedJurorId && (
        <div className="fo-jury-return">
          🔁 Jury Return: {game.players.find((p) => p.id === finale.returnedJurorId)?.name ?? ''} rejoined the jury!
        </div>
      )}

      {/* Finalists */}
      <div className="fo-finalists">
        {finalists.map((f) => (
          <div
            key={f.id}
            className={`fo-finalist${finale.winnerId === f.id ? ' fo-finalist--winner' : ''}`}
          >
            {finale.winnerId === f.id && <span className="fo-winner-badge">WINNER</span>}
            <PlayerAvatar player={f} size="md" showRelationshipOutline={false} />
            <span className="fo-finalist__name">{f.name}</span>
            <span className="fo-finalist__votes">{tally[f.id] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Juror reveal list */}
      <div className="fo-jurors" ref={jurorListRef}>
        {revealed.map((r) => {
          const juror = game.players.find((p) => p.id === r.jurorId);
          const finalist = game.players.find((p) => p.id === r.finalistId);
          if (!juror) return null;
          return (
            <JurorBubble key={r.jurorId} juror={juror} finalist={finalist} reveal={r} />
          );
        })}
      </div>

      {/* Tally panel */}
      <FinalTallyPanel finalists={finalists} tally={tally} />

      {/* Human vote UI */}
      {awaitingHumanPlayer && !finale.isComplete && (
        <div className="fo-human-vote">
          <span className="fo-human-vote__prompt">
            <PlayerAvatar player={awaitingHumanPlayer} size="sm" showRelationshipOutline={false} />
            <span className="fo-human-vote__prompt-text">
              {awaitingHumanPlayer.name}, cast your jury vote:
            </span>
          </span>
          <div className="fo-human-vote__choices">
            {finalists.map((f) => (
              <button
                key={f.id}
                type="button"
                className="fo-human-vote__choice"
                aria-label={`Cast jury vote for ${f.name}`}
                onClick={() => handleCastVote(f.id)}
              >
                <PlayerAvatar player={f} size="sm" showRelationshipOutline={false} />
                <span className="fo-human-vote__choice-name">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <FinaleControls
        allRevealed={allRevealed}
        isComplete={finale.isComplete}
        onRevealNext={handleRevealNext}
        onSkipAll={handleSkipAll}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
