import { describe, expect, it } from 'vitest'
import {
  ALL_BROADCAST_PHASES,
  BROADCAST_TEMPLATE_CATALOG,
  getBroadcastTemplate,
  matchBroadcastTemplate,
  renderBroadcastTemplate,
} from '../src/broadcasting/broadcastTemplateCatalog'

const LOG_ONLY_MECHANICAL_IDS = new Set([
  'loh.competition-start',
  'pos.competition-start',
  'nominations.preparing',
  'safety.holder',
  'safety.replacement-selecting',
])

describe('broadcast template catalog', () => {
  it('keeps Democracia as a single full-screen announcement', () => {
    expect(getBroadcastTemplate('card.democracia')).toMatchObject({
      kind: 'phase_card',
      level: 'critical',
      major: 'democracia',
    })
    expect(getBroadcastTemplate('loh.democracia-vote-start')).toMatchObject({
      kind: 'feed',
      level: 'minor',
      major: undefined,
    })
  })

  it('has at least one visible source template for every manager phase', () => {
    for (const phase of ALL_BROADCAST_PHASES) {
      expect(BROADCAST_TEMPLATE_CATALOG.some((template) => template.phase === phase)).toBe(true)
    }
  })

  it('captures dynamic values so edited copy can preserve them', () => {
    const match = matchBroadcastTemplate(
      'Housemates congratulate Rune. Alliances are already forming… 💬',
      'social_1'
    )
    expect(match?.template.id).toBe('social.loh-congratulations')
    expect(
      renderBroadcastTemplate('The house congratulates {winner}.', match?.variables ?? [])
    ).toBe('The house congratulates Rune.')
  })

  it('keeps only the approved P0 mechanical feeds log-only by default', () => {
    const feeds = BROADCAST_TEMPLATE_CATALOG.filter((template) => template.kind === 'feed')
    expect(feeds.length).toBeGreaterThan(0)

    for (const template of feeds) {
      if (LOG_ONLY_MECHANICAL_IDS.has(template.id)) {
        expect(template.forceOnTv).toBe(false)
        expect(template.editorial).toMatchObject({
          importance: 'required',
          presentationMode: 'log_only',
        })
      }
    }
  })

  it('captures variables when a runtime event supplies an explicit template id', () => {
    const match = matchBroadcastTemplate(
      'Ash has won Leader of the House! 👑',
      'loh_results',
      'loh.winner'
    )
    expect(match?.variables).toEqual(['Ash'])
  })
})
