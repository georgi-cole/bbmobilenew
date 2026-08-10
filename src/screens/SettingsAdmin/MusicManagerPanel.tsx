import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllGames } from '../../minigames/registry'
import type { Phase } from '../../types'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  resetMusicConfigOverrides,
  resetMusicTrackAssets,
  selectSettings,
  setMusicConfigOverrides,
  setMusicTrackAssets,
} from '../../store/settingsSlice'
import { SoundManager } from '../../services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../services/sound/sounds'
import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_LABELS,
  DEFAULT_PHASE_MUSIC_POLICY,
  getModePhaseSelection,
  resolveAudioEventCue,
  resolveMusicCue,
  type AudioEventId,
  MUSIC_MINIGAME_VARIANTS,
  type MusicConfigMode,
  type MusicConfigOverrides,
  type MusicMinigameStage,
  type MusicMinigameVariant,
  type MusicSelection,
} from '../../services/sound/musicConfig'
import {
  MUSIC_CATALOG,
  MUSIC_TRACK_IDS,
  getMusicTrackSoundEntry,
  type CatalogMusicTrack,
} from '../../services/sound/musicCatalog'
import { auditMusicConfig } from '../../services/sound/musicConfigAudit'
import {
  sanitiseMusicConfigOverrides,
  sanitiseMusicTrackAssetOverrides,
} from '../../services/sound/musicConfigSanitizer'
import {
  buildEffectiveMusicConfig,
  mergeMusicTrackAssets,
} from '../../services/sound/musicRuntimeConfig'
import MusicCueEditor from './MusicCueEditor'
import type { MusicCueDefinition } from '../../services/sound/musicCue'
import './MusicManagerPanel.css'
import ManagerPublishBar from '../../components/ManagerPublishBar/ManagerPublishBar'

type ManagerSection = 'phases' | 'minigames' | 'events' | 'tracks' | 'cues' | 'data'
type EditableMode = Exclude<MusicConfigMode, 'any'>

const MINIGAME_STAGES: readonly MusicMinigameStage[] = [
  'rules',
  'countdown',
  'playing',
  'results',
  'done',
]

const SECTION_TABS: ReadonlyArray<{ id: ManagerSection; label: string }> = [
  { id: 'phases', label: 'Phases' },
  { id: 'minigames', label: 'Minigames' },
  { id: 'events', label: 'Events' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'cues', label: 'Cues' },
  { id: 'data', label: 'Data' },
]

const EVENT_SOUND_OPTIONS = Object.values(SOUND_REGISTRY)
  .filter((entry) => entry.category !== 'music')
  .sort((left, right) => left.key.localeCompare(right.key))

function cloneOverrides(overrides: MusicConfigOverrides): MusicConfigOverrides {
  return JSON.parse(JSON.stringify(overrides)) as MusicConfigOverrides
}

function titleFromKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function selectionFromValue(
  value: string,
  cues: Readonly<Record<string, MusicCueDefinition>>
): MusicSelection | undefined {
  if (value === 'default') return undefined
  if (value === 'inherit') return { kind: 'inherit' }
  if (value === 'silence') return { kind: 'silence' }
  if (value.startsWith('cue:')) {
    const cueId = value.slice(4)
    const cue = cues[cueId]
    if (cue) return { kind: 'track', track: cue.track, cueId }
  }
  if (MUSIC_TRACK_IDS.includes(value as CatalogMusicTrack)) {
    return { kind: 'track', track: value as CatalogMusicTrack }
  }
  return undefined
}

function selectionToValue(selection: MusicSelection | undefined): string {
  if (!selection) return 'default'
  if (selection.kind === 'track')
    return selection.cueId ? `cue:${selection.cueId}` : selection.track
  return selection.kind
}

function selectionLabel(
  selection: MusicSelection | undefined,
  cues: Readonly<Record<string, MusicCueDefinition>> = {}
): string {
  if (!selection) return 'Unconfigured'
  if (selection.kind === 'inherit') return 'Inherit'
  if (selection.kind === 'silence') return 'Silence'
  return selection.cueId
    ? (cues[selection.cueId]?.displayName ?? `Missing cue: ${selection.cueId}`)
    : MUSIC_CATALOG[selection.track].displayName
}

function AssignmentSelect({
  value,
  onChange,
  ariaLabel,
  cues,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  cues: Readonly<Record<string, MusicCueDefinition>>
}) {
  return (
    <select
      className="music-manager__select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
    >
      <option value="default">Default / server</option>
      <option value="inherit">Inherit parent</option>
      <option value="silence">Explicit silence</option>
      {Object.keys(cues).length > 0 && (
        <optgroup label="Saved cues">
          {Object.values(cues)
            .sort((left, right) => left.displayName.localeCompare(right.displayName))
            .map((cue) => (
              <option key={cue.id} value={`cue:${cue.id}`}>
                {cue.displayName} · {MUSIC_CATALOG[cue.track].displayName}
              </option>
            ))}
        </optgroup>
      )}
      <optgroup label="Full tracks">
        {MUSIC_TRACK_IDS.map((track) => (
          <option key={track} value={track}>
            {MUSIC_CATALOG[track].displayName}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

function SourceBadge({ source }: { source: 'local' | 'server' | 'default' }) {
  return (
    <span className={`music-manager__source music-manager__source--${source}`}>
      {source === 'local' ? 'Local' : source === 'server' ? 'Server' : 'Bundled'}
    </span>
  )
}

export default function MusicManagerPanel() {
  const dispatch = useAppDispatch()
  const settings = useAppSelector(selectSettings)
  const remoteMusic = useAppSelector((state) => state.remoteConfig?.config?.season?.music ?? null)
  const [section, setSection] = useState<ManagerSection>('phases')
  const [mode, setMode] = useState<EditableMode>('classic')
  const [stage, setStage] = useState<MusicMinigameStage>('playing')
  const [variant, setVariant] = useState<MusicMinigameVariant>('normal')
  const [search, setSearch] = useState('')
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [assetDrafts, setAssetDrafts] = useState<Partial<Record<CatalogMusicTrack, string>>>({})
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const [previewingTrack, setPreviewingTrack] = useState<CatalogMusicTrack | null>(null)

  const localOverrides = settings.audio.musicConfigOverrides
  const localAssets = settings.audio.musicTrackAssets
  const remoteOverrides = remoteMusic?.assignments
  const effectiveConfig = useMemo(
    () => buildEffectiveMusicConfig(remoteOverrides, localOverrides),
    [localOverrides, remoteOverrides]
  )
  const effectiveAssets = useMemo(
    () => mergeMusicTrackAssets(remoteMusic, localAssets),
    [localAssets, remoteMusic]
  )
  const effectiveAssetMap = useMemo(
    () => new Map(effectiveAssets.map((asset) => [asset.track, asset])),
    [effectiveAssets]
  )
  const activeGames = useMemo(
    () =>
      getAllGames()
        .filter((game) => !game.retired)
        .sort((left, right) => left.title.localeCompare(right.title)),
    []
  )
  const auditIssues = useMemo(
    () =>
      auditMusicConfig(
        effectiveConfig,
        activeGames.map((game) => ({ key: game.key, category: game.category }))
      ),
    [activeGames, effectiveConfig]
  )
  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return activeGames
    return activeGames.filter(
      (game) => game.title.toLowerCase().includes(query) || game.key.toLowerCase().includes(query)
    )
  }, [activeGames, search])

  useEffect(() => {
    setAssetDrafts(
      Object.fromEntries(localAssets.map((asset) => [asset.track, asset.src])) as Partial<
        Record<CatalogMusicTrack, string>
      >
    )
  }, [localAssets])

  useEffect(
    () => () => {
      previewRef.current?.pause()
      if (previewTimerRef.current != null) window.clearTimeout(previewTimerRef.current)
    },
    []
  )

  const commitOverrides = (next: MusicConfigOverrides) => {
    dispatch(setMusicConfigOverrides(next))
    setMessage('Local music overrides updated.')
  }

  const updatePhase = (phase: Phase, value: string) => {
    const next = cloneOverrides(localOverrides)
    const modeOverrides = { ...(next.modePhaseOverrides?.[mode] ?? {}) }
    const selection = selectionFromValue(value, effectiveConfig.musicCues)
    if (selection) modeOverrides[phase] = selection
    else delete modeOverrides[phase]
    next.modePhaseOverrides = {
      ...(next.modePhaseOverrides ?? {}),
      [mode]: modeOverrides,
    }
    commitOverrides(next)
  }

  const updateMinigame = (gameKey: string, value: string) => {
    const next = cloneOverrides(localOverrides)
    const selection = selectionFromValue(value, effectiveConfig.musicCues)

    if (variant === 'normal') {
      const allAssignments = { ...(next.minigameAssignments ?? {}) }
      const modeAssignments = { ...(allAssignments[mode] ?? {}) }
      const gameAssignments = { ...(modeAssignments[gameKey] ?? {}) }
      if (selection) gameAssignments[stage] = selection
      else delete gameAssignments[stage]
      if (Object.keys(gameAssignments).length === 0) delete modeAssignments[gameKey]
      else modeAssignments[gameKey] = gameAssignments
      allAssignments[mode] = modeAssignments
      next.minigameAssignments = allAssignments
    } else {
      const allAssignments = { ...(next.minigameVariantAssignments ?? {}) }
      const modeAssignments = { ...(allAssignments[mode] ?? {}) }
      const gameAssignments = { ...(modeAssignments[gameKey] ?? {}) }
      const stageAssignments = { ...(gameAssignments[stage] ?? {}) }
      if (selection) stageAssignments[variant] = selection
      else delete stageAssignments[variant]
      if (Object.keys(stageAssignments).length === 0) delete gameAssignments[stage]
      else gameAssignments[stage] = stageAssignments
      if (Object.keys(gameAssignments).length === 0) delete modeAssignments[gameKey]
      else modeAssignments[gameKey] = gameAssignments
      allAssignments[mode] = modeAssignments
      next.minigameVariantAssignments = allAssignments
    }
    commitOverrides(next)
  }

  const updateEvent = (eventId: AudioEventId, value: string) => {
    const next = cloneOverrides(localOverrides)
    const events = { ...(next.eventSounds ?? {}) }
    if (value === 'default') {
      delete events[eventId]
    } else if (value === 'disabled') {
      events[eventId] = { soundKey: null }
    } else {
      const previous = events[eventId]
      events[eventId] = {
        soundKey: value,
        ...(previous?.volume !== undefined ? { volume: previous.volume } : {}),
      }
    }
    next.eventSounds = events
    commitOverrides(next)
  }

  const updateEventVolume = (eventId: AudioEventId, volume: number) => {
    const next = cloneOverrides(localOverrides)
    const events = { ...(next.eventSounds ?? {}) }
    const effectiveCue = resolveAudioEventCue(eventId, effectiveConfig)
    const current = events[eventId] ?? effectiveCue
    events[eventId] = { soundKey: current.soundKey, volume }
    next.eventSounds = events
    commitOverrides(next)
  }

  const previewEvent = (eventId: AudioEventId) => {
    const cue = resolveAudioEventCue(eventId, effectiveConfig)
    if (!cue.soundKey) {
      setMessage('This event is configured as silent.')
      return
    }
    void SoundManager.play(
      cue.soundKey,
      cue.volume === undefined ? undefined : { volume: cue.volume, allowDuplicate: true }
    )
  }

  const stopPreview = () => {
    previewRef.current?.pause()
    previewRef.current = null
    if (previewTimerRef.current != null) window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
    setPreviewingTrack(null)
  }

  const previewTrack = (track: CatalogMusicTrack) => {
    stopPreview()
    const asset = effectiveAssetMap.get(track)
    const bundled = getMusicTrackSoundEntry(track)
    const src = asset?.src ?? bundled?.src
    if (!src) {
      setMessage(`No playable asset is registered for ${MUSIC_CATALOG[track].displayName}.`)
      return
    }
    const audio = new Audio(src)
    audio.volume = Math.max(0, Math.min(1, asset?.volume ?? bundled?.volume ?? 0.5))
    audio.loop = false
    previewRef.current = audio
    setPreviewingTrack(track)
    audio.addEventListener('ended', stopPreview, { once: true })
    void audio.play().catch(() => {
      stopPreview()
      setMessage('Preview could not start. Check the URL or browser audio permission.')
    })
    previewTimerRef.current = window.setTimeout(stopPreview, 12_000)
  }

  const saveAsset = (track: CatalogMusicTrack) => {
    const raw = assetDrafts[track]?.trim() ?? ''
    try {
      const url = new URL(raw)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
    } catch {
      setMessage('Track URLs must be valid HTTP or HTTPS addresses.')
      return
    }
    const existing = localAssets.find((asset) => asset.track === track)
    const next = [
      ...localAssets.filter((asset) => asset.track !== track),
      {
        track,
        src: raw,
        ...(existing?.volume !== undefined ? { volume: existing.volume } : {}),
        ...(existing?.loop !== undefined ? { loop: existing.loop } : {}),
      },
    ]
    dispatch(setMusicTrackAssets(next))
    setMessage(`${MUSIC_CATALOG[track].displayName} now uses the local URL override.`)
  }

  const removeAsset = (track: CatalogMusicTrack) => {
    dispatch(setMusicTrackAssets(localAssets.filter((asset) => asset.track !== track)))
    setAssetDrafts((current) => ({ ...current, [track]: '' }))
    setMessage('Local URL override removed; server or bundled audio will be used.')
  }

  const exportPayload = useMemo(
    () =>
      JSON.stringify(
        {
          version: 1,
          assignments: localOverrides,
          tracks: localAssets,
        },
        null,
        2
      ),
    [localAssets, localOverrides]
  )

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportPayload)
      setMessage('Local music configuration copied to the clipboard.')
    } catch {
      setImportText(exportPayload)
      setMessage('Clipboard access was blocked; the export was placed in the text area.')
    }
  }

  const importPayload = () => {
    try {
      const parsed = JSON.parse(importText) as {
        assignments?: unknown
        tracks?: unknown
      }
      const assignments = sanitiseMusicConfigOverrides(parsed.assignments ?? parsed)
      dispatch(setMusicConfigOverrides(assignments))
      if (Object.prototype.hasOwnProperty.call(parsed, 'tracks')) {
        const tracks = sanitiseMusicTrackAssetOverrides(parsed.tracks)
        dispatch(setMusicTrackAssets(tracks))
      }
      setMessage('Validated music configuration imported successfully.')
    } catch {
      setMessage('Import failed: the text is not valid JSON.')
    }
  }

  const resetLocal = () => {
    dispatch(resetMusicConfigOverrides())
    dispatch(resetMusicTrackAssets())
    stopPreview()
    setMessage('All local music overrides were reset. Server and bundled defaults remain active.')
  }

  return (
    <section className="music-manager" aria-label="Music Manager">
      <ManagerPublishBar
        managerName="Music Manager"
        exportFileName="music-manager-remote-config.json"
        getPatch={() => ({
          season: {
            music: {
              assignments: localOverrides,
              tracks: localAssets,
            },
          },
        })}
      />
      <header className="music-manager__hero">
        <div>
          <p className="music-manager__eyebrow">Advanced audio direction</p>
          <h2 className="music-manager__title">Music Manager</h2>
          <p className="music-manager__description">
            Assign background music by mode, phase, minigame stage and event. Local settings
            override validated server configuration; missing or failed assets fall back safely.
          </p>
        </div>
        <div
          className={`music-manager__health ${auditIssues.length === 0 ? 'music-manager__health--ok' : 'music-manager__health--warning'}`}
        >
          <strong>{auditIssues.length === 0 ? 'Healthy' : `${auditIssues.length} issues`}</strong>
          <span>{auditIssues.length === 0 ? 'All policies resolve' : 'Review audit below'}</span>
        </div>
      </header>

      <div className="music-manager__toolbar">
        <div className="music-manager__segmented" aria-label="Game mode">
          {(['classic', 'survival'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'music-manager__segment--active' : ''}
              onClick={() => setMode(value)}
            >
              {value === 'classic' ? 'Classic' : 'Survival'}
            </button>
          ))}
        </div>
        <span className="music-manager__precedence">Bundled → server → local</span>
      </div>

      <nav className="music-manager__tabs" aria-label="Music Manager sections">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={section === tab.id ? 'music-manager__tab--active' : ''}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message && (
        <div className="music-manager__message" role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      {auditIssues.length > 0 && (
        <details className="music-manager__audit">
          <summary>Configuration audit</summary>
          <ul>
            {auditIssues.slice(0, 12).map((issue, index) => (
              <li key={`${issue.code}-${issue.path ?? index}`}>
                <strong>{issue.code}</strong> — {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {section === 'phases' && (
        <div className="music-manager__list">
          <div className="music-manager__section-copy">
            <h3>{mode === 'classic' ? 'Classic' : 'Survival'} phase score</h3>
            <p>
              Default removes the local override. Inherit explicitly bypasses a server mode
              override.
            </p>
          </div>
          {(Object.keys(DEFAULT_PHASE_MUSIC_POLICY) as Phase[]).map((phase) => {
            const local = localOverrides.modePhaseOverrides?.[mode]?.[phase]
            const remote = remoteOverrides?.modePhaseOverrides?.[mode]?.[phase]
            const effective = getModePhaseSelection(mode, phase, effectiveConfig)
            return (
              <article className="music-manager__row" key={phase}>
                <div className="music-manager__row-main">
                  <div>
                    <strong>{titleFromKey(phase)}</strong>
                    <code>{phase}</code>
                  </div>
                  <SourceBadge source={local ? 'local' : remote ? 'server' : 'default'} />
                </div>
                <div className="music-manager__row-controls">
                  <AssignmentSelect
                    value={selectionToValue(local)}
                    onChange={(value) => updatePhase(phase, value)}
                    ariaLabel={`Music for ${titleFromKey(phase)}`}
                    cues={effectiveConfig.musicCues}
                  />
                  <span className="music-manager__resolved">
                    Effective: {selectionLabel(effective, effectiveConfig.musicCues)}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {section === 'minigames' && (
        <div className="music-manager__list">
          <div className="music-manager__section-copy">
            <h3>Minigame stage assignments</h3>
            <p>
              Assign lifecycle stages and switch gameplay music for final rounds, sudden death or
              overtime.
            </p>
          </div>
          <div className="music-manager__filters">
            <input
              className="music-manager__search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search minigames"
              aria-label="Search minigames"
            />
            <div className="music-manager__stage-tabs" aria-label="Minigame stage">
              {MINIGAME_STAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={stage === value ? 'music-manager__stage--active' : ''}
                  onClick={() => {
                    setStage(value)
                    if (value !== 'playing') setVariant('normal')
                  }}
                >
                  {titleFromKey(value)}
                </button>
              ))}
            </div>
            {stage === 'playing' && (
              <div className="music-manager__variant-tabs" aria-label="Minigame music variant">
                {MUSIC_MINIGAME_VARIANTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={variant === value ? 'music-manager__variant--active' : ''}
                    onClick={() => setVariant(value)}
                  >
                    {titleFromKey(value)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredGames.map((game) => {
            const local =
              variant === 'normal'
                ? localOverrides.minigameAssignments?.[mode]?.[game.key]?.[stage]
                : localOverrides.minigameVariantAssignments?.[mode]?.[game.key]?.[stage]?.[variant]
            const remote =
              variant === 'normal'
                ? remoteOverrides?.minigameAssignments?.[mode]?.[game.key]?.[stage]
                : remoteOverrides?.minigameVariantAssignments?.[mode]?.[game.key]?.[stage]?.[
                    variant
                  ]
            const cue = resolveMusicCue(
              {
                mode,
                gamePhase: 'loh_comp',
                routeHash: '#/game',
                musicScene: 'none',
                spectatorActive: false,
                socialOpen: false,
                minigame: { gameKey: game.key, category: game.category, stage, variant },
              },
              effectiveConfig
            )
            return (
              <article className="music-manager__row" key={game.key}>
                <div className="music-manager__row-main">
                  <div>
                    <strong>{game.title}</strong>
                    <code>
                      {game.key} · {game.category}
                    </code>
                  </div>
                  <SourceBadge source={local ? 'local' : remote ? 'server' : 'default'} />
                </div>
                <div className="music-manager__row-controls">
                  <AssignmentSelect
                    value={selectionToValue(local)}
                    onChange={(value) => updateMinigame(game.key, value)}
                    ariaLabel={`${stage} ${variant} music for ${game.title}`}
                    cues={effectiveConfig.musicCues}
                  />
                  <span className="music-manager__resolved">
                    Effective:{' '}
                    {cue.track === 'none'
                      ? 'Silence'
                      : cue.playbackCue && cue.selection.kind === 'track' && cue.selection.cueId
                        ? cue.playbackCue.displayName
                        : MUSIC_CATALOG[cue.track].displayName}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {section === 'events' && (
        <div className="music-manager__list">
          <div className="music-manager__section-copy">
            <h3>One-shot event cues</h3>
            <p>
              These stingers remain separate from background music and may be disabled individually.
            </p>
          </div>
          {AUDIO_EVENT_IDS.map((eventId) => {
            const local = localOverrides.eventSounds?.[eventId]
            const remote = remoteOverrides?.eventSounds?.[eventId]
            const effective = resolveAudioEventCue(eventId, effectiveConfig)
            const value = local === undefined ? 'default' : (local.soundKey ?? 'disabled')
            return (
              <article className="music-manager__row" key={eventId}>
                <div className="music-manager__row-main">
                  <div>
                    <strong>{AUDIO_EVENT_LABELS[eventId]}</strong>
                    <code>{eventId}</code>
                  </div>
                  <SourceBadge source={local ? 'local' : remote ? 'server' : 'default'} />
                </div>
                <div className="music-manager__event-controls">
                  <select
                    className="music-manager__select"
                    value={value}
                    onChange={(event) => updateEvent(eventId, event.target.value)}
                    aria-label={`Sound for ${AUDIO_EVENT_LABELS[eventId]}`}
                  >
                    <option value="default">Default / server</option>
                    <option value="disabled">Disabled</option>
                    {EVENT_SOUND_OPTIONS.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.key}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="music-manager__preview"
                    onClick={() => previewEvent(eventId)}
                    disabled={!effective.soundKey}
                  >
                    Preview
                  </button>
                </div>
                <label className="music-manager__volume">
                  <span>Volume {Math.round((effective.volume ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={local?.volume ?? effective.volume ?? 1}
                    disabled={!effective.soundKey}
                    onChange={(event) => updateEventVolume(eventId, Number(event.target.value))}
                  />
                </label>
              </article>
            )
          })}
        </div>
      )}

      {section === 'tracks' && (
        <div className="music-manager__list">
          <div className="music-manager__section-copy">
            <h3>Semantic track catalog</h3>
            <p>
              Custom URLs fall back to the bundled track, then to the declared semantic fallback.
            </p>
          </div>
          {MUSIC_TRACK_IDS.map((track) => {
            const definition = MUSIC_CATALOG[track]
            const local = localAssets.find((asset) => asset.track === track)
            const remote = remoteMusic?.tracks?.find((asset) => asset.track === track)
            const legacyRemote = track === 'competition' && remoteMusic?.mainTrackUrl
            const bundled = getMusicTrackSoundEntry(track)
            const source = local ? 'local' : remote || legacyRemote ? 'server' : 'default'
            const effectiveAsset = effectiveAssetMap.get(track)
            return (
              <article className="music-manager__track" key={track}>
                <div className="music-manager__row-main">
                  <div>
                    <strong>{definition.displayName}</strong>
                    <code>
                      {track} · fallback: {definition.fallbackTrack}
                    </code>
                  </div>
                  <SourceBadge source={source} />
                </div>
                <div className="music-manager__track-source">
                  <span>{effectiveAsset?.src ?? bundled?.src ?? 'No asset'}</span>
                  <button
                    type="button"
                    className="music-manager__preview"
                    onClick={() =>
                      previewingTrack === track ? stopPreview() : previewTrack(track)
                    }
                  >
                    {previewingTrack === track ? 'Stop' : 'Preview'}
                  </button>
                </div>
                <div className="music-manager__asset-editor">
                  <input
                    type="url"
                    value={assetDrafts[track] ?? ''}
                    placeholder="https://server.example/track.mp3"
                    onChange={(event) =>
                      setAssetDrafts((current) => ({ ...current, [track]: event.target.value }))
                    }
                    aria-label={`Local URL for ${definition.displayName}`}
                  />
                  <button type="button" onClick={() => saveAsset(track)}>
                    Save URL
                  </button>
                  <button type="button" onClick={() => removeAsset(track)} disabled={!local}>
                    Clear
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {section === 'cues' && (
        <MusicCueEditor
          localOverrides={localOverrides}
          effectiveConfig={effectiveConfig}
          effectiveAssetMap={effectiveAssetMap}
          onCommit={commitOverrides}
          onMessage={setMessage}
        />
      )}

      {section === 'data' && (
        <div className="music-manager__data">
          <div className="music-manager__section-copy">
            <h3>Import and export</h3>
            <p>
              Only local overrides are exported. Imported data is sanitized before it reaches Redux.
            </p>
          </div>
          <div className="music-manager__data-actions">
            <button type="button" onClick={copyExport}>
              Copy export
            </button>
            <button type="button" className="music-manager__danger" onClick={resetLocal}>
              Reset local overrides
            </button>
          </div>
          <textarea
            className="music-manager__json"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={exportPayload}
            spellCheck={false}
            aria-label="Music configuration JSON"
          />
          <button
            type="button"
            className="music-manager__import"
            onClick={importPayload}
            disabled={!importText.trim()}
          >
            Validate and import
          </button>
          <details className="music-manager__export-preview">
            <summary>Current local export</summary>
            <pre>{exportPayload}</pre>
          </details>
        </div>
      )}
    </section>
  )
}
