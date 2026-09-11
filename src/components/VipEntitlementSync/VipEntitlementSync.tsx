import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setDisplay, setGameUX, setSim } from '../../store/settingsSlice'
import {
  initializeVip,
  selectHasDramaModeAccess,
  selectHasPublicModeAccess,
  selectHasTribunalHouseAccess,
  selectIsVipActive,
  selectVip,
} from '../../store/vipSlice'

const REALITY_MODE_DEFAULT_APPLIED_KEY = 'bbmobilenew:reality-mode-default-applied:v1'

function hasAppliedRealityModeDefault(): boolean {
  try {
    return localStorage.getItem(REALITY_MODE_DEFAULT_APPLIED_KEY) === '1'
  } catch {
    return false
  }
}

function markRealityModeDefaultApplied(): void {
  try {
    localStorage.setItem(REALITY_MODE_DEFAULT_APPLIED_KEY, '1')
  } catch {
    // If storage is unavailable, the in-memory ref still prevents repeated toggles this session.
  }
}

export default function VipEntitlementSync() {
  const dispatch = useAppDispatch()
  const storeState = useAppSelector(selectVip)
  const isVipActive = useAppSelector(selectIsVipActive)
  const hasDramaMode = useAppSelector(selectHasDramaModeAccess)
  const hasPublicMode = useAppSelector(selectHasPublicModeAccess)
  const hasTribunalHouse = useAppSelector(selectHasTribunalHouseAccess)
  const dramaMode = useAppSelector((state) => state.settings.gameUX.dramaMode)
  const publicMode = useAppSelector((state) => state.settings.sim.publicMode)
  const publicModeAdminOverride = useAppSelector(
    (state) => state.settings.sim.publicModeAdminOverride
  )
  const tribunalHouse = useAppSelector((state) => state.settings.sim.enableJuryHouse)
  const theme = useAppSelector((state) => state.settings.display.themePreset)
  const realityDefaultAppliedRef = useRef(false)

  useEffect(() => {
    if (storeState.status === 'idle') void dispatch(initializeVip())
  }, [dispatch, storeState.status])

  useEffect(() => {
    if (storeState.status !== 'ready' && storeState.status !== 'error') return
    if (!hasDramaMode || realityDefaultAppliedRef.current || hasAppliedRealityModeDefault()) return

    realityDefaultAppliedRef.current = true
    markRealityModeDefaultApplied()
    if (!dramaMode) dispatch(setGameUX({ dramaMode: true }))
  }, [dispatch, dramaMode, hasDramaMode, storeState.status])

  useEffect(() => {
    if (storeState.status !== 'ready' && storeState.status !== 'error') return
    if (!hasPublicMode && !publicModeAdminOverride && publicMode) {
      dispatch(setSim({ publicMode: false }))
    }
    if (!hasTribunalHouse && tribunalHouse) dispatch(setSim({ enableJuryHouse: false }))
    if (!isVipActive && theme !== 'midnight') {
      dispatch(setDisplay({ themePreset: 'midnight' }))
    }
  }, [
    dispatch,
    hasPublicMode,
    hasTribunalHouse,
    isVipActive,
    publicMode,
    publicModeAdminOverride,
    storeState.status,
    theme,
    tribunalHouse,
  ])

  return null
}
