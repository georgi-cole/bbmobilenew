import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBigEyeVipInstallationId,
  getBigEyeVipStatus,
  requestBigEyeVipReply,
} from '../bigEyeVip'

const world = {
  season: 1,
  week: 2,
  phase: 'social',
  playerStatus: 'active',
  leaderName: null,
  nomineeNames: [],
  safetyWinnerName: null,
  remainingHousemates: ['Alex'],
  playerStats: { leaderWins: 0, safetyWins: 0, timesNominated: 0 },
  closestRelationships: [],
  recentPublicEvents: [],
}

describe('Big Eye VIP client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_BIG_EYE_VIP_API_URL', 'https://vip.example.workers.dev/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps one anonymous installation identity on the device', () => {
    const first = getBigEyeVipInstallationId()
    const second = getBigEyeVipInstallationId()
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(7)
  })

  it('loads the server-owned quota status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        available: true,
        plan: 'free',
        period: 'season',
        limit: 3,
        used: 1,
        remaining: 2,
      })
    )

    await expect(getBigEyeVipStatus('game-1:1')).resolves.toMatchObject({ remaining: 2 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://vip.example.workers.dev/api/vip-confessional/status?seasonId=game-1%3A1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Big-Eye-Install-Id': expect.any(String) }),
      })
    )
  })

  it('requests one reply without calculating credits in the browser', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        text: 'You asked plainly, so I will answer plainly.',
        requestId: 'request-1',
        available: true,
        plan: 'free',
        period: 'season',
        limit: 3,
        used: 1,
        remaining: 2,
      })
    )

    const response = await requestBigEyeVipReply({
      seasonId: 'game-1:1',
      playerName: 'George',
      diaryText: 'How are you?',
      intent: 'wellbeing_question',
      history: [],
      memorySummary: '',
      world,
    })

    expect(response.remaining).toBe(2)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('surfaces refunded quota status when generation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          error: 'VIP generation failed. Your credit was returned.',
          code: 'AI_UNAVAILABLE',
          status: {
            available: true,
            plan: 'free',
            period: 'season',
            limit: 3,
            used: 0,
            remaining: 3,
          },
        },
        { status: 503 }
      )
    )

    await expect(
      requestBigEyeVipReply({
        seasonId: 'game-1:1',
        playerName: 'George',
        diaryText: 'I feel betrayed.',
        intent: 'betrayal',
        history: [],
        memorySummary: '',
        world,
      })
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' })
  })
})
