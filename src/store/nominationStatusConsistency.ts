import type { GameState, Player } from '../types'

function nextNominationStatus(
  player: Player,
  isNominee: boolean,
  lohId: string | null
): Player['status'] {
  const status = player.status ?? 'active'

  if (status === 'evicted' || status === 'jury') return status

  if (isNominee) {
    // The LOH can never be placed on their own opening block. Preserve any LOH
    // role rather than masking a deeper rules error with a nomination badge.
    if (player.id === lohId || status.includes('loh')) return status
    if (status.includes('nominated')) return status
    if (status.includes('pos')) return 'nominated+pos'
    return 'nominated'
  }

  // nomineeIds is the canonical block. Strip any stale nomination fragment left
  // behind by a provisional AI selection while preserving an already-earned POS.
  if (status === 'nominated+pos') return 'pos'
  if (status.includes('nominated')) return status.includes('pos') ? 'pos' : 'active'
  return status
}

/**
 * The strategic AI LOH planner may replace the provisional nominees selected by
 * gameSlice after that reducer has already written Player.status. Faux TV and
 * game.nomineeIds then describe the strategic block while a stale Player.status
 * can still make the roster render a nomination badge for the provisional block.
 *
 * Once the planner has committed its opening block, make nomineeIds the single
 * source of truth for nomination status. This is intentionally narrow: human
 * nomination drafts, Vox/Cupid flows and later Safety replacement phases are
 * left to their existing rules.
 */
export function reconcileStrategicNominationStatuses(state: GameState): GameState {
  const plan = state.lohNominationPlan
  if (
    state.phase !== 'nomination_results' ||
    state.awaitingNominations ||
    !plan ||
    plan.week !== state.week ||
    plan.lohId !== state.lohId ||
    plan.status !== 'initial_block_set'
  ) {
    return state
  }

  const nomineeIds = new Set(state.nomineeIds)
  let changed = false
  const players = state.players.map((player) => {
    const status = nextNominationStatus(player, nomineeIds.has(player.id), state.lohId)
    if (status === player.status) return player
    changed = true
    return { ...player, status }
  })

  return changed ? { ...state, players } : state
}
