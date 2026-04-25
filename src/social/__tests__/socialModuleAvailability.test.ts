import { describe, expect, it } from 'vitest';
import {
  getBlockedSocialModuleAnnouncementMessage,
  getSocialModuleAvailability,
  SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE,
  SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE,
} from '../socialModuleAvailability';

describe('socialModuleAvailability', () => {
  it('returns null announcement text when social modules can open', () => {
    const availability = getSocialModuleAvailability({
      phase: 'social_1',
      players: [{ id: 'user', isUser: true, status: 'active' }],
    });

    expect(getBlockedSocialModuleAnnouncementMessage(availability)).toBeNull();
  });

  it('returns the out-of-house announcement for evicted or jury players', () => {
    const evictedAvailability = getSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'user', isUser: true, status: 'evicted' }],
    });
    const juryAvailability = getSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'user', isUser: true, status: 'jury' }],
    });

    expect(getBlockedSocialModuleAnnouncementMessage(evictedAvailability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE,
    );
    expect(getBlockedSocialModuleAnnouncementMessage(juryAvailability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE,
    );
  });

  it('returns the out-of-house announcement when no human player exists', () => {
    const availability = getSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'ai-1', isUser: false, status: 'active' }],
    });

    expect(getBlockedSocialModuleAnnouncementMessage(availability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE,
    );
  });

  it('returns the in-game blocked announcement for blocked voting phases', () => {
    const availability = getSocialModuleAvailability({
      phase: 'live_vote',
      players: [{ id: 'user', isUser: true, status: 'active' }],
    });

    expect(getBlockedSocialModuleAnnouncementMessage(availability)).toBe(
      SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE,
    );
  });
});
