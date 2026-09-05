import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const repoRoot = process.cwd()
const introHubScript = readFileSync(path.join(repoRoot, 'public/js/ui/introHub.js'), 'utf8')
const introHubCss = readFileSync(path.join(repoRoot, 'public/css/intro-hub.css'), 'utf8')
const mirroredIntroHubScript = readFileSync(
  path.join(repoRoot, 'public/bbmobilenew/js/ui/introHub.js'),
  'utf8'
)
const mirroredIntroHubCss = readFileSync(
  path.join(repoRoot, 'public/bbmobilenew/css/intro-hub.css'),
  'utf8'
)

function setNavigatorShare(shareImpl?: ((data: unknown) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, 'share', {
    configurable: true,
    value: shareImpl,
  })
}

function loadIntroHub(gameOverrides: Record<string, unknown> = {}) {
  document.body.innerHTML = '<div id="intro-hub"></div>'
  delete (window as Window & { game?: unknown }).game
  ;(window as Window & { game?: unknown }).game = { ...gameOverrides }
  new Function(introHubScript)()
}

afterEach(() => {
  document.body.innerHTML = ''
  delete (window as Window & { game?: unknown }).game
  delete (window as Window & { game?: unknown }).HouseguestsModal
  delete (window as Window & { _introhubMusicOn?: boolean })._introhubMusicOn
  delete (window as Window & { _introhubSfxOn?: boolean })._introhubSfxOn
  delete (window as Window & { toggleIntroHubMusic?: () => void }).toggleIntroHubMusic
  delete (window as Window & { toggleIntroHubSfx?: () => void }).toggleIntroHubSfx
  setNavigatorShare(undefined)
  vi.restoreAllMocks()
})

describe('IntroHub side utility buttons', () => {
  it('renders icon class hooks for the side utility asset pack', () => {
    loadIntroHub()

    expect(
      document.querySelector('[data-hub-id="houseguests"] .hub-chip__icon--housemates')
    ).not.toBeNull()
    expect(document.querySelector('[data-hub-id="music"] .hub-chip__icon--music')).not.toBeNull()
    expect(document.querySelector('[data-hub-id="sounds"] .hub-chip__icon--sound')).not.toBeNull()
    expect(document.querySelector('[data-hub-id="store"] .hub-chip__icon--shop')).not.toBeNull()
    expect(
      document.querySelector('[data-hub-id="feedback"] .hub-chip__icon--feedback')
    ).not.toBeNull()
    expect(mirroredIntroHubScript).toContain("icon: 'housemates'")
    expect(mirroredIntroHubScript).toContain(
      'icon.className = `hub-chip__icon hub-chip__icon--${def.icon}`'
    )
    expect(mirroredIntroHubScript).toContain('navigator.share')
    expect(mirroredIntroHubScript).toContain('collectAchievementStats')
    expect(mirroredIntroHubScript).toContain('kolequant@gmail.com')
    expect(mirroredIntroHubScript).toContain('Competitive / Wins')
    expect(mirroredIntroHubScript).toContain('Trophy case')
  })

  it('renders the requested mobile side-utility positions', () => {
    loadIntroHub()

    expect(document.querySelector('[data-hub-id="news"]')).toBeNull()
    expect(document.querySelector('[data-hub-id="music"]')).toHaveClass('hub-chip--top-left')
    expect(document.querySelector('[data-hub-id="sounds"]')).toHaveClass('hub-chip--top-left-2')
    expect(document.querySelector('[data-hub-id="social"]')).toBeNull()
    expect(document.querySelector('[data-hub-id="houseguests"]')).toHaveClass(
      'hub-chip--bottom-left'
    )
    expect(document.querySelector('[data-hub-id="achievements"]')).toHaveClass(
      'hub-chip--bottom-left-2'
    )
    expect(document.querySelector('[data-hub-id="feedback"]')).toHaveClass(
      'hub-chip--bottom-left-3'
    )
    expect(document.querySelector('[data-hub-id="store"]')).toHaveClass('hub-chip--bottom-right')
    expect(document.querySelector('[data-hub-id="settings"]')).toHaveClass(
      'hub-chip--bottom-right-2'
    )
    expect(document.querySelector('[data-hub-id="share"]')).toHaveClass('hub-chip--bottom-right-3')
    expect(mirroredIntroHubScript).not.toContain(
      "{ id: 'news', label: 'News', icon: 'news', position: 'top-left' }"
    )
    expect(mirroredIntroHubScript).not.toContain(
      "{ id: 'social', label: 'Social', icon: 'social', position: 'top-right' }"
    )
    expect(mirroredIntroHubScript).toContain(
      "{ id: 'music', label: 'Music', icon: 'music', position: 'top-left' }"
    )
    expect(mirroredIntroHubScript).toContain(
      "{ id: 'feedback', label: 'Feedback', icon: 'feedback', position: 'bottom-left-3' }"
    )
    expect(mirroredIntroHubScript).toContain(
      "{ id: 'settings', label: 'Settings', icon: 'settings', position: 'bottom-right-2' }"
    )
    expect(mirroredIntroHubScript).toContain(
      "{ id: 'share', label: 'Share', icon: 'share', position: 'bottom-right-3' }"
    )
  })

  it('toggles the music and sounds chips via the legacy intro hub helpers', () => {
    const toggleIntroHubMusic = vi.fn(() => {
      ;(window as Window & { _introhubMusicOn?: boolean })._introhubMusicOn = !(
        window as Window & { _introhubMusicOn?: boolean }
      )._introhubMusicOn
    })
    const toggleIntroHubSfx = vi.fn(() => {
      ;(window as Window & { _introhubSfxOn?: boolean })._introhubSfxOn = !(
        window as Window & { _introhubSfxOn?: boolean }
      )._introhubSfxOn
    })
    ;(window as Window & { _introhubMusicOn?: boolean })._introhubMusicOn = true
    ;(window as Window & { _introhubSfxOn?: boolean })._introhubSfxOn = true
    ;(window as Window & { toggleIntroHubMusic?: () => void }).toggleIntroHubMusic =
      toggleIntroHubMusic
    ;(window as Window & { toggleIntroHubSfx?: () => void }).toggleIntroHubSfx = toggleIntroHubSfx

    loadIntroHub()

    const musicChip = document.querySelector<HTMLButtonElement>('[data-hub-id="music"]')
    const soundsChip = document.querySelector<HTMLButtonElement>('[data-hub-id="sounds"]')

    expect(musicChip).not.toHaveClass('hub-chip--inactive')
    expect(soundsChip).not.toHaveClass('hub-chip--inactive')

    musicChip?.click()
    soundsChip?.click()

    expect(toggleIntroHubMusic).toHaveBeenCalledTimes(1)
    expect(toggleIntroHubSfx).toHaveBeenCalledTimes(1)
    expect(musicChip).toHaveClass('hub-chip--inactive')
    expect(soundsChip).toHaveClass('hub-chip--inactive')
  })

  it('styles the IntroHub chips with side utility shell and badge assets', () => {
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_normal.svg')
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_hover.svg')
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_pressed.svg')
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_disabled.svg')
    expect(introHubCss).toContain('../assets/side_utilities_button/badge_alert_red.svg')
    expect(introHubCss).toContain('.hub-chip__icon--housemates')
    expect(introHubCss).toContain('.hub-chip__icon--shop')
    expect(introHubCss).toContain('--floating-corner-top-base: 16px;')
    expect(introHubCss).toContain('--floating-corner-top-touch-base: 24px;')
    expect(introHubCss).toContain('--floating-corner-top-touch-safe-padding: 20px;')
    expect(introHubCss).toContain('--floating-corner-left-touch-base: 20px;')
    expect(introHubCss).toContain('--floating-corner-right-touch-base: 20px;')
    expect(introHubCss).toContain('--hub-chip-top-offset')
    expect(introHubCss).toContain('top: var(--hub-chip-top-offset);')
    expect(introHubCss).toContain('left: var(--hub-chip-left-offset);')
    expect(introHubCss).toContain('right: var(--hub-chip-right-offset);')
    expect(introHubCss).toMatch(
      /#intro-hub\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*width:\s*auto;[^}]*height:\s*auto;/s
    )
    expect(introHubCss).toMatch(/#intro-hub\s*\{[^}]*pointer-events:\s*none;/s)
    expect(introHubCss).not.toMatch(/#intro-hub\s*\{[^}]*height:\s*100%;/s)
    expect(introHubCss).toMatch(/\.hub-chip\s*\{[^}]*pointer-events:\s*auto;/s)
    expect(introHubCss).toContain('touch-action: manipulation;')
    expect(introHubCss).toContain('@media (hover: none) and (pointer: coarse)')
    expect(introHubCss).toContain(
      'calc(env(safe-area-inset-top, 0px) + var(--floating-corner-top-touch-safe-padding))'
    )
    expect(mirroredIntroHubCss).toContain(
      '../../assets/side_utilities_button/side_utility_shell_normal.svg'
    )
    expect(mirroredIntroHubCss).toContain(
      '../../assets/side_utilities_button/side_utility_shell_hover.svg'
    )
    expect(mirroredIntroHubCss).toContain(
      '../../assets/side_utilities_button/side_utility_shell_pressed.svg'
    )
    expect(mirroredIntroHubCss).toContain(
      '../../assets/side_utilities_button/side_utility_shell_disabled.svg'
    )
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/badge_alert_red.svg')
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--housemates')
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--shop')
    expect(mirroredIntroHubCss).toContain('--floating-corner-top-base: 16px;')
    expect(mirroredIntroHubCss).toContain('--floating-corner-top-touch-base: 24px;')
    expect(mirroredIntroHubCss).toContain('--floating-corner-top-touch-safe-padding: 20px;')
    expect(mirroredIntroHubCss).toContain('--floating-corner-left-touch-base: 20px;')
    expect(mirroredIntroHubCss).toContain('--floating-corner-right-touch-base: 20px;')
    expect(mirroredIntroHubCss).toContain('--hub-chip-top-offset')
    expect(mirroredIntroHubCss).toContain('top: var(--hub-chip-top-offset);')
    expect(mirroredIntroHubCss).toContain('left: var(--hub-chip-left-offset);')
    expect(mirroredIntroHubCss).toContain('right: var(--hub-chip-right-offset);')
    expect(mirroredIntroHubCss).toMatch(
      /#intro-hub\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*width:\s*auto;[^}]*height:\s*auto;/s
    )
    expect(mirroredIntroHubCss).toContain('pointer-events: none;')
    expect(mirroredIntroHubCss).not.toMatch(/#intro-hub\s*\{[^}]*height:\s*100%;/s)
    expect(mirroredIntroHubCss).toContain('pointer-events: auto;')
    expect(mirroredIntroHubCss).toContain('touch-action: manipulation;')
    expect(mirroredIntroHubCss).toContain('@media (hover: none) and (pointer: coarse)')
    expect(mirroredIntroHubCss).toContain(
      'calc(env(safe-area-inset-top, 0px) + var(--floating-corner-top-touch-safe-padding))'
    )
  })

  it('uses the native share sheet when the share chip is tapped', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(shareSpy)
    loadIntroHub()

    document.querySelector<HTMLButtonElement>('[data-hub-id="share"]')?.click()
    await Promise.resolve()

    expect(shareSpy).toHaveBeenCalledWith({
      title: 'BBMobile New',
      text: 'Share BBMobile New with your friends and compare your house legacy.',
      url: window.location.href,
    })
    expect(document.getElementById('hub-dialog-panel')).toBeNull()
  })

  it('opens the feedback email composer for the support inbox', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    loadIntroHub({ season: 3, week: 7 })

    document.querySelector<HTMLButtonElement>('[data-hub-id="feedback"]')?.click()

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [url, target] = openSpy.mock.calls[0]
    expect(url).toContain('mailto:kolequant@gmail.com')
    expect(url).toContain('BBMobile%20New%20feedback')
    expect(url).toContain('Season%203')
    expect(url).toContain('Day%207')
    expect(target).toBe('_self')
  })

  it('shows placeholder achievement values when no season history exists yet', () => {
    loadIntroHub({
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: {
            lohWins: 0,
            posWins: 0,
            timesNominated: 0,
          },
        },
      ],
      week: 1,
      phase: 'week_start',
    })

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click()

    const dialog = document.getElementById('hub-dialog-panel')
    expect(dialog?.textContent).toContain('Trophy case')
    expect(dialog?.textContent).toContain('Avg survive')
    expect(dialog?.textContent).toContain('—')
    expect(dialog?.textContent).toContain('Competitive / Wins')
    expect(dialog?.textContent).toContain('Your next badge unlocks once you finish a full season.')
  })

  it('shows a career achievements dialog with aggregated stats', () => {
    loadIntroHub({
      season: 4,
      week: 6,
      phase: 'nominations',
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: {
            lohWins: 1,
            posWins: 1,
            timesNominated: 1,
            battleBackWins: 0,
            wonFinalHoh: false,
          },
        },
      ],
      seasonArchives: [
        {
          seasonIndex: 3,
          seasonId: 'season-3',
          rewardsEarned: ['egg-one', 'egg-two'],
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 1,
              lohWins: 2,
              posWins: 1,
              timesNominated: 3,
              battleBackWins: 0,
              wonPublicFavorite: true,
              wonFinalHoh: true,
              survivedDoubleEviction: true,
              weeksAlive: 10,
              isEvicted: false,
              madeJury: false,
            },
          ],
        },
        {
          seasonIndex: 2,
          seasonId: 'season-2',
          rewardsEarned: ['egg-two', 'egg-three'],
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 4,
              lohWins: 1,
              posWins: 2,
              timesNominated: 2,
              battleBackWins: 1,
              wonPublicFavorite: false,
              wonFinalHoh: false,
              survivedTripleEviction: true,
              weeksAlive: 5,
              isEvicted: true,
              madeJury: true,
            },
          ],
        },
      ],
    })

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click()

    const dialog = document.getElementById('hub-dialog-panel')
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.textContent).toContain('Achievements')
    expect(dialog?.textContent).toContain('Trophy case')
    expect(dialog?.textContent).toContain('Season wins')
    expect(dialog?.textContent).toContain('Comp wins')
    expect(dialog?.textContent).toContain('Avg survive')
    expect(dialog?.textContent).toContain('7 days')
    expect(dialog?.textContent).toContain('Competitive / Wins')
    expect(dialog?.textContent).toContain('Recognition / Social')
    expect(dialog?.textContent).toContain('Survival / Endurance')
    expect(dialog?.textContent).toContain('Fan favorite')
    expect(dialog?.textContent).toContain('Rewards found')
    expect(dialog?.textContent).toContain('Block escapes')
    expect(dialog?.textContent).toContain('Comp beast ×9')
    expect(dialog?.textContent).toContain('Reward hunter ×3')
  })

  it('shows correct weeksAlive avg survive stat when summaries include weeksAlive', () => {
    // Regression: buildSummaries now populates weeksAlive (previously missing),
    // so the "Avg survive" stat should show a number instead of "—".
    loadIntroHub({
      season: 3,
      week: 1,
      phase: 'week_start',
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
        },
      ],
      seasonArchives: [
        {
          seasonIndex: 2,
          seasonId: 'season-2',
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 1,
              lohWins: 2,
              posWins: 1,
              timesNominated: 2,
              wonFinalHoh: true,
              weeksAlive: 10,
              isEvicted: false,
              madeJury: false,
            },
          ],
        },
        {
          seasonIndex: 1,
          seasonId: 'season-1',
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 5,
              lohWins: 0,
              posWins: 1,
              timesNominated: 3,
              weeksAlive: 6,
              isEvicted: true,
              madeJury: true,
            },
          ],
        },
      ],
    })

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click()

    const dialog = document.getElementById('hub-dialog-panel')
    // Average of 10 and 6 = 8 days
    expect(dialog?.textContent).toContain('8 days')
    // Non-zero seasons played / wins
    expect(dialog?.textContent).toContain('2 seasons entered')
    // Season wins counter
    expect(dialog?.textContent).toContain('Season wins')
    // Comp wins: lohWins 2 + posWins 1 + 0 + 1 = 4
    expect(dialog?.textContent).toContain('Comp wins')
  })

  it('shows survivedDoubleEviction stat in achievements when archives include it', () => {
    // Regression: survivedDoubleEviction was never set in buildSummaries.
    loadIntroHub({
      season: 2,
      week: 1,
      phase: 'week_start',
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
        },
      ],
      seasonArchives: [
        {
          seasonIndex: 1,
          seasonId: 'season-1',
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 1,
              lohWins: 1,
              posWins: 1,
              timesNominated: 1,
              survivedDoubleEviction: true,
              weeksAlive: 9,
              isEvicted: false,
              madeJury: false,
            },
          ],
        },
      ],
    })

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click()

    const dialog = document.getElementById('hub-dialog-panel')
    // "Eviction escape artist" badge should appear because survivedDoubleEviction = true
    expect(dialog?.textContent).toContain('Eviction escape artist')
  })

  it('uses a precomputed achievement summary mirrored from Redux when available', () => {
    loadIntroHub({
      achievementSummary: {
        playerName: 'Jordan',
        totals: {
          seasonsPlayed: 9,
          seasonsWon: 2,
          publicFavoriteWins: 1,
          averageDaysSurvived: '8.5 days',
          totalCompWins: 11,
          timesNominated: 6,
          survivedNominations: 4,
          lohWins: 4,
          posWins: 5,
          battleBackWins: 2,
          finalHohWins: 1,
          juryAppearances: 3,
          doubleEvictionSurvivals: 1,
          tripleEvictionSurvivals: 0,
          rewardsFound: 2,
        },
        quickStats: [
          { label: 'Seasons', value: '9', icon: '📚' },
          { label: 'Wins', value: '2', icon: '🏆' },
          { label: 'Rewards', value: '2', icon: '🥚' },
        ],
        featuredStats: [
          {
            label: 'Season wins',
            value: '2',
            helper: '9 seasons entered',
            icon: '🏆',
            tone: 'gold',
            wide: true,
          },
          {
            label: 'Comp wins',
            value: '11',
            helper: '4 LOH · 5 POS · 2 BB',
            icon: '⚔️',
            tone: 'violet',
          },
          {
            label: 'Avg survive',
            value: '8.5 days',
            helper: '4 block escapes',
            icon: '🛡️',
            tone: 'emerald',
          },
        ],
        sections: [
          {
            title: 'Competitive / Wins',
            icon: '⚔️',
            tone: 'violet',
            stats: [
              { label: 'LOH wins', value: '4', icon: '👑', tone: 'violet' },
              { label: 'POS wins', value: '5', icon: '🔑', tone: 'violet' },
              { label: 'Battle backs', value: '2', icon: '🔄', tone: 'violet' },
              { label: 'Final LOHs', value: '1', icon: '🎯', tone: 'violet' },
            ],
          },
          {
            title: 'Recognition / Social',
            icon: '🌟',
            tone: 'rose',
            stats: [
              { label: 'Fan favorite', value: '1', icon: '🌟', tone: 'rose' },
              { label: 'Jury runs', value: '3', icon: '⚖️', tone: 'rose' },
              { label: 'Rewards found', value: '2', icon: '🥚', tone: 'rose' },
            ],
          },
          {
            title: 'Survival / Endurance',
            icon: '🛡️',
            tone: 'emerald',
            stats: [
              { label: 'Seasons played', value: '9', icon: '📅', tone: 'emerald' },
              { label: 'Nominations', value: '6', icon: '🎯', tone: 'emerald' },
              { label: 'Block escapes', value: '4', icon: '🚪', tone: 'emerald' },
              { label: 'Double survives', value: '1', icon: '⚡', tone: 'emerald' },
              { label: 'Triple survives', value: '0', icon: '🔥', tone: 'emerald' },
            ],
          },
        ],
        highlightBadges: ['🏆 Season champ ×2', '💪 Comp beast ×11'],
        hasHistory: true,
      },
    })

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click()

    const dialog = document.getElementById('hub-dialog-panel')
    expect(dialog?.textContent).toContain('Jordan')
    expect(dialog?.textContent).toContain('9')
    expect(dialog?.textContent).toContain('11')
    expect(dialog?.textContent).toContain('8.5 days')
    expect(dialog?.textContent).toContain('Comp beast ×11')
  })
})
