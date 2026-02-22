/**
 * Tests for src/utils/displayMode.ts
 *
 * Verifies that applyDisplayModeClasses() correctly sets/omits the three
 * CSS classes on document.documentElement based on the environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyDisplayModeClasses } from '../src/utils/displayMode';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

/** Replace window.matchMedia with a stub that always returns `matches`. */
function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn(() => makeMediaQueryList(matches)),
    configurable: true,
    writable: true,
  });
}

/** Replace navigator.userAgent. */
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
    writable: true,
  });
}

const originalUA = navigator.userAgent;

function restoreUserAgent() {
  Object.defineProperty(navigator, 'userAgent', {
    value: originalUA,
    configurable: true,
    writable: true,
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('applyDisplayModeClasses', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('is-standalone', 'is-webkit', 'is-chrome-android');
    restoreUserAgent();
    mockMatchMedia(false); // default: not standalone
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('is-standalone', 'is-webkit', 'is-chrome-android');
    restoreUserAgent();
  });

  // ── is-standalone ────────────────────────────────────────────────────────

  it('adds is-standalone when display-mode:standalone media matches', () => {
    mockMatchMedia(true);

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-standalone')).toBe(true);
  });

  it('adds is-standalone when navigator.standalone is true', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-standalone')).toBe(true);

    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  });

  it('does NOT add is-standalone in a normal browser context', () => {
    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-standalone')).toBe(false);
  });

  // ── is-webkit ────────────────────────────────────────────────────────────

  it('adds is-webkit for a Safari macOS UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-webkit')).toBe(true);
  });

  it('adds is-webkit for an iOS Safari UA', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-webkit')).toBe(true);
  });

  it('does NOT add is-webkit for Chrome desktop UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-webkit')).toBe(false);
  });

  it('does NOT add is-webkit for Firefox UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-webkit')).toBe(false);
  });

  it('does NOT add is-webkit for Edge UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.65',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-webkit')).toBe(false);
  });

  // ── is-chrome-android ────────────────────────────────────────────────────

  it('adds is-chrome-android for Chrome on Android UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.86 Mobile Safari/537.36',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-chrome-android')).toBe(true);
  });

  it('does NOT add is-chrome-android for Chrome on desktop', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    );

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-chrome-android')).toBe(false);
  });

  it('adds is-chrome-android for Samsung Browser (contains Chrome/ + Android)', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
    );

    applyDisplayModeClasses();

    // Samsung Browser UA contains both "Chrome/" and "Android"; our regex matches it.
    expect(document.documentElement.classList.contains('is-chrome-android')).toBe(true);
  });

  // ── Multiple classes at once ─────────────────────────────────────────────

  it('sets is-standalone and is-chrome-android together on Android PWA', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.86 Mobile Safari/537.36',
    );
    mockMatchMedia(true);

    applyDisplayModeClasses();

    expect(document.documentElement.classList.contains('is-standalone')).toBe(true);
    expect(document.documentElement.classList.contains('is-chrome-android')).toBe(true);
    expect(document.documentElement.classList.contains('is-webkit')).toBe(false);
  });
});
