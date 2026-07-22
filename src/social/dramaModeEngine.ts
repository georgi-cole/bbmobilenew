import { normalizeAffinity } from './affinityUtils';
import { DRAMA_DIALOGUE_BANK, DRAMA_MODE_CONFIG, pickDramaCopy } from './dramaModeConfig';
import type {
  DramaArc,
  DramaArcStage,
  DramaArcType,
  DramaBeliefKind,
  DramaHouseEvent,
  DramaRumour,
  DramaRumourKind,
  DramaSocialNetwork,
  RelationshipsMap,
  SocialActionLogEntry,
  SocialMemoryMap,
} from './types';

export interface DramaPlayer {
  id: string;
  name: string;
  status: string;
  isUser?: boolean;
}
export interface DramaRelationshipEffect {
  source: string;
  target: string;
  delta: number;
  tags?: string[];
}
export interface DramaAdvanceInput {
  network: DramaSocialNetwork;
  players: DramaPlayer[];
  relationships: RelationshipsMap;
  week: number;
  phase: string;
  seed: number;
}
export interface DramaAdvanceResult {
  network: DramaSocialNetwork;
  relationshipEffects: DramaRelationshipEffect[];
  publicAnnouncement?: string;
}
export interface DramaActionEffectInput {
  actionId: string;
  actorId: string;
  targetId: string;
  subjectId?: string;
  actorName?: string;
  targetName?: string;
  week: number;
  phase: string;
  success?: boolean;
}
export interface DramaIncomingResponseEffect {
  holderId: string;
  subjectId: string;
  responseType: string;
  week: number;
}
export interface DramaAIMoveInput {
  actorId: string;
  players: DramaPlayer[];
  relationships: RelationshipsMap;
  memory: SocialMemoryMap;
  network: DramaSocialNetwork;
  recentActions?: SocialActionLogEntry[];
  week: number;
  phase: string;
  seed: number;
  tick: number;
  lohId?: string | null;
  posWinnerId?: string | null;
  nomineeIds?: string[];
}
export interface DramaAIMove {
  actionId: string;
  targetId: string;
  subjectId?: string;
  reason: string;
}

export function createInitialDramaSocialNetwork(): DramaSocialNetwork {
  return {
    arcs: [],
    rumours: [],
    beliefs: [],
    events: [],
    pacing: {
      week: 0,
      arcsStartedThisWeek: 0,
      rumourHopsThisWeek: 0,
      publicEventsThisWeek: 0,
      lastPublicEventWeek: -99,
      lastProcessedPhase: null,
    },
  };
}

export function normalizeDramaSocialNetwork(
  value?: Partial<DramaSocialNetwork> | null,
): DramaSocialNetwork {
  const base = createInitialDramaSocialNetwork();
  if (!value) return base;
  return {
    arcs: value.arcs ?? [],
    rumours: value.rumours ?? [],
    beliefs: value.beliefs ?? [],
    events: value.events ?? [],
    pacing: { ...base.pacing, ...(value.pacing ?? {}) },
  };
}

const clone = (network: DramaSocialNetwork): DramaSocialNetwork => {
  const value = normalizeDramaSocialNetwork(network);
  return {
    arcs: value.arcs.map((arc) => ({
      ...arc,
      participantIds: [...arc.participantIds] as [string, string],
    })),
    rumours: value.rumours.map((rumour) => ({
      ...rumour,
      listeners: rumour.listeners.map((listener) => ({ ...listener })),
    })),
    beliefs: value.beliefs.map((belief) => ({ ...belief })),
    events: value.events.map((event) => ({ ...event, participantIds: [...event.participantIds] })),
    pacing: { ...value.pacing },
  };
};
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const pairId = (a: string, b: string) => [a, b].sort().join('~');
function hash(seed: string): number {
  let result = 0;
  for (let i = 0; i < seed.length; i += 1)
    result = (Math.imul(result, 33) + seed.charCodeAt(i)) | 0;
  return Math.abs(result);
}
function names(text: string, players: DramaPlayer[], ids: string[]): string {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return text
    .replaceAll('{a}', name(ids[0]))
    .replaceAll('{b}', name(ids[1]))
    .replaceAll('{source}', name(ids[0]))
    .replaceAll('{subject}', name(ids[1]));
}
function relation(relationships: RelationshipsMap, a: string, b: string) {
  return normalizeAffinity(relationships[a]?.[b]?.affinity ?? 0);
}
function isTwinPair(players: DramaPlayer[], a: string, b: string) {
  const pair = new Set(
    [a, b].map((id) => (players.find((player) => player.id === id)?.name ?? id).toLowerCase()),
  );
  return pair.has('lia') && pair.has('ali');
}
function stageFor(intensity: number): DramaArcStage {
  if (intensity >= DRAMA_MODE_CONFIG.arcs.climaxIntensity) return 'climax';
  if (intensity >= DRAMA_MODE_CONFIG.arcs.establishedIntensity) return 'established';
  if (intensity >= 34) return 'building';
  return 'spark';
}

function upsertBelief(
  network: DramaSocialNetwork,
  holderId: string,
  subjectId: string,
  kind: DramaBeliefKind,
  confidence: number,
  sentiment: number,
  sourceId: string,
  week: number,
) {
  const id = `${holderId}:${subjectId}:${kind}`;
  const existing = network.beliefs.find((belief) => belief.id === id);
  if (existing) {
    existing.confidence = clamp(Math.max(existing.confidence, confidence), 0, 1);
    existing.sentiment = clamp(existing.sentiment + sentiment, -1, 1);
    existing.lastUpdatedWeek = week;
    existing.sourceId = sourceId;
    return;
  }
  network.beliefs.push({
    id,
    holderId,
    subjectId,
    kind,
    confidence: clamp(confidence, 0, 1),
    sentiment: clamp(sentiment, -1, 1),
    sourceId,
    createdWeek: week,
    lastUpdatedWeek: week,
  });
}

function startOrAdvanceArc(
  network: DramaSocialNetwork,
  type: DramaArcType,
  a: string,
  b: string,
  week: number,
  amount = 20,
): DramaArc {
  let arc = network.arcs.find(
    (entry) =>
      entry.status === 'active' &&
      entry.type === type &&
      pairId(...entry.participantIds) === pairId(a, b),
  );
  if (!arc) {
    arc = {
      id: `${type}:${pairId(a, b)}:${week}`,
      type,
      participantIds: [a, b],
      stage: 'spark',
      intensity: clamp(amount),
      startedWeek: week,
      lastAdvancedWeek: week,
      public: false,
      status: 'active',
    };
    network.arcs.push(arc);
  } else {
    arc.intensity = clamp(arc.intensity + amount);
    arc.stage = stageFor(arc.intensity);
    arc.lastAdvancedWeek = week;
  }
  return arc;
}

function addEvent(network: DramaSocialNetwork, event: Omit<DramaHouseEvent, 'id' | 'createdAt'>) {
  network.events.push({
    ...event,
    id: `${event.type}:${event.week}:${event.participantIds.join(':')}:${network.events.length}`,
    createdAt: Date.now(),
  });
  network.events = network.events.slice(-DRAMA_MODE_CONFIG.pacing.maxStoredEvents);
}

function makeRumour(
  network: DramaSocialNetwork,
  actorId: string,
  listenerId: string,
  subjectId: string,
  kind: DramaRumourKind,
  truth: DramaRumour['truth'],
  week: number,
) {
  const rumour: DramaRumour = {
    id: `rumour:${actorId}:${subjectId}:${week}:${network.rumours.length}`,
    kind,
    originatorId: actorId,
    subjectId,
    truth,
    createdWeek: week,
    expiresWeek: week + DRAMA_MODE_CONFIG.pacing.rumourLifetimeWeeks,
    listeners: [
      {
        playerId: listenerId,
        sourceId: actorId,
        confidence: truth === 'false' ? 0.44 : 0.62,
        believed: truth !== 'false',
        heardWeek: week,
      },
    ],
    status: 'circulating',
  };
  network.rumours.push(rumour);
  upsertBelief(
    network,
    listenerId,
    subjectId,
    kind === 'targeting' ? 'strategic_threat' : 'secretive',
    rumour.listeners[0].confidence,
    -0.2,
    actorId,
    week,
  );
}

export function applyDramaActionEffect(
  current: DramaSocialNetwork,
  input: DramaActionEffectInput,
): DramaSocialNetwork {
  const network = clone(current);
  const subject = input.subjectId ?? input.targetId;
  if (input.success === false) return network;
  if (input.actionId === 'flirt') {
    startOrAdvanceArc(network, 'romance', input.actorId, input.targetId, input.week, 24);
    upsertBelief(
      network,
      input.targetId,
      input.actorId,
      'romantic_interest',
      0.52,
      0.35,
      input.actorId,
      input.week,
    );
  }
  if (input.actionId === 'ride_or_die') {
    startOrAdvanceArc(network, 'bromance', input.actorId, input.targetId, input.week, 34);
    upsertBelief(
      network,
      input.targetId,
      input.actorId,
      'ride_or_die',
      0.68,
      0.45,
      input.actorId,
      input.week,
    );
  }
  if (input.actionId === 'betray')
    startOrAdvanceArc(network, 'betrayal', input.targetId, input.actorId, input.week, 45);
  if (input.actionId === 'stir_rivalry')
    startOrAdvanceArc(network, 'rivalry', input.targetId, subject, input.week, 26);
  if (input.actionId === 'public_callout') {
    startOrAdvanceArc(network, 'rivalry', input.actorId, input.targetId, input.week, 38);
    network.pacing.publicEventsThisWeek += 1;
    network.pacing.lastPublicEventWeek = input.week;
    addEvent(network, {
      type: 'confrontation',
      week: input.week,
      phase: input.phase,
      participantIds: [input.actorId, input.targetId],
      text: `HOUSE SHOCK: ${input.actorName ?? input.actorId} called out ${input.targetName ?? input.targetId} in front of everyone.`,
      public: true,
      severity: 'major',
    });
  }
  if (input.actionId === 'repair_bond')
    network.arcs
      .filter(
        (arc) =>
          arc.status === 'active' &&
          pairId(...arc.participantIds) === pairId(input.actorId, input.targetId) &&
          (arc.type === 'rivalry' || arc.type === 'betrayal'),
      )
      .forEach((arc) => {
        arc.intensity = clamp(arc.intensity - 35);
        arc.stage = arc.intensity <= 12 ? 'resolved' : 'strained';
        if (arc.stage === 'resolved') arc.status = 'resolved';
      });
  if (input.actionId === 'plant_lie')
    makeRumour(network, input.actorId, input.targetId, subject, 'fake_deal', 'false', input.week);
  if (input.actionId === 'rumor' || input.actionId === 'trade_secrets')
    makeRumour(
      network,
      input.actorId,
      input.targetId,
      subject,
      input.actionId === 'trade_secrets' ? 'secret_alliance' : 'targeting',
      'uncertain',
      input.week,
    );
  if (input.actionId === 'eavesdrop') {
    const rumour = network.rumours.find(
      (entry) =>
        entry.status === 'circulating' &&
        !entry.listeners.some((l) => l.playerId === input.actorId),
    );
    if (rumour)
      rumour.listeners.push({
        playerId: input.actorId,
        sourceId: rumour.listeners.at(-1)?.playerId ?? rumour.originatorId,
        confidence: 0.54,
        believed: true,
        heardWeek: input.week,
      });
  }
  if (input.actionId === 'expose_secret') {
    const rumour = network.rumours.find(
      (entry) => entry.status === 'circulating' && entry.subjectId === input.targetId,
    );
    if (rumour) {
      rumour.status = 'exposed';
      rumour.exposureWeek = input.week;
      network.pacing.publicEventsThisWeek += 1;
      network.pacing.lastPublicEventWeek = input.week;
      addEvent(network, {
        type: 'exposure',
        week: input.week,
        phase: input.phase,
        participantIds: [input.actorId, input.targetId],
        text: `HOUSE EXPOSED: ${input.actorName ?? input.actorId} took a secret involving ${input.targetName ?? input.targetId} public.`,
        public: true,
        severity: 'major',
      });
    }
  }
  return network;
}

export function applyDramaIncomingResponseEffect(
  current: DramaSocialNetwork,
  input: DramaIncomingResponseEffect,
): DramaSocialNetwork {
  const network = clone(current);
  const positive = ['positive', 'accept'].includes(input.responseType);
  const negative = ['negative', 'decline', 'dismiss', 'ignore'].includes(input.responseType);
  if (positive)
    upsertBelief(
      network,
      input.holderId,
      input.subjectId,
      'loyal',
      0.58,
      0.25,
      input.subjectId,
      input.week,
    );
  if (negative)
    upsertBelief(
      network,
      input.holderId,
      input.subjectId,
      'unreliable',
      0.54,
      -0.25,
      input.subjectId,
      input.week,
    );
  return network;
}

export function advanceDramaNetwork(input: DramaAdvanceInput): DramaAdvanceResult {
  const network = clone(input.network);
  const effects: DramaRelationshipEffect[] = [];
  const phaseKey = `${input.week}:${input.phase}`;
  if (network.pacing.lastProcessedPhase === phaseKey)
    return { network, relationshipEffects: effects };
  if (network.pacing.week !== input.week)
    network.pacing = {
      ...network.pacing,
      week: input.week,
      arcsStartedThisWeek: 0,
      rumourHopsThisWeek: 0,
      publicEventsThisWeek: 0,
      lastProcessedPhase: null,
    };
  network.pacing.lastProcessedPhase = phaseKey;
  network.rumours.forEach((rumour) => {
    if (rumour.status === 'circulating' && rumour.expiresWeek < input.week) rumour.status = 'dead';
  });

  let publicAnnouncement: string | undefined;

  for (const arc of network.arcs.filter(
    (entry) => entry.status === 'active' && entry.lastAdvancedWeek < input.week,
  )) {
    const [a, b] = arc.participantIds;
    const previousStage = arc.stage;
    const mutual = (relation(input.relationships, a, b) + relation(input.relationships, b, a)) / 2;
    const direction =
      arc.type === 'romance' || arc.type === 'bromance'
        ? mutual > 0.12
          ? 12
          : -16
        : mutual < 0
          ? 12
          : -18;
    arc.intensity = clamp(arc.intensity + direction);
    arc.stage = direction < 0 ? 'strained' : stageFor(arc.intensity);
    arc.lastAdvancedWeek = input.week;
    if (arc.intensity <= 12) {
      arc.stage = 'resolved';
      arc.status = 'resolved';
    }
    if (arc.stage === 'established' || arc.stage === 'climax') {
      const positive = arc.type === 'romance' || arc.type === 'bromance';
      effects.push(
        {
          source: a,
          target: b,
          delta: positive ? 4 : -5,
          tags: positive ? ['alliance', arc.type] : [arc.type, 'target'],
        },
        {
          source: b,
          target: a,
          delta: positive ? 4 : -5,
          tags: positive ? ['alliance', arc.type] : [arc.type, 'target'],
        },
      );
    }
    if (arc.stage !== previousStage) {
      const line = names(
        pickDramaCopy(DRAMA_DIALOGUE_BANK.arc[arc.type][arc.stage], `${arc.id}:${input.week}`),
        input.players,
        [a, b],
      );
      const canGoPublic =
        arc.stage === 'climax' &&
        network.pacing.publicEventsThisWeek < DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek &&
        input.week - network.pacing.lastPublicEventWeek >=
          DRAMA_MODE_CONFIG.pacing.publicEventCooldownWeeks;
      addEvent(network, {
        type: arc.type === 'betrayal' || arc.type === 'rivalry' ? 'confrontation' : 'arc_beat',
        week: input.week,
        phase: input.phase,
        participantIds: [a, b],
        text: line,
        public: canGoPublic,
        severity: canGoPublic ? 'major' : 'notable',
      });
      if (canGoPublic) {
        arc.public = true;
        publicAnnouncement = `HOUSE SHOCK: ${line}`;
        network.pacing.publicEventsThisWeek += 1;
        network.pacing.lastPublicEventWeek = input.week;
      }
    }
  }

  const activeIds = new Set(
    input.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury').map((p) => p.id),
  );
  const canStart =
    input.week >= DRAMA_MODE_CONFIG.pacing.minArcStartWeek &&
    network.pacing.arcsStartedThisWeek < DRAMA_MODE_CONFIG.pacing.maxNewArcsPerWeek &&
    network.arcs.filter((a) => a.status === 'active').length <
      DRAMA_MODE_CONFIG.pacing.maxActiveArcs;
  if (canStart && input.phase === 'social_2') {
    const ids = [...activeIds].sort();
    let candidate: { a: string; b: string; type: DramaArcType; score: number } | null = null;
    for (let i = 0; i < ids.length; i += 1)
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        if (
          network.arcs.some(
            (arc) => arc.status === 'active' && pairId(...arc.participantIds) === pairId(a, b),
          )
        )
          continue;
        const mutual =
          (relation(input.relationships, a, b) + relation(input.relationships, b, a)) / 2;
        let type: DramaArcType | null = null;
        let score = 0;
        if (mutual <= DRAMA_MODE_CONFIG.arcs.rivalryMaxMutualAffinity) {
          type = 'rivalry';
          score = -mutual;
        } else if (
          !isTwinPair(input.players, a, b) &&
          mutual >= DRAMA_MODE_CONFIG.arcs.romanceMinMutualAffinity &&
          hash(`${input.seed}:${input.week}:${a}:${b}`) % 4 === 0
        ) {
          type = 'romance';
          score = mutual + 0.08;
        } else if (mutual >= DRAMA_MODE_CONFIG.arcs.bromanceMinMutualAffinity) {
          type = 'bromance';
          score = mutual;
        }
        if (type && (!candidate || score > candidate.score)) candidate = { a, b, type, score };
      }
    if (candidate) {
      const arc = startOrAdvanceArc(
        network,
        candidate.type,
        candidate.a,
        candidate.b,
        input.week,
        22,
      );
      network.pacing.arcsStartedThisWeek += 1;
      const line = pickDramaCopy(DRAMA_DIALOGUE_BANK.arc[arc.type][arc.stage], arc.id);
      addEvent(network, {
        type: 'arc_beat',
        week: input.week,
        phase: input.phase,
        participantIds: [candidate.a, candidate.b],
        text: names(line, input.players, [candidate.a, candidate.b]),
        public: false,
        severity: 'quiet',
      });
    }
  }

  if (
    ['social_1', 'social_2'].includes(input.phase) &&
    network.pacing.rumourHopsThisWeek < DRAMA_MODE_CONFIG.pacing.maxRumourHopsPerWeek
  ) {
    const rumour = network.rumours.find(
      (entry) => entry.status === 'circulating' && entry.listeners.length > 0,
    );
    if (rumour) {
      const heard = new Set([
        rumour.originatorId,
        rumour.subjectId,
        ...rumour.listeners.map((l) => l.playerId),
      ]);
      const listenerId = [...activeIds].find((id) => !heard.has(id));
      const source = rumour.listeners.at(-1);
      if (listenerId && source) {
        const confidence = clamp(
          source.confidence +
            relation(input.relationships, listenerId, source.playerId) * 0.2 -
            0.08,
          0,
          1,
        );
        const believed = confidence >= DRAMA_MODE_CONFIG.rumours.beliefThreshold;
        rumour.listeners.push({
          playerId: listenerId,
          sourceId: source.playerId,
          confidence,
          believed,
          heardWeek: input.week,
        });
        network.pacing.rumourHopsThisWeek += 1;
        upsertBelief(
          network,
          listenerId,
          rumour.subjectId,
          'secretive',
          confidence,
          believed ? -0.2 : -0.05,
          source.playerId,
          input.week,
        );
        if (believed)
          effects.push({
            source: listenerId,
            target: rumour.subjectId,
            delta: -3,
            tags: ['suspicious'],
          });
        const line = pickDramaCopy(
          DRAMA_DIALOGUE_BANK.rumour[rumour.kind],
          `${rumour.id}:${listenerId}`,
        );
        addEvent(network, {
          type: 'rumour_spread',
          week: input.week,
          phase: input.phase,
          participantIds: [source.playerId, rumour.subjectId, listenerId],
          text: names(line, input.players, [source.playerId, rumour.subjectId]),
          public: false,
          severity: 'quiet',
        });
      }
    }
  }

  const exposureReady =
    input.week >= 3 &&
    network.pacing.publicEventsThisWeek < DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek &&
    input.week - network.pacing.lastPublicEventWeek >=
      DRAMA_MODE_CONFIG.pacing.publicEventCooldownWeeks &&
    ['nomination_results', 'pos_ceremony_results', 'social_2', 'eviction_results'].includes(
      input.phase,
    );
  if (exposureReady) {
    const rumour = network.rumours.find(
      (entry) =>
        entry.status === 'circulating' &&
        entry.listeners.length >= DRAMA_MODE_CONFIG.rumours.exposureListenerCount &&
        entry.listeners.some((l) => l.confidence >= DRAMA_MODE_CONFIG.rumours.exposureConfidence),
    );
    if (rumour) {
      rumour.status = 'exposed';
      rumour.exposureWeek = input.week;
      network.pacing.publicEventsThisWeek += 1;
      network.pacing.lastPublicEventWeek = input.week;
      const line = pickDramaCopy(DRAMA_DIALOGUE_BANK.exposure[rumour.kind], rumour.id);
      publicAnnouncement = names(line, input.players, [rumour.originatorId, rumour.subjectId]);
      addEvent(network, {
        type: 'exposure',
        week: input.week,
        phase: input.phase,
        participantIds: [rumour.originatorId, rumour.subjectId],
        text: publicAnnouncement,
        public: true,
        severity: 'major',
      });
      if (rumour.truth === 'false') {
        for (const listener of rumour.listeners)
          effects.push({
            source: listener.playerId,
            target: rumour.originatorId,
            delta: -6,
            tags: ['unreliable', 'betrayal'],
          });
      }
    }
  }
  return { network, relationshipEffects: effects, publicAnnouncement };
}

export function chooseDramaAIMove(input: DramaAIMoveInput): DramaAIMove | null {
  const alive = input.players.filter(
    (p) => p.id !== input.actorId && p.status !== 'evicted' && p.status !== 'jury',
  );
  if (!alive.length) return null;
  const byAffinity = [...alive].sort(
    (a, b) =>
      relation(input.relationships, input.actorId, b.id) -
      relation(input.relationships, input.actorId, a.id),
  );
  const rival = byAffinity[0];
  const close = byAffinity.at(-1) ?? alive[0];
  const nominees = new Set(input.nomineeIds ?? []);
  const alreadyDid = (actionId: string, targetId: string) =>
    (input.recentActions ?? []).some(
      (entry) =>
        entry.actorId === input.actorId &&
        entry.targetId === targetId &&
        entry.actionId === actionId &&
        entry.week === input.week,
    );
  const arc = input.network.arcs.find(
    (entry) => entry.status === 'active' && entry.participantIds.includes(input.actorId),
  );
  const other = arc?.participantIds.find((id) => id !== input.actorId);
  if (arc && other) {
    const conflictAction = arc.intensity >= 80 ? 'public_callout' : 'confront';
    if (
      (arc.type === 'rivalry' || arc.type === 'betrayal') &&
      arc.intensity >= 55 &&
      !alreadyDid(conflictAction, other)
    )
      return {
        actionId: conflictAction,
        targetId: other,
        reason: `${arc.type} arc at ${arc.intensity}`,
      };
    if (arc.type === 'romance' && !alreadyDid('flirt', other))
      return { actionId: 'flirt', targetId: other, reason: 'developing romance' };
    if (arc.type === 'bromance' && !alreadyDid('trade_secrets', other))
      return {
        actionId: 'trade_secrets',
        targetId: other,
        subjectId: rival.id,
        reason: 'ride-or-die information exchange',
      };
  }
  const knownRumour = input.network.rumours.find(
    (r) => r.status === 'circulating' && r.listeners.some((l) => l.playerId === input.actorId),
  );
  if (knownRumour && input.tick % 3 === 0)
    return {
      actionId: knownRumour.listeners.length >= 3 ? 'expose_secret' : 'trade_secrets',
      targetId: knownRumour.listeners.length >= 3 ? knownRumour.subjectId : close.id,
      subjectId: knownRumour.subjectId,
      reason: 'acting on named gossip',
    };
  if (
    nominees.has(input.actorId) &&
    input.posWinnerId &&
    input.posWinnerId !== input.actorId &&
    !alreadyDid('ask_use_safety', input.posWinnerId)
  )
    return {
      actionId: 'ask_use_safety',
      targetId: input.posWinnerId,
      subjectId: input.actorId,
      reason: 'nominee lobbying the POS holder',
    };
  if (input.lohId === input.actorId && nominees.has(rival.id))
    return { actionId: 'reassure', targetId: rival.id, reason: 'LOH managing nomination fallout' };
  if (input.posWinnerId === input.actorId && input.lohId && input.lohId !== input.actorId)
    return { actionId: 'whisper', targetId: input.lohId, reason: 'POS holder consulting the LOH' };
  const memory = input.memory[input.actorId]?.[close.id];
  if ((memory?.gratitude ?? 0) > 4)
    return { actionId: 'ride_or_die', targetId: close.id, reason: 'gratitude becoming loyalty' };
  const roll =
    hash(`${input.seed}:${input.week}:${input.phase}:${input.tick}:${input.actorId}`) % 5;
  if (roll === 0 && relation(input.relationships, input.actorId, close.id) > 0.3)
    return { actionId: 'ride_or_die', targetId: close.id, reason: 'strong mutual relationship' };
  if (roll === 1 && relation(input.relationships, input.actorId, rival.id) < -0.2)
    return {
      actionId: 'plant_lie',
      targetId: close.id,
      subjectId: rival.id,
      reason: 'strategic resentment',
    };
  return null;
}
