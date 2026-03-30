import { useEffect, useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  advanceIntro,
  advanceReveal,
  advanceWinner,
  initMajorityRules,
  lockRound,
  rollFinalDuel,
  setFinalDuelPick,
  setHumanAnswer,
  useHint as applyMajorityRulesHint,
  type MajorityRulesCompetitionType,
} from '../../features/majorityRules/majorityRulesSlice';
import { resolveMajorityRulesOutcome } from '../../features/majorityRules/thunks';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './MajorityRulesComp.css';

const INTRO_DELAY_MS = 1200;
const AI_LOCK_DELAY_MS = 950;
const AI_DUEL_DELAY_MS = 1250;

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: MajorityRulesCompetitionType;
  seed: number;
  onComplete?: () => void;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.round(value))}%`;
}

export default function MajorityRulesComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const game = useAppSelector((state: RootState) => state.majorityRules);
  const completedRef = useRef(false);

  const nameMap = useMemo(
    () =>
      Object.fromEntries(
        (participants ?? []).map((participant) => [participant.id, participant.name]),
      ),
    [participants],
  );

  useEffect(() => {
    dispatch(
      initMajorityRules({
        participantIds,
        competitionType: prizeType,
        seed,
        humanPlayerId: participants?.find((participant) => participant.isHuman)?.id ?? null,
      }),
    );
  }, [dispatch, participantIds, participants, prizeType, seed]);

  useEffect(() => {
    if (game.phase !== 'intro') return undefined;
    const timeout = window.setTimeout(() => dispatch(advanceIntro()), INTRO_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.phase]);

  useEffect(() => {
    const humanIsActive =
      game.humanPlayerId != null && game.activeIds.includes(game.humanPlayerId);
    if (game.phase !== 'question' || humanIsActive) return undefined;
    const timeout = window.setTimeout(() => dispatch(lockRound()), AI_LOCK_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.activeIds, game.humanPlayerId, game.phase]);

  useEffect(() => {
    if (game.phase !== 'final_duel_roll' || !game.finalDuel) return undefined;
    if (game.finalDuel.currentRollerId === game.humanPlayerId) return undefined;
    const timeout = window.setTimeout(() => dispatch(rollFinalDuel()), AI_DUEL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.finalDuel, game.humanPlayerId, game.phase]);

  useEffect(() => {
    if (game.phase !== 'complete' || completedRef.current) return;
    completedRef.current = true;
    dispatch(resolveMajorityRulesOutcome());
    onComplete?.();
  }, [dispatch, game.phase, onComplete]);

  const activeHumanId =
    game.humanPlayerId && game.activeIds.includes(game.humanPlayerId) ? game.humanPlayerId : null;
  const finalists: string[] = game.finalDuel?.finalists ?? [];

  const renderQuestion = () => (
    <div className="majority-rules-card">
      <div className="majority-rules-badge-row">
        <span className="majority-rules-badge">Round {game.roundNumber}</span>
        {game.revoteNumber > 0 && (
          <span className="majority-rules-badge majority-rules-badge--warn">
            Re-vote {game.revoteNumber}
          </span>
        )}
        {game.doubleEliminationArmed && (
          <span className="majority-rules-badge majority-rules-badge--danger">
            Double Elimination Armed
          </span>
        )}
      </div>
      <h2 className="majority-rules-question">
        {game.currentQuestion?.prompt ?? 'Loading question…'}
      </h2>

      <div className="majority-rules-options">
        {game.currentQuestion?.options.map((option) => {
          const selected = activeHumanId ? game.draftAnswers[activeHumanId] === option.id : false;
          const blocked =
            !!activeHumanId &&
            game.blockedAnswers[activeHumanId] === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'majority-rules-option',
                selected ? 'majority-rules-option--selected' : '',
                blocked ? 'majority-rules-option--blocked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                activeHumanId &&
                dispatch(setHumanAnswer({ playerId: activeHumanId, optionId: option.id }))
              }
              disabled={!activeHumanId || blocked || game.roundHintType === 'followPlayer'}
            >
              <span className="majority-rules-option-label">{option.label}</span>
              <span>{option.text}</span>
            </button>
          );
        })}
      </div>

      {activeHumanId && (
        <div className="majority-rules-hints">
          <h3>Use one hint this round</h3>
          <div className="majority-rules-hint-actions">
            <button
              type="button"
              className={game.roundHintType === 'pollHint' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId}
              onClick={() =>
                dispatch(applyMajorityRulesHint({ playerId: activeHumanId, hintType: 'pollHint' }))
              }
            >
              Poll Hint
            </button>
            <button
              type="button"
              className={game.roundHintType === 'peekTwo' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={
                (!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId) ||
                !!game.hintInventories[activeHumanId]?.peekTwoUsed
              }
              onClick={() =>
                dispatch(applyMajorityRulesHint({ playerId: activeHumanId, hintType: 'peekTwo' }))
              }
            >
              Peek Two
            </button>
            <button
              type="button"
              className={game.roundHintType === 'followPlayer' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={
                (!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId) ||
                !!game.hintInventories[activeHumanId]?.followPlayerUsed
              }
              onClick={() =>
                dispatch(
                  applyMajorityRulesHint({
                    playerId: activeHumanId,
                    hintType: 'followPlayer',
                    targetId:
                      game.roundHintTargetId ??
                      game.activeIds.find((id) => id !== activeHumanId) ??
                      null,
                  }),
                )
              }
            >
              Follow Player
            </button>
          </div>

          {game.roundHintPollEstimate && (
            <div className="majority-rules-hint-panel">
              {game.currentQuestion?.options.map((option) => (
                <div key={option.id} className="majority-rules-poll-row">
                  <span>{option.label}</span>
                  <div className="majority-rules-poll-bar">
                    <div
                      className="majority-rules-poll-fill"
                      style={{ width: `${game.roundHintPollEstimate?.[option.id] ?? 0}%` }}
                    />
                  </div>
                    <strong>{formatPercent(game.roundHintPollEstimate?.[option.id] ?? 0)}</strong>
                </div>
              ))}
            </div>
          )}

          {game.roundHintPeekedAnswers && (
            <div className="majority-rules-hint-panel">
              {Object.entries(game.roundHintPeekedAnswers).map(([playerId, optionId]) => (
                <div key={playerId} className="majority-rules-peek-row">
                  <span>{nameMap[playerId] ?? playerId}</span>
                  <strong>
                    {game.currentQuestion?.options.find((option) => option.id === optionId)?.text ?? optionId}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {game.roundHintType === 'followPlayer' && (
            <div className="majority-rules-follow-list">
              {game.activeIds
                .filter((playerId) => playerId !== activeHumanId)
                .map((playerId) => (
                  <button
                    key={playerId}
                    type="button"
                    className={[
                      'majority-rules-follow-target',
                      game.roundHintTargetId === playerId ? 'majority-rules-follow-target--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      dispatch(
                        applyMajorityRulesHint({
                          playerId: activeHumanId,
                          hintType: 'followPlayer',
                          targetId: playerId,
                        }),
                      )
                    }
                  >
                    {nameMap[playerId] ?? playerId}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="majority-rules-footer">
        <div className="majority-rules-active-list">
          {game.activeIds.map((playerId) => (
            <span key={playerId} className="majority-rules-chip">
              {nameMap[playerId] ?? playerId}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="majority-rules-primary"
          disabled={
            !!activeHumanId &&
            game.roundHintType !== 'followPlayer' &&
            !game.draftAnswers[activeHumanId]
          }
          onClick={() => dispatch(lockRound())}
        >
          Lock answers
        </button>
      </div>
    </div>
  );

  const renderReveal = () => {
    const reveal = game.revealState;
    const distribution = reveal?.result.distribution ?? {};
    const answerLookup = reveal?.result.answers ?? {};
    const eliminated = reveal?.result.eliminatedIds ?? [];
    return (
      <div className="majority-rules-card">
        <div className="majority-rules-badge-row">
          <span className="majority-rules-badge">Reveal</span>
          {reveal?.doubleEliminationWasActive && (
            <span className="majority-rules-badge majority-rules-badge--danger">Double Elimination</span>
          )}
        </div>
        <h2 className="majority-rules-question">
          {reveal?.result.kind === 'revote'
            ? 'Split house. Nobody is safe yet.'
            : reveal?.result.kind === 'unanimous'
              ? 'Everyone piled onto the same answer.'
              : 'Minority caught. Time to pay the price.'}
        </h2>
        <div className="majority-rules-distribution">
          {game.currentQuestion?.options.map((option) => (
            <div key={option.id} className="majority-rules-distribution-row">
              <div className="majority-rules-distribution-top">
                <span>{option.text}</span>
                <strong>{distribution[option.id] ?? 0}</strong>
              </div>
              <div className="majority-rules-poll-bar">
                <div
                  className="majority-rules-poll-fill"
                  style={{
                    width: `${((distribution[option.id] ?? 0) / Math.max(1, game.activeIds.length)) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="majority-rules-answer-grid">
          {game.activeIds.map((playerId) => (
            <div key={playerId} className="majority-rules-answer-card">
              <span>{nameMap[playerId] ?? playerId}</span>
              <strong>
                {game.currentQuestion?.options.find((option) => option.id === answerLookup[playerId])?.text ??
                  '—'}
              </strong>
            </div>
          ))}
        </div>
        {reveal?.result.kind === 'revote' && (
          <p className="majority-rules-copy">
            Tie for the minority. Everyone must vote again and switch off their last answer.
          </p>
        )}
        {reveal?.result.kind === 'unanimous' && (
          <p className="majority-rules-copy">
            No elimination this round. The next vote becomes a double elimination showdown.
          </p>
        )}
        {reveal?.result.kind === 'elimination' && (
          <p className="majority-rules-copy">
            Eliminated:{' '}
            <strong>
              {eliminated.map((playerId) => nameMap[playerId] ?? playerId).join(', ')}
            </strong>
          </p>
        )}
        <button type="button" className="majority-rules-primary" onClick={() => dispatch(advanceReveal())}>
          Continue
        </button>
      </div>
    );
  };

  const renderFinalDuel = () => (
    <div className="majority-rules-card">
      <div className="majority-rules-badge-row">
        <span className="majority-rules-badge majority-rules-badge--danger">Final 2 Dice Duel</span>
        {game.finalDuel?.suddenDeath && (
          <span className="majority-rules-badge majority-rules-badge--warn">Sudden Death</span>
        )}
      </div>
      <h2 className="majority-rules-question">Pick a number. Then survive the pressure.</h2>
      <div className="majority-rules-finalists">
        {finalists.map((playerId) => (
          <div key={playerId} className="majority-rules-finalist">
            <span>{nameMap[playerId] ?? playerId}</span>
            <strong>{game.finalDuel?.chosenNumbers[playerId] ?? '—'}</strong>
          </div>
        ))}
      </div>
      {game.phase === 'final_duel_pick' && activeHumanId && finalists.includes(activeHumanId) && (
        <div className="majority-rules-number-picker">
          {[1, 2, 3, 4, 5, 6].map((value) => {
            const takenByOther = finalists.some(
              (playerId) => playerId !== activeHumanId && game.finalDuel?.chosenNumbers[playerId] === value,
            );
            return (
              <button
                key={value}
                type="button"
                className={[
                  'majority-rules-number-button',
                  game.finalDuel?.chosenNumbers[activeHumanId] === value ? 'majority-rules-number-button--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={takenByOther}
                onClick={() => dispatch(setFinalDuelPick({ playerId: activeHumanId, value }))}
              >
                {value}
              </button>
            );
          })}
        </div>
      )}
      {game.phase === 'final_duel_roll' && (
        <>
          <p className="majority-rules-copy">
            {nameMap[game.finalDuel?.currentRollerId ?? ''] ?? game.finalDuel?.currentRollerId} is rolling now.
            {game.finalDuel?.pressureHolderId &&
              ` Pressure is on ${nameMap[game.finalDuel.pressureHolderId] ?? game.finalDuel.pressureHolderId}.`}
          </p>
          {game.finalDuel?.lastRoll && (
            <div className="majority-rules-hint-panel">
              <div className="majority-rules-peek-row">
                <span>{nameMap[game.finalDuel.lastRoll.playerId] ?? game.finalDuel.lastRoll.playerId}</span>
                <strong>rolled {game.finalDuel.lastRoll.value}</strong>
              </div>
              <div className="majority-rules-peek-row">
                <span>Status</span>
                <strong>
                  {game.finalDuel.lastRoll.winnerId
                    ? `${nameMap[game.finalDuel.lastRoll.winnerId] ?? game.finalDuel.lastRoll.winnerId} wins`
                    : game.finalDuel.lastRoll.cancelled
                      ? 'Pressure cancelled'
                      : game.finalDuel.lastRoll.hitTarget
                        ? 'Pressure started'
                        : 'Still alive'}
                </strong>
              </div>
            </div>
          )}
          <button
            type="button"
            className="majority-rules-primary"
            onClick={() => dispatch(rollFinalDuel())}
            disabled={game.finalDuel?.currentRollerId !== activeHumanId}
          >
            Roll die
          </button>
        </>
      )}
    </div>
  );

  if (game.phase === 'intro') {
    return (
      <div className="majority-rules-card majority-rules-card--center">
        <span className="majority-rules-badge">Majority Rules</span>
        <h2 className="majority-rules-question">Read the room. Avoid the minority. Survive to the duel.</h2>
      </div>
    );
  }

  if (game.phase === 'question') return renderQuestion();
  if (game.phase === 'reveal') return renderReveal();
  if (game.phase === 'final_duel_pick' || game.phase === 'final_duel_roll') return renderFinalDuel();
  if (game.phase === 'winner') {
    return (
      <div className="majority-rules-card majority-rules-card--center">
        <span className="majority-rules-badge majority-rules-badge--danger">Winner</span>
        <h2 className="majority-rules-question">
          {nameMap[game.winnerId ?? ''] ?? game.winnerId ?? 'Someone'} is the last player standing.
        </h2>
        <button type="button" className="majority-rules-primary" onClick={() => dispatch(advanceWinner())}>
          Finish
        </button>
      </div>
    );
  }

  return (
    <div className="majority-rules-card majority-rules-card--center">
      <span className="majority-rules-badge">Wrapping up…</span>
    </div>
  );
}
