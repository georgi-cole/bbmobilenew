import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import gameReducer from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import { isHumanSocialActionVisible } from '../../../social/socialActionCatalog'
import { evaluateSocialActionEligibility } from '../../../social/socialActionEligibility'
import { isRealityExclusiveAction, SOCIAL_ACTIONS } from '../../../social/socialActions'
import ActionGrid from '../ActionGrid'

const NORMAL_ACTIONS = SOCIAL_ACTIONS.filter((action) =>
  isHumanSocialActionVisible(action, 'normal')
)
const DEFAULT_NORMAL_ACTIONS = NORMAL_ACTIONS.filter(
  (action) =>
    !isRealityExclusiveAction(action) &&
    evaluateSocialActionEligibility({ action, dramaMode: false }).eligible
)
const LOCKED_REALITY_ACTIONS = SOCIAL_ACTIONS.filter(
  (action) =>
    !action.aiOnly &&
    isRealityExclusiveAction(action) &&
    evaluateSocialActionEligibility({
      action,
      dramaMode: false,
      ignoreRealityModeGate: true,
    }).eligible
)

function renderGrid(ui: ReactElement) {
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
  })

  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  })
}

function renderedActionIds(): string[] {
  return screen
    .getAllByRole('button', { name: /./i })
    .filter((element) => element.hasAttribute('data-action-id'))
    .map((element) => element.getAttribute('data-action-id') ?? '')
}

function actionCard(title: string): HTMLElement {
  const candidates = screen.getAllByRole('button', { name: new RegExp(title, 'i') })
  const card = candidates.find((element) => element.hasAttribute('data-action-id'))
  if (!card) throw new Error(`Missing action card ${title}`)
  return card
}

describe('ActionGrid catalogue rendering', () => {
  it('keeps the Classic catalogue playable while appending locked Reality previews', () => {
    renderGrid(<ActionGrid />)

    expect(renderedActionIds()).toEqual([
      ...DEFAULT_NORMAL_ACTIONS.map((action) => action.id),
      ...LOCKED_REALITY_ACTIONS.map((action) => action.id),
    ])
    for (const action of DEFAULT_NORMAL_ACTIONS) {
      expect(screen.getByText(action.title)).toBeInTheDocument()
    }
  })

  it('shows only contextually relevant Reality previews in Classic', () => {
    renderGrid(<ActionGrid selectedTargetIds={new Set(['lia'])} actorId="human" />)

    expect(screen.getByText('Spread Rumor')).toBeInTheDocument()
    expect(screen.getByText('Start Fight')).toBeInTheDocument()
    expect(screen.getByText('Share Intel')).toBeInTheDocument()
    expect(screen.queryByText('Test the Spark')).not.toBeInTheDocument()
    expect(screen.queryByText('Go Public')).not.toBeInTheDocument()
    expect(screen.getByText('Plant a Lie')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Reality Mode action').length).toBeGreaterThan(0)
  })

  it('reveals the complete contextual catalogue in Drama Mode', () => {
    renderGrid(
      <ActionGrid
        dramaMode
        currentPhase="social_2"
        actorId="human"
        selectedTargetIds={new Set(['lia'])}
        relationships={{
          human: { lia: { affinity: 40, tags: [] } },
          lia: { human: { affinity: 35, tags: [] } },
        }}
      />
    )

    expect(screen.getByText('Spread Rumor')).toBeInTheDocument()
    expect(screen.getByText('Start Fight')).toBeInTheDocument()
    expect(screen.getByText('Share Intel')).toBeInTheDocument()
    expect(screen.getByText('Test the Spark')).toBeInTheDocument()
    expect(screen.getByText('Make a Pact')).toBeInTheDocument()
    expect(screen.getByText('Plant a Lie')).toBeInTheDocument()
  })

  it('shows role-gated Reality previews only with a compatible target', () => {
    const { rerender } = renderGrid(<ActionGrid />)
    expect(screen.queryByText('Ask LOH Plan')).not.toBeInTheDocument()
    expect(screen.queryByText('Ask to Use Safety')).not.toBeInTheDocument()

    rerender(
      <ActionGrid
        primaryTargetStatus="loh"
        currentPhase="social_1"
        actorId="human"
        selectedTargetIds={new Set(['leader'])}
      />
    )
    expect(screen.getByText('Ask LOH Plan')).toBeInTheDocument()

    rerender(
      <ActionGrid
        primaryTargetStatus="pos"
        currentPhase="pos_results"
        actorId="human"
        selectedTargetIds={new Set(['holder'])}
      />
    )
    expect(screen.getByText('Ask to Use Safety')).toBeInTheDocument()
  })

  it('never renders AI-only actions for the human player', () => {
    renderGrid(<ActionGrid dramaMode currentPhase="social_2" />)

    for (const action of SOCIAL_ACTIONS.filter((candidate) => candidate.aiOnly)) {
      expect(screen.queryByText(action.title)).not.toBeInTheDocument()
    }
  })

  it('reveals Betray Ally only for an active alliance in Drama Mode', () => {
    const props = {
      dramaMode: true,
      actorId: 'human',
      selectedTargetIds: new Set(['lia']),
    }
    const { rerender } = renderGrid(
      <ActionGrid {...props} relationships={{ human: { lia: { affinity: 40, tags: [] } } }} />
    )
    expect(screen.queryByText('Betray Ally')).not.toBeInTheDocument()

    rerender(
      <ActionGrid
        {...props}
        relationships={{
          human: { lia: { affinity: 40, tags: ['alliance'] } },
          lia: { human: { affinity: 40, tags: ['alliance'] } },
        }}
      />
    )
    expect(screen.getByText('Betray Ally')).toBeInTheDocument()
  })
})

describe('ActionGrid interaction and accessibility', () => {
  it('calls onActionClick with the selected action id', () => {
    const onActionClick = vi.fn()
    renderGrid(<ActionGrid onActionClick={onActionClick} />)

    const first = DEFAULT_NORMAL_ACTIONS[0]
    fireEvent.click(actionCard(first.title))
    expect(onActionClick).toHaveBeenCalledWith(first.id)
  })

  it('opens the upgrade path instead of selecting a locked Reality action', () => {
    const onActionClick = vi.fn()
    const onPremiumLockedClick = vi.fn()
    renderGrid(
      <ActionGrid onActionClick={onActionClick} onPremiumLockedClick={onPremiumLockedClick} />
    )

    fireEvent.click(actionCard('Spread Rumor'))

    expect(onPremiumLockedClick).toHaveBeenCalledWith('rumor')
    expect(onActionClick).not.toHaveBeenCalled()
  })

  it('calls onPreview without also selecting the action', () => {
    const onActionClick = vi.fn()
    const onPreview = vi.fn()
    renderGrid(<ActionGrid onActionClick={onActionClick} onPreview={onPreview} />)

    const first = DEFAULT_NORMAL_ACTIONS[0]
    fireEvent.click(screen.getByRole('button', { name: `Preview ${first.title}` }))
    expect(onPreview).toHaveBeenCalledWith(first.id)
    expect(onActionClick).not.toHaveBeenCalled()
  })

  it('applies disabled and selected semantics', () => {
    const first = DEFAULT_NORMAL_ACTIONS[0]
    const second = DEFAULT_NORMAL_ACTIONS[1]
    renderGrid(<ActionGrid disabledIds={new Set([first.id])} selectedId={second.id} />)

    expect(actionCard(first.title)).toHaveAttribute('aria-disabled', 'true')
    expect(actionCard(second.title)).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves keyboard focus between canonical neighbours', () => {
    renderGrid(<ActionGrid />)
    const first = actionCard(DEFAULT_NORMAL_ACTIONS[0].title)
    const second = actionCard(DEFAULT_NORMAL_ACTIONS[1].title)
    const group = first.closest('[role="group"]')!

    first.focus()
    act(() => fireEvent.keyDown(group, { key: 'ArrowRight' }))
    expect(document.activeElement).toBe(second)

    act(() => fireEvent.keyDown(group, { key: 'ArrowLeft' }))
    expect(document.activeElement).toBe(first)
  })

  it('does not restore the removed floating preview UI', () => {
    renderGrid(
      <ActionGrid
        selectedTargetIds={new Set(['p1'])}
        players={[{ id: 'p1', name: 'Alice', avatar: '😀', status: 'active' }]}
      />
    )
    fireEvent.pointerEnter(actionCard(DEFAULT_NORMAL_ACTIONS[0].title), {
      pointerType: 'mouse',
    })

    expect(screen.queryByText('Select target(s) to preview')).not.toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })
})

describe('ActionGrid stable placement and affordability', () => {
  it('preserves canonical placement when resources change', () => {
    const { rerender } = renderGrid(<ActionGrid />)
    const canonical = renderedActionIds()

    rerender(<ActionGrid actorEnergy={1} actorInfluence={0} actorInfo={0} />)
    expect(renderedActionIds()).toEqual(canonical)

    rerender(<ActionGrid actorEnergy={100} actorInfluence={1000} actorInfo={1000} />)
    expect(renderedActionIds()).toEqual(canonical)
  })

  it('shows precise reasons on unaffordable cards without disabling selection', () => {
    renderGrid(<ActionGrid actorEnergy={0} />)

    expect(screen.getAllByText(/Need ⚡\d/).length).toBeGreaterThan(0)
    const first = actionCard(DEFAULT_NORMAL_ACTIONS[0].title)
    expect(first).toHaveAttribute('aria-disabled', 'false')
    expect(first.className).toContain('ac-card--unavailable')
  })

  it('shows no affordability warning when resources are sufficient', () => {
    renderGrid(<ActionGrid actorEnergy={100} actorInfluence={1000} actorInfo={1000} />)

    expect(screen.queryByText(/Need ⚡/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Need 🤝/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Need 💡/)).not.toBeInTheDocument()
  })

  it('hides Propose Alliance once that Classic relationship is already allied', () => {
    renderGrid(
      <ActionGrid
        actorId="user"
        selectedTargetIds={new Set(['p2'])}
        relationships={{
          user: { p2: { affinity: 50, tags: ['alliance'] } },
          p2: { user: { affinity: 50, tags: ['alliance'] } },
        }}
      />
    )

    expect(screen.queryByText('Propose Alliance')).not.toBeInTheDocument()
  })
})
