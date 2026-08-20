import { describe, expect, it } from 'vitest'
import {
  BROADCAST_TEMPLATE_CATALOG,
  getBroadcastTemplate,
  matchesBroadcastCampaign,
} from '../src/broadcasting/broadcastTemplateCatalog'

describe('Broadcast Manager Vox catalog', () => {
  it('shows only General and Vox definitions when Vox Populi is selected', () => {
    const visible = BROADCAST_TEMPLATE_CATALOG.filter((template) =>
      matchesBroadcastCampaign(template, 'vox_populi')
    )

    expect(visible.length).toBeGreaterThan(0)
    expect(
      visible.every((template) => !template.campaign || template.campaign === 'vox_populi')
    ).toBe(true)
    expect(visible.some((template) => template.campaign === 'classic')).toBe(false)
    expect(visible.some((template) => template.campaign === 'cupid')).toBe(false)
    expect(visible.some((template) => template.campaign === 'survival')).toBe(false)
  })

  it('maps every reported Vox line to an editable non-critical source', () => {
    const ids = [
      'loh.vox-last-place',
      'nominations.vox-result-with-auto',
      'nominations.vox-result',
      'nominations.vox-auto-remains',
      'nominations.vox-ballot-complete',
      'nominations.vox-ballot',
      'vox.social-tearful-apology',
      'vox.social-final-appeals',
      'safety.vox-self-save',
      'safety.vox-save',
      'safety.vox-self-save-double',
      'safety.vox-save-double',
      'safety.vox-hold',
    ]

    for (const id of ids) {
      expect(getBroadcastTemplate(id)).toMatchObject({
        id,
        campaign: 'vox_populi',
        level: 'minor',
      })
    }
  })

  it('does not leave a Vox-named source classified as General', () => {
    const voxSources = BROADCAST_TEMPLATE_CATALOG.filter(
      (template) => template.id.includes('vox') || template.major?.includes('vox')
    )
    expect(voxSources.length).toBeGreaterThan(0)
    expect(voxSources.every((template) => template.campaign === 'vox_populi')).toBe(true)
  })
})
