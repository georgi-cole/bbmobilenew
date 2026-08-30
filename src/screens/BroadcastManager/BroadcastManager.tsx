import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import {
  addCustomBroadcast,
  removeCustomBroadcast,
  removeTvEvent,
  reorderPhaseBroadcasts,
  resetBroadcastOverride,
  setBroadcastOverride,
  updateCustomBroadcast,
  updateTvEvent,
} from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type {
  BroadcastCampaign,
  BroadcastLevel,
  CustomBroadcastMessage,
  Phase,
  TvEvent,
} from '../../types'
import { isDebugAccessGranted } from '../../utils/debugMode'
import { normalizeGameCopy } from '../../utils/tvLogTemplates'
import ManagerPublishBar from '../../components/ManagerPublishBar/ManagerPublishBar'
import {
  ALL_BROADCAST_PHASES,
  BROADCAST_CAMPAIGNS,
  BROADCAST_CAMPAIGN_LABELS,
  getDefaultBroadcastOrder,
  getBroadcastTemplate,
  getBroadcastTemplatesForPhase,
  matchesBroadcastCampaign,
  type BroadcastTemplate,
} from '../../broadcasting/broadcastTemplateCatalog'
import './BroadcastManager.css'

const EVENT_TYPES: TvEvent['type'][] = ['game', 'social', 'vote', 'twist', 'diary']
const DELETED_SOURCE_MARKER = '__broadcast_manager_deleted__'
const SUPERSEDED_TEMPLATE_IDS = new Set(['season.welcome', 'season.welcome-cupid'])

const EDIT_BROADCAST_MESSAGE_LABEL = 'Edit broadcast message'
const CLOSE_EDITOR_LABEL = 'Close editor'
const ADD_PHASE_MESSAGE_LABEL = 'Add phase message'
const EDIT_BUILT_IN_SOURCE_LABEL = 'Edit built-in source'
const EDIT_MESSAGE_LABEL = 'Edit broadcast message'
const CARD_TITLE_LABEL = 'Card title'
const OPTIONAL_FAUX_TV_TITLE_LABEL = 'Faux-TV title (optional)'
const MESSAGE_KEY_PLACEHOLDER = 'social.alliance-warning'
const DEFAULT_CARD_TITLE_PLACEHOLDER = 'BIG EYE BROADCAST'

type EditorState = {
  mode: 'builtin' | 'custom' | 'new' | 'live'
  id: string | null
  phase: Phase
  text: string
  title: string
  type: TvEvent['type']
  level: BroadcastLevel
  major: string
  isCard: boolean
  forceOnTv: boolean
  key: string
  campaign: BroadcastCampaign | ''
}

type SourceSequenceItem = {
  id: string
  kind: 'source'
  order: number
  text: string
  title: string
  type: TvEvent['type']
  level: BroadcastLevel
  disabled: boolean
  template?: BroadcastTemplate
  event?: TvEvent
}

type CustomSequenceItem = {
  id: string
  kind: 'custom'
  order: number
  text: string
  title: string
  type: TvEvent['type']
  level: BroadcastLevel
  disabled: boolean
  message: CustomBroadcastMessage
}

type SequenceItem = SourceSequenceItem | CustomSequenceItem

function normalizeMessageKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (!normalized) return ''
  return normalized.includes('.') ? normalized : `custom.${normalized}`
}

function suggestMessageKey(text: string): string {
  return normalizeMessageKey(text.split(/\s+/).slice(0, 5).join('-'))
}

function phaseLabel(phase: Phase): string {
  return phase.replace(/_/g, ' ')
}

function eventPhase(event: TvEvent): Phase | null {
  const phase = event.meta?.phase
  return typeof phase === 'string' && ALL_BROADCAST_PHASES.includes(phase as Phase)
    ? (phase as Phase)
    : null
}

function eventMajor(event: TvEvent): string {
  const major = event.meta?.major ?? event.major
  return typeof major === 'string' ? major : ''
}

function eventLevel(event: TvEvent): BroadcastLevel {
  const level = event.meta?.broadcastLevel
  if (level === 'minor' || level === 'major' || level === 'critical') return level
  if (event.meta?.broadcastPriority === 'critical') return 'critical'
  return eventMajor(event) ? 'major' : 'minor'
}

function eventCampaign(event: TvEvent): BroadcastCampaign | null {
  const authoredCampaign = event.meta?.broadcastCampaign
  if (
    typeof authoredCampaign === 'string' &&
    BROADCAST_CAMPAIGNS.includes(authoredCampaign as BroadcastCampaign)
  ) {
    return authoredCampaign as BroadcastCampaign
  }
  const templateId = event.meta?.broadcastTemplateId
  if (typeof templateId === 'string') return getBroadcastTemplate(templateId)?.campaign ?? null
  return event.meta?.mode === 'survival' ? 'survival' : null
}

function isDeletedOverride(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const override = value as { disabled?: boolean; title?: string }
  return override.disabled === true && override.title === DELETED_SOURCE_MARKER
}

function eventIdentity(event: TvEvent): string {
  const templateId = event.meta?.broadcastTemplateId
  if (typeof templateId === 'string') return `template:${templateId}`
  const customId = event.meta?.customBroadcastId
  if (typeof customId === 'string') return `custom:${customId}`
  return `${event.type}:${normalizeGameCopy(event.text).trim().toLocaleLowerCase()}`
}

function dedupeEvents(events: TvEvent[]): TvEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const identity = eventIdentity(event)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

export default function BroadcastManager() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const hasAccess = isDebugAccessGranted(searchParams, window.location.hostname)
  const [selectedPhase, setSelectedPhase] = useState<Phase>(game.phase)
  const [selectedCampaign, setSelectedCampaign] = useState<BroadcastCampaign | 'all'>('all')
  const [editor, setEditor] = useState<EditorState | null>(null)

  const overrides = useMemo(() => game.broadcastOverrides ?? {}, [game.broadcastOverrides])
  const customMessages = useMemo(() => game.customBroadcasts ?? [], [game.customBroadcasts])

  const phaseEvents = useMemo(
    () =>
      game.tvFeed.filter(
        (event) =>
          eventPhase(event) === selectedPhase &&
          (selectedCampaign === 'all' ||
            !eventCampaign(event) ||
            eventCampaign(event) === selectedCampaign)
      ),
    [game.tvFeed, selectedCampaign, selectedPhase]
  )
  const liveMessages = useMemo(() => dedupeEvents(phaseEvents), [phaseEvents])

  const templates = useMemo(
    () =>
      getBroadcastTemplatesForPhase(selectedPhase).filter(
        (template) =>
          matchesBroadcastCampaign(template, selectedCampaign) &&
          !SUPERSEDED_TEMPLATE_IDS.has(template.id) &&
          !isDeletedOverride(overrides[template.id])
      ),
    [overrides, selectedCampaign, selectedPhase]
  )

  const phaseCustom = useMemo(
    () =>
      customMessages
        .filter((message) => message.phase === selectedPhase)
        .filter(
          (message) =>
            selectedCampaign === 'all' || !message.campaign || message.campaign === selectedCampaign
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [customMessages, selectedCampaign, selectedPhase]
  )

  const observedSources = useMemo(() => {
    const byId = new Map<string, TvEvent>()
    for (const event of phaseEvents) {
      const id = event.meta?.broadcastTemplateId
      if (
        typeof id === 'string' &&
        !getBroadcastTemplate(id) &&
        typeof event.meta?.customBroadcastId !== 'string' &&
        !isDeletedOverride(overrides[id]) &&
        !byId.has(id)
      ) {
        byId.set(id, event)
      }
    }
    return [...byId.values()]
  }, [overrides, phaseEvents])

  const sequenceItems = useMemo<SequenceItem[]>(() => {
    const sourceItems: SourceSequenceItem[] = templates.map((template) => {
      const override = overrides[template.id]
      return {
        id: template.id,
        kind: 'source',
        order: override?.order ?? getDefaultBroadcastOrder(template),
        text: normalizeGameCopy(override?.text ?? template.text),
        title: normalizeGameCopy(override?.title ?? template.title ?? ''),
        type: override?.type ?? template.type,
        level: override?.level ?? template.level,
        disabled: override?.disabled === true,
        template,
      }
    })
    const knownIds = new Set(sourceItems.map((item) => item.id))
    const observedItems: SourceSequenceItem[] = observedSources.flatMap((event) => {
      const id =
        typeof event.meta?.broadcastTemplateId === 'string' ? event.meta.broadcastTemplateId : null
      if (!id || knownIds.has(id)) return []
      const override = overrides[id]
      const sourceText =
        typeof event.meta?.broadcastSourceText === 'string'
          ? event.meta.broadcastSourceText
          : event.text
      return [
        {
          id,
          kind: 'source',
          order:
            override?.order ??
            (typeof event.meta?.broadcastOrder === 'number' ? event.meta.broadcastOrder : 10000),
          text: normalizeGameCopy(override?.text ?? sourceText),
          title: normalizeGameCopy(override?.title ?? ''),
          type: override?.type ?? event.type,
          level: override?.level ?? eventLevel(event),
          disabled: override?.disabled === true,
          event,
        },
      ]
    })
    const customItems: CustomSequenceItem[] = phaseCustom.map((message, index) => ({
      id: message.id,
      kind: 'custom',
      order: message.order ?? (sourceItems.length + index + 1) * 100,
      text: normalizeGameCopy(message.text),
      title: normalizeGameCopy(message.title ?? ''),
      type: message.type,
      level: message.level,
      disabled: !message.enabled,
      message,
    }))
    return [...sourceItems, ...observedItems, ...customItems].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id)
    )
  }, [observedSources, overrides, phaseCustom, templates])

  const deletedSources = useMemo(() => {
    const ids = Object.entries(overrides)
      .filter(([, override]) => isDeletedOverride(override))
      .map(([id]) => id)
    return ids.flatMap((id) => {
      const template = getBroadcastTemplate(id)
      if (template && template.phase !== selectedPhase) return []
      const event = phaseEvents.find((candidate) => candidate.meta?.broadcastTemplateId === id)
      if (!template && !event) return []
      return [
        {
          id,
          text: normalizeGameCopy(template?.text ?? event?.text ?? id),
        },
      ]
    })
  }, [overrides, phaseEvents, selectedPhase])

  const visiblePhases = useMemo(
    () =>
      ALL_BROADCAST_PHASES.filter((phase) => {
        const catalogHas = getBroadcastTemplatesForPhase(phase).some(
          (template) =>
            matchesBroadcastCampaign(template, selectedCampaign) &&
            !SUPERSEDED_TEMPLATE_IDS.has(template.id) &&
            !isDeletedOverride(overrides[template.id])
        )
        const customHas = customMessages.some(
          (message) =>
            message.phase === phase &&
            (selectedCampaign === 'all' ||
              !message.campaign ||
              message.campaign === selectedCampaign)
        )
        const liveHas = game.tvFeed.some(
          (event) =>
            eventPhase(event) === phase &&
            (selectedCampaign === 'all' ||
              !eventCampaign(event) ||
              eventCampaign(event) === selectedCampaign)
        )
        return catalogHas || customHas || liveHas
      }),
    [customMessages, game.tvFeed, overrides, selectedCampaign]
  )

  const unassignedMessages = useMemo(
    () => dedupeEvents(game.tvFeed.filter((event) => eventPhase(event) === null)),
    [game.tvFeed]
  )

  if (!hasAccess) return <Navigate to="/" replace />

  function editTemplate(template: BroadcastTemplate) {
    const override = overrides[template.id]
    setEditor({
      mode: 'builtin',
      id: template.id,
      phase: template.phase,
      text: normalizeGameCopy(override?.text ?? template.text),
      title: normalizeGameCopy(override?.title ?? template.title ?? ''),
      type: override?.type ?? template.type,
      level: override?.level ?? template.level,
      major: override?.major === null ? '' : (override?.major ?? template.major ?? ''),
      isCard: template.kind === 'phase_card',
      forceOnTv: override?.forceOnTv ?? template.forceOnTv ?? template.kind === 'phase_card',
      key: template.id,
      campaign: template.campaign ?? '',
    })
  }

  function editObservedSource(event: TvEvent) {
    const id = String(event.meta?.broadcastTemplateId ?? '')
    const override = overrides[id]
    const sourceText =
      typeof event.meta?.broadcastSourceText === 'string'
        ? event.meta.broadcastSourceText
        : event.text
    setEditor({
      mode: 'builtin',
      id,
      phase: eventPhase(event) ?? selectedPhase,
      text: normalizeGameCopy(override?.text ?? sourceText),
      title: normalizeGameCopy(override?.title ?? ''),
      type: override?.type ?? event.type,
      level: override?.level ?? eventLevel(event),
      major: override?.major === null ? '' : (override?.major ?? eventMajor(event)),
      isCard: false,
      forceOnTv: override?.forceOnTv === true || event.meta?.forceOnTv === true,
      key: id,
      campaign: getBroadcastTemplate(id)?.campaign ?? '',
    })
  }

  function editCustom(message: CustomBroadcastMessage) {
    setEditor({
      mode: 'custom',
      id: message.id,
      phase: message.phase,
      text: normalizeGameCopy(message.text),
      title: normalizeGameCopy(message.title ?? ''),
      type: message.type,
      level: message.level,
      major: message.major ?? '',
      isCard: false,
      forceOnTv: message.forceOnTv !== false,
      key: message.key ?? suggestMessageKey(message.text),
      campaign: message.campaign ?? '',
    })
  }

  function editLive(event: TvEvent) {
    setEditor({
      mode: 'live',
      id: event.id,
      phase: eventPhase(event) ?? selectedPhase,
      text: normalizeGameCopy(event.text),
      title: normalizeGameCopy(
        typeof event.meta?.announcementTitle === 'string' ? event.meta.announcementTitle : ''
      ),
      type: event.type,
      level: eventLevel(event),
      major: eventMajor(event),
      isCard: false,
      forceOnTv: event.meta?.forceOnTv === true,
      key:
        typeof event.meta?.broadcastTemplateId === 'string' ? event.meta.broadcastTemplateId : '',
      campaign: eventCampaign(event) ?? '',
    })
  }

  function addMessage() {
    setEditor({
      mode: 'new',
      id: null,
      phase: selectedPhase,
      text: '',
      title: '',
      type: 'game',
      level: 'minor',
      major: '',
      isCard: false,
      forceOnTv: true,
      key: '',
      campaign: selectedCampaign === 'all' ? '' : selectedCampaign,
    })
  }

  function editSequenceItem(item: SequenceItem) {
    if (item.kind === 'custom') editCustom(item.message)
    else if (item.template) editTemplate(item.template)
    else if (item.event) editObservedSource(item.event)
  }

  function moveSequenceItem(id: string, direction: -1 | 1) {
    const currentIndex = sequenceItems.findIndex((item) => item.id === id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sequenceItems.length) return
    const reordered = [...sequenceItems]
    ;[reordered[currentIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[currentIndex],
    ]
    dispatch(
      reorderPhaseBroadcasts({
        phase: selectedPhase,
        items: reordered.map((item) => ({ id: item.id, kind: item.kind })),
      })
    )
  }

  function deleteSource(id: string) {
    if (
      !window.confirm(
        'Delete this broadcast source? It will stop appearing in the game and can be restored from Deleted sources.'
      )
    )
      return
    dispatch(
      setBroadcastOverride({
        id,
        changes: { disabled: true, title: DELETED_SOURCE_MARKER },
      })
    )
  }

  function saveEditor() {
    if (!editor || !editor.text.trim()) return
    const customKey = normalizeMessageKey(editor.key)
    if ((editor.mode === 'new' || editor.mode === 'custom') && !customKey) return
    const duplicateKey = customMessages.some(
      (message) => message.id !== editor.id && (message.key ?? '') === customKey
    )
    if (duplicateKey) return
    const major = editor.level === 'minor' ? undefined : editor.major.trim() || undefined

    if (editor.mode === 'builtin' && editor.id) {
      dispatch(
        setBroadcastOverride({
          id: editor.id,
          changes: {
            text: editor.text.trim(),
            title:
              editor.isCard || editor.forceOnTv || editor.level !== 'minor'
                ? editor.title.trim()
                : undefined,
            type: editor.type,
            level: editor.level,
            major: major ?? null,
            forceOnTv: editor.forceOnTv,
            disabled: false,
          },
        })
      )
    } else if (editor.mode === 'custom' && editor.id) {
      const previous = customMessages.find((message) => message.id === editor.id)
      dispatch(
        updateCustomBroadcast({
          id: editor.id,
          key: customKey,
          phase: editor.phase,
          text: editor.text.trim(),
          title: editor.title.trim() || undefined,
          type: editor.type,
          level: editor.level,
          major,
          enabled: previous?.enabled ?? true,
          forceOnTv: editor.forceOnTv,
          order: previous?.order ?? 0,
          campaign: editor.campaign || undefined,
        })
      )
    } else if (editor.mode === 'new') {
      dispatch(
        addCustomBroadcast({
          key: customKey,
          phase: editor.phase,
          text: editor.text.trim(),
          title: editor.title.trim() || undefined,
          type: editor.type,
          level: editor.level,
          major,
          enabled: true,
          forceOnTv: editor.forceOnTv,
          order: Math.max(0, ...sequenceItems.map((item) => item.order)) + 100,
          campaign: editor.campaign || undefined,
        })
      )
    } else if (editor.mode === 'live' && editor.id) {
      dispatch(
        updateTvEvent({
          id: editor.id,
          text: editor.text.trim(),
          type: editor.type,
          phase: editor.phase,
          major: major ?? null,
          broadcastPriority: editor.level === 'critical' ? 'critical' : null,
          forceOnTv: editor.forceOnTv,
          announcementTitle: editor.title.trim() || undefined,
        })
      )
    }
    setEditor(null)
  }

  return (
    <main className="broadcast-manager">
      <header className="broadcast-manager__header">
        <div>
          <p className="broadcast-manager__eyebrow">QA tools · Day {game.week}</p>
          <h1>Broadcast Manager</h1>
          <p>
            Current source registry and runtime-discovered broadcasts. Repeated emitted rows are
            collapsed automatically.
          </p>
        </div>
        <button
          type="button"
          className="broadcast-manager__back"
          onClick={() => navigate('/game?debug=1')}
        >
          Back to game
        </button>
      </header>

      <ManagerPublishBar
        managerName="Broadcast Manager"
        exportFileName="broadcast-manager-remote-config.json"
        getPatch={() => ({
          broadcastManager: {
            enabled: true,
            overrides: game.broadcastOverrides ?? {},
            customMessages: game.customBroadcasts ?? [],
          },
        })}
      />

      <p className="broadcast-manager__count-help">
        Latest terminology is normalized here, superseded season-welcome sources are hidden, and
        Delete permanently suppresses a source until you restore it.
      </p>

      <label className="broadcast-manager__campaign-filter">
        Campaign filter
        <select
          value={selectedCampaign}
          onChange={(event) => {
            const campaign = event.target.value as BroadcastCampaign | 'all'
            setSelectedCampaign(campaign)
            const nextPhase = ALL_BROADCAST_PHASES.find((phase) =>
              getBroadcastTemplatesForPhase(phase).some((template) =>
                matchesBroadcastCampaign(template, campaign)
              )
            )
            if (nextPhase) setSelectedPhase(nextPhase)
          }}
        >
          <option value="all">All campaigns</option>
          {BROADCAST_CAMPAIGNS.map((campaign) => (
            <option key={campaign} value={campaign}>
              {BROADCAST_CAMPAIGN_LABELS[campaign]}
            </option>
          ))}
        </select>
      </label>

      <div className="broadcast-manager__layout">
        <nav className="broadcast-manager__phases" aria-label="Broadcast phases">
          {visiblePhases.map((phase) => {
            const sourceCount = getBroadcastTemplatesForPhase(phase).filter(
              (template) =>
                matchesBroadcastCampaign(template, selectedCampaign) &&
                !SUPERSEDED_TEMPLATE_IDS.has(template.id) &&
                !isDeletedOverride(overrides[template.id])
            ).length
            const customCount = customMessages.filter(
              (message) =>
                message.phase === phase &&
                (selectedCampaign === 'all' ||
                  !message.campaign ||
                  message.campaign === selectedCampaign)
            ).length
            return (
              <button
                key={phase}
                type="button"
                className={phase === selectedPhase ? 'is-selected' : ''}
                onClick={() => setSelectedPhase(phase)}
              >
                <span>{phaseLabel(phase)}</span>
                <small>{sourceCount + customCount}</small>
              </button>
            )
          })}
        </nav>

        <section
          className="broadcast-manager__messages"
          aria-labelledby="broadcast-manager-phase-title"
        >
          <div className="broadcast-manager__section-heading">
            <div>
              <p className="broadcast-manager__eyebrow">
                {selectedPhase === game.phase ? 'Current phase' : 'Phase registry'}
              </p>
              <h2 id="broadcast-manager-phase-title">{phaseLabel(selectedPhase)}</h2>
            </div>
            <button type="button" className="broadcast-manager__primary" onClick={addMessage}>
              Add phase message
            </button>
          </div>

          <section
            className="broadcast-manager__sequence"
            aria-label="Active phase broadcast sequence"
          >
            <div>
              <h3>Active source sequence</h3>
              <p>
                One authoritative list - built-in, runtime-discovered and custom messages are no
                longer repeated in separate source sections.
              </p>
            </div>

            {sequenceItems.length === 0 ? (
              <p className="broadcast-manager__empty">
                No active broadcast sources for this phase.
              </p>
            ) : (
              <ol className="broadcast-manager__message-list">
                {sequenceItems.map((item, index) => (
                  <li
                    key={`${item.kind}:${item.id}`}
                    className={`broadcast-manager__message-card${item.disabled ? ' is-disabled' : ''}`}
                  >
                    <div className="broadcast-manager__message-meta">
                      <span className="broadcast-manager__sequence-position">{index + 1}</span>
                      <span
                        className={`broadcast-manager__badge broadcast-manager__badge--${item.level}`}
                      >
                        {item.level}
                      </span>
                      <span>
                        {item.kind === 'custom'
                          ? 'custom'
                          : item.template?.kind === 'phase_card'
                            ? 'phase card'
                            : item.type}
                      </span>
                      <code>
                        {item.kind === 'custom' ? (item.message.key ?? item.id) : item.id}
                      </code>
                      {item.disabled && (
                        <span className="broadcast-manager__disabled">disabled</span>
                      )}
                    </div>
                    {item.title && <h4>{item.title}</h4>}
                    <p>{item.text}</p>
                    <div className="broadcast-manager__message-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveSequenceItem(item.id, -1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={index === sequenceItems.length - 1}
                        onClick={() => moveSequenceItem(item.id, 1)}
                      >
                        Move down
                      </button>
                      <button type="button" onClick={() => editSequenceItem(item)}>
                        Edit
                      </button>
                      {item.kind === 'custom' ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(
                                updateCustomBroadcast({
                                  ...item.message,
                                  enabled: !item.message.enabled,
                                })
                              )
                            }
                          >
                            {item.message.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="broadcast-manager__danger"
                            onClick={() =>
                              window.confirm('Delete this custom phase message?') &&
                              dispatch(removeCustomBroadcast(item.message.id))
                            }
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(
                                setBroadcastOverride({
                                  id: item.id,
                                  changes: { disabled: !item.disabled },
                                })
                              )
                            }
                          >
                            {item.disabled ? 'Enable' : 'Disable'}
                          </button>
                          <button
                            type="button"
                            className="broadcast-manager__danger"
                            onClick={() => deleteSource(item.id)}
                          >
                            Delete
                          </button>
                          {overrides[item.id] && (
                            <button
                              type="button"
                              onClick={() => dispatch(resetBroadcastOverride(item.id))}
                            >
                              Restore default
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {deletedSources.length > 0 && (
            <details className="broadcast-manager__history">
              <summary>Deleted sources ({deletedSources.length})</summary>
              <p>
                Deleted built-in/runtime sources remain suppressed in exported configuration.
                Restore only if you want them active again.
              </p>
              <ol className="broadcast-manager__message-list">
                {deletedSources.map((source) => (
                  <li key={source.id} className="broadcast-manager__message-card is-disabled">
                    <div className="broadcast-manager__message-meta">
                      <code>{source.id}</code>
                      <span className="broadcast-manager__disabled">deleted</span>
                    </div>
                    <p>{source.text}</p>
                    <div className="broadcast-manager__message-actions">
                      <button
                        type="button"
                        onClick={() => dispatch(resetBroadcastOverride(source.id))}
                      >
                        Restore source
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}

          <details className="broadcast-manager__history">
            <summary>Unique emitted history ({liveMessages.length})</summary>
            <p>
              Repeated emissions of the same source are collapsed here so the manager stays useful
              as an authoring tool.
            </p>
            <ol className="broadcast-manager__message-list">
              {liveMessages.map((event) => (
                <li key={event.id} className="broadcast-manager__message-card">
                  <div className="broadcast-manager__message-meta">
                    <span>{event.type}</span>
                    {typeof event.meta?.broadcastTemplateId === 'string' && (
                      <code>{event.meta.broadcastTemplateId}</code>
                    )}
                  </div>
                  <p>{normalizeGameCopy(event.text)}</p>
                  <div className="broadcast-manager__message-actions">
                    <button type="button" onClick={() => editLive(event)}>
                      Edit emitted row
                    </button>
                    <button
                      type="button"
                      className="broadcast-manager__danger"
                      onClick={() =>
                        window.confirm('Remove this emitted row from the current run?') &&
                        dispatch(removeTvEvent(event.id))
                      }
                    >
                      Remove row
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </details>

          {unassignedMessages.length > 0 && (
            <details className="broadcast-manager__unassigned">
              <summary>
                {unassignedMessages.length} unique legacy row
                {unassignedMessages.length === 1 ? '' : 's'} without a phase
              </summary>
              {unassignedMessages.map((event) => (
                <button key={event.id} type="button" onClick={() => editLive(event)}>
                  {normalizeGameCopy(event.text)}
                </button>
              ))}
            </details>
          )}
        </section>
      </div>

      {editor && (
        <div className="broadcast-manager__editor-backdrop" role="presentation">
          <section
            className="broadcast-manager__editor"
            role="dialog"
            aria-modal="true"
            aria-label={EDIT_BROADCAST_MESSAGE_LABEL}
          >
            <header>
              <h2>
                {editor.mode === 'new'
                  ? ADD_PHASE_MESSAGE_LABEL
                  : editor.mode === 'builtin'
                    ? EDIT_BUILT_IN_SOURCE_LABEL
                    : EDIT_MESSAGE_LABEL}
              </h2>
              <button type="button" aria-label={CLOSE_EDITOR_LABEL} onClick={() => setEditor(null)}>
                ×
              </button>
            </header>

            <label>
              Ceremony phase
              <select
                disabled={editor.mode === 'builtin'}
                value={editor.phase}
                onChange={(event) => setEditor({ ...editor, phase: event.target.value as Phase })}
              >
                {ALL_BROADCAST_PHASES.map((phase) => (
                  <option key={phase} value={phase}>
                    {phaseLabel(phase)}
                  </option>
                ))}
              </select>
            </label>

            {(editor.mode === 'new' || editor.mode === 'custom') && (
              <>
                <label>
                  Campaign
                  <select
                    value={editor.campaign}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        campaign: event.target.value as BroadcastCampaign | '',
                      })
                    }
                  >
                    <option value="">All campaigns</option>
                    {BROADCAST_CAMPAIGNS.map((campaign) => (
                      <option key={campaign} value={campaign}>
                        {BROADCAST_CAMPAIGN_LABELS[campaign]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Message key / name
                  <input
                    value={editor.key}
                    placeholder={MESSAGE_KEY_PLACEHOLDER}
                    onChange={(event) => setEditor({ ...editor, key: event.target.value })}
                  />
                  {!normalizeMessageKey(editor.key) && (
                    <small className="broadcast-manager__field-error">
                      A message key is required.
                    </small>
                  )}
                  {customMessages.some(
                    (message) =>
                      message.id !== editor.id &&
                      (message.key ?? '') === normalizeMessageKey(editor.key)
                  ) && (
                    <small className="broadcast-manager__field-error">
                      That key is already in use.
                    </small>
                  )}
                </label>
              </>
            )}

            {(editor.isCard || editor.forceOnTv || editor.level !== 'minor') && (
              <label>
                {editor.isCard || editor.level !== 'minor'
                  ? CARD_TITLE_LABEL
                  : OPTIONAL_FAUX_TV_TITLE_LABEL}
                <input
                  value={editor.title}
                  placeholder={DEFAULT_CARD_TITLE_PLACEHOLDER}
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                />
              </label>
            )}

            <label>
              {editor.isCard ? 'Card subtitle' : 'Message'}
              <textarea
                value={editor.text}
                rows={5}
                onChange={(event) => setEditor({ ...editor, text: event.target.value })}
              />
              <small>
                Keep placeholders such as {'{winner}'} if the live player value should remain
                dynamic.
              </small>
            </label>

            <div className="broadcast-manager__editor-grid">
              <label>
                Event type
                <select
                  value={editor.type}
                  onChange={(event) =>
                    setEditor({ ...editor, type: event.target.value as TvEvent['type'] })
                  }
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Broadcast level
                <select
                  value={editor.level}
                  onChange={(event) => {
                    const level = event.target.value as BroadcastLevel
                    setEditor({
                      ...editor,
                      level,
                      forceOnTv: level === 'critical' ? true : editor.forceOnTv,
                    })
                  }}
                >
                  <option value="minor">Minor · normal log line</option>
                  <option value="major">Major · faux-TV card</option>
                  <option value="critical">Critical · fullscreen shock + card</option>
                </select>
              </label>
            </div>

            <label className="broadcast-manager__check">
              <input
                type="checkbox"
                checked={editor.forceOnTv}
                onChange={(event) => setEditor({ ...editor, forceOnTv: event.target.checked })}
              />
              <span>Force this message onto the faux TV</span>
            </label>

            <footer>
              <button type="button" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="broadcast-manager__primary"
                disabled={
                  !editor.text.trim() ||
                  ((editor.mode === 'new' || editor.mode === 'custom') &&
                    (!normalizeMessageKey(editor.key) ||
                      customMessages.some(
                        (message) =>
                          message.id !== editor.id &&
                          (message.key ?? '') === normalizeMessageKey(editor.key)
                      )))
                }
                onClick={saveEditor}
              >
                Save
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
