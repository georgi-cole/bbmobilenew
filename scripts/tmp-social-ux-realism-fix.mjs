import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}
function write(path, content) {
  fs.writeFileSync(path, content)
  console.log(`updated ${path}`)
}
function replace(path, search, replacement, label = search.slice(0, 50)) {
  const source = read(path)
  if (!source.includes(search)) throw new Error(`Missing pattern in ${path}: ${label}`)
  write(path, source.replace(search, replacement))
}
function replaceRegex(path, pattern, replacement, label) {
  const source = read(path)
  if (!pattern.test(source)) throw new Error(`Missing regex in ${path}: ${label}`)
  write(path, source.replace(pattern, replacement))
}

// 1) Public requests must always name their actual target.
replace(
  'src/publicOpinion/types.ts',
  `  relatedPlayerId?: string;\n  description: string;`,
  `  relatedPlayerId?: string;\n  /** Concrete contestant the request is about when different from relatedPlayerId. */\n  targetPlayerId?: string;\n  description: string;`,
  'PublicDirection targetPlayerId',
)
replace(
  'src/publicOpinion/PublicDirectionService.ts',
  `    case 'influence_hoh':\n      return \`Influence the LOH\${relatedName ? \` (\${relatedName})\` : ''} to nominate your target\`;`,
  `    case 'influence_hoh':\n      return relatedName\n        ? \`Convince the LOH to nominate \${relatedName}\`\n        : 'Convince the LOH to nominate a specific housemate';`,
  'explicit influence_hoh copy',
)
replaceRegex(
  'src/publicOpinion/PublicDirectionService.ts',
  /    let relatedPlayerId: string \| undefined;\n    let relatedName: string \| undefined;\n\n    if \(!isSolo && activePlayers\.length > 1\) \{[\s\S]*?      relatedName = related\.name;\n    \}\n\n    const direction: PublicDirection = \{/,
  `    let relatedPlayerId: string | undefined;\n    let targetPlayerId: string | undefined;\n    let relatedName: string | undefined;\n\n    if (!isSolo && activePlayers.length > 1) {\n      const others = (dirType === 'apologize' || dirType === 'repair_relationship')\n        ? repairCandidates\n        : activePlayers.filter((p) => p.id !== player.id);\n      const related = seededPick(rng, others);\n      relatedPlayerId = related.id;\n      relatedName = related.name;\n\n      if (dirType === 'influence_hoh') {\n        const targets = activePlayers.filter((candidate) => candidate.id !== player.id && candidate.id !== related.id);\n        const target = targets.length > 0 ? seededPick(rng, targets) : related;\n        targetPlayerId = target.id;\n        relatedName = target.name;\n      }\n    }\n\n    const direction: PublicDirection = {`,
  'direction relationship/target assignment',
)
replace(
  'src/publicOpinion/PublicDirectionService.ts',
  `      relatedPlayerId,\n      description: buildDescription(dirType, player.name, relatedName),`,
  `      relatedPlayerId,\n      targetPlayerId,\n      description: buildDescription(dirType, player.name, relatedName),`,
  'persist targetPlayerId',
)

// 2) Public Meter: concise, human copy and a legacy target fallback.
replace(
  'src/screens/PublicMeter/PublicMeter.tsx',
  `  const userActiveRequestCount = useMemo(`,
  `  const playerNameById = useMemo(\n    () => new Map(game.players.map((player) => [player.id, player.name])),\n    [game.players]\n  )\n  const getDirectionDescription = (direction: PublicDirection): string => {\n    if (direction.type !== 'influence_hoh') return direction.description\n    const explicitTarget = direction.targetPlayerId\n      ? playerNameById.get(direction.targetPlayerId)\n      : undefined\n    if (explicitTarget) return \`Convince the LOH to nominate \${explicitTarget}\`\n    const fallback = game.players.find(\n      (player) =>\n        !player.isUser &&\n        player.status !== 'evicted' &&\n        player.status !== 'jury' &&\n        player.id !== direction.relatedPlayerId\n    )\n    return fallback\n      ? \`Convince the LOH to nominate \${fallback.name}\`\n      : 'Convince the LOH to nominate a specific housemate'\n  }\n\n  const userActiveRequestCount = useMemo(`,
  'direction description helper',
)
replace(
  'src/screens/PublicMeter/PublicMeter.tsx',
  `<summary>Why it moved · how to recover</summary>`,
  `<summary>What changed?</summary>`,
  'approval summary title',
)
replaceRegex(
  'src/screens/PublicMeter/PublicMeter.tsx',
  /              <p>\n                Only broadcast-visible events and confirmed public moments move this meter; quiet\n                time alone does not change it\.\n              <\/p>\n/,
  `              <p className="public-meter__explain-intro">Recent audience reactions:</p>\n`,
  'remove service copy',
)
replace(
  'src/screens/PublicMeter/PublicMeter.tsx',
  `<strong>Recovery:</strong>{' '}`,
  `<strong>Next opportunity:</strong>{' '}`,
  'recovery label',
)
replace(
  'src/screens/PublicMeter/PublicMeter.tsx',
  `.map((direction) => direction.description)`,
  `.map((direction) => getDirectionDescription(direction))`,
  'active request explicit copy',
)
replace(
  'src/screens/PublicMeter/PublicMeter.tsx',
  `<p className="direction-card__description">{direction.description}</p>`,
  `<p className="direction-card__description">{getDirectionDescription(direction)}</p>`,
  'request card explicit copy',
)

// 3) Incoming interactions: current mode controls visuals, chronological order, neutral compact choices, resolved card stays visible.
replaceRegex(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx',
  /const PRIORITY_ORDER:[\s\S]*?\n}\n\n/,
  '',
  'remove priority order',
)
replaceRegex(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx',
  /  const sortedInteractions = useMemo\([\s\S]*?\n  \)\n  const pending = useMemo/,
  `  const sortedInteractions = useMemo(\n    () =>\n      [...interactionEntries].sort(\n        (left, right) =>\n          left.interaction.createdAt - right.interaction.createdAt ||\n          left.interaction.id.localeCompare(right.interaction.id)\n      ),\n    [interactionEntries]\n  )\n  const pending = useMemo`,
  'chronological sort',
)
replace(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx',
  `    const interactionDramaMode =\n      getInteractionSocialMode(interaction, { game, settings, vip }) === 'drama'`,
  `    // Authored mode remains authoritative for mechanics, but the current toggle\n    // controls presentation so Normal Mode never looks like Drama Mode.\n    getInteractionSocialMode(interaction, { game, settings, vip })\n    const interactionDramaMode = globalDramaMode`,
  'current mode presentation',
)
replaceRegex(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx',
  /              \{needsResponseInteractions\.length > 0 && \([\s\S]*?              \{resolvedInteractions\.length > 0 && \([\s\S]*?              \)}\n/,
  `              <section className="inbox-section" aria-label="Messages">\n                <h3 className="inbox-section__title">Messages</h3>\n                <div className="inbox-section__list" role="list">\n                  {sortedInteractions.map(({ interaction, priority, policy }) =>\n                    renderInteraction(interaction, priority, policy, !interaction.resolved && policy !== 'readOnly')\n                  )}\n                </div>\n              </section>\n`,
  'single chronological message stream',
)
// Remove now-unused resolved interaction memo.
replaceRegex(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx',
  /  const resolvedInteractions = useMemo\([\s\S]*?\n  \)\n/,
  '',
  'remove resolved memo',
)

// Neutral, equal response buttons and one row on every supported phone width.
replaceRegex(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.css',
  /\.inbox-action--positive \{[\s\S]*?\.inbox-action--dismiss \{[\s\S]*?\n}\n/,
  `.inbox-action--positive,\n.inbox-action--neutral,\n.inbox-action--negative,\n.inbox-action--dismiss {\n  color: #f8fafc;\n  background: rgba(148, 163, 184, 0.18);\n  border-color: rgba(148, 163, 184, 0.24);\n}\n`,
  'neutral response colors',
)
replace(
  'src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.css',
  `  .inbox-item__actions,\n  .inbox-item__actions--drama {\n    grid-template-columns: 1fr;\n  }`,
  `  .inbox-item__actions,\n  .inbox-item__actions--drama {\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n  }`,
  'narrow screen one row',
)

// 4) Response outcomes must remain visible and be specific, without faux-TV duplication.
replace(
  'src/social/incomingInteractions.ts',
  `function buildResponseOutcomeText(\n  interaction: IncomingInteraction,\n  responseType: IncomingInteractionResponseType,\n  fromName: string,\n  subjectName?: string\n): string | undefined {`,
  `function buildResponseOutcomeText(\n  interaction: IncomingInteraction,\n  responseType: IncomingInteractionResponseType,\n  fromName: string,\n  subjectName?: string,\n  responseLabel?: string\n): string | undefined {`,
  'response outcome signature',
)
replace(
  'src/social/incomingInteractions.ts',
  `  // Ordinary warmth, rejection and dismissal already have an immediate visible\n  // relationship effect. Repeating the selected button as a second paragraph\n  // adds noise rather than a new event.\n  return undefined`,
  `  const chosen = responseLabel?.toLowerCase() ?? ''\n  if (interaction.type === 'check_in') {\n    if (responseType === 'positive') {\n      return chosen.includes('truth') || chosen.includes('honest')\n        ? \`You opened up honestly. \${fromName} respected it and now understands where your head is.\`\n        : \`You let \${fromName} in. The conversation ended with more trust between you.\`\n    }\n    if (responseType === 'neutral') return \`You kept things measured. \${fromName} left without a clear read on your plans.\`\n    if (responseType === 'negative') return \`You kept \${fromName} at a distance. They noticed the wall go up.\`\n    return \`You ended the conversation before it went anywhere. \${fromName} will remember the brush-off.\`\n  }\n  if (responseType === 'positive' || responseType === 'accept')\n    return \`You engaged with \${fromName}, and the exchange improved the tone between you.\`\n  if (responseType === 'neutral')\n    return \`You acknowledged \${fromName} without revealing much. The relationship stayed mostly steady.\`\n  if (responseType === 'negative' || responseType === 'decline')\n    return \`You pushed back on \${fromName}. The conversation ended with more distance between you.\`\n  return \`You dismissed \${fromName}. They left the conversation feeling shut out.\``,
  'specific ordinary outcomes',
)
replace(
  'src/social/incomingInteractions.ts',
  `  const outcomeText = buildResponseOutcomeText(interaction, responseType, fromName, subjectName)`,
  `  const outcomeText = buildResponseOutcomeText(\n    interaction,\n    responseType,\n    fromName,\n    subjectName,\n    responseLabel\n  )`,
  'pass response label',
)
replace(
  'src/social/incomingInteractions.ts',
  `  responseType,\n  source,`,
  `  responseType,\n  responseLabel,\n  source,`,
  'retain responseLabel in destructuring',
)
replace(
  'src/social/incomingInteractions.ts',
  `    dispatch(\n      addTvEvent({\n        text: result.outcomeText ?? result.logText,\n        type: 'social',\n        source: 'manual',\n        channels: ['mainLog', 'dr'],\n      })\n    )`,
  `    // The answered card already shows the result. Do not replay the same beat on faux TV.\n    dispatch(\n      addTvEvent({\n        text: result.outcomeText ?? result.logText,\n        type: 'social',\n        source: 'manual',\n        channels: ['dr'],\n      })\n    )`,
  'avoid duplicate main log',
)

// 5) LOH/POS strategic conversations in both modes, including the mirrored AI-LOH consultation.
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `  | 'safety_holder_consults_loh'`,
  `  | 'safety_holder_consults_loh'\n  | 'loh_consults_safety_holder'`,
  'scenario union',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `  'safety_holder_consults_loh',`,
  `  'safety_holder_consults_loh',\n  'loh_consults_safety_holder',`,
  'critical scenarios',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `    context.dramaMode &&\n    context.phase === 'pos_results' &&`,
  `    context.phase === 'pos_results' &&`,
  'LOH consultation in both modes',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `  } else if (\n    context.phase === 'pos_results' &&\n    constraints.playerHasSafetyPower &&`,
  `  } else if (\n    context.phase === 'pos_results' &&\n    constraints.actorIsCurrentHoh &&\n    constraints.playerHasSafetyPower\n  ) {\n    plan = { type: 'deal_offer', scenarioKey: 'loh_consults_safety_holder' }\n  } else if (\n    context.phase === 'pos_results' &&\n    constraints.playerHasSafetyPower &&`,
  'AI LOH approaches human POS',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `  safety_holder_consults_loh: [\n    'I won Safety, and before the ceremony I want your read: should I use it or keep the nominations the same?',\n    'You control the backup plan, {hoh}. Do you want me to change the block, or leave it alone?',\n    'Before I decide what to do with Safety, I wanted to consult you. What helps your plan?',\n  ],`,
  `  safety_holder_consults_loh: [\n    'I won Safety, and before the ceremony I want your read: should I use it or keep the nominations the same?',\n    'You control the backup plan, {hoh}. Do you want me to change the block, or leave it alone?',\n    'Before I decide what to do with Safety, I wanted to consult you. What helps your plan?',\n  ],\n  loh_consults_safety_holder: [\n    'I need to prepare for the ceremony. Are you leaning toward saving someone, leaving it alone, or are you still undecided?',\n    'Your Safety decision controls my backup plan. Tell me where you are leaning so I can prepare.',\n    'Before the ceremony, I need an honest read: who are you considering saving?',\n  ],`,
  'LOH consultation templates',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `        subjectId: subject?.id,`,
  `        subjectId: subject?.id,\n        nomineeIds: context.nomineeIds ?? [],`,
  'store nominee choices',
)
replace(
  'src/social/incomingInteractionValidityBank.ts',
  `  safety_holder_consults_loh: {\n    senderMustHoldSafety: true,\n    humanMustBeHoh: true,\n  },`,
  `  safety_holder_consults_loh: {\n    senderMustHoldSafety: true,\n    humanMustBeHoh: true,\n  },\n  loh_consults_safety_holder: {\n    humanMustHoldSafety: true,\n  },`,
  'mirrored validity',
)
replace(
  'src/social/socialRuntimeConfig.ts',
  `      safety_holder_consults_loh: 'required',`,
  `      safety_holder_consults_loh: 'required',\n      loh_consults_safety_holder: 'required',`,
  'mirrored policy',
)
replace(
  'src/social/incomingInteractionPresentation.ts',
  `  if (!interaction) return RESPONSE_OPTIONS_BY_TYPE[type];`,
  `  if (!interaction) return RESPONSE_OPTIONS_BY_TYPE[type];\n\n  if (interaction.payload?.scenarioKey === 'loh_consults_safety_holder') {\n    const nomineeIds = Array.isArray(interaction.payload.nomineeIds)\n      ? interaction.payload.nomineeIds.filter((value): value is string => typeof value === 'string')\n      : []\n    const nomineeNames = Array.isArray(interaction.payload.nomineeNames)\n      ? interaction.payload.nomineeNames.filter((value): value is string => typeof value === 'string')\n      : []\n    return [\n      { label: nomineeNames[0] ? \`Save \${nomineeNames[0]}\` : nomineeIds[0] ? 'Save nominee 1' : 'Save someone', responseType: 'accept' },\n      { label: nomineeNames[1] ? \`Save \${nomineeNames[1]}\` : nomineeIds[1] ? 'Save nominee 2' : 'Save the other nominee', responseType: 'neutral' },\n      { label: 'Save nobody', responseType: 'decline' },\n      { label: 'Not decided', responseType: 'dismiss' },\n    ];\n  }`,
  'dynamic safety declaration options',
)
replace(
  'src/social/incomingInteractionAutonomy.ts',
  `        nomineeIds: context.nomineeIds ?? [],`,
  `        nomineeIds: context.nomineeIds ?? [],\n        nomineeNames: (context.nomineeIds ?? []).map((id) => getPlayerName(context, id, id)),`,
  'store nominee names',
)
replace(
  'src/social/incomingInteractions.ts',
  `  if (scenarioKey === 'safety_holder_consults_loh') {`,
  `  if (scenarioKey === 'loh_consults_safety_holder') {\n    if (responseType === 'accept') return \`You told \${fromName} you are leaning toward saving the first nominee. The LOH will prepare a backup plan.\`\n    if (responseType === 'neutral') return \`You told \${fromName} you are leaning toward saving the second nominee. The LOH will prepare a backup plan.\`\n    if (responseType === 'decline') return \`You told \${fromName} you currently plan to leave the nominations unchanged.\`\n    return \`You told \${fromName} you have not decided yet. The LOH received no reliable signal.\`\n  }\n\n  if (scenarioKey === 'safety_holder_consults_loh') {`,
  'safety declaration outcomes',
)

// 6) House Pulse: cluster social campaigning, suppress repetitive pair cards, cap to five.
replace(
  'src/social/socialStoryStream.ts',
  `  maxBeats = 14,`,
  `  maxBeats = 5,`,
  'House Pulse cap',
)
replace(
  'src/social/socialStoryStream.ts',
  `  const groups = new Map<string, SocialActionLogEntry[]>()`,
  `  const groups = new Map<string, SocialActionLogEntry[]>()\n  const actorGroups = new Map<string, SocialActionLogEntry[]>()`,
  'actor groups',
)
replace(
  'src/social/socialStoryStream.ts',
  `    groups.set(key, group)\n  }\n\n  const beats: SocialStoryBeat[] = []`,
  `    groups.set(key, group)\n    const actorGroup = actorGroups.get(entry.actorId) ?? []\n    actorGroup.push(entry)\n    actorGroups.set(entry.actorId, actorGroup)\n  }\n\n  const beats: SocialStoryBeat[] = []\n  const summarizedActors = new Set<string>()\n  for (const [actorId, entries] of actorGroups) {\n    const positiveTargets = new Set(\n      entries\n        .filter((entry) => entry.outcome === 'success' && entry.delta > 0)\n        .map((entry) => entry.targetId)\n    )\n    if (positiveTargets.size < 3) continue\n    const actorName = actorId === humanId ? 'You' : nameOf(actorId)\n    const targetNames = [...positiveTargets].slice(0, 3).map(nameOf)\n    summarizedActors.add(actorId)\n    beats.push({\n      id: \`campaign:\${actorId}:\${currentWeek}\`,\n      kind: 'strategy',\n      title: \`\${actorName} is working the room\`,\n      text: \`\${actorName} spent the day reconnecting with \${targetNames.join(', ')}. It looks less like coincidence and more like preparation for the next decision.\`,\n      participantIds: [actorId, ...positiveTargets],\n      week: currentWeek,\n      phase: 'social',\n      severity: 'notable',\n      createdAt: Math.max(...entries.map((entry) => entry.timestamp)),\n      dedupeKey: \`campaign:\${actorId}:\${currentWeek}\`,\n    })\n  }`,
  'actor campaign summaries',
)
replace(
  'src/social/socialStoryStream.ts',
  `    if (!leftId || !rightId) continue`,
  `    if (!leftId || !rightId) continue\n    if (summarizedActors.has(leftId) || summarizedActors.has(rightId)) continue`,
  'suppress pair spam',
)
replace(
  'src/social/socialStoryStream.ts',
  `  return [...byStory.values()]\n    .sort((left, right) => right.week - left.week || right.createdAt - left.createdAt)\n    .slice(0, Math.max(1, maxBeats))`,
  `  const seenTitles = new Set<string>()\n  return [...byStory.values()]\n    .sort((left, right) => {\n      const severityRank = { major: 2, notable: 1, quiet: 0 }\n      return (\n        severityRank[right.severity] - severityRank[left.severity] ||\n        right.week - left.week ||\n        right.createdAt - left.createdAt\n      )\n    })\n    .filter((beat) => {\n      if (seenTitles.has(beat.title)) return false\n      seenTitles.add(beat.title)\n      return true\n    })\n    .slice(0, Math.max(1, maxBeats))`,
  'House Pulse title dedupe',
)
replace(
  'src/components/HousePulse/HousePulse.tsx',
  `<p>A causal stream of relationships, strategy and information you could know.</p>`,
  `<p>The few house stories worth paying attention to right now.</p>`,
  'House Pulse player copy',
)
replace(
  'src/components/HousePulse/HousePulse.tsx',
  `<strong>{storyBeats.length}</strong> recent shifts`,
  `<strong>{storyBeats.length}</strong> key developments`,
  'House Pulse stats',
)

// 7) Public approval: small, recorded reactions for AI and human visible social behavior.
replace(
  'src/publicOpinion/publicOpinionMiddleware.ts',
  `    sessionLogs?: Array<{\n      actorId?: string\n      source?: 'manual' | 'system'\n      week?: number\n    }>`,
  `    sessionLogs?: Array<{\n      actorId?: string\n      source?: 'manual' | 'system'\n      week?: number\n    }>\n    actionHistory?: Array<{\n      actorId?: string\n      source?: 'manual' | 'system'\n      week?: number\n      delta?: number\n      actionId?: string\n    }>`,
  'public opinion state action history',
)
replaceRegex(
  'src/publicOpinion/publicOpinionMiddleware.ts',
  /      const human = game\.players\?\.find\(\(player\) => player\.isUser\)\n      if \(human\?\.id === actorId && entry\.source === 'manual'\) \{[\s\S]*?      \}\n\n      let missionEventType/,
  `      const publicActions = new Set([\n        'compliment',\n        'reassure',\n        'apologize',\n        'confront',\n        'startFight',\n        'betray',\n        'rumor',\n        'group_chat',\n        'proposeAlliance',\n      ])\n      const isVisibleSocialBeat = entry.source === 'manual' || publicActions.has(actionId)\n      const alreadyCounted = (nextState.social?.actionHistory ?? []).filter(\n        (historyEntry) => historyEntry.actorId === actorId && historyEntry.week === week\n      ).length\n      if (isVisibleSocialBeat && alreadyCounted <= 2) {\n        const score = typeof entry.score === 'number' ? entry.score : 0\n        const magnitude = Math.abs(delta) >= 7 || actionId === 'startFight' || actionId === 'betray' ? 2 : 1\n        const approvalDelta =\n          outcome === 'success' && (score >= 0.2 || delta > 0)\n            ? magnitude\n            : outcome === 'failure' || score <= -0.25 || delta < 0\n              ? -magnitude\n              : 0\n        if (approvalDelta !== 0) {\n          store.dispatch(\n            updateApproval({\n              playerId: actorId,\n              delta: approvalDelta,\n              reason: approvalDelta > 0 ? 'high_quality_social_play' : 'poor_social_play',\n              week,\n              addToFeed: true,\n            })\n          )\n        }\n      }\n\n      let missionEventType`,
  'audience reacts to all visible social play',
)

// 8) Private vote promises affect public perception, not magical house knowledge.
replace(
  'src/social/socialCommitments.ts',
  `import { addTvEvent } from '../store/gameSlice'`,
  `import { addTvEvent } from '../store/gameSlice'\nimport { updateApproval } from '../publicOpinion/publicOpinionSlice'`,
  'public approval import',
)
replace(
  'src/social/socialCommitments.ts',
  `  store.dispatch(\n    updateRelationship({`,
  `  if (commitment.kind !== 'vote_to_keep') {\n    store.dispatch(\n      updateRelationship({`,
  'guard relationship promise knowledge',
)
replace(
  'src/social/socialCommitments.ts',
  `    })\n  )\n  store.dispatch(\n    updateSocialMemory({`,
  `      })\n    )\n    store.dispatch(\n      updateSocialMemory({`,
  'nest memory dispatch',
)
replace(
  'src/social/socialCommitments.ts',
  `    })\n  )\n\n  const currentInfluence`,
  `      })\n    )\n  }\n\n  const currentInfluence`,
  'close private promise guard',
)
replace(
  'src/social/socialCommitments.ts',
  `  if (influenceDelta !== 0) {\n    store.dispatch(applyInfluenceDelta({ playerId: commitment.promisorId, delta: influenceDelta }))\n  }`,
  `  if (commitment.kind !== 'vote_to_keep' && influenceDelta !== 0) {\n    store.dispatch(applyInfluenceDelta({ playerId: commitment.promisorId, delta: influenceDelta }))\n  }`,
  'no private vote influence',
)
replace(
  'src/social/socialCommitments.ts',
  `      text: kept\n        ? \`You kept your word to \${beneficiary}. Your credibility in the house grew.\`\n        : \`You broke your promise to \${beneficiary}. They will remember it.\`,`,
  `      text:\n        commitment.kind === 'vote_to_keep'\n          ? kept\n            ? \`Your private vote matched what you told \${beneficiary}. The house does not automatically know that.\`\n            : \`Your private vote contradicted what you told \${beneficiary}. The house does not automatically know that.\`\n          : kept\n            ? \`You kept your word to \${beneficiary}. They saw it happen.\`\n            : \`You broke your promise to \${beneficiary}. They saw it happen and will remember it.\`,`,
  'knowledge-correct promise copy',
)
replaceRegex(
  'src/social/socialCommitments.ts',
  /  if \(actionType === 'game\/submitHumanVote' && typeof payload === 'string'\) \{[\s\S]*?    return\n  \}/,
  `  if (actionType === 'game/submitHumanVote' && typeof payload === 'string') {\n    const votePromises = pendingForAction(state, 'vote_to_keep')\n    let keptCount = 0\n    let brokenCount = 0\n    for (const commitment of votePromises) {\n      const kept = payload !== commitment.beneficiaryId\n      if (kept) keptCount += 1\n      else brokenCount += 1\n      resolvePromise(store, commitment, kept, kept ? 'voted_to_keep' : 'voted_against_promise')\n    }\n    const humanId = state.game.players?.find((player) => player.isUser)?.id\n    if (humanId && votePromises.length > 0) {\n      const contradictory = votePromises.length > 1 && keptCount > 0 && brokenCount > 0\n      store.dispatch(\n        updateApproval({\n          playerId: humanId,\n          delta: contradictory ? -3 : brokenCount > 0 ? -2 : 1,\n          reason: contradictory\n            ? 'contradictory_vote_promises'\n            : brokenCount > 0\n              ? 'broken_vote_promise'\n              : 'kept_vote_promise',\n          week: state.game.week ?? 1,\n          addToFeed: true,\n        })\n      )\n    }\n    return\n  }`,
  'public vote promise resolution',
)

// 9) Narrative copy for public vote promises.
replace(
  'src/publicOpinion/publicNarratives.ts',
  `  audience_reconsideration: [`,
  `  contradictory_vote_promises: [\n    'Viewers caught the player promising safety to both nominees. The contradiction did not go unnoticed.',\n    'The broadcast showed two incompatible vote promises, and the audience called out the double talk.',\n  ],\n  broken_vote_promise: [\n    'The vote did not match the promise viewers heard earlier, and trust outside the house slipped.',\n  ],\n  kept_vote_promise: [\n    'The vote matched the promise made on camera, earning a little respect from viewers.',\n  ],\n  audience_reconsideration: [`,
  'vote promise narratives',
)
replace(
  'src/publicOpinion/publicNarratives.ts',
  `  audience_reconsideration: 'audience_reconsideration',`,
  `  audience_reconsideration: 'audience_reconsideration',\n  contradictory_vote_promises: 'contradictory_vote_promises',\n  broken_vote_promise: 'broken_vote_promise',\n  kept_vote_promise: 'kept_vote_promise',`,
  'vote promise aliases',
)

console.log('Social UX realism patch applied')
