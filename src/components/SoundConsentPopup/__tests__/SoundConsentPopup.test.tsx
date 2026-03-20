/**
 * Tests for SoundConsentPopup — hub music autostart consent modal.
 *
 * Covers:
 *  1. Renders "Enable sounds" and "Not now" buttons
 *  2. "Enable sounds" calls onEnable
 *  3. "Not now" calls onDismiss without persisting to localStorage
 *  4. "Enable sounds" with "Remember" checked persists consent to localStorage
 *  5. "Enable sounds" without "Remember" checked does NOT persist
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SoundConsentPopup, { HUB_MUSIC_CONSENT_KEY } from '../SoundConsentPopup';

describe('SoundConsentPopup', () => {
  beforeEach(() => {
    localStorage.removeItem(HUB_MUSIC_CONSENT_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(HUB_MUSIC_CONSENT_KEY);
    vi.restoreAllMocks();
  });

  it('renders the popup with enable and dismiss buttons', () => {
    render(<SoundConsentPopup onEnable={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('Enable sounds')).toBeDefined();
    expect(screen.getByText('Not now')).toBeDefined();
    expect(screen.getByText('Enable sounds?')).toBeDefined();
  });

  it('calls onEnable when "Enable sounds" is clicked', () => {
    const onEnable = vi.fn();
    render(<SoundConsentPopup onEnable={onEnable} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText('Enable sounds'));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when "Not now" is clicked', () => {
    const onDismiss = vi.fn();
    render(<SoundConsentPopup onEnable={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Not now'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('"Not now" does NOT persist anything to localStorage (Option B)', () => {
    render(<SoundConsentPopup onEnable={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText('Not now'));
    expect(localStorage.getItem(HUB_MUSIC_CONSENT_KEY)).toBeNull();
  });

  it('"Enable sounds" without "Remember" does NOT persist to localStorage', () => {
    render(<SoundConsentPopup onEnable={() => {}} onDismiss={() => {}} />);
    // Do NOT tick the remember checkbox
    fireEvent.click(screen.getByText('Enable sounds'));
    expect(localStorage.getItem(HUB_MUSIC_CONSENT_KEY)).toBeNull();
  });

  it('"Enable sounds" with "Remember" checked persists "granted" to localStorage', () => {
    render(<SoundConsentPopup onEnable={() => {}} onDismiss={() => {}} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox); // tick "Remember my choice"
    fireEvent.click(screen.getByText('Enable sounds'));
    expect(localStorage.getItem(HUB_MUSIC_CONSENT_KEY)).toBe('granted');
  });
});
