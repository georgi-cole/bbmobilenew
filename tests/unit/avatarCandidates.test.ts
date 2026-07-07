import { describe, expect, it } from 'vitest';
import { resolveAvatarCandidates } from '../../src/utils/avatar';

describe('resolveAvatarCandidates', () => {
  it('prefers an explicit Lia avatar path before any scanned avatar asset', () => {
    const candidates = resolveAvatarCandidates({
      id: 'lia',
      name: 'Lia',
      avatar: 'assets/skins/Lia_avatar.webp',
    });

    expect(candidates[0]).toContain('assets/skins/Lia_avatar.webp');
  });

  it('does not fuzzy-match Lia to the combined Lia_Ali avatar', () => {
    const candidates = resolveAvatarCandidates({
      id: 'lia',
      name: 'Lia',
      avatar: 'assets/skins/Lia_avatar.webp',
    });

    expect(candidates[0]).not.toContain('Lia_Ali_avatar');
  });
});
