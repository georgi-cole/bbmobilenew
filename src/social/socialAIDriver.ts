/**
 * socialAIDriver — conservative, budget-aware driver that ticks at a
 * configurable interval and triggers AI social actions.
 *
 * Public API:
 *   setStore(store)   — wire Redux store (called from SocialEngine.init)
 *   start()           — begin ticking; calls SocialPolicy + SocialManeuvers
 *   stop()            — cancel ticking immediately
 *   getStatus()       — returns { running, tickCount, actionsExecuted }
 *
 * Behaviour:
 *   • On start(), iterates non-human active players, chooses actions via
 *     SocialPolicy, executes via SocialManeuvers.executeAction, and repeats
 *     every tickIntervalMs until all AI budgets are exhausted or the safety
 *     MAX_TICKS guard fires.
 *   • Skips 'idle' to avoid zero-cost loops.
 *   • Respects socialConfig.allowOverspend: when false, stops as soon as all
 *     budgets are exhausted.
 *
 * Debug: window.__smAutoDriver exposes { start, stop, getStatus } in browsers.
 */

import { chooseActionFor, chooseTargetsFor } from './SocialPolicy';
import { executeAction, getActionById, canAfford } from './SocialManeuvers';
import { normalizeActionCosts } from './smExecNormalize';
import { socialConfig } from './socialConfig';
import {
  applyEnergyDelta,
  applyInfluenceDelta,
  applyInfoDelta,
  scheduleIncomingInteraction,
} from './socialSlice';
import {
  assignDeliverySlot,
  buildDeliverySlotCounts,
  buildPendingIncomingInteractions,
  getInteractionDedupeReason,
  getIncomingInteractionPriority,
} from './incomingInteractionScheduler';
import type {
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionType,
  RelationshipsMap,
  ScheduledIncomingInteraction,
} from './types';

// ── Internal state ────────────────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface DriverState {
  game: {
    players: Array<{ id: string; name?: string; status: string; isUser?: boolean }>;
    seed: number;
    week: number;
    phase: string;
    lohId?: string | null;
    posWinnerId?: string | null;
    povProtectedIds?: string[];
  };
  social: {
    energyBank: Record<string, number>;
    influenceBank: Record<string, number>;
    infoBank: Record<string, number>;
    relationships: RelationshipsMap;
    incomingInteractions?: IncomingInteraction[];
    scheduledIncomingInteractions?: ScheduledIncomingInteraction[];
    incomingInteractionDelivery?: IncomingInteractionDeliveryState;
  };
}

const MAX_TICKS = () => socialConfig.maxTicksPerPhase;

let _store: StoreAPI | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _tickCount = 0;
let _actionsExecuted = 0;

// ── Public API ────────────────────────────────────────────────────────────

/** Wire the Redux store. Called once from SocialEngine.init(). */
export function setStore(store: StoreAPI): void {
  _store = store;
}

/**
 * Begin the AI action loop.
 * No-ops if the store is not wired, already running, or no AI players have
 * a positive budget.
 */
export function start(): void {
  if (!_store || _running) return;

  const state = _store.getState() as DriverState;
  const aiPlayers = _aiPlayers(state);
  const budgets = state.social?.energyBank ?? {};
  const hasActiveBudgets = aiPlayers.some((p) => (budgets[p.id] ?? 0) > 0);
  if (!hasActiveBudgets) return;

  _running = true;
  _tickCount = 0;
  _actionsExecuted = 0;

  if (socialConfig.verbose) {
    console.debug('[socialAIDriver] started – AI players:', aiPlayers.map((p) => p.id));
  }

  _timer = setInterval(_tick, socialConfig.tickIntervalMs);
}

/** Cancel the AI action loop immediately. */
export function stop(): void {
  _running = false;
  _clearTimer();

  if (socialConfig.verbose) {
    console.debug(
      `[socialAIDriver] stopped – ticks: ${_tickCount}, actions: ${_actionsExecuted}`,
    );
  }
}

/** Return a snapshot of driver status. */
export function getStatus(): { running: boolean; tickCount: number; actionsExecuted: number } {
  return { running: _running, tickCount: _tickCount, actionsExecuted: _actionsExecuted };
}

export const socialAIDriver = { setStore, start, stop, getStatus };

// ── Internal helpers ──────────────────────────────────────────────────────

function _aiPlayers(state: DriverState) {
  return (state.game?.players ?? []).filter(
    (p) => !p.isUser && p.status !== 'evicted' && p.status !== 'jury',
  );
}

function _clearTimer(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}

const HUMAN_FACING_ACTION_TYPES: Partial<Record<string, IncomingInteractionType>> = {
  ally: 'alliance_proposal',
  proposeAlliance: 'alliance_proposal',
  compliment: 'compliment',
  protect: 'deal_offer',
  whisper: 'gossip',
  share_intel: 'gossip',
  rumor: 'warning',
  confront: 'snide_remark',
  startFight: 'snide_remark',
  ask_use_safety: 'deal_offer',
  nominate: 'warning',
};

const HUMAN_FACING_ACTION_TEXT: Partial<Record<string, string[]>> = {
  ally: ['I think our games fit together. I want to make this official—are you in?', 'The house is splitting, and I would rather have you beside me. Want to work together?'],
  proposeAlliance: ['I trust what we have been building. Are you ready to call it an alliance?', 'I see a real path for us if we commit now. Are you in?'],
  compliment: ['You handled the pressure well today. I wanted you to hear that directly from me.', 'The way you carried yourself today stood out—in a good way.'],
  protect: ['I may be able to keep heat off you this week, but I need to know we are working together.', 'Your name is vulnerable. I can help, if we can trust each other.'],
  whisper: ['I heard something privately that could change how you read this week.', 'There is a quiet conversation happening that you should know about.'],
  share_intel: ['I have information that could matter to your next move.', 'I learned something useful, but I need to know what you will do with it.'],
  rumor: ['Your name is coming up more than you may realize. I thought you deserved a warning.', 'The tone changes when you leave the room. Be careful who you trust.'],
  confront: ['We need to clear the air about how you have been moving.', 'Something between us is not adding up, and I want a direct answer.'],
  startFight: ['I am done pretending everything between us is fine.', 'You crossed a line with me, and I am not letting it slide.'],
  ask_use_safety: ['Before the Safety decision, I need to know whether you would use it to help me.', 'You hold Safety, and that makes this conversation urgent: would you save me?'],
  nominate: ['I am considering putting your name in danger this week. Give me a reason not to.', 'Your name is part of my plan right now, and I wanted to hear what you would say.'],
};

function _pickHumanFacingText(actionId: string, actorId: string, week: number): string {
  const variants = HUMAN_FACING_ACTION_TEXT[actionId] ?? ['I wanted to talk to you directly.'];
  const seed = [...actorId].reduce((total, char) => total + char.charCodeAt(0), week);
  return variants[seed % variants.length];
}

function _routeHumanFacingAction(
  actorId: string,
  actionId: string,
  costs: { energy: number; influence: number; info: number },
): boolean {
  if (!_store) return false;
  const type = HUMAN_FACING_ACTION_TYPES[actionId];
  if (!type) return false;

  const current = _store.getState() as DriverState;
  const human = current.game.players.find((player) => player.isUser);
  if (actionId === 'nominate' && human) {
    const isProtected = current.game.posWinnerId === human.id
      || current.game.povProtectedIds?.includes(human.id)
      || human.status.includes('pos');
    const relationship = current.social.relationships[actorId]?.[human.id];
    const isTrustedAlly = (relationship?.affinity ?? 0) >= 30
      || relationship?.tags.includes('alliance') === true;
    if (isProtected || current.game.lohId !== actorId || isTrustedAlly) return true;
  }
  const now = Date.now();
  const week = current.game.week ?? 1;
  const phase = current.game.phase;
  const scheduled = current.social.scheduledIncomingInteractions ?? [];
  const pending = buildPendingIncomingInteractions(
    current.social.incomingInteractions ?? [],
    scheduled,
  );
  const directContactsThisWeek = pending.filter(
    (entry) => entry.createdWeek === week && entry.payload?.source === 'background_social',
  ).length;
  if (
    directContactsThisWeek >= 1 ||
    pending.filter((entry) => entry.createdWeek === week).length >= socialConfig.incomingInteractionConfig.maxPerWeek
  ) return true;

  const interaction: IncomingInteraction = {
    id: `ai-action-${actionId}-${actorId}-${now}`,
    fromId: actorId,
    type,
    text: _pickHumanFacingText(actionId, actorId, week),
    payload: {
      originActionId: actionId,
      scenarioKey: `background_${actionId}`,
      variantFamilyId: `background_${actionId}`,
      phase,
      source: 'background_social',
    },
    createdAt: now,
    createdWeek: week,
    expiresAtWeek: week + 1,
    read: false,
    requiresResponse: true,
    resolved: false,
  };
  const priority = getIncomingInteractionPriority(type);
  if (getInteractionDedupeReason({ interaction, priority, pendingInteractions: pending, week })) {
    return true;
  }
  const deliveredThisPhase =
    current.social.incomingInteractionDelivery?.lastDeliveryPhase === phase &&
    current.social.incomingInteractionDelivery?.lastDeliveryWeek === week
      ? current.social.incomingInteractionDelivery.deliveredThisPhase
      : 0;
  const slot = assignDeliverySlot({
    phase,
    week,
    priority,
    slotCounts: buildDeliverySlotCounts(scheduled, phase, week, deliveredThisPhase),
    visibleActiveCount: (current.social.incomingInteractions ?? []).filter((entry) => !entry.resolved).length,
  });
  if (!slot) return true;

  _store.dispatch(applyEnergyDelta({ playerId: actorId, delta: -costs.energy }));
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -costs.influence }));
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -costs.info }));
  }
  _store.dispatch(scheduleIncomingInteraction({
    interaction,
    priority,
    scheduledAt: now,
    scheduledForWeek: slot.scheduledForWeek,
    scheduledForPhase: slot.scheduledForPhase,
    deliveryReason: slot.deliveryReason,
  }));
  return true;
}

function _tick(): void {
  if (!_store || !_running) {
    _clearTimer();
    return;
  }

  _tickCount++;

  const state = _store.getState() as DriverState;
  const players = state.game?.players ?? [];
  const aiPlayers = _aiPlayers(state);
  const budgets = state.social?.energyBank ?? {};

  // Safety guard
  if (_tickCount >= MAX_TICKS()) {
    stop();
    return;
  }

  // Stop if all budgets exhausted (when allowOverspend is false)
  if (!socialConfig.allowOverspend && !aiPlayers.some((p) => (budgets[p.id] ?? 0) > 0)) {
    stop();
    return;
  }

  const context = {
    players,
    relationships: state.social?.relationships ?? {},
    week: state.game?.week ?? 0,
    seed: state.game?.seed ?? 0,
  };

  // One action per AI player per tick (conservative)
  for (const player of aiPlayers) {
    if ((budgets[player.id] ?? 0) <= 0) continue;

    const actionId = chooseActionFor(player.id, context);
    if (actionId === 'idle') continue;

    // Check full affordability (energy + influence + info) before attempting
    const actionDef = getActionById(actionId);
    if (!actionDef) continue;
    if (!canAfford(player.id, normalizeActionCosts(actionDef))) continue;

    const targets = chooseTargetsFor(player.id, actionId, context);
    if (targets.length === 0) continue;

    const [targetId, subjectId] = targets;
    const targetPlayer = players.find((candidate) => candidate.id === targetId);
    if (
      targetPlayer?.isUser &&
      _routeHumanFacingAction(player.id, actionId, normalizeActionCosts(actionDef))
    ) {
      _actionsExecuted++;
      continue;
    }
    const result = executeAction(player.id, targetId, actionId, {
      source: 'system',
      subjectId,
    });
    if (result.success) {
      _actionsExecuted++;
      if (socialConfig.verbose) {
        console.debug(
          `[socialAIDriver] ${player.id} → ${actionId} on ${targetId} ` +
            `(energy: ${result.newEnergy}, delta: ${result.delta})`,
        );
      }
    }
  }

  // After the tick, re-read budgets and stop if exhausted (when allowOverspend is false)
  if (!socialConfig.allowOverspend) {
    const updatedBudgets = (_store.getState() as DriverState).social?.energyBank ?? {};
    if (!aiPlayers.some((p) => (updatedBudgets[p.id] ?? 0) > 0)) {
      stop();
    }
  }
}

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__smAutoDriver'] = {
    start,
    stop,
    getStatus,
  };
}
