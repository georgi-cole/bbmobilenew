import fs from 'node:fs'

function edit(file, transform) {
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) {
    fs.writeFileSync(file, after)
    console.log(`Updated ${file}`)
  } else {
    console.log(`No pending codemod changes in ${file}`)
  }
}

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source
}

edit('src/social/SocialManeuvers.ts', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `  const scaledYields = options?.waiveCosts
    ? { influence: 0, info: 0 }
    : normalizeActionYields(action)`,
    `  const scaledYields = options?.waiveCosts || !dramaMode
    ? { influence: 0, info: 0 }
    : normalizeActionYields(action)`
  )
  source = replaceIfPresent(
    source,
    `  const relationshipDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - existingAffinity)
    : actionId === 'proposeAlliance' && outcome === 'success'
      ? delta
      : dramaMode
        ? delta * 2
        : delta`,
    `  const relationshipDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - existingAffinity)
    : delta`
  )
  source = replaceIfPresent(
    source,
    `  const effect = getSocialResourceEffect(
    action,
    anyBackfire ? 'backfire' : outcome,
    targetIds.length
  )`,
    `  const effect = dramaMode
    ? getSocialResourceEffect(action, anyBackfire ? 'backfire' : outcome, targetIds.length)
    : { influence: 0, info: 0 }`
  )
  source = replaceIfPresent(
    source,
    `    game: rootState.game,
    relationships: state.social.relationships,
    random,
  })`,
    `    game: rootState.game,
    relationships: state.social.relationships,
  })`
  )
  return source
})

edit('src/components/SocialPanelV2/SocialPanelV2.tsx', (source) =>
  replaceIfPresent(
    source,
    `            <span
              className="sp2-resource-chip sp2-resource-chip--influence"
              aria-live="polite"
              aria-label={\`Influence: \${influence}\`}
            >
              🤝 {influence}
            </span>
            <span
              className="sp2-resource-chip sp2-resource-chip--info"
              aria-live="polite"
              aria-label={\`Info: \${info}\`}
            >
              💡 {info}
            </span>`,
    `            {dramaMode && (
              <>
                <span
                  className="sp2-resource-chip sp2-resource-chip--influence"
                  aria-live="polite"
                  aria-label={\`Influence: \${influence}\`}
                >
                  🤝 {influence}
                </span>
                <span
                  className="sp2-resource-chip sp2-resource-chip--info"
                  aria-live="polite"
                  aria-label={\`Info: \${info}\`}
                >
                  💡 {info}
                </span>
              </>
            )}`
  )
)

edit('src/social/incomingInteractions.ts', (source) =>
  replaceIfPresent(
    source,
    `  if (canAwardIntel(interaction) && (responseType === 'positive' || responseType === 'neutral')) {`,
    `  if (
    dramaMode &&
    canAwardIntel(interaction) &&
    (responseType === 'positive' || responseType === 'neutral')
  ) {`
  )
)

edit('src/social/socialMiddleware.ts', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `    ).payload
    const result = next(action)
    if (
      isDramaModeEnabled(api as unknown as MiddlewareAPI) &&`,
    `    ).payload
    const stateBeforeRelationshipUpdate = api.getState() as StateWithGame
    const hadAllianceBefore =
      payload.tags?.includes('alliance') === true &&
      hasAllianceBetween(
        stateBeforeRelationshipUpdate.social?.relationships ?? {},
        payload.source,
        payload.target
      )
    const result = next(action)
    if (
      isDramaModeEnabled(api as unknown as MiddlewareAPI) &&`
  )
  source = replaceIfPresent(
    source,
    `      if (payload.tags.includes('alliance')) {
        // New alliance formed: both parties get +2 energy and +200 influence pts.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, 2)
        grantEnergy(api as unknown as MiddlewareAPI, payload.target, 2)
        grantInfluence(api as unknown as MiddlewareAPI, payload.source, 200)
        grantInfluence(api as unknown as MiddlewareAPI, payload.target, 200)`,
    `      if (payload.tags.includes('alliance') && !hadAllianceBefore) {
        // Reward only the actual transition into a new alliance.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, 2)
        grantEnergy(api as unknown as MiddlewareAPI, payload.target, 2)
        if (isDramaModeEnabled(api as unknown as MiddlewareAPI)) {
          grantInfluence(api as unknown as MiddlewareAPI, payload.source, 200)
          grantInfluence(api as unknown as MiddlewareAPI, payload.target, 200)
        }`
  )
  return source
})

edit('src/social/socialAIDriver.ts', (original) => {
  let source = original.replace(
    `import { isAISocialActionVisible } from './socialActionCatalog'\nimport { isAISocialActionVisible } from './socialActionCatalog'`,
    `import { isAISocialActionVisible } from './socialActionCatalog'`
  )
  if (!source.includes(`import { isAISocialActionVisible } from './socialActionCatalog'`)) {
    source = replaceIfPresent(
      source,
      `import { resolveActionTargetMode } from './socialActions'`,
      `import { resolveActionTargetMode } from './socialActions'\nimport { isAISocialActionVisible } from './socialActionCatalog'`
    )
  }
  source = replaceIfPresent(
    source,
    `import { chooseDramaAIMove, normalizeDramaSocialNetwork } from './dramaModeEngine'`,
    `import { normalizeDramaSocialNetwork } from './dramaModeEngine'\nimport { chooseUtilityDramaAIMove } from './dramaAIPolicy'`
  )
  source = replaceIfPresent(source, `? chooseDramaAIMove({`, `? chooseUtilityDramaAIMove({`)
  source = replaceIfPresent(
    source,
    `      recentActions: history,
    } as Parameters<typeof chooseActionFor>[1])`,
    `      recentActions: history,
      availableActionIds: Object.keys(socialConfig.actionWeights).filter((candidateId) =>
        isAISocialActionVisible(candidateId, dramaMode ? 'drama' : 'normal')
      ),
    } as Parameters<typeof chooseActionFor>[1])`
  )
  return source
})
