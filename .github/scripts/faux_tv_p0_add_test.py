from pathlib import Path

path = Path('tests/fauxTv.p0.mechanicalCleanup.test.ts')
text = path.read_text()
needle = "  it('keeps a template without editorial metadata on the legacy foreground path', () => {\n"
insert = """  it('explicit producer editorial metadata overrides the template editorial default', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the House competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: {
          phase: 'loh_comp',
          broadcastTemplateId: 'loh.competition-start',
          editorial: {
            importance: 'critical',
            presentationMode: 'interrupt',
            category: 'producer-override',
          },
        },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toEqual({
      importance: 'critical',
      presentationMode: 'interrupt',
      category: 'producer-override',
    })
  })

"""
if needle not in text:
    raise SystemExit('missing legacy test insertion point')
path.write_text(text.replace(needle, insert + needle, 1))
