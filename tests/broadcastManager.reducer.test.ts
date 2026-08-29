import { describe, expect, it } from 'vitest'
import gameReducer, {
  addCustomBroadcast,
  addTvEvent,
  advance,
  consumeBroadcastEvent,
  hydrateGame,
  replaceBroadcastConfig,
  removeTvEvent,
  reorderCustomBroadcasts,
  reorderPhaseBroadcasts,
  resetGame,
  setBroadcastOverride,
  syncPhaseBroadcasts,
  updateTvEvent,
} from '../src/store/gameSlice'

describe('broadcast manager reducers', () => {
  it('honors an explicitly authored presentation contract on an externally added event', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, tvFeed: [], broadcastQueue: [] }

    state = gameReducer(
      state,
      addTvEvent({
        text: 'A legacy hard-coded announcement.',
        type: 'twist',
        major: 'legacy_shock',
        meta: { broadcastPriority: 'critical', forceOnTv: true },
      })
    )

    expect(state.tvFeed[0]).toMatchObject({
      major: 'legacy_shock',
      meta: {
        broadcastLevel: 'critical',
        broadcastManaged: true,
        forceOnTv: true,
      },
    })
    expect(state.tvFeed[0].meta?.broadcastTemplateId).toBeUndefined()
    expect(state.broadcastQueue).toEqual([state.tvFeed[0].id])
  })

  it('adopts the legacy Vox intro so manager copy edits update resumed campaigns', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, tvFeed: [], broadcastQueue: [], phase: 'season_start' }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'VOX POPULI legacy rules copy that used to bypass the manager.',
        type: 'twist',
        major: 'vox_populi',
        meta: { phase: 'season_start', major: 'vox_populi', broadcastPriority: 'critical' },
      })
    )
    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'season.vox-populi-intro',
        changes: { text: 'Managed Vox intro.' },
      })
    )

    expect(state.tvFeed[0]).toMatchObject({
      text: 'Managed Vox intro.',
      meta: { broadcastTemplateId: 'season.vox-populi-intro' },
    })
  })

  it('persists an unchecked faux-TV override and removes even a critical message from the queue', () => {
    let state = gameReducer(undefined, { type: 'init' })
    const intro = state.tvFeed.find((event) => event.meta?.broadcastTemplateId === 'season.welcome')

    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'season.welcome',
        changes: { level: 'critical', forceOnTv: false },
      })
    )

    expect(state.broadcastOverrides?.['season.welcome']).toMatchObject({
      level: 'critical',
      forceOnTv: false,
    })
    expect(intro).toBeDefined()
    expect(state.broadcastQueue).not.toContain(intro?.id)
  })

  it('registers and queues the LOH winner as an LOH Results faux-TV message', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', seed: 42 }

    state = gameReducer(state, advance())

    const winnerEvent = state.tvFeed.find(
      (event) => event.meta?.broadcastTemplateId === 'loh.winner'
    )
    expect(winnerEvent).toMatchObject({
      meta: {
        phase: 'loh_results',
        broadcastLevel: 'minor',
        forceOnTv: true,
      },
    })
    expect(state.broadcastQueue).toContain(winnerEvent?.id)
  })

  it('edits an existing message while preserving its identity and chronology', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(state, addTvEvent({ text: 'Original copy', type: 'game' }))
    const event = state.tvFeed[0]

    state = gameReducer(
      state,
      updateTvEvent({
        id: event.id,
        text: 'Edited copy',
        type: 'twist',
        phase: 'nominations',
        major: 'nomination_ceremony',
        broadcastPriority: 'critical',
      })
    )

    expect(state.tvFeed[0]).toMatchObject({
      id: event.id,
      timestamp: event.timestamp,
      text: 'Edited copy',
      type: 'twist',
      major: 'nomination_ceremony',
      meta: {
        phase: 'nominations',
        major: 'nomination_ceremony',
        broadcastPriority: 'critical',
      },
    })
  })

  it('removes only the requested message', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(state, addTvEvent({ text: 'Keep me', type: 'game' }))
    state = gameReducer(state, addTvEvent({ text: 'Remove me', type: 'game' }))
    const removeId = state.tvFeed[0].id
    const retainedId = state.tvFeed[1].id

    state = gameReducer(state, removeTvEvent(removeId))

    expect(state.tvFeed.map((event) => event.id)).toContain(retainedId)
    expect(state.tvFeed.map((event) => event.id)).not.toContain(removeId)
  })

  it('uses edited built-in copy in the real Play flow and tags the destination phase', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'loh.competition-start',
        changes: { text: 'The edited LOH competition message.' },
      })
    )

    state = gameReducer(state, advance()) // season_start -> week_start
    state = gameReducer(state, advance()) // week_start -> announcement
    state = gameReducer(state, advance()) // announcement -> loh_comp

    expect(state.tvFeed[0]).toMatchObject({
      text: 'The edited LOH competition message.',
      meta: { phase: 'loh_comp', broadcastTemplateId: 'loh.competition-start' },
    })
  })

  it('disables only the duplicate broadcast definition, not the phase', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      setBroadcastOverride({ id: 'loh.competition-start', changes: { disabled: true } })
    )

    state = gameReducer(state, advance())
    state = gameReducer(state, advance())
    state = gameReducer(state, advance())

    expect(state.phase).toBe('loh_comp')
    expect(
      state.tvFeed.some((event) => event.meta?.broadcastTemplateId === 'loh.competition-start')
    ).toBe(false)
  })

  it('emits a custom message once when Play processes its phase', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'qa-custom',
        phase: 'week_start',
        text: 'Custom day-opening line.',
        type: 'game',
        level: 'minor',
        enabled: true,
      })
    )

    state = gameReducer(state, advance())

    expect(
      state.tvFeed.filter((event) => event.meta?.customBroadcastId === 'qa-custom')
    ).toHaveLength(1)
  })

  it('starts a fresh season separately and enters Day 1 without incrementing the day', () => {
    let state = gameReducer(undefined, { type: 'init' })

    expect(state.phase).toBe('season_start')
    expect(state.week).toBe(1)
    expect(state.tvFeed.some((event) => event.meta?.broadcastTemplateId === 'season.welcome')).toBe(
      true
    )
    expect(
      state.tvFeed.some((event) => event.meta?.broadcastTemplateId === 'season.public-mode-rule')
    ).toBe(true)

    state = gameReducer(state, advance())

    expect(state.phase).toBe('week_start')
    expect(state.week).toBe(1)
    expect(
      state.tvFeed.filter((event) => event.meta?.broadcastTemplateId === 'season.welcome')
    ).toHaveLength(1)
    expect(state.tvFeed[0]).toMatchObject({
      text: 'Day 1 has begun. Get ready.',
      meta: { phase: 'week_start', broadcastTemplateId: 'week.day-start' },
    })
  })

  it('keeps permanent manager configuration when an older campaign is hydrated', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'permanent-message',
        phase: 'week_start',
        text: 'Keep across campaigns.',
        type: 'game',
        level: 'minor',
        enabled: true,
      })
    )
    const oldSnapshot = { ...state, customBroadcasts: [], broadcastOverrides: {} }

    state = gameReducer(state, hydrateGame(oldSnapshot))

    expect(state.customBroadcasts?.map((message) => message.id)).toContain('permanent-message')
  })

  it('applies manager changes from another tab to the active phase queue', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      replaceBroadcastConfig({
        overrides: state.broadcastOverrides ?? {},
        customMessages: [
          {
            id: 'cross-tab-message',
            key: 'custom.cross-tab-message',
            phase: 'season_start',
            text: 'Saved in the manager tab.',
            type: 'game',
            level: 'minor',
            enabled: true,
            forceOnTv: true,
            order: 10,
          },
        ],
      })
    )

    const event = state.tvFeed.find(
      (candidate) => candidate.meta?.customBroadcastId === 'cross-tab-message'
    )
    expect(event?.text).toBe('Saved in the manager tab.')
    expect(state.broadcastQueue?.[0]).toBe(event?.id)
  })

  it('honors custom sequence order and can force a minor line onto the faux TV', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'second',
        key: 'custom.second',
        phase: 'week_start',
        text: 'Second line',
        type: 'game',
        level: 'minor',
        enabled: true,
        order: 20,
      })
    )
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'first',
        key: 'custom.first',
        phase: 'week_start',
        text: 'First line',
        type: 'game',
        level: 'minor',
        enabled: true,
        order: 10,
        forceOnTv: true,
      })
    )

    state = gameReducer(state, advance())

    const customEvents = state.tvFeed.filter((event) => event.meta?.customBroadcastId)
    expect(
      [...customEvents]
        .sort((a, b) => Number(a.meta?.broadcastOrder) - Number(b.meta?.broadcastOrder))
        .map((event) => event.meta?.customBroadcastId)
    ).toEqual(['first', 'second'])
    expect(customEvents.find((event) => event.meta?.customBroadcastId === 'first')).toMatchObject({
      meta: {
        broadcastLevel: 'minor',
        forceOnTv: true,
        broadcastTemplateId: 'custom.first',
      },
    })
    const forcedMinor = customEvents.find((event) => event.meta?.customBroadcastId === 'first')
    expect(forcedMinor?.major).toBeUndefined()
    expect(state.broadcastQueue).toContain(forcedMinor?.id)
  })

  it('reorders a phase atomically', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'one',
        key: 'custom.one',
        phase: 'social_1',
        text: 'One',
        type: 'game',
        level: 'minor',
        enabled: true,
        order: 10,
      })
    )
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'two',
        key: 'custom.two',
        phase: 'social_1',
        text: 'Two',
        type: 'game',
        level: 'minor',
        enabled: true,
        order: 20,
      })
    )

    state = gameReducer(
      state,
      reorderCustomBroadcasts({
        phase: 'social_1',
        orderedIds: ['two', 'one'],
      })
    )

    expect(
      [...(state.customBroadcasts ?? [])]
        .filter((message) => message.phase === 'social_1')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((message) => message.id)
    ).toEqual(['two', 'one'])
  })

  it('uses level and force as independent presentation controls', () => {
    let state = gameReducer(undefined, { type: 'init' })
    const messages = [
      { id: 'plain-log', level: 'minor' as const, forceOnTv: false, order: 10 },
      { id: 'plain-tv', level: 'minor' as const, forceOnTv: true, order: 20 },
      { id: 'major-card', level: 'major' as const, forceOnTv: false, order: 30 },
      { id: 'critical-card', level: 'critical' as const, forceOnTv: true, order: 40 },
    ]
    for (const message of messages) {
      state = gameReducer(
        state,
        addCustomBroadcast({
          ...message,
          key: `custom.${message.id}`,
          phase: 'season_start',
          text: message.id,
          type: 'game',
          enabled: true,
        })
      )
    }

    state = gameReducer(state, syncPhaseBroadcasts({ phase: 'season_start' }))

    const byCustomId = (id: string) =>
      state.tvFeed.find((event) => event.meta?.customBroadcastId === id)
    expect(byCustomId('plain-log')?.major).toBeUndefined()
    expect(byCustomId('plain-tv')).toMatchObject({
      major: undefined,
      meta: { broadcastLevel: 'minor', forceOnTv: true },
    })
    expect(byCustomId('major-card')).toMatchObject({
      major: 'custom_major',
      meta: { broadcastLevel: 'major', major: 'custom_major' },
    })
    expect(byCustomId('critical-card')).toMatchObject({
      major: 'custom_critical',
      meta: {
        broadcastLevel: 'critical',
        major: 'custom_critical',
        broadcastPriority: 'critical',
      },
    })
    expect(state.broadcastQueue).not.toContain(byCustomId('plain-log')?.id)
    expect(state.broadcastQueue).toEqual(
      expect.arrayContaining([byCustomId('plain-tv')?.id, byCustomId('critical-card')?.id])
    )
    expect(state.broadcastQueue).not.toContain(byCustomId('major-card')?.id)
  })

  it('lets a built-in phase card be reclassified by the manager', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp_announcement' }
    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'card.loh',
        changes: { level: 'minor', forceOnTv: false },
      })
    )
    state = gameReducer(
      state,
      syncPhaseBroadcasts({
        phase: 'loh_comp_announcement',
        cardMajor: 'loh_comp_announcement',
      })
    )

    const card = state.tvFeed.find((event) => event.meta?.broadcastTemplateId === 'card.loh')
    expect(card).toMatchObject({
      major: undefined,
      meta: { broadcastLevel: 'minor', broadcastManaged: true },
    })
    expect(card?.meta?.forceOnTv).toBeUndefined()
    expect(state.broadcastQueue).not.toContain(card?.id)

    state = gameReducer(
      state,
      setBroadcastOverride({
        id: 'card.loh',
        changes: { level: 'critical', forceOnTv: true },
      })
    )
    state = gameReducer(
      state,
      syncPhaseBroadcasts({
        phase: 'loh_comp_announcement',
        cardMajor: 'loh_comp_announcement',
      })
    )

    expect(state.tvFeed.find((event) => event.id === card?.id)).toMatchObject({
      meta: { broadcastLevel: 'critical', broadcastPriority: 'critical' },
    })
    expect(state.broadcastQueue).toContain(card?.id)
  })

  it('preserves a manager-authored Season Start item when onboarding replaces the legacy welcome', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'opening-first',
        key: 'custom.opening-first',
        phase: 'season_start',
        text: 'Opening first.',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )

    state = gameReducer(state, resetGame())

    const queueCopy = state.broadcastQueue ?? []
    const queuedTexts = queueCopy.map((id) => state.tvFeed.find((event) => event.id === id)?.text)
    expect(queuedTexts[0]).toBe('Opening first.')
    expect(queuedTexts.some((text) => text?.startsWith('Welcome to The Big Eye'))).toBe(false)

    const firstId = queueCopy[0]
    state = gameReducer(state, consumeBroadcastEvent(firstId))
    expect(state.tvFeed.find((event) => event.id === firstId)?.meta?.broadcastConsumed).toBe(true)
    expect(state.broadcastQueue).not.toContain(firstId)
  })

  it('places a custom message before the built-in day-start line in the full phase sequence', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = gameReducer(
      state,
      addCustomBroadcast({
        id: 'before-day-start',
        key: 'week.before-day-start',
        phase: 'week_start',
        text: 'This runs before the day starts.',
        type: 'game',
        level: 'minor',
        enabled: true,
        order: 100,
      })
    )
    state = gameReducer(
      state,
      reorderPhaseBroadcasts({
        phase: 'week_start',
        items: [
          { id: 'before-day-start', kind: 'custom' },
          { id: 'week.tribunal-start', kind: 'source' },
          { id: 'week.day-start', kind: 'source' },
        ],
      })
    )
    state = { ...state, phase: 'week_end' }

    state = gameReducer(state, advance())

    const custom = state.tvFeed.find(
      (event) => event.meta?.customBroadcastId === 'before-day-start'
    )
    const dayStart = state.tvFeed.find(
      (event) => event.meta?.broadcastTemplateId === 'week.day-start'
    )
    expect(custom?.meta?.broadcastOrder).toBeLessThan(Number(dayStart?.meta?.broadcastOrder))
  })
})
