import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import type { PlayerStatus } from '../../types';
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar';
import { resolvePresentationAvatar } from '../../utils/presentationAvatar';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import {
  advanceIntro,
  advanceReveal,
  advanceWinner,
  initMajorityRules,
  lockRound,
  rollThreeWayDuel,
  rollFinalDuel,
  setThreeWayDuelPick,
  setFinalDuelPick,
  setHumanAnswer,
  useHint as applyMajorityRulesHint,
  type MajorityRulesCompetitionType,
} from '../../features/majorityRules/majorityRulesSlice';
import { resolveMajorityRulesOutcome } from '../../features/majorityRules/thunks';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import './MajorityRulesComp.css';

const INTRO_DELAY_MS = 5000;
const AI_LOCK_DELAY_MS = 950;
const AI_DUEL_DELAY_MS = 1250;
const SPECTATOR_REVEAL_ADVANCE_DELAY_MS = 3000;
const FAST_FORWARD_STEP_MS = 25;

type SpectatorMode = 'playing' | 'pending' | 'watching' | 'skipping';

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
  /** Explicit seed for deterministic RNG. When omitted or set to 0, a fresh crypto-random seed is generated on mount. */
  seed?: number;
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

function formatQuotedList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return `“${items[0]}”`;
  if (items.length === 2) return `“${items[0]}” and “${items[1]}”`;
  return `${items.slice(0, -1).map((item) => `“${item}”`).join(', ')}, and “${items[items.length - 1]}”`;
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
    () => resolveAvatarCandidates({ id: player.id, name: player.name, avatar: player.avatar }).map(resolvePresentationAvatar),
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
  wrap = false,
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
  wrap?: boolean;
}) {
  const rows = getAvatarGridRows(ids, dense);
  const eliminatedSet = new Set(eliminatedIds);
  const motionEnabled = !areAnimationsDisabled();
  const rosterVariant = variant ?? (shouldUseRosterRail(ids) ? 'rail' : 'cards');

  if (rosterVariant === 'rail') {
    return (
      <div
        className={[
          'majority-rules-avatar-rail',
          wrap ? 'majority-rules-avatar-rail--wrapped' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid="mr-avatar-rail"
      >
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
  const [spectatorMode, setSpectatorMode] = useState<SpectatorMode>('playing');
  const [initialConfig] = useState<{
    participantIds: string[];
    competitionType: MajorityRulesCompetitionType;
    seed: number;
    humanPlayerId: string | null;
  }>(() => ({
    participantIds: [...participantIds],
    competitionType: prizeType,
    // Only forward an explicit non-zero seed (e.g. dev/test pages).
    // When seed is absent or 0, generate a fresh crypto-random seed so each
    // new hosted game session draws questions in a unique, unpredictable order.
    seed: seed !== undefined && seed !== 0 ? seed : cryptoSeed(),
    humanPlayerId: participants?.find((participant) => participant.isHuman)?.id ?? null,
  }));
  const motionEnabled = !areAnimationsDisabled();

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
  const humanIsEliminated = Boolean(
    game.humanPlayerId && game.eliminatedIds.includes(game.humanPlayerId),
  );

  useEffect(() => {
    if (
      humanIsEliminated &&
      spectatorMode === 'playing' &&
      game.phase !== 'winner' &&
      game.phase !== 'complete'
    ) {
      setSpectatorMode('pending');
    }
  }, [game.phase, humanIsEliminated, spectatorMode]);

  useEffect(() => {
    dispatch(initMajorityRules(initialConfig));
  }, [dispatch, initialConfig]);

  useEffect(() => {
    if (game.phase !== 'intro') return undefined;
    const timeout = window.setTimeout(() => dispatch(advanceIntro()), INTRO_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.phase]);

  useEffect(() => {
    const humanIsActive =
      game.humanPlayerId != null && game.activeIds.includes(game.humanPlayerId);
    if (game.phase !== 'question' || humanIsActive || spectatorMode === 'pending') return undefined;
    const timeout = window.setTimeout(
      () => dispatch(lockRound()),
      spectatorMode === 'skipping' ? FAST_FORWARD_STEP_MS : AI_LOCK_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.activeIds, game.humanPlayerId, game.phase, spectatorMode]);

  useEffect(() => {
    if (game.phase !== 'final_duel_roll' || !game.finalDuel || spectatorMode === 'pending') return undefined;
    if (game.finalDuel.currentRollerId === game.humanPlayerId) return undefined;
    const timeout = window.setTimeout(
      () => dispatch(rollFinalDuel()),
      spectatorMode === 'skipping' ? FAST_FORWARD_STEP_MS : AI_DUEL_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.finalDuel, game.humanPlayerId, game.phase, spectatorMode]);

  useEffect(() => {
    if (game.phase !== 'three_way_duel_roll' || !game.threeWayDuel || spectatorMode === 'pending') return undefined;
    if (game.threeWayDuel.currentRollerId === game.humanPlayerId) return undefined;
    const timeout = window.setTimeout(
      () => dispatch(rollThreeWayDuel()),
      spectatorMode === 'skipping' ? FAST_FORWARD_STEP_MS : AI_DUEL_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.humanPlayerId, game.phase, game.threeWayDuel, spectatorMode]);

  useEffect(() => {
    const humanIsStillActive =
      game.humanPlayerId != null && game.activeIds.includes(game.humanPlayerId);
    if (game.phase !== 'reveal' || humanIsStillActive || spectatorMode === 'pending') return undefined;
    const timeout = window.setTimeout(
      () => dispatch(advanceReveal()),
      spectatorMode === 'skipping' ? FAST_FORWARD_STEP_MS : SPECTATOR_REVEAL_ADVANCE_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.activeIds, game.humanPlayerId, game.phase, spectatorMode]);

  useEffect(() => {
    if (game.phase !== 'winner' || spectatorMode !== 'skipping') return undefined;
    const timeout = window.setTimeout(() => dispatch(advanceWinner()), FAST_FORWARD_STEP_MS);
    return () => window.clearTimeout(timeout);
  }, [dispatch, game.phase, spectatorMode]);

  useEffect(() => {
    if (game.phase !== 'complete' || completedRef.current) return;
    completedRef.current = true;
    dispatch(resolveMajorityRulesOutcome());
    onComplete?.();
  }, [dispatch, game.phase, onComplete]);

  const activeHumanId =
    game.humanPlayerId && game.activeIds.includes(game.humanPlayerId) ? game.humanPlayerId : null;
  const humanHintInventory = activeHumanId ? game.hintInventories[activeHumanId] : null;
  const remainingHints = humanHintInventory
    ? 3 -
      Number(humanHintInventory.pollHintUsed) -
      Number(humanHintInventory.peekTwoUsed) -
      Number(humanHintInventory.followPlayerUsed)
    : 0;
  const threeWayFinalists: string[] = game.threeWayDuel?.finalists ?? [];
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
            {game.activeIds.length} players left
          </span>
          {game.revoteNumber > 0 && (
            <span className="majority-rules-badge majority-rules-badge--warn">
              Re-vote {game.revoteNumber}
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
            </motion.button>
          );
        })}
      </div>

      {activeHumanId && (
        <div className="majority-rules-hints">
          <div className="majority-rules-section-title majority-rules-section-title--hints">
            <h3>Use one hint this round</h3>
            <span>{remainingHints}/3 left</span>
          </div>
          <div className="majority-rules-hint-actions">
            <button
              type="button"
              className={game.roundHintType === 'pollHint' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={
                (!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId) ||
                !!humanHintInventory?.pollHintUsed
              }
              onClick={() =>
                dispatch(applyMajorityRulesHint({ playerId: activeHumanId, hintType: 'pollHint' }))
              }
            >
              📊 Poll{humanHintInventory?.pollHintUsed ? ' • Used' : ''}
            </button>
            <button
              type="button"
              className={game.roundHintType === 'peekTwo' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={
                (!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId) ||
                !!humanHintInventory?.peekTwoUsed
              }
              onClick={() =>
                dispatch(applyMajorityRulesHint({ playerId: activeHumanId, hintType: 'peekTwo' }))
              }
            >
              🕵️ Peek 2{humanHintInventory?.peekTwoUsed ? ' • Used' : ''}
            </button>
            <button
              type="button"
              className={game.roundHintType === 'followPlayer' ? 'majority-rules-pill majority-rules-pill--active' : 'majority-rules-pill'}
              disabled={
                (!!game.roundHintUsedBy && game.roundHintUsedBy !== activeHumanId) ||
                !!humanHintInventory?.followPlayerUsed
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
              🪞 Follow{humanHintInventory?.followPlayerUsed ? ' • Used' : ''}
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
        {(selectedHumanOption || game.roundHintType === 'followPlayer') && (
          <button
            type="button"
            className="majority-rules-primary"
            onClick={() => dispatch(lockRound())}
          >
            Continue
          </button>
        )}
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
    const eliminated = reveal?.result.eliminatedIds ?? [];
    const minorityLabel = game.currentQuestion?.options.find(
      (option) => option.id === reveal?.result.minorityOptionId,
    )?.text;
    const tiedMinorityLabels =
      game.currentQuestion?.options
        .filter((option) => reveal?.result.tiedOptionIds.includes(option.id))
        .map((option) => option.text) ?? [];
    const distribution = reveal?.result.distribution ?? {};
    const totalVotes = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    const populatedCounts = Object.values(distribution).filter((count) => count > 0);
    const highestCount = populatedCounts.length > 0 ? Math.max(...populatedCounts) : 0;
    const lowestCount = populatedCounts.length > 0 ? Math.min(...populatedCounts) : 0;

    return (
      <motion.div
        key="reveal"
        className="majority-rules-card majority-rules-card--reveal"
        {...(motionEnabled ? PHASE_MOTION : {})}
      >
        <div className="majority-rules-glow majority-rules-glow--reveal" aria-hidden="true" />
        <div className="majority-rules-badge-row">
          <span className="majority-rules-badge">Reveal</span>
        </div>

        <div className="majority-rules-header-copy">
          <span className="majority-rules-kicker">The room speaks.</span>
          <h2 className="majority-rules-question">
            {reveal?.result.kind === 'revote'
              ? reveal.revoteNumber >= 1
                ? 'Still tied. This question is over.'
                : 'Split house. One re-vote remains.'
              : reveal?.result.kind === 'unanimous'
                ? 'A full sweep. Nobody falls this time.'
                : tiedMinorityLabels.length > 0
                  ? 'Tie at the bottom. Every minority answer drops.'
                  : 'Minority found. The trap door opens.'}
          </h2>
          <p className="majority-rules-copy">
            {reveal?.result.kind === 'revote'
              ? reveal.revoteNumber >= 1
                ? 'The re-vote tied again, so a fresh question will replace it.'
                : 'Every populated answer tied, so the house votes once more.'
              : reveal?.result.kind === 'unanimous'
                ? 'No elimination this round. The next question starts fresh.'
                : tiedMinorityLabels.length > 0
                  ? `The tied minority answers were ${formatQuotedList(tiedMinorityLabels)}.`
                  : minorityLabel
                   ? `The minority answer was “${minorityLabel}”.`
                   : 'The minority has been eliminated.'}
          </p>
        </div>

        {game.currentQuestion && totalVotes > 0 && (
          <div className="majority-rules-aggregation" aria-label="Vote aggregation">
            {game.currentQuestion.options.map((option) => {
              const count = distribution[option.id] ?? 0;
              const percentage = Math.round((count / totalVotes) * 100);
              const tiedBallot = highestCount === lowestCount;
              const status = count === 0
                ? 'No votes'
                : tiedBallot
                  ? 'Tied'
                  : count === highestCount
                    ? 'Majority'
                    : count === lowestCount
                      ? 'Minority'
                      : 'Middle';
              return (
                <div key={option.id} className={`majority-rules-aggregation__row is-${status.toLowerCase().replace(' ', '-')}`}>
                  <div className="majority-rules-aggregation__label">
                    <strong>{option.label}. {option.text}</strong>
                    <span>{status} · {count}/{totalVotes} ({percentage}%)</span>
                  </div>
                  <div className="majority-rules-aggregation__track" aria-hidden="true">
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {eliminated.length > 0 && (
          <div className="majority-rules-eliminated-grid" aria-label="Eliminated players">
          {eliminated.map((playerId, idx) => (
            <motion.div
              key={playerId}
              className="majority-rules-eliminated-card"
              {...(motionEnabled
                ? {
                    initial: { opacity: 0, y: 12 },
                    animate: { opacity: 1, y: 0, transition: { duration: 0.24, delay: idx * 0.05 } },
                  }
                : {})}
            >
              <MajorityRulesPortrait player={getPlayer(playerId)} size="lg" />
              <strong>{getName(playerId)}</strong>
              <span>Eliminated</span>
            </motion.div>
          ))}
          </div>
        )}

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

  const renderThreeWayDuel = () => (
    <motion.div
      key={game.phase}
      className="majority-rules-card majority-rules-card--duel"
      {...(motionEnabled ? PHASE_MOTION : {})}
    >
      <div className="majority-rules-glow majority-rules-glow--duel" aria-hidden="true" />
      <div className="majority-rules-badge-row">
        <span className="majority-rules-badge majority-rules-badge--danger">3-Way Dice Tiebreak</span>
        {game.threeWayDuel?.roundCount ? (
          <span className="majority-rules-badge majority-rules-badge--warn">
            Round {game.threeWayDuel.roundCount + 1}
          </span>
        ) : null}
      </div>

      <div className="majority-rules-header-copy">
        <span className="majority-rules-kicker">Three straight draws. Dice decide it.</span>
        <h2 className="majority-rules-question">Pick a number and hit it. Ties drop the player who misses.</h2>
        <p className="majority-rules-copy">
          If one player lands their number, they win immediately. If two players land it, the third is eliminated and the last two go to the final duel.
        </p>
      </div>

      <PlayerRoster
        ids={threeWayFinalists}
        getPlayer={getPlayer}
        compact={false}
        selectedId={game.phase === 'three_way_duel_pick' ? activeHumanId : game.threeWayDuel?.currentRollerId}
        pulseId={game.phase === 'three_way_duel_roll' ? game.threeWayDuel?.currentRollerId : null}
        badgeMode="turn"
      />

      <div className="majority-rules-finalists">
        {threeWayFinalists.map((playerId) => (
          <div key={playerId} className="majority-rules-finalist">
            <span>{getName(playerId)}</span>
            <strong>{game.threeWayDuel?.chosenNumbers[playerId] ?? '—'}</strong>
          </div>
        ))}
      </div>

      {game.phase === 'three_way_duel_pick' &&
        activeHumanId &&
        threeWayFinalists.includes(activeHumanId) && (
          <div className="majority-rules-number-picker">
            {[1, 2, 3, 4, 5, 6].map((value) => {
              const takenByOther = threeWayFinalists.some(
                (playerId) =>
                  playerId !== activeHumanId && game.threeWayDuel?.chosenNumbers[playerId] === value,
              );
              return (
                <button
                  key={value}
                  type="button"
                  className={[
                    'majority-rules-number-button',
                    game.threeWayDuel?.chosenNumbers[activeHumanId] === value
                      ? 'majority-rules-number-button--active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={takenByOther}
                  onClick={() => dispatch(setThreeWayDuelPick({ playerId: activeHumanId, value }))}
                >
                  {value}
                </button>
              );
            })}
          </div>
        )}

      {game.phase === 'three_way_duel_roll' && (
        <>
          <p className="majority-rules-copy">
            <strong>{getName(game.threeWayDuel?.currentRollerId ?? '')}</strong> is rolling now.
          </p>
          {game.threeWayDuel?.lastRoll && (
            <div className="majority-rules-hint-panel">
              <div className="majority-rules-peek-row">
                <span>Last roll</span>
                <strong>
                  {getName(game.threeWayDuel.lastRoll.playerId)} rolled {game.threeWayDuel.lastRoll.value}
                </strong>
              </div>
              <div className="majority-rules-peek-row">
                <span>Status</span>
                <strong>{game.threeWayDuel.lastRoll.hitTarget ? 'Hit their number' : 'Missed'}</strong>
              </div>
              {game.threeWayDuel.lastRoundResult && (
                <div className="majority-rules-peek-row">
                  <span>Round result</span>
                  <strong>
                    {game.threeWayDuel.lastRoundResult.winnerId
                      ? `${getName(game.threeWayDuel.lastRoundResult.winnerId)} wins`
                      : game.threeWayDuel.lastRoundResult.eliminatedId
                        ? `${getName(game.threeWayDuel.lastRoundResult.eliminatedId)} is eliminated`
                        : 'No winner yet — roll again'}
                  </strong>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="majority-rules-primary"
            onClick={() => dispatch(rollThreeWayDuel())}
            disabled={game.threeWayDuel?.currentRollerId !== activeHumanId}
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
    <div className="majority-rules-shell" data-phase={game.phase}>
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
              wrap={shouldUseRosterRail(game.activeIds)}
            />
          </motion.div>
        )}
        {game.phase === 'question' && renderQuestion()}
        {game.phase === 'reveal' && renderReveal()}
        {(game.phase === 'three_way_duel_pick' || game.phase === 'three_way_duel_roll') &&
          renderThreeWayDuel()}
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
      {spectatorMode === 'pending' && (
        <div className="majority-rules-spectator-overlay" role="dialog" aria-modal="true" aria-labelledby="majority-rules-spectator-title">
          <div className="majority-rules-spectator-card">
            <span className="majority-rules-badge majority-rules-badge--danger">Eliminated</span>
            <h2 id="majority-rules-spectator-title">Stay for the rest of the vote?</h2>
            <p>You can watch at normal speed or fast-forward the same live game directly to its final result.</p>
            <div className="majority-rules-spectator-actions">
              <button type="button" className="majority-rules-primary" onClick={() => setSpectatorMode('watching')}>
                Continue watching
              </button>
              <button type="button" className="majority-rules-secondary" onClick={() => setSpectatorMode('skipping')}>
                Skip to results
              </button>
            </div>
          </div>
        </div>
      )}
      {spectatorMode === 'skipping' && game.phase !== 'complete' && (
        <div className="majority-rules-fast-forward" role="status" aria-live="polite">
          Fast-forwarding the live game…
        </div>
      )}
    </div>
  );
}
