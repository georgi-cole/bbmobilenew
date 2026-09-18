import { describe, expect, it } from 'vitest'
import { simulateRealitySeason } from '../realitySeasonSimulation'

const CALIBRATION_SEEDS = Array.from({ length: 24 }, (_, index) => 101 + index * 37)

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, places = 2): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

describe('Reality alliance ecology calibration', () => {
  it('reports alliance formation, overlap, lifecycle, secrecy, and coordination across seeded seasons', () => {
    const reports = CALIBRATION_SEEDS.map((seed) =>
      simulateRealitySeason(seed, { days: 16, castSize: 12 })
    )

    const alliancesPerSeason: number[] = []
    const liveAlliancesPerSeason: number[] = []
    const largestAlliancePerSeason: number[] = []
    const maxLivePactsPerActorPerSeason: number[] = []
    const meanLiveCohesionPerSeason: number[] = []
    const meanLiveSecrecyPerSeason: number[] = []
    const meanLiveCommitmentPerSeason: number[] = []

    const statusCounts: Record<string, number> = {}
    const sizeCounts: Record<string, number> = {}
    const eventCounts: Record<string, number> = {
      ALLIANCE_FORMED: 0,
      ALLIANCE_MEMBER_RECRUITED: 0,
      ALLIANCE_TARGET_COORDINATED: 0,
      ALLIANCE_FALSE_PRETENSE_ESTABLISHED: 0,
      ALLIANCE_LEAKED: 0,
      ALLIANCE_PUBLICLY_EXPOSED: 0,
      ALLIANCE_BETRAYAL: 0,
    }

    let totalAlliances = 0
    let liveAlliances = 0
    let namedAlliances = 0
    let overlapLinks = 0
    let infiltratorAlliances = 0
    let nonGenuineAlliances = 0

    for (const report of reports) {
      const alliances = Object.values(report.domain.alliances)
      const live = alliances.filter(
        (alliance) => alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY'
      )

      alliancesPerSeason.push(alliances.length)
      liveAlliancesPerSeason.push(live.length)
      largestAlliancePerSeason.push(
        alliances.reduce((maximum, alliance) => Math.max(maximum, alliance.memberIds.length), 0)
      )

      totalAlliances += alliances.length
      liveAlliances += live.length
      namedAlliances += alliances.filter((alliance) => Boolean(alliance.name?.trim())).length
      overlapLinks += alliances.reduce(
        (sum, alliance) => sum + new Set(alliance.overlapAllianceIds).size,
        0
      )
      infiltratorAlliances += alliances.filter((alliance) => alliance.infiltratorIds.length > 0).length
      nonGenuineAlliances += alliances.filter((alliance) => !alliance.genuine).length

      for (const alliance of alliances) {
        statusCounts[alliance.status] = (statusCounts[alliance.status] ?? 0) + 1
        const sizeKey = String(alliance.memberIds.length)
        sizeCounts[sizeKey] = (sizeCounts[sizeKey] ?? 0) + 1

        expect(alliance.memberIds.length).toBeGreaterThanOrEqual(2)
        expect(new Set(alliance.memberIds).size).toBe(alliance.memberIds.length)
        expect(alliance.cohesion).toBeGreaterThanOrEqual(0)
        expect(alliance.cohesion).toBeLessThanOrEqual(1)
        expect(alliance.secrecy).toBeGreaterThanOrEqual(0)
        expect(alliance.secrecy).toBeLessThanOrEqual(1)
        expect(alliance.fractureRisk).toBeGreaterThanOrEqual(0)
        expect(alliance.fractureRisk).toBeLessThanOrEqual(1)
      }

      const membershipLoad = new Map<string, number>()
      for (const alliance of live) {
        for (const memberId of alliance.memberIds) {
          membershipLoad.set(memberId, (membershipLoad.get(memberId) ?? 0) + 1)
        }
      }
      maxLivePactsPerActorPerSeason.push(
        Math.max(0, ...Array.from(membershipLoad.values()))
      )

      const liveCommitments = live.flatMap((alliance) =>
        alliance.memberIds.map((memberId) => alliance.memberCommitment[memberId] ?? 0.5)
      )
      meanLiveCohesionPerSeason.push(average(live.map((alliance) => alliance.cohesion)))
      meanLiveSecrecyPerSeason.push(average(live.map((alliance) => alliance.secrecy)))
      meanLiveCommitmentPerSeason.push(average(liveCommitments))

      for (const event of report.domain.events) {
        if (event.type in eventCounts) eventCounts[event.type] += 1
      }
    }

    const summary = {
      seasons: reports.length,
      daysPerSeason: 16,
      castSize: 12,
      alliances: {
        total: totalAlliances,
        perSeasonMean: round(average(alliancesPerSeason)),
        perSeasonMin: Math.min(...alliancesPerSeason),
        perSeasonMax: Math.max(...alliancesPerSeason),
        liveAtFinishTotal: liveAlliances,
        liveAtFinishMean: round(average(liveAlliancesPerSeason)),
        largestAllianceMean: round(average(largestAlliancePerSeason)),
        largestAllianceMax: Math.max(...largestAlliancePerSeason),
        namedShare: totalAlliances === 0 ? 0 : round(namedAlliances / totalAlliances, 3),
        overlapPairsApprox: Math.round(overlapLinks / 2),
        infiltratorShare:
          totalAlliances === 0 ? 0 : round(infiltratorAlliances / totalAlliances, 3),
        nonGenuineShare: totalAlliances === 0 ? 0 : round(nonGenuineAlliances / totalAlliances, 3),
      },
      liveAllianceHealth: {
        meanCohesion: round(average(meanLiveCohesionPerSeason), 3),
        meanSecrecy: round(average(meanLiveSecrecyPerSeason), 3),
        meanMemberCommitment: round(average(meanLiveCommitmentPerSeason), 3),
        maxLivePactsPerActorMean: round(average(maxLivePactsPerActorPerSeason)),
        maxLivePactsPerActorObserved: Math.max(...maxLivePactsPerActorPerSeason),
      },
      statusCounts,
      sizeCounts,
      eventCounts,
      safety: {
        replayDivergences: reports.filter(
          (report) =>
            report.replayDigest !==
            simulateRealitySeason(report.seed, { days: 16, castSize: 12 }).replayDigest
        ).length,
        invalidSelections: reports.reduce((sum, report) => sum + report.invalidSelections, 0),
        humanAutonomyViolations: reports.reduce(
          (sum, report) => sum + report.humanAutonomyViolations,
          0
        ),
        deadlockDays: reports.reduce((sum, report) => sum + report.deadlockDays, 0),
        memoryOverflows: reports.reduce((sum, report) => sum + report.memoryOverflows, 0),
        eventOverflows: reports.reduce((sum, report) => sum + report.eventOverflow, 0),
      },
    }

    console.log('REALITY_ALLIANCE_CALIBRATION')
    console.log(JSON.stringify(summary, null, 2))

    expect(summary.safety.replayDivergences).toBe(0)
    expect(summary.safety.invalidSelections).toBe(0)
    expect(summary.safety.humanAutonomyViolations).toBe(0)
    expect(summary.safety.deadlockDays).toBe(0)
    expect(summary.safety.memoryOverflows).toBe(0)
    expect(summary.safety.eventOverflows).toBe(0)
    expect(totalAlliances).toBeGreaterThan(0)
  })
})
