import { afterEach, describe, expect, it } from 'vitest'
import { traceAiDecision } from '../aiDecisionDebug'

describe('AI decision debug trace', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    const api = (window as unknown as { __aiDebug?: { clear: () => void; disable: () => void } })
      .__aiDebug
    api?.clear()
    api?.disable()
  })

  it('collects and filters decisions only when debug access is granted', () => {
    window.history.replaceState({}, '', '/?debug=1')
    traceAiDecision({
      kind: 'eviction_vote',
      actorId: 'voter-1',
      chosenId: 'nominee-2',
      week: 3,
      phase: 'live_vote',
      candidates: [
        { id: 'nominee-1', total: 4, factors: { threat: 4 } },
        { id: 'nominee-2', total: 8, factors: { threat: 8 } },
      ],
    })

    const api = (
      window as unknown as {
        __aiDebug?: {
          last: () => { chosenId?: string | null } | null
          filter: (query: { kind: 'eviction_vote' }) => unknown[]
        }
      }
    ).__aiDebug
    expect(api?.last()?.chosenId).toBe('nominee-2')
    expect(api?.filter({ kind: 'eviction_vote' })).toHaveLength(1)
  })

  it('does not retain or print decisions without debug access', () => {
    const originalInfo = console.info
    const info = [] as unknown[]
    console.info = (...args: unknown[]) => info.push(args)
    try {
      traceAiDecision({
        kind: 'loh_nomination',
        actorId: 'loh-1',
        chosenIds: ['nominee-1'],
        candidates: [{ id: 'nominee-1', total: 1 }],
      })
    } finally {
      console.info = originalInfo
    }
    expect(info).toHaveLength(0)
  })
})
