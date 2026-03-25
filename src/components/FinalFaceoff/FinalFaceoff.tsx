/**
 * FinalFaceoff — fullscreen overlay for the jury voting finale sequence.
 *
 * Mounted by AppShell when game.phase === 'jury'.
 * Coordinates:
 *   1. SeasonRecapCinematic  — played once before vote reveal
 *   2. Tribunal vote board   — clue-based juror reveals, staged vote chip, juror flash
 *   3. Winner banner / tally
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { Player } from '../../types';
import useSound from '../../hooks/useSound';
import {
  startFinale,
  revealNextJurorThunk,
  skipAllJurorsThunk,
  castVote,
  finalizeFinale,
  dismissFinale,
  selectFinale,
  selectRevealedJurors,
  PUBLIC_JUROR_ID,
} from '../../store/finaleSlice';
import {
  finalizeGame,
  startWinnerCinematic,
} from '../../store/gameSlice';
import { selectSettings } from '../../store/settingsSlice';
import { tallyVotes, aiJurorVote } from '../../utils/juryUtils';
import { selectPublicOpinion } from '../../publicOpinion';
import JurorBubble from './JurorBubble';
import FinalTallyPanel from './FinalTallyPanel';
import FinaleControls from './FinaleControls';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import SeasonRecapCinematic from '../SeasonRecapCinematic/SeasonRecapCinematic';
import './FinalFaceoff.css';

export default function FinalFaceoff() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const finale = useAppSelector(selectFinale);
  const revealed = useAppSelector(selectRevealedJurors);
  const settings = useAppSelector(selectSettings);
  const publicOpinion = useAppSelector(selectPublicOpinion);
  const { play } = useSound();

  const jurorListRef = useRef<HTMLDivElement>(null);

  // ── Recap / cinematic gate ─────────────────────────────────────────────
  const [recapDone, setRecapDone] = useState(false);
  const handleRecapComplete = useCallback(() => setRecapDone(true), []);

  // ── Staged vote reveal: track which jurors have their vote chip visible ─
  // Keys are jurorIds; value = true once the chip appears (after ~2.4s delay).
  const [voteVisible, setVoteVisible] = useState<Record<string, boolean>>({});
  // Track the jurorId that was most recently attributed (triggers flash).
  const [flashingJurorId, setFlashingJurorId] = useState<string | null>(null);
  const prevRevealedCountRef = useRef(0);
  const voteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      for (const timer of Object.values(voteTimersRef.current)) clearTimeout(timer);
      for (const timer of Object.values(flashTimersRef.current)) clearTimeout(timer);
      voteTimersRef.current = {};
      flashTimersRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const newCount = revealed.length;
    const prevCount = prevRevealedCountRef.current;
    prevRevealedCountRef.current = newCount;

    if (newCount <= prevCount) return;

    const newlyRevealed = revealed.slice(prevCount);

    for (const r of newlyRevealed) {
      const { jurorId } = r;
      play('tv:event');
      voteTimersRef.current[jurorId] = setTimeout(() => {
        delete voteTimersRef.current[jurorId];
        setVoteVisible((prev) => ({ ...prev, [jurorId]: true }));
        play('ui:jury_vote');
        setFlashingJurorId(jurorId);
        flashTimersRef.current[jurorId] = setTimeout(
          () => {
            delete flashTimersRef.current[jurorId];
            setFlashingJurorId((cur) => (cur === jurorId ? null : cur));
          },
          800,
        );
      }, 2400);
    }
  }, [play, revealed]);

  // When finale completes (skip-all or auto-finalize), make all votes visible
  useEffect(() => {
    if (!finale.isComplete) return;
    for (const timer of Object.values(voteTimersRef.current)) clearTimeout(timer);
    for (const timer of Object.values(flashTimersRef.current)) clearTimeout(timer);
    voteTimersRef.current = {};
    flashTimersRef.current = {};
    const allVisible: Record<string, boolean> = {};
    for (const r of revealed) {
      allVisible[r.jurorId] = true;
    }
    const t = setTimeout(() => setVoteVisible(allVisible), 0);
    return () => clearTimeout(t);
  }, [finale.isComplete, revealed]);

  // ── Initialise finale on first render ──────────────────────────────────
  useEffect(() => {
    if (finale.hasStarted) return;

    const finalists = game.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const jurors = game.players.filter((p) => p.status === 'jury');
    const preJury = game.players.filter((p) => p.status === 'evicted');
    const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id);

    // Pass public approval profiles to enable the Public's jury vote
    const hasPublicProfiles = Object.keys(publicOpinion.profiles).length > 0;

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
        publicApprovalProfiles: hasPublicProfiles ? publicOpinion.profiles : undefined,
      }),
    );
  }, [dispatch, finale.hasStarted, game.players, game.seed, game.cfg, publicOpinion.profiles]);

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
      const publicFavoriteEnabled =
        settings.sim.enableFavoritePlayer && settings.sim.enableTwists;
      dispatch(
        finalizeGame({ winnerId: finale.winnerId, runnerUpId: finale.runnerUpId }),
      );
      dispatch(
        startWinnerCinematic({
          winnerId: finale.winnerId,
          seed: game.seed,
          publicFavoriteEnabled,
        }),
      );
      dispatch(dismissFinale());
    }
  }, [
    dispatch,
    game.seed,
    finale.isComplete,
    finale.winnerId,
    finale.runnerUpId,
    settings.sim.enableFavoritePlayer,
    settings.sim.enableTwists,
  ]);

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

  useEffect(() => {
    if (!recapDone) return;
    play('tv:event');
  }, [play, recapDone]);

  if (!finale.isActive) return null;

  // Show season recap cinematic before the vote reveal
  if (!recapDone) {
    return (
      <SeasonRecapCinematic
        season={game.season}
        week={game.week}
        players={game.players}
        onComplete={handleRecapComplete}
      />
    );
  }

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
    <div className="fo-overlay" role="dialog" aria-label="Tribunal Finale">
      {/* Header */}
      <div className="fo-header">
        <h2 className="fo-title">🏛️ The Final Tribunal</h2>
        <p className="fo-subtitle">
          {finale.isComplete
            ? `${winner ? `${winner.name} wins The Big Eye!` : 'Winner declared!'} 🏆`
            : `${finale.revealedCount} / ${finale.revealOrder.length} judges revealed`}
        </p>
      </div>

      {/* Jury-return notice */}
      {finale.returnedJurorId && (
        <div className="fo-jury-return">
          🔁 Tribunal Return: {game.players.find((p) => p.id === finale.returnedJurorId)?.name ?? ''} rejoined the Tribunal!
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
          const finalist = game.players.find((p) => p.id === r.finalistId);
          if (r.jurorId === PUBLIC_JUROR_ID) {
            const publicJuror = {
              id: PUBLIC_JUROR_ID,
              name: 'The Public 🌐',
              avatar: '🌐',
              status: 'jury' as const,
            };
            return (
              <JurorBubble
                key={PUBLIC_JUROR_ID}
                juror={publicJuror}
                finalist={finalist}
                reveal={r}
                voteVisible={voteVisible[PUBLIC_JUROR_ID] ?? false}
                isFlashing={flashingJurorId === PUBLIC_JUROR_ID}
              />
            );
          }
          const juror = game.players.find((p) => p.id === r.jurorId);
          if (!juror) return null;
          return (
            <JurorBubble
              key={r.jurorId}
              juror={juror}
              finalist={finalist}
              reveal={r}
              voteVisible={voteVisible[r.jurorId] ?? false}
              isFlashing={flashingJurorId === r.jurorId}
            />
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
                aria-label={`Cast Tribunal vote for ${f.name}`}
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
