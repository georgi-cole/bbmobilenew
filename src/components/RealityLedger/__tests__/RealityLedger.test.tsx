import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  addRealityFact,
  createDirectedRelationship,
  createInitialRealityDomainState,
  learnRealityFact,
} from '../../../social/reality'
import type { Player } from '../../../types'
import RealityLedger from '../RealityLedger'

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active' },
  { id: 'kai', name: 'Kai', status: 'active' },
] as Player[]

describe('RealityLedger privacy projection', () => {
  it('shows learned claims and the player’s own relationship read without leaking hidden facts', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.human = {
      lia: createDirectedRelationship('human', 'lia', 42, ['alliance']),
    }
    reality.relationships.lia = {
      human: createDirectedRelationship('lia', 'human', -80, ['betrayal']),
    }
    addRealityFact(reality, {
      id: 'known-claim',
      propositionType: 'TARGETING_PLAN',
      subjectIds: ['kai'],
      objectId: 'human',
      value: true,
      day: 3,
      phase: 'social_2',
      visibility: 'PAIR_ONLY',
      participantIds: ['lia', 'kai'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'event-1',
    })
    addRealityFact(reality, {
      id: 'hidden-fact',
      propositionType: 'SECRET_FINAL_TWO',
      subjectIds: ['lia', 'kai'],
      value: true,
      day: 3,
      phase: 'social_2',
      visibility: 'PRIVATE',
      participantIds: ['lia', 'kai'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'event-2',
    })
    learnRealityFact(reality, {
      ownerId: 'human',
      factId: 'known-claim',
      memory: {
        id: 'memory-claim',
        ownerId: 'human',
        eventId: 'event-1',
        day: 3,
        phase: 'social_2',
        participantIds: ['lia', 'kai'],
        sourceType: 'HEARSAY',
        sourceChain: ['lia'],
        confidence: 0.66,
        importance: 0.6,
        surprise: 0.4,
        emotionalValence: -0.2,
        emotionalIntensity: 0.4,
        secrecy: 0.8,
        strategicRelevance: 0.9,
        visibility: 'PAIR_ONLY',
        tags: ['targeting'],
        relatedPromiseIds: [],
        relatedSecretIds: [],
        recallStrength: 1,
      },
    })

    render(<RealityLedger reality={reality} players={players} humanId="human" />)

    expect(screen.getByText('Your relationship reads')).toBeInTheDocument()
    expect(screen.getAllByText('Ally')).toHaveLength(2)
    expect(screen.queryByText('Enemy')).toBeNull()
    expect(screen.getByText(/private opinion of you remains hidden/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Known' }))
    expect(screen.getByText('Targeting Plan')).toBeInTheDocument()
    expect(screen.getByText('Heard through Lia')).toBeInTheDocument()
    expect(screen.queryByText('Secret Final Two')).toBeNull()
  })
})
