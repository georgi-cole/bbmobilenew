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

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source
}

function replaceRegexIfPresent(source, pattern, replacement) {
  return pattern.test(source) ? source.replace(pattern, replacement) : source
}

edit('src/components/FloatingActionBar/FloatingActionBar.tsx', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(incomingSocialModuleAvailability)`,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(socialModuleAvailability)`
  )
  source = replaceIfPresent(
    source,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(socialModuleAvailability)\n      return\n    }\n    dispatch(openIncomingInbox())`,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(incomingSocialModuleAvailability)\n      return\n    }\n    dispatch(openIncomingInbox())`
  )
  return source
})

edit('src/publicOpinion/publicOpinionMiddleware.ts', (source) =>
  replaceIfPresent(
    source,
    `          outcome === 'success' && score >= 0.55\n            ? publicOpinionConfig.socialImpact.highQualityInteraction\n            : outcome === 'failure' || score <= -0.25\n              ? publicOpinionConfig.socialImpact.poorInteraction\n              : 0`,
    `          outcome === 'success' && (score >= 0.25 || delta >= 4)\n            ? publicOpinionConfig.socialImpact.highQualityInteraction\n            : outcome === 'failure' && (score <= -0.3 || delta < 0)\n              ? publicOpinionConfig.socialImpact.poorInteraction\n              : 0`
  )
)

edit('src/screens/PublicMeter/PublicMeter.tsx', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `Approval now changes through recorded competitions, nominations, saves, evictions,\n                public requests and visible social play — not hidden daily random drift.`,
    `Routine phase changes do not create hidden swings; every change is tied to a recorded\n                public reaction below.`
  )
  source = replaceIfPresent(
    source,
    `Only broadcast-visible events and confirmed public moments move this meter; quiet time\n                alone does not change it.`,
    `Routine phase changes do not create hidden swings; every change is tied to a recorded\n                public reaction below.`
  )
  source = replaceIfPresent(
    source,
    `Check below what's your approval in the outside world.`,
    `See how every remaining housemate is landing with the outside world.`
  )
  return source
})

edit('src/social/socialStoryStream.ts', (source) =>
  replaceIfPresent(
    source,
    `      (entry.week ?? currentWeek) >= Math.max(1, currentWeek - 1)`,
    `      (entry.week ?? currentWeek) === currentWeek`
  )
)

edit('src/components/HousePulse/HousePulse.tsx', (source) =>
  replaceIfPresent(
    source,
    `{beat.severity === 'major' ? 'House-wide' : 'Observed'}`,
    `{beat.severity === 'major' ? 'Major shift' : 'Observed'}`
  )
)

edit('src/social/incomingInteractions.ts', (source) =>
  replaceIfPresent(
    source,
    `  interaction,\n  responseType,\n  responseLabel,\n  source,`,
    `  interaction,\n  responseType,\n  source,`
  )
)

edit('server/live-config.example.json', (source) =>
  source.replace(`"hoh_congratulations": "readOnly"`, `"hoh_congratulations": "optional"`)
)

edit('src/components/FloatingActionBar/__tests__/FloatingActionBar.test.tsx', (original) => {
  let source = original
  source = replaceRegexIfPresent(
    source,
    /  it\('logs the blocking reason and keeps both modules closed during live vote', \(\) => \{[\s\S]*?\n  \}\);\n/,
    `  it('blocks outgoing actions but keeps incoming vote pitches accessible during live vote', () => {\n    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});\n    const store = makeStore(true, { phase: 'live_vote' });\n    renderFAB(store);\n\n    act(() => {\n      screen.getByRole('button', { name: 'Social' }).click();\n      screen.getByRole('button', { name: 'Incoming requests' }).click();\n    });\n\n    expect(store.getState().social.panelOpen).toBe(false);\n    expect(store.getState().social.incomingInboxOpen).toBe(true);\n    expect(warnSpy).toHaveBeenCalledTimes(1);\n    expect(warnSpy).toHaveBeenCalledWith(\n      expect.stringContaining(\n        'Outgoing social module did not open: Outgoing social actions are blocked during the live_vote phase.',\n      ),\n      expect.objectContaining({ phase: 'live_vote', moduleKind: 'outgoing' }),\n    );\n\n    warnSpy.mockRestore();\n  });\n`
  )
  source = replaceRegexIfPresent(
    source,
    /  it\('shows 99\+ badge when energy exceeds 99', \(\) => \{[\s\S]*?\n  \}\);/,
    `  it('clamps impossible stored energy to the configured Drama cap', () => {\n    const store = makeStore();\n    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;\n    act(() => {\n      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 150 }));\n    });\n    renderFAB(store);\n    expect(screen.getByText('30')).toBeDefined();\n    expect(screen.getByRole('button', { name: 'Social (30)' })).toBeDefined();\n  });`
  )
  return source
})

edit('src/components/SocialPanelV2/__tests__/SocialPanelV2.test.tsx', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `import { Provider } from 'react-redux'`,
    `import { Provider } from 'react-redux'\nimport { MemoryRouter } from 'react-router'`
  )
  source = replaceIfPresent(
    source,
    `    <Provider store={store}>\n      <SocialPanelV2 />\n    </Provider>`,
    `    <MemoryRouter>\n      <Provider store={store}>\n        <SocialPanelV2 />\n      </Provider>\n    </MemoryRouter>`
  )
  source = replaceIfPresent(
    source,
    `Outgoing social module did not open: Social modules are blocked during the live_vote phase.`,
    `Outgoing social module did not open: Outgoing social actions are blocked during the live_vote phase.`
  )
  return source
})

edit('tests/unit/publicOpinion/publicOpinionMiddleware.test.ts', (original) => {
  let source = original
  source = source.replace(
    `  setProfileApprovals,\n  setProfileApprovals,`,
    `  setProfileApprovals,`
  )
  source = replaceIfPresent(
    source,
    `  initializeProfiles,\n  addDirection,`,
    `  initializeProfiles,\n  addDirection,\n  setProfileApprovals,`
  )
  source = replaceRegexIfPresent(
    source,
    /  it\('background drift does not create feed entries', \(\) => \{[\s\S]*?\n  \}\);\n\n  it\('prunes directions/,
    `  it('does not move approval merely because a new week started', () => {\n    const store = configureStore({\n      reducer: {\n        game: gameReducer,\n        publicOpinion: publicOpinionReducer,\n      },\n      middleware: (getDefaultMiddleware) =>\n        getDefaultMiddleware().concat(publicOpinionMiddleware),\n      preloadedState: {\n        game: makeGameState({ phase: 'week_end', week: 1 }),\n      },\n    });\n\n    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));\n    store.dispatch({\n      type: 'game/advance',\n      payload: {\n        phase: 'week_start',\n        week: 2,\n        players: [\n          makePlayer('p1', 'Aria'),\n          makePlayer('p2', 'Kian'),\n          makePlayer('p3', 'Rae'),\n        ],\n        seed: 42,\n      },\n    });\n\n    const state = store.getState().publicOpinion;\n    expect(state.profiles.p1.approval).toBe(50);\n    expect(state.profiles.p2.approval).toBe(50);\n    expect(state.profiles.p3.approval).toBe(50);\n    expect(state.feed).toHaveLength(0);\n  });\n\n  it('provides a small visible recovery path when approval is critically low', () => {\n    const store = configureStore({\n      reducer: {\n        game: gameReducer,\n        publicOpinion: publicOpinionReducer,\n      },\n      middleware: (getDefaultMiddleware) =>\n        getDefaultMiddleware().concat(publicOpinionMiddleware),\n      preloadedState: {\n        game: makeGameState({ phase: 'week_end', week: 1 }),\n      },\n    });\n\n    store.dispatch(initializeProfiles(['p1', 'p2']));\n    store.dispatch(setProfileApprovals({ p1: 5, p2: 50 }));\n    store.dispatch({\n      type: 'game/advance',\n      payload: {\n        phase: 'week_start',\n        week: 2,\n      },\n    });\n\n    const state = store.getState().publicOpinion;\n    expect(state.profiles.p1.approval).toBe(8);\n    expect(state.profiles.p2.approval).toBe(50);\n    expect(state.feed.some((entry) => entry.playerId === 'p1' && entry.delta === 3)).toBe(true);\n  });\n\n  it('prunes directions`
  )
  return source
})

edit('tests/social/incomingInteractionScheduler.unit.test.ts', (source) => {
  if (source.includes('delivers passive updates even when actionable conversation capacity is full')) {
    return source
  }
  const addition = `\n\n  it('delivers passive updates even when actionable conversation capacity is full', () => {\n    const store = makeStore();\n    const maxVisible = socialConfig.incomingInteractionDeliveryConfig.maxActiveVisible;\n    for (let i = 0; i < maxVisible; i += 1) {\n      store.dispatch(\n        pushIncomingInteraction(\n          makeInteraction({\n            id: \`actionable-\${i}\`,\n            fromId: \`active-ai-\${i}\`,\n            type: 'deal_offer',\n            requiresResponse: true,\n            createdWeek: 2,\n            expiresAtWeek: 5,\n          }),\n        ),\n      );\n    }\n    store.dispatch(\n      scheduleIncomingInteraction(\n        makeScheduledInteraction({\n          interaction: makeInteraction({\n            id: 'passive-update',\n            fromId: 'news-ai',\n            payload: { responsePolicy: 'readOnly' },\n            createdWeek: 2,\n            expiresAtWeek: 2,\n          }),\n          priority: 'medium',\n          scheduledForWeek: 2,\n          scheduledForPhase: 'nominations',\n        }),\n      ),\n    );\n\n    deliverScheduledIncomingInteractionsForPhase('nominations', store, { week: 2 });\n\n    const state = store.getState().social;\n    expect(state.scheduledIncomingInteractions).toHaveLength(0);\n    expect(state.incomingInteractions.some((entry) => entry.id === 'passive-update')).toBe(true);\n  });`
  return source.replace(/\n\}\);\s*$/, `${addition}\n});\n`)
})

console.log('Social liveliness follow-up complete')
