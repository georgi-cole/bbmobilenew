import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { resetSocialActionOverrides, setSocialActionOverrides } from '../../store/settingsSlice'
import type { SocialActionDefinition } from '../../social/socialActions'
import {
  REALITY_RELATIONSHIP_DIMENSIONS,
  buildEffectiveSocialActions,
  getAllowedRealityPresets,
  getActionAffinityEffects,
  getActionScoreEffects,
  getDefaultRealityEffects,
  getSocialActionGrouping,
  sanitiseSocialActionOverrides,
  type SocialActionLayer,
  type SocialActionOverride,
} from '../../social/socialActionManager'
import { adaptLegacyActionContract } from '../../social/reality/actionContract'
import { normalizeActionCosts, normalizeActionYields } from '../../social/smExecNormalize'
import './SocialManagerPanel.css'

type ManagerView = 'catalog' | 'data'
type CostKey = 'baseCost' | 'dramaCost'
type CostResource = 'energy' | 'influence' | 'info'
type RealityEffectState = 'accepted' | 'rejected' | 'escalated' | 'deEscalated'

const LAYERS: ReadonlyArray<{ id: 'all' | SocialActionLayer; label: string }> = [
  { id: 'all', label: 'All actions' },
  { id: 'basic', label: 'Basic' },
  { id: 'reality', label: 'Reality Mode' },
  { id: 'vox', label: 'Reality campaigns' },
  { id: 'ai', label: 'AI & system' },
]

const REALITY_STATES: ReadonlyArray<{ id: RealityEffectState; label: string }> = [
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'deEscalated', label: 'De-escalated' },
]

function toCostObject(cost: SocialActionDefinition['baseCost'] | undefined) {
  if (typeof cost === 'number') return { energy: cost, influence: 0, info: 0 }
  return {
    energy: cost?.energy ?? 0,
    influence: cost?.influence ?? 0,
    info: cost?.info ?? 0,
  }
}

function csv(values: readonly string[] | undefined): string {
  return values?.join(', ') ?? ''
}

function parseCsv(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
}) {
  return (
    <label className="social-manager__field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  hint,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  multiline?: boolean
}) {
  return (
    <label className="social-manager__field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export default function SocialManagerPanel() {
  const dispatch = useAppDispatch()
  const overrides = useAppSelector((state) => state.settings.social.actionOverrides)
  const [view, setView] = useState<ManagerView>('catalog')
  const [layer, setLayer] = useState<'all' | SocialActionLayer>('all')
  const [subtype, setSubtype] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('compliment')
  const [dataText, setDataText] = useState('')
  const [message, setMessage] = useState('')

  const actions = useMemo(() => buildEffectiveSocialActions(overrides), [overrides])
  const filteredActions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return actions
      .filter((action) => {
        const grouping = getSocialActionGrouping(action)
        return (
          (layer === 'all' || grouping.layer === layer) &&
          (subtype === 'all' || grouping.subtype === subtype) &&
          (!query ||
            `${action.id} ${action.title} ${action.description ?? ''} ${action.outcomeTag ?? ''}`
              .toLowerCase()
              .includes(query))
        )
      })
      .sort((left, right) => {
        const leftGroup = getSocialActionGrouping(left)
        const rightGroup = getSocialActionGrouping(right)
        return (
          leftGroup.layerLabel.localeCompare(rightGroup.layerLabel) ||
          leftGroup.subtypeLabel.localeCompare(rightGroup.subtypeLabel) ||
          left.title.localeCompare(right.title)
        )
      })
  }, [actions, layer, search, subtype])

  const subtypes = useMemo(() => {
    const options = new Map<string, string>()
    for (const action of actions) {
      const grouping = getSocialActionGrouping(action)
      if (layer === 'all' || grouping.layer === layer) {
        options.set(grouping.subtype, grouping.subtypeLabel)
      }
    }
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [actions, layer])

  const selected =
    actions.find((action) => action.id === selectedId) ?? filteredActions[0] ?? actions[0]
  if (!selected) return null

  const grouping = getSocialActionGrouping(selected)
  const contract = adaptLegacyActionContract(selected)
  const affinityEffects = getActionAffinityEffects(selected)
  const scoreEffects = getActionScoreEffects(selected)
  const realityEffects = getDefaultRealityEffects(selected)
  const normalCosts = normalizeActionCosts(selected, 1, false)
  const realityCosts = normalizeActionCosts(selected, 1, true)
  const resolvedYields = normalizeActionYields(selected)
  const changedCount = Object.keys(overrides).length
  const disabledCount = actions.filter((action) => action.enabled === false).length

  function commit(patch: SocialActionOverride) {
    dispatch(
      setSocialActionOverrides({
        ...overrides,
        [selected.id]: { ...overrides[selected.id], ...patch },
      })
    )
  }

  function updateCost(key: CostKey, resource: CostResource, value: number) {
    const source =
      key === 'baseCost' ? selected.baseCost : (selected.dramaCost ?? selected.baseCost)
    commit({ [key]: { ...toCostObject(source), [resource]: value } } as SocialActionOverride)
  }

  function updateArray(key: keyof SocialActionOverride, value: string) {
    commit({ [key]: parseCsv(value) } as SocialActionOverride)
  }

  function updateRealityEffect(
    state: RealityEffectState,
    dimension: (typeof REALITY_RELATIONSHIP_DIMENSIONS)[number],
    value: number
  ) {
    commit({
      realityEffects: {
        ...selected.realityEffects,
        [state]: { ...realityEffects[state], [dimension]: value },
      },
    })
  }

  function resetSelected() {
    const next = { ...overrides }
    delete next[selected.id]
    dispatch(setSocialActionOverrides(next))
    setMessage(`${selected.title} restored to bundled defaults.`)
  }

  function exportData() {
    const text = JSON.stringify({ schemaVersion: 1, actionOverrides: overrides }, null, 2)
    setDataText(text)
    void navigator.clipboard?.writeText(text).then(
      () => setMessage('Social Manager JSON copied to the clipboard.'),
      () => setMessage('Export prepared below. Copy it manually from the JSON field.')
    )
  }

  function importData() {
    try {
      const parsed = JSON.parse(dataText) as { actionOverrides?: unknown }
      const imported = sanitiseSocialActionOverrides(parsed.actionOverrides ?? parsed)
      dispatch(setSocialActionOverrides(imported))
      setMessage(`Imported ${Object.keys(imported).length} action override(s).`)
    } catch {
      setMessage('Import failed: the JSON is not valid.')
    }
  }

  return (
    <section className="social-manager" aria-label="Social Manager">
      <header className="social-manager__hero">
        <div>
          <p className="social-manager__eyebrow">Central action contract</p>
          <h2>Social Manager</h2>
          <p>
            Review and tune every outgoing social action. Changes are persistent and drive the
            player catalog, AI execution, prices, eligibility, legacy affinity, and Reality
            relationship effects.
          </p>
        </div>
        <div className="social-manager__health" aria-label="Social action summary">
          <strong>{actions.length}</strong>
          <span>actions</span>
          <strong>{changedCount}</strong>
          <span>customized</span>
          <strong>{disabledCount}</strong>
          <span>disabled</span>
        </div>
      </header>

      <nav className="social-manager__view-tabs" aria-label="Social Manager sections">
        <button
          className={view === 'catalog' ? 'is-active' : ''}
          onClick={() => setView('catalog')}
        >
          Action catalog
        </button>
        <button className={view === 'data' ? 'is-active' : ''} onClick={() => setView('data')}>
          Import / export
        </button>
      </nav>

      {message && (
        <div className="social-manager__message" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      {view === 'data' ? (
        <div className="social-manager__data">
          <div className="social-manager__section-heading">
            <h3>Portable authoring data</h3>
            <p>Only your overrides are exported. Bundled defaults stay in source control.</p>
          </div>
          <textarea
            rows={18}
            value={dataText}
            onChange={(event) => setDataText(event.target.value)}
            spellCheck={false}
            aria-label="Social Manager JSON"
          />
          <div className="social-manager__data-actions">
            <button onClick={exportData}>Export & copy</button>
            <button onClick={importData}>Import JSON</button>
            <button
              className="social-manager__danger"
              onClick={() => {
                if (!window.confirm('Reset every Social Manager override?')) return
                dispatch(resetSocialActionOverrides())
                setDataText('')
                setMessage('All social actions restored to bundled defaults.')
              }}
            >
              Reset all overrides
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="social-manager__filters">
            <div className="social-manager__segments" aria-label="Action layer filter">
              {LAYERS.map((item) => (
                <button
                  key={item.id}
                  className={layer === item.id ? 'is-active' : ''}
                  onClick={() => {
                    setLayer(item.id)
                    setSubtype('all')
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <select value={subtype} onChange={(event) => setSubtype(event.target.value)}>
              <option value="all">All subtypes</option>
              {subtypes.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              placeholder="Search actions, tags, IDs…"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search social actions"
            />
          </div>

          <div className="social-manager__workspace">
            <aside className="social-manager__catalog" aria-label="Social actions">
              <div className="social-manager__catalog-count">{filteredActions.length} shown</div>
              {filteredActions.map((action) => {
                const actionGrouping = getSocialActionGrouping(action)
                return (
                  <button
                    key={action.id}
                    className={`${selected.id === action.id ? 'is-selected' : ''} ${action.enabled === false ? 'is-disabled' : ''}`}
                    onClick={() => setSelectedId(action.id)}
                  >
                    <span className="social-manager__catalog-icon">{action.icon ?? '•'}</span>
                    <span>
                      <strong>{action.title}</strong>
                      <small>
                        {actionGrouping.subtypeLabel} · {action.id}
                      </small>
                    </span>
                    {overrides[action.id] && <i title="Customized">●</i>}
                  </button>
                )
              })}
            </aside>

            <article className="social-manager__editor">
              <header className="social-manager__editor-header">
                <div>
                  <p>
                    {grouping.layerLabel} / {grouping.subtypeLabel}
                  </p>
                  <h3>
                    {selected.icon} {selected.title}
                  </h3>
                  <code>{selected.id}</code>
                </div>
                <div className="social-manager__editor-actions">
                  <label className="social-manager__switch">
                    <input
                      type="checkbox"
                      checked={selected.enabled !== false}
                      onChange={(event) => commit({ enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                  <button onClick={resetSelected} disabled={!overrides[selected.id]}>
                    Reset action
                  </button>
                </div>
              </header>

              <details open>
                <summary>Identity & placement</summary>
                <div className="social-manager__field-grid">
                  <TextField
                    label="Title"
                    value={selected.title}
                    onChange={(title) => commit({ title })}
                  />
                  <TextField
                    label="Icon"
                    value={selected.icon ?? ''}
                    onChange={(icon) => commit({ icon })}
                  />
                  <TextField
                    label="Description"
                    value={selected.description ?? ''}
                    onChange={(description) => commit({ description })}
                    multiline
                  />
                  <TextField
                    label="Availability hint"
                    value={selected.availabilityHint ?? ''}
                    onChange={(availabilityHint) => commit({ availabilityHint })}
                  />
                  <label className="social-manager__field">
                    <span>Category</span>
                    <select
                      value={selected.category}
                      onChange={(event) =>
                        commit({
                          category: event.target.value as SocialActionDefinition['category'],
                        })
                      }
                    >
                      <option value="friendly">Friendly</option>
                      <option value="strategic">Strategic</option>
                      <option value="aggressive">Aggressive</option>
                      <option value="alliance">Alliance</option>
                    </select>
                  </label>
                  <label className="social-manager__field">
                    <span>Economy role</span>
                    <select
                      value={selected.kind ?? ''}
                      onChange={(event) =>
                        commit({
                          kind: (event.target.value || undefined) as SocialActionDefinition['kind'],
                        })
                      }
                    >
                      <option value="">Unspecified</option>
                      <option value="rapport">Rapport</option>
                      <option value="intel_gain">Intel gain</option>
                      <option value="intel_spend">Intel spend</option>
                      <option value="political_spend">Political spend</option>
                      <option value="aggressive">Aggressive</option>
                    </select>
                  </label>
                </div>
                <div className="social-manager__checks">
                  {(
                    [
                      ['dramaOnly', 'Reality only'],
                      ['realityExclusive', 'Locked Reality preview'],
                      ['voxOnly', 'Vox Populi only'],
                      ['aiOnly', 'AI only'],
                      ['requiresKnownSecret', 'Requires known secret'],
                      ['requiredArcPublic', 'Requires public story arc'],
                      ['allowActorAsSubject', 'Actor may be subject'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={selected[key] === true}
                        onChange={(event) => commit({ [key]: event.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </details>

              <details open>
                <summary>Prices & resources</summary>
                <div className="social-manager__price-table">
                  <div className="social-manager__price-heading">Mode</div>
                  <div className="social-manager__price-heading">Energy</div>
                  <div className="social-manager__price-heading">Influence</div>
                  <div className="social-manager__price-heading">Info</div>
                  {(
                    [
                      ['baseCost', 'Basic', toCostObject(selected.baseCost)],
                      [
                        'dramaCost',
                        'Reality',
                        toCostObject(selected.dramaCost ?? selected.baseCost),
                      ],
                    ] as const
                  ).map(([key, label, costs]) => (
                    <div className="social-manager__price-row" key={key}>
                      <strong>{label}</strong>
                      {(['energy', 'influence', 'info'] as const).map((resource) => (
                        <input
                          key={resource}
                          type="number"
                          min={0}
                          step={0.1}
                          value={costs[resource]}
                          aria-label={`${label} ${resource} price`}
                          onChange={(event) =>
                            updateCost(key, resource, Number(event.target.value))
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <p className="social-manager__resolved">
                  Runtime bank price for one target — Basic: ⚡{normalCosts.energy} · 🤝
                  {normalCosts.influence} · 💡{normalCosts.info}; Reality: ⚡{realityCosts.energy} ·
                  🤝{realityCosts.influence} · 💡{realityCosts.info}
                </p>
                <div className="social-manager__field-grid social-manager__field-grid--compact">
                  <NumberField
                    label="Influence yield (authored)"
                    value={selected.yields?.influence ?? 0}
                    step={0.01}
                    onChange={(influence) => commit({ yields: { ...selected.yields, influence } })}
                    hint={`Runtime: +${resolvedYields.influence}`}
                  />
                  <NumberField
                    label="Info yield (authored)"
                    value={selected.yields?.info ?? 0}
                    step={0.1}
                    onChange={(info) => commit({ yields: { ...selected.yields, info } })}
                    hint={`Runtime: +${resolvedYields.info}`}
                  />
                  <NumberField
                    label="Reality base weight"
                    value={selected.successWeight ?? 1}
                    min={0}
                    step={0.05}
                    onChange={(successWeight) => commit({ successWeight })}
                  />
                  <NumberField
                    label="Normal AI selection weight"
                    value={selected.aiWeight ?? 0}
                    min={0}
                    step={0.05}
                    onChange={(aiWeight) => commit({ aiWeight })}
                    hint="0 leaves bundled AI policy unchanged"
                  />
                  <NumberField
                    label="Energy per target"
                    value={selected.energyPerTarget ?? 0}
                    min={0}
                    step={0.1}
                    onChange={(energyPerTarget) => commit({ energyPerTarget })}
                  />
                </div>
              </details>

              <details open>
                <summary>Connections, targets & eligibility</summary>
                <div className="social-manager__field-grid">
                  <label className="social-manager__field">
                    <span>Basic target shape</span>
                    <select
                      value={
                        selected.targetMode ??
                        (selected.needsTargets === false ? 'none' : 'primary')
                      }
                      onChange={(event) =>
                        commit({
                          targetMode: event.target.value as SocialActionDefinition['targetMode'],
                        })
                      }
                    >
                      <option value="none">No target</option>
                      <option value="primary">One target</option>
                      <option value="primaryPlusSubject">Target + subject</option>
                      <option value="multi">Multiple targets</option>
                    </select>
                  </label>
                  <label className="social-manager__field">
                    <span>Reality target shape</span>
                    <select
                      value={selected.dramaTargetMode ?? selected.targetMode ?? 'primary'}
                      onChange={(event) =>
                        commit({
                          dramaTargetMode: event.target
                            .value as SocialActionDefinition['dramaTargetMode'],
                        })
                      }
                    >
                      <option value="none">No target</option>
                      <option value="primary">One target</option>
                      <option value="primaryPlusSubject">Target + subject</option>
                      <option value="multi">Multiple targets</option>
                    </select>
                  </label>
                  <label className="social-manager__field">
                    <span>Subject pool</span>
                    <select
                      value={selected.subjectPool ?? 'houseguests'}
                      onChange={(event) =>
                        commit({
                          subjectPool: event.target.value as SocialActionDefinition['subjectPool'],
                        })
                      }
                    >
                      <option value="houseguests">Houseguests</option>
                      <option value="nominees">Nominees</option>
                      <option value="non_nominees">Non-nominees</option>
                      <option value="allies">Allies</option>
                      <option value="voters">Voters</option>
                    </select>
                  </label>
                  <NumberField
                    label="Minimum targets"
                    value={selected.minTargets ?? 1}
                    min={0}
                    max={32}
                    onChange={(minTargets) => commit({ minTargets })}
                  />
                  <NumberField
                    label="Maximum targets"
                    value={selected.maxTargets ?? 1}
                    min={0}
                    max={32}
                    onChange={(maxTargets) => commit({ maxTargets })}
                  />
                  <TextField
                    label="Basic phases"
                    value={csv(selected.allowedPhases)}
                    onChange={(value) => updateArray('allowedPhases', value)}
                    hint="Comma-separated; blank means any phase"
                  />
                  <TextField
                    label="Reality phases"
                    value={csv(selected.dramaAllowedPhases)}
                    onChange={(value) => updateArray('dramaAllowedPhases', value)}
                  />
                  <TextField
                    label="Actor roles"
                    value={csv(selected.requiredActorStatus)}
                    onChange={(value) => updateArray('requiredActorStatus', value)}
                  />
                  <TextField
                    label="Reality actor roles"
                    value={csv(selected.dramaRequiredActorStatus)}
                    onChange={(value) => updateArray('dramaRequiredActorStatus', value)}
                  />
                  <TextField
                    label="Target roles"
                    value={csv(selected.requiredTargetStatus)}
                    onChange={(value) => updateArray('requiredTargetStatus', value)}
                  />
                  <TextField
                    label="Reality target roles"
                    value={csv(selected.dramaRequiredTargetStatus)}
                    onChange={(value) => updateArray('dramaRequiredTargetStatus', value)}
                  />
                  <TextField
                    label="Required relationship tags"
                    value={csv(selected.requiredRelationshipTags)}
                    onChange={(value) => updateArray('requiredRelationshipTags', value)}
                  />
                  <TextField
                    label="Excluded relationship tags"
                    value={csv(selected.excludedRelationshipTags)}
                    onChange={(value) => updateArray('excludedRelationshipTags', value)}
                  />
                  <TextField
                    label="Reality required tags"
                    value={csv(selected.dramaRequiredRelationshipTags)}
                    onChange={(value) => updateArray('dramaRequiredRelationshipTags', value)}
                  />
                  <TextField
                    label="Reality excluded tags"
                    value={csv(selected.dramaExcludedRelationshipTags)}
                    onChange={(value) => updateArray('dramaExcludedRelationshipTags', value)}
                  />
                  <NumberField
                    label="Minimum affinity"
                    value={selected.minAffinity ?? -100}
                    min={-100}
                    max={100}
                    onChange={(minAffinity) => commit({ minAffinity })}
                  />
                  <NumberField
                    label="Maximum affinity"
                    value={selected.maxAffinity ?? 100}
                    min={-100}
                    max={100}
                    onChange={(maxAffinity) => commit({ maxAffinity })}
                  />
                  <NumberField
                    label="Reality minimum affinity"
                    value={selected.dramaMinAffinity ?? selected.minAffinity ?? -100}
                    min={-100}
                    max={100}
                    onChange={(dramaMinAffinity) => commit({ dramaMinAffinity })}
                  />
                  <NumberField
                    label="Reality maximum affinity"
                    value={selected.dramaMaxAffinity ?? selected.maxAffinity ?? 100}
                    min={-100}
                    max={100}
                    onChange={(dramaMaxAffinity) => commit({ dramaMaxAffinity })}
                  />
                  <TextField
                    label="Required story arcs"
                    value={csv(selected.requiredArcTypes)}
                    onChange={(value) => updateArray('requiredArcTypes', value)}
                    hint="romance, bromance, rivalry, betrayal"
                  />
                  <TextField
                    label="Excluded story arcs"
                    value={csv(selected.excludedArcTypes)}
                    onChange={(value) => updateArray('excludedArcTypes', value)}
                  />
                  <TextField
                    label="Required arc stages"
                    value={csv(selected.requiredArcStages)}
                    onChange={(value) => updateArray('requiredArcStages', value)}
                  />
                </div>

                <h4>Reality action-contract connections</h4>
                <div className="social-manager__field-grid">
                  <TextField
                    label="Purposes"
                    value={contract.purposes.join(', ')}
                    onChange={(value) => updateArray('realityPurposes', value.toUpperCase())}
                  />
                  <TextField
                    label="Directions"
                    value={contract.allowedDirections.join(', ')}
                    onChange={(value) =>
                      updateArray('realityAllowedDirections', value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Game modes"
                    value={contract.allowedGameModes.join(', ')}
                    onChange={(value) =>
                      updateArray('realityAllowedGameModes', value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Reality intensity presets"
                    value={getAllowedRealityPresets(selected).join(', ')}
                    onChange={(value) => updateArray('allowedRealityPresets', value.toLowerCase())}
                    hint="casual, tv, adult"
                  />
                  <label className="social-manager__field">
                    <span>Visibility</span>
                    <select
                      value={contract.visibility}
                      onChange={(event) => commit({ realityVisibility: event.target.value })}
                    >
                      <option>PRIVATE</option>
                      <option>PAIR_ONLY</option>
                      <option>GROUP_VISIBLE</option>
                      <option>HOUSE_PUBLIC</option>
                      <option>CEREMONY_PUBLIC</option>
                      <option>VIEWER_ONLY</option>
                      <option>JURY_ONLY</option>
                    </select>
                  </label>
                  <NumberField
                    label="Cooldown phases"
                    value={contract.cooldownPhases}
                    min={0}
                    max={100}
                    onChange={(realityCooldownPhases) => commit({ realityCooldownPhases })}
                  />
                  <TextField
                    label="Response set"
                    value={contract.responseSetId}
                    onChange={(responseSetId) => commit({ responseSetId })}
                  />
                  <TextField
                    label="Outcome resolver"
                    value={contract.outcomeResolverId}
                    onChange={(outcomeResolverId) => commit({ outcomeResolverId })}
                  />
                  <TextField
                    label="Memory template"
                    value={contract.memoryTemplateId}
                    onChange={(memoryTemplateId) => commit({ memoryTemplateId })}
                  />
                  <TextField
                    label="Dialogue set"
                    value={contract.dialogueSetId}
                    onChange={(dialogueSetId) => commit({ dialogueSetId })}
                  />
                  <TextField
                    label="Relationship outcome tag"
                    value={selected.outcomeTag ?? ''}
                    onChange={(outcomeTag) => commit({ outcomeTag })}
                  />
                </div>
              </details>

              <details open>
                <summary>Effects</summary>
                <div className="social-manager__field-grid social-manager__field-grid--compact">
                  <NumberField
                    label="Affinity on success"
                    value={affinityEffects.success}
                    min={-100}
                    max={100}
                    onChange={(success) =>
                      commit({ affinityEffects: { ...affinityEffects, success } })
                    }
                  />
                  <NumberField
                    label="Affinity on failure"
                    value={affinityEffects.failure}
                    min={-100}
                    max={100}
                    onChange={(failure) =>
                      commit({ affinityEffects: { ...affinityEffects, failure } })
                    }
                  />
                  <NumberField
                    label="Outcome score on success"
                    value={scoreEffects.success}
                    min={-1}
                    max={1}
                    step={0.01}
                    onChange={(success) => commit({ scoreEffects: { ...scoreEffects, success } })}
                  />
                  <NumberField
                    label="Outcome score on failure"
                    value={scoreEffects.failure}
                    min={-1}
                    max={1}
                    step={0.01}
                    onChange={(failure) => commit({ scoreEffects: { ...scoreEffects, failure } })}
                  />
                </div>
                <div className="social-manager__effect-legend">
                  Reality effects are directed deltas from actor to target. Every relationship
                  dimension can be tuned independently for each response state.
                </div>
                <div className="social-manager__effect-table">
                  <div className="social-manager__effect-heading">Dimension</div>
                  {REALITY_STATES.map((state) => (
                    <div key={state.id} className="social-manager__effect-heading">
                      {state.label}
                    </div>
                  ))}
                  {REALITY_RELATIONSHIP_DIMENSIONS.map((dimension) => (
                    <div className="social-manager__effect-row" key={dimension}>
                      <strong>{dimension}</strong>
                      {REALITY_STATES.map((state) => (
                        <input
                          key={state.id}
                          type="number"
                          step={1}
                          min={-100}
                          max={100}
                          value={realityEffects[state.id][dimension] ?? 0}
                          aria-label={`${dimension} when ${state.label.toLowerCase()}`}
                          onChange={(event) =>
                            updateRealityEffect(state.id, dimension, Number(event.target.value))
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
