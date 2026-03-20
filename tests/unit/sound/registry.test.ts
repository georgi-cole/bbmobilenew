/**
 * Tests for Option B sound registry:
 *  - FILENAME_ALIAS_MAP maps non-prefix stems to canonical keys
 *  - resolveKey() works for canonical keys, aliases, and auto-derived keys
 *  - All new sound entries (live_vote, nominations, veto, etc.) are registered
 */

import { describe, it, expect } from 'vitest';
import {
  SOUND_REGISTRY,
  FILENAME_ALIAS_MAP,
  resolveKey,
} from '../../../src/services/sound/sounds';

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
  ];

  it.each(nonPrefixStems)('maps "%s" to a canonical SOUND_REGISTRY key', (stem) => {
    const canonical = FILENAME_ALIAS_MAP[stem];
    expect(canonical, `FILENAME_ALIAS_MAP["${stem}"] should be defined`).toBeDefined();
    expect(SOUND_REGISTRY[canonical], `SOUND_REGISTRY["${canonical}"] should exist`).toBeDefined();
  });
});

// ── resolveKey() ──────────────────────────────────────────────────────────────

describe('resolveKey()', () => {
  it('returns canonical key unchanged when already in registry', () => {
    expect(resolveKey('tv:live_vote')).toBe('tv:live_vote');
    expect(resolveKey('music:intro_hub_loop')).toBe('music:intro_hub_loop');
    expect(resolveKey('ui:navigate')).toBe('ui:navigate');
  });

  it('resolves alias map stems (without .mp3 extension)', () => {
    expect(resolveKey('live_vote')).toBe('tv:live_vote');
    expect(resolveKey('nominations_horror')).toBe('tv:nominations_horror');
    expect(resolveKey('nominations_main')).toBe('tv:nominations_main');
    expect(resolveKey('veto_ceremony')).toBe('tv:veto_ceremony');
    expect(resolveKey('veto_phase')).toBe('tv:veto_phase');
    expect(resolveKey('voting_for_eviction_user_and_housguests')).toBe('tv:voting_eviction');
    expect(resolveKey('Social_module')).toBe('music:social_module');
    expect(resolveKey('Hoh_competition_and_general_competition')).toBe('music:hoh_comp_general');
  });

  it('strips .mp3 extension before alias lookup', () => {
    expect(resolveKey('live_vote.mp3')).toBe('tv:live_vote');
    expect(resolveKey('nominations_horror.mp3')).toBe('tv:nominations_horror');
  });

  it('auto-derives prefix:rest keys from standard-named stems', () => {
    expect(resolveKey('ui_navigate')).toBe('ui:navigate');
    expect(resolveKey('tv_battleback')).toBe('tv:battleback');
    expect(resolveKey('music_intro_hub_loop')).toBe('music:intro_hub_loop');
    expect(resolveKey('player_evicted')).toBe('player:evicted');
    expect(resolveKey('minigame_start')).toBe('minigame:start');
  });

  it('returns null for completely unknown stems', () => {
    expect(resolveKey('some_unknown_file')).toBeNull();
    expect(resolveKey('not_a_sound')).toBeNull();
  });
});

// ── New SOUND_REGISTRY entries ────────────────────────────────────────────────

describe('SOUND_REGISTRY — new entries', () => {
  const expectedNewKeys: [string, string][] = [
    ['music:hoh_comp_general',  'music_hoh_comp_general.mp3'],
    ['tv:live_vote',            'live_vote.mp3'],
    ['tv:nominations_horror',   'nominations_horror.mp3'],
    ['tv:nominations_main',     'nominations_main.mp3'],
    ['tv:veto_ceremony',        'veto_ceremony.mp3'],
    ['tv:veto_phase',           'veto_phase.mp3'],
    ['tv:voting_eviction',      'voting_for_eviction_user_and_housguests.mp3'],
  ];

  it.each(expectedNewKeys)('"%s" is registered and points to "%s"', (key, filename) => {
    const entry = SOUND_REGISTRY[key];
    expect(entry, `SOUND_REGISTRY["${key}"] should exist`).toBeDefined();
    expect(entry.src).toContain(filename);
    expect(entry.key).toBe(key);
  });

  it('all new tv: keys have category "tv"', () => {
    const tvKeys = ['tv:live_vote', 'tv:nominations_horror', 'tv:nominations_main',
      'tv:veto_ceremony', 'tv:veto_phase', 'tv:voting_eviction'];
    for (const k of tvKeys) {
      expect(SOUND_REGISTRY[k].category).toBe('tv');
    }
  });

  it('"music:hoh_comp_general" has category "music" and loop=true', () => {
    const entry = SOUND_REGISTRY['music:hoh_comp_general'];
    expect(entry.category).toBe('music');
    expect(entry.loop).toBe(true);
  });
});
