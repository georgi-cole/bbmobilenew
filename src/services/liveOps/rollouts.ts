import type { RemoteConfig } from '../../remoteConfig/remoteConfigTypes';

const INSTALL_SEED_KEY = 'bbmobilenew:liveops:install-seed';

function getInstallSeed(): string {
  try {
    const existing = localStorage.getItem(INSTALL_SEED_KEY);
    if (existing) return existing;
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    const created = Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
    localStorage.setItem(INSTALL_SEED_KEY, created);
    return created;
  } catch {
    return 'ephemeral-install';
  }
}

/** Stable FNV-1a assignment. The seed remains on-device and is never transmitted. */
export function getRolloutBucket(seed: string, key: string, salt = ''): number {
  let hash = 0x811c9dc5;
  for (const char of `${key}:${salt}:${seed}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isRefinedGameChromeEnabled(config: RemoteConfig | null, seed = getInstallSeed()): boolean {
  if (config?.operations?.killSwitches?.refinedGameChrome) return false;
  const rollout = config?.operations?.rollouts?.refinedGameChrome;
  // The refined chrome is now the shipped experience. A rollout remains
  // available for deliberate experiments, but missing/disabled configuration
  // must not silently restore the legacy interface in production.
  if (!rollout?.enabled) return true;
  const percentage = Math.max(0, Math.min(100, rollout.percentage ?? 0));
  return getRolloutBucket(seed, 'refined-game-chrome', rollout.salt) < percentage;
}

/** Resolve the shipped variant, with an explicit URL override for comparison. */
export function resolveRefinedGameChrome(
  config: RemoteConfig | null,
  search: string,
  seed?: string,
): boolean {
  const requestedVariant = new URLSearchParams(search).get('uiVariant');
  if (requestedVariant === 'refined') return true;
  if (requestedVariant === 'control') return false;
  return isRefinedGameChromeEnabled(config, seed);
}
