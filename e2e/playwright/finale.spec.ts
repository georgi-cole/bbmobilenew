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
const SAVED_RUNS_KEY = `bbmobilenew:savedRuns:${encodeURIComponent(PROFILE_ID)}`
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
  return page.evaluate((savedRunsKey) => {
    const raw = localStorage.getItem(savedRunsKey)
    if (!raw) throw new Error('profile-scoped saved-run record is missing')

    const profile = JSON.parse(raw) as {
      runs?: {
        classic?: {
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
      }
    }
    const snapshot = profile.runs?.classic
    if (!snapshot?.game) throw new Error('Classic finale snapshot is missing')

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
  }, SAVED_RUNS_KEY)
}

async function readArchive(page: Page): Promise<{
  archiveCount: number
  classicRunPresent: boolean
  legacySavePresent: boolean
  seasonId: string | null
  summaries: ArchiveSummary[]
}> {
  return page.evaluate(
    ({ archiveKey, legacySavedStateKey, savedRunsKey }) => {
      const archiveRaw = localStorage.getItem(archiveKey)
      const archives = archiveRaw
        ? (JSON.parse(archiveRaw) as Array<{
            playerSummaries?: ArchiveSummary[]
            seasonId?: string
          }>)
        : []
      const savedRunsRaw = localStorage.getItem(savedRunsKey)
      const savedRuns = savedRunsRaw
        ? (JSON.parse(savedRunsRaw) as { runs?: { classic?: unknown } })
        : null

      return {
        archiveCount: archives.length,
        classicRunPresent: savedRuns?.runs?.classic != null,
        legacySavePresent: localStorage.getItem(legacySavedStateKey) != null,
        seasonId: archives[0]?.seasonId ?? null,
        summaries: archives[0]?.playerSummaries ?? [],
      }
    },
    {
      archiveKey: ARCHIVE_KEY,
      legacySavedStateKey: LEGACY_SAVED_STATE_KEY,
      savedRunsKey: SAVED_RUNS_KEY,
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

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  const continueLast = playMenu.getByRole('button', { name: 'Continue Last' })
  await expect(continueLast).toBeVisible()
  await continueLast.click()
}

function eventCount(state: Awaited<ReturnType<typeof readAppState>>, eventType: string): number {
  return (state.game.history ?? []).filter((event) => event.type === eventType).length
}

test.describe('Finale / Jury flow @release', () => {
  test.setTimeout(120_000)

  test('completes a valid finale, reward, recap, and archive exactly once @core-journey @persistence @economy', async ({
    page,
  }) => {
    await installDeterministicFinaleFixture(page)
    await page.goto('./#/game?debug=1')
    await openDebugPanel(page)

    const initialState = await readAppState(page)
    expect(initialState.game.seed).toBe(42)
    expect(initialState.profiles).toMatchObject({ activeProfileId: PROFILE_ID, isGuest: false })
    expect(initialState.profiles.profiles).toContainEqual(
      expect.objectContaining({ id: PROFILE_ID, name: PROFILE_NAME })
    )

    // Fixture-only setup: retain exactly two active finalists, seven real
    // Tribunal members, and valid pre-jury evictees before entering the finale.
    const roster = await configureValidFinaleRoster(page)
    const fixtureState = await readAppState(page)
    expect(
      fixtureState.game.players
        .filter((player) => player.status !== 'jury' && player.status !== 'evicted')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.finalists.map((player) => player.id).sort())
    expect(
      fixtureState.game.players
        .filter((player) => player.status === 'jury')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.jurors.map((player) => player.id).sort())
    expect(
      fixtureState.game.players
        .filter((player) => player.status === 'evicted')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.preJury.map((player) => player.id).sort())

    const promotedJuror = roster.preJury.at(-1)
    if (!promotedJuror) {
      throw new Error('finale parity fixture needs an eligible pre-jury player')
    }
    const expectedRegularJurorIds = [
      ...roster.jurors.map((player) => player.id),
      promotedJuror.id,
    ].sort()

    await page.getByRole('button', { name: '→ Force jury' }).click()
    await closeDebugPanelIfOpen(page)

    const tribunal = page.getByRole('dialog', { name: 'Tribunal Finale' })
    await expect(tribunal).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(async () => {
        const state = await readAppState(page)
        return {
          finalists: [...state.finale.finalistIds].sort(),
          jurors: state.finale.jurorIds.filter((id) => id !== '__public__').sort(),
          publicJurorEnabled: state.finale.publicJurorEnabled,
          publicVoteWeight: state.finale.publicVoteWeight,
        }
      })
      .toEqual({
        finalists: roster.finalists.map((player) => player.id).sort(),
        jurors: expectedRegularJurorIds,
        publicJurorEnabled: true,
        publicVoteWeight: 1,
      })

    // Everything after the fixture uses the same controls a player sees.
    await tribunal
      .getByRole('button', { name: /Skip All/ })
      .evaluate((button) => (button as HTMLButtonElement).click())
    const recap = page.getByRole('dialog', { name: 'Season recap cinematic' })
    await expect(recap).toBeVisible({ timeout: 10_000 })
    await recap
      .getByRole('button', { name: 'Skip recap' })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(recap).toBeHidden()

    await expect(tribunal).toBeVisible({ timeout: 10_000 })
    await tribunal
      .getByRole('button', { name: /Skip All/ })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(tribunal).toContainText(/wins The Big Eye|Winner declared/, {
      timeout: 10_000,
    })

    const resolvedFinale = await readAppState(page)
    const winnerId = resolvedFinale.finale.winnerId
    const runnerUpId = resolvedFinale.finale.runnerUpId
    expect(winnerId).not.toBeNull()
    expect(runnerUpId).not.toBeNull()
    expect(winnerId).not.toBe(runnerUpId)
    expect(roster.finalists.map((player) => player.id)).toContain(winnerId)
    expect(roster.finalists.map((player) => player.id)).toContain(runnerUpId)

    await tribunal.getByRole('button', { name: /Continue/ }).evaluate((element) => {
      const button = element as HTMLButtonElement
      button.click()
      button.click()
    })

    const winnerReveal = page.getByRole('dialog', { name: /Season \d+ winner reveal/ })
    await expect(winnerReveal).toBeVisible({ timeout: 10_000 })
    const persistedWinner = await readAppState(page)
    const winner = persistedWinner.game.players.find((player) => player.id === winnerId)
    const runnerUp = persistedWinner.game.players.find((player) => player.id === runnerUpId)
    if (!winner || !runnerUp) throw new Error('resolved finalists are absent from the game roster')

    expect(persistedWinner.game.players.filter((player) => player.isWinner)).toHaveLength(1)
    expect(persistedWinner.game.players.filter((player) => player.finalRank === 1)).toHaveLength(1)
    expect(persistedWinner.game.players.filter((player) => player.finalRank === 2)).toHaveLength(1)
    expect(winner.isWinner).toBe(true)
    expect(winner.finalRank).toBe(1)
    expect(runnerUp.finalRank).toBe(2)
    await expect(winnerReveal).toContainText(winner.name)

    await dismissPermissionPromptIfPresent(page)
    await winnerReveal.getByRole('button', { name: 'Continue' }).click()
    const interview = page.getByRole('dialog', { name: 'Winner interview' })
    await expect(interview).toBeVisible()
    await interview.getByRole('button', { name: 'Skip to end' }).click()

    const favoriteSetup = page.getByRole('dialog', { name: 'Public favorite setup' })
    await expect(favoriteSetup).toBeVisible()

    // Reducing the active roster through the debug fixture can send the route
    // guard home. Restore the game route without reloading the in-memory finale
    // so the game-screen-only public vote continues in its real host.
    await page.evaluate(() => {
      window.location.hash = '/game?debug=1'
    })
    await expect(page).toHaveURL(/#\/game\?debug=1$/)
    await expect(favoriteSetup).toBeVisible()
    await favoriteSetup.getByRole('button', { name: 'Skip to end' }).click()

    const favoriteVote = page.getByRole('dialog', {
      name: "Public's Favorite Player overlay",
    })
    await expect(favoriteVote).toBeVisible({ timeout: 15_000 })
    await expect(favoriteVote.getByText('The public has made its choice.')).toBeVisible()
    await expect(favoriteVote.locator('.pf-overlay__board')).toHaveCount(0)
    await page.screenshot({
      path: 'test-results/public-favorite-intro-mobile.png',
      fullPage: false,
    })
    await favoriteVote.getByRole('button', { name: 'Skip intro' }).click()
    await expect(favoriteVote.locator('.pf-cinematic__feature')).toBeVisible({
      timeout: 5_000,
    })
    await page.screenshot({
      path: 'test-results/public-favorite-feature-mobile.png',
      fullPage: false,
    })
    await favoriteVote.getByRole('button', { name: 'Fast forward public favorite vote' }).click()
    const favoriteContinue = favoriteVote.getByRole('button', { name: 'Continue' })
    await expect(favoriteContinue).toBeVisible({ timeout: 15_000 })
    await favoriteContinue.click()

    const goodbye = page.getByRole('dialog', { name: 'Final goodbye sequence' })
    await expect(goodbye).toBeVisible({ timeout: 10_000 })

    const rewardedState = await readAppState(page)
    const favoriteWinnerId = rewardedState.game.favoritePlayer?.winnerId ?? null
    expect(favoriteWinnerId).not.toBeNull()
    expect(rewardedState.game.favoritePlayer?.active).toBe(false)
    expect(eventCount(rewardedState, 'favoritePlayer:start')).toBe(1)
    expect(eventCount(rewardedState, 'favoritePlayer:winner')).toBe(1)
    expect(eventCount(rewardedState, 'favoritePlayer:award')).toBe(1)

    const persistedBeforeReload = await readPersistedRun(page)
    expect(persistedBeforeReload).toEqual({
      awardEvents: [{ awardAmount: 25000, winnerId: favoriteWinnerId ?? undefined }],
      favoriteWinnerId,
      finaleRunnerUpId: runnerUpId,
      finaleWinnerId: winnerId,
      seasonFinalePhase: 'goodbyeSequence',
    })

    // A real hard reload must not replay the favorite callback. Resume through
    // Home's production Continue Last control, then finish through the UI.
    await page.reload()
    expect(await readPersistedRun(page)).toEqual(persistedBeforeReload)
    await page.goto('./')
    await waitForHome(page)
    await resumeClassicRun(page)

    const resumedGoodbye = page.getByRole('dialog', { name: 'Final goodbye sequence' })
    await expect(resumedGoodbye).toBeVisible({ timeout: 10_000 })
    const resumedState = await readAppState(page)
    expect(eventCount(resumedState, 'favoritePlayer:award')).toBe(1)
    expect(resumedState.game.favoritePlayer?.winnerId).toBe(favoriteWinnerId)
    await expect(page.getByRole('dialog', { name: 'Season recap cinematic' })).toBeHidden()
    await expect(favoriteVote).toBeHidden()

    await resumedGoodbye.getByRole('button', { name: 'Skip to end' }).click()
    await expect(page).toHaveURL(/#\/game-over$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Season Complete' })).toBeVisible()

    const championBlock = page.getByText('Season champion', { exact: true }).locator('..')
    const runnerUpBlock = page.getByText('Runner-up', { exact: true }).locator('..')
    await expect(championBlock).toContainText(winner.name)
    await expect(runnerUpBlock).toContainText(runnerUp.name)

    const completedState = await readAppState(page)
    expect(completedState.game.seasonFinale?.phase).toBe('seasonComplete')
    expect(eventCount(completedState, 'favoritePlayer:award')).toBe(1)

    await page.locator('.gameover-actions').getByRole('button', { name: 'Home' }).click()
    await waitForHome(page)

    const archived = await readArchive(page)
    expect(archived.archiveCount).toBe(1)
    expect(archived.seasonId).toBeTruthy()
    expect(archived.classicRunPresent).toBe(false)
    expect(archived.legacySavePresent).toBe(false)
    expect(archived.summaries.filter((summary) => summary.finalPlacement === 1)).toEqual([
      expect.objectContaining({ playerId: winnerId }),
    ])
    expect(archived.summaries.filter((summary) => summary.finalPlacement === 2)).toEqual([
      expect.objectContaining({ playerId: runnerUpId }),
    ])
    expect(archived.summaries.filter((summary) => summary.wonPublicFavorite)).toEqual([
      expect.objectContaining({ playerId: favoriteWinnerId }),
    ])
    for (const juror of roster.jurors) {
      expect(archived.summaries).toContainEqual(
        expect.objectContaining({ madeJury: true, playerId: juror.id })
      )
    }

    // Reloading the archived home screen must retain the exact record without
    // replaying GameOver's archive action or the favorite-player reward.
    await page.reload()
    await waitForHome(page)
    const afterArchiveReload = await readArchive(page)
    expect(afterArchiveReload.archiveCount).toBe(1)
    expect(afterArchiveReload.seasonId).toBe(archived.seasonId)
    expect(afterArchiveReload.classicRunPresent).toBe(false)
    expect(afterArchiveReload.legacySavePresent).toBe(false)
    expect(afterArchiveReload.summaries.filter((summary) => summary.wonPublicFavorite)).toEqual([
      expect.objectContaining({ playerId: favoriteWinnerId }),
    ])
  })
})
