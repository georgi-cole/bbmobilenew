import { useMemo, useState } from 'react'
import { getAllGames } from '../../minigames/registry'

type RuleDraft = { description: string; instructions: string[] }
type RuleMap = Record<string, RuleDraft>
const STORAGE_KEY = 'bbmobile.rules-manager.drafts.v1'

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value
  const element = document.createElement('textarea')
  element.innerHTML = value
  return element.value
}

function clean(value: string): string {
  return decodeEntities(value).replace(/\uFFFD/g, '').replace(/\r\n/g, '\n')
}

function readDrafts(): RuleMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as RuleMap
    return Object.fromEntries(Object.entries(parsed).map(([key, rule]) => [key, {
      description: clean(rule.description ?? ''),
      instructions: (rule.instructions ?? []).map(clean),
    }]))
  } catch { return {} }
}

function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export default function RulesManagerPanel() {
  const games = useMemo(() => getAllGames().filter((game) => !game.retired), [])
  const [selectedKey, setSelectedKey] = useState(games[0]?.key ?? '')
  const [drafts, setDrafts] = useState<RuleMap>(() => readDrafts())
  const selected = games.find((game) => game.key === selectedKey) ?? games[0]
  const draft = selected ? drafts[selected.key] ?? { description: selected.description, instructions: selected.instructions } : null
  const changed = Object.keys(drafts).filter((key) => games.some((game) => game.key === key))

  const update = (next: RuleDraft) => {
    if (!selected) return
    const normalized = { description: clean(next.description), instructions: next.instructions.map(clean) }
    const nextDrafts = { ...drafts, [selected.key]: normalized }
    setDrafts(nextDrafts); localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDrafts))
  }

  const exportRules = () => download(`bbmobile-rules-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(drafts, null, 2))
  const exportPatch = () => download('bbmobile-rules-patch.json', JSON.stringify({ format: 'bbmobile-rules-v1', games: drafts }, null, 2))

  if (!selected || !draft) return <section className="settings-section"><p>No games are available.</p></section>
  return <section className="settings-section rules-manager">
    <div className="rules-manager__heading"><div><p className="settings-section__heading">Rules Manager</p><p className="rules-manager__hint">Edit the canonical rules copy used by the game rules modal. Changes stay in this session until exported or published.</p></div><span className="rules-manager__count">{changed.length} changed</span></div>
    <label className="rules-manager__label">Game<select value={selected.key} onChange={(event) => setSelectedKey(event.target.value)}>{games.map((game) => <option key={game.key} value={game.key}>{game.title}</option>)}</select></label>
    <label className="rules-manager__label">Description<textarea value={draft.description} onChange={(event) => update({ ...draft, description: event.target.value })} rows={3} /></label>
    <label className="rules-manager__label">How to play <span className="rules-manager__hint">One instruction per line</span><textarea value={draft.instructions.join('\n')} onChange={(event) => update({ ...draft, instructions: event.target.value.split('\n') })} rows={9} /></label>
    <div className="rules-manager__actions"><button onClick={exportRules}>Export backup</button><button onClick={exportPatch} disabled={!changed.length}>Create PR package</button><button disabled title="Connect the existing Broadcast Manager GitHub publisher to enable this action">Publish to main</button></div>
    <p className="rules-manager__notice">Formatting is normalized to UTF-8 text and HTML entities are decoded before saving. “Create PR package” is ready to hand to the repository publisher; direct publishing is unavailable in this checkout because no GitHub publishing endpoint is present.</p>
  </section>
}
