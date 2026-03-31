import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import type { PlayerStatus } from '../../types';
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar';
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

const PHASE_MOTION = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.985,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
};

interface Props {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: MajorityRulesCompetitionType;
  seed: number;
  onComplete?: () => void;
}

interface DisplayPlayer {
  id: string;
  name: string;
  avatar: string;
  status: PlayerStatus;
  isHuman: boolean;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.round(value))}%`;
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function areAnimationsDisabled() {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function getAvatarGridRows(ids: string[], dense = false): string[][] {
  const denseLayouts: Record<number, number[]> = {
    2: [2],
    3: [1, 2],
    4: [2, 2],
    5: [3, 2],
    6: [3, 3],
    7: [4, 3],
    8: [4, 4],
    9: [3, 3, 3],
    10: [4, 3, 3],
    11: [4, 4, 3],
    12: [4, 4, 4],
  };
  const exactLayouts: Record<number, number[]> = {
    2: [2],
    3: [1, 2],
    4: [2, 2],
    6: [3, 3],
    8: [4, 4],
    9: [3, 3, 3],
    12: [4, 4, 4],
  };

  const layout = (dense ? denseLayouts : exactLayouts)[ids.length];
  if (layout) {
    const rows: string[][] = [];
    let cursor = 0;
    for (const size of layout) {
      rows.push(ids.slice(cursor, cursor + size));
      cursor += size;
    }
    return rows;
  }

  const rows: string[][] = [];
  const perRow = dense ? 4 : 3;
  for (let idx = 0; idx < ids.length; idx += perRow) {
    rows.push(ids.slice(idx, idx + perRow));
  }
  return rows;
}

function shouldUseRosterRail(ids: string[]) {
  return ids.length >= 8;
}

function MajorityRulesPortrait({
  player,
  size = 'md',
}: {
  player: DisplayPlayer;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const candidates = useMemo(
    () => resolveAvatarCandidates({ id: player.id, name: player.name, avatar: player.avatar }),
    [player.avatar, player.id, player.name],
  );
  return (
    <MajorityRulesPortraitInner
      key={`${player.id}:${player.avatar}:${player.name}`}
      player={player}
      size={size}
      candidates={candidates}
    />
  );
}

function MajorityRulesPortraitInner({
  player,
  size,
  candidates,
}: {
  player: DisplayPlayer;
  size: 'sm' | 'md' | 'lg' | 'xl';
  candidates: string[];
}) {
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  const src = candidates[candidateIdx] ?? '';

  if (showFallback || !src) {
    return (
      <div className={`majority-rules-portrait majority-rules-portrait--${size}`} aria-hidden="true">
        <span className="majority-rules-portrait__fallback">
          {isEmoji(player.avatar) ? player.avatar : getInitial(player.name)}
        </span>
      </div>
    );
  }

  return (
    <div className={`majority-rules-portrait majority-rules-portrait--${size}`} aria-hidden="true">
      <img
        src={src}
        alt={player.name}
        className="majority-rules-portrait__img"
        data-testid={`mr-portrait-${player.id}`}
        onError={() => {
          if (candidateIdx < candidates.length - 1) {
            setCandidateIdx((idx) => idx + 1);
          } else {
            setShowFallback(true);
          }
        }}
      />
    </div>
  );
}

function PlayerRoster({
  ids,
  getPlayer,
  selectedId,
  eliminatedIds = [],
  onSelect,
  dense = false,
  compact = false,
  badgeMode = 'you',
  pulseId,
  variant,
}: {
  ids: string[];
  getPlayer: (id: string) => DisplayPlayer;
  selectedId?: string | null;
  eliminatedIds?: string[];
  onSelect?: (id: string) => void;
  dense?: boolean;
  compact?: boolean;
  badgeMode?: 'you' | 'turn';
  pulseId?: string | null;
  /**
   * Optional manual override used by call sites that want the rail placement
   * even before the automatic crowded-roster fallback would kick in.
   */
  variant?: 'cards' | 'rail';
}) {
  const rows = getAvatarGridRows(ids, dense);
  const eliminatedSet = new Set(eliminatedIds);
  const motionEnabled = !areAnimationsDisabled();
  const rosterVariant = variant ?? (shouldUseRosterRail(ids) ? 'rail' : 'cards');

  if (rosterVariant === 'rail') {
    return (
      <div className="majority-rules-avatar-rail" data-testid="mr-avatar-rail">
        {ids.map((id, idx) => {
          const player = getPlayer(id);
          const isSelected = selectedId === id;
          const isEliminated = eliminatedSet.has(id);
          const isHuman = player.isHuman;
          const badgeText =
            badgeMode === 'turn' && pulseId === id ? 'ROLL' : isHuman ? 'YOU' : null;
          const className = [
            'majority-rules-avatar-chip',
            isSelected ? 'majority-rules-avatar-chip--selected' : '',
            isHuman ? 'majority-rules-avatar-chip--human' : '',
            isEliminated ? 'majority-rules-avatar-chip--eliminated' : '',
            pulseId === id ? 'majority-rules-avatar-chip--pulse' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const content = (
            <>
              <div className="majority-rules-avatar-chip__portrait">
                <MajorityRulesPortrait player={player} size="sm" />
                {badgeText && <span className="majority-rules-avatar-chip__badge">{badgeText}</span>}
              </div>
              <span className="majority-rules-avatar-chip__name">{player.name}</span>
            </>
          );

          const sharedMotion = motionEnabled
            ? {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0, transition: { duration: 0.2, delay: idx * 0.02 } },
              }
            : {};

          return onSelect ? (
            <motion.button
              key={id}
              type="button"
              className={className}
              data-testid={`mr-avatar-rail-item-${id}`}
              onClick={() => onSelect(id)}
              whileTap={motionEnabled ? { scale: 0.96 } : undefined}
              {...sharedMotion}
            >
              {content}
            </motion.button>
          ) : (
            <motion.div
              key={id}
              className={className}
              data-testid={`mr-avatar-rail-item-${id}`}
              {...sharedMotion}
            >
              {content}
            </motion.div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`majority-rules-roster ${compact ? 'majority-rules-roster--compact' : ''}`}>
      {rows.map((row, rowIdx) => (
        <div key={`mr-row-${rowIdx}`} className="majority-rules-roster__row">
          {row.map((id, tileIdx) => {
            const player = getPlayer(id);
            const isSelected = selectedId === id;
            const isEliminated = eliminatedSet.has(id);
            const isHuman = player.isHuman;
            const badgeText =
              badgeMode === 'turn' && pulseId === id ? 'ROLLING' : isHuman ? 'YOU' : null;
            const className = [
              'majority-rules-player-card',
              compact ? 'majority-rules-player-card--compact' : '',
              isSelected ? 'majority-rules-player-card--selected' : '',
              isHuman ? 'majority-rules-player-card--human' : '',
              isEliminated ? 'majority-rules-player-card--eliminated' : '',
              pulseId === id ? 'majority-rules-player-card--pulse' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const content = (
              <>
                <MajorityRulesPortrait
                  player={player}
                  size={compact ? 'sm' : pulseId === id ? 'lg' : 'md'}
                />
                <div className="majority-rules-player-card__meta">
                  <strong className="majority-rules-player-card__name">{player.name}</strong>
                  <span className="majority-rules-player-card__subline">
                    {isEliminated ? 'Out' : isHuman ? 'You are in' : 'Still alive'}
                  </span>
                </div>
                {badgeText && <span className="majority-rules-player-card__badge">{badgeText}</span>}
              </>
            );

            const sharedMotion = motionEnabled
              ? {
                  initial: { opacity: 0, y: 10, scale: 0.96 },
                  animate: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { duration: 0.26, delay: (rowIdx * 0.08) + (tileIdx * 0.04) },
                  },
                }
              : {};

            return onSelect ? (
              <motion.button
                key={id}
                type="button"
                className={className}
                onClick={() => onSelect(id)}
                whileTap={motionEnabled ? { scale: 0.97 } : undefined}
                {...sharedMotion}
              >
                {content}
              </motion.button>
            ) : (
              <motion.div key={id} className={className} {...sharedMotion}>
                {content}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
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
  const gamePlayers = useAppSelector((state: RootState) => state.game.players);
  const completedRef = useRef(false);
  const initConfigRef = useRef<{
    participantIds: string[];
    competitionType: MajorityRulesCompetitionType;
    seed: number;
    humanPlayerId: string | null;
  } | null>(null);
  const motionEnabled = !areAnimationsDisabled();

  if (!initConfigRef.current) {
    initConfigRef.current = {
      participantIds: [...participantIds],
      competitionType: prizeType,
      seed,
      humanPlayerId: participants?.find((participant) => participant.isHuman)?.id ?? null,
    };
  }

  const playerMap = useMemo<Record<string, DisplayPlayer>>(() => {
    const livePlayers = Object.fromEntries(gamePlayers.map((player) => [player.id, player]));
    const merged: Record<string, DisplayPlayer> = {};

    for (const participant of participants ?? []) {
      const livePlayer = livePlayers[participant.id];
      merged[participant.id] = {
        id: participant.id,
        name: livePlayer?.name ?? participant.name,
        avatar: livePlayer?.avatar ?? '',
        status: livePlayer?.status ?? 'active',
        isHuman: participant.isHuman || livePlayer?.isUser === true,
      };
    }

    for (const participantId of participantIds) {
      if (merged[participantId]) continue;
      const livePlayer = livePlayers[participantId];
      merged[participantId] = {
        id: participantId,
        name: livePlayer?.name ?? participantId,
        avatar: livePlayer?.avatar ?? '',
        status: livePlayer?.status ?? 'active',
        isHuman: livePlayer?.isUser === true,
      };
    }

    return merged;
  }, [gamePlayers, participantIds, participants]);

  const getPlayer = (id: string): DisplayPlayer =>
    playerMap[id] ?? {
      id,
      name: id,
      avatar: '',
      status: 'active',
      isHuman: false,
    };

  const getName = (id: string) => getPlayer(id).name;

  useEffect(() => {
    if (!initConfigRef.current) return;
    dispatch(initMajorityRules(initConfigRef.current));
  }, [dispatch]);

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
  const selectedHumanOption = activeHumanId ? game.draftAnswers[activeHumanId] : null;
  const useActiveStatusRail = shouldUseRosterRail(game.activeIds);

  const renderQuestion = () => (
    <motion.div
      key="question"
      className="majority-rules-card majority-rules-card--question"
      {...(motionEnabled ? PHASE_MOTION : {})}
    >
      <div className="majority-rules-glow majority-rules-glow--question" aria-hidden="true" />
      <div className="majority-rules-badge-row">
        <span className="majority-rules-badge">Round {game.roundNumber}</span>
        <span className="majority-rules-badge majority-rules-badge--cool">
          {game.activeIds.length} houseguests left
        </span>
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

      <div className="majority-rules-header-copy">
        <span className="majority-rules-kicker">Read the room. Stay with the crowd.</span>
        <h2 className="majority-rules-question">
          {game.currentQuestion?.prompt ?? 'Loading question…'}
        </h2>
        <p className="majority-rules-copy">
          Pick what the majority will pick. Drift into the minority and you are gone.
        </p>
      </div>

      {!useActiveStatusRail && (
        <PlayerRoster ids={game.activeIds} getPlayer={getPlayer} compact={true} dense={true} />
      )}

      <div className="majority-rules-options">
        {game.currentQuestion?.options.map((option, idx) => {
          const selected = activeHumanId ? selectedHumanOption === option.id : false;
          const blocked = !!activeHumanId && game.blockedAnswers[activeHumanId] === option.id;
          return (
            <motion.button
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
              whileTap={motionEnabled ? { scale: 0.985 } : undefined}
              {...(motionEnabled
                ? {
                    initial: { opacity: 0, x: -16 },
                    animate: {
                      opacity: 1,
                      x: 0,
                      transition: { duration: 0.22, delay: 0.08 + (idx * 0.05) },
                    },
                  }
                : {})}
            >
              <span className="majority-rules-option-label">{option.label}</span>
              <strong className="majority-rules-option-title">{option.text}</strong>
              <span className="majority-rules-option-copy">
                {blocked
                  ? 'You used this answer on the re-vote.'
                  : selected
                    ? 'Locked in as your current read.'
                    : 'Could this be where the crowd lands?'}
              </span>
            </motion.button>
          );
        })}
      </div>

      {activeHumanId && (
        <div className="majority-rules-hints">
          <div className="majority-rules-section-title">
            <h3>Use one hint this round</h3>
            <span>Spend information, not luck.</span>
          </div>
          <div className="majority-rules-hint-actions">
            <button
              type="button"
              className={game.roundHintType === 'pollHint' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId}
              onClick={() =>
                dispatch(applyMajorityRulesHint({ playerId: activeHumanId, hintType: 'pollHint' }))
              }
            >
              📊 Poll Hint
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
              🕵️ Peek Two
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
              🪞 Follow Player
            </button>
          </div>

          {game.roundHintPollEstimate && (
            <div className="majority-rules-hint-panel">
              <div className="majority-rules-section-title">
                <h3>Blurred poll read</h3>
                <span>Approximate crowd energy only.</span>
              </div>
              {game.currentQuestion?.options.map((option) => (
                <div key={option.id} className="majority-rules-poll-row">
                  <span>{option.text}</span>
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
              <div className="majority-rules-section-title">
                <h3>Peeked answers</h3>
                <span>Two hidden reads before the vote locks.</span>
              </div>
              <div className="majority-rules-answer-grid">
                {Object.entries(game.roundHintPeekedAnswers).map(([playerId, optionId]) => (
                  <div key={playerId} className="majority-rules-answer-card">
                    <div className="majority-rules-answer-card__player">
                      <MajorityRulesPortrait player={getPlayer(playerId)} size="sm" />
                      <span>{getName(playerId)}</span>
                    </div>
                    <strong>
                      {game.currentQuestion?.options.find((option) => option.id === optionId)?.text ?? optionId}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {game.roundHintType === 'followPlayer' && (
            <div className="majority-rules-hint-panel">
              <div className="majority-rules-section-title">
                <h3>Choose who to shadow</h3>
                <span>You will mirror their answer after the reveal.</span>
              </div>
              <PlayerRoster
                ids={game.activeIds.filter((playerId) => playerId !== activeHumanId)}
                getPlayer={getPlayer}
                selectedId={game.roundHintTargetId}
                compact={true}
                dense={true}
                onSelect={(playerId) =>
                  dispatch(
                    applyMajorityRulesHint({
                      playerId: activeHumanId,
                      hintType: 'followPlayer',
                      targetId: playerId,
                    }),
                  )
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="majority-rules-footer">
        <p className="majority-rules-copy majority-rules-copy--dim">
          {game.roundHintType === 'followPlayer'
            ? 'Your answer will copy your chosen houseguest when everyone reveals.'
            : 'No timer pressure here — take the read you trust most.'}
        </p>
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
      {useActiveStatusRail && (
        <div className="majority-rules-status-dock">
          <div className="majority-rules-section-title">
            <h3>House status</h3>
            <span>Scroll the avatar rail to track who is still in.</span>
          </div>
          <PlayerRoster ids={game.activeIds} getPlayer={getPlayer} variant="rail" />
        </div>
      )}
    </motion.div>
  );

  const renderReveal = () => {
    const reveal = game.revealState;
    const distribution = reveal?.result.distribution ?? {};
    const answerLookup = reveal?.result.answers ?? {};
    const eliminated = reveal?.result.eliminatedIds ?? [];
    const minorityLabel = game.currentQuestion?.options.find(
      (option) => option.id === reveal?.result.minorityOptionId,
    )?.text;

    return (
      <motion.div
        key="reveal"
        className="majority-rules-card majority-rules-card--reveal"
        {...(motionEnabled ? PHASE_MOTION : {})}
      >
        <div className="majority-rules-glow majority-rules-glow--reveal" aria-hidden="true" />
        <div className="majority-rules-badge-row">
          <span className="majority-rules-badge">Reveal</span>
          {reveal?.doubleEliminationWasActive && (
            <span className="majority-rules-badge majority-rules-badge--danger">Double Elimination</span>
          )}
        </div>

        <div className="majority-rules-header-copy">
          <span className="majority-rules-kicker">The room speaks.</span>
          <h2 className="majority-rules-question">
            {reveal?.result.kind === 'revote'
              ? 'Split house. Nobody is safe yet.'
              : reveal?.result.kind === 'unanimous'
                ? 'A full sweep. Nobody falls this time.'
                : 'Minority found. The trap door opens.'}
          </h2>
          <p className="majority-rules-copy">
            {reveal?.result.kind === 'revote'
              ? 'Tie for the minority. Everyone must switch off their previous answer and vote again.'
              : reveal?.result.kind === 'unanimous'
                ? 'No elimination this round. The next one becomes a double elimination showdown.'
                : minorityLabel
                  ? `The minority answer was “${minorityLabel}”.`
                  : 'The minority has been eliminated.'}
          </p>
        </div>

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
          {game.activeIds.map((playerId, idx) => (
            <motion.div
              key={playerId}
              className={[
                'majority-rules-answer-card',
                eliminated.includes(playerId) ? 'majority-rules-answer-card--eliminated' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              {...(motionEnabled
                ? {
                    initial: { opacity: 0, y: 12 },
                    animate: { opacity: 1, y: 0, transition: { duration: 0.24, delay: idx * 0.05 } },
                  }
                : {})}
            >
              <div className="majority-rules-answer-card__player">
                <MajorityRulesPortrait player={getPlayer(playerId)} size="sm" />
                <div className="majority-rules-answer-card__meta">
                  <span>{getName(playerId)}</span>
                  {eliminated.includes(playerId) && <strong>Eliminated</strong>}
                </div>
              </div>
              <strong>
                {game.currentQuestion?.options.find((option) => option.id === answerLookup[playerId])?.text ?? '—'}
              </strong>
            </motion.div>
          ))}
        </div>

        <button type="button" className="majority-rules-primary" onClick={() => dispatch(advanceReveal())}>
          Continue
        </button>
      </motion.div>
    );
  };

  const renderFinalDuel = () => (
    <motion.div
      key={game.phase}
      className="majority-rules-card majority-rules-card--duel"
      {...(motionEnabled ? PHASE_MOTION : {})}
    >
      <div className="majority-rules-glow majority-rules-glow--duel" aria-hidden="true" />
      <div className="majority-rules-badge-row">
        <span className="majority-rules-badge majority-rules-badge--danger">Final 2 Dice Duel</span>
        {game.finalDuel?.suddenDeath && (
          <span className="majority-rules-badge majority-rules-badge--warn">Sudden Death</span>
        )}
      </div>

      <div className="majority-rules-header-copy">
        <span className="majority-rules-kicker">Different numbers. Shared pressure.</span>
        <h2 className="majority-rules-question">Pick a number. Land it first. Survive the answer.</h2>
        <p className="majority-rules-copy">
          Roll your number to put the other player under pressure. If they miss on the next roll, you win.
        </p>
      </div>

      <PlayerRoster
        ids={finalists}
        getPlayer={getPlayer}
        compact={false}
        selectedId={game.phase === 'final_duel_pick' ? activeHumanId : game.finalDuel?.pressureHolderId}
        pulseId={game.phase === 'final_duel_roll' ? game.finalDuel?.currentRollerId : null}
        badgeMode="turn"
      />

      <div className="majority-rules-finalists">
        {finalists.map((playerId) => (
          <div
            key={playerId}
            className={[
              'majority-rules-finalist',
              game.finalDuel?.pressureHolderId === playerId ? 'majority-rules-finalist--pressure' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{getName(playerId)}</span>
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
            <strong>{getName(game.finalDuel?.currentRollerId ?? '')}</strong> is rolling now.
            {game.finalDuel?.pressureHolderId &&
              ` Pressure is on ${getName(game.finalDuel.pressureHolderId)}.`}
          </p>
          {game.finalDuel?.lastRoll && (
            <div className="majority-rules-hint-panel">
              <div className="majority-rules-peek-row">
                <span>Last roll</span>
                <strong>
                  {getName(game.finalDuel.lastRoll.playerId)} rolled {game.finalDuel.lastRoll.value}
                </strong>
              </div>
              <div className="majority-rules-peek-row">
                <span>Status</span>
                <strong>
                  {game.finalDuel.lastRoll.winnerId
                    ? `${getName(game.finalDuel.lastRoll.winnerId)} wins`
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
    </motion.div>
  );

  const renderWinner = () => {
    const winner = getPlayer(game.winnerId ?? '');
    return (
      <motion.div
        key="winner"
        className="majority-rules-card majority-rules-card--center majority-rules-card--winner"
        {...(motionEnabled ? PHASE_MOTION : {})}
      >
        <div className="majority-rules-glow majority-rules-glow--winner" aria-hidden="true" />
        <span className="majority-rules-badge majority-rules-badge--danger">Winner</span>
        <MajorityRulesPortrait player={winner} size="xl" />
        <h2 className="majority-rules-question">
          {winner.name || 'Someone'} is the last player standing.
        </h2>
        <p className="majority-rules-copy">
          They read the room, survived the minority, and held their nerve in the dice duel.
        </p>
        <button type="button" className="majority-rules-primary" onClick={() => dispatch(advanceWinner())}>
          Finish
        </button>
      </motion.div>
    );
  };

  return (
    <div className="majority-rules-shell">
      <div className="majority-rules-ambient majority-rules-ambient--one" aria-hidden="true" />
      <div className="majority-rules-ambient majority-rules-ambient--two" aria-hidden="true" />
      <AnimatePresence mode="wait" initial={false}>
        {game.phase === 'intro' && (
          <motion.div
            key="intro"
            className="majority-rules-card majority-rules-card--center majority-rules-card--intro"
            {...(motionEnabled ? PHASE_MOTION : {})}
          >
            <div className="majority-rules-glow majority-rules-glow--intro" aria-hidden="true" />
            <span className="majority-rules-badge">Majority Rules</span>
            <h2 className="majority-rules-question">
              Read the room. Avoid the minority. Survive to the duel.
            </h2>
            <p className="majority-rules-copy">
              The safest answer is whatever most people believe everyone else will pick.
            </p>
            <PlayerRoster
              ids={game.activeIds}
              getPlayer={getPlayer}
              compact={true}
              dense={true}
              variant={shouldUseRosterRail(game.activeIds) ? 'rail' : 'cards'}
            />
          </motion.div>
        )}
        {game.phase === 'question' && renderQuestion()}
        {game.phase === 'reveal' && renderReveal()}
        {(game.phase === 'final_duel_pick' || game.phase === 'final_duel_roll') && renderFinalDuel()}
        {game.phase === 'winner' && renderWinner()}
        {game.phase === 'complete' && (
          <motion.div
            key="complete"
            className="majority-rules-card majority-rules-card--center"
            {...(motionEnabled ? PHASE_MOTION : {})}
          >
            <span className="majority-rules-badge">Wrapping up…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
