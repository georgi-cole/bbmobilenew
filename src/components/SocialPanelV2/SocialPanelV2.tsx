import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectSocialPanelOpen,
  selectSessionLogs,
  selectWeekStartRelSnapshot,
  closeSocialPanel,
  clearSessionLogs,
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
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import type { Player } from '../../types';
import type { SubjectPool } from '../../social/socialActions';
import './SocialPanelV2.css';

const EXECUTE_REENTRY_GUARD_MS = 250;

// ── Subject candidate helpers ─────────────────────────────────────────────

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

/**
 * Generate a compact list of contextual subject candidates for primaryPlusSubject
 * actions. Returns a small set of eligible players based on the subjectPool hint.
 * The primary target is always excluded to avoid talking to X about X.
 */
function getSubjectCandidates(
  pool: SubjectPool,
  primaryTargetId: string,
  players: Player[],
  actorId: string,
  relationships: Record<string, Record<string, { affinity: number }>> | undefined,
  allowActorAsSubject = false,
): Player[] {
  const eligible = players.filter(
    (p) => p.id !== primaryTargetId
      && (allowActorAsSubject || p.id !== actorId)
      && p.status !== 'evicted'
      && p.status !== 'jury',
  );
  switch (pool) {
    case 'nominees':
      return eligible.filter((p) => isNomineeStatus(p.status));
    case 'non_nominees':
      return eligible.filter((p) => !isNomineeStatus(p.status));
    case 'allies': {
      const actorRels = relationships?.[actorId] ?? {};
      return eligible.filter((p) => (actorRels[p.id]?.affinity ?? 0) > 0);
    }
    case 'voters':
    case 'houseguests':
    default:
      return eligible;
  }
}

/**
 * SocialPanelV2 — full-screen modal overlay for social phases.
 *
 * Visible during non-vote interaction phases (LOH, POS, nomination, pre-vote,
 * and social windows) when the human player is still in the house. Blocked
 * during live_vote and eviction resolution phases.
 *
 * Features:
 *   - Backdrop + bottom-sheet modal
 *   - Header: energy chip for the human player + close button
 *   - Two-column body: Player roster with PlayerList (left) / Action grid (right)
 *   - Inline subject picker for primaryPlusSubject actions ("talk to X about Y")
 *   - Explicit primary-target tracking so execution follows the last interaction
 *   - Sticky footer: Execute button + cost display
 *   - FAB-driven open/close; panel does not auto-open on phase changes
 *
 * Targeting model:
 *   - 'none'               → no target player required (execute immediately)
 *   - 'primary'            → one target player required (default)
 *   - 'primaryPlusSubject' → one primary target + one subject (inline chip picker)
 *   - 'multi'              → multiple targets (reserved for future multi-execute support)
 *
 * Bug fix: action state is preserved after a successful execution so the grid
 * remains stable and the Execute button stays enabled for immediate re-use.
 * The player can change action/target selection manually between executions.
 *
 * Open/close logic: opens exclusively when socialPanelOpen (Redux) is true,
 * which is set by the FAB 💬 button.
 */
export default function SocialPanelV2() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const energyBank = useAppSelector(selectEnergyBank);
  const influenceBank = useAppSelector(selectInfluenceBank);
  const infoBank = useAppSelector(selectInfoBank);
  const socialPanelOpen = useAppSelector(selectSocialPanelOpen);
  const sessionLogs = useAppSelector(selectSessionLogs);
  const relationships = useAppSelector((s) => s.social?.relationships);
  const weekStartRelSnapshot = useAppSelector(selectWeekStartRelSnapshot);

  const humanPlayer = game.players.find((p) => p.isUser);
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game]);

  // Panel opens exclusively when the FAB dispatches openSocialPanel()
  // AND the social module is currently available (for example, the human
  // player is still in the house and the current phase allows social actions).
  const open = socialModuleAvailability.canOpen && socialPanelOpen;

  useEffect(() => {
    if (!socialPanelOpen || socialModuleAvailability.canOpen) {
      return;
    }
    logBlockedSocialModuleOpen(
      'Outgoing social module',
      socialModuleAvailability,
      'SocialPanelV2 visibility guard',
    );
    dispatch(closeSocialPanel());
  }, [dispatch, socialPanelOpen, socialModuleAvailability]);

  function handleClose() {
    if (!humanPlayer) {
      dispatch(closeSocialPanel());
      return;
    }
    const userLogs = sessionLogs.filter((log) => log.actorId === humanPlayer.id);
    if (userLogs.length > 0) {
      // Publish one concise Diary Room summary for the whole session.
      // Routed exclusively to the DR channel so it does NOT appear in the
      // main-screen TVLog or TV viewport.
      const successCount = userLogs.filter((l) => l.outcome === 'success').length;
      const failCount = userLogs.length - successCount;
      const drText = buildDrSessionSummary(game.week, userLogs.length, successCount, failCount);
      dispatch(addTvEvent({ text: drText, type: 'diary', source: 'manual', channels: ['dr'] }));

      // Show a short, playful TV-zone sentence — dispatched last so it appears at
      // the top of the feed (index 0) and is shown in the TV viewport after close.
      const tvMsg = selectSocialCloseMessage();
      dispatch(addTvEvent({ text: tvMsg, type: 'social', channels: ['tv'] }));
    }
    if (sessionLogs.length > 0) {
      dispatch(clearSessionLogs());
    }
    setSelectedTargets(new Set());
    setPrimaryTargetId(null);
    setSelectedActionId(null);
    setSelectedSubjectId(null);
    setFeedbackMsg(null);
    setMultiSelectActive(false);
    dispatch(closeSocialPanel());
  }

  // ── Execute flow state ────────────────────────────────────────────────────
  // Selection state keeps the visible selection as a Set while tracking the
  // last interacted target separately. This avoids inferring the "primary"
  // target from Set iteration order, which can be wrong for shift-click ranges.
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [primaryTargetId, setPrimaryTargetId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  // Subject for primaryPlusSubject actions (the person being talked *about*).
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const [executing, setExecuting] = useState(false);
  const successPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Re-entrancy guard: prevents double-execution on rapid clicks (synchronous
  // state updates are batched and `executing` state may not be visible yet).
  const isExecutingRef = useRef(false);

  // Clean up feedback and double-spend guard timers on unmount.
  useEffect(() => () => {
    if (successPulseTimerRef.current !== null) clearTimeout(successPulseTimerRef.current);
    if (executeGuardTimerRef.current !== null) clearTimeout(executeGuardTimerRef.current);
  }, []);

  // Derived — computed before the early return so all hooks remain unconditional.
  const selectedAction = selectedActionId ? SocialManeuvers.getActionById(selectedActionId) : null;
  const targetMode = selectedAction?.targetMode ?? (selectedAction?.needsTargets === false ? 'none' : 'primary');
  const isBatchCompatible = targetMode === 'primary'
    && !selectedAction?.requiredTargetStatus
    && selectedActionId !== 'proposeAlliance';
  const usesMultipleTargets = targetMode === 'multi' || (multiSelectActive && isBatchCompatible);
  const selectedTargetCount = selectedTargets.size;
  const effectivePrimaryTargetId = targetMode === 'none' ? null : primaryTargetId;
  const needsTarget = targetMode !== 'none';
  const needsSubject = targetMode === 'primaryPlusSubject';
  const hasRequiredTargets = targetMode === 'multi'
    ? selectedTargets.size >= 2
    : usesMultipleTargets
      ? selectedTargets.size >= 1
    : !needsTarget || effectivePrimaryTargetId !== null;
  const targetCount = usesMultipleTargets ? selectedTargetCount : 1;
  const totalCosts = useMemo(() => {
    const baseCosts = selectedAction
    ? SocialManeuvers.computeActionCosts(
        humanPlayer?.id ?? '',
        selectedAction,
        effectivePrimaryTargetId ?? humanPlayer?.id ?? '',
      )
    : null;
    return baseCosts
    ? selectedActionId === 'group_chat'
      ? { ...baseCosts, energy: Math.max(2, selectedTargetCount) }
      : usesMultipleTargets
        ? {
            energy: baseCosts.energy * targetCount,
            influence: baseCosts.influence * targetCount,
            info: baseCosts.info * targetCount,
          }
        : baseCosts
    : null;
  }, [
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
    !!selectedActionId &&
    hasRequiredTargets &&
    (!needsSubject || selectedSubjectId !== null);
  const canExecute = hasExecutableSelection;
  const hiddenContextualActionIds = useMemo(() => {
    const hidden = new Set<string>();
    const beforeNominations = game.phase === 'social_1' && game.nomineeIds.length === 0;
    const safetyDecisionOpen = ['pos_results', 'pos_ceremony'].includes(game.phase)
      && !!game.posWinnerId
      && !game.povSavedId;
    const humanIsLoh = game.lohId === humanPlayer?.id;
    const humanIsNominated = !!humanPlayer?.status.includes('nominated');
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
    ]
      .includes(game.phase);
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
  }, [game.phase, game.nomineeIds.length, game.lohId, game.posWinnerId, game.povSavedId, humanPlayer?.id, humanPlayer?.status]);

  // Clear subject whenever action or primary target changes.
  // NOTE: This is done explicitly in the event handlers (handleActionClick and
  // handleSelectionChange) rather than a useEffect so that subject clears in
  // the same render as the action/target change, avoiding an extra re-render
  // cycle and the associated setState-inside-effect ESLint rule violation.

  // Handle action selection. Clears the subject so a stale subject from a
  // previous primaryPlusSubject action never leaks into a new action context.
  const handleActionClick = useCallback((actionId: string) => {
    const nextAction = SocialManeuvers.getActionById(actionId);
    const nextMode = nextAction?.targetMode ?? (nextAction?.needsTargets === false ? 'none' : 'primary');
    const nextBatchCompatible = nextMode === 'primary'
      && !nextAction?.requiredTargetStatus
      && actionId !== 'proposeAlliance';
    if (nextMode === 'multi') {
      setMultiSelectActive(true);
    } else if (!nextBatchCompatible && primaryTargetId) {
      setSelectedTargets(new Set([primaryTargetId]));
    }
    setSelectedActionId(actionId);
    setSelectedSubjectId(null);
  }, [primaryTargetId, setMultiSelectActive, setSelectedActionId, setSelectedSubjectId, setSelectedTargets]);

  // Handle player selection from PlayerList.
  // For 'multi' actions the full Set is preserved; for all other modes only the
  // last-clicked player is kept so the UX stays simple.
  // Clears the subject whenever the primary target changes.
  // Also clears the selected action if the new target's status doesn't satisfy
  // the action's requiredTargetStatus constraint (e.g. switching away from LOH).
  const handleSelectionChange = useCallback((
    ids: Set<string>,
    details: { primaryTargetId: string | null },
  ) => {
    if (usesMultipleTargets) {
      setSelectedTargets(new Set(ids));
      setPrimaryTargetId(details.primaryTargetId);
    } else {
      const nextPrimaryTargetId = details.primaryTargetId;
      setSelectedTargets(nextPrimaryTargetId ? new Set([nextPrimaryTargetId]) : new Set());
      setPrimaryTargetId(nextPrimaryTargetId);
    }
    setSelectedSubjectId(null);

    // Clear role-gated action when the new target no longer qualifies.
    if (selectedAction?.requiredTargetStatus) {
      const nextTargetStatus = details.primaryTargetId
        ? game.players.find((p) => p.id === details.primaryTargetId)?.status
        : null;
      if (!nextTargetStatus || !selectedAction.requiredTargetStatus.includes(nextTargetStatus)) {
        setSelectedActionId(null);
      }
    }
  }, [game.players, selectedAction, setPrimaryTargetId, setSelectedActionId, setSelectedSubjectId, setSelectedTargets, usesMultipleTargets]);

  const handleExecute = useCallback(() => {
    if (!hasExecutableSelection || !humanPlayer || !selectedActionId || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setExecuting(true);
    setFeedbackMsg(null);
    // targetMode 'none' actions must ignore stale roster selection and execute
    // against the actor, while targeted actions use the explicit primary target.
    const targetIds = targetMode === 'none'
      ? [humanPlayer.id]
      : usesMultipleTargets
        ? Array.from(selectedTargets)
        : effectivePrimaryTargetId ? [effectivePrimaryTargetId] : [];
    if (targetIds.length === 0) {
      setFeedbackMsg('Select a player to continue.');
      isExecutingRef.current = false;
      setExecuting(false);
      return;
    }
    // Guard: block actions targeting unknown, evicted, or jury players.
    if (targetMode === 'multi' && targetIds.length < 2) {
      setFeedbackMsg('Select at least two players for a group action.');
      isExecutingRef.current = false;
      setExecuting(false);
      return;
    }
    if (!totalCosts || !SocialManeuvers.canAfford(humanPlayer.id, totalCosts)) {
      const needs = [
        totalCosts && totalCosts.energy > energy ? `⚡${totalCosts.energy}` : null,
        totalCosts && totalCosts.influence > influence ? `🤝${totalCosts.influence}` : null,
        totalCosts && totalCosts.info > info ? `💡${totalCosts.info}` : null,
      ].filter(Boolean).join(', ');
      const onlyEnergyShort = !!totalCosts
        && totalCosts.energy > energy
        && totalCosts.influence <= influence
        && totalCosts.info <= info;
      setFeedbackMsg(`Insufficient resources${onlyEnergyShort ? ': insufficient energy' : ''}${needs ? ` — need ${needs}` : ''}. Nothing was spent.`);
      isExecutingRef.current = false;
      setExecuting(false);
      return;
    }
    const hasInvalidTarget = targetIds.some((targetId) => {
      const targetPlayer = game.players.find((p) => p.id === targetId);
      return !targetPlayer || targetPlayer.status === 'evicted' || targetPlayer.status === 'jury';
    });
    if (hasInvalidTarget) {
      setFeedbackMsg('Cannot target an eliminated or Tribunal player.');
      isExecutingRef.current = false;
      setExecuting(false);
      return;
    }
    const results = targetIds.map((targetId, index) =>
      SocialManeuvers.executeAction(humanPlayer.id, targetId, selectedActionId, {
        source: 'manual',
        subjectId: selectedSubjectId ?? undefined,
        waiveCosts: index > 0,
        costOverride: index === 0 ? totalCosts : undefined,
      }),
    );
    const result = results[0];
    const successfulResults = results.filter((entry) => entry.success);
    setFeedbackMsg(usesMultipleTargets
      ? successfulResults.length === targetIds.length
        ? `${selectedAction?.title ?? 'Action'} reached all ${targetIds.length} selected housemates.`
        : `${selectedAction?.title ?? 'Action'} reached ${successfulResults.length} of ${targetIds.length} selected housemates.`
      : result.summary);
    if (successfulResults.length > 0) {
      const targetNames = targetIds.map(
        (targetId) => game.players.find((player) => player.id === targetId)?.name ?? targetId,
      );
      const subjectName = selectedSubjectId
        ? game.players.find((player) => player.id === selectedSubjectId)?.name ?? selectedSubjectId
        : null;
      const persistentText = selectedActionId === 'group_chat'
        ? `You hosted a group chat with ${formatPlayerNames(targetNames)}.`
        : selectedActionId === 'ask_loh_target'
          ? result.summary
          : subjectName
            ? `You used ${selectedAction?.title ?? selectedActionId} with ${targetNames[0]} about ${subjectName}.`
            : getSocialNarrative(
                selectedActionId,
                formatPlayerNames(targetNames),
                Date.now(),
              );
      dispatch(addTvEvent({
        text: persistentText,
        type: 'social',
        source: 'manual',
        channels: ['mainLog'],
      }));
    }
    if (successfulResults.length > 0) {
      // Bug fix: action state is intentionally NOT cleared after success.
      // This keeps the action grid stable and avoids the "random %" / disappearing-
      // cards regression where a cleared selectedTarget would leave the preview
      // popup in an undefined/empty state while previewActionId was still set.
      // The Execute button stays enabled so the player can immediately repeat or
      // choose a different action / target without extra clicks.
      setSuccessPulse(true);
      if (successPulseTimerRef.current !== null) clearTimeout(successPulseTimerRef.current);
      successPulseTimerRef.current = setTimeout(() => {
        setSuccessPulse(false);
        successPulseTimerRef.current = null;
      }, 850);
    }
    if (executeGuardTimerRef.current !== null) clearTimeout(executeGuardTimerRef.current);
    executeGuardTimerRef.current = setTimeout(() => {
      isExecutingRef.current = false;
      setExecuting(false);
      executeGuardTimerRef.current = null;
    }, EXECUTE_REENTRY_GUARD_MS);
  }, [dispatch, effectivePrimaryTargetId, energy, game.players, hasExecutableSelection, humanPlayer, info, influence, selectedAction, selectedActionId, selectedSubjectId, selectedTargets, setExecuting, setFeedbackMsg, setSuccessPulse, targetMode, totalCosts, usesMultipleTargets]);

  if (!open) return null;

  // ── Player list for Social module ─────────────────────────────────────────
  // - Remove pre-jury evictees (status 'evicted' → didn't make jury) entirely.
  // - Sort jury members (evicted but in jury house) to the bottom as disabled.
  const allNonUser = game.players.filter((p) => !p.isUser && p.status !== 'evicted');
  const activePlayers = allNonUser.filter((p) => p.status !== 'jury');
  const juryPlayers = allNonUser.filter((p) => p.status === 'jury');
  const orderedPlayers = [...activePlayers, ...juryPlayers];
  const disabledPlayerIds = juryPlayers.map((p) => p.id);

  // ── Week-over-week relationship deltas (current - snapshot at week start) ──
  // Shows how the human player's relationship with each houseguest changed
  // over the course of this week (includes background seeding + social actions).
  const deltasByTargetId = new Map<string, number>();
  if (humanPlayer) {
    const currentRels = relationships?.[humanPlayer.id] ?? {};
    const snapshotRels = weekStartRelSnapshot[humanPlayer.id] ?? {};
    for (const [targetId, rel] of Object.entries(currentRels)) {
      // Note: If a relationship exists now but not in the week-start snapshot,
      // we treat its starting affinity as 0. This is intentional so that
      // deltas reflect all changes this week, including initial seeding and
      // background adjustments. As a consequence, relationships that are
      // first seeded in week 1 will show their full seeded value as a
      // positive delta, which may look like a large "jump" even though it is
      // just the initial seed rather than organic growth.
      const snapAffinity = snapshotRels[targetId] ?? 0;
      const weeklyDelta = rel.affinity - snapAffinity;
      if (weeklyDelta !== 0) {
        deltasByTargetId.set(targetId, weeklyDelta);
      }
    }
  }

  // ── Subject candidates for primaryPlusSubject actions ─────────────────────
  const subjectCandidates =
    needsSubject && effectivePrimaryTargetId && selectedAction?.subjectPool
      ? getSubjectCandidates(
          selectedAction.subjectPool,
          effectivePrimaryTargetId,
          selectedAction.allowActorAsSubject
            ? [...orderedPlayers, humanPlayer!]
            : orderedPlayers,
          humanPlayer!.id,
          relationships as Record<string, Record<string, { affinity: number }>> | undefined,
          selectedAction.allowActorAsSubject,
        )
      : [];

  return (
    <div className="sp2-backdrop" role="dialog" aria-modal="true" aria-label="Social Phase">
      {/* Skip link: lets keyboard users jump past the header directly to actions */}
      <a className="sp2-skip-link" href="#sp2-body">Skip to actions</a>
      <div className="sp2-modal">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sp2-header">
          <span className="sp2-header__title">💬 Social Phase</span>
          <div className="sp2-header__resources">
            <span
              className="sp2-energy-chip"
              aria-live="polite"
              aria-label={`Energy: ${energy}`}
            >
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

        {/* ── Two-column body ──────────────────────────────────────────────── */}
        <div id="sp2-body" className="sp2-body">
          {/* Left column – Player roster */}
          <div className="sp2-column" aria-label="Player roster">
            <div className="sp2-column__heading">
              <span className="sp2-column__label">Players</span>
              {usesMultipleTargets && (
                <span className="sp2-multi-hint" role="status">
                  Group: {selectedTargets.size} selected · {targetMode === 'multi' ? 'tap 2+ players' : 'applies to everyone selected'}
                </span>
              )}
            </div>
            <PlayerList
              players={orderedPlayers}
              humanPlayerId={humanPlayer!.id}
              relationships={relationships}
              disabledIds={disabledPlayerIds}
              selectedIds={selectedTargets}
              onSelectionChange={handleSelectionChange}
              deltasByTargetId={deltasByTargetId}
              multiSelect={usesMultipleTargets}
            />
          </div>

          {/* Right column – Action grid */}
          <div className="sp2-column" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={handleActionClick}
              selectedTargetIds={
                targetMode === 'none' || selectedTargets.size === 0 ? undefined : selectedTargets
              }
              players={orderedPlayers}
              actorId={humanPlayer!.id}
              actorEnergy={energy}
              actorInfluence={influence}
              actorInfo={info}
              relationships={relationships}
              primaryTargetStatus={
                primaryTargetId
                  ? game.players.find((p) => p.id === primaryTargetId)?.status ?? null
                  : null
              }
              hiddenActionIds={hiddenContextualActionIds}
              energyCostOverrides={
                selectedActionId && totalCosts
                  ? { [selectedActionId]: totalCosts.energy }
                  : undefined
              }
            />
          </div>
        </div>

        {/* ── Subject picker: compact inline chip row for "talk to X about Y" ── */}
        {needsSubject && effectivePrimaryTargetId && (
          <div className="sp2-subject-picker" aria-label="Choose subject">
            <span className="sp2-subject-picker__label">
              Talking about:
            </span>
            {subjectCandidates.length === 0 ? (
              <span className="sp2-subject-picker__empty">No eligible targets</span>
            ) : (
              <div className="sp2-subject-picker__chips" role="group" aria-label="Subject candidates">
                {subjectCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`sp2-subject-chip${selectedSubjectId === candidate.id ? ' sp2-subject-chip--selected' : ''}`}
                    aria-pressed={selectedSubjectId === candidate.id}
                    onClick={() =>
                      setSelectedSubjectId((prev) => (prev === candidate.id ? null : candidate.id))
                    }
                  >
                    <PlayerAvatar player={candidate} size="sm" showRelationshipOutline={false} />
                    <span className="sp2-subject-chip__name">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Recent Activity – compact fixed-height log above footer ─────── */}
        <div className="sp2-recent" aria-label="Recent Activity log">
          <RecentActivity players={game.players.filter((p) => !p.isUser)} />
        </div>

        {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
        <footer className="sp2-footer">
          {feedbackMsg ? (
            <span className="sp2-footer__feedback" role="status" aria-live="polite">{feedbackMsg}</span>
          ) : (
            <span className="sp2-footer__cost">
              {totalCosts
                ? `Cost: ⚡${totalCosts.energy}${totalCosts.influence ? ` · 🤝${totalCosts.influence}` : ''}${totalCosts.info ? ` · 💡${totalCosts.info}` : ''}`
                : 'Cost: —'}
            </span>
          )}
          <button
            className={`sp2-footer__execute${successPulse ? ' sp2-footer__execute--pulse' : ''}`}
            type="button"
            disabled={!canExecute}
            aria-busy={executing}
            onClick={handleExecute}
          >
            Execute
          </button>
        </footer>
      </div>
    </div>
  );
}
