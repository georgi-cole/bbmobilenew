import { describe, expect, it } from 'vitest';
import { getLocalAvatarFallback, resolveAvatar, resolveAvatarCandidates } from '../../src/utils/avatar';

describe('resolveAvatarCandidates', () => {
  it('uses the bundled player image without requesting speculative custom-name assets', () => {
    const player = { id: 'guest-1', name: 'You', avatar: '', isUser: true } as const;
    const candidates = resolveAvatarCandidates(player);
    const fallback = getLocalAvatarFallback(player.name, true);

    expect(candidates).toEqual([fallback]);
    expect(fallback).toContain('assets/skins/You.png');
    expect(resolveAvatar(player)).toBe(fallback);
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
