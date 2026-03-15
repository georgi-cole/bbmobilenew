/**
 * Crypto-based RNG helpers for the Risk Wheel UI.
 *
 * Uses window.crypto.getRandomValues for high-quality, non-reproducible
 * randomness. Appropriate for all interactive (non-test) spins so that
 * each session is unpredictable regardless of seed state.
 */

/**
 * Returns a cryptographically random float in [0, 1).
 * Falls back to Math.random() in environments without crypto (e.g. old Node).
 */
export function cryptoRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

/**
 * Pick one sector from `sectors` using a single cryptoRandom() draw.
 * Each call is independent — no shared state between invocations.
 */
export function spinOnceCrypto<T>(sectors: readonly T[]): T {
  const idx = Math.floor(cryptoRandom() * sectors.length);
  return sectors[idx];
}

/**
 * Simulate a fair coin flip using cryptoRandom().
 * Returns `true` with probability 0.5.
 */
export function coinFlipCrypto(): boolean {
  return cryptoRandom() < 0.5;
}

/**
 * Generate a non-zero 32-bit unsigned random seed suitable for seeding
 * a deterministic PRNG (e.g. mulberry32).
 */
export function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    buf[0] = (Math.random() * 0x100000000) >>> 0;
  }
  // Ensure non-zero so mulberry32 doesn't degenerate.
  return (buf[0] || 1) >>> 0;
}
