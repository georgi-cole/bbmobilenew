from pathlib import Path

CATALOG = Path('src/broadcasting/broadcastTemplateCatalog.ts')
GAME = Path('src/store/gameSlice.ts')
TEST = Path('tests/fauxTv.p0.mechanicalCleanup.test.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


text = CATALOG.read_text()
text = replace_once(
    text,
    "import type { BroadcastCampaign, BroadcastLevel, Phase, TvEvent } from '../types'\n",
    "import type { BroadcastCampaign, BroadcastLevel, Phase, TvEvent } from '../types'\n"
    "import type { BroadcastEditorialMetadata } from './broadcastEditorialPolicy'\n",
    'catalog editorial import',
)
text = replace_once(
    text,
    "  /** Undefined templates are shared across all campaigns. */\n  campaign?: BroadcastCampaign\n",
    "  /** Optional P0 editorial/presentation contract. Missing metadata remains legacy/protected. */\n"
    "  editorial?: BroadcastEditorialMetadata\n"
    "  /** Undefined templates are shared across all campaigns. */\n"
    "  campaign?: BroadcastCampaign\n",
    'catalog editorial field',
)
text = replace_once(
    text,
    "  forceOnTv = true,\n  campaign?: BroadcastCampaign\n): BroadcastTemplate => ({",
    "  forceOnTv = true,\n"
    "  campaign?: BroadcastCampaign,\n"
    "  editorial?: BroadcastEditorialMetadata\n"
    "): BroadcastTemplate => ({",
    'feed signature',
)
text = replace_once(
    text,
    "  forceOnTv,\n  campaign,\n  note,\n})",
    "  forceOnTv,\n  campaign,\n  editorial,\n  note,\n})",
    'feed result',
)

replacements = {
    "  feed(\n    'loh.competition-start',\n    'loh_comp',\n    'The Leader of the House competition has begun! 🏆 Who will win power today?'\n  ),": "  feed(\n    'loh.competition-start',\n    'loh_comp',\n    'The Leader of the House competition has begun! 🏆 Who will win power today?',\n    'game',\n    'minor',\n    undefined,\n    'Mechanical process narration · log only',\n    false,\n    undefined,\n    { importance: 'required', presentationMode: 'log_only' }\n  ),",
    "  feed('nominations.preparing', 'nominations', '{leader} is preparing the nomination ceremony. 🎯'),": "  feed(\n    'nominations.preparing',\n    'nominations',\n    '{leader} is preparing the nomination ceremony. 🎯',\n    'game',\n    'minor',\n    undefined,\n    'Mechanical process narration · log only',\n    false,\n    undefined,\n    { importance: 'required', presentationMode: 'log_only' }\n  ),",
    "  feed('pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'),": "  feed(\n    'pos.competition-start',\n    'pos_comp',\n    'The Power of Safety competition is underway! 🎭',\n    'game',\n    'minor',\n    undefined,\n    'Mechanical process narration · log only',\n    false,\n    undefined,\n    { importance: 'required', presentationMode: 'log_only' }\n  ),",
    "  feed('safety.holder', 'pos_ceremony', '{holder} is holding the Safety Ceremony. ⚡'),": "  feed(\n    'safety.holder',\n    'pos_ceremony',\n    '{holder} is holding the Safety Ceremony. ⚡',\n    'game',\n    'minor',\n    undefined,\n    'Mechanical process narration · log only',\n    false,\n    undefined,\n    { importance: 'required', presentationMode: 'log_only' }\n  ),",
    "  feed(\n    'safety.replacement-selecting',\n    'pos_ceremony_results',\n    '{leader} is selecting a backup nominee...'\n  ),": "  feed(\n    'safety.replacement-selecting',\n    'pos_ceremony_results',\n    '{leader} is selecting a backup nominee...',\n    'game',\n    'minor',\n    undefined,\n    'Mechanical process narration · log only',\n    false,\n    undefined,\n    { importance: 'required', presentationMode: 'log_only' }\n  ),",
}
for old, new in replacements.items():
    text = replace_once(text, old, new, old.split("'")[1])
CATALOG.write_text(text)

text = GAME.read_text()
text = replace_once(
    text,
    "    broadcastLevel: finalLevel,\n"
    "    broadcastManaged: true,\n"
    "    ...(forceOnTv ? { forceOnTv: true } : {}),",
    "    broadcastLevel: finalLevel,\n"
    "    broadcastManaged: true,\n"
    "    ...(template?.editorial && meta?.editorial == null\n"
    "      ? { editorial: template.editorial }\n"
    "      : {}),\n"
    "    ...(forceOnTv ? { forceOnTv: true } : {}),",
    'pushEvent finalMeta editorial materialization',
)
GAME.write_text(text)

TEST.write_text("""import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, setBroadcastOverride } from '../src/store/gameSlice'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'

const CASES = [
  [
    'loh.competition-start',
    'loh_comp',
    'The Leader of the House competition has begun! 🏆 Who will win power today?',
  ],
  ['pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'],
  ['nominations.preparing', 'nominations', 'Alex is preparing the nomination ceremony. 🎯'],
  ['safety.holder', 'pos_ceremony', 'Alex is holding the Safety Ceremony. ⚡'],
  [
    'safety.replacement-selecting',
    'pos_ceremony_results',
    'Alex is selecting a backup nominee...',
  ],
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

      const emitted = state.tvFeed.find(
        (candidate) => candidate.meta?.broadcastTemplateId === templateId
      )
      expect(emitted).toBeDefined()
      expect(emitted?.meta?.forceOnTv).toBeUndefined()
      expect(emitted?.meta?.editorial).toMatchObject({
        importance: 'required',
        presentationMode: 'log_only',
      })
      expect(state.broadcastQueue).not.toContain(emitted?.id)
      expect(isVisibleOnTv(emitted!)).toBe(false)
      expect(isVisibleInMainLog(emitted!)).toBe(true)
    })
  }

  it('explicit producer Force-to-TV promotes a freshly emitted log-only source', () => {
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
          forceOnTv: true,
        },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toMatchObject({
      importance: 'required',
      presentationMode: 'log_only',
    })
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })

  it('explicit Broadcast Manager Force-to-TV promotes a freshly emitted log-only source', () => {
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
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toMatchObject({
      importance: 'required',
      presentationMode: 'log_only',
    })
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })

  it('keeps a template without editorial metadata on the legacy foreground path', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_results', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'Alex has won Leader of the House! 👑',
        type: 'game',
        meta: { phase: 'loh_results', broadcastTemplateId: 'loh.winner' },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.winner'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toBeUndefined()
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })
})
""")
