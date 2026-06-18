import { afterEach, describe, expect, it } from 'vitest';
import { detectDebugMode, isDebugAccessGranted } from '../debugMode';

describe('debugMode gating', () => {
  afterEach(() => {
    delete (window as { __E2E__?: boolean }).__E2E__;
  });

  it('allows e2e sessions regardless of host or query string', () => {
    (window as { __E2E__?: boolean }).__E2E__ = true;

    expect(
      detectDebugMode({
        hostname: 'example.com',
        search: '',
        hash: '',
      } as unknown as Location),
    ).toBe(true);
  });

  it('requires qa=1 on production hosts', () => {
    expect(
      detectDebugMode({
        hostname: 'georgi-cole.github.io',
        search: '?debug=1',
        hash: '',
      } as unknown as Location),
    ).toBe(false);

    expect(
      detectDebugMode({
        hostname: 'georgi-cole.github.io',
        search: '?debug=1&qa=1',
        hash: '',
      } as unknown as Location),
    ).toBe(true);
  });

  it('accepts hash-router qa flags', () => {
    expect(
      detectDebugMode({
        hostname: 'georgi-cole.github.io',
        search: '',
        hash: '#/game?debug=1&qa=1',
      } as unknown as Location),
    ).toBe(true);
  });

  it('treats localhost as an allowed debug host', () => {
    const searchParams = new URLSearchParams('debug=1');

    expect(isDebugAccessGranted(searchParams, 'localhost')).toBe(true);
    expect(isDebugAccessGranted(searchParams, 'georgi-cole.github.io')).toBe(false);
  });
});
