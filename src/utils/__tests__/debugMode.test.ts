import { afterEach, describe, expect, it } from 'vitest';
import {
  DEBUG_ACCESS_STORAGE_KEY,
  canAccessSpecialSettings,
  detectDebugMode,
  isDebugAccessGranted,
  persistDebugAccess,
  revokeDebugAccess,
} from '../debugMode';

describe('debugMode gating', () => {
  afterEach(() => {
    delete (window as { __E2E__?: boolean }).__E2E__;
    localStorage.removeItem(DEBUG_ACCESS_STORAGE_KEY);
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

  it('keeps remote QA sessions on normal gameplay choreography', () => {
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
    ).toBe(false);
  });

  it('keeps hash-router remote QA sessions on normal gameplay choreography', () => {
    expect(
      detectDebugMode({
        hostname: 'georgi-cole.github.io',
        search: '',
        hash: '#/game?debug=1&qa=1',
      } as unknown as Location),
    ).toBe(false);
  });

  it('opens the advanced settings route with the same qa debug hash flags', () => {
    expect(
      canAccessSpecialSettings({
        hostname: 'georgi-cole.github.io',
        search: '',
        hash: '#/game?debug=1&qa=1',
      } as unknown as Location),
    ).toBe(true);
  });

  it('keeps advanced settings locked on production without qa', () => {
    expect(
      canAccessSpecialSettings({
        hostname: 'georgi-cole.github.io',
        search: '',
        hash: '#/game?debug=1',
      } as unknown as Location),
    ).toBe(false);
  });

  it('treats localhost as an allowed gameplay debug host', () => {
    const searchParams = new URLSearchParams('debug=1');

    expect(isDebugAccessGranted(searchParams, 'localhost')).toBe(true);
    expect(isDebugAccessGranted(searchParams, 'georgi-cole.github.io')).toBe(false);
    expect(
      detectDebugMode({
        hostname: 'localhost',
        search: '?debug=1',
        hash: '',
      } as unknown as Location),
    ).toBe(true);
  });

  it('still grants the remote QA panel and special-settings access', () => {
    const searchParams = new URLSearchParams('debug=1&qa=1');

    expect(isDebugAccessGranted(searchParams, 'georgi-cole.github.io')).toBe(true);
    expect(
      canAccessSpecialSettings({
        hostname: 'georgi-cole.github.io',
        search: '?debug=1&qa=1',
        hash: '',
      } as unknown as Location),
    ).toBe(true);
  });

  it('persists an explicitly enabled QA session across route navigation', () => {
    persistDebugAccess();

    expect(isDebugAccessGranted(new URLSearchParams(), 'georgi-cole.github.io')).toBe(true);
    expect(
      canAccessSpecialSettings({
        hostname: 'georgi-cole.github.io',
        search: '',
        hash: '#/settings',
      } as unknown as Location),
    ).toBe(true);

    revokeDebugAccess();
    expect(isDebugAccessGranted(new URLSearchParams(), 'georgi-cole.github.io')).toBe(false);
  });
});
