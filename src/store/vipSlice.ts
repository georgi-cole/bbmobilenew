import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { RootState } from './store'
import {
  loadVipStoreSnapshot,
  purchaseStoreProduct,
  type StoreProduct,
  type VipStoreSnapshot,
} from '../vip/vipPurchaseService'
import {
  createEmptyStoreEntitlements,
  loadCachedVipEntitlement,
  TEMPORARY_STORE_UNLOCKS_ENABLED,
  type StoreEntitlements,
} from '../vip/vipStorage'
import type { StoreEntitlementKey, StoreProductKey } from '../vip/vipConfig'

export type VipStatus = 'idle' | 'loading' | 'ready' | 'purchasing' | 'restoring' | 'error'

export interface VipState {
  status: VipStatus
  isActive: boolean
  entitlements: StoreEntitlements
  billingAvailable: boolean
  products: Partial<Record<StoreProductKey, StoreProduct>>
  activePurchaseKey: StoreProductKey | null
  lastVerifiedAt: string | null
  error: string | null
}

export function loadVipState(): VipState {
  const cached = loadCachedVipEntitlement()
  return {
    status: 'idle',
    isActive: cached.isActive,
    entitlements: cached.entitlements,
    billingAvailable: false,
    products: {},
    activePurchaseKey: null,
    lastVerifiedAt: cached.lastVerifiedAt,
    error: null,
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'The store could not be reached. Please try again.'
}

export const initializeVip = createAsyncThunk<VipStoreSnapshot, void, { rejectValue: string }>(
  'vip/initialize',
  async (_, { rejectWithValue }) => {
    try {
      return await loadVipStoreSnapshot()
    } catch (error) {
      return rejectWithValue(errorMessage(error))
    }
  }
)

export const purchaseStoreItem = createAsyncThunk<
  VipStoreSnapshot,
  StoreProductKey,
  { rejectValue: string }
>('vip/purchaseStoreItem', async (productKey, { rejectWithValue }) => {
  try {
    return await purchaseStoreProduct(productKey)
  } catch (error) {
    return rejectWithValue(errorMessage(error))
  }
})

export const restoreVip = createAsyncThunk<VipStoreSnapshot, void, { rejectValue: string }>(
  'vip/restore',
  async (_, { rejectWithValue }) => {
    try {
      return await loadVipStoreSnapshot({ restore: true })
    } catch (error) {
      return rejectWithValue(errorMessage(error))
    }
  }
)

const vipSlice = createSlice({
  name: 'vip',
  initialState: loadVipState(),
  reducers: {},
  extraReducers: (builder) => {
    const applySnapshot = (state: VipState, action: { payload: VipStoreSnapshot }) => {
      state.status = 'ready'
      state.isActive = action.payload.isActive
      state.entitlements = action.payload.entitlements
      state.billingAvailable = action.payload.billingAvailable
      state.products = action.payload.products
      state.activePurchaseKey = null
      state.lastVerifiedAt = action.payload.verifiedAt
      state.error = null
    }

    builder
      .addCase(initializeVip.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(initializeVip.fulfilled, applySnapshot)
      .addCase(initializeVip.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.payload ?? 'The store could not be reached.'
      })
      .addCase(purchaseStoreItem.pending, (state, action) => {
        state.status = 'purchasing'
        state.activePurchaseKey = action.meta.arg
        state.error = null
      })
      .addCase(purchaseStoreItem.fulfilled, applySnapshot)
      .addCase(purchaseStoreItem.rejected, (state, action) => {
        state.status = 'error'
        state.activePurchaseKey = null
        state.error = action.payload ?? 'The purchase could not be completed.'
      })
      .addCase(restoreVip.pending, (state) => {
        state.status = 'restoring'
        state.error = null
      })
      .addCase(restoreVip.fulfilled, applySnapshot)
      .addCase(restoreVip.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.payload ?? 'Purchases could not be restored.'
      })
  },
})

function selectHasEntitlement(state: RootState, entitlement: StoreEntitlementKey): boolean {
  if (TEMPORARY_STORE_UNLOCKS_ENABLED) return true
  return (state.vip?.isActive ?? false) || (state.vip?.entitlements?.[entitlement] ?? false)
}

export const selectVip = (state: RootState) => state.vip
export const selectIsVipActive = (state: RootState) =>
  TEMPORARY_STORE_UNLOCKS_ENABLED || (state.vip?.isActive ?? false)
export const selectHasPublicModeAccess = (state: RootState) =>
  selectHasEntitlement(state, 'publicMode')
export const selectHasSurvivalModeAccess = (state: RootState) =>
  selectHasEntitlement(state, 'survivalMode')
export const selectHasTribunalHouseAccess = (state: RootState) =>
  selectHasEntitlement(state, 'tribunalHouse')
export const selectHasDramaModeAccess = (state: RootState) =>
  selectHasEntitlement(state, 'dramaMode')
export const selectHasCupidArrowAccess = (state: RootState) =>
  selectHasEntitlement(state, 'cupidArrow')
export const selectHasVoxPopuliAccess = (state: RootState) =>
  selectHasEntitlement(state, 'voxPopuli')
export const selectHasNoAdsAccess = (state: RootState) => selectHasEntitlement(state, 'noAds')

export const EMPTY_STORE_ENTITLEMENTS = createEmptyStoreEntitlements()

export default vipSlice.reducer
