// Integration tests validating the minimal ceremony-animation fixes.
//
// Validates:
//  1. When the veto was NOT used (povSavedId = null), no AI replacement
//     animation is shown (aiReplacementKey returns '').
//  2. When the veto WAS used (povSavedId set), the AI replacement animation
//     is triggered.
//  3. Public-save follow-up copy blocks the POS screen until dismissed.
//  4. AI LOH tiebreak choreography advances through the TV announcements before
//     the eviction splash begins.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import { setEnergyBankEntry } from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer from '../../src/store/settingsSlice'
import publicOpinionReducer, {
  initializeProfiles,
  setProfileApprovals,
} from '../../src/publicOpinion/publicOpinionSlice'
import type { GameState, Player } from '../../src/types'
import GameScreen, {
  buildTieBreakPitch,
  POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS,
} from '../../src/screens/GameScreen/GameScreen'
import { loadEvictionVoteBreakdownUnlock } from '../../src/features/evictionVoteBreakdownStorage'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/store/confessionalDecisionSelectors', () => ({
  selectActiveConfessionalDecision: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: ({
    publicSaveReveal,
    onPublicSaveDone,
    voteResultsReveal,
    priorityAnnouncement,
    onPriorityAnnouncementDismiss,
    externalAnnouncement,
    onExternalAnnouncementDismiss,
  }: {
    publicSaveReveal?: {
      savedId: string
    } | null
    onPublicSaveDone?: () => void
    voteResultsReveal?: {
      onTiebreakerRequired?: (ids: string[]) => void
      onDone: () => void
    } | null
    priorityAnnouncement?: {
      title: string
      subtitle?: string
    } | null
    onPriorityAnnouncementDismiss?: () => void
    externalAnnouncement?: {
      title: string
      subtitle?: string
    } | null
    onExternalAnnouncementDismiss?: () => void
  }) => {
    capturedOnTiebreakerRequired = voteResultsReveal?.onTiebreakerRequired ?? null
    const announcement = priorityAnnouncement ?? externalAnnouncement
    const announcementDismissHandler = priorityAnnouncement
      ? onPriorityAnnouncementDismiss
      : onExternalAnnouncementDismiss
    capturedOnExternalAnnouncementDismiss = announcement
      ? (announcementDismissHandler ?? null)
      : null
    return (
      <div data-testid="tv-zone">
        {publicSaveReveal && (
          <div data-testid="public-save-reveal">
            <div>{publicSaveReveal.savedId}</div>
            <button onClick={onPublicSaveDone}>Public save done</button>
          </div>
        )}
        {voteResultsReveal && (
          <div data-testid="vote-results-modal">
            <button onClick={voteResultsReveal.onDone}>Done</button>
          </div>
        )}
        {announcement && (
          <div data-testid="external-announcement">
            <div>{announcement.title}</div>
            {announcement.subtitle && <div>{announcement.subtitle}</div>}
          </div>
        )}
      </div>
    )
  },
}))

vi.mock('../../src/components/Eviction/SpotlightEvictionOverlay', () => ({
  default: ({ onDone }: { onDone: () => void }) => {
    capturedEvictionSplashDone = onDone
    return <div data-testid="eviction-overlay" />
  },
}))

// Module-level captured callbacks so the TV vote reveal / eviction can be triggered.
let capturedOnTiebreakerRequired: ((tiedIds: string[]) => void) | null = null
let capturedOnExternalAnnouncementDismiss: (() => void) | null = null
let capturedEvictionSplashDone: (() => void) | null = null

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }))
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'pos_ceremony_results',
    seed: 42,
    lohId: 'p1', // AI LOH
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    posWinnerId: 'p2',
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    pendingMinigame: null,
    minigameResult: null,
    twistActive: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    voteResults: null,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  }
  return configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: { game: { ...base, ...overrides } },
  })
}

function renderWithStore(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GameScreen tie-break pitches', () => {
  it.each([
    [45, 'protected each other', 'relationship is real'],
    [15, 'still be a number', 'keep an option'],
    [-20, 'not close', 'useful as a shield'],
    [0, 'one more day', 'decision is yours'],
  ])(
    'uses relationship-appropriate, deterministic alternatives at relationship %i',
    (relationship, evenWeekText, oddWeekText) => {
      expect(buildTieBreakPitch(relationship, 'p1', 1)).toContain(evenWeekText)
      expect(buildTieBreakPitch(relationship, 'p1', 2)).toContain(oddWeekText)
      expect(buildTieBreakPitch(relationship, 'p1', 1)).toBe(
        buildTieBreakPitch(relationship, 'p1', 1)
      )
    }
  )
})

describe('Ceremony fix: replacement animation gated on veto being used', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50,
      y: 100,
      width: 60,
      height: 80,
      top: 100,
      left: 50,
      bottom: 180,
      right: 110,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does NOT show replacement animation when veto was not used (povSavedId = null)', async () => {
    // pos_ceremony_results phase, AI LOH, no awaitingPovDecision/SaveTarget,
    // but povSavedId is null/absent → veto was not used → no animation.
    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      posWinnerId: 'p2',
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      replacementNeeded: false,
      // povSavedId intentionally absent/null → veto not used
    })
    renderWithStore(store)
    await act(async () => {})

    // The CeremonyOverlay for replacement should NOT render.
    // (If it did, it would have role="status" with "Replacement nominee" label.)
    const statusEl = screen.queryByRole('status')
    expect(statusEl).toBeNull()
  })

  it('DOES show replacement animation when veto was used (povSavedId set)', async () => {
    // povSavedId is set → veto was used → replacement animation should fire.
    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      nomineeIds: ['p3', 'p4'], // p2 was saved, p4 is the replacement
      posWinnerId: 'p2',
      povSavedId: 'p2', // veto WAS used
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      replacementNeeded: false,
    })
    renderWithStore(store)
    await act(async () => {})

    // CeremonyOverlay with replacement label should be visible.
    const statusEl = screen.getByRole('status')
    expect(statusEl.getAttribute('aria-label')).toContain('Backup nominee ceremony')
  })
})

describe('Ceremony fix: AI LOH tiebreak choreography', () => {
  beforeEach(() => {
    capturedOnTiebreakerRequired = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs the AI tiebreak announcement sequence before the eviction animation', async () => {
    // AI LOH (p1) — human is p0.
    // Vote results show a tie, pendingEviction set (AI already picked).
    const store = makeStore({
      phase: 'eviction_results',
      lohId: 'p1', // AI is LOH
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 1, p3: 1 }, // tie
      pendingEviction: {
        evicteeId: 'p3',
        evictionMessage: 'LOH breaks the tie, evicting Player 3. 🗳️',
      }, // AI chose p3
      awaitingTieBreak: false,
    })
    renderWithStore(store)
    await act(async () => {})

    // Vote results modal should be rendered (mocked).
    expect(screen.getByTestId('vote-results-modal')).toBeTruthy()
    expect(capturedOnTiebreakerRequired).not.toBeNull()

    // Simulate the tie being detected → onTiebreakerRequired fires.
    await act(async () => {
      capturedOnTiebreakerRequired!(['p2', 'p3'])
    })

    expect(store.getState().game.voteResults).toBeNull()
    expect(screen.getByTestId('external-announcement')).toHaveTextContent('It’s a Tie!')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Player 1 must break the tie.'
    )
    expect(screen.queryByTestId('eviction-overlay')).toBeNull()

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Player 1 is making a decision…'
    )

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'The LOH chose to evict Player 3.'
    )

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('external-announcement')).toHaveTextContent('By a vote of 2 to 1')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Player 3, you have been eliminated from The Big Eye house.'
    )
    expect(screen.queryByText(/please say your goodbyes/i)).toBeNull()

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('eviction-overlay')).toBeTruthy()
  })
})

describe('Ceremony fix: public save follow-up announcement', () => {
  beforeEach(() => {
    capturedOnExternalAnnouncementDismiss = null
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50,
      y: 100,
      width: 60,
      height: 80,
      top: 100,
      left: 50,
      bottom: 180,
      right: 110,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('holds the public save result on screen before entering the POS announcement', async () => {
    const players = makePlayers(6)
    players[2].status = 'nominated'
    players[3].status = 'nominated'
    players[4].status = 'nominated'

    const store = makeStore({
      phase: 'pre_veto_public_save',
      publicModeEnabled: true,
      awaitingPublicSave: true,
      nomineeIds: ['p2', 'p3', 'p4'],
      players,
    })

    renderWithStore(store)
    await act(async () => {})

    screen.getByTestId('public-save-reveal')
    await act(async () => {
      screen.getByText('Public save done').click()
    })

    expect(store.getState().game.phase).toBe('pre_veto_public_save')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent('Public Save Result')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Player 2 was saved with 33% of the public support.'
    )
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Player 3 and Player 4 are still in danger.'
    )

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })

    expect(store.getState().game.phase).toBe('pos_comp_announcement')
  })

  it('keeps the public-save ceremony to a green glow while extracting the nomination badge', async () => {
    const players = makePlayers(6)
    players[2].status = 'nominated'
    players[3].status = 'nominated'
    players[4].status = 'nominated'

    const store = makeStore({
      phase: 'pre_veto_public_save',
      publicModeEnabled: true,
      awaitingPublicSave: true,
      nomineeIds: ['p2', 'p3', 'p4'],
      players,
    })

    renderWithStore(store)
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByText('Public save done'))
    })
    await act(async () => {
      vi.advanceTimersByTime(700)
    })

    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'Public save ceremony: Player 2 is safe'
    )
    expect(
      document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="success"]')
    ).toHaveLength(1)
    expect(document.querySelector('.ceremony-overlay__dim')).toBeNull()
    expect(document.querySelector('.ceremony-overlay__caption')).toBeNull()
    expect(screen.queryByText('Player 2 is safe!')).toBeNull()
    expect(screen.queryByText('🗳️ Saved by the public')).toBeNull()
    expect(
      document.querySelectorAll('.ceremony-overlay__badge[data-badge-motion="extract"]')
    ).toHaveLength(1)
    expect(document.querySelectorAll('[title="Nominated"]')).toHaveLength(2)
  })
})

describe('Ceremony fix: live badge choreography for save and replacement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50,
      y: 100,
      width: 60,
      height: 80,
      top: 100,
      left: 50,
      bottom: 180,
      right: 110,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('spotlights the safety holder and transfers the safety badge to the saved nominee', async () => {
    const players = makePlayers(6)
    players[2].status = 'nominated'
    players[3].status = 'nominated'

    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      posWinnerId: 'p0',
      nomineeIds: ['p2', 'p3'],
      awaitingPovSaveTarget: true,
      players,
    })

    renderWithStore(store)
    const saveDialog = screen.getByRole('dialog', { name: /Power of Safety — Save a Nominee/i })
    await act(async () => {
      fireEvent.click(within(saveDialog).getByRole('button', { name: /Player 2/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm:\s*Player 2/i }))
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('has been saved')
    expect(
      document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="gold"]')
    ).toHaveLength(1)
    expect(
      document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="success"]')
    ).toHaveLength(1)
    expect(
      document.querySelectorAll('.ceremony-overlay__badge[data-badge-origin="tile"]')
    ).toHaveLength(1)
    expect(document.querySelectorAll('[title="Nominated"]')).toHaveLength(1)
  })

  it('spotlights the replacement source and sends a nominee badge to the backup nominee', async () => {
    const players = makePlayers(6)
    players[2].status = 'nominated'

    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p0',
      posWinnerId: 'p1',
      nomineeIds: ['p2'],
      povSavedId: 'p3',
      replacementNeeded: true,
      players,
    })

    renderWithStore(store)
    const replacementDialog = screen.getByRole('dialog', { name: /Name a Backup Nominee/i })
    await act(async () => {
      fireEvent.click(within(replacementDialog).getByRole('button', { name: /Player 4/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm:\s*Player 4/i }))
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('backup nominee')
    expect(
      document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="gold"]')
    ).toHaveLength(1)
    expect(
      document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="danger"]')
    ).toHaveLength(1)
    expect(
      document.querySelectorAll('.ceremony-overlay__badge[data-badge-origin="tile"]')
    ).toHaveLength(1)
    expect(document.querySelectorAll('[title="Nominated"]')).toHaveLength(1)
  })
})

describe('Ceremony follow-up: eviction vote breakdown reward prompt', () => {
  beforeEach(() => {
    capturedOnExternalAnnouncementDismiss = null
    capturedEvictionSplashDone = null
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('offers the rewarded vote breakdown reveal after the eviction animation', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 5, p3: 4 },
      votes: { p1: 'p2', p4: 'p2', p5: 'p3' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    })

    renderWithStore(store)
    await act(async () => {})

    screen.getByTestId('vote-results-modal')
    act(() => {
      screen.getByText('Done').click()
    })

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('By a vote of 5 to 4')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      "Player 2, please say your goodbyes and leave through the Confessional's special exit."
    )

    // Dismissing the verdict hands directly to the eviction cinematic.
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('eviction-overlay')).toBeTruthy()
    await act(async () => {
      capturedEvictionSplashDone?.()
    })

    expect(screen.queryByRole('dialog', { name: /peek behind the curtain/i })).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS - 1)
    })
    expect(screen.queryByRole('dialog', { name: /peek behind the curtain/i })).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('dialog', { name: /peek behind the curtain/i })).toBeTruthy()
  })

  it('announces both evictees on the main TV during a double eviction', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p2', 'p3', 'p4'],
      voteResults: { p2: 5, p3: 3, p4: 1 },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
      doubleEviction: {
        usedCount: 1,
        weekActive: true,
        pendingSecondEviction: {
          evicteeId: 'p3',
          evictionMessage: 'Player 3 has also been eliminated. 🚪',
        },
      },
      players: makePlayers(7),
    })

    renderWithStore(store)
    await act(async () => {})

    act(() => {
      screen.getByText('Done').click()
    })

    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      'Double Elimination Results'
    )
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      "Player 2 and Player 3, please say your goodbyes and leave through the Confessional's special exit."
    )
  })

  it('automatically shows the vote breakdown when the evicted player is the human user', async () => {
    const players = makePlayers(6)
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p0', 'p2'],
      voteResults: { p0: 5, p2: 4 },
      votes: { p1: 'p0', p3: 'p0', p4: 'p2' },
      pendingEviction: { evicteeId: 'p0', evictionMessage: 'Player 0 has been eliminated. 🚪' },
      players,
    })

    renderWithStore(store)
    await act(async () => {})

    act(() => {
      screen.getByText('Done').click()
    })

    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    await act(async () => {
      capturedEvictionSplashDone?.()
    })
    await act(async () => {
      vi.advanceTimersByTime(POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS)
    })

    expect(screen.queryByRole('dialog', { name: /peek behind the curtain/i })).toBeNull()
    expect(screen.getByRole('dialog', { name: /vote breakdown/i })).toBeInTheDocument()
    expect(screen.getByText(/who voted for whom/i)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /eviction vote breakdown/i })).toHaveTextContent(
      'Player 1'
    )
    expect(screen.getByRole('table', { name: /eviction vote breakdown/i })).toHaveTextContent(
      'Player 0'
    )
  })

  it('unlocks the confessional vote breakdown when the ad is accepted in dev/web', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      week: 3,
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 5, p3: 4 },
      votes: { p1: 'p2', p4: 'p2', p5: 'p3' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    })

    renderWithStore(store)
    await act(async () => {})

    act(() => {
      screen.getByText('Done').click()
    })

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('By a vote of 5 to 4')

    // Dismiss post-vote announcement then complete eviction animation.
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    await act(async () => {
      capturedEvictionSplashDone?.()
    })
    await act(async () => {
      vi.advanceTimersByTime(POST_EVICTION_VOTE_BREAKDOWN_PROMPT_DELAY_MS)
    })

    act(() => {
      screen.getByRole('button', { name: /watch ad to unlock vote reveal/i }).click()
    })

    expect(loadEvictionVoteBreakdownUnlock()).toMatchObject({
      week: 3,
      phase: 'eviction_results',
      evicteeId: 'p2',
      status: 'available',
    })
    expect(store.getState().game.voteResults).toBeNull()
  })

  it('uses vote-count wording instead of X-to-Y copy when more than two nominees are present', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p2', 'p3', 'p4'],
      voteResults: { p2: 5, p3: 3, p4: 1 },
      votes: { p1: 'p2', p5: 'p2' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    })

    renderWithStore(store)
    await act(async () => {})

    act(() => {
      screen.getByText('Done').click()
    })

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('With 5 votes')
    expect(screen.getByTestId('external-announcement')).toHaveTextContent(
      "Player 2, please say your goodbyes and leave through the Confessional's special exit."
    )
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.()
    })
    expect(screen.getByTestId('eviction-overlay')).toBeTruthy()
  })
})

describe('GameScreen eviction prompt suppression for eliminated human players', () => {
  it('suppresses the approval prompt after the human player is evicted', async () => {
    const players = makePlayers(6)
    players[0].status = 'jury'
    const store = makeStore({
      phase: 'week_end',
      week: 2,
      players,
    })
    store.dispatch(initializeProfiles(players.map((player) => player.id)))
    store.dispatch(setProfileApprovals({ p0: 35 }))

    renderWithStore(store)
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: /your approval is slipping/i })).toBeNull()
  })

  it('suppresses the energy prompt after the human player is evicted', async () => {
    const players = makePlayers(6)
    players[0].status = 'jury'
    const store = makeStore({
      phase: 'social_1',
      week: 2,
      players,
    })
    store.dispatch(setEnergyBankEntry({ playerId: 'p0', value: 0 }))

    renderWithStore(store)
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: /out of energy/i })).toBeNull()
  })
})
