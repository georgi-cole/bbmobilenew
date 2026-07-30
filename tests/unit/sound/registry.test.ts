/**
 * Tests for Option B sound registry:
 *  - FILENAME_ALIAS_MAP maps non-prefix stems to canonical keys
 *  - resolveKey() works for canonical keys, aliases, and auto-derived keys
 *  - All new sound entries (live_vote, nominations, veto, etc.) are registered
 */

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  SOUND_REGISTRY,
  FILENAME_ALIAS_MAP,
  SOUNDS_BASE,
  resolveKey,
} from '../../../src/services/sound/sounds'

const PUBLIC_SOUNDS_DIR = join(process.cwd(), 'public', 'assets', 'sounds')

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

  it('resolves alias map stems (without .mp3 extension)', () => {
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

// ── New SOUND_REGISTRY entries ────────────────────────────────────────────────

describe('SOUND_REGISTRY — new entries', () => {
  const expectedNewKeys: [string, string][] = [
    ['music:hoh_comp_general', 'loh_competition.mp3'],
    ['tv:live_vote', 'live_vote.mp3'],
    ['music:nominations_horror', 'nominations_horror.mp3'],
    ['music:nominations_main', 'nominations_main.mp3'],
    ['tv:veto_ceremony', 'tv_winner_reveal.mp3'],
    ['music:veto_phase', 'Power_of_safety.mp3'],
    ['tv:voting_eviction', 'voting_for_eviction_user_and_housguests.mp3'],
  ]

  it.each(expectedNewKeys)('"%s" is registered and points to "%s"', (key, filename) => {
    const entry = SOUND_REGISTRY[key]
    expect(entry, `SOUND_REGISTRY["${key}"] should exist`).toBeDefined()
    expect(entry.src).toContain(filename)
    expect(entry.key).toBe(key)
  })

  it('nominations and veto_phase keys have category "music" and loop=true', () => {
    const musicLoopKeys = ['music:nominations_horror', 'music:nominations_main', 'music:veto_phase']
    for (const k of musicLoopKeys) {
      expect(SOUND_REGISTRY[k].category, `${k} should be category "music"`).toBe('music')
      expect(SOUND_REGISTRY[k].loop, `${k} should have loop=true`).toBe(true)
    }
  })

  it('tv:live_vote, tv:veto_ceremony, tv:voting_eviction have category "tv"', () => {
    const tvKeys = ['tv:live_vote', 'tv:veto_ceremony', 'tv:voting_eviction']
    for (const k of tvKeys) {
      expect(SOUND_REGISTRY[k].category).toBe('tv')
    }
  })

  it('"music:hoh_comp_general" has category "music" and loop=true', () => {
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
      const relativePath = decodeURIComponent(entry.src.slice(SOUNDS_BASE.length))
      const assetPath = join(PUBLIC_SOUNDS_DIR, relativePath)

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
