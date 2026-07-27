import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  clearSessionLogs,
  closeSocialPanel,
  selectDramaNetwork,
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectSessionLogs,
  selectSocialPanelOpen,
  selectWeekStartRelSnapshot,
} from '../../social/socialSlice';
import { addTvEvent } from '../../store/gameSlice';
import { SocialManeuvers } from '../../social/SocialManeuvers';
import { getSocialNarrative, TV_SOCIAL_CLOSE_MESSAGES } from './socialNarratives';
import { buildDrSessionSummary } from '../../services/activityService';
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability';
import ActionGrid from './ActionGrid';
import PlayerList from './PlayerList';
import RecentActivity from './RecentActivity';
import HousePulse from '../HousePulse/HousePulse';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import type { Player } from '../../types';
import { resolveActionTargetMode } from '../../social/socialActions';
import type { SubjectPool } from '../../social/socialActions';
import { getEffectiveSocialMode } from '../../social/socialMode';
import {
  createDeterministicSocialRandom,
  validateSocialExecution,
} from '../../social/socialExecutionGuard';
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig';
import './SocialPanelV2.css';

const EXECUTE_REENTRY_GUARD_MS = 250;

function isNomineeStatus(status: Player['status']): boolean {
  return status.includes('nominated');
}

function formatPlayerNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'the house';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function selectSocialCloseMessage(random: () => number = Math.random): string {
  const index = Math.floor(random() * TV_SOCIAL_CLOSE_MESSAGES.length);
  return TV_SOCIAL_CLOSE_MESSAGES[index];
}

function getSubjectCandidates(
  pool: SubjectPool,
  primaryTargetId: string,
  players: Player[],
  actorId: string,
  relationships: Record<
    string,
    Record<string, { affinity: number; tags?: string[] }>
  > | undefined,
  allowActorAsSubject = false,
): Player[] {
  const eligible = players.filter(
    (player) =>
      player.id !== primaryTargetId &&
      (allowActorAsSubject || player.id !== actorId) &&
      player.status !== 'evicted' &&
      player.status !== 'jury',
  );
  switch (pool) {
    case 'nominees':
      return eligible.filter((player) => isNomineeStatus(player.status));
    case 'non_nominees':
      return eligible.filter((player) => !isNomineeStatus(player.status));
    case 'allies':
      return eligible.filter((player) => {
        const outward = relationships?.[actorId]?.[player.id];
        const inward = relationships?.[player.id]?.[actorId];
        const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])]);
        return (
          tags.has('alliance') ||
          tags.has('romance') ||
          tags.has('bromance') ||
          (outward?.affinity ?? 0) > 0
        );
      });
    case 'voters':
      return eligible.filter(
        (player) =>
          !isNomineeStatus(player.status) &&
          player.status !== 'loh' &&
          player.status !== 'loh+pos',
      );
    case 'houseguests':
    default:
      return eligible;
  }
}

export default function SocialPanelV2() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((state) => state.game);
  const settings = useAppSelector((state) => state.settings);
  const vip = useAppSelector((state) => state.vip);
  const socialState = useAppSelector((state) => state.social);
  const energyBank = useAppSelector(selectEnergyBank);
  const influenceBank = useAppSelector(selectInfluenceBank);
  const infoBank = useAppSelector(selectInfoBank);
  const socialPanelOpen = useAppSelector(selectSocialPanelOpen);
  const sessionLogs = useAppSelector(selectSessionLogs);
  const relationships = socialState?.relationships;
  const weekStartRelSnapshot = useAppSelector(selectWeekStartRelSnapshot);
  const dramaNetwork = useAppSelector(selectDramaNetwork);
  const dramaMode =
    getEffectiveSocialMode({ game, settings, vip }) === 'drama';

  const humanPlayer = game.players.find((player) => player.isUser);
  const socialModuleAvailability = useMemo(
    () => getSocialModuleAvailability(game),
    [game],
  );
  const open = socialModuleAvailability.canOpen && socialPanelOpen;

  useEffect(() => {
    if (!socialPanelOpen || socialModuleAvailability.canOpen) return;
    logBlockedSocialModuleOpen(
      'Outgoing social module',
      socialModuleAvailability,
      'SocialPanelV2 visibility guard',
    );
    dispatch(closeSocialPanel());
  }, [dispatch, socialPanelOpen, socialModuleAvailability]);

  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [primaryTargetId, setPrimaryTargetId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const [executing, setExecuting] = useState(false);
  const successPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutingRef = useRef(false);

  useEffect(
    () => () => {
      if (successPulseTimerRef.current !== null) {
        clearTimeout(successPulseTimerRef.current);
      }
      if (executeGuardTimerRef.current !== null) {
        clearTimeout(executeGuardTimerRef.current);
      }
    },
    [],
  );

  function resetPanelSelection() {
    setSelectedTargets(new Set());
    setPrimaryTargetId(null);
    setSelectedActionId(null);
    setSelectedSubjectId(null);
    setFeedbackMsg(null);
    setMultiSelectActive(false);
  }

  function handleClose() {
    if (!humanPlayer) {
      dispatch(closeSocialPanel());
      return;
    }
    const userLogs = sessionLogs.filter((log) => log.actorId === humanPlayer.id);
    if (userLogs.length > 0) {
      const successCount = userLogs.filter((log) => log.outcome === 'success').length;
      const failCount = userLogs.length - successCount;
      dispatch(
        addTvEvent({
          text: buildDrSessionSummary(
            game.week,
            userLogs.length,
            successCount,
            failCount,
          ),
          type: 'diary',
          source: 'manual',
          channels: ['dr'],
        }),
      );
      dispatch(
        addTvEvent({
          text: selectSocialCloseMessage(),
          type: 'social',
          channels: ['tv'],
        }),
      );
    }
    // actionHistory remains intact in the social slice; only this panel session
    // is cleared after its Diary Room summary is transferred.
    if (sessionLogs.length > 0) dispatch(clearSessionLogs());
    resetPanelSelection();
    dispatch(closeSocialPanel());
  }

  const selectedAction = selectedActionId
    ? SocialManeuvers.getActionById(selectedActionId)
    : null;
  const targetMode = selectedAction
    ? resolveActionTargetMode(selectedAction, dramaMode)
    : 'primary';
  const isBatchCompatible =
    targetMode === 'primary' &&
    !selectedAction?.requiredTargetStatus &&
    selectedActionId !== 'proposeAlliance';
  const usesMultipleTargets =
    targetMode === 'multi' || (multiSelectActive && isBatchCompatible);
  const selectedTargetCount = selectedTargets.size;
  const effectivePrimaryTargetId = targetMode === 'none' ? null : primaryTargetId;
  const needsTarget = targetMode !== 'none';
  const needsSubject = targetMode === 'primaryPlusSubject';
  const hasRequiredTargets =
    targetMode === 'multi'
      ? selectedTargetCount >= Math.max(2, selectedAction?.minTargets ?? 2)
      : usesMultipleTargets
        ? selectedTargetCount >= 1
        : !needsTarget || effectivePrimaryTargetId !== null;
  const targetCount = usesMultipleTargets ? selectedTargetCount : 1;

  const totalCosts = useMemo(() => {
    const baseCosts = selectedAction
      ? SocialManeuvers.computeActionCosts(
          humanPlayer?.id ?? '',
          selectedAction,
          effectivePrimaryTargetId ?? humanPlayer?.id ?? '',
          undefined,
          selectedTargetCount,
          dramaMode,
        )
      : null;
    if (!baseCosts) return null;
    if (selectedActionId === 'group_chat') {
      return { ...baseCosts, energy: Math.max(2, selectedTargetCount) };
    }
    if (usesMultipleTargets) {
      return {
        energy: baseCosts.energy * targetCount,
        influence: baseCosts.influence * targetCount,
        info: baseCosts.info * targetCount,
      };
    }
    return baseCosts;
  }, [
    dramaMode,
    effectivePrimaryTargetId,
    humanPlayer?.id,
    selectedAction,
    selectedActionId,
    selectedTargetCount,
    targetCount,
    usesMultipleTargets,
  ]);

  const energy = energyBank?.[humanPlayer?.id ?? ''] ?? 0;
  const influence = influenceBank?.[humanPlayer?.id ?? ''] ?? 0;
  const info = infoBank?.[humanPlayer?.id ?? ''] ?? 0;
  const hasExecutableSelection =
    Boolean(selectedActionId) &&
    hasRequiredTargets &&
    (!needsSubject || selectedSubjectId !== null);

  const executionEligibility = useMemo(() => {
    if (!selectedAction || !humanPlayer || !hasExecutableSelection) {
      return { eligible: false, reason: '' };
    }
    const targetIds =
      targetMode === 'none'
        ? []
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : [];

    if (usesMultipleTargets && targetMode !== 'multi') {
      for (const targetId of targetIds) {
        const result = validateSocialExecution(
          { game, settings, vip, social: socialState },
          {
            action: selectedAction,
            actorId: humanPlayer.id,
            targetIds: [targetId],
            subjectId: selectedSubjectId ?? undefined,
            requireCompleteSelection: true,
          },
        );
        if (!result.eligible) return result;
      }
      return { eligible: true, reason: '' };
    }

    return validateSocialExecution(
      { game, settings, vip, social: socialState },
      {
        action: selectedAction,
        actorId: humanPlayer.id,
        targetIds,
        subjectId: selectedSubjectId ?? undefined,
        requireCompleteSelection: true,
      },
    );
  }, [
    effectivePrimaryTargetId,
    game,
    hasExecutableSelection,
    humanPlayer,
    selectedAction,
    selectedSubjectId,
    selectedTargets,
    settings,
    socialState,
    targetMode,
    usesMultipleTargets,
    vip,
  ]);

  const canExecute =
    hasExecutableSelection && (executionEligibility.eligible || !executionEligibility.reason);

  const hiddenContextualActionIds = useMemo(() => {
    const hidden = new Set<string>();
    const beforeNominations = game.phase === 'social_1' && game.nomineeIds.length === 0;
    const safetyDecisionOpen =
      ['pos_results', 'pos_ceremony'].includes(game.phase) &&
      Boolean(game.posWinnerId) &&
      !game.povSavedId;
    const humanIsLoh = game.lohId === humanPlayer?.id;
    const humanIsNominated = Boolean(humanPlayer?.status.includes('nominated'));
    const lohPlanOpen = [
      'loh_results',
      'social_1',
      'nominations',
      'nomination_results',
      'pre_veto_public_save',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
      'social_2',
    ].includes(game.phase);
    if (!beforeNominations) hidden.add('pitch_target');
    if (!lohPlanOpen || !game.lohId) hidden.add('ask_loh_target');
    if (!humanIsNominated || !game.lohId) hidden.add('ask_why_nominated');
    if (!safetyDecisionOpen) {
      hidden.add('ask_use_safety');
      hidden.add('ask_safety_plan');
      hidden.add('ask_hold_safety');
      hidden.add('suggest_replacement');
    } else if (!humanIsLoh) {
      hidden.add('ask_hold_safety');
    }
    return hidden;
  }, [
    game.lohId,
    game.nomineeIds.length,
    game.phase,
    game.posWinnerId,
    game.povSavedId,
    humanPlayer?.id,
    humanPlayer?.status,
  ]);

  const handleActionClick = useCallback(
    (actionId: string) => {
      const nextAction = SocialManeuvers.getActionById(actionId);
      const nextMode = nextAction
        ? resolveActionTargetMode(nextAction, dramaMode)
        : 'primary';
      const nextBatchCompatible =
        nextMode === 'primary' &&
        !nextAction?.requiredTargetStatus &&
        actionId !== 'proposeAlliance';
      if (nextMode === 'multi') {
        setMultiSelectActive(true);
      } else if (!nextBatchCompatible && primaryTargetId) {
        setSelectedTargets(new Set([primaryTargetId]));
        setMultiSelectActive(false);
      }
      setSelectedActionId(actionId);
      setSelectedSubjectId(null);
      setFeedbackMsg(null);
    },
    [dramaMode, primaryTargetId],
  );

  const handleSelectionChange = useCallback(
    (ids: Set<string>, details: { primaryTargetId: string | null }) => {
      if (usesMultipleTargets) {
        setSelectedTargets(new Set(ids));
        setPrimaryTargetId(details.primaryTargetId);
      } else {
        const nextPrimaryTargetId = details.primaryTargetId;
        setSelectedTargets(
          nextPrimaryTargetId ? new Set([nextPrimaryTargetId]) : new Set(),
        );
        setPrimaryTargetId(nextPrimaryTargetId);
      }
      setSelectedSubjectId(null);
      setFeedbackMsg(null);

      if (selectedAction?.requiredTargetStatus) {
        const nextTargetStatus = details.primaryTargetId
          ? game.players.find((player) => player.id === details.primaryTargetId)?.status
          : null;
        if (
          !nextTargetStatus ||
          !selectedAction.requiredTargetStatus.includes(nextTargetStatus)
        ) {
          setSelectedActionId(null);
        }
      }
    },
    [game.players, selectedAction, usesMultipleTargets],
  );

  const handleExecute = useCallback(() => {
    if (
      !hasExecutableSelection ||
      !humanPlayer ||
      !selectedAction ||
      !selectedActionId ||
      isExecutingRef.current
    ) {
      return;
    }
    isExecutingRef.current = true;
    setExecuting(true);
    setFeedbackMsg(null);

    const targetIds =
      targetMode === 'none'
        ? [humanPlayer.id]
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : [];

    const releaseGuard = () => {
      isExecutingRef.current = false;
      setExecuting(false);
    };

    if (targetIds.length === 0) {
      setFeedbackMsg('Select a player to continue.');
      releaseGuard();
      return;
    }
    if (targetMode === 'multi' && targetIds.length < 2) {
      setFeedbackMsg('Select at least two players for a group action.');
      releaseGuard();
      return;
    }
    if (!executionEligibility.eligible) {
      setFeedbackMsg(executionEligibility.reason || 'This action is not available now.');
      releaseGuard();
      return;
    }
    if (!totalCosts || !SocialManeuvers.canAfford(humanPlayer.id, totalCosts)) {
      const needs = [
        totalCosts && totalCosts.energy > energy ? `⚡${totalCosts.energy}` : null,
        totalCosts && totalCosts.influence > influence
          ? `🤝${totalCosts.influence}`
          : null,
        totalCosts && totalCosts.info > info ? `💡${totalCosts.info}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const onlyEnergyShort =
        Boolean(totalCosts) &&
        totalCosts!.energy > energy &&
        totalCosts!.influence <= influence &&
        totalCosts!.info <= info;
      setFeedbackMsg(
        `Insufficient resources${
          onlyEnergyShort ? ': insufficient energy' : ''
        }${needs ? ` — need ${needs}` : ''}. Nothing was spent.`,
      );
      releaseGuard();
      return;
    }
    if (
      targetIds.some((targetId) => {
        const target = game.players.find((player) => player.id === targetId);
        return !target || target.status === 'evicted' || target.status === 'jury';
      })
    ) {
      setFeedbackMsg('Cannot target an eliminated or Tribunal player.');
      releaseGuard();
      return;
    }

    const random = createDeterministicSocialRandom([
      game.seed,
      game.week,
      game.phase,
      humanPlayer.id,
      selectedActionId,
      targetIds.join(','),
      sessionLogs.length,
    ]);

    const results =
      targetMode === 'multi'
        ? [
            SocialManeuvers.executeGroupAction(
              humanPlayer.id,
              targetIds,
              selectedActionId,
              { source: 'manual', random },
            ),
          ]
        : targetIds.map((targetId, index) =>
            SocialManeuvers.executeAction(
              humanPlayer.id,
              targetId,
              selectedActionId,
              {
                source: 'manual',
                subjectId: selectedSubjectId ?? undefined,
                random,
                waiveCosts: index > 0,
                costOverride: index === 0 ? totalCosts : undefined,
              },
            ),
          );

    const successfulResults = results.filter((result) => result.success);
    const firstResult = results[0];
    setFeedbackMsg(
      targetMode === 'multi'
        ? firstResult.summary
        : usesMultipleTargets
          ? successfulResults.length === targetIds.length
            ? `${getSocialActionPresentation(selectedAction).title} reached all ${
                targetIds.length
              } selected housemates.`
            : `${getSocialActionPresentation(selectedAction).title} reached ${
                successfulResults.length
              } of ${targetIds.length} selected housemates.`
          : firstResult.summary,
    );

    if (successfulResults.length > 0) {
      const targetNames = targetIds.map(
        (targetId) =>
          game.players.find((player) => player.id === targetId)?.name ?? targetId,
      );
      const subjectName = selectedSubjectId
        ? game.players.find((player) => player.id === selectedSubjectId)?.name ??
          selectedSubjectId
        : null;
      const actionTitle = getSocialActionPresentation(selectedAction).title;
      const persistentText =
        selectedActionId === 'group_chat'
          ? `You hosted a group chat with ${formatPlayerNames(targetNames)}.`
          : selectedActionId === 'ask_loh_target'
            ? firstResult.summary
            : subjectName
              ? `You used ${actionTitle} with ${targetNames[0]} about ${subjectName}.`
              : getSocialNarrative(
                  selectedActionId,
                  formatPlayerNames(targetNames),
                  Date.now(),
                );
      dispatch(
        addTvEvent({
          text: persistentText,
          type: 'social',
          source: 'manual',
          channels: ['mainLog'],
        }),
      );
      setSuccessPulse(true);
      if (successPulseTimerRef.current !== null) {
        clearTimeout(successPulseTimerRef.current);
      }
      successPulseTimerRef.current = setTimeout(() => {
        setSuccessPulse(false);
        successPulseTimerRef.current = null;
      }, 850);
    }

    if (executeGuardTimerRef.current !== null) {
      clearTimeout(executeGuardTimerRef.current);
    }
    executeGuardTimerRef.current = setTimeout(() => {
      releaseGuard();
      executeGuardTimerRef.current = null;
    }, EXECUTE_REENTRY_GUARD_MS);
  }, [
    dispatch,
    effectivePrimaryTargetId,
    energy,
    executionEligibility,
    game.phase,
    game.players,
    game.seed,
    game.week,
    hasExecutableSelection,
    humanPlayer,
    info,
    influence,
    selectedAction,
    selectedActionId,
    selectedSubjectId,
    selectedTargets,
    sessionLogs.length,
    targetMode,
    totalCosts,
    usesMultipleTargets,
  ]);

  if (!open || !humanPlayer) return null;

  const allNonUser = game.players.filter(
    (player) => !player.isUser && player.status !== 'evicted',
  );
  const activePlayers = allNonUser.filter((player) => player.status !== 'jury');
  const juryPlayers = allNonUser.filter((player) => player.status === 'jury');
  const orderedPlayers = [...activePlayers, ...juryPlayers];
  const disabledPlayerIds = juryPlayers.map((player) => player.id);

  const deltasByTargetId = new Map<string, number>();
  const currentRels = relationships?.[humanPlayer.id] ?? {};
  const snapshotRels = weekStartRelSnapshot[humanPlayer.id] ?? {};
  for (const [targetId, relationship] of Object.entries(currentRels)) {
    const weeklyDelta = relationship.affinity - (snapshotRels[targetId] ?? 0);
    if (weeklyDelta !== 0) deltasByTargetId.set(targetId, weeklyDelta);
  }

  const subjectCandidates =
    needsSubject && effectivePrimaryTargetId && selectedAction?.subjectPool
      ? getSubjectCandidates(
          selectedAction.subjectPool,
          effectivePrimaryTargetId,
          selectedAction.allowActorAsSubject
            ? [...orderedPlayers, humanPlayer]
            : orderedPlayers,
          humanPlayer.id,
          relationships,
          selectedAction.allowActorAsSubject,
        )
      : [];

  const actionTitle = selectedAction
    ? getSocialActionPresentation(selectedAction).title
    : null;
  const executeCopy = !actionTitle
    ? 'Execute'
    : targetMode === 'multi'
      ? `${actionTitle} · ${selectedTargetCount} selected`
      : targetMode === 'none'
        ? actionTitle
        : effectivePrimaryTargetId
          ? `${actionTitle} · ${
              game.players.find((player) => player.id === effectivePrimaryTargetId)?.name ??
              'target'
            }`
          : 'Select a target';

  return (
    <div className="sp2-backdrop" role="dialog" aria-modal="true" aria-label="Social Phase">
      <a className="sp2-skip-link" href="#sp2-body">
        Skip to actions
      </a>
      <div className={`sp2-modal${dramaMode ? ' sp2-modal--drama' : ' sp2-modal--normal'}`}>
        <header className="sp2-header">
          <span className="sp2-header__title">
            {dramaMode ? '🔥 Drama Mode' : '💬 Social Phase'}
          </span>
          <div className={`sp2-header__resources${dramaMode ? '' : ' sp2-header__resources--normal'}`}>
            <span className="sp2-energy-chip" aria-live="polite" aria-label={`Energy: ${energy}`}>
              ⚡ {energy}
            </span>
            <span
              className="sp2-resource-chip sp2-resource-chip--influence"
              aria-live="polite"
              aria-label={`Influence: ${influence}`}
            >
              🤝 {influence}
            </span>
            <span
              className="sp2-resource-chip sp2-resource-chip--info"
              aria-live="polite"
              aria-label={`Info: ${info}`}
            >
              💡 {info}
            </span>
          </div>
          <button
            className="sp2-header__close"
            onClick={handleClose}
            type="button"
            aria-label="Close social panel"
          >
            ✕
          </button>
        </header>

        {dramaMode && (
          <HousePulse network={dramaNetwork} players={game.players} humanId={humanPlayer.id} />
        )}

        <div id="sp2-body" className="sp2-body">
          <div className="sp2-column sp2-column--players" aria-label="Player roster">
            <div className="sp2-column__heading">
              <span className="sp2-column__label">Players</span>
              {usesMultipleTargets && (
                <span className="sp2-multi-hint" role="status">
                  Group: {selectedTargets.size} selected ·{' '}
                  {targetMode === 'multi' ? 'tap 2+ players' : 'applies to everyone selected'}
                </span>
              )}
            </div>
            <PlayerList
              players={orderedPlayers}
              humanPlayerId={humanPlayer.id}
              relationships={relationships}
              disabledIds={disabledPlayerIds}
              selectedIds={selectedTargets}
              onSelectionChange={handleSelectionChange}
              multiSelectEnabled={targetMode === 'multi'}
              deltasByTargetId={deltasByTargetId}
              multiSelect={usesMultipleTargets}
            />
          </div>

          <div className="sp2-column sp2-column--actions" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={handleActionClick}
              selectedTargetIds={
                targetMode === 'none' || selectedTargets.size === 0
                  ? undefined
                  : selectedTargets
              }
              players={orderedPlayers}
              actorId={humanPlayer.id}
              actorEnergy={energy}
              actorInfluence={influence}
              actorInfo={info}
              relationships={relationships}
              primaryTargetStatus={
                primaryTargetId
                  ? game.players.find((player) => player.id === primaryTargetId)?.status ?? null
                  : null
              }
              dramaMode={dramaMode}
              currentPhase={game.phase}
              dramaNetwork={dramaNetwork}
              hiddenActionIds={hiddenContextualActionIds}
              energyCostOverrides={
                selectedActionId && totalCosts
                  ? { [selectedActionId]: totalCosts.energy }
                  : undefined
              }
            />
          </div>
        </div>

        {needsSubject && effectivePrimaryTargetId && (
          <div className="sp2-subject-picker" aria-label="Choose subject">
            <span className="sp2-subject-picker__label">Talking about:</span>
            {subjectCandidates.length === 0 ? (
              <span className="sp2-subject-picker__empty">No eligible targets</span>
            ) : (
              <div className="sp2-subject-picker__chips" role="group" aria-label="Subject candidates">
                {subjectCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`sp2-subject-chip${
                      selectedSubjectId === candidate.id ? ' sp2-subject-chip--selected' : ''
                    }`}
                    aria-pressed={selectedSubjectId === candidate.id}
                    onClick={() => {
                      setSelectedSubjectId((previous) =>
                        previous === candidate.id ? null : candidate.id,
                      );
                      setFeedbackMsg(null);
                    }}
                  >
                    <PlayerAvatar
                      player={candidate}
                      size="sm"
                      showRelationshipOutline={false}
                    />
                    <span className="sp2-subject-chip__name">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sp2-recent" aria-label="Recent Activity log">
          <RecentActivity
            players={game.players.filter((player) => !player.isUser)}
            dramaMode={dramaMode}
          />
        </div>

        <footer className="sp2-footer">
          {feedbackMsg ? (
            <span className="sp2-footer__feedback" role="status" aria-live="polite">
              {feedbackMsg}
            </span>
          ) : executionEligibility.reason && selectedActionId ? (
            <span className="sp2-footer__feedback sp2-footer__feedback--hint">
              {executionEligibility.reason}
            </span>
          ) : (
            <span className="sp2-footer__cost">
              {totalCosts
                ? `Cost: ⚡${totalCosts.energy}${
                    totalCosts.influence ? ` · 🤝${totalCosts.influence}` : ''
                  }${totalCosts.info ? ` · 💡${totalCosts.info}` : ''}`
                : 'Cost: —'}
            </span>
          )}
          <button
            className={`sp2-footer__execute${
              successPulse ? ' sp2-footer__execute--pulse' : ''
            }`}
            type="button"
            disabled={!canExecute}
            aria-label="Execute"
            aria-busy={executing}
            onClick={handleExecute}
          >
            {executeCopy}
          </button>
        </footer>
      </div>
    </div>
  );
}
