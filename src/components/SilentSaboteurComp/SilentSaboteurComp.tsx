/**
 * SilentSaboteurComp — React UI for the "Silent Saboteur" minigame.
 *
 * Phases: intro → select_saboteur → select_victim → voting → reveal →
 *         round_transition → (loop) → final2_jury → winner → complete
 *
 * Human interactions:
 *   - select_victim  (if human is saboteur): choose a target
 *   - voting         (if human is active): vote for suspected saboteur
 *   - final2_jury    (if human is a juror): vote for who planted the bomb
 *   - final2_jury    (if human is victim AND jury tied): cast tiebreak vote
 *
 * All AI actions are dispatched automatically via useEffect timers.
 * All timeouts auto-resolve with a deterministic fallback so the game
 * never stalls even if the human window closes.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store/store';
import {
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  advanceReveal,
  startNextRound,
  submitJuryVote,
  submitFinal2TieBreak,
  advanceWinner,
} from '../../features/silentSaboteur/silentSaboteurSlice';
import { resolveSilentSaboteurOutcome } from '../../features/silentSaboteur/thunks';
import { pickVictimForAi, pickVoteForAi } from '../../features/silentSaboteur/helpers';
import type { SilentSaboteurPrizeType } from '../../features/silentSaboteur/silentSaboteurSlice';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './SilentSaboteurComp.css';

// ─── Constants ─────────────────────────────────────────────────────────────────

const INTRO_ADVANCE_MS = 2500;
const SELECT_VICTIM_TIMEOUT_MS = 10_000;
const VOTING_TIMEOUT_MS = 12_000;
const REVEAL_HOLD_MS = 3_000;
const ROUND_TRANSITION_MS = 1_500;
const WINNER_ADVANCE_MS = 3_000;
const AI_ACTION_DELAY_MS = 1_200;
const JURY_VOTE_TIMEOUT_MS = 12_000;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: SilentSaboteurPrizeType;
  seed: number;
  onComplete?: () => void;
  standalone?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SilentSaboteurComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
  standalone = false,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const ss = useSelector(
    (s: RootState & { silentSaboteur?: ReturnType<typeof import('../../features/silentSaboteur/silentSaboteurSlice').default> }) =>
      s.silentSaboteur,
  );

  // Resolve name lookup
  const nameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of (participants ?? [])) {
      map[p.id] = p.name;
    }
    return map;
  }, [participants]);

  const getName = useCallback(
    (id: string) => nameMap[id] ?? id,
    [nameMap],
  );

  // Derive values from state (using defaults when ss is not yet initialized)
  const phase = ss?.phase ?? 'idle';
  const activeIds = ss?.activeIds ?? [];
  const eliminatedIds = ss?.eliminatedIds ?? [];
  const humanPlayerId = ss?.humanPlayerId ?? null;
  const saboteurId = ss?.saboteurId ?? null;
  const revealInfo = ss?.revealInfo ?? null;
  const final2SaboteurId = ss?.final2SaboteurId ?? null;
  const final2VictimId = ss?.final2VictimId ?? null;
  const winnerId = ss?.winnerId ?? null;
  const round = ss?.round ?? 0;

  // Stable references for object-typed state to avoid exhaustive-deps warnings
  const votes = useMemo(() => ss?.votes ?? {}, [ss?.votes]);
  const juryVotes = useMemo(() => ss?.juryVotes ?? {}, [ss?.juryVotes]);

  const isHumanActive = humanPlayerId !== null && activeIds.includes(humanPlayerId);
  const isHumanSaboteur = humanPlayerId !== null && saboteurId === humanPlayerId;
  const isHumanJuror = humanPlayerId !== null && eliminatedIds.includes(humanPlayerId);

  // ── Init ───────────────────────────────────────────────────────────────────
  // Empty deps: intentionally fires once on mount. participantIds/prizeType/seed
  // are stable for the lifetime of the competition.
  useEffect(() => {
    const humanId = participants?.find((p) => p.isHuman)?.id ?? null;
    dispatch(
      initSilentSaboteur({
        participantIds,
        prizeType,
        seed,
        humanPlayerId: humanId,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase-driven side effects (all hooks unconditionally declared)
  // ─────────────────────────────────────────────────────────────────────────

  // Intro: auto-advance
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => dispatch(advanceIntro()), INTRO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch]);

  // select_victim: AI saboteur auto-picks; human saboteur has timeout fallback.
  // Deps limited to [phase, saboteurId]: we want exactly one timer per phase
  // entry. Other values (activeIds, seed, round) are stable during select_victim
  // and captured correctly at the time this effect runs.
  useEffect(() => {
    if (phase !== 'select_victim' || !saboteurId) return;

    if (!isHumanSaboteur) {
      // AI saboteur: auto-pick after brief delay
      const t = setTimeout(() => {
        const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
        dispatch(selectVictim({ victimId: victim }));
      }, AI_ACTION_DELAY_MS);
      return () => clearTimeout(t);
    } else {
      // Human saboteur: timeout fallback
      const t = setTimeout(() => {
        const candidates = activeIds.filter((id) => id !== saboteurId);
        if (candidates.length > 0) {
          const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
          dispatch(selectVictim({ victimId: victim }));
        }
      }, SELECT_VICTIM_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, saboteurId]); // intentional: one timer per phase entry

  // voting: AI voters auto-vote; human voter has timeout fallback.
  // Deps limited to [phase]: the full vote batch is set up once per voting phase.
  // Re-running on each vote change would reset timers unnecessarily.
  useEffect(() => {
    if (phase !== 'voting') return;

    const aiVoters = activeIds.filter((id) => id !== humanPlayerId);
    const delays: ReturnType<typeof setTimeout>[] = [];

    for (const voterId of aiVoters) {
      if (votes[voterId] !== undefined) continue;
      const t = setTimeout(() => {
        const accused = pickVoteForAi(seed, round, voterId, activeIds);
        dispatch(submitVote({ voterId, accusedId: accused }));
      }, AI_ACTION_DELAY_MS + Math.floor(voterId.length * 37) % 800);
      delays.push(t);
    }

    // Human timeout fallback
    if (humanPlayerId && isHumanActive && votes[humanPlayerId] === undefined) {
      const t = setTimeout(() => {
        const accused = pickVoteForAi(seed, round, humanPlayerId, activeIds);
        dispatch(submitVote({ voterId: humanPlayerId, accusedId: accused }));
      }, VOTING_TIMEOUT_MS);
      delays.push(t);
    }

    return () => delays.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]); // intentional: one batch per voting phase

  // reveal: auto-advance after hold
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => dispatch(advanceReveal()), REVEAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch]);

  // round_transition: auto-start next round
  useEffect(() => {
    if (phase !== 'round_transition') return;
    const t = setTimeout(() => dispatch(startNextRound()), ROUND_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch]);

  // final2_jury: human juror timeout fallback (AI votes pre-computed in slice).
  // Deps: [phase, juryVotes] — re-check when a jury vote is added in case human
  // still hasn't voted (safe: guard inside avoids duplicate dispatch).
  useEffect(() => {
    if (phase !== 'final2_jury') return;
    if (!isHumanJuror || !final2SaboteurId || !final2VictimId) return;
    if (humanPlayerId && juryVotes[humanPlayerId] !== undefined) return;

    const t = setTimeout(() => {
      if (!humanPlayerId) return;
      const finalists = [final2SaboteurId, final2VictimId];
      const accused = pickVoteForAi(seed, 9999, humanPlayerId, finalists);
      const safeAccused = finalists.includes(accused) ? accused : finalists[0];
      dispatch(submitJuryVote({ jurorId: humanPlayerId, accusedId: safeAccused }));
    }, JURY_VOTE_TIMEOUT_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, juryVotes]); // intentional: one timer per phase/vote-change

  // winner: auto-advance
  useEffect(() => {
    if (phase !== 'winner') return;
    const t = setTimeout(() => dispatch(advanceWinner()), WINNER_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch]);

  // complete: dispatch outcome + notify parent
  useEffect(() => {
    if (phase !== 'complete') return;
    if (!standalone) {
      dispatch(resolveSilentSaboteurOutcome());
    }
    onComplete?.();
  }, [phase, dispatch, onComplete, standalone]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    (accusedId: string) => {
      if (!humanPlayerId || votes[humanPlayerId] !== undefined) return;
      dispatch(submitVote({ voterId: humanPlayerId, accusedId }));
    },
    [dispatch, humanPlayerId, votes],
  );

  const handleSelectVictim = useCallback(
    (id: string) => {
      dispatch(selectVictim({ victimId: id }));
    },
    [dispatch],
  );

  const handleJuryVote = useCallback(
    (accusedId: string) => {
      if (!humanPlayerId) return;
      if (juryVotes[humanPlayerId] !== undefined) return;
      dispatch(submitJuryVote({ jurorId: humanPlayerId, accusedId }));
    },
    [dispatch, humanPlayerId, juryVotes],
  );

  const handleTieBreak = useCallback(
    (accusedId: string) => {
      if (!humanPlayerId || humanPlayerId !== final2VictimId) return;
      dispatch(submitFinal2TieBreak({ victimId: humanPlayerId, accusedId }));
    },
    [dispatch, humanPlayerId, final2VictimId],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render (early-exit guard after all hooks)
  // ─────────────────────────────────────────────────────────────────────────

  if (!ss) return null;

  return (
    <div className="ss-wrap" aria-live="polite">
      {phase === 'intro' && (
        <div className="ss-intro ss-cinematic">
          <div className="ss-bomb-icon" aria-hidden="true">💣</div>
          <h1 className="ss-title">Silent Saboteur</h1>
          <p className="ss-subtitle">Someone among you has planted a bomb…</p>
        </div>
      )}

      {(phase === 'select_saboteur' || phase === 'select_victim') && (
        <div className="ss-phase-card ss-cinematic">
          {phase === 'select_saboteur' && (
            <p className="ss-phase-label">🔍 Selecting a hidden saboteur…</p>
          )}
          {phase === 'select_victim' && (
            <>
              <p className="ss-phase-label">
                {isHumanSaboteur
                  ? '💣 You are the saboteur! Choose your victim.'
                  : '💣 The saboteur is choosing a victim…'}
              </p>
              {isHumanSaboteur && (
                <ul className="ss-button-list" role="list">
                  {activeIds
                    .filter((id) => id !== saboteurId)
                    .map((id) => (
                      <li key={id}>
                        <button
                          className="ss-btn ss-btn--danger"
                          onClick={() => handleSelectVictim(id)}
                          aria-label={`Plant bomb on ${getName(id)}`}
                        >
                          🎯 {getName(id)}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          <PlayerList activeIds={activeIds} getName={getName} />
        </div>
      )}

      {phase === 'voting' && (
        <div className="ss-phase-card">
          <h2 className="ss-phase-label">🗳️ Round {round + 1} — Vote for the Saboteur</h2>
          <p className="ss-hint">
            {isHumanActive && votes[humanPlayerId!] === undefined
              ? 'Choose who you think is the saboteur:'
              : isHumanActive
              ? '✅ Vote cast. Waiting for others…'
              : '(You are spectating this vote)'}
          </p>
          {isHumanActive && votes[humanPlayerId!] === undefined && (
            <ul className="ss-button-list" role="list">
              {activeIds
                .filter((id) => id !== humanPlayerId)
                .map((id) => (
                  <li key={id}>
                    <button
                      className="ss-btn ss-btn--vote"
                      onClick={() => handleVote(id)}
                      aria-label={`Accuse ${getName(id)}`}
                    >
                      🫵 {getName(id)}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <VoteProgress activeIds={activeIds} votes={votes} getName={getName} />
        </div>
      )}

      {phase === 'reveal' && revealInfo && (
        <div className="ss-phase-card ss-cinematic">
          <h2 className="ss-reveal-title">
            {revealInfo.reason === 'saboteur_caught' ? '🎉 Saboteur Caught!' : '💥 Bomb Detonated!'}
          </h2>
          {revealInfo.victimOverride && (
            <p className="ss-override-badge">⚡ Victim Override Rule Applied</p>
          )}
          <p className="ss-reveal-body">
            <strong>{getName(revealInfo.eliminatedId)}</strong>{' '}
            {revealInfo.reason === 'saboteur_caught'
              ? 'was the saboteur and has been eliminated.'
              : 'was the victim and has been eliminated.'}
          </p>
          <p className="ss-reveal-detail">
            Saboteur was: <strong>{getName(revealInfo.saboteurId)}</strong>
            {' '}| Victim was: <strong>{getName(revealInfo.victimId)}</strong>
          </p>
          <VoteBreakdown votes={revealInfo.votes} saboteurId={revealInfo.saboteurId} getName={getName} />
        </div>
      )}

      {phase === 'round_transition' && (
        <div className="ss-phase-card ss-cinematic">
          <p className="ss-phase-label">⏳ {activeIds.length} players remain…</p>
          <PlayerList activeIds={activeIds} getName={getName} />
        </div>
      )}

      {phase === 'final2_jury' && final2SaboteurId && final2VictimId && (
        <div className="ss-phase-card ss-final2">
          <h2 className="ss-phase-label">🏁 Final 2 — Jury Deduction Finale</h2>
          <p className="ss-hint">
            Finalists: <strong>{getName(activeIds[0] ?? '')}</strong> &amp;{' '}
            <strong>{getName(activeIds[1] ?? '')}</strong>
          </p>
          <p className="ss-hint hint-small">One of them planted the bomb. Jury, cast your vote!</p>
          {isHumanJuror && juryVotes[humanPlayerId!] === undefined && (
            <>
              <p className="ss-hint">Who planted the bomb?</p>
              <ul className="ss-button-list" role="list">
                {activeIds.map((id) => (
                  <li key={id}>
                    <button
                      className="ss-btn ss-btn--vote"
                      onClick={() => handleJuryVote(id)}
                      aria-label={`Accuse ${getName(id)} of planting the bomb`}
                    >
                      🫵 {getName(id)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {isHumanJuror && juryVotes[humanPlayerId!] !== undefined && (
            <p className="ss-hint">✅ Vote cast. Waiting for verdict…</p>
          )}
          {/* Human victim tiebreak — shown when jury tied and human is victim */}
          {humanPlayerId === final2VictimId && (() => {
            const allV = Object.values(juryVotes);
            const total = allV.length;
            const sabV = allV.filter((v) => v === final2SaboteurId).length;
            const isTied = total > 0 && sabV * 2 === total;
            if (!isTied) return <p className="ss-hint hint-small">You are a finalist. Waiting for jury…</p>;
            return (
              <>
                <p className="ss-hint">⚠️ Jury is tied! You must cast the deciding vote.</p>
                <ul className="ss-button-list" role="list">
                  {activeIds.map((id) => (
                    <li key={id}>
                      <button
                        className="ss-btn ss-btn--vote"
                        onClick={() => handleTieBreak(id)}
                        aria-label={`Accuse ${getName(id)} of planting the bomb (tiebreaker)`}
                      >
                        🫵 {getName(id)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
          <JuryProgress jurorIds={eliminatedIds} juryVotes={juryVotes} getName={getName} />
        </div>
      )}

      {phase === 'winner' && winnerId && (
        <div className="ss-winner-card ss-cinematic">
          <div className="ss-trophy" aria-hidden="true">🏆</div>
          <h2 className="ss-winner-name">{getName(winnerId)}</h2>
          <p className="ss-winner-label">
            {humanPlayerId === winnerId ? "🎉 You won!" : 'wins Silent Saboteur!'}
          </p>
        </div>
      )}

      {phase === 'complete' && (
        <div className="ss-phase-card ss-cinematic">
          <p className="ss-phase-label">✅ Competition complete.</p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PlayerList({
  activeIds,
  getName,
}: {
  activeIds: string[];
  getName: (id: string) => string;
}) {
  return (
    <ul className="ss-player-list" aria-label="Active players">
      {activeIds.map((id) => (
        <li key={id} className="ss-player-chip">
          {getName(id)}
        </li>
      ))}
    </ul>
  );
}

function VoteProgress({
  activeIds,
  votes,
  getName,
}: {
  activeIds: string[];
  votes: Record<string, string>;
  getName: (id: string) => string;
}) {
  const voted = Object.keys(votes).length;
  return (
    <p className="ss-vote-progress" aria-label={`${voted} of ${activeIds.length} votes cast`}>
      {activeIds.map((id) => (
        <span key={id} className={`ss-vote-dot ${votes[id] !== undefined ? 'ss-vote-dot--cast' : ''}`} title={getName(id)}>
          {votes[id] !== undefined ? '✅' : '⏳'}
        </span>
      ))}
      {' '}{voted}/{activeIds.length} voted
    </p>
  );
}

function VoteBreakdown({
  votes,
  saboteurId,
  getName,
}: {
  votes: Record<string, string>;
  saboteurId: string;
  getName: (id: string) => string;
}) {
  const saboteurVotes = Object.values(votes).filter((v) => v === saboteurId).length;
  return (
    <p className="ss-vote-breakdown">
      Votes for saboteur ({getName(saboteurId)}): <strong>{saboteurVotes}</strong> of{' '}
      <strong>{Object.values(votes).length}</strong>
    </p>
  );
}

function JuryProgress({
  jurorIds,
  juryVotes,
  getName,
}: {
  jurorIds: string[];
  juryVotes: Record<string, string>;
  getName: (id: string) => string;
}) {
  const voted = Object.keys(juryVotes).length;
  return (
    <p className="ss-vote-progress">
      {jurorIds.map((id) => (
        <span key={id} className={`ss-vote-dot ${juryVotes[id] !== undefined ? 'ss-vote-dot--cast' : ''}`} title={getName(id)}>
          {juryVotes[id] !== undefined ? '✅' : '⏳'}
        </span>
      ))}
      {' '}{voted}/{jurorIds.length} jury votes cast
    </p>
  );
}
