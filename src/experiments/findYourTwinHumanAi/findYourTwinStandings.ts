import type { FindYourTwinAiResult, FindYourTwinHumanTelemetry } from './findYourTwinHumanAi'

type StandingHumanResult = Pick<FindYourTwinHumanTelemetry, 'finalScore' | 'rescued' | 'elapsedMs'>

type StandingAiResult = Pick<
  FindYourTwinAiResult,
  'id' | 'name' | 'finalScore' | 'rescued' | 'elapsedMs'
>

export interface FindYourTwinStanding {
  id: string
  name: string
  score: number
  rescued: boolean
  elapsedMs: number
  isHuman: boolean
}

export function buildFindYourTwinStandings(
  humanResult: StandingHumanResult | null,
  aiResults: StandingAiResult[]
): FindYourTwinStanding[] {
  if (!humanResult) return []

  return [
    {
      id: 'human',
      name: 'You',
      score: humanResult.finalScore,
      rescued: humanResult.rescued,
      elapsedMs: humanResult.elapsedMs,
      isHuman: true,
    },
    ...aiResults.map((result) => ({
      id: result.id,
      name: result.name,
      score: result.finalScore,
      rescued: result.rescued,
      elapsedMs: result.elapsedMs,
      isHuman: false,
    })),
  ].sort((left, right) => right.score - left.score || left.elapsedMs - right.elapsedMs)
}
