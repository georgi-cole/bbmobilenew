import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Page,
} from './support/test'

const PROFILE_ID = 'e2e-finale-profile'
const PROFILE_NAME = 'Finale Journey Player'
const FIXTURE_SENTINEL_KEY = 'bbmobilenew:e2e:finale-fixture'
const PROFILES_STORAGE_KEY = 'bbmobilenew:profiles:v1'
const SETTINGS_STORAGE_KEY = 'bbmobilenew_settings_v1'
const ARCHIVE_KEY = `bbmobilenew:seasonArchives:${encodeURIComponent(PROFILE_ID)}`
const CLASSIC_RUN_KEY = `bbmobilenew:savedRunSlot:${encodeURIComponent(PROFILE_ID)}:classic`
const LEGACY_SAVED_STATE_KEY = `bbmobilenew:savedSeason:${encodeURIComponent(PROFILE_ID)}`

interface FixtureRoster {
  finalists: Array<{ id: string; name: string }>
  jurors: Array<{ id: string; name: string }>
  preJury: Array<{ id: string; name: string }>
}

interface PersistedRunFacts {
  awardEvents: Array<{ awardAmount?: number; winnerId?: string }>
  favoriteWinnerId: string | null
  finaleRunnerUpId: string | null
  finaleWinnerId: string | null
  seasonFinalePhase: string | null
}

interface ArchiveSummary {
  finalPlacement: number | null
  madeJury: boolean
  playerId: string
  wonPublicFavorite: boolean
}

async function installDeterministicFinaleFixture(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixtureSentinelKey, profileId, profileName, profilesStorageKey, settingsStorageKey }) => {
      // Keep roster selection and all incidental non-game random calls stable.
      // The game itself starts with its canonical deterministic seed (42).
      let randomState = 0x6d2b79f5
      Math.random = () => {
        randomState = (randomState + 0x6d2b79f5) >>> 0
        let value = randomState
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
      }

      // addInitScript runs again after reload. Seed storage only once so the
      // later reloads exercise the real saved run and archive instead of
      // silently reinstalling the fixture.
      if (localStorage.getItem(fixtureSentinelKey) === 'installed') return

      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        profilesStorageKey,
        JSON.stringify({
          activeProfileId: profileId,
          isGuest: false,
          profiles: [
            {
              avatar: '🧑',
              createdAt: '2026-07-21T00:00:00.000Z',
              id: profileId,
              name: profileName,
            },
          ],
        })
      )
      localStorage.setItem(
        settingsStorageKey,
        JSON.stringify({
          audio: { musicOn: false, sfxOn: false },
          gameUX: { animations: false },
          sim: {
            enableFavoritePlayer: true,
            enableTwists: true,
            favoritePlayerAwardAmount: 25000,
            publicMode: true,
          },
        })
      )
      localStorage.setItem(fixtureSentinelKey, 'installed')
    },
    {
      fixtureSentinelKey: FIXTURE_SENTINEL_KEY,
      profileId: PROFILE_ID,
      profileName: PROFILE_NAME,
      profilesStorageKey: PROFILES_STORAGE_KEY,
      settingsStorageKey: SETTINGS_STORAGE_KEY,
    }
  )
}

async function readPersistedRun(page: Page): Promise<PersistedRunFacts> {
  return page.evaluate((classicRunKey) => {
    const raw = localStorage.getItem(classicRunKey)
    if (!raw) throw new Error('profile-scoped Classic finale snapshot is missing')

    const snapshot = JSON.parse(raw) as {
      finale?: { runnerUpId?: string | null; winnerId?: string | null }
      game?: {
        favoritePlayer?: { winnerId?: string | null } | null
        history?: Array<{
          data?: { awardAmount?: number; winnerId?: string }
          type?: string
        }>
        seasonFinale?: { phase?: string } | null
      }
    }
    if (!snapshot.game) throw new Error('Classic finale snapshot is incomplete')

    return {
      awardEvents: (snapshot.game.history ?? [])
        .filter((event) => event.type === 'favoritePlayer:award')
        .map((event) => ({
          awardAmount: event.data?.awardAmount,
          winnerId: event.data?.winnerId,
        })),
      favoriteWinnerId: snapshot.game.favoritePlayer?.winnerId ?? null,
      finaleRunnerUpId: snapshot.finale?.runnerUpId ?? null,
      finaleWinnerId: snapshot.finale?.winnerId ?? null,
      seasonFinalePhase: snapshot.game.seasonFinale?.phase ?? null,
    }
  }, CLASSIC_RUN_KEY)
}

async function readArchive(page: Page): Promise<{
  archiveCount: number
  classicRunPresent: boolean
  legacySavePresent: boolean
  seasonId: string | null
  summaries: ArchiveSummary[]
}> {
  return page.evaluate(
    ({ archiveKey, classicRunKey, legacySavedStateKey }) => {
      const archiveRaw = localStorage.getItem(archiveKey)
      const archives = archiveRaw
        ? (JSON.parse(archiveRaw) as Array<{
            playerSummaries?: ArchiveSummary[]
            seasonId?: string
          }>)
        : []

      return {
        archiveCount: archives.length,
        classicRunPresent: localStorage.getItem(classicRunKey) != null,
        legacySavePresent: localStorage.getItem(legacySavedStateKey) != null,
        seasonId: archives[0]?.seasonId ?? null,
        summaries: archives[0]?.playerSummaries ?? [],
      }
    },
    {
      archiveKey: ARCHIVE_KEY,
      classicRunKey: CLASSIC_RUN_KEY,
      legacySavedStateKey: LEGACY_SAVED_STATE_KEY,
    }
  )
}

/** Open the debug panel by clicking the FAB toggle (if not already open). */
async function openDebugPanel(page: Page): Promise<void> {
  const fab = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(fab).toBeVisible({ timeout: 10_000 })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible())) {
    await fab.click()
  }
  await expect(panel).toBeVisible({ timeout: 5_000 })
}

async function configureValidFinaleRoster(page: Page): Promise<FixtureRoster> {
  const statusSelect = page.getByRole('combobox', { name: 'Player House Status' })
  const players = await statusSelect.locator('option').evaluateAll((options) =>
    options.slice(1).map((option) => ({
      id: (option as HTMLOptionElement).value,
      name: option.textContent?.replace(/\s+\([^)]*\)$/, '').trim() ?? '',
    }))
  )

  expect(players.length).toBeGreaterThanOrEqual(9)
  const finalists = players.slice(0, 2)
  const jurors = players.slice(2, 9)
  const preJury = players.slice(9)

  for (const juror of jurors) {
    await statusSelect.selectOption(juror.id)
    await page.getByRole('button', { name: 'Set Tribunal' }).click()
  }
  for (const evictee of preJury) {
    await statusSelect.selectOption(evictee.id)
    await page.getByRole('button', { name: 'Set Pre-jury Evicted' }).click()
  }

  return { finalists, jurors, preJury }
}

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: 30_000 })
  await closeDebugPanelIfOpen(page)

  await dismissPermissionPromptIfPresent(page)

  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
}

async function resumeClassicRun(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRo