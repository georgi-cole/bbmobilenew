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

import { useEffect, useCallback, useMemo, useState } from 'react';
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
import type {
  SilentSaboteurPrizeType,
} from '../../features/silentSaboteur/silentSaboteurSlice';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './SilentSaboteurComp.css';

// ─── Constants ─────────────────────────────────────────────────────────────────

const INTRO_ADVANCE_MS = 2500;
const BOMB_REVEAL_MS = 2200;
const SELECT_VICTIM_TIMEOUT_MS = 10_000;
const VOTING_TIMEOUT_MS = 12_000;
const VOTE_REVEAL_STEP_MS = 650;
const REVEAL_RESULT_PAUSE_MS = 550;
const ELIMINATION_HOLD_MS = 2200;
const ROUND_TRANSITION_MS = 1500;
const WINNER_AUTO_ADVANCE_MS = 6000;
const AI_ACTION_DELAY_MS = 1200;
const JURY_VOTE_TIMEOUT_MS = 12_000;
const TIMER_TICK_MS = 250;

type VisualPhaseKey =
  | 'SABOTAGE_PHASE'
  | 'BOMB_REVEAL_PHASE'
  | 'VOTING_PHASE'
  | 'RESOLUTION_PHASE'
  | 'ELIMINATION_PHASE'
  | 'WINNER_PHASE';

type RevealStage = 'votes' | 'elimination';

interface PhaseBannerModel {
  key: VisualPhaseKey;
  label: string;
  detail: string;
  tone: 'sabotage' | 'bomb' | 'vote' | 'resolution' | 'elimination' | 'winner';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: SilentSaboteurPrizeType;
  seed: number;
  onComplete?: () => void;
  standalone?: boolean;
}

function areAnimationsDisabled() {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function emitSilentSaboteurEvent(type: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(`silentSaboteur:${type}`, { detail }));
  } catch {
    // ignore — optional presentation hook only
  }
}

function getPhaseBannerModel({
  phase,
  round,
  bombRevealVisible,
  revealStage,
  final2,
}: {
  phase: string;
  round: number;
  bombRevealVisible: boolean;
  revealStage: RevealStage;
  final2: boolean;
}): PhaseBannerModel {
  if (phase === 'winner' || phase === 'complete') {
    return {
      key: 'WINNER_PHASE',
      label: '🏁 Final Verdict',
      detail: 'Winner revealed',
      tone: 'winner',
    };
  }

  if (phase === 'reveal') {
    if (revealStage === 'votes') {
      return {
        key: 'RESOLUTION_PHASE',
        label: '⚖️ Resolution',
        detail: 'Votes are being revealed',
        tone: 'resolution',
      };
    }

    return {
      key: 'ELIMINATION_PHASE',
      label: '🚨 Elimination Reveal',
      detail: 'The outcome is locked in',
      tone: 'elimination',
    };
  }

  if (phase === 'round_transition') {
    return {
      key: 'ELIMINATION_PHASE',
      label: '🚨 Elimination Reveal',
      detail: 'Preparing the next round',
      tone: 'elimination',
    };
  }

  if (bombRevealVisible) {
    return {
      key: 'BOMB_REVEAL_PHASE',
      label: '🌑 Bomb Planted',
      detail: 'The victim has been marked',
      tone: 'bomb',
    };
  }

  if (phase === 'voting' || phase === 'final2_jury') {
    return {
      key: 'VOTING_PHASE',
      label: final2 ? '🏁 Final Verdict' : '🗳️ Investigation',
      detail: final2 ? 'Jury deduction in progress' : `Round ${round + 1} voting`,
      tone: 'vote',
    };
  }

  return {
    key: 'SABOTAGE_PHASE',
    label: '💣 Sabotage Phase',
    detail: phase === 'intro' ? 'Setting the stage' : `Round ${round + 1} sabotage`,
    tone: 'sabotage',
  };
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
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

  const [bombRevealVisible, setBombRevealVisible] = useState(false);
  const [revealStage, setRevealStage] = useState<RevealStage>('votes');
  const [revealedVoteCount, setRevealedVoteCount] = useState(0);
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  const animationsDisabled = areAnimationsDisabled();

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
  const victimId = ss?.victimId ?? null;
  const revealInfo = ss?.revealInfo ?? null;
  const final2SaboteurId = ss?.final2SaboteurId ?? null;
  const final2VictimId = ss?.final2VictimId ?? null;
  const winnerId = ss?.winnerId ?? null;
  const round = ss?.round ?? 0;

  // Stable references for object-typed state to avoid exhaustive-deps warnings
  const votes = useMemo(() => ss?.votes ?? {}, [ss?.votes]);
  const juryVotes = useMemo(() => ss?.juryVotes ?? {}, [ss?.juryVotes]);
  const revealVoteEntries = useMemo<Array<[string, string]>>(
    () => (revealInfo ? Object.entries(revealInfo.votes) : []),
    [revealInfo],
  );

  const isHumanActive = humanPlayerId !== null && activeIds.includes(humanPlayerId);
  const isHumanSaboteur = humanPlayerId !== null && saboteurId === humanPlayerId;
  const isHumanJuror = humanPlayerId !== null && eliminatedIds.includes(humanPlayerId);
  const hasHumanParticipant = humanPlayerId !== null;
  const final2Mode = phase === 'final2_jury';
  const shouldAutoAdvanceWinner = animationsDisabled || !hasHumanParticipant;

  const banner = useMemo(
    () => getPhaseBannerModel({ phase, round, bombRevealVisible, revealStage, final2: final2Mode }),
    [phase, round, bombRevealVisible, revealStage, final2Mode],
  );

  const countdownDurationMs = final2Mode ? JURY_VOTE_TIMEOUT_MS : VOTING_TIMEOUT_MS;
  const remainingCountdownMs =
    countdownStartedAt == null
      ? countdownDurationMs
      : Math.max(0, countdownDurationMs - (countdownNow - countdownStartedAt));

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

  // Bomb reveal: brief cinematic hold after the victim is selected.
  useEffect(() => {
    if (phase !== 'voting' || !victimId) {
      setBombRevealVisible(false);
      return;
    }

    setBombRevealVisible(true);
    emitSilentSaboteurEvent('bomb-planted', { victimId, round });

    const t = setTimeout(
      () => setBombRevealVisible(false),
      animationsDisabled ? 0 : BOMB_REVEAL_MS,
    );
    return () => clearTimeout(t);
  }, [phase, victimId, round, animationsDisabled]);

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
    }

    // Human saboteur: timeout fallback
    const t = setTimeout(() => {
      const candidates = activeIds.filter((id) => id !== saboteurId);
      if (candidates.length > 0) {
        const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
        dispatch(selectVictim({ victimId: victim }));
      }
    }, SELECT_VICTIM_TIMEOUT_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, saboteurId]); // intentional: one timer per phase entry

  // voting: AI voters auto-vote; human voter has timeout fallback.
  // Deps limited to [phase, bombRevealVisible]: we want exactly one vote batch
  // per visible voting phase. Re-running on each vote change would reset timers.
  useEffect(() => {
    if (phase !== 'voting' || bombRevealVisible) return;

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
  }, [phase, bombRevealVisible]); // intentional: one batch per visible voting phase

  // Visible countdown start for voting / jury voting.
  useEffect(() => {
    const countdownActive = (phase === 'voting' && !bombRevealVisible) || phase === 'final2_jury';
    if (!countdownActive) {
      setCountdownStartedAt(null);
      return;
    }
    const now = Date.now();
    setCountdownStartedAt(now);
    setCountdownNow(now);
  }, [phase, bombRevealVisible]);

  // Countdown ticker.
  useEffect(() => {
    if (countdownStartedAt == null) return;
    const i = setInterval(() => setCountdownNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(i);
  }, [countdownStartedAt]);

  // reveal: sequential vote reveal followed by elimination card and auto-advance.
  useEffect(() => {
    if (phase !== 'reveal' || !revealInfo) {
      setRevealedVoteCount(0);
      setRevealStage('votes');
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const voteStepMs = animationsDisabled ? 0 : VOTE_REVEAL_STEP_MS;
    const resultPauseMs = animationsDisabled ? 0 : REVEAL_RESULT_PAUSE_MS;
    const eliminationHoldMs = animationsDisabled ? 0 : ELIMINATION_HOLD_MS;
    const voteCount = revealVoteEntries.length;

    if (voteStepMs === 0) {
      setRevealedVoteCount(voteCount);
      setRevealStage('elimination');
      emitSilentSaboteurEvent(
        revealInfo.reason === 'saboteur_caught' ? 'saboteur-caught' : 'explosion',
        { eliminatedId: revealInfo.eliminatedId, victimId: revealInfo.victimId },
      );
      timers.push(setTimeout(() => dispatch(advanceReveal()), eliminationHoldMs));
      return () => timers.forEach(clearTimeout);
    }

    setRevealedVoteCount(0);
    setRevealStage('votes');

    revealVoteEntries.forEach(([voterId, accusedId], idx) => {
      timers.push(
        setTimeout(() => {
          setRevealedVoteCount(idx + 1);
          emitSilentSaboteurEvent('vote-reveal', { voterId, accusedId, round });
        }, voteStepMs * (idx + 1)),
      );
    });

    const votesDoneAt = voteStepMs * Math.max(voteCount, 1);
    timers.push(
      setTimeout(() => {
        setRevealStage('elimination');
        emitSilentSaboteurEvent(
          revealInfo.reason === 'saboteur_caught' ? 'saboteur-caught' : 'explosion',
          { eliminatedId: revealInfo.eliminatedId, victimId: revealInfo.victimId },
        );
      }, votesDoneAt + resultPauseMs),
    );
    timers.push(
      setTimeout(() => dispatch(advanceReveal()), votesDoneAt + resultPauseMs + eliminationHoldMs),
    );

    return () => timers.forEach(clearTimeout);
  }, [phase, revealInfo, revealVoteEntries, dispatch, round, animationsDisabled]);

  // round_transition: auto-start next round
  useEffect(() => {
    if (phase !== 'round_transition') return;
    const t = setTimeout(() => dispatch(startNextRound()), animationsDisabled ? 0 : ROUND_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [phase, dispatch, animationsDisabled]);

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

  // winner: optional human-controlled continue, otherwise auto-advance
  useEffect(() => {
    if (phase !== 'winner' || !winnerId) return;

    emitSilentSaboteurEvent('victory', { winnerId });
    if (!shouldAutoAdvanceWinner) return;

    const t = setTimeout(
      () => dispatch(advanceWinner()),
      animationsDisabled ? 0 : WINNER_AUTO_ADVANCE_MS,
    );
    return () => clearTimeout(t);
  }, [phase, dispatch, winnerId, shouldAutoAdvanceWinner, animationsDisabled]);

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

  const handleContinue = useCallback(() => {
    dispatch(advanceWinner());
  }, [dispatch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render (early-exit guard after all hooks)
  // ─────────────────────────────────────────────────────────────────────────

  if (!ss) return null;

  return (
    <div className="ss-wrap" aria-live="polite">
      <PhaseBanner banner={banner} />

      {phase === 'intro' && (
        <div className="ss-intro ss-cinematic">
          <div className="ss-bomb-icon" aria-hidden="true">💣</div>
          <h1 className="ss-title">Silent Saboteur</h1>
          <p className="ss-subtitle">Someone among you has planted a bomb…</p>
          <p className="ss-tagline">Read the room. Protect the victim. Expose the saboteur.</p>
        </div>
      )}

      {(phase === 'select_saboteur' || phase === 'select_victim') && (
        <div className="ss-phase-card ss-cinematic">
          {phase === 'select_saboteur' && (
            <>
              <p className="ss-phase-eyebrow">Hidden role assignment in progress</p>
              <p className="ss-phase-label">🔍 Selecting tonight&apos;s saboteur…</p>
            </>
          )}

          {phase === 'select_victim' && (
            <>
              <p className="ss-phase-eyebrow">Silent decision</p>
              <p className="ss-phase-label">
                {isHumanSaboteur
                  ? '💣 You are the saboteur.'
                  : '💣 The saboteur is choosing who to target…'}
              </p>
              <p className="ss-hint">
                {isHumanSaboteur
                  ? 'Choose carefully. Your victim will shape the entire investigation.'
                  : 'Everyone else waits in the dark while the bomb is planted.'}
              </p>

              {isHumanSaboteur ? (
                <>
                  <div className="ss-alert ss-alert--danger">You are the saboteur. Choose carefully.</div>
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
                            <span className="ss-btn__main">🎯 {getName(id)}</span>
                            <span className="ss-btn__tag">Target</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <PlayerList activeIds={activeIds} getName={getName} />
              )}
            </>
          )}
        </div>
      )}

      {phase === 'voting' && victimId && bombRevealVisible && (
        <div className="ss-phase-card ss-phase-card--bomb ss-cinematic" data-testid="ss-bomb-reveal">
          <p className="ss-phase-eyebrow">Bomb reveal</p>
          <h2 className="ss-reveal-title">💣 A bomb has been planted!</h2>
          <VictimNotice
            name={getName(victimId)}
            subtitle="Find the saboteur before it detonates."
            spotlight={true}
          />
        </div>
      )}

      {phase === 'voting' && victimId && !bombRevealVisible && (
        <div className="ss-phase-card ss-phase-card--vote">
          <VictimNotice
            name={getName(victimId)}
            subtitle="Who planted the bomb?"
          />
          <CountdownBar
            label="Voting time remaining"
            remainingMs={remainingCountdownMs}
            totalMs={VOTING_TIMEOUT_MS}
          />
          <h2 className="ss-phase-label">🗳️ Round {round + 1} — Investigation</h2>
          <p className="ss-hint">
            {isHumanActive && votes[humanPlayerId!] === undefined
              ? 'Study the room and accuse the saboteur.'
              : isHumanActive
              ? '✅ Vote locked. Waiting for the rest of the house…'
              : 'You are watching the investigation unfold.'}
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
                      <span className="ss-btn__main">🫵 {getName(id)}</span>
                      {id === victimId && <span className="ss-btn__tag ss-btn__tag--danger">Victim</span>}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <ProgressMeter
            label="Vote Progress"
            participantIds={activeIds}
            submissions={votes}
            getName={getName}
            noun="votes"
          />
        </div>
      )}

      {phase === 'reveal' && revealInfo && (
        <div
          className={`ss-phase-card ss-cinematic ${
            revealStage === 'elimination'
              ? revealInfo.reason === 'saboteur_caught'
                ? 'ss-phase-card--success'
                : 'ss-phase-card--danger'
              : 'ss-phase-card--resolution'
          }`}
        >
          {revealStage === 'votes' ? (
            <>
              <p className="ss-phase-eyebrow">Vote reveal sequence</p>
              <h2 className="ss-phase-label">⚖️ The votes are coming in…</h2>
              <VoteRevealSequence
                entries={revealVoteEntries}
                revealedCount={revealedVoteCount}
                getName={getName}
              />
              <p className="ss-hint hint-small">
                {revealedVoteCount}/{revealVoteEntries.length} vote
                {revealVoteEntries.length === 1 ? '' : 's'} revealed
              </p>
            </>
          ) : (
            <>
              <p className="ss-phase-eyebrow">
                {revealInfo.reason === 'saboteur_caught' ? 'Saboteur caught' : 'Bomb detonated'}
              </p>
              <h2 className="ss-reveal-title">
                {revealInfo.reason === 'saboteur_caught'
                  ? '🕵️ The saboteur has been exposed!'
                  : '💥 Wrong choice!'}
              </h2>
              {revealInfo.victimOverride && (
                <p className="ss-override-badge">⚡ Victim Override Rule Applied</p>
              )}
              <p className="ss-reveal-body">
                <strong>{getName(revealInfo.eliminatedId)}</strong>{' '}
                {revealInfo.reason === 'saboteur_caught'
                  ? 'is eliminated after the house found the saboteur.'
                  : 'is eliminated when the bomb detonates.'}
              </p>
              <p className="ss-reveal-detail">
                Saboteur: <strong>{getName(revealInfo.saboteurId)}</strong> · Victim:{' '}
                <strong>{getName(revealInfo.victimId)}</strong>
              </p>
              <VoteRevealSequence
                entries={revealVoteEntries}
                revealedCount={revealVoteEntries.length}
                getName={getName}
                compact={true}
              />
              <VoteBreakdown
                votes={revealInfo.votes}
                saboteurId={revealInfo.saboteurId}
                getName={getName}
              />
            </>
          )}
        </div>
      )}

      {phase === 'round_transition' && (
        <div className="ss-phase-card ss-cinematic">
          <p className="ss-phase-eyebrow">Aftermath</p>
          <p className="ss-phase-label">⏳ {activeIds.length} players remain…</p>
          <p className="ss-hint">The lights dim. The next sabotage is already brewing.</p>
          <PlayerList activeIds={activeIds} getName={getName} />
        </div>
      )}

      {phase === 'final2_jury' && final2SaboteurId && final2VictimId && (
        <div className="ss-phase-card ss-final2">
          <VictimNotice
            name={getName(final2VictimId)}
            subtitle="The jury must decide who planted the bomb."
          />
          <CountdownBar
            label="Final verdict timer"
            remainingMs={remainingCountdownMs}
            totalMs={JURY_VOTE_TIMEOUT_MS}
          />
          <h2 className="ss-phase-label">🏁 Final 2 — Jury Deduction Finale</h2>
          <p className="ss-hint">
            Finalists: <strong>{getName(activeIds[0] ?? '')}</strong> &amp;{' '}
            <strong>{getName(activeIds[1] ?? '')}</strong>
          </p>
          <FinalistList finalistIds={activeIds} victimId={final2VictimId} getName={getName} />
          <p className="ss-hint hint-small">
            One of them planted the bomb. The victim breaks any deadlock.
          </p>
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
                      <span className="ss-btn__main">🫵 {getName(id)}</span>
                      {id === final2VictimId && <span className="ss-btn__tag ss-btn__tag--danger">Victim</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {isHumanJuror && juryVotes[humanPlayerId!] !== undefined && (
            <p className="ss-hint">✅ Vote cast. Waiting for the final verdict…</p>
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
                <div className="ss-alert">⚠️ Jury is tied. The victim must cast the deciding vote.</div>
                <ul className="ss-button-list" role="list">
                  {activeIds.map((id) => (
                    <li key={id}>
                      <button
                        className="ss-btn ss-btn--vote"
                        onClick={() => handleTieBreak(id)}
                        aria-label={`Accuse ${getName(id)} of planting the bomb (tiebreaker)`}
                      >
                        <span className="ss-btn__main">🫵 {getName(id)}</span>
                        {id === final2VictimId && <span className="ss-btn__tag ss-btn__tag--danger">Victim</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
          <ProgressMeter
            label="Jury Votes"
            participantIds={eliminatedIds}
            submissions={juryVotes}
            getName={getName}
            noun="jury votes"
          />
        </div>
      )}

      {phase === 'winner' && winnerId && (
        <div className="ss-winner-card ss-cinematic">
          <div className="ss-confetti" aria-hidden="true">
            {Array.from({ length: 12 }, (_, idx) => (
              <span key={idx} className="ss-confetti-piece" />
            ))}
          </div>
          <div className="ss-trophy" aria-hidden="true">🏆</div>
          <p className="ss-phase-eyebrow">Winner reveal</p>
          <h2 className="ss-winner-name">{getName(winnerId)}</h2>
          <p className="ss-winner-label">wins Silent Saboteur!</p>
          {humanPlayerId === winnerId && <p className="ss-hint">🎉 You survived every round and solved the mystery.</p>}
          {!shouldAutoAdvanceWinner && (
            <button className="ss-btn ss-btn--continue" onClick={handleContinue}>
              Continue
            </button>
          )}
          {shouldAutoAdvanceWinner && !animationsDisabled && (
            <p className="ss-hint hint-small">Auto advancing…</p>
          )}
        </div>
      )}

      {phase === 'complete' && (
        <div className="ss-phase-card ss-cinematic">
          <p className="ss-phase-eyebrow">Competition complete</p>
          <p className="ss-phase-label">✅ Silent Saboteur has ended.</p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PhaseBanner({ banner }: { banner: PhaseBannerModel }) {
  return (
    <div className={`ss-phase-banner ss-phase-banner--${banner.tone}`} role="status" aria-live="polite">
      <span className="ss-phase-banner__key">{banner.key}</span>
      <strong className="ss-phase-banner__label">{banner.label}</strong>
      <span className="ss-phase-banner__detail">{banner.detail}</span>
    </div>
  );
}

function VictimNotice({
  name,
  subtitle,
  spotlight = false,
}: {
  name: string;
  subtitle: string;
  spotlight?: boolean;
}) {
  return (
    <div className={`ss-victim-card ${spotlight ? 'ss-victim-card--spotlight' : ''}`}>
      <div className="ss-victim-avatar" aria-hidden="true">{getInitial(name)}</div>
      <div className="ss-victim-copy">
        <p className="ss-victim-eyebrow">💣 {name} is in danger</p>
        <p className="ss-victim-name">{name}</p>
        <p className="ss-victim-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function CountdownBar({
  label,
  remainingMs,
  totalMs,
}: {
  label: string;
  remainingMs: number;
  totalMs: number;
}) {
  const clampedRemaining = Math.max(0, remainingMs);
  const percent = totalMs <= 0 ? 0 : Math.max(0, Math.min(100, (clampedRemaining / totalMs) * 100));
  return (
    <div className="ss-countdown" aria-label={`${label}: ${Math.ceil(clampedRemaining / 1000)} seconds remaining`}>
      <div className="ss-countdown__row">
        <span className="ss-countdown__label">{label}</span>
        <strong className="ss-countdown__value">{Math.ceil(clampedRemaining / 1000)}s</strong>
      </div>
      <div className="ss-countdown__track">
        <div className="ss-countdown__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

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

function FinalistList({
  finalistIds,
  victimId,
  getName,
}: {
  finalistIds: string[];
  victimId: string;
  getName: (id: string) => string;
}) {
  return (
    <ul className="ss-finalist-list" aria-label="Finalists">
      {finalistIds.map((id) => (
        <li
          key={id}
          className={`ss-finalist-card ${id === victimId ? 'ss-finalist-card--victim' : ''}`}
        >
          <span className="ss-finalist-name">{getName(id)}</span>
          <span className="ss-finalist-role">{id === victimId ? 'Victim' : 'Suspect'}</span>
        </li>
      ))}
    </ul>
  );
}

function ProgressMeter({
  label,
  participantIds,
  submissions,
  getName,
  noun,
}: {
  label: string;
  participantIds: string[];
  submissions: Record<string, string>;
  getName: (id: string) => string;
  noun: string;
}) {
  const submitted = Object.keys(submissions).length;
  const percent = participantIds.length === 0 ? 0 : (submitted / participantIds.length) * 100;

  return (
    <div className="ss-progress-card" aria-label={`${submitted} of ${participantIds.length} ${noun} submitted`}>
      <div className="ss-progress-card__row">
        <span className="ss-progress-card__label">{label}</span>
        <strong className="ss-progress-card__value">
          {submitted}/{participantIds.length}
        </strong>
      </div>
      <div className="ss-progress-card__track">
        <div className="ss-progress-card__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="ss-progress-card__dots">
        {participantIds.map((id) => (
          <span
            key={id}
            className={`ss-vote-dot ${submissions[id] !== undefined ? 'ss-vote-dot--cast' : ''}`}
            title={getName(id)}
          >
            {submissions[id] !== undefined ? '✅' : '⏳'}
          </span>
        ))}
      </div>
    </div>
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
      Votes on the saboteur (<strong>{getName(saboteurId)}</strong>):{' '}
      <strong>{saboteurVotes}</strong> of <strong>{Object.values(votes).length}</strong>
    </p>
  );
}

function VoteRevealSequence({
  entries,
  revealedCount,
  getName,
  compact = false,
}: {
  entries: Array<[string, string]>;
  revealedCount: number;
  getName: (id: string) => string;
  compact?: boolean;
}) {
  const shownEntries = entries.slice(0, revealedCount);

  return (
    <ol className={`ss-vote-sequence ${compact ? 'ss-vote-sequence--compact' : ''}`} aria-label="Vote reveal sequence">
      {shownEntries.map(([voterId, accusedId], idx) => (
        <li key={`${voterId}-${idx}`} className="ss-vote-sequence__item">
          <span className="ss-vote-sequence__index">Vote {idx + 1}</span>
          <span className="ss-vote-sequence__value">
            {getName(voterId)} → <strong>{getName(accusedId)}</strong>
          </span>
        </li>
      ))}
      {!compact && shownEntries.length < entries.length && (
        <li className="ss-vote-sequence__item ss-vote-sequence__item--pending">
          <span className="ss-vote-sequence__index">Next vote</span>
          <span className="ss-vote-sequence__value">…</span>
        </li>
      )}
    </ol>
  );
}
