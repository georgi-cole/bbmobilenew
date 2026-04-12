import { describe, expect, it } from 'vitest';
import {
  SCENARIO_VARIANT_POOLS,
  VOICE_ARCHETYPES,
  getVoiceProfile,
  pickVariantText,
  type VariantFamily,
} from '../interactionVariantBank';

// ── Voice profile tests ────────────────────────────────────────────────────

describe('getVoiceProfile', () => {
  it('returns a valid archetype for any actor ID', () => {
    for (const id of ['alice', 'bob', 'rae', 'nova', 'finn']) {
      const profile = getVoiceProfile(id);
      expect(VOICE_ARCHETYPES).toContain(profile);
    }
  });

  it('is deterministic: same ID always returns the same profile', () => {
    const id = 'test_actor_stable';
    expect(getVoiceProfile(id)).toBe(getVoiceProfile(id));
  });

  it('produces variation across different IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const profiles = new Set(ids.map((id) => getVoiceProfile(id)));
    // At least two different profiles across 12 different IDs.
    expect(profiles.size).toBeGreaterThan(1);
  });
});

// ── Variant pool tests ─────────────────────────────────────────────────────

describe('SCENARIO_VARIANT_POOLS', () => {
  const scenarioKeys = [
    'week_start_ally_check_in',
    'week_start_enemy_gossip',
    'week_start_alliance_lock',
    'hoh_congratulations',
    'hoh_safety_request',
    'nominee_hoh_plea',
    'nominee_veto_pitch',
    'nominee_campaign',
    'nomination_aftershock',
    'post_veto_gratitude',
    'post_veto_campaign',
    'live_vote_pitch',
    'survivor_gratitude',
    'betrayal_warning',
    'ignored_warning',
    'targeted_snark',
    'alliance_reassurance',
    'generic_gossip',
    'generic_check_in',
  ];

  it.each(scenarioKeys)('has at least 3 families for scenario "%s"', (key) => {
    const families = SCENARIO_VARIANT_POOLS[key];
    expect(families).toBeDefined();
    expect(families.length).toBeGreaterThanOrEqual(3);
  });

  it.each(scenarioKeys)('each family for "%s" has at least 3 variants', (key) => {
    const families = SCENARIO_VARIANT_POOLS[key];
    for (const family of families) {
      expect(family.variants.length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(scenarioKeys)('each family for "%s" has a non-empty unique id', (key) => {
    const families = SCENARIO_VARIANT_POOLS[key];
    const ids = families.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeTruthy();
    }
  });

  it('each scenario has at least one follow-up family', () => {
    for (const key of scenarioKeys) {
      const families = SCENARIO_VARIANT_POOLS[key];
      const hasFollowUp = families.some((f) => f.isFollowUp === true);
      expect(hasFollowUp).toBe(true);
    }
  });

  it('variant texts are non-empty strings', () => {
    for (const key of Object.keys(SCENARIO_VARIANT_POOLS)) {
      const families = SCENARIO_VARIANT_POOLS[key];
      for (const family of families) {
        for (const variant of family.variants) {
          expect(typeof variant.text).toBe('string');
          expect(variant.text.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ── pickVariantText tests ──────────────────────────────────────────────────

function buildFamilies(overrides: Partial<VariantFamily>[] = []): VariantFamily[] {
  const base: VariantFamily[] = [
    {
      id: 'fam_a',
      voiceTags: ['direct', 'strategic'],
      variants: [
        { text: 'Direct line one.', voiceTags: ['direct'] },
        { text: 'Direct line two.', voiceTags: ['strategic'] },
        { text: 'Direct line three.', voiceTags: ['direct', 'strategic'] },
      ],
    },
    {
      id: 'fam_b',
      voiceTags: ['emotional', 'soft'],
      variants: [
        { text: 'Emotional line one.', voiceTags: ['emotional'] },
        { text: 'Emotional line two.', voiceTags: ['soft'] },
        { text: 'Emotional line three.', voiceTags: ['emotional', 'soft'] },
      ],
    },
    {
      id: 'fam_c',
      voiceTags: ['indirect', 'playful'],
      isFollowUp: true,
      variants: [
        { text: 'Follow-up line one.', voiceTags: ['indirect'] },
        { text: 'Follow-up line two.', voiceTags: ['playful'] },
        { text: 'Follow-up line three.', voiceTags: ['indirect', 'playful'] },
      ],
    },
  ];
  return base.map((family, i) => ({ ...family, ...(overrides[i] ?? {}) }));
}

describe('pickVariantText', () => {
  it('returns a non-empty text and a family id', () => {
    const families = buildFamilies();
    const profile = { primary: ['direct' as const], secondary: ['strategic' as const] };
    const { text, familyId } = pickVariantText(families, profile, new Set(), 0, () => 0);
    expect(text.length).toBeGreaterThan(0);
    expect(familyId).toBeTruthy();
  });

  it('prefers voice-matched families', () => {
    const families = buildFamilies();
    const directProfile = { primary: ['direct' as const], secondary: ['strategic' as const] };
    const { familyId } = pickVariantText(families, directProfile, new Set(), 0, () => 0);
    expect(familyId).toBe('fam_a');
  });

  it('prefers follow-up families when repeatCount > 0', () => {
    const families = buildFamilies();
    // Use a neutral profile so the follow-up is not excluded by voice mismatch.
    const neutralProfile = { primary: ['composed' as const], secondary: ['indirect' as const] };
    const { familyId } = pickVariantText(families, neutralProfile, new Set(), 1, () => 0);
    expect(familyId).toBe('fam_c');
  });

  it('avoids recently used families', () => {
    const families = buildFamilies();
    // fam_a is the best voice match; exclude it from recents.
    const directProfile = { primary: ['direct' as const], secondary: ['strategic' as const] };
    const recentFamilyIds = new Set(['fam_a']);
    const { familyId } = pickVariantText(families, directProfile, recentFamilyIds, 0, () => 0);
    expect(familyId).not.toBe('fam_a');
  });

  it('falls back gracefully when all families are in recentFamilyIds', () => {
    const families = buildFamilies();
    const profile = { primary: ['direct' as const], secondary: [] };
    const recentFamilyIds = new Set(['fam_a', 'fam_b', 'fam_c']);
    const { text, familyId } = pickVariantText(families, profile, recentFamilyIds, 0, () => 0);
    expect(text.length).toBeGreaterThan(0);
    expect(familyId).toBeTruthy();
  });

  it('returns fallback when family list is empty', () => {
    const profile = { primary: ['direct' as const], secondary: [] };
    const { text, familyId } = pickVariantText([], profile, new Set(), 0, () => 0);
    expect(text).toBe('We need to talk.');
    expect(familyId).toBe('fallback');
  });

  it('is deterministic with a fixed rng', () => {
    const families = buildFamilies();
    const profile = { primary: ['emotional' as const], secondary: ['soft' as const] };
    const result1 = pickVariantText(families, profile, new Set(), 0, () => 0);
    const result2 = pickVariantText(families, profile, new Set(), 0, () => 0);
    expect(result1.text).toBe(result2.text);
    expect(result1.familyId).toBe(result2.familyId);
  });

  it('produces variety across different rng values', () => {
    const families = buildFamilies();
    const profile = { primary: ['direct' as const], secondary: ['emotional' as const] };
    const texts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const rng = () => i / 20;
      const { text } = pickVariantText(families, profile, new Set(), 0, rng);
      texts.add(text);
    }
    // Should produce more than 1 distinct text across 20 different RNG seeds.
    expect(texts.size).toBeGreaterThan(1);
  });
});

// ── Integration: nominee_hoh_plea contains {hoh} in first family's first variant ──

describe('nominee_hoh_plea first variant contains {hoh}', () => {
  it('first family, first variant references the HOH token', () => {
    const families = SCENARIO_VARIANT_POOLS['nominee_hoh_plea'];
    expect(families).toBeDefined();
    const firstVariant = families[0]?.variants[0];
    expect(firstVariant?.text).toContain('{hoh}');
  });

  it('all variants across all families reference the {hoh} token', () => {
    // Every phrasing in a HOH plea should address the HOH directly.
    const families = SCENARIO_VARIANT_POOLS['nominee_hoh_plea'];
    for (const family of families) {
      for (const variant of family.variants) {
        expect(variant.text).toContain('{hoh}');
      }
    }
  });
});
