import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content)
}

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Missing required codemod anchor: ${label}`)
  }
  return content.replace(search, replacement)
}

function replaceAllRequired(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Missing required codemod anchor: ${label}`)
  }
  return content.split(search).join(replacement)
}

function replaceRegexOnce(content, expression, replacement, label) {
  if (!expression.test(content)) {
    throw new Error(`Missing required codemod pattern: ${label}`)
  }
  expression.lastIndex = 0
  return content.replace(expression, replacement)
}

function edit(relativePath, transform) {
  const before = read(relativePath)
  const after = transform(before)
  if (before !== after) write(relativePath, after)
}

edit('src/screens/Settings/Settings.tsx', (source) =>
  replaceOnce(
    source,
    '? hasDramaMode || settings.gameUX.dramaMode',
    '? hasDramaMode',
    'Drama entitlement must not authorize itself'
  )
)

edit('src/social/types.ts', (source) =>
  replaceOnce(
    source,
    '  /** Append-only log of social actions executed this session. */\n  sessionLogs: SocialActionLogEntry[];',
    `  /** Actions executed during the currently open Social panel session. */
  sessionLogs: SocialActionLogEntry[];
  /** Bounded gameplay history retained after the panel closes. */
  actionHistory?: SocialActionLogEntry[];
  /** Schema version used by backward-compatible social save migration. */
  socialStateVersion?: number;`,
    'SocialState persistent history fields'
  )
)

edit('src/social/SocialManeuvers.ts', (original) => {
  let source = original
  source = replaceOnce(
    source,
    "import { getSocialResourceEffect } from './socialResourceEconomy';",
    `import { getSocialResourceEffect } from './socialResourceEconomy';
import { getEffectiveSocialMode } from './socialMode';
import {
  getPersistentSocialHistory,
  type SocialStateWithHistory,
} from './socialHistory';`,
    'SocialManeuvers mode/history imports'
  )
  source = replaceOnce(
    source,
    '  sessionLogs: unknown[];\n};',
    `  sessionLogs: SocialActionLogEntry[];
  actionHistory?: SocialActionLogEntry[];
};`,
    'PartialSocialState action history'
  )
  source = replaceOnce(
    source,
    '  nomineeIds?: string[];\n}',
    `  nomineeIds?: string[];
  dramaSocialMode?: boolean;
}`,
    'ManeuverGameState mode snapshot'
  )
  source = replaceOnce(
    source,
    `interface StateForManeuvers {
  settings?: { gameUX?: { dramaMode?: boolean } };
  social: PartialSocialState;
}`,
    `interface StateForManeuvers {
  game?: ManeuverGameState;
  settings?: { gameUX?: { dramaMode?: boolean } };
  vip?: {
    isActive?: boolean;
    entitlements?: { dramaMode?: boolean };
  };
  social: PartialSocialState;
}`,
    'StateForManeuvers effective mode shape'
  )
  source = replaceOnce(
    source,
    '  const dramaMode = resolvedState?.settings?.gameUX?.dramaMode === true;',
    "  const dramaMode = getEffectiveSocialMode(resolvedState ?? {}) === 'drama';",
    'getAvailableActions effective mode'
  )
  source = replaceAllRequired(
    source,
    `    settings?: { gameUX?: { dramaMode?: boolean } };
  };`,
    `    settings?: { gameUX?: { dramaMode?: boolean } };
    vip?: {
      isActive?: boolean;
      entitlements?: { dramaMode?: boolean };
    };
  };`,
    'SocialManeuvers execution entitlement state'
  )
  source = replaceAllRequired(
    source,
    '  const dramaMode = state.settings?.gameUX?.dramaMode === true;',
    "  const dramaMode = getEffectiveSocialMode(state) === 'drama';",
    'SocialManeuvers effective mode'
  )
  source = replaceOnce(
    source,
    '  if (action.dramaOnly && state.settings?.gameUX?.dramaMode !== true) {',
    '  if (action.dramaOnly && !dramaMode) {',
    'Drama-only execution entitlement'
  )
  source = replaceOnce(
    source,
    `  if (dramaMode) {
    const eligibility = evaluateSocialActionEligibility({
      action,
      actorId,
      targetIds:
        action.targetMode === 'none' || action.needsTargets === false ? [] : [targetId],
      subjectId: options?.subjectId,
      phase: state.game?.phase,
      players: state.game?.players,
      relationships: state.social.relationships,
      dramaNetwork: state.social.dramaNetwork,
      dramaMode: true,
      requireCompleteSelection: true,
      allowAIOnly: true,
    });
    if (!eligibility.eligible) {
      return {
        success: false,
        delta: 0,
        newEnergy: currentEnergy,
        summary: eligibility.reason,
        score: 0,
        label: 'Unavailable',
      };
    }
  }`,
    `  const eligibility = evaluateSocialActionEligibility({
    action,
    actorId,
    targetIds: resolveActionTargetMode(action, dramaMode) === 'none' ? [] : [targetId],
    subjectId: options?.subjectId,
    phase: state.game?.phase,
    players: state.game?.players,
    relationships: state.social.relationships,
    dramaNetwork: state.social.dramaNetwork,
    dramaMode,
    requireCompleteSelection: true,
    allowAIOnly: true,
  });
  if (!eligibility.eligible) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: eligibility.reason,
      score: 0,
      label: 'Unavailable',
    };
  }`,
    'Canonical eligibility in both modes'
  )
  source = replaceAllRequired(
    source,
    'state.social.sessionLogs',
    'getPersistentSocialHistory(state.social as SocialStateWithHistory)',
    'Persistent repeat history'
  )
  source = replaceAllRequired(
    source,
    `    relationships: state.social.relationships,
  });`,
    `    relationships: state.social.relationships,
    random,
  });`,
    'Seeded Social outcome evaluation'
  )
  source = replaceOnce(
    source,
    '    dramaMode: state.settings?.gameUX?.dramaMode === true,',
    '    dramaMode,',
    'Group eligibility effective mode'
  )
  return source
})

edit('src/social/incomingInteractionAutonomy.ts', (original) => {
  let source = original
  source = replaceOnce(
    source,
    "import { getNamedInteractionText } from './namedInteractionBank';",
    `import { getNamedInteractionText } from './namedInteractionBank';
import { createIncomingInteraction } from './incomingInteractionFactory';
import { createDeterministicSocialRandom } from './socialExecutionGuard';
import { getSocialPersonality } from './socialPersonalityBank';
import { getEffectiveSocialMode } from './socialMode';
import { getRemoteScenarioLines } from './socialRuntimeConfig';`,
    'Autonomy shared Social imports'
  )
  source = replaceOnce(
    source,
    `    settings?: {
      gameUX?: { dramaMode?: boolean };
    };`,
    `    settings?: {
      gameUX?: { dramaMode?: boolean };
    };
    vip?: {
      isActive?: boolean;
      entitlements?: { dramaMode?: boolean };
    };`,
    'Autonomy entitlement state'
  )
  source = replaceOnce(
    source,
    `      sessionLogs?: SocialActionLogEntry[];
    };`,
    `      sessionLogs?: SocialActionLogEntry[];
      actionHistory?: SocialActionLogEntry[];
    };`,
    'Autonomy persistent history state'
  )
  source = replaceOnce(
    source,
    `      players?: AutonomyPlayer[];
      week?: number;`,
    `      players?: AutonomyPlayer[];
      week?: number;
      seed?: number;
      dramaSocialMode?: boolean;`,
    'Autonomy deterministic game context'
  )
  source = replaceRegexOnce(
    source,
    /function getPersonalityFactor\(actorId: string\): number \{\n  const tuning = socialConfig\.incomingInteractionAutonomyTuning;\n  return tuning\.personalityFactors\[actorId\] \?\? tuning\.defaultPersonalityFactor;\n\}/,
    `function getPersonalityFactor(actorId: string): number {
  return getSocialPersonality(actorId).socialEnergy;
}`,
    'Autonomy personality factor'
  )
  source = replaceOnce(
    source,
    `

  // Use the rich variant bank when families are available for this scenario.
  const variantFamilies = SCENARIO_VARIANT_POOLS[plan.scenarioKey];`,
    `

  const remoteTemplates = getRemoteScenarioLines(plan.scenarioKey);
  if (remoteTemplates?.length) {
    const template =
      remoteTemplates[Math.floor(rng() * remoteTemplates.length)] ?? remoteTemplates[0];
    return {
      text: renderInteractionTemplate(template, textContext),
      variantFamilyId: \`remote_\${plan.scenarioKey}\`,
      variantId: \`remote_\${plan.scenarioKey}:\${remoteTemplates.indexOf(template)}\`,
    };
  }

  // Use the rich variant bank when families are available for this scenario.
  const variantFamilies = SCENARIO_VARIANT_POOLS[plan.scenarioKey];`,
    'Server-managed scenario lines'
  )
  source = replaceRegexOnce(
    source,
    /\nfunction interactionTypeRequiresResponse\(type: IncomingInteractionType\): boolean \{\n  return type === 'alliance_proposal' \|\| type === 'deal_offer' \|\| type === 'nomination_plea';\n\}\n/,
    '\n',
    'Remove legacy response boolean policy'
  )
  source = replaceOnce(
    source,
    '  const dramaMode = state.settings?.gameUX?.dramaMode === true;',
    "  const dramaMode = getEffectiveSocialMode(state) === 'drama';",
    'Autonomy effective mode'
  )
  source = replaceOnce(
    source,
    '    dramaMode: contextOverride?.dramaMode ?? state.settings?.gameUX?.dramaMode === true,',
    '    dramaMode: contextOverride?.dramaMode ?? dramaMode,',
    'Autonomy context mode'
  )
  source = replaceOnce(
    source,
    `      (socialState.sessionLogs ?? []).filter(`,
    `      (socialState.actionHistory ?? socialState.sessionLogs ?? []).filter(`,
    'Autonomy persistent player action count'
  )
  source = replaceOnce(
    source,
    '    random: contextOverride?.random,',
    `    random:
      contextOverride?.random ??
      createDeterministicSocialRandom([gameState?.seed ?? 0, week, phase, playerId]),`,
    'Autonomy deterministic RNG'
  )
  source = replaceOnce(
    source,
    `    const interaction: IncomingInteraction = {
      id: generateInteractionId(),
      fromId: actor.id,
      type: plan.type,
      text: interactionText,
      payload: {
        scenarioKey: plan.scenarioKey,
        variantFamilyId: textResult.variantFamilyId,
        variantId: textResult.variantId,
        phase,
        actorStatus: actor.status,
        subjectId: subject?.id,
        dramaMode,
      },
      createdAt: Date.now(),
      createdWeek: week,
      expiresAtWeek: week + 1,
      read: false,
      requiresResponse: interactionTypeRequiresResponse(plan.type),
      resolved: false,
    };`,
    `    const interaction = createIncomingInteraction({
      id: generateInteractionId(),
      fromId: actor.id,
      type: plan.type,
      text: interactionText,
      week,
      phase,
      mode: dramaMode ? 'drama' : 'normal',
      payload: {
        scenarioKey: plan.scenarioKey,
        variantFamilyId: textResult.variantFamilyId,
        variantId: textResult.variantId,
        actorStatus: actor.status,
        subjectId: subject?.id,
      },
    });`,
    'Canonical autonomous interaction factory'
  )
  return source
})

edit('src/social/socialMiddleware.ts', (original) => {
  let source = original
  source = replaceOnce(
    source,
    "import { BETRAYAL_TAG, hasAllianceBetween } from './socialAlliance';",
    `import { BETRAYAL_TAG, hasAllianceBetween } from './socialAlliance';
import { getEffectiveSocialMode } from './socialMode';
import { getFamilyGroupId } from './socialRuntimeConfig';`,
    'Middleware effective mode imports'
  )
  source = replaceOnce(
    source,
    `  specialVeto?: { activeType?: string | null };
  players:`,
    `  specialVeto?: { activeType?: string | null };
  dramaSocialMode?: boolean;
  players:`,
    'Middleware game mode snapshot'
  )
  source = replaceOnce(
    source,
    `  settings?: { gameUX?: { dramaMode?: boolean } };
  social?: {`,
    `  settings?: { gameUX?: { dramaMode?: boolean } };
  vip?: {
    isActive?: boolean;
    entitlements?: { dramaMode?: boolean };
  };
  social?: {`,
    'Middleware entitlement state'
  )
  source = replaceAllRequired(
    source,
    'state.settings?.gameUX?.dramaMode !== true',
    "getEffectiveSocialMode(state) !== 'drama'",
    'Middleware negative Drama checks'
  )
  source = replaceAllRequired(
    source,
    'state.settings?.gameUX?.dramaMode === true',
    "getEffectiveSocialMode(state) === 'drama'",
    'Middleware state Drama checks'
  )
  source = replaceAllRequired(
    source,
    'prevState.settings?.gameUX?.dramaMode === true',
    "getEffectiveSocialMode(prevState) === 'drama'",
    'Middleware previous-state Drama checks'
  )
  source = replaceAllRequired(
    source,
    'afterState.settings?.gameUX?.dramaMode === true',
    "getEffectiveSocialMode(afterState) === 'drama'",
    'Middleware next-state Drama checks'
  )
  source = replaceOnce(
    source,
    `  return (api.getState() as StateWithGame).settings?.gameUX?.dramaMode === true;`,
    `  return getEffectiveSocialMode(api.getState() as StateWithGame) === 'drama';`,
    'Middleware helper effective Drama mode'
  )
  source = replaceOnce(
    source,
    `      const sourceTwinId = payload.source === 'lia' ? 'ali' : payload.source === 'ali' ? 'lia' : null;
      const targetTwinId = payload.target === 'lia' ? 'ali' : payload.target === 'ali' ? 'lia' : null;`,
    `      const familyMate = (playerId: string) => {
        const groupId = getFamilyGroupId(playerId);
        if (!groupId) return null;
        return (
          state.game.players.find(
            (player) =>
              player.id !== playerId &&
              aliveIds.has(player.id) &&
              getFamilyGroupId(player.id) === groupId,
          )?.id ?? null
        );
      };
      const sourceTwinId = familyMate(payload.source);
      const targetTwinId = familyMate(payload.target);`,
    'Config-driven family propagation'
  )
  return source
})

edit('src/social/dramaModeEngine.ts', (original) => {
  let source = original
  source = replaceOnce(
    source,
    "import { DRAMA_DIALOGUE_BANK, DRAMA_MODE_CONFIG, pickDramaCopy } from './dramaModeConfig'",
    `import { DRAMA_DIALOGUE_BANK, DRAMA_MODE_CONFIG, pickDramaCopy } from './dramaModeConfig'
import { areSocialFamilyMembers } from './socialRuntimeConfig'`,
    'Drama family metadata import'
  )
  source = replaceRegexOnce(
    source,
    /function isTwinPair\(players: DramaPlayer\[], a: string, b: string\) \{\n  const pair = new Set\([\s\S]*?return pair\.has\('lia'\) && pair\.has\('ali'\)\n\}/,
    `function isTwinPair(_players: DramaPlayer[], a: string, b: string) {
  return areSocialFamilyMembers(a, b)
}`,
    'Config-driven family pair detection'
  )
  source = replaceOnce(
    source,
    `    existing.confidence = clamp(Math.max(existing.confidence, confidence), 0, 1)
    existing.sentiment = clamp(existing.sentiment + sentiment, -1, 1)`,
    `    const reinforces =
      existing.sentiment === 0 || sentiment === 0 || Math.sign(existing.sentiment) === Math.sign(sentiment)
    existing.confidence = clamp(
      reinforces
        ? existing.confidence * 0.65 + confidence * 0.35
        : existing.confidence - confidence * 0.45,
      0,
      1
    )
    existing.sentiment = clamp(existing.sentiment * 0.65 + sentiment, -1, 1)`,
    'Evidence-sensitive belief confidence'
  )
  source = replaceOnce(
    source,
    `  network.rumours.push(rumour)
  upsertBelief(
    network,
    listenerId,
    subjectId,
    kind === 'targeting' ? 'strategic_threat' : 'secretive',
    rumour.listeners[0].confidence,
    -0.2,
    actorId,
    week
  )`,
    `  network.rumours.push(rumour)
  if (rumour.listeners[0].believed) {
    upsertBelief(
      network,
      listenerId,
      subjectId,
      kind === 'targeting' ? 'strategic_threat' : 'secretive',
      rumour.listeners[0].confidence,
      -0.2,
      actorId,
      week
    )
  }`,
    'Do not convert a rejected false rumour into a belief'
  )
  source = replaceOnce(
    source,
    `function discoverSecretArc(
  network: DramaSocialNetwork,
  spyId: string,
  week: number,
  phase: string
) {`,
    `function discoverSecretArc(
  network: DramaSocialNetwork,
  spyId: string,
  week: number,
  phase: string,
  targetId?: string
) {`,
    'Target-aware secret discovery signature'
  )
  source = replaceOnce(
    source,
    `      !entry.public &&
      ['romance', 'bromance'].includes(entry.type) &&`,
    `      !entry.public &&
      (!targetId || entry.participantIds.includes(targetId)) &&
      ['romance', 'bromance'].includes(entry.type) &&`,
    'Target-aware secret discovery filter'
  )
  source = replaceOnce(
    source,
    `  if (input.actionId === 'snoop_around')
    discoverSecretArc(network, input.actorId, input.week, input.phase)`,
    `  if (input.actionId === 'snoop_around')
    discoverSecretArc(network, input.actorId, input.week, input.phase, input.targetId)`,
    'Target-aware snooping call'
  )
  source = replaceOnce(
    source,
    `    if (arc.stage === 'established' || arc.stage === 'climax') {`,
    `    if (
      arc.stage !== previousStage &&
      (arc.stage === 'established' || arc.stage === 'climax')
    ) {`,
    'Arc consequences only on causal stage movement'
  )
  source = replaceOnce(
    source,
    `  for (const alliance of network.alliances.filter((entry) => entry.status === 'active')) {
    const [a, b] = alliance.participantIds`,
    `  for (const alliance of network.alliances.filter((entry) => entry.status === 'active')) {
    if (alliance.lastUpdatedWeek >= input.week) continue
    const [a, b] = alliance.participantIds`,
    'Alliance passive drift once per week'
  )
  source = replaceOnce(
    source,
    `    if (Math.max(...Object.values(alliance.loyaltyByPlayer)) < 28) alliance.status = 'strained'`,
    `    if (Math.min(...Object.values(alliance.loyaltyByPlayer)) < 28) alliance.status = 'strained'`,
    'Directional alliance strain'
  )
  source = replaceOnce(
    source,
    `      const listenerId = [...activeIds].find((id) => !heard.has(id))
      const source = rumour.listeners.at(-1)
      if (listenerId && source) {`,
    `      const source = rumour.listeners.at(-1)
      const listenerId = source
        ? [...activeIds]
            .filter((id) => !heard.has(id))
            .sort(
              (left, right) =>
                relation(input.relationships, right, source.playerId) -
                  relation(input.relationships, left, source.playerId) +
                relation(input.relationships, left, rumour.subjectId) * 0.35 -
                  relation(input.relationships, right, rumour.subjectId) * 0.35 ||
                hash(\`${'${'}rumour.id}:${'${'}right}\`) - hash(\`${'${'}rumour.id}:${'${'}left}\`)
            )[0]
        : undefined
      if (listenerId && source) {`,
    'Relationship-path rumour propagation'
  )
  return source
})

console.log('Social hardening codemod completed successfully')
