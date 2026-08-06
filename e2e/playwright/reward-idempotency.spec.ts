import { closeDebugPanelIfOpen, expect, readAppState, test, type Page } from './support/test'

const PROFILE_ID = 'e2e-reward-profile'
const PROFILE_NAME = 'Reward Journey Player'
const FIXTURE_SENTINEL_KEY = 'bbmobilenew:e2e:reward-fixture'
const PROFILES_STORAGE_KEY = 'bbmobilenew:profiles:v1'
const SETTINGS_STORAGE_KEY = 'bbmobilenew_settings_v1'
const ADS_STORAGE_KEY = 'bbmobilenew_ads_v1'
const SAVED_RUNS_KEY = `bbmobilenew:savedRuns:${encodeURIComponent(PROFILE_ID)}`
const CLASSIC_RUN_KEY = `bbmobilenew:savedRunSlot:${encodeURIComponent(PROFILE_ID)}:classic`
const SCREEN_TIMEOUT_MS = 30_000

type RewardBridgeWindow = Window & {
  __rewardBridgeDeliveries: string[]
  __rewardBridgeRequests: string[]
}

async function installRewardFixtureAndBridge(
  page: Page,
  bridgeMode: 'success' | 'throw' = 'success'
): Promise<void> {
  await page.addInitScript(
    ({
      fixtureSentinelKey,
      mode,
      profileId,
      profileName,
      profilesStorageKey,
      settingsStorageKey,
    }) => {
      if (localStorage.getItem(fixtureSentinelKey) !== 'installed') {
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
          })
        )
        localStorage.setItem(fixtureSentinelKey, 'installed')
      }

      const bridgeWindow = window as RewardBridgeWindow
      bridgeWindow.__rewardBridgeDeliveries = []
      bridgeWindow.__rewardBridgeRequests = []
      window.GameAds = {
        showInterstitial: () => undefined,
        showRewarded: (placement: string) => {
          bridgeWindow.__rewardBridgeRequests.push(placement)
          if (mode === 'throw') throw new Error('synthetic rewarded bridge failure')
          bridgeWindow.__rewardBridgeDeliveries.push('same-task')
          window.onAdRewardGranted?.(placement, { delivery: 'same-task' })
          window.setTimeout(() => {
            bridgeWindow.__rewardBridgeDeliveries.push('late-duplicate')
            window.onAdRewardGranted?.(placement, { delivery: 'late-duplicate' })
          }, 0)
        },
      }
    },
    {
      fixtureSentinelKey: FIXTURE_SENTINEL_KEY,
      mode: bridgeMode,
      profileId: PROFILE_ID,
      profileName: PROFILE_NAME,
      profilesStorageKey: PROFILES_STORAGE_KEY,
      settingsStorageKey: SETTINGS_STORAGE_KEY,
    }
  )
}

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await closeDebugPanelIfOpen(page)

  const permissionPrompt = page.getByRole('dialog', { name: 'Allow location' })
  if (await permissionPrompt.isVisible()) {
    await permissionPrompt.getByRole('checkbox', { name: 'Remember my choice' }).check()
    await permissionPrompt.getByRole('button', { name: 'Deny' }).click()
    await expect(permissionPrompt).toBeHidden()
  }

  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
}

async function startCampaign(page: Page): Promise<void> {
  await page.goto('./')
  await waitForHome(page)
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Campaign', exact: true }).click()

  const actionZone = page.getByRole('region', { name: 'Game action zone' })
  await expect(actionZone).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(actionZone.getByLabel('Day start', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: PROFILE_NAME, exact: true })).toBeVisible()
}

async function saveAndReturnHome(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^home$/i })
    .click()

  const saveDialog = page.getByRole('dialog', { name: 'Save and return home?' })
  await expect(saveDialog).toBeVisible()
  await saveDialog.getByRole('button', { name: 'Save & Home' }).click()
  await waitForHome(page)
}

async function resumeClassicRun(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu.getByRole('button', { name: 'Continue Last' })).toBeVisible()
  await playMenu.getByRole('button', { name: 'Continue Last' }).click()

  const actionZone = page.getByRole('region', { name: 'Game action zone' })
  await expect(actionZone).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(actionZone.getByLabel('Social phase', { exact: true })).toBeVisible()
}

async function closePhaseInformationIfPresent(page: Page): Promise<void> {
  const phaseInformation = page.getByRole('dialog', { name: /^Phase info:/ })
  if (await phaseInformation.isVisible()) {
    await phaseInformation.getByRole('button', { name: 'Close' }).click()
    await expect(phaseInformation).toBeHidden()
  }
}

async function createWeekTwoEnergyFixture(page: Page): Promise<{ humanId: string; lohId: string }> {
  return page.evaluate(
    ({ adsStorageKey, classicRunKey, savedRunsKey }) => {
      const raw = localStorage.getItem(classicRunKey)
      if (!raw) throw new Error('profile-scoped Classic save is missing')

      const snapshot = JSON.parse(raw) as {
        savedAt?: string
        game?: {
          lohId?: string | null
          nomineeIds?: string[]
          phase?: string
          players?: Array<{
            id: string
            isUser?: boolean
            stats?: { lohWins?: number }
            status?: string
          }>
          posWinnerId?: string | null
          povSavedId?: string | null
          prevHohId?: string | null
          week?: number
        }
        social?: {
          energyBank?: Record<string, number>
          panelOpen?: boolean
        }
      }
      const game = snapshot?.game
      const social = snapshot?.social
      if (!snapshot || !game || !social || !game.players || !social.energyBank) {
        throw new Error('Classic save does not contain a complete game and social snapshot')
      }

      const human = game.players.find((player) => player.isUser)
      const loh = game.players.find((player) => !player.isUser && player.status !== 'evicted')
      if (!human || !loh) throw new Error('fixture needs one human and one active AI housemate')

      for (const player of game.players) {
        if (player.status !== 'evicted' && player.status !== 'jury') player.status = 'active'
      }
      human.status = 'active'
      loh.status = 'loh'
      loh.stats = { ...loh.stats, lohWins: Math.max(1, loh.stats?.lohWins ?? 0) }

      game.week = 2
      game.phase = 'social_1'
      game.lohId = loh.id
      game.prevHohId = null
      game.nomineeIds = []
      game.posWinnerId = null
      game.povSavedId = null
      social.energyBank[human.id] = 0
      social.panelOpen = false

      const savedAt = '2026-07-21T00:01:00.000Z'
      snapshot.savedAt = savedAt
      localStorage.setItem(classicRunKey, JSON.stringify(snapshot))

      const metadataRaw = localStorage.getItem(savedRunsKey)
      if (metadataRaw) {
        const metadata = JSON.parse(metadataRaw) as { savedAt?: string }
        metadata.savedAt = savedAt
        localStorage.setItem(savedRunsKey, JSON.stringify(metadata))
      }
      localStorage.removeItem(adsStorageKey)

      return { humanId: human.id, lohId: loh.id }
    },
    {
      adsStorageKey: ADS_STORAGE_KEY,
      classicRunKey: CLASSIC_RUN_KEY,
      savedRunsKey: SAVED_RUNS_KEY,
    }
  )
}

test.describe('Rewarded social-energy economy journey', () => {
  test.setTimeout(90_000)

  test('rapid requests and duplicate native callbacks grant +3 exactly once and persist @core-journey @economy @reward @mobile @release', async ({
    page,
  }) => {
    await installRewardFixtureAndBridge(page)
    await startCampaign(page)
    await saveAndReturnHome(page)

    const fixture = await createWeekTwoEnergyFixture(page)
    await page.reload()
    await waitForHome(page)
    await resumeClassicRun(page)
    await closePhaseInformationIfPresent(page)

    const initialState = await readAppState(page)
    expect(initialState.game.week).toBe(2)
    expect(initialState.game.phase).toBe('social_1')
    expect(initialState.game.lohId).toBe(fixture.lohId)
    expect(initialState.social.energyBank[fixture.humanId]).toBe(0)
    expect(initialState.ads.dailyUsage.social_energy_recharge).toBeUndefined()

    const rewardPrompt = page.getByRole('dialog', { name: 'Out of Energy!' })
    await expect(rewardPrompt).toBeVisible()
    const watchButton = rewardPrompt.getByRole('button', { name: 'Watch Ad for +3 Energy' })
    await expect(watchButton).toBeEnabled()

    // Two clicks occur in the same browser task. The mock native bridge invokes
    // its first callback re-entrantly from showRewarded, then sends a duplicate
    // later as a wrapper can do after a lifecycle race.
    await watchButton.evaluate((element) => {
      const button = element as HTMLButtonElement
      button.click()
      button.click()
    })
    await expect
      .poll(() =>
        page.evaluate(() => (window as RewardBridgeWindow).__rewardBridgeDeliveries.slice())
      )
      .toEqual(['same-task', 'late-duplicate'])

    await expect(rewardPrompt).toBeHidden()
    const rewardedState = await readAppState(page)
    expect(rewardedState.social.energyBank[fixture.humanId]).toBe(3)
    expect(Object.keys(rewardedState.ads.dailyUsage)).toEqual(['social_energy_recharge'])
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10))
    expect(rewardedState.ads.dailyUsage.social_energy_recharge).toBe(today)
    expect(
      await page.evaluate(
        () =>
          (window as RewardBridgeWindow).__rewardBridgeRequests.filter(
            (placement) => placement === 'social_energy_recharge'
          ).length
      )
    ).toBe(1)

    await expect(page.getByRole('toolbar', { name: 'Game actions' })).toBeVisible()
    await saveAndReturnHome(page)
    await page.reload()
    await waitForHome(page)
    await resumeClassicRun(page)
    await closePhaseInformationIfPresent(page)

    const resumedState = await readAppState(page)
    expect(resumedState.social.energyBank[fixture.humanId]).toBe(3)
    expect(resumedState.ads.dailyUsage.social_energy_recharge).toBe(today)
    await expect(page.getByRole('dialog', { name: 'Out of Energy!' })).toBeHidden()

    const advance = page.getByRole('button', { name: 'Advance to next phase' })
    await expect(advance).toBeEnabled()
    await advance.click()
    await expect(
      page
        .getByRole('region', { name: 'Game action zone' })
        .getByLabel('Nominations', { exact: true })
    ).toBeVisible()
  })

  test('a rewarded bridge failure stays visible, grants nothing, and remains retryable @economy @reward @release', async ({
    page,
  }) => {
    await installRewardFixtureAndBridge(page, 'throw')
    await startCampaign(page)
    await saveAndReturnHome(page)

    const fixture = await createWeekTwoEnergyFixture(page)
    await page.reload()
    await waitForHome(page)
    await resumeClassicRun(page)
    await closePhaseInformationIfPresent(page)

    const rewardPrompt = page.getByRole('dialog', { name: 'Out of Energy!' })
    await expect(rewardPrompt).toBeVisible()
    const watchButton = rewardPrompt.getByRole('button', { name: 'Watch Ad for +3 Energy' })
    await watchButton.click()

    await expect(rewardPrompt).toBeVisible()
    await expect(watchButton).toBeEnabled()
    const failedState = await readAppState(page)
    expect(failedState.social.energyBank[fixture.humanId]).toBe(0)
    expect(failedState.ads.dailyUsage.social_energy_recharge).toBeUndefined()
    expect(
      await page.evaluate(
        () =>
          (window as RewardBridgeWindow).__rewardBridgeRequests.filter(
            (placement) => placement === 'social_energy_recharge'
          ).length
      )
    ).toBe(1)

    await rewardPrompt.getByRole('button', { name: 'No Thanks' }).click()
    await expect(rewardPrompt).toBeHidden()
    await saveAndReturnHome(page)
    await page.reload()
    await waitForHome(page)
    await resumeClassicRun(page)
    await closePhaseInformationIfPresent(page)
    const reloadedState = await readAppState(page)
    expect(reloadedState.social.energyBank[fixture.humanId]).toBe(0)
    expect(reloadedState.ads.dailyUsage.social_energy_recharge).toBeUndefined()
    await expect(page.getByRole('dialog', { name: 'Out of Energy!' })).toBeVisible()
  })
})
