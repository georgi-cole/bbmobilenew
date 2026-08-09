import { useId, useMemo, useState } from 'react'
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

const REALITY_STATE_HELP: Record<RealityEffectState, string> = {
  accepted:
    'Applied when the target accepts or responds positively. Positive numbers strengthen that dimension; negative numbers weaken it.',
  rejected:
    'Applied when the target rejects the action. Positive numbers increase the dimension; negative numbers reduce it.',
  escalated:
    'Applied when the interaction intensifies into a stronger version. Use larger magnitudes for a more dramatic relationship shift.',
  deEscalated:
    'Applied when the interaction is cooled down or softened. Positive and negative values still change the named dimension directly.',
}

const REALITY_DIMENSION_HELP: Record<(typeof REALITY_RELATIONSHIP_DIMENSIONS)[number], string> = {
  warmth: 'General fondness and emotional warmth toward the target.',
  trust: 'Belief that the target is honest, safe, and dependable.',
  loyalty: 'Willingness to stand by, protect, or vote with the target.',
  respect: 'Admiration for the target’s competence, character, or status.',
  attraction: 'Romantic or physical attraction toward the target.',
  intimacy: 'Emotional or physical closeness beyond ordinary friendliness.',
  gratitude: 'How thankful or indebted the actor feels toward the target.',
  resentment: 'Stored anger or bitterness. Positive values create more resentment.',
  fear: 'How threatened or intimidated the actor feels by the target.',
  envy: 'Jealousy of the target’s position, bonds, attention, or success.',
  suspicion: 'Doubt about the target’s motives or truthfulness.',
  strategicValue: 'How useful the actor considers the target for their game.',
  perceivedThreat: 'How dangerous the target appears strategically or socially.',
  reliability: 'Expectation that the target will keep promises and follow through.',
  familiarity: 'How well the actor feels they know the target.',
  publicCloseness: 'Closeness that other houseguests or viewers can perceive.',
  secretCloseness: 'Private closeness that may be hidden from the house.',
}

function HelpTooltip({ text }: { text: string }) {
  const id = useId()
  return (
    <span className="social-manager__help">
      <button
        type="button"
        className="social-manager__help-trigger"
        aria-label="Explain this field"
        aria-describedby={id}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        ?
      </button>
      <span id={id} role="tooltip" className="social-manager__tooltip">
        {text}
      </span>
    </span>
  )
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="social-manager__field-label">
      <span>{label}</span>
      <HelpTooltip text={help} />
    </span>
  )
}

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
  help,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
  help: string
}) {
  return (
    <label className="social-manager__field">
      <FieldLabel label={label} help={help} />
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
  help,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  help: string
  multiline?: boolean
}) {
  return (
    <label className="social-manager__field">
      <FieldLabel label={label} help={help} />
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
          <p className="social-manager__help-intro">
            Hover, focus, or tap any <strong>?</strong> to see what a field controls and how
            changing it affects the game.
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
                    <HelpTooltip text="Master switch for this action. Disable it to remove it from player, AI, and Reality execution without deleting its configuration." />
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
                    help="The player-facing name shown on the action card and in Social Manager. Changing it affects wording only, not behavior."
                    value={selected.title}
                    onChange={(title) => commit({ title })}
                  />
                  <TextField
                    label="Icon"
                    help="The emoji or short symbol displayed beside this action. Changing it is visual only."
                    value={selected.icon ?? ''}
                    onChange={(icon) => commit({ icon })}
                  />
                  <TextField
                    label="Description"
                    help="Explains the action to the player. Change this when the action’s purpose or result needs clearer wording; it does not change mechanics."
                    value={selected.description ?? ''}
                    onChange={(description) => commit({ description })}
                    multiline
                  />
                  <TextField
                    label="Availability hint"
                    help="Shown when the action is unavailable to explain what is missing. This is guidance text; the actual rules are set in the eligibility fields below."
                    value={selected.availabilityHint ?? ''}
                    onChange={(availabilityHint) => commit({ availabilityHint })}
                  />
                  <label className="social-manager__field">
                    <FieldLabel
                      label="Category"
                      help="Controls where the action is grouped and how policies interpret its intent: friendly, strategic, aggressive, or alliance-focused."
                    />
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
                    <FieldLabel
                      label="Economy role"
                      help="Describes the action’s resource purpose to selection and balancing systems. For example, intel gain earns information while intel spend consumes it."
                    />
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
                      [
                        'dramaOnly',
                        'Reality only',
                        'When enabled, this action is hidden and blocked outside Reality Mode.',
                      ],
                      [
                        'realityExclusive',
                        'Locked Reality preview',
                        'Marks the action as exclusive Reality content that may appear as a locked preview when Reality Mode is unavailable.',
                      ],
                      [
                        'voxOnly',
                        'Vox Populi only',
                        'Restricts the action to Vox Populi games and campaign systems.',
                      ],
                      [
                        'aiOnly',
                        'AI only',
                        'Prevents the player from choosing this action directly; AI and system flows can still execute it.',
                      ],
                      [
                        'requiresKnownSecret',
                        'Requires known secret',
                        'The actor must possess usable secret information before this action becomes eligible.',
                      ],
                      [
                        'requiredArcPublic',
                        'Requires public story arc',
                        'The required relationship story arc must already be publicly known, not merely active in private.',
                      ],
                      [
                        'allowActorAsSubject',
                        'Actor may be subject',
                        'Allows the acting houseguest to also fill the secondary subject slot. Disable it to require somebody else.',
                      ],
                    ] as const
                  ).map(([key, label, help]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={selected[key] === true}
                        onChange={(event) => commit({ [key]: event.target.checked })}
                      />
                      {label}
                      <HelpTooltip text={help} />
                    </label>
                  ))}
                </div>
              </details>

              <details open>
                <summary>Prices & resources</summary>
                <div className="social-manager__price-table">
                  <div className="social-manager__price-heading">Mode</div>
                  <div className="social-manager__price-heading">
                    Energy
                    <HelpTooltip text="Energy spent when the action runs. Higher values make the action harder to afford and reduce how often it can be used." />
                  </div>
                  <div className="social-manager__price-heading">
                    Influence
                    <HelpTooltip text="Influence spent when the action runs. Raise it for politically powerful actions; lower it to make them easier to access." />
                  </div>
                  <div className="social-manager__price-heading">
                    Info
                    <HelpTooltip text="Information resource spent when the action runs. Use this to price actions that reveal, weaponize, or trade secrets." />
                  </div>
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
                      <strong>
                        {label}
                        <HelpTooltip
                          text={
                            key === 'baseCost'
                              ? 'These prices apply in normal/basic social play.'
                              : 'These prices apply in Reality Mode and override Basic prices there.'
                          }
                        />
                      </strong>
                      {(['energy', 'influence', 'info'] as const).map((resource) => (
                        <input
                          key={resource}
                          type="number"
                          min={0}
                          step={0.1}
                          value={costs[resource]}
                          aria-label={`${label} ${resource} price`}
                          title={`${label} ${resource} cost. Higher values make this action more expensive in ${label.toLowerCase()} mode.`}
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
                    help="Influence awarded after using the action. Increasing it makes this action a stronger source of political currency; the runtime value below shows the normalized award."
                    value={selected.yields?.influence ?? 0}
                    step={0.01}
                    onChange={(influence) => commit({ yields: { ...selected.yields, influence } })}
                    hint={`Runtime: +${resolvedYields.influence}`}
                  />
                  <NumberField
                    label="Info yield (authored)"
                    help="Information awarded after using the action. Increasing it makes the action a stronger source of intel; the runtime value below shows the normalized award."
                    value={selected.yields?.info ?? 0}
                    step={0.1}
                    onChange={(info) => commit({ yields: { ...selected.yields, info } })}
                    hint={`Runtime: +${resolvedYields.info}`}
                  />
                  <NumberField
                    label="Reality base weight"
                    help="Relative chance or strength used by Reality action selection. Higher values make the action more favored compared with other eligible Reality actions; 0 effectively removes its weight."
                    value={selected.successWeight ?? 1}
                    min={0}
                    step={0.05}
                    onChange={(successWeight) => commit({ successWeight })}
                  />
                  <NumberField
                    label="Normal AI selection weight"
                    help="Overrides how strongly normal-mode AI prefers this action. Higher values make selection more likely; 0 keeps the bundled AI policy’s original weighting."
                    value={selected.aiWeight ?? 0}
                    min={0}
                    step={0.05}
                    onChange={(aiWeight) => commit({ aiWeight })}
                    hint="0 leaves bundled AI policy unchanged"
                  />
                  <NumberField
                    label="Energy per target"
                    help="Extra energy charged for every selected target. Increasing it makes multi-target use progressively more expensive; 0 adds no target-based surcharge."
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
                    <FieldLabel
                      label="Basic target shape"
                      help="Defines the people the player must choose in normal mode: nobody, one primary target, a target plus a discussed subject, or several targets."
                    />
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
                    <FieldLabel
                      label="Reality target shape"
                      help="Reality Mode’s target structure. It overrides the Basic target shape while Reality Mode is active."
                    />
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
                    <FieldLabel
                      label="Subject pool"
                      help="Limits who may be selected as the secondary subject: everyone, nominees, non-nominees, allies, or eligible voters."
                    />
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
                    help="The fewest primary targets required before the action can run. Raising it blocks the action when too few valid people are available."
                    value={selected.minTargets ?? 1}
                    min={0}
                    max={32}
                    onChange={(minTargets) => commit({ minTargets })}
                  />
                  <NumberField
                    label="Maximum targets"
                    help="The largest number of primary targets the player or AI may select. Lower it to cap group actions; raise it to allow broader reach."
                    value={selected.maxTargets ?? 1}
                    min={0}
                    max={32}
                    onChange={(maxTargets) => commit({ maxTargets })}
                  />
                  <TextField
                    label="Basic phases"
                    help="Comma-separated game phase IDs in which normal mode may use this action. A blank list means it is allowed in every phase."
                    value={csv(selected.allowedPhases)}
                    onChange={(value) => updateArray('allowedPhases', value)}
                    hint="Comma-separated; blank means any phase"
                  />
                  <TextField
                    label="Reality phases"
                    help="Comma-separated phase IDs allowed specifically in Reality Mode. This overrides or narrows the Basic phase list for Reality execution."
                    value={csv(selected.dramaAllowedPhases)}
                    onChange={(value) => updateArray('dramaAllowedPhases', value)}
                    hint="Comma-separated; blank inherits broad availability"
                  />
                  <TextField
                    label="Actor roles"
                    help="Comma-separated statuses the acting houseguest must have in normal mode, such as nominee, HOH, voter, or juror. Blank allows any actor role."
                    value={csv(selected.requiredActorStatus)}
                    onChange={(value) => updateArray('requiredActorStatus', value)}
                  />
                  <TextField
                    label="Reality actor roles"
                    help="Reality-specific statuses required for the acting houseguest. Use this to make an action available only to certain Reality roles."
                    value={csv(selected.dramaRequiredActorStatus)}
                    onChange={(value) => updateArray('dramaRequiredActorStatus', value)}
                  />
                  <TextField
                    label="Target roles"
                    help="Comma-separated statuses a valid primary target must have in normal mode. Blank accepts targets of any role."
                    value={csv(selected.requiredTargetStatus)}
                    onChange={(value) => updateArray('requiredTargetStatus', value)}
                  />
                  <TextField
                    label="Reality target roles"
                    help="Reality-specific statuses required of the target. These rules are checked when Reality Mode executes the action."
                    value={csv(selected.dramaRequiredTargetStatus)}
                    onChange={(value) => updateArray('dramaRequiredTargetStatus', value)}
                  />
                  <TextField
                    label="Required relationship tags"
                    help="Every listed relationship tag must exist between actor and target for normal-mode eligibility. Add tags to narrow when the action appears."
                    value={csv(selected.requiredRelationshipTags)}
                    onChange={(value) => updateArray('requiredRelationshipTags', value)}
                  />
                  <TextField
                    label="Excluded relationship tags"
                    help="Any listed relationship tag blocks this action in normal mode. Use it to prevent actions in incompatible relationships."
                    value={csv(selected.excludedRelationshipTags)}
                    onChange={(value) => updateArray('excludedRelationshipTags', value)}
                  />
                  <TextField
                    label="Reality required tags"
                    help="Relationship tags required only in Reality Mode. These create Reality-specific eligibility connections."
                    value={csv(selected.dramaRequiredRelationshipTags)}
                    onChange={(value) => updateArray('dramaRequiredRelationshipTags', value)}
                  />
                  <TextField
                    label="Reality excluded tags"
                    help="Relationship tags that block the action only in Reality Mode."
                    value={csv(selected.dramaExcludedRelationshipTags)}
                    onChange={(value) => updateArray('dramaExcludedRelationshipTags', value)}
                  />
                  <NumberField
                    label="Minimum affinity"
                    help="Lowest allowed normal-mode affinity from actor to target, from -100 to 100. Raising it requires a friendlier relationship."
                    value={selected.minAffinity ?? -100}
                    min={-100}
                    max={100}
                    onChange={(minAffinity) => commit({ minAffinity })}
                  />
                  <NumberField
                    label="Maximum affinity"
                    help="Highest allowed normal-mode affinity. Lowering it can reserve hostile or confrontational actions for colder relationships."
                    value={selected.maxAffinity ?? 100}
                    min={-100}
                    max={100}
                    onChange={(maxAffinity) => commit({ maxAffinity })}
                  />
                  <NumberField
                    label="Reality minimum affinity"
                    help="Reality Mode’s minimum actor-to-target affinity. It replaces the Basic minimum during Reality eligibility checks."
                    value={selected.dramaMinAffinity ?? selected.minAffinity ?? -100}
                    min={-100}
                    max={100}
                    onChange={(dramaMinAffinity) => commit({ dramaMinAffinity })}
                  />
                  <NumberField
                    label="Reality maximum affinity"
                    help="Reality Mode’s maximum actor-to-target affinity. Lower it to prevent the action between very close houseguests."
                    value={selected.dramaMaxAffinity ?? selected.maxAffinity ?? 100}
                    min={-100}
                    max={100}
                    onChange={(dramaMaxAffinity) => commit({ dramaMaxAffinity })}
                  />
                  <TextField
                    label="Required story arcs"
                    help="Comma-separated arc types that must be active, such as romance, bromance, rivalry, or betrayal. The action is blocked without a matching arc."
                    value={csv(selected.requiredArcTypes)}
                    onChange={(value) => updateArray('requiredArcTypes', value)}
                    hint="romance, bromance, rivalry, betrayal"
                  />
                  <TextField
                    label="Excluded story arcs"
                    help="Comma-separated story arc types that make the action ineligible when active."
                    value={csv(selected.excludedArcTypes)}
                    onChange={(value) => updateArray('excludedArcTypes', value)}
                  />
                  <TextField
                    label="Required arc stages"
                    help="Comma-separated stages an active story arc must have reached. Use this to unlock actions only after a relationship story develops."
                    value={csv(selected.requiredArcStages)}
                    onChange={(value) => updateArray('requiredArcStages', value)}
                  />
                </div>

                <h4>Reality action-contract connections</h4>
                <div className="social-manager__field-grid">
                  <TextField
                    label="Purposes"
                    help="Comma-separated Reality intent codes describing why the action is performed. Selection systems use these connections to match an action to a social goal."
                    value={contract.purposes.join(', ')}
                    onChange={(value) => updateArray('realityPurposes', value.toUpperCase())}
                  />
                  <TextField
                    label="Directions"
                    help="Comma-separated relationship directions the contract supports. This determines which actor-to-target connection the Reality engine may update."
                    value={contract.allowedDirections.join(', ')}
                    onChange={(value) =>
                      updateArray('realityAllowedDirections', value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Game modes"
                    help="Comma-separated Reality game-mode codes allowed to execute this contract. Removing a mode blocks this action within that mode."
                    value={contract.allowedGameModes.join(', ')}
                    onChange={(value) =>
                      updateArray('realityAllowedGameModes', value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Reality intensity presets"
                    help="Controls which Reality content settings expose this action: casual is mild, TV allows broadcast-style drama, and adult allows mature content for eligible profiles."
                    value={getAllowedRealityPresets(selected).join(', ')}
                    onChange={(value) => updateArray('allowedRealityPresets', value.toLowerCase())}
                    hint="casual, tv, adult"
                  />
                  <label className="social-manager__field">
                    <FieldLabel
                      label="Visibility"
                      help="Who can observe or remember the Reality interaction. More public values can affect the house, viewers, ceremonies, or jury instead of only the participants."
                    />
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
                    help="Number of Reality phases that must pass before this action may repeat. Raise it to reduce repetition; 0 permits immediate reuse when otherwise eligible."
                    value={contract.cooldownPhases}
                    min={0}
                    max={100}
                    onChange={(realityCooldownPhases) => commit({ realityCooldownPhases })}
                  />
                  <TextField
                    label="Response set"
                    help="ID of the response-choice set offered to the target. Changing it connects the action to different accept, reject, escalate, or de-escalate options."
                    value={contract.responseSetId}
                    onChange={(responseSetId) => commit({ responseSetId })}
                  />
                  <TextField
                    label="Outcome resolver"
                    help="ID of the runtime resolver that calculates what happens after the response. Only use a registered resolver ID; an unknown ID can prevent the intended outcome."
                    value={contract.outcomeResolverId}
                    onChange={(outcomeResolverId) => commit({ outcomeResolverId })}
                  />
                  <TextField
                    label="Memory template"
                    help="ID of the template used to record this interaction in social memory. Changing it alters how characters remember and later reference the event."
                    value={contract.memoryTemplateId}
                    onChange={(memoryTemplateId) => commit({ memoryTemplateId })}
                  />
                  <TextField
                    label="Dialogue set"
                    help="ID of the dialogue bank used to present this action. Changing it swaps the available spoken or written lines without changing the core mechanics."
                    value={contract.dialogueSetId}
                    onChange={(dialogueSetId) => commit({ dialogueSetId })}
                  />
                  <TextField
                    label="Relationship outcome tag"
                    help="Tag written onto the relationship outcome so later rules, summaries, and story systems can recognize what happened."
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
                    help="Direct normal-mode affinity change when the action succeeds. Positive values make actor and target closer; negative values damage the relationship."
                    value={affinityEffects.success}
                    min={-100}
                    max={100}
                    onChange={(success) =>
                      commit({ affinityEffects: { ...affinityEffects, success } })
                    }
                  />
                  <NumberField
                    label="Affinity on failure"
                    help="Direct normal-mode affinity change when the action fails. Negative values create fallout; positive values can model a well-received failed attempt."
                    value={affinityEffects.failure}
                    min={-100}
                    max={100}
                    onChange={(failure) =>
                      commit({ affinityEffects: { ...affinityEffects, failure } })
                    }
                  />
                  <NumberField
                    label="Outcome score on success"
                    help="Normalized success signal from -1 to 1 used by downstream evaluation and summaries. Higher values mark the outcome as more beneficial."
                    value={scoreEffects.success}
                    min={-1}
                    max={1}
                    step={0.01}
                    onChange={(success) => commit({ scoreEffects: { ...scoreEffects, success } })}
                  />
                  <NumberField
                    label="Outcome score on failure"
                    help="Normalized failure signal from -1 to 1. More negative values mark harsher failures; positive values allow a nominal failure to retain some benefit."
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
                      <HelpTooltip text={REALITY_STATE_HELP[state.id]} />
                    </div>
                  ))}
                  {REALITY_RELATIONSHIP_DIMENSIONS.map((dimension) => (
                    <div className="social-manager__effect-row" key={dimension}>
                      <strong>
                        {dimension}
                        <HelpTooltip text={REALITY_DIMENSION_HELP[dimension]} />
                      </strong>
                      {REALITY_STATES.map((state) => (
                        <input
                          key={state.id}
                          type="number"
                          step={1}
                          min={-100}
                          max={100}
                          value={realityEffects[state.id][dimension] ?? 0}
                          aria-label={`${dimension} when ${state.label.toLowerCase()}`}
                          title={`${state.label}: ${REALITY_DIMENSION_HELP[dimension]} Positive increases it; negative decreases it.`}
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
