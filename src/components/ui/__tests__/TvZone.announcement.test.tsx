/**
 * Tests for TvZone announcement overlay integration.
 *
 * Covers:
 *  1. TvZone shows TvAnnouncementOverlay when latest event has a major key.
 *  2. Overlay's info button opens the TvAnnouncementModal.
 *  3. 'tv:announcement-dismiss' event dismisses active announcements.
 *  4. Auto-dismiss announcements do NOT show a Continue FAB.
 *  5. TVLog is used with maxVisible=2 suppressing the main TV message.
 *  6. No overlay shown when event has no recognised major key.
 *  7. Stale overlay is cleared when a new non-major event arrives.
 *  8. Modal stays open after overlay dismisses (independent key tracking).
 *  9. Auto-dismiss onDismiss fires at completion; no visible progress bar.
 * 10. Countdown pauses on hover/focus and resumes on leave/blur.
 * 11. Phase-based triggers: overlay shown on phase transition to popup phases.
 * 12. Phase-based non-triggers: week_start, loh_comp, pos_comp show no overlay.
 * 13. New pre-comp announcement phases: loh_comp_announcement and pos_comp_announcement show overlays.
 */

import React, { type ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as testingLibraryRender, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router';
import gameReducer, {
  activateDemocracia,
  activateDoubleEviction,
  addTvEvent,
  consumeBroadcastEvent,
  setPhase,
  updatePlayer,
} from '../../../store/gameSlice';
import socialReducer from '../../../social/socialSlice';
import profilesReducer from '../../../store/profilesSlice';
import challengeReducer from '../../../store/challengeSlice';
import { LIVE_VOTE_PITCHES_EVENT_KEY, LIVE_VOTE_PITCHES_TEXT } from '../../../constants/tvEvents';
import finaleReducer from '../../../store/finaleSlice';
import settingsReducer from '../../../store/settingsSlice';
import TvZone from '../TvZone';
import TvAnnouncementOverlay from '../TvAnnouncementOverlay/TvAnnouncementOverlay';
import TvAnnouncementModal from '../TvAnnouncementModal/TvAnnouncementModal';
import type { Player, TvEvent } from '../../../types';
import { I18nContext, type I18nContextValue } from '../../../i18n/I18nContext';
import { translate } from '../../../i18n/messages';

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value) => String(value),
  formatDate: (value) => String(value),
};

function render(ui: React.ReactNode) {
  return testingLibraryRender(<I18nContext.Provider value={TEST_I18N}>{ui}</I18nContext.Provider>);
}

// ── Store helpers ─────────────────────────────────────────────────────────────

function makeStore() {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
    },
  });
  // These integration tests inject their own event/phase under test. Clear the
  // real Season Start playback queue so it cannot mask that fixture.
  for (const id of store.getState().game.broadcastQueue ?? []) {
    store.dispatch(consumeBroadcastEvent(id));
  }
  return store;
}

function makeStoreWithSettings() {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      settings: settingsReducer,
    },
  });
  for (const id of store.getState().game.broadcastQueue ?? []) {
    store.dispatch(consumeBroadcastEvent(id));
  }
  return store;
}

function renderTvZone(
  store: ReturnType<typeof makeStore>,
  props?: ComponentProps<typeof TvZone>,
) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TvZone {...props} />
      </MemoryRouter>
    </Provider>,
  );
}

function makeEvent(overrides: Partial<TvEvent> & Pick<TvEvent, 'id' | 'text'>): TvEvent {
  return { type: 'game', timestamp: Date.now(), ...overrides };
}

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'nominated',
  };
}

const POST_DISMISS_SETTLE_MS = 400;
const SHOCK_INTRO_SETTLE_MS = 2320;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TvZone — announcement overlay', () => {
  beforeEach(() => {
    // Suppress RAF scheduling in jsdom so auto-dismiss timers don't fire
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the overlay when the latest event has meta.major set to a recognised key', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-1',
            text: 'The nominations are set.',
            meta: { major: 'nomination_ceremony' },
          }),
        ),
      );
    });

    // Overlay should be visible with the correct title
    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
  });

  it('renders the public save reveal inside the main tv viewport', () => {
    const store = makeStore();
    const nominees = [
      makePlayer('p1', 'Blue'),
      makePlayer('p2', 'Kian'),
      makePlayer('p3', 'Georgi'),
    ];

    renderTvZone(store, {
      publicSaveReveal: {
        nominees,
        approvals: { p1: 42, p2: 43, p3: 50 },
        savedId: 'p3',
      },
      onPublicSaveDone: vi.fn(),
    });

    const viewport = document.querySelector('.tv-zone__viewport');
    const reveal = document.querySelector('.tv-zone__viewport .psr');

    expect(viewport).toBeTruthy();
    expect(reveal).toBeTruthy();
    expect(screen.getByText('Public Save')).toBeTruthy();
  });

  it('clears the previous viewport message while the public save reveal is active', () => {
    const store = makeStore();
    const nominees = [
      makePlayer('p1', 'Blue'),
      makePlayer('p2', 'Kian'),
      makePlayer('p3', 'Georgi'),
    ];

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-public-save',
            text: "The final list of nominees today will be decided with the public's help.",
          }),
        ),
      );
    });

    renderTvZone(store, {
      publicSaveReveal: {
        nominees,
        approvals: { p1: 42, p2: 43, p3: 50 },
        savedId: 'p3',
      },
      onPublicSaveDone: vi.fn(),
    });

    expect(document.querySelector('.tv-zone__now')).toHaveStyle({ opacity: '0' });
  });

  it('keeps a critical game result on the faux TV until Play dismisses it', () => {
    const store = makeStore();

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'critical-nomination-result',
            text: 'Lia is nominated with 6 votes. Ivy is nominated with 4 votes.',
            meta: { week: 1, broadcastPriority: 'critical' },
          }),
        ),
      );
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'later-social-beat',
            text: 'A conversation is unfolding in the kitchen.',
            meta: { week: 1 },
          }),
        ),
      );
    });

    renderTvZone(store);

    expect(document.querySelector('.tv-zone__now')?.textContent).toContain(
      'Lia is nominated with 6 votes',
    );

    let playWasAccepted = true;
    act(() => {
      playWasAccepted = window.dispatchEvent(
        new CustomEvent('ui:playPressed', { cancelable: true }),
      );
    });

    expect(playWasAccepted).toBe(false);

    expect(document.querySelector('.tv-zone__now')?.textContent).toContain(
      'A conversation is unfolding in the kitchen',
    );
  });

  it('does not replay a dismissed critical major broadcast as ordinary TV copy', () => {
    vi.useFakeTimers();
    const store = makeStore();

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'vox-final-three-result',
            text: 'Ash has final immunity. Zed and Ivy now face the audience.',
            meta: {
              week: 1,
              major: 'vox_final3_result',
              broadcastPriority: 'critical',
              announcementTitle: 'FINAL IMMUNITY: ASH',
              announcementSubtitle: 'Ash is safe. Zed and Ivy face the audience.',
            },
          }),
        ),
      );
    });

    renderTvZone(store);

    expect(screen.getByRole('dialog', { name: /Announcement: FINAL IMMUNITY: ASH/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }));
      vi.advanceTimersByTime(POST_DISMISS_SETTLE_MS);
    });

    expect(document.querySelector('.tv-zone__now')?.textContent).not.toContain(
      'Ash has final immunity. Zed and Ivy now face the audience.',
    );
    expect(document.body.textContent).not.toContain('Welcome to The Big Eye – AI Edition');
    vi.useRealTimers();
  });

  it('uses the Final 4 result copy instead of repeating the generic rules card', () => {
    const store = makeStore();

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'vox-final-four-result',
            text: 'Quinn wins the Final 4 competition, but there is no immunity today.',
            meta: {
              week: 10,
              major: 'vox_final4_immunity_comp',
              broadcastPriority: 'critical',
            },
          }),
        ),
      );
    });

    renderTvZone(store);

    const resultCard = screen.getByRole('dialog', {
      name: /Announcement: Quinn Wins the Final 4 Competition/i,
    });
    expect(resultCard).toBeDefined();
    expect(resultCard.textContent).toContain('There is no immunity today');
    expect(
      screen.queryByRole('dialog', { name: /^Announcement: Final 4 Competition$/i }),
    ).toBeNull();
  });

  it('keeps the finale-ready call to action on screen until its own Play press', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'vox-finale-ready',
            text: 'Ready for the Finale? Make your move.',
            meta: {
              week: 1,
              major: 'vox_populi_finale_ready',
              broadcastPriority: 'critical',
            },
          }),
        ),
      );
    });
    renderTvZone(store);

    expect(
      screen.getByRole('dialog', { name: 'Announcement: Ready for the Finale?' }),
    ).toBeDefined();

    let playWasAccepted = false;
    act(() => {
      playWasAccepted = window.dispatchEvent(
        new CustomEvent('ui:playPressed', { cancelable: true }),
      );
    });

    expect(playWasAccepted).toBe(false);
    expect(
      screen.queryByRole('dialog', { name: 'Announcement: Ready for the Finale?' }),
    ).toBeNull();
  });

  it('drops an obsolete Final 3 vote warning after the Final 2 has formed', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'stale-final-three-warning',
            text: 'Ash has final immunity. The audience must eliminate Zed or Ivy.',
            meta: {
              week: 1,
              major: 'vox_populi_final_three_vote',
              broadcastPriority: 'critical',
            },
          }),
        ),
      );
    });
    renderTvZone(store);

    expect(
      screen.queryByRole('dialog', { name: 'Announcement: The Final Three Verdict' }),
    ).toBeNull();
    expect(document.querySelector('.tv-zone__now')?.textContent).not.toContain(
      'Ash has final immunity',
    );
  });

  it('streams Detox safety beats on the main TV before the final nominee message', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'detox-decision',
            text: 'Aria has decided to use Detox. ⚡',
            meta: { sequence: 'detox_safety' },
          }),
        ),
      );
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'detox-clear',
            text: 'Aria used Detox and cleared Aria and Ivy from the block! ⚡',
            meta: { sequence: 'detox_safety' },
          }),
        ),
      );
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'detox-final',
            text: 'Aria named Echo and Georgi as the new nominees. ⚡',
            meta: { sequence: 'detox_safety' },
          }),
        ),
      );
    });

    const nowMessage = () => document.querySelector('.tv-zone__now')?.textContent;
    expect(nowMessage()).toBe('Aria has decided to use Detox. ⚡');
    expect(screen.getByLabelText('Game action zone').className).toContain('tv-zone--detox-stream');
    expect(document.body.classList.contains('body--shock-active')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(nowMessage()).toBe('Aria used Detox and cleared Aria and Ivy from the block! ⚡');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(nowMessage()).toBe('Aria named Echo and Georgi as the new nominees. ⚡');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByLabelText('Game action zone').className).not.toContain('tv-zone--detox-stream');
    vi.useRealTimers();
  });

  it('renders the vote results reveal inside the main tv viewport', () => {
    const store = makeStore();
    const nominees = [
      makePlayer('p1', 'Blue'),
      makePlayer('p2', 'Kian'),
    ];

    renderTvZone(store, {
      voteResultsReveal: {
        nominees: [
          { nominee: nominees[0], voteCount: 2 },
          { nominee: nominees[1], voteCount: 1 },
        ],
        evictee: nominees[0],
        onDone: vi.fn(),
      },
    });

    const viewport = document.querySelector('.tv-zone__viewport');
    const reveal = document.querySelector('.tv-zone__viewport .avrm');

    expect(viewport).toBeTruthy();
    expect(reveal).toBeTruthy();
    expect(screen.getByLabelText(/vote results/i)).toHaveClass('avrm--tv');
  });

  it('clears the previous viewport message while the vote results reveal is active', () => {
    const store = makeStore();

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-live-vote',
            text: 'Houseguests, the votes are in.',
          }),
        ),
      );
    });

    renderTvZone(store, {
      voteResultsReveal: {
        nominees: [
          { nominee: makePlayer('p1', 'Blue'), voteCount: 2 },
          { nominee: makePlayer('p2', 'Kian'), voteCount: 1 },
        ],
        evictee: makePlayer('p1', 'Blue'),
        onDone: vi.fn(),
      },
    });

    expect(document.querySelector('.tv-zone__now')).toHaveStyle({ opacity: '0' });
  });

  it('dims the surrounding screen while the vote results reveal is active', () => {
    const store = makeStore();
    const tvZoneRect = {
      left: 80,
      top: 120,
      width: 420,
      height: 260,
      right: 500,
      bottom: 380,
      x: 80,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect;

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(tvZoneRect);

    renderTvZone(store, {
      voteResultsReveal: {
        nominees: [
          { nominee: makePlayer('p1', 'Blue'), voteCount: 2 },
          { nominee: makePlayer('p2', 'Kian'), voteCount: 1 },
        ],
        evictee: makePlayer('p1', 'Blue'),
        onDone: vi.fn(),
      },
    });

    expect(screen.getByLabelText('Game action zone')).toHaveClass('tv-zone--live-vote-focus');
    const backdrop = document.body.querySelector('.tv-zone-live-vote-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.querySelector('svg')).not.toBeNull();
    const cutout = backdrop?.querySelector('rect[fill="black"]');
    expect(cutout).not.toBeNull();
    expect(cutout?.getAttribute('x')).toBe('68');
    expect(cutout?.getAttribute('y')).toBe('108');
  });

  it('restores normal brightness for the post-vote summary announcement state', () => {
    const store = makeStore();

    renderTvZone(store, {
      externalAnnouncement: {
        key: 'eviction_vote_result',
        title: 'By a vote of 5 to 4',
        subtitle: 'Blue, your game ends here.',
        isLive: true,
        autoDismissMs: 3000,
      },
    });

    expect(screen.getByLabelText('Game action zone')).not.toHaveClass('tv-zone--live-vote-focus');
    expect(document.body.querySelector('.tv-zone-live-vote-backdrop')).toBeNull();
  });

  it('renders the public save result announcement on the standard screen background', () => {
    const store = makeStore();

    renderTvZone(store, {
      externalAnnouncement: {
        key: 'public_save_result',
        title: 'Public Save Result',
        subtitle: 'Blue was saved by the public.',
        isLive: true,
        autoDismissMs: 3000,
      },
    });

    expect(
      screen.getByRole('dialog', { name: /Announcement: Public Save Result/i }).className,
    ).toContain('tv-announcement--standard');
  });

  it('renders live eviction announcements with the royal purple major-event styling', () => {
    const store = makeStore();

    renderTvZone(store, {
      externalAnnouncement: {
        key: 'live_eviction',
        title: 'Live Elimination',
        subtitle: 'The house votes to eliminate.',
        isLive: true,
        autoDismissMs: 3000,
      },
    });

    expect(
      screen.getByRole('dialog', { name: /Announcement: Live Elimination/i }).className,
    ).toContain('tv-announcement--royal-purple');
    expect(
      screen.getByRole('dialog', { name: /Announcement: Live Elimination/i }).className,
    ).toContain('tv-announcement--theme-eviction');
  });

  it('renders LOH competition announcements with the prestige theme styling', () => {
    render(
      <TvAnnouncementOverlay
        announcement={{
          key: 'loh_comp_announcement',
          title: 'LOH Competition',
          subtitle: 'Power is up for grabs.',
          isLive: true,
          autoDismissMs: null,
        }}
        onInfo={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Announcement: LOH Competition/i }).className).toContain(
      'tv-announcement--theme-loh',
    );
  });

  it('renders POS announcements with the electric competition theme styling', () => {
    render(
      <TvAnnouncementOverlay
        announcement={{
          key: 'pos_comp_announcement',
          title: 'Power of Safety',
          subtitle: "It's time for the Power of Safety competition!",
          isLive: true,
          autoDismissMs: null,
        }}
        onInfo={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Announcement: Power of Safety/i }).className).toContain(
      'tv-announcement--theme-pos',
    );
  });

  it('shows the POS announcement overlay without replaying the public save result', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(setPhase('pos_comp_announcement'));
    });

    expect(screen.getByRole('dialog', { name: /Announcement: Power of Safety/i })).toBeDefined();
    expect(document.querySelector('.tv-zone__now')).toHaveClass('tv-zone__now--hidden');

    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });

    expect(screen.queryByRole('dialog', { name: /Announcement: Power of Safety/i })).toBeNull();
    expect(screen.queryByText(/Blue was saved with 50% of the public support/i)).toBeNull();
  });

  it('keeps the final pitches message hidden once live voting begins', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-final-pitches',
            text: LIVE_VOTE_PITCHES_TEXT,
            type: 'social',
            meta: { key: LIVE_VOTE_PITCHES_EVENT_KEY },
          }),
        ),
      );
      store.dispatch(setPhase('live_vote'));
    });

    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    act(() => { vi.advanceTimersByTime(POST_DISMISS_SETTLE_MS); });

    expect(screen.queryByRole('dialog', { name: /Announcement: Live Elimination/i })).toBeNull();
    expect(document.querySelector('.tv-zone__now')).toHaveStyle({ opacity: '0' });

    vi.useRealTimers();
  });

  it('suppresses the live-vote pitches message by stable event key instead of display copy', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-final-pitches-localized',
            text: 'Housemates give their last plea before voting begins.',
            type: 'social',
            meta: { key: LIVE_VOTE_PITCHES_EVENT_KEY },
          }),
        ),
      );
      store.dispatch(setPhase('live_vote'));
    });

    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    act(() => { vi.advanceTimersByTime(POST_DISMISS_SETTLE_MS); });

    expect(document.querySelector('.tv-zone__now')).toHaveTextContent('Housemates give their last plea before voting begins.');
    expect(document.querySelector('.tv-zone__now')).toHaveStyle({ opacity: '0' });

    vi.useRealTimers();
  });

  it('renders without a settings reducer by falling back to default audio settings', () => {
    const store = makeStore();
    renderTvZone(store);

    expect(screen.getByRole('button', { name: /^Music$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Sound effects$/i })).toBeDefined();
  });

  it('exposes audio toggle pressed states', async () => {
    const user = userEvent.setup();
    const store = makeStoreWithSettings();
    renderTvZone(store);

    const musicButton = screen.getByRole('button', { name: /^Music$/i });
    const sfxButton = screen.getByRole('button', { name: /^Sound effects$/i });
    const getShellSrc = (button: HTMLElement) =>
      button.querySelector<HTMLImageElement>('.top-utility-btn__shell')?.getAttribute('src');
    const getGlyph = (button: HTMLElement) =>
      button.querySelector<HTMLImageElement>('.top-utility-btn__glyph');
    const getScratchSrc = (button: HTMLElement) =>
      button.querySelector<HTMLImageElement>('.top-utility-btn__scratch')?.getAttribute('src');

    expect(musicButton).toHaveAttribute('aria-pressed', 'true');
    expect(sfxButton).toHaveAttribute('aria-pressed', 'true');
    expect(getShellSrc(musicButton)).toContain('/assets/control_dock/top_utility_shell.svg');
    expect(getShellSrc(sfxButton)).toContain('/assets/control_dock/top_utility_shell.svg');
    expect(getGlyph(musicButton)).not.toBeNull();
    expect(getGlyph(sfxButton)).not.toBeNull();
    expect(getScratchSrc(musicButton)).toBeUndefined();
    expect(getScratchSrc(sfxButton)).toBeUndefined();

    await user.click(musicButton);
    await user.click(sfxButton);

    expect(screen.getByRole('button', { name: /^Music$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Music$/i })).toHaveClass('top-utility-btn--inactive');
    expect(getShellSrc(screen.getByRole('button', { name: /^Music$/i }))).toContain('/assets/icons/music_disabled.svg');
    expect(getGlyph(screen.getByRole('button', { name: /^Music$/i }))).toBeNull();
    expect(getScratchSrc(screen.getByRole('button', { name: /^Music$/i }))).toContain('/assets/icons/audio_deactivated_scratch.svg');
    expect(screen.getByRole('button', { name: /^Sound effects$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Sound effects$/i })).toHaveClass('top-utility-btn--inactive');
    expect(getShellSrc(screen.getByRole('button', { name: /^Sound effects$/i }))).toContain('/assets/icons/sound_disabled.svg');
    expect(getGlyph(screen.getByRole('button', { name: /^Sound effects$/i }))).toBeNull();
    expect(getScratchSrc(screen.getByRole('button', { name: /^Sound effects$/i }))).toContain('/assets/icons/audio_deactivated_scratch.svg');
  });

  it('shows the overlay when the latest event has a top-level major field', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-2',
            text: 'The live vote begins.',
            major: 'live_eviction',
          }),
        ),
      );
    });

    expect(screen.getByRole('dialog', { name: /Announcement: Live Elimination/i })).toBeDefined();
  });

  it('shows the Democracia shock overlay when the latest event major is democracia', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-democracia',
            text: 'Democracia takes over the LOH comp.',
            type: 'twist',
            major: 'democracia',
          }),
        ),
      );
    });

    act(() => {
      vi.advanceTimersByTime(SHOCK_INTRO_SETTLE_MS);
    });

    expect(screen.getByRole('dialog', { name: /Announcement: DEMOCRACIA!/i })).toBeDefined();
    vi.useRealTimers();
  });

  it('plays the Tribunal phase shock before revealing the queued day-start message', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(setPhase('week_start'));
      store.dispatch(addTvEvent(makeEvent({
        id: 'tribunal-phase-preroll',
        text: `Congrats all, you've just made it to tribunal. Your voices will crown the winner.`,
        meta: { major: 'tribunal_phase' },
      })));
    });
    const tribunalPrerollId = store.getState().game.tvFeed[0].id;
    act(() => {
      store.dispatch(addTvEvent(makeEvent({
        id: 'tribunal-day-start',
        text: `Day 5 begins! 🏠 It's time for the LOH competition.`,
        meta: { announcementPrerollEventId: tribunalPrerollId },
      })));
    });

    expect(document.body.querySelector('[data-testid="shock-intro-overlay"]')).toBeNull();

    expect(screen.getByRole('dialog', { name: /Congrats all, you've just made it to tribunal/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event('tv:announcement-dismiss'));
      vi.advanceTimersByTime(POST_DISMISS_SETTLE_MS);
    });

    expect(screen.queryByRole('dialog', { name: /made it to tribunal/i })).toBeNull();
    expect(document.querySelector('.tv-zone__now')).toHaveTextContent('Day 5 begins!');
    vi.useRealTimers();
  });

  it('applies the Back 2 the Game styling when the major key is battle_back', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-bb',
            text: 'Back 2 the Game begins.',
            major: 'battle_back',
          }),
        ),
      );
    });

    act(() => {
      vi.advanceTimersByTime(SHOCK_INTRO_SETTLE_MS);
    });

    const overlay = screen.getByRole('dialog', { name: /Announcement: Back 2 the Game/i });
    expect(overlay.className).toContain('tv-announcement--battle-back');
    vi.useRealTimers();
  });

  it('keeps the Back 2 the Game styling for staged twist announcements', () => {
    vi.useFakeTimers();
    const store = makeStore();

    renderTvZone(store, {
      externalAnnouncement: {
        key: 'battle_back_challenge',
        title: 'Back 2 the Game Challenge',
        subtitle: 'Press play to begin.',
        isLive: true,
        autoDismissMs: null,
      },
    });

    act(() => {
      vi.advanceTimersByTime(SHOCK_INTRO_SETTLE_MS);
    });

    const overlay = screen.getByRole('dialog', { name: /Announcement: Back 2 the Game Challenge/i });
    expect(overlay.className).toContain('tv-announcement--battle-back');
    vi.useRealTimers();
  });

  it('falls back to Back 2 the Game styling when a twist event mentions the twist without a major key', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-bb-fallback',
            text: 'Back 2 the Game begins! Evicted houseguests compete for a second chance.',
            type: 'twist',
          }),
        ),
      );
    });

    act(() => {
      vi.advanceTimersByTime(SHOCK_INTRO_SETTLE_MS);
    });

    const overlay = screen.getByRole('dialog', { name: /Announcement: Back 2 the Game/i });
    expect(overlay.className).toContain('tv-announcement--battle-back');
    vi.useRealTimers();
  });

  it('does NOT show the overlay for events without a recognised major key', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({ id: 'ev-3', text: 'Alex grabbed a snack.' }),
        ),
      );
    });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('clears the overlay when a new non-major event arrives after a major event', () => {
    const store = makeStore();
    renderTvZone(store);

    // First: major event shows overlay
    act(() => {
      store.dispatch(
        addTvEvent(makeEvent({ id: 'ev-a', text: 'Noms set.', meta: { major: 'nomination_ceremony' } })),
      );
    });
    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    // Then: non-major event clears overlay
    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'ev-b', text: 'Everyone eats pizza.' })));
    });
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('opens the modal when the info button is clicked', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-4',
            text: 'The veto ceremony begins.',
            meta: { major: 'veto_ceremony' },
          }),
        ),
      );
    });

    // Info button should be in the overlay
    const infoBtn = screen.getByRole('button', { name: /More Info/i });
    await userEvent.click(infoBtn);

    // Modal should open with phase info
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();
  });

  it('modal stays open after overlay is dismissed via tv:announcement-dismiss event', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({ id: 'ev-modal-persist', text: 'Jury votes.', meta: { major: 'jury' } }),
        ),
      );
    });

    // Open modal first
    await userEvent.click(screen.getByRole('button', { name: /More Info/i }));
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();

    // Dismiss overlay via central FAB event
    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

    // Overlay gone, but modal is still open
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();
  });

  it('does NOT show a Continue FAB for any announcement (per-card FAB removed)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-5',
            text: 'The nominations are set.',
            meta: { major: 'nomination_ceremony' },
          }),
        ),
      );
    });

    // Per-card Continue FAB has been removed — rely on central Play/Continue FAB
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('does NOT show the Continue FAB for auto-dismiss announcements', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-6',
            text: 'A new day begins.',
            meta: { major: 'week_start' },
          }),
        ),
      );
    });

    // week_start has autoDismissMs = 4500 → no Continue FAB
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('dismisses the overlay when tv:announcement-dismiss event is dispatched', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-7',
            text: 'The live vote begins.',
            meta: { major: 'live_eviction' },
          }),
        ),
      );
    });

    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

    // Overlay should be gone
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('closes the modal when the close button is clicked', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-8',
            text: 'Jury votes begin.',
            meta: { major: 'jury' },
          }),
        ),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /More Info/i }));
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(screen.queryByRole('dialog', { name: /Phase info:/i })).toBeNull();
  });
});

// ── TVLog integration ─────────────────────────────────────────────────────────

describe('TvZone — TVLog usage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a game event log (TVLog)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'e1', text: 'Day 1 begins.' })));
      store.dispatch(addTvEvent(makeEvent({ id: 'e2', text: 'The house is watching.' })));
    });

    const log = screen.getByRole('list', { name: /Game event log/i });

    expect(log).toBeDefined();
    expect(log.getAttribute('data-mobile-two-line')).toBe('true');
  });

  it('forwards a custom visible row count to TVLog', () => {
    const store = makeStore();
    renderTvZone(store, { mainLogMaxVisible: 6 });

    const log = screen.getByRole('list', { name: /Game event log/i });
    expect(log.style.getPropertyValue('--tv-log-max-vis')).toBe('6');
  });

  it('disables the mobile two-line clamp when the log is expanded', () => {
    const store = makeStore();
    renderTvZone(store, { mainLogMaxVisible: 6 });

    const log = screen.getByRole('list', { name: /Game event log/i });
    expect(log.getAttribute('data-mobile-two-line')).toBeNull();
  });
});

describe('TvZone day-transition broadcasts', () => {
  it('shows each daily transition only in its own phase, including saved legacy events', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'legacy-day-end',
            text: 'Day 1 has come to an end. A new day begins soon… ✨',
          }),
        ),
      );
      store.dispatch(setPhase('week_start'));
    });

    expect(document.querySelector('.tv-zone__now')?.textContent).not.toContain(
      'Day 1 has come to an end.',
    );

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'day-start',
            text: 'Day 2 has begun. Get ready.',
            meta: { key: 'day_start' },
          }),
        ),
      );
    });

    expect(document.querySelector('.tv-zone__now')).toHaveTextContent(/Day \d/);
    expect(document.querySelector('.tv-zone__daily-mood')).toBeNull();

    act(() => {
      store.dispatch(setPhase('loh_comp'));
    });

    expect(document.querySelector('.tv-zone__now')?.textContent).not.toContain('Day 2 has begun.');
    expect(document.querySelector('.tv-zone__now')?.textContent).not.toContain(
      'Day 1 has come to an end.',
    );
  });
});

// ── TvAnnouncementOverlay countdown unit tests ─────────────────────────────────

describe('TvAnnouncementOverlay — countdown logic', () => {
  let rafCallback: FrameRequestCallback | null = null;
  let rafHandleCounter = 0;

  beforeEach(() => {
    rafCallback = null;
    rafHandleCounter = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return ++rafHandleCounter;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      rafCallback = null;
    });
    vi.spyOn(window.performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function advanceTime(ms: number) {
    vi.spyOn(window.performance, 'now').mockReturnValue(ms);
    const cb = rafCallback;
    if (cb) {
      act(() => { cb(ms); });
    }
  }

  it('auto-dismiss timer fires onDismiss when countdown reaches zero (no visible progress bar)', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');
    expect(overlay).toBeDefined();

    // Progress bar has been removed — no visible fill element
    expect(overlay.querySelector('.tv-announcement__progress-fill')).toBeNull();

    // Advance half-way through — onDismiss should not have fired yet
    advanceTime(2250);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onDismiss when the countdown reaches zero', () => {
    const onDismiss = vi.fn();
    render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    // Advance past the full duration
    advanceTime(4501);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('cancels RAF on mouse enter and restarts on mouse leave', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');

    // Mouse enter should cancel RAF
    act(() => { fireEvent.mouseEnter(overlay); });
    expect(window.cancelAnimationFrame).toHaveBeenCalled();

    const cancelCallsBefore = (window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    const requestCallsBefore = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    // Mouse leave should restart RAF
    act(() => { fireEvent.mouseLeave(overlay); });
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(requestCallsBefore);
    expect((window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelCallsBefore); // no extra cancels
  });

  it('does NOT restart RAF on mouse leave when paused prop is true', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
        paused={true}
      />,
    );

    const overlay = getByRole('dialog');
    const requestCallsBefore = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    // Mouse leave should NOT restart because paused=true
    act(() => { fireEvent.mouseLeave(overlay); });
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requestCallsBefore);
  });

  it('does not pause auto-dismiss when pointer input clears prior keyboard focus mode', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');
    const cancelCallsBefore = (window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' });
      fireEvent.mouseDown(overlay);
      fireEvent.focus(overlay);
    });

    expect((window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelCallsBefore);
  });

  it('still pauses auto-dismiss for keyboard-driven focus', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Day', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');
    const cancelCallsBefore = (window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' });
      fireEvent.focus(overlay);
    });

    expect((window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(cancelCallsBefore);
  });

  it('restarts auto-dismiss when TvZone swaps to a new external announcement with the same duration', () => {
    const store = makeStore();
    const announcements = [
      {
        key: 'loh_tiebreak_tie',
        title: "It's a Tie!",
        subtitle: 'The LOH must break the tie.',
        isLive: true,
        autoDismissMs: 3000,
      },
      {
        key: 'loh_tiebreak_deciding',
        title: 'The LOH is making a decision…',
        subtitle: 'Please wait while the LOH decides who to evict.',
        isLive: true,
        autoDismissMs: 3000,
      },
    ] as const;

    function ExternalAnnouncementHarness() {
      const [index, setIndex] = React.useState(0);
      const announcement = announcements[index] ?? null;

      return (
        <Provider store={store}>
          <MemoryRouter>
            <TvZone
              externalAnnouncement={announcement}
              onExternalAnnouncementDismiss={() => {
                setIndex((current) => current + 1);
              }}
            />
          </MemoryRouter>
        </Provider>
      );
    }

    render(<ExternalAnnouncementHarness />);

    const advanceAutoDismiss = (ms: number) => {
      vi.spyOn(window.performance, 'now').mockReturnValue(ms);
      const cb = rafCallback;
      rafCallback = null;
      if (cb) {
        act(() => {
          cb(ms);
        });
      }
    };

    expect(screen.getByRole('dialog', { name: /Announcement: It's a Tie!/i })).toBeDefined();

    advanceAutoDismiss(3001);
    expect(screen.getByRole('dialog', { name: /Announcement: The LOH is making a decision/i })).toBeDefined();

    advanceAutoDismiss(6002);
    expect(screen.queryByRole('dialog', { name: /Announcement: The LOH is making a decision/i })).toBeNull();
  });
});

// ── Phase-based announcement trigger tests ────────────────────────────────────

describe('TvZone — phase-based announcement triggers', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Nomination Ceremony overlay when phase transitions to nominations', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
  });

  it('upgrades the nominations phase overlay to Double Eviction when the twist activates in-place', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });
    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();

    act(() => { store.dispatch(activateDoubleEviction()); });

    expect(screen.queryByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeNull();
    expect(document.body.querySelector('[data-testid="shock-intro-overlay"]')).toBeNull();

    expect(screen.getByRole('dialog', { name: /Announcement: Double Elimination!/i })).toBeDefined();
    vi.useRealTimers();
  });

  it('replaces the LOH announcement with the Democracia shock before voting begins', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('loh_comp_announcement')); });
    expect(screen.getByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeDefined();

    act(() => { store.dispatch(activateDemocracia()); });

    expect(screen.queryByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeNull();
    expect(screen.getByTestId('tv-shock-prelude')).toHaveTextContent('DEMOCRACIA');

    act(() => {
      vi.advanceTimersByTime(SHOCK_INTRO_SETTLE_MS + 50);
    });

    expect(screen.getByRole('dialog', { name: /Announcement: DEMOCRACIA!/i })).toBeDefined();
    expect(store.getState().game.phase).toBe('loh_comp_announcement');
    expect(store.getState().game.democracia?.awaitingHumanVote).toBe(false);
    vi.useRealTimers();
  });

  it('keeps a major Double Elimination announcement inside the faux TV', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });
    act(() => { store.dispatch(activateDoubleEviction()); });

    expect(screen.queryByTestId('shock-intro-overlay')).toBeNull();
    expect(screen.queryByTestId('tv-shock-prelude')).toBeNull();
    expect(screen.getByRole('dialog', { name: /Announcement: Double Elimination!/i })).toBeDefined();
    vi.useRealTimers();
  });

  it('plays the Double Elimination TV spotlight without requiring a fullscreen shock intro', () => {
    vi.useFakeTimers();
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });
    act(() => { store.dispatch(activateDoubleEviction()); });

    expect(document.body.querySelector('.tv-zone-de-backdrop')).not.toBeNull();
    expect(screen.getByLabelText('Game action zone').className).toContain('tv-zone--de-spotlight');

    act(() => {
      vi.advanceTimersByTime(1700);
    });

    expect(document.body.querySelector('.tv-zone-de-backdrop')).toBeNull();
    expect(screen.getByLabelText('Game action zone').className).not.toContain('tv-zone--de-spotlight');
    vi.useRealTimers();
  });

  it('shows Safety Ceremony overlay when phase transitions to pos_ceremony (non-final-4)', () => {
    const store = makeStore();
    renderTvZone(store);

    // Default state has 12 alive players (GAME_ROSTER_SIZE); pos_ceremony → veto_ceremony
    act(() => { store.dispatch(setPhase('pos_ceremony')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Safety Ceremony/i })).toBeDefined();
  });

  it('shows Final 4 — Safety Ceremony overlay when phase transitions to pos_ceremony with exactly 4 alive players', () => {
    const store = makeStore();

    // Evict players until only 4 remain
    const state = store.getState().game;
    const toEvict = state.players.filter((p) => p.status !== 'evicted').slice(4);
    act(() => {
      toEvict.forEach((p) => store.dispatch(updatePlayer({ ...p, status: 'evicted' })));
    });

    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pos_ceremony')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Final 4/i })).toBeDefined();
  });

  it('shows Live Eviction overlay when phase transitions to live_vote', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('live_vote')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Live Elimination/i })).toBeDefined();
  });

  it('shows The Finale overlay when phase transitions to final3 with exactly 3 alive players', () => {
    const store = makeStore();

    // Evict players until only 3 remain
    const state = store.getState().game;
    const toEvict = state.players.filter((p) => p.status !== 'evicted').slice(3);
    act(() => {
      toEvict.forEach((p) => store.dispatch(updatePlayer({ ...p, status: 'evicted' })));
    });

    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3')); });

    expect(screen.getByRole('dialog', { name: /Announcement: The Finale/i })).toBeDefined();
  });

  it('shows Final LOH Decision overlay when phase transitions to final3_decision', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3_decision')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Final LOH Decision/i })).toBeDefined();
  });

  it('shows Tribunal Votes overlay when phase transitions to jury', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('jury')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Tribunal Votes/i })).toBeDefined();
  });

  it('does NOT show any overlay when phase transitions to week_start', () => {
    const store = makeStore();
    renderTvZone(store);

    // Move away from default week_start first, then come back
    act(() => { store.dispatch(setPhase('nominations')); });
    // Verify nomination overlay appeared before dismissing
    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
    // Dismiss the nomination overlay
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    act(() => { store.dispatch(setPhase('week_start')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to loh_comp', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('loh_comp')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to pos_comp', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pos_comp')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('shows LOH Competition overlay when phase transitions to loh_comp_announcement', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('loh_comp_announcement')); });

    expect(screen.getByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeDefined();
  });

  it('shows Power of Safety overlay when phase transitions to pos_comp_announcement', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pos_comp_announcement')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Power of Safety/i })).toBeDefined();
  });

  it('LOH Competition overlay requires manual dismissal (no auto-dismiss)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('loh_comp_announcement')); });

    // The overlay for loh_comp_announcement has autoDismissMs: null — no auto-dismiss
    const overlay = screen.getByRole('dialog', { name: /Announcement: LOH Competition/i });
    expect(overlay).toBeDefined();
    // Dismiss via central FAB event
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    expect(screen.queryByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeNull();
  });

  it('POS overlay requires manual dismissal (no auto-dismiss)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pos_comp_announcement')); });

    const overlay = screen.getByRole('dialog', { name: /Announcement: Power of Safety/i });
    expect(overlay).toBeDefined();
    // Dismiss via central FAB event
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    expect(screen.queryByRole('dialog', { name: /Announcement: Power of Safety/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to final3_comp1', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3_comp1')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show an overlay on initial mount (no phase transition)', () => {
    // week_start is the default phase — no transition occurs on mount
    const store = makeStore();
    renderTvZone(store);

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT repeat the phase overlay after it has been dismissed (same phase)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });
    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    // Dismiss the overlay
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();

    // Dispatching more events while still in 'nominations' must not re-show the overlay
    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'ev-extra', text: 'Houseguests deliberate.' })));
    });
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('uses presentable labels for internal-only phases in the head pills', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pre_veto_public_save')); });
    expect(screen.getByLabelText(/public safety/i)).toBeDefined();
    expect(screen.queryByText('pre_veto_public_save')).toBeNull();

    act(() => { store.dispatch(setPhase('jury_announcement')); });
    expect(screen.getByLabelText(/tribunal/i)).toBeDefined();
    expect(screen.queryByText('jury_announcement')).toBeNull();

    act(() => { store.dispatch(setPhase('jury_cinematic')); });
    expect(screen.getByLabelText(/tribunal/i)).toBeDefined();
    expect(screen.queryByText('jury_cinematic')).toBeNull();
  });

  it('renders an external announcement in the main TV and calls its dismiss callback', () => {
    const store = makeStore();
    const onExternalAnnouncementDismiss = vi.fn();

    renderTvZone(store, {
      externalAnnouncement: {
        key: 'ad_break_eviction_auto',
        title: 'SHORT BREAK',
        subtitle: "Don't change the channel a new Day is about to begin right after a short break.",
        isLive: true,
        autoDismissMs: null,
      },
      onExternalAnnouncementDismiss,
    });

    expect(screen.getByRole('dialog', { name: /Announcement: SHORT BREAK/i })).toBeDefined();
    expect(screen.getByText(/new Day is about to begin right after a short break/i)).toBeTruthy();

    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });

    expect(onExternalAnnouncementDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps queued phase announcements when a priority announcement is dismissed', () => {
    const store = makeStore();

    function PriorityAnnouncementHarness() {
      const [priorityAnnouncement, setPriorityAnnouncement] = React.useState<ComponentProps<typeof TvZone>['priorityAnnouncement']>({
        key: 'confessional_required',
        title: 'Confessional Required',
        subtitle: 'Head to the Confessional to finish your action.',
        isLive: false,
        autoDismissMs: null,
      });

      return (
        <Provider store={store}>
          <MemoryRouter>
            <TvZone
              priorityAnnouncement={priorityAnnouncement}
              onPriorityAnnouncementDismiss={() => setPriorityAnnouncement(null)}
            />
          </MemoryRouter>
        </Provider>
      );
    }

    render(<PriorityAnnouncementHarness />);

    act(() => {
      store.dispatch(setPhase('nominations'));
    });

    expect(screen.getByRole('dialog', { name: /Announcement: Confessional Required/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
  });

  it('uses the current-phase managed log message instead of rendering an empty viewport', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(setPhase('social_1'));
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-current-phase-log',
            text: 'Housemates compare notes before the next ceremony.',
            type: 'social',
          }),
        ),
      );
    });

    const nowEl = document.querySelector('.tv-zone__now');
    expect(nowEl).not.toHaveStyle({ opacity: '0' });
    expect(nowEl).toHaveTextContent('Housemates compare notes before the next ceremony.');
  });

  it('keeps an acknowledged Major phase card as steady viewport copy', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(setPhase('live_vote'));
    });
    expect(screen.getByRole('dialog', { name: /Announcement: Live Elimination/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

    const nowEl = document.querySelector('.tv-zone__now');
    expect(nowEl).not.toHaveStyle({ opacity: '0' });
    expect(nowEl).toHaveTextContent('The house will vote to eliminate.');
  });
});

// ── TvAnnouncementModal — no-animations fast-path ─────────────────────────────

describe('TvAnnouncementModal — no-animations fast-path', () => {
  afterEach(() => {
    document.body.classList.remove('no-animations');
    vi.restoreAllMocks();
  });

  it('calls onClose immediately when opened with body.no-animations set', () => {
    document.body.classList.add('no-animations');
    const onClose = vi.fn();

    act(() => {
      render(<TvAnnouncementModal announcementKey="week_start" open={true} onClose={onClose} />);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when body.no-animations is absent', () => {
    const onClose = vi.fn();

    act(() => {
      render(<TvAnnouncementModal announcementKey="week_start" open={true} onClose={onClose} />);
    });

    // Only the ESC/backdrop close paths fire onClose — not the fast-path.
    expect(onClose).not.toHaveBeenCalled();
  });
});
