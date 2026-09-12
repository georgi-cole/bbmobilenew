import type { WeatherConditionId } from './weatherRuntime'
import type { BroadcastPresentationMode } from '../broadcasting/broadcastEditorialPolicy'

export interface WeatherEditorialInput {
  condition: WeatherConditionId
  temperatureC: number
  recoveryRainbow: boolean
  shockCondition: WeatherConditionId | null
  phenomenon?: string | null
}

export interface WeatherEditorialDecision {
  noteworthy: boolean
  presentationMode: BroadcastPresentationMode
  forceOnTv: boolean
  reason:
    | 'ambient'
    | 'campaign_weather'
    | 'rainbow'
    | 'severe_condition'
    | 'temperature_extreme'
}

const SEVERE_CONDITIONS = new Set<WeatherConditionId>([
  'stormy',
  'heavy_rain',
  'snowy',
  'snow_showers',
])

/**
 * Presentation-only weather classification. Weather generation itself remains
 * deterministic and untouched; this decides only whether the daily bulletin
 * is ambient or deserves the existing foreground handoff.
 */
export function classifyWeatherEditorial(input: WeatherEditorialInput): WeatherEditorialDecision {
  if (input.recoveryRainbow || input.phenomenon === 'rainbow') {
    return {
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'rainbow',
    }
  }

  if (input.shockCondition) {
    return {
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'campaign_weather',
    }
  }

  if (SEVERE_CONDITIONS.has(input.condition)) {
    return {
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'severe_condition',
    }
  }

  if (input.temperatureC <= -5 || input.temperatureC >= 35) {
    return {
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'temperature_extreme',
    }
  }

  return {
    noteworthy: false,
    presentationMode: 'ambient',
    forceOnTv: false,
    reason: 'ambient',
  }
}
