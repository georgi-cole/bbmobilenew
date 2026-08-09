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
import type { BroadcastLevel, CustomBroadcastMessage, Phase, TvEvent } from '../../types'
import { isDebugAccessGranted } from '../../utils/debugMode'
import {
  ALL_BROADCAST_PHASES,
  getDefaultBroadcastOrder,
  getBroadcastTemplate,
  getBroadcastTemplatesForPhase,
  type BroadcastTemplate,
} from '../../broadcasting/broadcastTemplateCatalog'
import './BroadcastManager.css'

const EVENT_TYPES: TvEvent['type'][] = ['game', 'social', 'vote', 'twist', 'diary']
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const FULL_PHASE_SEQUENCE_LABEL = 'Full phase broadcast sequence'
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const BUILT_IN_FLOW_LABEL = 'Built-in flow messages'
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const OBSERVED_PLAY_SOURCES_LABEL = 'Observed Play sources'
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const CUSTOM_PHASE_MESSAGES_LABEL = 'Custom phase messages'
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const EDIT_BROADCAST_MESSAGE_LABEL = 'Edit broadcast message'
// i18n-ignore: Debug-only accessibility label intentionally uses canonical English
const CLOSE_EDITOR_LABEL = 'Close editor'
// i18n-ignore: Debug-only editor heading intentionally uses canonical English
const ADD_PHASE_MESSAGE_LABEL = 'Add phase message'
// i18n-ignore: Debug-only editor heading intentionally uses canonical English
const EDIT_BUILT_IN_SOURCE_LABEL = 'Edit built-in source'
// i18n-ignore: Debug-only editor heading intentionally uses canonical English
const EDIT_MESSAGE_LABEL = 'Edit broadcast message'
// i18n-ignore: Debug-only form label intentionally uses canonical English
const CARD_TITLE_LABEL = 'Card title'
// i18n-ignore: Debug-only form label intentionally uses canonical English
const OPTIONAL_FAUX_TV_TITLE_LABEL = 'Faux-TV title (optional)'
// i18n-ignore: Debug-only authoring placeholder intentionally uses canonical key syntax
const MESSAGE_KEY_PLACEHOLDER = 'social.alliance-warning'
// i18n-ignore: Canonical in-world broadcast branding
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
}

function normalizeMessageKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (!normalized) return ''
  // i18n-ignore: Internal message key prefix, never rendered as player-facing copy
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

export default function BroadcastManager() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const hasAccess = isDebugAccessGranted(searchParams, window.location.hostname)
  const [selectedPhase, setSelectedPhase] = useState<Phase>(game.phase)
  const [editor, setEditor] = useState<EditorState | null>(null)

  const overrides = useMemo(() => game.broadcastOverrides ?? {}, [game.broadcastOverrides])
  const customMessages = useMemo(() => game.customBroadcasts ?? [], [game.customBroadcasts])
  const templates = useMemo(() => getBroadcastTemplatesForPhase(selectedPhase), [selectedPhase])
  const phaseCustom = useMemo(
    () =>
      customMessages
        .filter((message) => message.phase === selectedPhase)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [customMessages, selectedPhase]
  )
  const liveMessages = useMemo(
    () => game.tvFeed.filter((event) => eventPhase(event) === selectedPhase),
    [game.tvFeed, selectedPhase]
  )
  const observedSources = useMemo(() => {
    const byId = new Map<string, TvEvent>()
    for (const event of liveMessages) {
      const id = event.meta?.broadcastTemplateId
      if (
        typeof id === 'string' &&
        !getBroadcastTemplate(id) &&
        typeof event.meta?.customBroadcastId !== 'string' &&
        !byId.has(id)
      )
        byId.set(id, event)
    }
    return [...byId.values()]
  }, [liveMessages])
  const sequenceItems = useMemo(() => {
    const sourceItems = templates.map((template) => ({
      id: template.id,
      kind: 'source' as const,
      order: overrides[template.id]?.order ?? getDefaultBroadcastOrder(template),
      label:
        overrides[template.id]?.title ??
        template.title ??
        overrides[template.id]?.text ??
        template.text,
      template,
    }))
    const knownIds = new Set(sourceItems.map((item) => item.id))
    const observedItems = observedSources.flatMap((event) => {
      const id =
        typeof event.meta?.broadcastTemplateId === 'string' ? event.meta.broadcastTemplateId : null
      if (!id || knownIds.has(id)) return []
      return [
        {
          id,
          kind: 'source' as const,
          order:
            overrides[id]?.order ??
            (typeof event.meta?.broadcastOrder === 'number' ? event.meta.broadcastOrder : 10000),
          label:
            overrides[id]?.text ??
            (typeof event.meta?.broadcastSourceText === 'string'
              ? event.meta.broadcastSourceText
              : event.text),
          event,
        },
      ]
    })
    const customItems = phaseCustom.map((message, index) => ({
      id: message.id,
      kind: 'custom' as const,
      order: message.order ?? (templates.length + index + 1) * 100,
      label: message.text,
      message,
    }))
    return [...sourceItems, ...observedItems, ...customItems].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id)
    )
  }, [observedSources, overrides, phaseCustom, templates])
  const unassignedMessages = useMemo(
    () => game.tvFeed.filter((event) => eventPhase(event) === null),
    [game.tvFeed]
  )

  if (!hasAccess) return <Navigate to="/" replace />

  function effectiveTemplate(template: BroadcastTemplate) {
    const override = overrides[template.id]
    return {
      text: override?.text ?? template.text,
      title: override?.title ?? template.title ?? '',
      type: override?.type ?? template.type,
      level: override?.level ?? template.level,
      major: override?.major === null ? '' : (override?.major ?? template.major ?? ''),
      disabled: override?.disabled === true,
      edited: override != null,
      forceOnTv: override?.forceOnTv ?? template.forceOnTv ?? template.kind === 'phase_card',
    }
  }

  function editTemplate(template: BroadcastTemplate) {
    const value = effectiveTemplate(template)
    setEditor({
      mode: 'builtin',
      id: template.id,
      phase: template.phase,
      text: value.text,
      title: value.title,
      type: value.type,
      level: value.level,
      major: value.major,
      isCard: template.kind === 'phase_card',
      forceOnTv: value.forceOnTv,
      key: template.id,
    })
  }

  function editCustom(message: CustomBroadcastMessage) {
    setEditor({
      mode: 'custom',
      id: message.id,
      phase: message.phase,
      text: message.text,
      title: message.title ?? '',
      type: message.type,
      level: message.level,
      major: message.major ?? '',
      isCard: false,
      forceOnTv: message.forceOnTv !== false,
      key: message.key ?? suggestMessageKey(message.text),
    })
  }

  function editLive(event: TvEvent) {
    setEditor({
      mode: 'live',
      id: event.id,
      phase: eventPhase(event) ?? selectedPhase,
      text: event.text,
      title: typeof event.meta?.announcementTitle === 'string' ? event.meta.announcementTitle : '',
      type: event.type,
      level: eventLevel(event),
      major: eventMajor(event),
      isCard: false,
      forceOnTv: event.meta?.forceOnTv === true,
      key:
        typeof event.meta?.broadcastTemplateId === 'string' ? event.meta.broadcastTemplateId : '',
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
      text: override?.text ?? sourceText,
      title: override?.title ?? '',
      type: override?.type ?? event.type,
      level: override?.level ?? eventLevel(event),
      major: override?.major === null ? '' : (override?.major ?? eventMajor(event)),
      isCard: false,
      forceOnTv: override?.forceOnTv === true || event.meta?.forceOnTv === true,
      key: id,
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
    })
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

  function editSequenceItem(item: (typeof sequenceItems)[number]) {
    if ('message' in item && item.message) editCustom(item.message)
    else if ('template' in item && item.template) editTemplate(item.template)
    else if ('event' in item && item.event) editObservedSource(item.event)
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
            forceOnTv: editor.forceOnTv || editor.level === 'critical',
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
          forceOnTv: editor.forceOnTv || editor.level === 'critical',
          order: previous?.order ?? 0,
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
          forceOnTv: editor.forceOnTv || editor.level === 'critical',
          order: Math.max(0, ...sequenceItems.map((item) => item.order)) + 100,
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
          forceOnTv: editor.forceOnTv || editor.level === 'critical',
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
          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
          <p className="broadcast-manager__eyebrow">QA tools · Day {game.week}</p>
          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
          <h1>Broadcast Manager</h1>
          <p>
            {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
            Permanent broadcast authoring. Changes survive navigation, reloads, and new campaigns.
          </p>
        </div>
        <button
          type="button"
          className="broadcast-manager__back"
          onClick={() => navigate('/game?debug=1')}
        >
          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
          Back to game
        </button>
      </header>

      <div className="broadcast-manager__layout">
        {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
        <nav className="broadcast-manager__phases" aria-label="Broadcast phases">
          {ALL_BROADCAST_PHASES.map((phase) => {
            const builtInCount = getBroadcastTemplatesForPhase(phase).length
            const customCount = customMessages.filter((message) => message.phase === phase).length
            const liveCount = game.tvFeed.filter((event) => eventPhase(event) === phase).length
            return (
              <button
                key={phase}
                type="button"
                className={phase === selectedPhase ? 'is-selected' : ''}
                onClick={() => setSelectedPhase(phase)}
              >
                <span>{phaseLabel(phase)}</span>
                <small>
                  {builtInCount} + {customCount} / {liveCount}
                </small>
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
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                {selectedPhase === game.phase ? 'Current phase' : 'Phase registry'}
              </p>
              <h2 id="broadcast-manager-phase-title">{phaseLabel(selectedPhase)}</h2>
            </div>
            <button type="button" className="broadcast-manager__primary" onClick={addMessage}>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              Add phase message
            </button>
          </div>
          <p className="broadcast-manager__count-help">
            {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
            Counts are built-in + custom / already emitted.
          </p>

          <section className="broadcast-manager__sequence" aria-label={FULL_PHASE_SEQUENCE_LABEL}>
            <div>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              <h3>Full phase sequence</h3>
              <p>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                Every built-in, observed, and custom item shares this order. Position 1 is processed
                first.
              </p>
            </div>
            <ol className="broadcast-manager__sequence-list">
              {sequenceItems.map((item, index) => (
                <li key={`${item.kind}:${item.id}`}>
                  <span className="broadcast-manager__sequence-position">{index + 1}</span>
                  <span className="broadcast-manager__sequence-kind">
                    {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                    {item.kind === 'custom' ? 'custom' : 'built-in'}
                  </span>
                  <span className="broadcast-manager__sequence-copy">{item.label}</span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveSequenceItem(item.id, -1)}
                  >
                    {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={index === sequenceItems.length - 1}
                    onClick={() => moveSequenceItem(item.id, 1)}
                  >
                    {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                    Move down
                  </button>
                  <button type="button" onClick={() => editSequenceItem(item)}>
                    {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                    Edit
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="broadcast-manager__template-section" aria-label={BUILT_IN_FLOW_LABEL}>
            <div>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              <h3>Built-in Play flow</h3>
              <p>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                These are registry entries used by the game. Disable removes the message, not the
                ceremony or phase.
              </p>
            </div>
            {templates.length === 0 ? (
              <p className="broadcast-manager__empty">
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                This interactive phase has no separate broadcast line.
              </p>
            ) : (
              <ol className="broadcast-manager__message-list">
                {templates.map((template) => {
                  const value = effectiveTemplate(template)
                  return (
                    <li
                      key={template.id}
                      className={`broadcast-manager__message-card broadcast-manager__message-card--template${value.disabled ? ' is-disabled' : ''}`}
                    >
                      <div className="broadcast-manager__message-meta">
                        <span
                          className={`broadcast-manager__badge broadcast-manager__badge--${value.level}`}
                        >
                          {value.level}
                        </span>
                        {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                        <span>{template.kind === 'phase_card' ? 'phase card' : value.type}</span>
                        <code>{template.id}</code>
                        {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                        {value.edited && <span className="broadcast-manager__edited">edited</span>}
                        {value.disabled && (
                          <span className="broadcast-manager__disabled">
                            {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                            disabled
                          </span>
                        )}
                        {template.note && (
                          <span className="broadcast-manager__template-note">{template.note}</span>
                        )}
                      </div>
                      {value.title && <h4>{value.title}</h4>}
                      <p>{value.text}</p>
                      <div className="broadcast-manager__message-actions">
                        <button type="button" onClick={() => editTemplate(template)}>
                          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                          Edit source
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch(
                              setBroadcastOverride({
                                id: template.id,
                                changes: { disabled: !value.disabled },
                              })
                            )
                          }
                        >
                          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                          {value.disabled ? 'Enable' : 'Disable'}
                        </button>
                        {value.edited && (
                          <button
                            type="button"
                            onClick={() => dispatch(resetBroadcastOverride(template.id))}
                          >
                            {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                            Restore default
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {observedSources.length > 0 && (
            <section
              className="broadcast-manager__live-section"
              aria-label={OBSERVED_PLAY_SOURCES_LABEL}
            >
              <div>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                <h3>Observed Play sources</h3>
                <p>
                  {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                  Branch messages discovered in this run. Editing one changes the same source on
                  future Play presses.
                </p>
              </div>
              <ol className="broadcast-manager__message-list">
                {observedSources.map((event) => {
                  const id = String(event.meta?.broadcastTemplateId)
                  const override = overrides[id]
                  const sourceText =
                    typeof event.meta?.broadcastSourceText === 'string'
                      ? event.meta.broadcastSourceText
                      : event.text
                  return (
                    <li
                      key={id}
                      className={`broadcast-manager__message-card broadcast-manager__message-card--template${override?.disabled ? ' is-disabled' : ''}`}
                    >
                      <div className="broadcast-manager__message-meta">
                        <span
                          className={`broadcast-manager__badge broadcast-manager__badge--${override?.level ?? eventLevel(event)}`}
                        >
                          {override?.level ?? eventLevel(event)}
                        </span>
                        <span>{override?.type ?? event.type}</span>
                        <code>{id}</code>
                        {override && (
                          <span className="broadcast-manager__edited">
                            {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                            edited
                          </span>
                        )}
                      </div>
                      <p>{override?.text ?? sourceText}</p>
                      <div className="broadcast-manager__message-actions">
                        <button type="button" onClick={() => editObservedSource(event)}>
                          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                          Edit source
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch(
                              setBroadcastOverride({
                                id,
                                changes: { disabled: !override?.disabled },
                              })
                            )
                          }
                        >
                          {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                          {override?.disabled ? 'Enable' : 'Disable'}
                        </button>
                        {override && (
                          <button
                            type="button"
                            onClick={() => dispatch(resetBroadcastOverride(id))}
                          >
                            {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                            Restore default
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          <section
            className="broadcast-manager__live-section"
            aria-label={CUSTOM_PHASE_MESSAGES_LABEL}
          >
            <div>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              <h3>Custom phase messages</h3>
              <p>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                These automatically emit once per day when Play processes this phase.
              </p>
            </div>
            {phaseCustom.length === 0 ? (
              <p className="broadcast-manager__empty">
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                No custom messages for this phase.
              </p>
            ) : (
              <ol className="broadcast-manager__message-list">
                {phaseCustom.map((message) => (
                  <li
                    key={message.id}
                    className={`broadcast-manager__message-card${message.enabled ? '' : ' is-disabled'}`}
                  >
                    <div className="broadcast-manager__message-meta">
                      <span
                        className={`broadcast-manager__badge broadcast-manager__badge--${message.level}`}
                      >
                        {message.level}
                      </span>
                      <span>
                        {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                        type: {message.type}
                      </span>
                      <code>{message.key ?? suggestMessageKey(message.text)}</code>
                      <span>
                        {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                        position {phaseCustom.findIndex((item) => item.id === message.id) + 1}
                      </span>
                      {message.forceOnTv && (
                        <span className="broadcast-manager__edited">
                          {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                          faux TV
                        </span>
                      )}
                      {!message.enabled && (
                        <span className="broadcast-manager__disabled">
                          {/* i18n-ignore: Debug-only authoring metadata intentionally uses canonical English labels */}
                          disabled
                        </span>
                      )}
                    </div>
                    <p>{message.text}</p>
                    <div className="broadcast-manager__message-actions">
                      <button type="button" onClick={() => editCustom(message)}>
                        {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch(updateCustomBroadcast({ ...message, enabled: !message.enabled }))
                        }
                      >
                        {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                        {message.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="broadcast-manager__danger"
                        onClick={() =>
                          window.confirm('Delete this custom phase message?') &&
                          dispatch(removeCustomBroadcast(message.id))
                        }
                      >
                        {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <details className="broadcast-manager__history">
            <summary>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              Live history ({liveMessages.length})
            </summary>
            <p>
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              Already-emitted rows can still be corrected or removed without changing the source
              definition.
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
                  <p>{event.text}</p>
                  <div className="broadcast-manager__message-actions">
                    <button type="button" onClick={() => editLive(event)}>
                      {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
                      {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                {unassignedMessages.length} legacy row{unassignedMessages.length === 1 ? '' : 's'}{' '}
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                without a phase
              </summary>
              {unassignedMessages.map((event) => (
                <button key={event.id} type="button" onClick={() => editLive(event)}>
                  {event.text}
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
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
              <label>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                Message key / name
                <input
                  value={editor.key}
                  placeholder={MESSAGE_KEY_PLACEHOLDER}
                  onChange={(event) => setEditor({ ...editor, key: event.target.value })}
                />
                <small>
                  {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                  Use a readable stable key such as <code>social.alliance-warning</code>. Spaces are
                  converted to dashes; a key without a prefix becomes <code>custom.your-key</code>.
                </small>
                {!normalizeMessageKey(editor.key) && (
                  <small className="broadcast-manager__field-error">
                    {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                    A message key is required.
                  </small>
                )}
                {customMessages.some(
                  (message) =>
                    message.id !== editor.id &&
                    (message.key ?? '') === normalizeMessageKey(editor.key)
                ) && (
                  <small className="broadcast-manager__field-error">
                    {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                    That key is already in use.
                  </small>
                )}
              </label>
            )}
            {(editor.isCard || editor.forceOnTv || editor.level !== 'minor') && (
              <label>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
              {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
              {editor.isCard ? 'Card subtitle' : 'Message'}
              <textarea
                value={editor.text}
                rows={5}
                onChange={(event) => setEditor({ ...editor, text: event.target.value })}
              />
              <small>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                Keep placeholders such as {'{winner}'} if the live player value should remain
                dynamic.
              </small>
            </label>
            <div className="broadcast-manager__editor-grid">
              <label>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
                  {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                  <option value="minor">Minor · normal log line</option>
                  {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                  <option value="major">Major · faux-TV card</option>
                  {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
              <span>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                Force this message onto the faux TV
              </span>
              <small>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                No announcement key is needed. If unchecked, minor messages stay in the log; major
                and critical messages always use the faux TV.
              </small>
            </label>
            <footer>
              <button type="button" onClick={() => setEditor(null)}>
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
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
                {/* i18n-ignore: Debug-only authoring tool intentionally uses canonical English labels */}
                Save
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
