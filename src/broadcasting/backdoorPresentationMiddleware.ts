import type { Middleware } from '@reduxjs/toolkit'

type BackdoorPlanSnapshot = {
  week: number
  targetId: string
  revealed?: boolean
} | null

type LohSocialPlanSnapshot = {
  week: number
  lohId: string
  currentTargetId: string | null
  backupTargetId: string | null
  disclosedTargetByPlayerId?: Record<string, string>
} | null

type BackdoorPresentationState = {
  game: {
    week: number
    lohId: string | null
    lohNominationPlan?: BackdoorPlanSnapshot
    lohSocialPlan?: LohSocialPlanSnapshot
  }
}

const BACKDOOR_EFFECT_MS = 1800
const CEREMONY_CLEAR_SETTLE_MS = 180
let activeCleanup: (() => void) | null = null
let pendingCeremonyCleanup: (() => void) | null = null

function canonicalizeLohTargetLog(action: unknown, state: BackdoorPresentationState): unknown {
  if (typeof action !== 'object' || action === null || !('type' in action)) return action
  if (String((action as { type: unknown }).type) !== 'social/recordSocialAction') return action

  const typedAction = action as {
    type: string
    payload?: {
      entry?: {
        actionId?: string
        actorId?: string
        targetId?: string
        subjectId?: string
        narrative?: string
        context?: { lohPlanType?: 'current_target' | 'backup_plan' }
        [key: string]: unknown
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  const entry = typedAction.payload?.entry
  const plan = state.game.lohSocialPlan
  if (
    !entry ||
    entry.actionId !== 'ask_loh_target' ||
    !entry.actorId ||
    !plan ||
    plan.week !== state.game.week ||
    plan.lohId !== state.game.lohId ||
    entry.targetId !== state.game.lohId
  ) {
    return action
  }

  const disclosedTargetId =
    plan.disclosedTargetByPlayerId?.[entry.actorId] ?? plan.backupTargetId ?? plan.currentTargetId
  if (!disclosedTargetId) return action

  const isBackupPlan =
    disclosedTargetId === plan.backupTargetId && disclosedTargetId !== plan.currentTargetId
  return {
    ...typedAction,
    payload: {
      ...typedAction.payload,
      entry: {
        ...entry,
        subjectId: disclosedTargetId,
        // The legacy maneuver may already have authored copy around its own
        // affinity-only guess. Let Recent Activity render from canonical context.
        narrative: undefined,
        context: {
          ...entry.context,
          lohPlanType: isBackupPlan ? 'backup_plan' : 'current_target',
        },
      },
    },
  }
}

function playBackdoorFauxTvEffect(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const zone = document.querySelector<HTMLElement>('.tv-zone')
  if (!zone) return

  activeCleanup?.()

  const previousZIndex = zone.style.zIndex
  const previousTransformOrigin = zone.style.transformOrigin
  const previousBoxShadow = zone.style.boxShadow
  zone.style.zIndex = '1002'
  zone.style.transformOrigin = 'center center'

  const backdrop = document.createElement('div')
  backdrop.dataset.backdoorSpotlight = 'true'
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '1001',
    pointerEvents: 'none',
    opacity: '0',
    background:
      'radial-gradient(circle at 18% 18%, rgba(255, 70, 170, 0.14), transparent 30%), radial-gradient(circle at 82% 22%, rgba(60, 220, 255, 0.13), transparent 31%), radial-gradient(circle at 52% 82%, rgba(164, 92, 255, 0.12), transparent 34%), rgba(2, 3, 9, 0.78)',
  })
  document.body.appendChild(backdrop)

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const canAnimateBackdrop = typeof backdrop.animate === 'function'
  const canAnimateZone = typeof zone.animate === 'function'
  const backdropAnimation = canAnimateBackdrop
    ? backdrop.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.16 },
          { opacity: 1, offset: 0.78 },
          { opacity: 0 },
        ],
        { duration: BACKDOOR_EFFECT_MS, easing: 'ease-in-out', fill: 'both' }
      )
    : null

  if (!backdropAnimation) backdrop.style.opacity = '1'

  const zoneAnimation = canAnimateZone
    ? zone.animate(
        reduceMotion
          ? [
              {
                boxShadow:
                  '0 0 0 1px rgba(255, 105, 180, 0.72), 0 0 28px rgba(99, 102, 241, 0.58), 0 0 52px rgba(34, 211, 238, 0.28)',
              },
              {
                boxShadow:
                  '0 0 0 1px rgba(125, 211, 252, 0.66), 0 0 32px rgba(217, 70, 239, 0.48), 0 0 56px rgba(250, 204, 21, 0.22)',
              },
              {
                boxShadow: '0 10px 34px rgba(0, 0, 0, 0.46), 0 0 24px rgba(105, 82, 190, 0.075)',
              },
            ]
          : [
              {
                transform: 'translate3d(0, 0, 0) scale(1)',
                boxShadow:
                  '0 0 0 1px rgba(255, 65, 150, 0.7), 0 0 26px rgba(255, 65, 150, 0.46), 0 0 52px rgba(99, 102, 241, 0.26)',
              },
              {
                transform: 'translate3d(-3px, 1px, 0) scale(1.012)',
                boxShadow:
                  '0 0 0 1px rgba(250, 204, 21, 0.78), 0 0 34px rgba(250, 204, 21, 0.42), 0 0 62px rgba(34, 211, 238, 0.24)',
                offset: 0.18,
              },
              {
                transform: 'translate3d(3px, -2px, 0) scale(1.018)',
                boxShadow:
                  '0 0 0 1px rgba(52, 211, 153, 0.8), 0 0 38px rgba(52, 211, 153, 0.4), 0 0 68px rgba(59, 130, 246, 0.25)',
                offset: 0.32,
              },
              {
                transform: 'translate3d(-2px, 2px, 0) scale(1.014)',
                boxShadow:
                  '0 0 0 1px rgba(56, 189, 248, 0.82), 0 0 40px rgba(56, 189, 248, 0.44), 0 0 70px rgba(168, 85, 247, 0.26)',
                offset: 0.46,
              },
              {
                transform: 'translate3d(2px, -1px, 0) scale(1.012)',
                boxShadow:
                  '0 0 0 1px rgba(168, 85, 247, 0.84), 0 0 38px rgba(168, 85, 247, 0.46), 0 0 68px rgba(236, 72, 153, 0.26)',
                offset: 0.6,
              },
              {
                transform: 'translate3d(-1px, 1px, 0) scale(1.008)',
                boxShadow:
                  '0 0 0 1px rgba(244, 114, 182, 0.76), 0 0 32px rgba(244, 114, 182, 0.38), 0 0 58px rgba(250, 204, 21, 0.2)',
                offset: 0.74,
              },
              {
                transform: 'translate3d(0, 0, 0) scale(1)',
                boxShadow: '0 10px 34px rgba(0, 0, 0, 0.46), 0 0 24px rgba(105, 82, 190, 0.075)',
              },
            ],
        { duration: BACKDOOR_EFFECT_MS, easing: 'cubic-bezier(0.22, 0.72, 0.2, 1)', fill: 'both' }
      )
    : null

  if (!zoneAnimation) {
    zone.style.boxShadow =
      '0 0 0 1px rgba(125, 211, 252, 0.72), 0 0 32px rgba(217, 70, 239, 0.46), 0 0 56px rgba(250, 204, 21, 0.22)'
  }

  let timer: number | null = null
  const cleanup = () => {
    if (timer !== null) window.clearTimeout(timer)
    backdropAnimation?.cancel()
    zoneAnimation?.cancel()
    backdrop.remove()
    zone.style.zIndex = previousZIndex
    zone.style.transformOrigin = previousTransformOrigin
    zone.style.boxShadow = previousBoxShadow
    if (activeCleanup === cleanup) activeCleanup = null
  }
  activeCleanup = cleanup
  timer = window.setTimeout(cleanup, BACKDOOR_EFFECT_MS + 40)
}

/**
 * The replacement nominee ceremony owns the screen first. A backdoor can be
 * revealed by Redux before React has finished mounting/unmounting that overlay,
 * so wait through the next paint and any active ceremony before starting the
 * Faux TV shake. The short settle delay also lets the dim layer fully disappear.
 */
function scheduleBackdoorFauxTvEffect(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  pendingCeremonyCleanup?.()

  let observer: MutationObserver | null = null
  let settleTimer: number | null = null
  let cancelled = false

  const cleanup = () => {
    cancelled = true
    observer?.disconnect()
    observer = null
    if (settleTimer !== null) window.clearTimeout(settleTimer)
    settleTimer = null
    if (pendingCeremonyCleanup === cleanup) pendingCeremonyCleanup = null
  }

  const watchForCeremonyClear = () => {
    if (cancelled) return
    if (!document.querySelector('.ceremony-overlay')) {
      observer?.disconnect()
      observer = null
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (cancelled) return
        if (document.querySelector('.ceremony-overlay')) {
          watchForCeremonyClear()
          return
        }
        pendingCeremonyCleanup = null
        playBackdoorFauxTvEffect()
      }, CEREMONY_CLEAR_SETTLE_MS)
      return
    }
    observer?.disconnect()
    observer = new MutationObserver(() => {
      if (!document.querySelector('.ceremony-overlay')) watchForCeremonyClear()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  pendingCeremonyCleanup = cleanup

  // Two frames ensure a ceremony triggered by the same Redux update has had a
  // chance to mount before we decide that there is nothing to wait for.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(watchForCeremonyClear)
  })
}

/**
 * Presentation-only bridge for an executed LOH backdoor. The actual reveal is
 * still authored by the game reducer and rendered by Faux TV; this middleware
 * also canonicalizes ask-LOH-target activity before other social middleware sees it.
 */
export const backdoorPresentationMiddleware: Middleware = (api) => (next) => (action) => {
  const stateBefore = api.getState() as BackdoorPresentationState
  const before = stateBefore.game.lohNominationPlan ?? null
  const forwardedAction = canonicalizeLohTargetLog(action, stateBefore)
  const result = next(forwardedAction)
  const after = (api.getState() as BackdoorPresentationState).game.lohNominationPlan ?? null
  const actionType =
    typeof forwardedAction === 'object' && forwardedAction !== null && 'type' in forwardedAction
      ? String((forwardedAction as { type: unknown }).type)
      : ''

  const newlyRevealed =
    actionType === 'game/advance' &&
    before?.revealed !== true &&
    after?.revealed === true &&
    before?.week === after.week &&
    before?.targetId === after.targetId

  if (newlyRevealed) scheduleBackdoorFauxTvEffect()

  return result
}
