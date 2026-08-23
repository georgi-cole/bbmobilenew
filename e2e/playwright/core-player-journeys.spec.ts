import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  E2E_NEW_SEASON_FIXTURE,
  expect,
  readAppState,
  test,
  type Locator,
  type Page,
} from './support/test'

const JOURNEY_TIMEOUT_MS = 90_000
const SCREEN_TIMEOUT_MS = 30_000
const COMPLETE_WEEK_TIMEOUT_MS = 240_000
// External persistence contracts. Keep these literal in Playwright so discovery
// does not import the browser-only Redux/game module graph into Node.
const SAVED_RUNS_KEY_PREFIX = 'bbmobilenew:savedRuns:'
const SAVED_STATE_KEY_PREFIX = 'bbmobilenew:savedSeason:'
const CORRUPT_SAVE_RECOVERY_KEY = 'bbmobilenew:recovery:lastCorruptSave'

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS * 2 })
  await closeDebugPanelIfOpen(page)

  await dismissPermissionPromptIfPresent(page)

  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function createProfileFromHome(page: Page, playerName: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()

  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await expect(page.getByRole('heading', { name: /Profiles/ })).toBeVisible()

  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill(playerName)
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()

  await expect
    .poll(async () => {
      const profiles = (await readAppState(page)).profiles
      const activeProfile = profiles.profiles.find(
        (profile) => profile.id === profiles.activeProfileId
      )
      return { activeName: activeProfile?.name ?? null, isGuest: profiles.isGuest }
    })
    .toEqual({ activeName: playerName, isGuest: false })
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

async function assertCampaignReady(page: Page, playerName: string): Promise<void> {
  const actionZone = page.getByRole('region', { name: 'Game action zone' })
  await expect(actionZone).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(actionZone.getByLabel('Season start', { exact: true })).toBeVisible()
  await expect(actionZone.getByLabel('Season 1, day 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Game actions' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /HUBMATES/ })).toBeVisible()
  await expect(page.getByRole('button', { name: playerName, exact: true })).toBeVisible()
}

async function startCampaignFromHome(page: Page, playerName: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()
  await assertCampaignReady(page, playerName)
}

async function startFreshCampaign(page: Page, playerName: string): Promise<void> {
  await page.goto('./')
  await waitForHome(page)
  await createProfileFromHome(page, playerName)
  await startCampaignFromHome(page, playerName)
}

async function closePhaseInformationIfPresent(page: Page): Promise<void> {
  const phaseInformation = page.getByRole('dialog', { name: /^Phase info:/ })
  if (await phaseInformation.isVisible()) {
    await phaseInformation.getByRole('button', { name: 'Close' }).click()
    await expect(phaseInformation).toBeHidden()
  }
}

async function saveAndReturnHome(page: Page): Promise<void> {
  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  await mainNavigation.getByRole('button', { name: /^home$/i }).click()

  const saveDialog = page.getByRole('dialog', { name: 'Save and return home?' })
  await expect(saveDialog).toBeVisible()
  await saveDialog.getByRole('button', { name: 'Save & Home' }).click()
  await waitForHome(page)
}

async function resumeLastRun(page: Page, expectedPhase: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu.getByRole('button', { name: 'Continue Last' })).toBeVisible()
  await playMenu.getByRole('button', { name: 'Continue Last' }).click()

  const actionZone = page.getByRole('region', { name: 'Game action zone' })
  await expect(actionZone).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(actionZone.getByLabel(expectedPhase, { exact: true })).toBeVisible()
}

async function openRulesFromGame(page: Page): Promise<void> {
  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  const directRulesButton = mainNavigation.getByRole('button', { name: /^rules$/i })
  if (await directRulesButton.isVisible()) {
    await directRulesButton.click()
    return
  }

  await mainNavigation.getByRole('button', { name: 'More', exact: true }).click()
  await page
    .getByRole('menu', { name: 'More destinations' })
    .getByRole('menuitem', { name: 'Rules', exact: true })
    .click()
}

async function clickFirstEnabled(buttons: Locator): Promise<void> {
  const count = await buttons.count()
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    if (await button.isEnabled()) {
      await button.click()
      return
    }
  }
  throw new Error('The required player-facing decision has no enabled option.')
}

async function completeActiveConfessionalDecision(page: Page): Promise<void> {
  const before = await readAppState(page)
  const confessional = page.getByRole('button', { name: /^Confessional \(\d+\)$/ })
  await expect(confessional).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(confessional).toBeEnabled()
  await confessional.click()

  const session = page.getByTestId('required-confessional-session')
  await expect(session).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  const panel = page.getByTestId('required-confessional-decision')
  await expect(panel).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })

  if (before.game.awaitingNominations) {
    const choices = panel.getByRole('group', { name: 'Nomination choices' }).getByRole('button')
    const confirm = panel.getByRole('button', { name: 'Confirm nominations' })
    const count = await choices.count()
    for (let index = 0; index < count && !(await confirm.isEnabled()); index += 1) {
      const choice = choices.nth(index)
      if (await choice.isEnabled()) await choice.click()
    }
    await expect(confirm).toBeEnabled()
    await confirm.click()
  } else if (before.game.awaitingPovDecision) {
    await panel.getByRole('button', { name: /Leave nominations unchanged/ }).click()
    const confirm = panel.getByRole('button', { name: 'Confirm power decision' })
    await expect(confirm).toBeEnabled()
    await confirm.click()
  } else if (before.game.replacementNeeded) {
    await clickFirstEnabled(panel.getByRole('group').getByRole('button'))
    const confirm = panel.getByRole('button', { name: 'Confirm replacement' })
    await expect(confirm).toBeEnabled()
    await confirm.click()
  } else if (before.game.awaitingHumanVote) {
    await clickFirstEnabled(panel.getByRole('group').getByRole('button'))
    const confirm = panel.getByRole('button', { name: 'Seal eviction vote' })
    await expect(confirm).toBeEnabled()
    await confirm.click()
  } else if (before.game.awaitingTieBreak) {
    const choices = panel.getByRole('group').getByRole('button')
    const confirm = panel.getByRole('button', {
      name: /Seal deciding vote|Confirm eliminations/,
    })
    const count = await choices.count()
    for (let index = 0; index < count && !(await confirm.isEnabled()); index += 1) {
      const choice = choices.nth(index)
      if (await choice.isEnabled()) await choice.click()
    }
    await expect(confirm).toBeEnabled()
    await confirm.click()
  } else {
    throw new Error(`Unsupported Confessional decision in ${before.game.phase}.`)
  }

  const returnToHouse = session.getByRole('button', { name: 'Return to the House' })
  await expect(returnToHouse).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect(session).toBeVisible()
  await returnToHouse.click()
  await expect(session).toBeHidden({ timeout: SCREEN_TIMEOUT_MS })

  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

function hasCoreWeekDecision(game: Awaited<ReturnType<typeof readAppState>>['game']): boolean {
  return (
    game.awaitingNominations ||
    game.awaitingPovDecision ||
    game.replacementNeeded ||
    game.awaitingHumanVote ||
    game.awaitingTieBreak
  )
}

async function resolveCompetitionThroughPlayerControls(page: Page, phase: string): Promise<void> {
  const utilityMenu = page.getByRole('button', { name: 'Open minigame menu' })
  await expect
    .poll(
      async () => {
        if (await utilityMenu.isVisible()) return true
        return (await readAppState(page)).game.phase !== phase
      },
      {
        message: `${phase} should present a human challenge or resolve its AI-only field`,
        timeout: SCREEN_TIMEOUT_MS,
      }
    )
    .toBe(true)

  if (!(await utilityMenu.isVisible())) return

  await utilityMenu.click()
  const leaveCompetition = page.getByRole('menuitem', { name: /Leave competition/i })
  await expect(leaveCompetition).toBeVisible()
  await leaveCompetition.click()

  const confirmExit = page.getByRole('button', { name: 'Exit with 0' })
  await expect(confirmExit).toBeVisible()
  await confirmExit.click()
  await expect(page.getByRole('heading', { name: 'Exited early' })).toBeVisible()
  const closeResults = page.getByRole('button', { name: 'Close results' })
  const continueWithResult = page.getByRole('button', { name: /Continue.*▶/ })
  await expect(closeResults.or(continueWithResult).first()).toBeVisible()
  if (await closeResults.isVisible()) {
    await closeResults.evaluate((button) => (button as HTMLButtonElement).click())
  } else {
    await continueWithResult.click()
  }
  await expect
    .poll(() => readAppState(page).then((state) => state.game.phase), {
      message: `${phase} should commit a result after the player continues`,
      timeout: SCREEN_TIMEOUT_MS,
    })
    .not.toBe(phase)
}

async function advanceToFirstSocialPhase(page: Page): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await closePhaseInformationIfPresent(page)
    const phase = (await readAppState(page)).game.phase
    if (phase === 'social_1') return

    if (phase === 'loh_comp') {
      await resolveCompetitionThroughPlayerControls(page, phase)
      continue
    }

    const optionalContinue = page.getByRole('button', { name: 'Continue', exact: true })
    if (await optionalContinue.isVisible()) {
      await optionalContinue.click()
      continue
    }

    const advance = page.getByRole('button', { name: 'Advance to next phase' })
    await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
    await expect(advance).toBeEnabled()
    await advance.click()
  }

  throw new Error('The first social phase was not reachable through player controls.')
}

async function advanceToLohAnnouncement(page: Page): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    await closePhaseInformationIfPresent(page)
    if ((await readAppState(page)).game.phase === 'loh_comp_announcement') return

    const optionalContinue = page.getByRole('button', { name: 'Continue', exact: true })
    if (await optionalContinue.isVisible()) {
      await optionalContinue.click()
      continue
    }

    const advance = page.getByRole('button', { name: 'Advance to next phase' })
    await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
    await expect(advance).toBeEnabled()
    await advance.click()
  }

  throw new Error('The LOH competition announcement was not reachable through player controls.')
}

async function playOneCompleteWeek(page: Page): Promise<{
  endState: Awaited<ReturnType<typeof readAppState>>
  evidence: {
    lohWinnerId: string | null
    nominationIds: string[]
    posWinnerId: string | null
    posSafetyOutcome: 'used' | 'held' | null
    posSafetyResultEventCount: number | null
    posBackupNomineeEventCount: number | null
    posPendingMinigameCleared: boolean
    posRepeatedInputBlocked: boolean
    reloadedNominationFeedCount: number | null
    voteResults: Record<string, number> | null
    weekEndDoubleActivated: boolean
  }
  phaseHistory: string[]
}> {
  const phaseHistory: string[] = []
  const seen = new Set<string>()
  const evidence = {
    lohWinnerId: null as string | null,
    nominationIds: [] as string[],
    posWinnerId: null as string | null,
    posSafetyOutcome: null as 'used' | 'held' | null,
    posSafetyResultEventCount: null as number | null,
    posBackupNomineeEventCount: null as number | null,
    posPendingMinigameCleared: false,
    posRepeatedInputBlocked: false,
    reloadedNominationFeedCount: null as number | null,
    voteResults: null as Record<string, number> | null,
    weekEndDoubleActivated: false,
  }
  let reloadedDuringNominations = false

  for (let step = 0; step < 60; step += 1) {
    const state = await readAppState(page)
    const { game } = state
    const phaseKey = `${game.week}:${game.phase}`
    if (!seen.has(phaseKey)) {
      seen.add(phaseKey)
      phaseHistory.push(game.phase)
    }

    if (game.phase === 'loh_results' && game.lohId) evidence.lohWinnerId = game.lohId
    if (game.phase === 'nomination_results' && game.nomineeIds.length > 0) {
      evidence.nominationIds = [...game.nomineeIds]
    }
    if (game.phase === 'pos_results' && game.posWinnerId) {
      evidence.posWinnerId = game.posWinnerId
    }
    if (game.voteResults != null) evidence.voteResults = { ...game.voteResults }

    if (game.week === 2 && game.phase === 'week_start') {
      return { endState: state, evidence, phaseHistory }
    }

    if (
      game.phase === 'nomination_results' &&
      game.nomineeIds.length > 0 &&
      !reloadedDuringNominations
    ) {
      reloadedDuringNominations = true
      await closePhaseInformationIfPresent(page)
      const beforeReload = {
        tvFeedCount: game.tvFeed.length,
        nomineeIds: [...game.nomineeIds],
        phase: game.phase,
        seed: game.seed,
        week: game.week,
      }
      await saveAndReturnHome(page)
      await page.reload()
      await waitForHome(page)
      await resumeLastRun(page, 'Nomination results')
      const afterReload = await readAppState(page)
      expect({
        tvFeedCount: afterReload.game.tvFeed.length,
        nomineeIds: afterReload.game.nomineeIds,
        phase: afterReload.game.phase,
        seed: afterReload.game.seed,
        week: afterReload.game.week,
      }).toEqual(beforeReload)
      evidence.reloadedNominationFeedCount = afterReload.game.tvFeed.length
      continue
    }

    if (game.phase === 'loh_comp' || game.phase === 'pos_comp') {
      await resolveCompetitionThroughPlayerControls(page, game.phase)
      continue
    }

    if (hasCoreWeekDecision(game)) {
      await completeActiveConfessionalDecision(page)
      continue
    }

    if (game.phase === 'pos_ceremony_results') {
      await closePhaseInformationIfPresent(page)
      const beforeProgress = JSON.stringify({
        week: game.week,
        phase: game.phase,
        aiReplacementStep: game.aiReplacementStep,
        aiReplacementWaiting: game.aiReplacementWaiting,
        nomineeIds: game.nomineeIds,
        povSavedId: game.povSavedId,
        seed: game.seed,
      })

      if (game.aiReplacementStep === 1) {
        const safetyEvents = game.tvFeed.filter((event) =>
          event.text.includes('Power of Safety on')
        )
        expect(safetyEvents).toHaveLength(1)
        expect(game.povSavedId).not.toBeNull()
        expect(game.pendingMinigame ?? null).toBeNull()
        evidence.posSafetyResultEventCount = safetyEvents.length
        evidence.posPendingMinigameCleared = true
        evidence.posSafetyOutcome = 'used'
      } else if (game.aiReplacementStep === 0 && game.povSavedId == null) {
        const heldEvents = game.tvFeed.filter((event) =>
          event.text.includes('decided NOT to use the Power of Safety')
        )
        expect(heldEvents).toHaveLength(1)
        expect(game.pendingMinigame ?? null).toBeNull()
        evidence.posSafetyOutcome = 'held'
        evidence.posSafetyResultEventCount = 0
        evidence.posBackupNomineeEventCount = 0
        evidence.posPendingMinigameCleared = true
      }

      const advance = page.getByRole('button', { name: 'Advance to next phase' })
      await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
      await expect(advance).toBeEnabled()
      await advance.click({ trial: true })

      await advance.evaluate((element) => {
        const button = element as HTMLButtonElement
        button.click()
        button.click()
      })

      await expect
        .poll(
          async () => {
            const current = (await readAppState(page)).game
            return JSON.stringify({
              week: current.week,
              phase: current.phase,
              aiReplacementStep: current.aiReplacementStep,
              aiReplacementWaiting: current.aiReplacementWaiting,
              nomineeIds: current.nomineeIds,
              povSavedId: current.povSavedId,
              seed: current.seed,
            })
          },
          {
            message: `Safety ceremony should progress from ${beforeProgress}`,
          }
        )
        .not.toBe(beforeProgress)

      const after = (await readAppState(page)).game
      if (game.aiReplacementStep === 1) {
        expect(after.phase).toBe('pos_ceremony_results')
        expect(after.aiReplacementStep).toBe(2)
        expect(
          after.tvFeed.filter((event) => event.text.includes('is selecting a backup nominee'))
        ).toHaveLength(1)
      } else if (game.aiReplacementStep === 2) {
        expect(after.phase).toBe('pos_ceremony_results')
        expect(after.aiReplacementStep).toBe(0)
        expect(after.nomineeIds).toHaveLength(2)
        const replacementEvents = after.tvFeed.filter(
          (event) => event.text.includes('named') && event.text.includes('backup nominee')
        )
        expect(replacementEvents).toHaveLength(1)
        evidence.posBackupNomineeEventCount = replacementEvents.length
        evidence.posRepeatedInputBlocked = true
      } else {
        expect(after.phase).toBe('social_2')
        evidence.posRepeatedInputBlocked = true
      }
      continue
    }

    const optionalContinue = page.getByRole('button', { name: 'Continue', exact: true })
    if (await optionalContinue.isVisible()) {
      await optionalContinue.click()
      continue
    }

    if (game.phase === 'eviction_results') {
      const advance = page.getByRole('button', { name: 'Advance to next phase' })
      await expect
        .poll(
          async () => {
            const current = (await readAppState(page)).game
            return (
              current.phase !== 'eviction_results' ||
              current.awaitingTieBreak ||
              (current.voteResults == null &&
                current.pendingEviction == null &&
                (await advance.isVisible()))
            )
          },
          {
            message: 'vote reveal and eviction ceremony should reach a player-usable state',
            timeout: 90_000,
          }
        )
        .toBe(true)
      continue
    }

    const advance = page.getByRole('button', { name: 'Advance to next phase' })
    await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
    await expect(advance).toBeEnabled()
    if (game.phase === 'week_end') {
      await advance.evaluate((element) => {
        const button = element as HTMLButtonElement
        button.click()
        button.click()
      })
      evidence.weekEndDoubleActivated = true
    } else {
      await advance.click()
    }
  }

  const finalGame = (await readAppState(page)).game
  throw new Error(
    `A complete week exceeded its 60-control safety bound: ${phaseHistory.join(' -> ')}; final state=${JSON.stringify(
      {
        seed: finalGame.seed,
        week: finalGame.week,
        phase: finalGame.phase,
        aiReplacementStep: finalGame.aiReplacementStep,
        aiReplacementWaiting: finalGame.aiReplacementWaiting,
        pendingMinigame: finalGame.pendingMinigame,
        nomineeIds: finalGame.nomineeIds,
        povSavedId: finalGame.povSavedId,
      }
    )}`
  )
}

test.describe('Real player core journeys', () => {
  test.setTimeout(JOURNEY_TIMEOUT_MS)

  test('fresh player creates a profile and launches a usable campaign @smoke @core-journey @mobile @release', async ({
    page,
  }) => {
    await startFreshCampaign(page, 'Fresh Journey Player')
  })

  test('a deterministic real-control week produces exactly one eviction and a usable next week @smoke @core-journey @full-week @mobile @release', async ({
    page,
  }, testInfo) => {
    test.setTimeout(COMPLETE_WEEK_TIMEOUT_MS)
    await startFreshCampaign(page, 'Complete Week Player')

    const initialState = await readAppState(page)
    expect(initialState.game.seed).toBe(E2E_NEW_SEASON_FIXTURE.seasonSeed)
    expect(initialState.game.week).toBe(1)
    expect(initialState.game.phase).toBe('season_start')
    const initialActiveIds = initialState.game.players
      .filter((player) => player.status === 'active')
      .map((player) => player.id)

    const { endState, evidence, phaseHistory } = await playOneCompleteWeek(page)
    const requiredPhases = [
      'loh_comp',
      'loh_results',
      'nomination_results',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
      'live_vote',
      'eviction_results',
      'week_end',
    ]
    for (const phase of requiredPhases) expect(phaseHistory).toContain(phase)

    const initialActiveIdSet = new Set(initialActiveIds)
    expect(evidence.lohWinnerId).not.toBeNull()
    expect(initialActiveIdSet.has(evidence.lohWinnerId ?? '')).toBe(true)
    expect(evidence.nominationIds.length).toBeGreaterThanOrEqual(2)
    expect(new Set(evidence.nominationIds).size).toBe(evidence.nominationIds.length)
    expect(evidence.nominationIds).not.toContain(evidence.lohWinnerId)
    for (const nomineeId of evidence.nominationIds) {
      expect(initialActiveIdSet.has(nomineeId)).toBe(true)
    }
    expect(evidence.posWinnerId).not.toBeNull()
    expect(initialActiveIdSet.has(evidence.posWinnerId ?? '')).toBe(true)
    if (testInfo.project.name === 'mobile-chromium') {
      expect(evidence.posSafetyOutcome).not.toBeNull()
      expect(evidence.posPendingMinigameCleared).toBe(true)
      expect(evidence.posRepeatedInputBlocked).toBe(true)
      if (evidence.posSafetyOutcome === 'used') {
        expect(evidence.posSafetyResultEventCount).toBe(1)
        expect(evidence.posBackupNomineeEventCount).toBe(1)
      } else {
        expect(evidence.posSafetyOutcome).toBe('held')
        expect(evidence.posSafetyResultEventCount).toBe(0)
        expect(evidence.posBackupNomineeEventCount).toBe(0)
      }
    }
    expect(evidence.reloadedNominationFeedCount).not.toBeNull()
    expect(evidence.weekEndDoubleActivated).toBe(true)
    expect(evidence.voteResults).not.toBeNull()
    for (const votes of Object.values(evidence.voteResults ?? {})) {
      expect(Number.isFinite(votes)).toBe(true)
      expect(votes).toBeGreaterThanOrEqual(0)
    }

    const endPlayersById = new Map(endState.game.players.map((player) => [player.id, player]))
    const eliminatedIds = initialActiveIds.filter(
      (id) => endPlayersById.get(id)?.status !== 'active'
    )
    expect(eliminatedIds).toHaveLength(1)
    const eliminatedId = eliminatedIds[0]
    const eliminatedPlayer = endPlayersById.get(eliminatedId)
    expect(eliminatedPlayer?.seasonPlacement).toBe(initialActiveIds.length)
    const maxVotes = Math.max(...Object.values(evidence.voteResults ?? {}))
    expect(evidence.voteResults?.[eliminatedId]).toBe(maxVotes)
    expect(
      endState.game.tvFeed.some(
        (event) =>
          event.text.includes(eliminatedPlayer?.name ?? '') && /eliminat|evict/i.test(event.text)
      )
    ).toBe(true)
    expect(endState.game.players.filter((player) => player.status === 'active')).toHaveLength(
      initialActiveIds.length - 1
    )
    expect(endState.game.pendingEviction).toBeNull()
    expect(endState.game.voteResults).toBeNull()
    expect(endState.game.week).toBe(2)
    expect(endState.game.phase).toBe('week_start')

    const actionZone = page.getByRole('region', { name: 'Game action zone' })
    await expect(actionZone.getByLabel('Day start', { exact: true })).toBeVisible()
    await expect(actionZone.getByLabel('Season 1, day 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Advance to next phase' })).toBeEnabled()
  })

  test('saved progress survives a browser reload and resumes at the exact phase @smoke @core-journey @mobile @release', async ({
    page,
  }) => {
    const playerName = 'Resume Journey Player'
    await startFreshCampaign(page, playerName)

    const actionZone = page.getByRole('region', { name: 'Game action zone' })
    await advanceToLohAnnouncement(page)
    await expect(actionZone.getByLabel('LOH competition', { exact: true })).toBeVisible()
    await closePhaseInformationIfPresent(page)

    await actionZone.getByRole('button', { name: 'Save game' }).click()
    const savedDialog = page.getByRole('dialog', { name: 'Saved', exact: true })
    await expect(savedDialog).toContainText('Your season is ready to resume later.')
    await savedDialog.getByRole('button', { name: 'OK' }).click()

    await saveAndReturnHome(page)
    await page.reload()
    await waitForHome(page)
    await resumeLastRun(page, 'LOH competition')

    await expect(page.getByRole('button', { name: playerName, exact: true })).toBeVisible()
    await expect(actionZone.getByLabel('Season 1, day 1', { exact: true })).toBeVisible()
  })

  test('a completed LOH competition can be saved and resumed @persistence @release', async ({
    page,
  }) => {
    const playerName = 'LOH Resume Player'
    await startFreshCampaign(page, playerName)

    await advanceToLohAnnouncement(page)
    await closePhaseInformationIfPresent(page)

    const advance = page.getByRole('button', { name: 'Advance to next phase' })
    await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
    await advance.click()
    await resolveCompetitionThroughPlayerControls(page, 'loh_comp')
    await expect
      .poll(() => readAppState(page).then((state) => state.game.phase), {
        timeout: SCREEN_TIMEOUT_MS,
      })
      .toBe('loh_results')

    await saveAndReturnHome(page)
    await page.reload()
    await waitForHome(page)
    await resumeLastRun(page, 'LOH results')

    await expect(page.getByRole('button', { name: playerName, exact: true })).toBeVisible()
  })

  test('production navigation returns to the active game and an unknown deep link recovers home @smoke @core-journey @mobile @release', async ({
    page,
  }) => {
    await startFreshCampaign(page, 'Navigation Player')

    await openRulesFromGame(page)
    await expect(page.getByRole('heading', { name: 'How to Play' })).toBeVisible()
    await page.getByRole('button', { name: 'Go back', exact: true }).click()
    await expect(page.getByRole('toolbar', { name: 'Game actions' })).toBeVisible()

    await page.goto('./#/route-that-does-not-exist')
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible()
    await expect(page.getByText('/route-that-does-not-exist', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Go Home/ }).click()
    await waitForHome(page)
  })

  test('a rapidly repeated social action charges once and the resource balance survives reload @core-journey @economy @mobile @release', async ({
    page,
  }) => {
    await startFreshCampaign(page, 'Economy Journey Player')
    await advanceToFirstSocialPhase(page)

    const gameActions = page.getByRole('toolbar', { name: 'Game actions' })
    await gameActions.getByRole('button', { name: /^Social(?: \(\d+\))?$/ }).click()

    const socialDialog = page.getByRole('dialog', { name: 'Social Phase' })
    await expect(socialDialog).toBeVisible()
    const energyChip = socialDialog.getByLabel(/^Energy: \d+$/)
    const initialEnergyLabel = await energyChip.getAttribute('aria-label')
    const initialEnergy = Number(initialEnergyLabel?.match(/\d+/)?.[0])
    expect(initialEnergy).toBeGreaterThanOrEqual(1)

    await socialDialog.locator('[aria-label="Player roster"]').getByRole('button').first().click()
    await socialDialog
      .locator('[aria-label="Action grid"]')
      .getByRole('button', { name: /Compliment/ })
      .click()
    await expect(socialDialog.getByText(/Cost:/)).toContainText('1')

    await socialDialog.getByRole('button', { name: 'Execute' }).dblclick()
    const remainingEnergy = initialEnergy - 1
    await expect(
      socialDialog.getByLabel(`Energy: ${remainingEnergy}`, { exact: true })
    ).toBeVisible()

    await socialDialog.getByRole('button', { name: 'Close social panel' }).click()
    await expect(socialDialog).toBeHidden()
    await saveAndReturnHome(page)

    await page.reload()
    await waitForHome(page)
    await resumeLastRun(page, 'Social phase')
    await gameActions.getByRole('button', { name: /^Social(?: \(\d+\))?$/ }).click()
    await expect(
      page
        .getByRole('dialog', { name: 'Social Phase' })
        .getByLabel(`Energy: ${remainingEnergy}`, { exact: true })
    ).toBeVisible()
  })

  test('a legacy save migrates and a corrupt current save recovers without harming another profile @persistence @release', async ({
    page,
  }) => {
    const playerName = 'Persistence Player'
    await startFreshCampaign(page, playerName)

    const actionZone = page.getByRole('region', { name: 'Game action zone' })
    await advanceToLohAnnouncement(page)
    await expect(actionZone.getByLabel('LOH competition', { exact: true })).toBeVisible()
    await closePhaseInformationIfPresent(page)

    await actionZone.getByRole('button', { name: 'Save game' }).click()
    const savedDialog = page.getByRole('dialog', { name: 'Saved', exact: true })
    await expect(savedDialog).toContainText('Your season is ready to resume later.')
    await savedDialog.getByRole('button', { name: 'OK' }).click()
    await saveAndReturnHome(page)

    const fixture = await page.evaluate(
      ({ runsPrefix, statePrefix }) => {
        const profilesRaw = localStorage.getItem('bbmobilenew:profiles:v1')
        if (!profilesRaw) throw new Error('active profiles record is missing')
        const profiles = JSON.parse(profilesRaw) as { activeProfileId?: string | null }
        const profileId = profiles.activeProfileId
        if (!profileId) throw new Error('active profile id is missing')

        const encodedProfileId = encodeURIComponent(profileId)
        const runsKey = `${runsPrefix}${encodedProfileId}`
        const legacyKey = `${statePrefix}${encodedProfileId}`
        const savedRunsRaw = localStorage.getItem(runsKey)
        if (!savedRunsRaw) throw new Error('current saved-run profile is missing')
        const savedRuns = JSON.parse(savedRunsRaw) as {
          runs?: { classic?: { game?: { phase?: string; runId?: string; gameId?: string } } }
        }
        const classic = savedRuns.runs?.classic
        if (!classic) throw new Error('current Classic snapshot is missing')

        localStorage.setItem(legacyKey, JSON.stringify(classic))
        localStorage.removeItem(runsKey)

        return {
          legacyKey,
          phase: classic.game?.phase ?? null,
          runIdentity: classic.game?.runId ?? classic.game?.gameId ?? null,
          runsKey,
        }
      },
      { runsPrefix: SAVED_RUNS_KEY_PREFIX, statePrefix: SAVED_STATE_KEY_PREFIX }
    )

    expect(fixture.phase).toBe('loh_comp_announcement')
    expect(fixture.runIdentity).toBeTruthy()

    await page.reload()
    await waitForHome(page)
    await resumeLastRun(page, 'LOH competition')
    await expect(page.getByRole('button', { name: playerName, exact: true })).toBeVisible()

    await expect
      .poll(() =>
        page.evaluate((runsKey) => {
          const raw = localStorage.getItem(runsKey)
          if (!raw) return null
          const parsed = JSON.parse(raw) as {
            version?: number
            runs?: { classic?: { game?: { phase?: string; runId?: string; gameId?: string } } }
          }
          return {
            phase: parsed.runs?.classic?.game?.phase ?? null,
            runIdentity:
              parsed.runs?.classic?.game?.runId ?? parsed.runs?.classic?.game?.gameId ?? null,
            version: parsed.version ?? null,
          }
        }, fixture.runsKey)
      )
      .toEqual({ phase: 'loh_comp', runIdentity: fixture.runIdentity, version: 2 })

    await saveAndReturnHome(page)

    const corruptRaw = '{"version":2,"damaged":'
    const unrelatedKey = `${SAVED_RUNS_KEY_PREFIX}unrelated-preservation-fixture`
    const unrelatedRaw = JSON.stringify({
      activeRunId: null,
      lastPlayedRunId: null,
      profileId: 'unrelated-preservation-fixture',
      runs: {},
      savedAt: '2026-07-21T00:00:00.000Z',
      stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
      version: 2,
    })

    await page.evaluate(
      ({ damaged, runsKey, sentinelKey, sentinelValue }) => {
        localStorage.setItem(sentinelKey, sentinelValue)
        localStorage.setItem(runsKey, damaged)
      },
      {
        damaged: corruptRaw,
        runsKey: fixture.runsKey,
        sentinelKey: unrelatedKey,
        sentinelValue: unrelatedRaw,
      }
    )

    await page.reload()
    await page.waitForLoadState('networkidle')
    await waitForHome(page)

    const recoveryNotice = page.getByRole('alert')
    await expect(recoveryNotice).toContainText('Save recovered safely')
    await expect(recoveryNotice).toContainText('A damaged save was set aside.')

    const recoveryState = await page.evaluate(
      ({ recoveryKey, runsKey, sentinelKey }) => ({
        current: localStorage.getItem(runsKey),
        quarantined: sessionStorage.getItem(recoveryKey),
        unrelated: localStorage.getItem(sentinelKey),
      }),
      {
        recoveryKey: CORRUPT_SAVE_RECOVERY_KEY,
        runsKey: fixture.runsKey,
        sentinelKey: unrelatedKey,
      }
    )
    expect(recoveryState).toEqual({
      current: null,
      quarantined: corruptRaw,
      unrelated: unrelatedRaw,
    })

    await resumeLastRun(page, 'LOH competition')
    await expect(page.getByRole('button', { name: playerName, exact: true })).toBeVisible()
    await expect(actionZone.getByLabel('LOH competition', { exact: true })).toBeVisible()
  })
})
