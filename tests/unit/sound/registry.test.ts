/**
 * Tests for the generated sound registry:
 *  - FILENAME_ALIAS_MAP maps legacy stems to canonical keys
 *  - resolveKey() works for canonical keys, aliases, and auto-derived keys
 *  - registered assets resolve to real files under the split music/sounds roots
 */

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SOUND_REGISTRY, FILENAME_ALIAS_MAP, resolveKey } from '../../../src/services/sound/sounds'

const PUBLIC_ASSETS_DIR = join(process.cwd(), 'public', 'assets')

// ── FILENAME_ALIAS_MAP ────────────────────────────────────────────────────────

describe('FILENAME_ALIAS_MAP', () => {
  const nonPrefixStems = [
    'live_vote',
    'nominations_horror',
    'nominations_main',
    'veto_ceremony',
    'veto_phase',
    'voting_for_eviction_user_and_housguests',
    'Social_module',
    'Hoh_competition_and_general_competition',
  ]

  it.each(nonPrefixStems)('maps "%s" to a canonical SOUND_REGISTRY key', (stem) => {
    const canonical = FILENAME_ALIAS_MAP[stem]
    expect(canonical, `FILENAME_ALIAS_MAP["${stem}"] should be defined`).toBeDefined()
    expect(SOUND_REGISTRY[canonical], `SOUND_REGISTRY["${canonical}"] should exist`).toBeDefined()
  })
})

// ── resolveKey() ──────────────────────────────────────────────────────────────

describe('resolveKey()', () => {
  it('returns canonical key unchanged when already in registry', () => {
    expect(resolveKey('tv:live_vote')).toBe('tv:live_vote')
    expect(resolveKey('ui:navigate')).toBe('ui:navigate')
    expect(resolveKey('music:nominations_main')).toBe('music:nominations_main')
    expect(resolveKey('music:veto_phase')).toBe('music:veto_phase')
  })

  it('resolves alias map stems without a file extension', () => {
    expect(resolveKey('live_vote')).toBe('tv:live_vote')
    expect(resolveKey('nominations_horror')).toBe('music:nominations_horror')
    expect(resolveKey('nominations_main')).toBe('music:nominations_main')
    expect(resolveKey('veto_ceremony')).toBe('tv:veto_ceremony')
    expect(resolveKey('veto_phase')).toBe('music:veto_phase')
    expect(resolveKey('voting_for_eviction_user_and_housguests')).toBe('tv:voting_eviction')
    expect(resolveKey('Social_module')).toBe('music:social_module')
    expect(resolveKey('Hoh_competition_and_general_competition')).toBe('music:hoh_comp_general')
  })

  it('strips .mp3 extension before alias lookup', () => {
    expect(resolveKey('live_vote.mp3')).toBe('tv:live_vote')
    expect(resolveKey('nominations_horror.mp3')).toBe('music:nominations_horror')
  })

  it('auto-derives prefix:rest keys from standard-named stems', () => {
    expect(resolveKey('ui_navigate')).toBe('ui:navigate')
    expect(resolveKey('tv_battleback')).toBe('tv:battleback')
    expect(resolveKey('music_hoh_comp_general')).toBe('music:hoh_comp_general')
    expect(resolveKey('player_evicted')).toBe('player:evicted')
    expect(resolveKey('minigame_start')).toBe('minigame:start')
  })

  it('returns null for completely unknown stems', () => {
    expect(resolveKey('some_unknown_file')).toBeNull()
    expect(resolveKey('not_a_sound')).toBeNull()
  })
})

// ── SOUND_REGISTRY entries ───────────────────────────────────────────────────

describe('SOUND_REGISTRY — generated entries', () => {
  const expectedKeys: [string, 'music' | 'sounds'][] = [
    ['music:hoh_comp_general', 'music'],
    ['tv:live_vote', 'sounds'],
    ['music:nominations_horror', 'music'],
    ['music:nominations_main', 'music'],
    ['tv:veto_ceremony', 'sounds'],
    ['music:veto_phase', 'music'],
    ['tv:voting_eviction', 'sounds'],
  ]

  it.each(expectedKeys)('registers "%s" under assets/%s', (key, root) => {
    const entry = SOUND_REGISTRY[key]
    expect(entry, `SOUND_REGISTRY["${key}"] should exist`).toBeDefined()
    expect(entry.src).toContain(`/assets/${root}/`)
    expect(entry.key).toBe(key)
  })

  it('nominations and veto_phase keys have category "music" and loop=true', () => {
    const musicLoopKeys = ['music:nominations_horror', 'music:nominations_main', 'music:veto_phase']
    for (const key of musicLoopKeys) {
      expect(SOUND_REGISTRY[key].category, `${key} should be category "music"`).toBe('music')
      expect(SOUND_REGISTRY[key].loop, `${key} should have loop=true`).toBe(true)
    }
  })

  it('TV cues retain category "tv"', () => {
    const tvKeys = ['tv:live_vote', 'tv:veto_ceremony', 'tv:voting_eviction']
    for (const key of tvKeys) {
      expect(SOUND_REGISTRY[key].category).toBe('tv')
    }
  })

  it('competition music retains category music and loop=true', () => {
    const entry = SOUND_REGISTRY['music:hoh_comp_general']
    expect(entry.category).toBe('music')
    expect(entry.loop).toBe(true)
  })

  it('does not mark any sound entry for eager preload', () => {
    for (const entry of Object.values(SOUND_REGISTRY)) {
      expect(entry.preload, `${entry.key} should load on demand`).toBe(false)
    }
  })

  it('points every registered web sound to a non-empty production asset', () => {
    for (const entry of Object.values(SOUND_REGISTRY)) {
      const assetsMarker = 'assets/'
      const markerIndex = entry.src.indexOf(assetsMarker)
      expect(markerIndex, `${entry.key} should resolve below public/assets`).toBeGreaterThanOrEqual(
        0
      )
      if (markerIndex < 0) continue

      const relativePath = decodeURIComponent(entry.src.slice(markerIndex + assetsMarker.length))
      const assetPath = join(PUBLIC_ASSETS_DIR, relativePath)

      expect(existsSync(assetPath), `${entry.key} should resolve to ${relativePath}`).toBe(true)
      if (existsSync(assetPath)) {
        expect(
          statSync(assetPath).size,
          `${entry.key} should not use an empty placeholder`
        ).toBeGreaterThan(1024)
      }
    }
  })
})
