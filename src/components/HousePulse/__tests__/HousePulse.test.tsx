import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createInitialDramaSocialNetwork } from '../../../social/dramaModeEngine'
import { createInitialRealityDomainState } from '../../../social/reality'
import type { Player } from '../../../types'
import HousePulse from '../HousePulse'

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active', isUser: false },
  { id: 'kai', name: 'Kai', status: 'active', isUser: false },
] as Player[]

describe('HousePulse', () => {
  it('opens My Game first and labels stream counts as visible shifts', () => {
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={createInitialRealityDomainState()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText('Your private game read')).toBeInTheDocument()
    expect(screen.getByText('visible shifts')).toBeInTheDocument()
    expect(screen.queryByText('house stories')).toBeNull()
  })

  it('presents a causal stream, continuing stories and concrete intel known to the player', () => {
    const network = createInitialDramaSocialNetwork()
    network.arcs.push({
      id: 'romance:human~lia:2',
      type: 'romance',
      participantIds: ['human', 'lia'],
      stage: 'building',
      intensity: 55,
      startedWeek: 2,
      lastAdvancedWeek: 2,
      public: false,
      status: 'active',
    })
    network.rumours.push({
      id: 'rumour-1',
      kind: 'targeting',
      originatorId: 'lia',
      subjectId: 'kai',
      claim: 'Lia heard Kai testing your name as a backup plan.',
      truth: 'uncertain',
      createdWeek: 2,
      expiresWeek: 5,
      status: 'circulating',
      listeners: [
        { playerId: 'human', sourceId: 'lia', confidence: 0.7, believed: true, heardWeek: 2 },
      ],
      sourceChain: ['lia', 'human'],
    })
    network.events.push({
      id: 'event-1',
      type: 'discovery',
      title: 'A plan surfaced',
      text: 'You caught a private conversation.',
      detail: 'Kai was named as the target.',
      consequence: 'Trust shifted.',
      participantIds: ['human', 'kai'],
      week: 2,
      phase: 'social_2',
      public: false,
      severity: 'major',
      createdAt: 20,
    })

    render(
      <HousePulse
        network={network}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText('New information surfaced')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'stories' }))
    expect(screen.getByText('You and Lia')).toBeInTheDocument()
    expect(
      screen.getByText(/Repeated moments are turning into a real storyline/)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'intel' }))
    expect(
      screen.getByText('Lia heard Kai testing your name as a backup plan.')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Social' }))
    expect(screen.queryByRole('dialog', { name: 'My Pulse' })).toBeNull()
  })
})
