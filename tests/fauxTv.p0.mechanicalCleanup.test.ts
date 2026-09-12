import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, setBroadcastOverride } from '../src/store/gameSlice'

const CASES = [
  ['loh.competition-start', 'loh_comp', 'The Leader of the House competition has begun! 🏆 Who will win power today?'],
  ['pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'],
  ['nominations.preparing', 'nominations', 'Alex is preparing the nomination ceremony. 🎯'],
  ['safety.holder', 'pos_ceremony', 'Alex is holding the Safety Ceremony. ⚡'],
  ['safety.replacement-selecting', 'pos_ceremony_results', 'Alex is selecting a backup nominee...'],
] as const

describe('Faux TV P0 mechanical cleanup', () => {
  for (const [templateId, phase, text] of CASES) {
    it(`${templateId} remains in history but is not foreground TV by default`, () => {
      let state = gameReducer(undefined, { type: 'init' })
      state = { ...state, phase, tvFeed: [], broadcastQueue: [] }
      state = gameReducer(
        state,
        addTvEvent({ text, type: 'game', meta: { phase, broadcastTemplateId: templateId } })
      )

      const emitted = state.tvFeed.find((candidate) => candidate.meta?.broadcastTemplateId === templateId)
      expect(emitted).toBeDefined()
      expect(emitted?.meta?.forceOnTv).toBeUndefined()
      expect(emitted?.meta?.editorial).toMatchObject({
        importance: 'required',
        presentationMode: 'log_only',
      })
      expect(state.broadcastQueue).not.toContain(emitted?.id)
    })
  }

  it('explicit Broadcast Manager Force-to-TV promotes a normally log-only source', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      setBroadcastOverride({ id: 'loh.competition-start', changes: { forceOnTv: true } })
    )
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the House competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: { phase: 'loh_comp', broadcastTemplateId: 'loh.competition-start' },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
  })
})
