import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setDisplay, setSim } from '../../store/settingsSlice'
import {
  initializeVip,
  selectHasTribunalHouseAccess,
  selectIsVipActive,
  selectVip,
} from '../../store/vipSlice'

export default function VipEntitlementSync() {
  const dispatch = useAppDispatch()
  const storeState = useAppSelector(selectVip)
  const isVipActive = useAppSelector(selectIsVipActive)
  const hasTribunalHouse = useAppSelector(selectHasTribunalHouseAccess)
  const tribunalHouse = useAppSelector((state) => state.settings.sim.enableJuryHouse)
  const theme = useAppSelector((state) => state.settings.display.themePreset)

  useEffect(() => {
    if (storeState.status === 'idle') void dispatch(initializeVip())
  }, [dispatch, storeState.status])

  useEffect(() => {
    if (storeState.status !== 'ready' && storeState.status !== 'error') return
    if (!hasTribunalHouse && tribunalHouse) dispatch(setSim({ enableJuryHouse: false }))
    if (!isVipActive && theme !== 'midnight') {
      dispatch(setDisplay({ themePreset: 'midnight' }))
    }
  }, [dispatch, hasTribunalHouse, isVipActive, storeState.status, theme, tribunalHouse])

  return null
}
