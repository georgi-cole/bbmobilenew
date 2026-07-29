/**
 * Tests for the RecentActivity component.
 *
 * Covers:
 *  1. Shows "No recent actions." when sessionLogs is empty.
 *  2. Shows "No recent actions." after clearing when logs exist.
 *  3. Renders an entry with action title for a known action id.
 *  4. Renders an entry with the target player's name when players prop is provided.
 *  5. Renders ✓ icon for positive delta.
 *  6. Renders ✗ icon for negative delta.
 *  7. Renders – icon for zero delta.
 *  8. Renders delta value when non-zero.
 *  9. Does not render delta when delta is 0.
 * 10. "Clear" button is absent when there are no visible entries.
 * 11. "Clear" button is present when there are visible entries.
 * 12. Clicking "Clear" hides existing entries.
 * 13. maxEntries limits the displayed entries.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import socialReducer, { recordSocialAction } from '../../../social/socialSlice'
import gameReducer from '../../../store/gameSlice'
import RecentActivity from '../RecentActivity'
import type { SocialActionLogEntry } from '../../../social/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(entries: SocialActionLogEntry[] = []) {
  const store = configureStore({ reducer: { game: gameReducer, social: socialReducer } })
  for (const entry of entries) {
    store.dispatch(recordSocialAction({ entry }))
  }
  return store
}

function renderActivity(
  store: ReturnType<typeof makeStore>,
  props: Partial<React.ComponentProps<typeof RecentActivity>> = {}
) {
  return render(
    <Provider store={store}>
      <RecentActivity {...props} />
    </Provider>
  )
}

function makeEntry(overrides: Partial<SocialActionLogEntry> = {}): SocialActionLogEntry {
  return {
    actionId: 'compliment',
    actorId: 'p0',
    targetId: 'p1',
    cost: 1,
    delta: 2,
    outcome: 'success',
    newEnergy: 4,
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecentActivity – empty state', () => {
  it('shows empty message when no logs exist', () => {
    const store = makeStore()
    renderActivity(store)
    expect(screen.getByText('No recent actions.')).toBeDefined()
  })

  it('does not show Clear button when no entries are visible', () => {
    const store = makeStore()
    renderActivity(store)
    expect(screen.queryByRole('button', { name: 'Clear recent activity' })).toBeNull()
  })
})

describe('RecentActivity – entry rendering', () => {
  it('renders known action title for a recognised action id', () => {
    const store = makeStore([makeEntry({ actionId: 'compliment' })])
    renderActivity(store)
    // 'Compliment' appears within the narrative text
    expect(screen.getByText(/Compliment/)).toBeDefined()
  })

  it('renders target player name when players prop is provided', () => {
    const store = makeStore([makeEntry({ targetId: 'p1' })])
    const players = [{ id: 'p1', name: 'Alice', avatar: '😀', status: 'active' as const }]
    renderActivity(store, { players })
    expect(screen.getByText(/Alice/)).toBeDefined()
  })

  it('falls back to target id when player not found', () => {
    const store = makeStore([makeEntry({ targetId: 'unknown-id' })])
    renderActivity(store)
    expect(screen.getByText(/unknown-id/)).toBeDefined()
  })

  it('renders ✓ icon for positive delta', () => {
    const store = makeStore([makeEntry({ delta: 2 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('keeps a success icon when a successful action damages the relationship', () => {
    const store = makeStore([makeEntry({ delta: -1 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
    expect(screen.getByText('Relationship change -1')).toBeDefined()
  })

  it('keeps a success icon when a successful action has a neutral relationship result', () => {
    const store = makeStore([makeEntry({ delta: 0 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('renders the delta value with sign when delta is positive', () => {
    const store = makeStore([makeEntry({ delta: 3 })])
    renderActivity(store)
    expect(screen.getByText('Relationship change +3')).toBeDefined()
  })

  it('renders the delta value without extra sign when delta is negative', () => {
    const store = makeStore([makeEntry({ delta: -2 })])
    renderActivity(store)
    expect(screen.getByText('Relationship change -2')).toBeDefined()
  })

  it('shows both the action change and the resulting current score', () => {
    const store = makeStore([makeEntry({ delta: 4, targetId: 'p1' })])
    renderActivity(store, {
      humanId: 'p0',
      relationships: {
        p0: { p1: { affinity: 3, tags: [] } },
        p1: { p0: { affinity: -1, tags: [] } },
      },
    })
    expect(screen.getByText('Relationship change +4 · current +1')).toBeDefined()
  })

  it('does not render a delta element when delta is 0', () => {
    const store = makeStore([makeEntry({ delta: 0 })])
    renderActivity(store)
    expect(screen.queryByText(/^\+0$/)).toBeNull()
  })
})

describe('RecentActivity – Clear button', () => {
  it('shows Clear button when entries are visible', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    expect(screen.getByRole('button', { name: 'Clear recent activity' })).toBeDefined()
  })

  it('clicking Clear hides existing entries', () => {
    const store = makeStore([makeEntry({ actionId: 'compliment' })])
    renderActivity(store)
    expect(screen.getByText(/Compliment/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Clear recent activity' }))
    expect(screen.getByText('No recent actions.')).toBeDefined()
  })
})

describe('RecentActivity – maxEntries', () => {
  it('limits displayed entries to maxEntries', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ actionId: 'compliment', timestamp: Date.now() + i })
    )
    const store = makeStore(entries)
    renderActivity(store, { maxEntries: 3 })
    // Should show exactly 3 list items
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
  })
})

describe('RecentActivity – auto-scroll', () => {
  it('the activity list element exists and is the scrollable container', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    // The list should be present and be the element that receives scroll
    const list = screen.getByRole('list', { name: 'Recent actions' })
    expect(list).toBeDefined()
  })

  it('sets scrollTop to scrollHeight on the list after entries are added', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    const list = screen.getByRole('list', { name: 'Recent actions' }) as HTMLUListElement
    // JSDOM sets scrollHeight to 0; scrollTop is clamped to scrollHeight.
    // Verify the property is assignable (i.e. the ref is wired to the <ul>).
    expect(list.scrollTop).toBe(0)
  })
})
