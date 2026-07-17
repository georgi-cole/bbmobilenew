import { describe, expect, it } from 'vitest';
import { getRolloutBucket, isRefinedGameChromeEnabled } from '../../src/services/liveOps/rollouts';

describe('live operations rollouts', () => {
  it('assigns the same install to the same bucket', () => {
    expect(getRolloutBucket('install-a', 'chrome', 'v1')).toBe(getRolloutBucket('install-a', 'chrome', 'v1'));
  });

  it('supports complete rollout and complete rollback', () => {
    expect(isRefinedGameChromeEnabled({
      operations: { rollouts: { refinedGameChrome: { enabled: true, percentage: 100 } } },
    }, 'install-a')).toBe(true);
    expect(isRefinedGameChromeEnabled({
      operations: { rollouts: { refinedGameChrome: { enabled: true, percentage: 0 } } },
    }, 'install-a')).toBe(false);
  });

  it('gives the emergency kill switch priority', () => {
    expect(isRefinedGameChromeEnabled({
      operations: {
        killSwitches: { refinedGameChrome: true },
        rollouts: { refinedGameChrome: { enabled: true, percentage: 100 } },
      },
    }, 'install-a')).toBe(false);
  });
});
