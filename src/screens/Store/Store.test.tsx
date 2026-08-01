import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORE_PRODUCT_CATALOG } from '../../vip/vipConfig'
import { createEmptyStoreEntitlements } from '../../vip/vipStorage'
import { hasStoreProductIcon } from '../../components/StoreProductModal/storeProductIconUtils'
import vipReducer, { type VipState } from '../../store/vipSlice'
import Store from './Store'

const purchaseStoreProductMock = vi.hoisted(() => vi.fn())
const loadVipStoreSnapshotMock = vi.hoisted(() => vi.fn())

vi.mock('../../vip/vipPurchaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../vip/vipPurchaseService')>()
  return {
    ...actual,
    purchaseStoreProduct: purchaseStoreProductMock,
    loadVipStoreSnapshot: loadVipStoreSnapshotMock,
  }
})

function makeVipState(options?: {
  owned?: string[]
  vip?: boolean
  billingAvailable?: boolean
}): VipState {
  const entitlements = createEmptyStoreEntitlements()
  for (const key of options?.owned ?? []) {
    if (key in entitlements) entitlements[key as keyof typeof entitlements] = true
  }
  const billingAvailable = options?.billingAvailable ?? true
  const products = billingAvailable
    ? Object.fromEntries(
        STORE_PRODUCT_CATALOG.map((definition) => [
          definition.key,
          {
            key: definition.key,
            productId: definition.productId,
            title: definition.title,
            description: definition.description,
            price: definition.key === 'vip' ? '$19.99' : '$4.99',
          },
        ])
      )
    : {}

  return {
    status: 'ready',
    isActive: options?.vip ?? false,
    entitlements,
    billingAvailable,
    products,
    activePurchaseKey: null,
    lastVerifiedAt: '2026-07-21T00:00:00.000Z',
    error: null,
  }
}

function snapshotFrom(state: VipState) {
  return {
    billingAvailable: state.billingAvailable,
    isActive: state.isActive,
    entitlements: state.entitlements,
    products: state.products,
    verifiedAt: '2026-07-21T00:01:00.000Z',
  }
}

function renderStore(initialVip = makeVipState()) {
  const store = configureStore({
    reducer: { vip: vipReducer },
    preloadedState: { vip: initialVip },
  })

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/store']}>
        <Routes>
          <Route path="/store" element={<Store />} />
          <Route path="/settings" element={<h1>Settings destination</h1>} />
          <Route path="/" element={<h1>Home destination</h1>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )

  return store
}

function openDramaMode() {
  fireEvent.click(screen.getByRole('button', { name: 'Open Reality Mode' }))
}

describe('Store product presentation', () => {
  beforeEach(() => {
    purchaseStoreProductMock.mockReset()
    loadVipStoreSnapshotMock.mockReset()
  })

  it('gives every catalogue product a deliberate custom icon', () => {
    for (const product of STORE_PRODUCT_CATALOG) {
      expect(hasStoreProductIcon(product.icon)).toBe(true)
    }
  })

  it('presents Cupid and Vox as dedicated season expansions', () => {
    renderStore()

    expect(screen.getByRole('heading', { name: 'Change the rules of the house' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Open Cupid's Arrow" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Vox Populi' })).toBeInTheDocument()
  })

  it('opens the unowned product presentation with live price and real benefits', () => {
    renderStore()
    openDramaMode()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reality Mode' })).toBeInTheDocument()
    expect(
      screen.getByText('Make secret deals, bold moves and unforgettable rivalries')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock for $4.99' })).toBeEnabled()
  })

  it('opens an owned confirmation without a purchase CTA and navigates to access', () => {
    renderStore(makeVipState({ owned: ['dramaMode'] }))
    openDramaMode()

    expect(screen.getByRole('heading', { name: 'Reality Mode is unlocked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unlock for/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(screen.getByRole('heading', { name: 'Settings destination' })).toBeInTheDocument()
  })

  it('prevents duplicate purchase requests and transitions immediately to unlocked', async () => {
    let resolvePurchase: (value: ReturnType<typeof snapshotFrom>) => void = () => undefined
    purchaseStoreProductMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePurchase = resolve
      })
    )
    const purchasedState = makeVipState({ owned: ['dramaMode'] })

    renderStore()
    openDramaMode()
    const purchaseButton = screen.getByRole('button', { name: 'Unlock for $4.99' })
    fireEvent.click(purchaseButton)
    fireEvent.click(purchaseButton)

    await waitFor(() => expect(purchaseStoreProductMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Confirming purchase...' })).toBeDisabled()

    resolvePurchase(snapshotFrom(purchasedState))
    expect(
      await screen.findByRole('heading', { name: 'Reality Mode is unlocked' })
    ).toBeInTheDocument()
  })

  it('keeps the modal open and reports purchase cancellation', async () => {
    purchaseStoreProductMock.mockRejectedValue(new Error('Purchase cancelled.'))
    renderStore()
    openDramaMode()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock for $4.99' }))

    expect(await screen.findByText('Purchase cancelled.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reports a purchase failure and keeps the action available for retry', async () => {
    purchaseStoreProductMock.mockRejectedValue(new Error('The store could not be reached.'))
    renderStore()
    openDramaMode()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock for $4.99' }))

    expect(await screen.findByText('The store could not be reached.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock for $4.99' })).toBeEnabled()
  })

  it('restores ownership inside the modal and switches to the owned state', async () => {
    const restoredState = makeVipState({ owned: ['dramaMode'] })
    loadVipStoreSnapshotMock.mockResolvedValue(snapshotFrom(restoredState))
    renderStore()
    openDramaMode()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore Purchases' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Reality Mode is unlocked' })
    ).toBeInTheDocument()
    expect(loadVipStoreSnapshotMock).toHaveBeenCalledWith({ restore: true })
  })

  it('shows a disabled unavailable state when platform pricing is absent', () => {
    renderStore(makeVipState({ billingAvailable: false }))
    openDramaMode()

    expect(within(screen.getByRole('dialog')).getByText('Price unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Currently unavailable' })).toBeDisabled()
  })

  it('closes with Escape when no purchase is in progress', () => {
    renderStore()
    openDramaMode()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
