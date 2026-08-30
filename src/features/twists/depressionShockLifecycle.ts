import type { DepressionShockState as LegacyDepressionShockState } from '../../types'
import {
  DEPRESSION_SHOCK_DURATION_DAYS,
  loadDepressionShockState,
  type DepressionShockState,
} from './depressionShock'

export type DepressionShockLifecyclePhase = 'inactive' | 'day1' | 'day2' | 'recovery'

/**
 * Single lifecycle interpretation for every Depression Shock consumer.
 * The persisted twist state is authoritative; Redux only receives a derived
 * compatibility mirror for older social code that has not yet been migrated.
 */
export function getDepressionShockLifecyclePhase(
  state: DepressionShockState,
  week: number
): DepressionShockLifecyclePhase {
  const activatedDay = state.activatedDay
  if (activatedDay == null) return 'inactive'

  if (state.status === 'active') {
    if (week === activatedDay) return 'day1'
    if (week === activatedDay + 1) return 'day2'
    if (week === activatedDay + DEPRESSION_SHOCK_DURATION_DAYS && !state.endingSeen) {
      return 'recovery'
    }
  }

  if (state.status === 'completed' && state.completedDay === week) return 'recovery'
  return 'inactive'
}

export function getDepressionShockLifecycleForGame(
  gameId: string,
  week: number
): DepressionShockLifecyclePhase {
  return getDepressionShockLifecyclePhase(loadDepressionShockState(gameId), week)
}

/**
 * True only while the recovery/sunrise presentation is still pending or
 * running. Once it completes, later fullscreen events on the same game day are
 * allowed normally.
 */
export function isDepressionShockRecoveryPresentationPending(
  state: DepressionShockState,
  week: number
): boolean {
  return (
    state.status === 'active' &&
    state.activatedDay != null &&
    week === state.activatedDay + DEPRESSION_SHOCK_DURATION_DAYS &&
    !state.endingSeen
  )
}

export function isDepressionShockRecoveryPresentationPendingForGame(
  gameId: string,
  week: number
): boolean {
  return isDepressionShockRecoveryPresentationPending(loadDepressionShockState(gameId), week)
}

/**
 * Temporary one-way adapter for the legacy GameState.depressionShock shape.
 * No scheduling decision may be read back from this mirror.
 */
export function buildLegacyDepressionShockMirror(
  state: DepressionShockState,
  week: number
): LegacyDepressionShockState {
  const lifecycle = getDepressionShockLifecyclePhase(state, week)
  return {
    rollResolved:
      state.rollPassed !== null || state.status === 'failed' || state.status === 'completed',
    pendingActivation: state.status === 'queued',
    activatedWeek: state.activatedDay,
    activeDay: lifecycle === 'day1' ? 1 : lifecycle === 'day2' ? 2 : 0,
    recoveryWeek:
      state.activatedDay == null ? null : state.activatedDay + DEPRESSION_SHOCK_DURATION_DAYS,
    completed: state.status === 'completed',
  }
}

export function legacyDepressionShockMirrorEquals(
  left: LegacyDepressionShockState | undefined,
  right: LegacyDepressionShockState
): boolean {
  return (
    left?.rollResolved === right.rollResolved &&
    left?.pendingActivation === right.pendingActivation &&
    left?.activatedWeek === right.activatedWeek &&
    left?.activeDay === right.activeDay &&
    left?.recoveryWeek === right.recoveryWeek &&
    left?.completed === right.completed
  )
}
