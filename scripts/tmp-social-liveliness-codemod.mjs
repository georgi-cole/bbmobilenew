import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) {
    console.log(`No pending change: ${path}`)
    return
  }
  fs.writeFileSync(path, after)
  console.log(`Updated ${path}`)
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing expected pattern: ${label}`)
  return source.replace(search, replacement)
}

function replaceRegexRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Missing expected pattern: ${label}`)
  pattern.lastIndex = 0
  return source.replace(pattern, replacement)
}

function appendOnce(source, marker, content) {
  return source.includes(marker) ? source : `${source.trimEnd()}\n\n${content.trim()}\n`
}

edit('src/social/socialRuntimeConfig.ts', (original) => {
  let source = original
  for (const scenario of [
    'post_veto_gratitude',
    'survivor_gratitude',
    'safety_win_congratulations',
    'hoh_congratulations',
  ]) {
    source = source.replace(`${scenario}: 'readOnly'`, `${scenario}: 'optional'`)
  }
  if (!source.includes('export function isIncomingInteractionActionable')) {
    source = replaceRequired(
      source,
      `}\n\nexport function getFamilyGroupId(playerId: string): string | null {`,
      `}\n\n/** Read-only house notes never consume actionable conversation capacity. */\nexport function isIncomingInteractionActionable(\n  interaction: Pick<IncomingInteraction, 'type' | 'payload' | 'requiresResponse'>\n): boolean {\n  return getIncomingInteractionResponsePolicy(interaction) !== 'readOnly'\n}\n\nexport function getFamilyGroupId(playerId: string): string | null {`,
      'social actionable helper'
    )
  }
  return source
})

edit('src/social/incomingInteractionFactory.ts', (source) =>
  replaceRequired(
    source,
    `  return normalizeIncomingInteractionContract(draft, input.mode)`,
    `  const normalized = normalizeIncomingInteractionContract(draft, input.mode)\n  // Passive house notes close at the next week boundary and never linger long\n  // enough to crowd out conversations. Explicit expiries remain authoritative.\n  if (\n    input.expiresAtWeek === undefined &&\n    getIncomingInteractionResponsePolicy(normalized) === 'readOnly'\n  ) {\n    normalized.expiresAtWeek = input.week\n  }\n  return normalized`,
    'read-only expiry'
  )
)

edit('src/social/socialConfig.ts', (original) => {
  let source = original
  const replacements = [
    ['maxPerWeek: 5', 'maxPerWeek: 6'],
    ['maxGeneratedPerCheckpoint: 1', 'maxGeneratedPerCheckpoint: 2'],
    ['maxActive: 6', 'maxActive: 8'],
    ['maxPerAI: 1', 'maxPerAI: 2'],
    ['cooldownTicks: 2', 'cooldownTicks: 1'],
    ['scoreThreshold: 0.3', 'scoreThreshold: 0.26'],
    ['maxActiveVisible: 2', 'maxActiveVisible: 4'],
    ['maxDeliveredPerPhase: 1', 'maxDeliveredPerPhase: 2'],
  ]
  for (const [before, after] of replacements) {
    source = replaceRequired(source, before, after, `social config ${before}`)
  }
  return source
})

edit('src/social/socialPersonalityBank.ts', (source) =>
  replaceRequired(
    source,
    `    socialEnergy: 0.2 + hashUnit(playerId, 9) * 0.75,`,
    `    // Custom contestants should vary, but never become effectively silent.\n    socialEnergy: 0.4 + hashUnit(playerId, 9) * 0.5,`,
    'custom contestant social energy floor'
  )
)

edit('src/social/incomingInteractionAutonomy.ts', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `import { getRemoteScenarioLines } from './socialRuntimeConfig'`,
    `import {\n  getRemoteScenarioLines,\n  isIncomingInteractionActionable,\n} from './socialRuntimeConfig'`,
    'autonomy actionable import'
  )
  source = replaceRegexRequired(
    source,
    /function computeRecencyPenalty\([\s\S]*?\n}\n\nexport function computeIncomingInteractionEngagementScore/,
    `function computeRecencyPenalty(\n  actorId: string,\n  pendingInteractions: IncomingInteraction[],\n  currentWeek: number,\n  cooldownTicks: number\n): number {\n  const lastFromActor = pendingInteractions\n    .filter(\n      (interaction) =>\n        interaction.fromId === actorId && isIncomingInteractionActionable(interaction)\n    )\n    .sort((left, right) => right.createdAt - left.createdAt)[0]\n\n  if (!lastFromActor || cooldownTicks <= 0) return 0\n  const weeksSince = currentWeek - lastFromActor.createdWeek\n  if (weeksSince >= cooldownTicks) return 0\n  // A same-week follow-up is possible when context is strong, but its utility is\n  // substantially reduced. Per-actor and scenario dedupe still cap repetition.\n  return weeksSince <= 0 ? 0.55 : 0.25\n}\n\nexport function computeIncomingInteractionEngagementScore`,
    'autonomy recency model'
  )
  source = replaceRequired(
    source,
    `  const globalActive = pendingInteractions.filter((interaction) => !interaction.resolved).length`,
    `  const globalActive = pendingInteractions.filter(\n    (interaction) => !interaction.resolved && isIncomingInteractionActionable(interaction)\n  ).length`,
    'autonomy global actionable cap'
  )
  source = replaceRequired(
    source,
    `  const perAiActive = pendingInteractions.filter(\n    (interaction) => interaction.fromId === actorId && !interaction.resolved\n  ).length`,
    `  const perAiActive = pendingInteractions.filter(\n    (interaction) =>\n      interaction.fromId === actorId &&\n      !interaction.resolved &&\n      isIncomingInteractionActionable(interaction)\n  ).length`,
    'autonomy per-AI actionable cap'
  )
  source = replaceRequired(
    source,
    `  const visibleActiveCount = (socialState.incomingInteractions ?? []).filter(\n    (interaction) => !interaction.resolved\n  ).length`,
    `  const visibleActiveCount = (socialState.incomingInteractions ?? []).filter(\n    (interaction) =>\n      !interaction.resolved && isIncomingInteractionActionable(interaction)\n  ).length`,
    'autonomy visible actionable count'
  )
  source = replaceRequired(
    source,
    `  const alreadyCreatedThisWeek = pendingInteractions.filter(\n    (interaction) => interaction.createdWeek === week\n  ).length`,
    `  const alreadyCreatedThisWeek = pendingInteractions.filter(\n    (interaction) =>\n      interaction.createdWeek === week && isIncomingInteractionActionable(interaction)\n  ).length`,
    'autonomy weekly actionable count'
  )
  source = replaceRequired(
    source,
    `(context.dramaMode ? socialConfig.incomingInteractionConfig.maxPerWeek : 3) -`,
    `(context.dramaMode ? socialConfig.incomingInteractionConfig.maxPerWeek : 4) -`,
    'normal incoming weekly cap'
  )
  return source
})

edit('src/social/incomingInteractionScheduler.ts', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `import { isIncomingInteractionInvalidated } from './incomingInteractionValidity';`,
    `import { isIncomingInteractionInvalidated } from './incomingInteractionValidity';\nimport { isIncomingInteractionActionable } from './socialRuntimeConfig';`,
    'scheduler actionable import'
  )
  source = replaceRequired(
    source,
    `  const unresolvedFromActor = allFromActor.filter((entry) => !entry.resolved);`,
    `  const unresolvedFromActor = allFromActor.filter(\n    (entry) => !entry.resolved && isIncomingInteractionActionable(entry),\n  );`,
    'scheduler actionable sender dedupe'
  )
  source = replaceRequired(
    source,
    `  const activeVisible = (socialState.incomingInteractions ?? []).filter((entry) => !entry.resolved);`,
    `  const activeVisible = (socialState.incomingInteractions ?? []).filter(\n    (entry) => !entry.resolved && isIncomingInteractionActionable(entry),\n  );`,
    'scheduler active actionable list'
  )
  source = replaceRequired(
    source,
    `  const remainingPhaseCapacity = Math.max(\n    0,\n    deliveryConfig.maxDeliveredPerPhase - deliveredThisPhase,\n  );\n  let remainingVisibleCapacity = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount);\n  let remainingSlots = Math.min(remainingPhaseCapacity, remainingVisibleCapacity);`,
    `  let remainingPhaseSlots = Math.max(\n    0,\n    deliveryConfig.maxDeliveredPerPhase - deliveredThisPhase,\n  );\n  let remainingActionableSlots = Math.max(\n    0,\n    deliveryConfig.maxActiveVisible - activeVisibleCount,\n  );`,
    'scheduler split capacity variables'
  )
  source = replaceRequired(
    source,
    `    if (remainingSlots <= 0) {`,
    `    const actionable = isIncomingInteractionActionable(entry.interaction);\n    if (remainingPhaseSlots <= 0 || (actionable && remainingActionableSlots <= 0)) {`,
    'scheduler split capacity check'
  )
  source = replaceRequired(
    source,
    `        entry.priority === 'low' &&\n        activeVisibleCount >= deliveryConfig.maxActiveVisible &&`,
    `        actionable &&\n        entry.priority === 'low' &&\n        activeVisibleCount >= deliveryConfig.maxActiveVisible &&`,
    'scheduler low priority drop actionable only'
  )
  source = replaceRequired(
    source,
    `    remainingSlots -= 1;\n    activeVisibleCount += 1;\n    remainingVisibleCapacity = Math.max(0, deliveryConfig.maxActiveVisible - activeVisibleCount);\n    remainingSlots = Math.min(remainingSlots, remainingVisibleCapacity);\n    activeVisible.push(entry.interaction);`,
    `    remainingPhaseSlots -= 1;\n    if (actionable) {\n      activeVisibleCount += 1;\n      remainingActionableSlots = Math.max(\n        0,\n        deliveryConfig.maxActiveVisible - activeVisibleCount,\n      );\n      activeVisible.push(entry.interaction);\n    }`,
    'scheduler split capacity decrement'
  )
  return source
})

edit('src/social/socialAIDriver.ts', (original) => {
  let source = original
  if (!source.includes('isIncomingInteractionActionable')) {
    source = replaceRequired(
      source,
      `import { getEffectiveSocialMode } from './socialMode'`,
      `import { getEffectiveSocialMode } from './socialMode'\nimport { isIncomingInteractionActionable } from './socialRuntimeConfig'`,
      'AI driver actionable import'
    )
  }
  source = replaceRequired(
    source,
    `    directContactsThisWeek >= 1 ||`,
    `    directContactsThisWeek >= 2 ||`,
    'AI direct contact cap'
  )
  source = replaceRequired(
    source,
    `    visibleActiveCount: (current.social.incomingInteractions ?? []).filter(\n      (entry) => !entry.resolved\n    ).length,`,
    `    visibleActiveCount: (current.social.incomingInteractions ?? []).filter(\n      (entry) => !entry.resolved && isIncomingInteractionActionable(entry)\n    ).length,`,
    'AI driver actionable visible count'
  )
  return source
})

edit('src/store/selectors.ts', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `import { getSocialModuleAvailability } from '../social/socialModuleAvailability'`,
    `import {\n  getIncomingSocialModuleAvailability,\n  getSocialModuleAvailability,\n} from '../social/socialModuleAvailability'`,
    'incoming selector import'
  )
  if (!source.includes('selectHumanCanUseIncomingSocialModule')) {
    source = replaceRequired(
      source,
      `export const selectHumanCanUseSocialModules = (state: RootState): boolean =>\n  getSocialModuleAvailability(state.game).canOpen\n\n/** Debug metadata explaining why a social module can or cannot open. */`,
      `export const selectHumanCanUseSocialModules = (state: RootState): boolean =>\n  getSocialModuleAvailability(state.game).canOpen\n\n/** Incoming messages stay available during vote and result windows. */\nexport const selectHumanCanUseIncomingSocialModule = (state: RootState): boolean =>\n  getIncomingSocialModuleAvailability(state.game).canOpen\n\nexport const selectIncomingSocialModuleAvailability = createSelector(\n  [(state: RootState) => state.game],\n  (game) => getIncomingSocialModuleAvailability(game)\n)\n\n/** Debug metadata explaining why a social module can or cannot open. */`,
      'incoming selectors'
    )
  }
  return source
})

edit('src/components/FloatingActionBar/FloatingActionBar.tsx', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `  selectHumanCanUseSocialModules,`,
    `  selectHumanCanUseSocialModules,\n  selectHumanCanUseIncomingSocialModule,`,
    'FAB incoming selector import'
  )
  source = replaceRequired(
    source,
    `  getBlockedSocialModuleAnnouncementMessage,\n  getSocialModuleAvailability,`,
    `  getBlockedSocialModuleAnnouncementMessage,\n  getIncomingSocialModuleAvailability,\n  getSocialModuleAvailability,`,
    'FAB incoming availability import'
  )
  source = replaceRequired(
    source,
    `  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules)`,
    `  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules)\n  const canUseIncomingSocialModule = useAppSelector(selectHumanCanUseIncomingSocialModule)`,
    'FAB incoming selector use'
  )
  source = replaceRequired(
    source,
    `  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])\n  const socialModulesUnavailable = !canUseSocialModules`,
    `  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])\n  const incomingSocialModuleAvailability = useMemo(\n    () => getIncomingSocialModuleAvailability(game),\n    [game]\n  )\n  const socialModulesUnavailable = !canUseSocialModules\n  const incomingSocialModuleUnavailable = !canUseIncomingSocialModule`,
    'FAB split availability state'
  )
  source = replaceRequired(
    source,
    `  const handleIncomingRequestsClick = useCallback(() => {\n    if (!canUseSocialModules) {`,
    `  const handleIncomingRequestsClick = useCallback(() => {\n    if (!canUseIncomingSocialModule) {`,
    'FAB incoming click gate'
  )
  source = replaceRequired(
    source,
    `        socialModuleAvailability,\n        'FloatingActionBar incoming requests button'`,
    `        incomingSocialModuleAvailability,\n        'FloatingActionBar incoming requests button'`,
    'FAB incoming log availability'
  )
  source = replaceRequired(
    source,
    `          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)`,
    `          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)`,
    'FAB incoming blocked message'
  )
  source = replaceRequired(
    source,
    `      onSocialModuleBlocked?.(socialModuleAvailability)`,
    `      onSocialModuleBlocked?.(incomingSocialModuleAvailability)`,
    'FAB incoming blocked callback'
  )
  source = replaceRegexRequired(
    source,
    /  }, \[\n    canUseSocialModules,\n    dispatch,\n    isSurvivorMode,\n    onSocialModuleBlocked,\n    showSurvivorBlockedMessage,\n    socialModuleAvailability,\n  \]\)\n\n  const dispatchPlayPressedEvent/,
    `  }, [\n    canUseIncomingSocialModule,\n    dispatch,\n    incomingSocialModuleAvailability,\n    isSurvivorMode,\n    onSocialModuleBlocked,\n    showSurvivorBlockedMessage,\n  ])\n\n  const dispatchPlayPressedEvent`,
    'FAB incoming callback dependencies'
  )
  source = replaceRequired(
    source,
    `        incomingRequestsDisabled={socialModulesUnavailable}`,
    `        incomingRequestsDisabled={incomingSocialModuleUnavailable}`,
    'FAB incoming disabled prop'
  )
  source = replaceRequired(
    source,
    `          !socialModulesUnavailable && pendingCount > 0 ? pendingCount : undefined`,
    `          !incomingSocialModuleUnavailable && pendingCount > 0 ? pendingCount : undefined`,
    'FAB incoming badge availability'
  )
  return source
})

edit('src/social/socialCommitments.ts', (original) => {
  let source = original
  source = replaceRegexRequired(
    source,
    /export function getSocialCredibility\(commitments: SocialCommitment\[\]\): \{[\s\S]*?return \{ score, label, kept, broken \};\n}/,
    `export function getSocialCredibility(commitments: SocialCommitment[]): {\n  score: number\n  label: 'Unproven' | 'Early read' | 'Questioned' | 'Shaky' | 'Credible' | 'Trusted'\n  kept: number\n  broken: number\n  judged: number\n  confidence: number\n} {\n  const kept = commitments.filter((entry) => entry.status === 'kept').length\n  const broken = commitments.filter((entry) => entry.status === 'broken').length\n  const judged = kept + broken\n  // A Beta(2,2) prior prevents one decision from turning reliability into 0 or 100.\n  const score = Math.round(((kept + 2) / (judged + 4)) * 100)\n  const confidence = Math.min(1, judged / 5)\n  const label =\n    judged === 0\n      ? 'Unproven'\n      : judged === 1\n        ? 'Early read'\n        : score >= 75\n          ? 'Trusted'\n          : score >= 55\n            ? 'Credible'\n            : score >= 40\n              ? 'Shaky'\n              : 'Questioned'\n  return { score, label, kept, broken, judged, confidence }\n}`,
    'smoothed promise credibility'
  )
  source = replaceRequired(
    source,
    `      channels: ['tv', 'mainLog', 'dr'],`,
    `      // The promise outcome is already explained in the inbox; keep a\n      // persistent log without replaying the same message on the faux TV.\n      channels: ['mainLog', 'dr'],`,
    'promise TV dedupe'
  )
  return source
})

edit('src/social/incomingInteractions.ts', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `import { createCommitmentFromInteraction } from './socialCommitments'`,
    `import {\n  createCommitmentFromInteraction,\n  getCommitmentKindForInteraction,\n} from './socialCommitments'`,
    'incoming commitment import'
  )
  source = replaceRegexRequired(
    source,
    /function buildResponseOutcomeText\([\s\S]*?\n}\n\nfunction canAwardIntel/,
    `function buildResponseOutcomeText(\n  interaction: IncomingInteraction,\n  responseType: IncomingInteractionResponseType,\n  fromName: string,\n  subjectName?: string\n): string | undefined {\n  if (interaction.type === 'alliance_proposal' && responseType === 'accept') {\n    return \`The alliance with \${fromName} is now active. Later votes and nominations will show whether it holds.\`\n  }\n\n  const scenarioKey = interaction.payload?.scenarioKey\n  if (scenarioKey === 'safety_holder_consults_loh') {\n    if (responseType === 'accept') return \`\${fromName} now knows you want Safety used.\`\n    if (responseType === 'decline') return \`\${fromName} now knows you want Safety held.\`\n    if (responseType === 'neutral') return \`You left the Safety decision to \${fromName}.\`\n    return undefined\n  }\n\n  const commitmentKind = getCommitmentKindForInteraction(interaction)\n  if (commitmentKind && (responseType === 'positive' || responseType === 'accept')) {\n    return \`You made a promise to \${fromName}. The related game decision will judge whether you keep it.\`\n  }\n\n  if (interaction.type === 'gossip' || interaction.type === 'warning') {\n    if (responseType === 'positive' || responseType === 'neutral') {\n      return subjectName\n        ? \`You now have an unconfirmed lead involving \${subjectName}.\`\n        : 'You chose to keep the claim in mind, but it remains unconfirmed.'\n    }\n  }\n\n  // Ordinary warmth, rejection and dismissal already have an immediate visible\n  // relationship effect. Repeating the selected button as a second paragraph\n  // adds noise rather than a new event.\n  return undefined\n}\n\nfunction canAwardIntel`,
    'non-repetitive incoming outcome text'
  )
  source = replaceRequired(
    source,
    `  const outcomeText = buildResponseOutcomeText(\n    interaction,\n    responseType,\n    responseLabel,\n    fromName,\n    subjectName\n  )`,
    `  const outcomeText = buildResponseOutcomeText(\n    interaction,\n    responseType,\n    fromName,\n    subjectName\n  )`,
    'incoming outcome call'
  )
  source = replaceRequired(
    source,
    `}): { outcomeText: string; logText: string } | null {`,
    `}): { outcomeText?: string; logText: string } | null {`,
    'incoming consequence return type'
  )
  source = replaceRequired(
    source,
    `        text: \`\${result.logText} \${result.outcomeText}\`,`,
    `        text: result.outcomeText ?? result.logText,`,
    'incoming persistent log dedupe'
  )
  return source
})

edit('src/components/SocialPanelV2/SocialPanelV2.tsx', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `  selectInfoBank,\n  selectSessionLogs,`,
    `  selectInfoBank,\n  selectPersistentSocialHistory,\n  selectSessionLogs,`,
    'SocialPanel history selector import'
  )
  source = replaceRequired(
    source,
    `import { getSocialNarrative, TV_SOCIAL_CLOSE_MESSAGES } from './socialNarratives'`,
    `import { getSocialNarrative } from './socialNarratives'`,
    'SocialPanel close copy import'
  )
  source = replaceRegexRequired(
    source,
    /\nfunction selectSocialCloseMessage\([\s\S]*?\n}\n\nfunction getSubjectCandidates/,
    `\nfunction getSubjectCandidates`,
    'SocialPanel generic close message helper'
  )
  source = replaceRequired(
    source,
    `  const sessionLogs = useAppSelector(selectSessionLogs)`,
    `  const sessionLogs = useAppSelector(selectSessionLogs)\n  const actionHistory = useAppSelector(selectPersistentSocialHistory)`,
    'SocialPanel persistent history use'
  )
  source = replaceRegexRequired(
    source,
    /\n      dispatch\(\n        addTvEvent\(\{\n          text: selectSocialCloseMessage\(\),[\s\S]*?\n      \)\n/,
    `\n`,
    'SocialPanel redundant faux TV close message'
  )
  source = replaceRequired(
    source,
    `          <HousePulse network={dramaNetwork} players={game.players} humanId={humanPlayer.id} />`,
    `          <HousePulse\n            network={dramaNetwork}\n            players={game.players}\n            humanId={humanPlayer.id}\n            actionHistory={actionHistory}\n            relationships={relationships ?? {}}\n            weekStartRelSnapshot={weekStartRelSnapshot}\n            currentWeek={game.week}\n          />`,
    'SocialPanel HousePulse story props'
  )
  return source
})

edit('src/social/socialMiddleware.ts', (source) =>
  replaceRequired(
    source,
    `        entry.outcome === 'success' &&\n        (entry.actionId === 'expose_secret' || entry.actionId === 'public_callout')`,
    `        entry.source !== 'manual' &&\n        entry.outcome === 'success' &&\n        (entry.actionId === 'expose_secret' || entry.actionId === 'public_callout')`,
    'manual public action TV dedupe'
  )
)

edit('src/publicOpinion/publicOpinionConfig.ts', (original) => {
  let source = original
  source = replaceRequired(source, `  feedBudgetPerDay: 3,`, `  feedBudgetPerDay: 6,`, 'public feed budget')
  if (!source.includes('lowApprovalRecovery')) {
    source = replaceRequired(
      source,
      `  backgroundDriftMax: 8,`,
      `  backgroundDriftMax: 8,\n  /**\n   * Transparent, bounded recovery at very low approval. This prevents a bad\n   * opening stretch from becoming permanent while still requiring real actions\n   * for a substantial comeback. The recovery is always shown in the feed.\n   */\n  lowApprovalRecovery: {\n    criticalThreshold: 10,\n    criticalDelta: 3,\n    lowThreshold: 25,\n    lowDelta: 2,\n    softThreshold: 35,\n    softDelta: 1,\n  },`,
      'public low-rating recovery config'
    )
  }
  return source
})

edit('src/publicOpinion/publicOpinionMiddleware.ts', (original) => {
  let source = original
  source = source.replace(`import { generateDailyPublicUpdate } from './PublicHeadlineService';\n`, '')
  source = replaceRequired(
    source,
    `            addToFeed: false,`,
    `            addToFeed: true,`,
    'public social cause visibility'
  )
  source = replaceRegexRequired(
    source,
    /      if \(newPhase === 'week_start'\) \{[\s\S]*?\n      \}\n\n      if \(newPhase === 'week_end'\) \{/,
    `      if (newPhase === 'week_start') {\n        store.dispatch(resetDailyFeedBudget({ week }));\n\n        // Approval now moves through recorded game events. At very low levels a\n        // small, visible audience-reconsideration beat prevents a save from being\n        // trapped at zero with no path back.\n        const approvals = buildApprovalMap(nextState.publicOpinion?.profiles ?? {});\n        const recovery = publicOpinionConfig.lowApprovalRecovery;\n        for (const player of game.players ?? []) {\n          if (player.status === 'evicted' || player.status === 'jury') continue;\n          const approval = approvals[player.id] ?? publicOpinionConfig.DEFAULT_APPROVAL;\n          const delta = approval <= recovery.criticalThreshold\n            ? recovery.criticalDelta\n            : approval <= recovery.lowThreshold\n              ? recovery.lowDelta\n              : approval <= recovery.softThreshold\n                ? recovery.softDelta\n                : 0;\n          if (delta > 0) {\n            store.dispatch(updateApproval({\n              playerId: player.id,\n              delta,\n              reason: 'audience_reconsideration',\n              week,\n              addToFeed: true,\n            }));\n          }\n        }\n      }\n\n      if (newPhase === 'week_end') {`,
    'replace fabricated daily public drift'
  )
  source = replaceRegexRequired(
    source,
    /        const human = game\.players\?\.find\(\(player\) => player\.isUser\);[\s\S]*?\n        store\.dispatch\(pruneExpiredDirections/,
    `        store.dispatch(pruneExpiredDirections`,
    'remove hidden social inactivity penalty'
  )
  return source
})

edit('src/publicOpinion/publicNarratives.ts', (original) => {
  let source = original
  if (!source.includes('high_quality_social_play: [')) {
    source = replaceRequired(
      source,
      `  generic_positive: [`,
      `  high_quality_social_play: [\n    'A composed social move made the player look more connected and in control.',\n    'Viewers responded well to a relationship-building move that felt genuine.',\n    'A strong social read translated into a modest gain with the audience.',\n  ],\n  poor_social_play: [\n    'A social move landed awkwardly and cost a little public confidence.',\n    'Viewers read that exchange as forced rather than convincing.',\n    'The interaction did not land, and the audience noticed the misread.',\n  ],\n  audience_reconsideration: [\n    'After a rough stretch, part of the audience is beginning to reconsider.',\n    'The initial backlash is cooling and a small recovery is taking hold.',\n    'A few viewers are giving this storyline another chance.',\n  ],\n  generic_positive: [`,
      'public causal narratives'
    )
    source = replaceRequired(
      source,
      `  headline_drama: 'headline_drama',`,
      `  headline_drama: 'headline_drama',\n  high_quality_social_play: 'high_quality_social_play',\n  poor_social_play: 'poor_social_play',\n  audience_reconsideration: 'audience_reconsideration',`,
      'public causal aliases'
    )
  }
  return source
})

edit('src/screens/PublicMeter/PublicMeter.tsx', (original) => {
  let source = original
  source = replaceRequired(
    source,
    `  const userActiveRequestCount = useMemo(`,
    `  const userFeed = useMemo(\n    () => (userPlayer ? feed.filter((entry) => entry.playerId === userPlayer.id).slice(0, 4) : []),\n    [feed, userPlayer],\n  );\n  const userActiveDirections = useMemo(\n    () =>\n      userPlayer\n        ? allDirections.filter(\n            (direction) => direction.playerId === userPlayer.id && direction.status === 'active',\n          )\n        : [],\n    [allDirections, userPlayer],\n  );\n  const userActiveRequestCount = useMemo(`,
    'PublicMeter causal data'
  )
  source = replaceRequired(
    source,
    `          </div>\n        </div>\n      )}\n\n      {activeTab === 'overview' && (`,
    `          </div>\n          <details className="public-meter__explain">\n            <summary>Why it moved · how to recover</summary>\n            <div className="public-meter__explain-body">\n              <p>\n                Approval now changes through recorded competitions, nominations, saves, evictions,\n                public requests and visible social play — not hidden daily random drift.\n              </p>\n              {userFeed.length > 0 ? (\n                <div className="public-meter__cause-list">\n                  {userFeed.map((entry) => (\n                    <span key={entry.id}>\n                      <strong className={entry.delta >= 0 ? 'trend--up' : 'trend--down'}>\n                        {entry.delta >= 0 ? '+' : ''}{entry.delta}\n                      </strong>{' '}\n                      {entry.text}\n                    </span>\n                  ))}\n                </div>\n              ) : (\n                <p>No recorded public event has moved your rating yet.</p>\n              )}\n              <p>\n                <strong>Recovery:</strong>{' '}\n                {userActiveDirections.length > 0\n                  ? \`Complete an active request: \${userActiveDirections\n                      .slice(0, 2)\n                      .map((direction) => direction.description)\n                      .join(' · ')}\`\n                  : 'Strong competition results, protecting a liked player and convincing social moves can rebuild support.'}\n              </p>\n            </div>\n          </details>\n        </div>\n      )}\n\n      {activeTab === 'overview' && (`,
    'PublicMeter explanation panel'
  )
  source = source.replace('Your every action has reprecussions.', 'Your visible choices shape the audience reaction.')
  return source
})

edit('src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.css', (source) =>
  appendOnce(
    source,
    '/* Compact conversation restoration */',
    `/* Compact conversation restoration */\n.inbox-header {\n  gap: 0.35rem;\n  padding: 0.48rem 0.62rem 0.52rem;\n}\n\n.inbox-header__close {\n  flex-basis: 38px;\n  width: 38px;\n  height: 38px;\n  border-radius: 10px;\n}\n\n.inbox-header__meta {\n  gap: 0.45rem;\n}\n\n.inbox-header__reputation {\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.inbox-header__reputation summary {\n  width: fit-content;\n  max-width: 100%;\n  padding: 0.22rem 0.5rem;\n  border: 1px solid rgba(139, 92, 246, 0.34);\n  border-radius: 999px;\n  color: #c4b5fd;\n  background: rgba(124, 58, 237, 0.12);\n  font-size: 0.66rem;\n  cursor: pointer;\n}\n\n.inbox-header__reputation-body {\n  margin-top: 0.38rem;\n  padding: 0.5rem;\n  border: 1px solid rgba(139, 92, 246, 0.22);\n  border-radius: 9px;\n  display: grid;\n  gap: 0.3rem;\n  color: rgba(226, 232, 240, 0.78);\n  background: rgba(15, 23, 42, 0.8);\n  font-size: 0.68rem;\n  line-height: 1.35;\n}\n\n.inbox-header__reputation-body p {\n  margin: 0;\n}\n\n.inbox-header__reputation-event {\n  color: rgba(226, 232, 240, 0.68);\n}\n\n.inbox-list {\n  padding: 0.42rem 0.48rem calc(0.62rem + env(safe-area-inset-bottom));\n}\n\n.inbox-sections {\n  gap: 0.58rem;\n}\n\n.inbox-section,\n.inbox-section__list {\n  gap: 0.34rem;\n}\n\n.inbox-section--history > summary,\n.inbox-section--promises > summary {\n  cursor: pointer;\n}\n\n.inbox-section--history[open] > summary,\n.inbox-section--promises[open] > summary {\n  margin-bottom: 0.34rem;\n}\n\n.inbox-item {\n  padding: 0.5rem 0.55rem;\n  gap: 0.34rem;\n  border-radius: 10px;\n}\n\n.inbox-item__text {\n  font-size: 0.8rem;\n  line-height: 1.34;\n}\n\n.inbox-item__outcome {\n  margin: 0;\n  padding: 0.35rem 0.48rem;\n  font-size: 0.66rem;\n}\n\n.inbox-item__actions,\n.inbox-item__actions--drama {\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 0.28rem;\n}\n\n.inbox-action {\n  min-height: 40px;\n  padding: 0.32rem 0.2rem;\n  border: 0;\n  border-radius: 999px;\n  align-items: center;\n  text-align: center;\n  font-size: 0.64rem;\n  line-height: 1.12;\n}\n\n@media (max-width: 350px) {\n  .inbox-item__actions,\n  .inbox-item__actions--drama {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n`
  )
)

edit('src/components/HousePulse/HousePulse.css', (source) =>
  appendOnce(
    source,
    '/* Causal story stream */',
    `/* Causal story stream */\n.house-pulse__card--bond { border-left-color: #ff7ab6; }\n.house-pulse__card--strategy { border-left-color: #7dd3fc; }\n.house-pulse__card--conflict,\n.house-pulse__card--public { border-left-color: #fb7185; }\n.house-pulse__card--repair { border-left-color: #6ee7b7; }\n.house-pulse__card--quiet { opacity: 0.9; }\n.house-pulse__card--major {\n  background: linear-gradient(135deg, rgba(127, 29, 29, 0.2), rgba(255, 255, 255, 0.045));\n}\n\n@media (max-width: 560px) {\n  .house-pulse__sheet { max-height: 88dvh; }\n  .house-pulse__header { padding: 14px 14px 10px; }\n  .house-pulse__header h2 { font-size: 21px; }\n  .house-pulse__stats,\n  .house-pulse__tabs { padding-inline: 14px; }\n  .house-pulse__content { padding: 10px 12px 20px; gap: 8px; }\n  .house-pulse__card { padding: 10px 11px; border-radius: 11px; }\n}\n`
  )
)

edit('src/screens/PublicMeter/PublicMeter.css', (source) =>
  appendOnce(
    source,
    '/* Explainable approval movement */',
    `/* Explainable approval movement */\n.public-meter__explain {\n  margin-top: 0.65rem;\n  border: 1px solid rgba(99, 102, 241, 0.22);\n  border-radius: 10px;\n  background: rgba(15, 23, 42, 0.5);\n}\n\n.public-meter__explain summary {\n  padding: 0.55rem 0.65rem;\n  color: rgba(226, 232, 240, 0.86);\n  font-size: 0.72rem;\n  font-weight: 750;\n  cursor: pointer;\n}\n\n.public-meter__explain-body {\n  padding: 0 0.65rem 0.65rem;\n  display: grid;\n  gap: 0.45rem;\n  color: rgba(226, 232, 240, 0.72);\n  font-size: 0.7rem;\n  line-height: 1.4;\n}\n\n.public-meter__explain-body p { margin: 0; }\n\n.public-meter__cause-list {\n  display: grid;\n  gap: 0.3rem;\n}\n\n.public-meter__cause-list span {\n  padding: 0.35rem 0.45rem;\n  border-radius: 8px;\n  background: rgba(148, 163, 184, 0.08);\n}\n`
  )
)

console.log('Social liveliness codemod complete')
