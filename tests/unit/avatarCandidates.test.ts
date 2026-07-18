import { describe, expect, it } from 'vitest';
import { getLocalAvatarFallback, resolveAvatar, resolveAvatarCandidates } from '../../src/utils/avatar';

describe('resolveAvatarCandidates', () => {
  it('preserves the user identity and ends with a bundled fallback', () => {
    const player = { id: 'guest-1', name: 'You', avatar: '', isUser: true } as const;
    const candidates = resolveAvatarCandidates(player);

    expect(candidates.at(-1)).toContain('assets/skins/You.png');
    expect(resolveAvatar(player)).toBe(candidates[0]);
  });

  it('provides an offline-safe initials fallback for houseguests', () => {
    expect(getLocalAvatarFallback('Nova Ray')).toMatch(/^data:image\/svg\+xml,/);
  });

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
