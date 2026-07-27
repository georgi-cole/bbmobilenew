import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isHumanSocialActionVisible } from '../../../social/socialActionCatalog'
import { evaluateSocialActionEligibility } from '../../../social/socialActionEligibility'
import { SOCIAL_ACTIONS } from '../../../social/socialActions'
import ActionGrid from '../ActionGrid'

const NORMAL_ACTIONS = SOCIAL_ACTIONS.filter((action) =>
  isHumanSocialActionVisible(action, 'normal')
)
const DEFAULT_NORMAL_ACTIONS = NORMAL_ACTIONS.filter(
  (action) => evaluateSocialActionEligibility({ action, dramaMode: false }).eligible
)

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
  it('renders the compact Normal catalogue in canonical order', () => {
    render(<ActionGrid />)

    expect(renderedActionIds()).toEqual(DEFAULT_NORMAL_ACTIONS.map((action) => action.id))
    for (const action of DEFAULT_NORMAL_ACTIONS) {
      expect(screen.getByText(action.title)).toBeInTheDocument()
    }
  })

  it('keeps premium actions out of Normal Mode', () => {
    render(<ActionGrid selectedTargetIds={new Set(['lia'])} actorId="human" />)

    expect(screen.queryByText('Spread Rumor')).not.toBeInTheDocument()
    expect(screen.queryByText('Start Fight')).not.toBeInTheDocument()
    expect(screen.queryByText('Share Intel')).not.toBeInTheDocument()
    expect(screen.queryByText('Test the Spark')).not.toBeInTheDocument()
    expect(screen.queryByText('Plant a Lie')).not.toBeInTheDocument()
  })

  it('reveals the complete contextual catalogue in Drama Mode', () => {
    render(
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

  it('hides role-gated actions until a compatible target is selected', () => {
    const { rerender } = render(<ActionGrid />)
    expect(screen.queryByText('Ask LOH Target')).not.toBeInTheDocument()
    expect(screen.queryByText('Ask to Use Safety')).not.toBeInTheDocument()

    rerender(
      <ActionGrid
        primaryTargetStatus="loh"
        currentPhase="social_1"
        actorId="human"
        selectedTargetIds={new Set(['leader'])}
      />
    )
    expect(screen.getByText('Ask LOH Target')).toBeInTheDocument()

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
    render(<ActionGrid dramaMode currentPhase="social_2" />)

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
    const { rerender } = render(
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
    render(<ActionGrid onActionClick={onActionClick} />)

    const first = DEFAULT_NORMAL_ACTIONS[0]
    fireEvent.click(actionCard(first.title))
    expect(onActionClick).toHaveBeenCalledWith(first.id)
  })

  it('calls onPreview without also selecting the action', () => {
    const onActionClick = vi.fn()
    const onPreview = vi.fn()
    render(<ActionGrid onActionClick={onActionClick} onPreview={onPreview} />)

    const first = DEFAULT_NORMAL_ACTIONS[0]
    fireEvent.click(screen.getByRole('button', { name: `Preview ${first.title}` }))
    expect(onPreview).toHaveBeenCalledWith(first.id)
    expect(onActionClick).not.toHaveBeenCalled()
  })

  it('applies disabled and selected semantics', () => {
    const first = DEFAULT_NORMAL_ACTIONS[0]
    const second = DEFAULT_NORMAL_ACTIONS[1]
    render(<ActionGrid disabledIds={new Set([first.id])} selectedId={second.id} />)

    expect(actionCard(first.title)).toHaveAttribute('aria-disabled', 'true')
    expect(actionCard(second.title)).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves keyboard focus between canonical neighbours', () => {
    render(<ActionGrid />)
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
    render(
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
    const { rerender } = render(<ActionGrid />)
    const canonical = renderedActionIds()

    rerender(<ActionGrid actorEnergy={1} actorInfluence={0} actorInfo={0} />)
    expect(renderedActionIds()).toEqual(canonical)

    rerender(<ActionGrid actorEnergy={100} actorInfluence={1000} actorInfo={1000} />)
    expect(renderedActionIds()).toEqual(canonical)
  })

  it('shows precise reasons on unaffordable cards without disabling selection', () => {
    render(<ActionGrid actorEnergy={0} />)

    expect(screen.getAllByText(/Need ⚡\d/).length).toBeGreaterThan(0)
    const first = actionCard(DEFAULT_NORMAL_ACTIONS[0].title)
    expect(first).toHaveAttribute('aria-disabled', 'false')
    expect(first.className).toContain('ac-card--unavailable')
  })

  it('shows no affordability warning when resources are sufficient', () => {
    render(<ActionGrid actorEnergy={100} actorInfluence={1000} actorInfo={1000} />)

    expect(screen.queryByText(/Need ⚡/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Need 🤝/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Need 💡/)).not.toBeInTheDocument()
  })

  it('hides Propose Alliance for an already allied target', () => {
    render(
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
