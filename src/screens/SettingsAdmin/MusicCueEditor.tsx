import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MUSIC_CATALOG,
  MUSIC_TRACK_IDS,
  getMusicTrackSoundEntry,
  type CatalogMusicTrack,
  type MusicTrackAssetOverride,
} from '../../services/sound/musicCatalog'
import { MusicCueEngine } from '../../services/sound/MusicCueEngine'
import {
  MUSIC_EFFECT_PRESETS,
  MUSIC_RESTART_POLICIES,
  createDefaultMusicCue,
  validateMusicCueDefinition,
  type MusicCueDefinition,
} from '../../services/sound/musicCue'
import type { MusicConfigDocument, MusicConfigOverrides } from '../../services/sound/musicConfig'

interface MusicCueEditorProps {
  localOverrides: MusicConfigOverrides
  effectiveConfig: MusicConfigDocument
  effectiveAssetMap: ReadonlyMap<CatalogMusicTrack, MusicTrackAssetOverride>
  onCommit: (next: MusicConfigOverrides) => void
  onMessage: (message: string) => void
}

function cloneOverrides(overrides: MusicConfigOverrides): MusicConfigOverrides {
  return JSON.parse(JSON.stringify(overrides)) as MusicConfigOverrides
}

function cueIdBase(track: CatalogMusicTrack): string {
  return `${track}_cue`
}

function nextCueId(
  track: CatalogMusicTrack,
  cues: Readonly<Record<string, MusicCueDefinition>>
): string {
  const base = cueIdBase(track)
  if (!cues[base]) return base
  let suffix = 2
  while (cues[`${base}_${suffix}`]) suffix += 1
  return `${base}_${suffix}`
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default function MusicCueEditor({
  localOverrides,
  effectiveConfig,
  effectiveAssetMap,
  onCommit,
  onMessage,
}: MusicCueEditorProps) {
  const effectiveCues = effectiveConfig.musicCues
  const cueIds = useMemo(
    () =>
      Object.keys(effectiveCues).sort((left, right) =>
        effectiveCues[left].displayName.localeCompare(effectiveCues[right].displayName)
      ),
    [effectiveCues]
  )
  const [selectedCueId, setSelectedCueId] = useState<string>(cueIds[0] ?? '')
  const [newTrack, setNewTrack] = useState<CatalogMusicTrack>('competition')
  const [draft, setDraft] = useState<MusicCueDefinition | null>(
    selectedCueId ? effectiveCues[selectedCueId] : null
  )
  const [duration, setDuration] = useState<number | null>(null)
  const [transitionFrom, setTransitionFrom] = useState<string>('')
  const [previewing, setPreviewing] = useState(false)
  const engineRef = useRef<MusicCueEngine | null>(null)
  const transitionTimerRef = useRef<number | null>(null)

  const engine = () => {
    engineRef.current ??= new MusicCueEngine()
    return engineRef.current
  }

  useEffect(() => {
    if (!selectedCueId && cueIds[0]) setSelectedCueId(cueIds[0])
    if (selectedCueId && !effectiveCues[selectedCueId]) {
      setSelectedCueId(cueIds[0] ?? '')
    }
  }, [cueIds, effectiveCues, selectedCueId])

  useEffect(() => {
    setDraft(selectedCueId ? (effectiveCues[selectedCueId] ?? null) : null)
  }, [effectiveCues, selectedCueId])

  const draftTrack = draft?.track

  useEffect(() => {
    setDuration(null)
    if (!draftTrack) return
    const asset = effectiveAssetMap.get(draftTrack)
    const bundled = getMusicTrackSoundEntry(draftTrack)
    const src = asset?.src ?? bundled?.src
    if (!src) return
    const audio = new Audio(src)
    const loaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    audio.addEventListener('loadedmetadata', loaded, { once: true })
    audio.preload = 'metadata'
    audio.src = src
    return () => audio.removeEventListener('loadedmetadata', loaded)
  }, [draftTrack, effectiveAssetMap])

  useEffect(
    () => () => {
      engineRef.current?.stop()
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)
    },
    []
  )

  const issues = useMemo(() => (draft ? validateMusicCueDefinition(draft) : []), [draft])
  const isLocal = draft ? Boolean(localOverrides.musicCues?.[draft.id]) : false

  const patchDraft = (patch: Partial<MusicCueDefinition>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const createCue = () => {
    const id = nextCueId(newTrack, effectiveCues)
    const cue = {
      ...createDefaultMusicCue(newTrack, getMusicTrackSoundEntry(newTrack)?.loop ?? true),
      id,
      displayName: `${MUSIC_CATALOG[newTrack].displayName} Cue`,
      restartPolicy: 'restart' as const,
    }
    setSelectedCueId(id)
    setDraft(cue)
  }

  const saveCue = () => {
    if (!draft) return
    if (issues.length > 0) {
      onMessage(`Cue cannot be saved: ${issues[0].message}`)
      return
    }
    const next = cloneOverrides(localOverrides)
    next.musicCues = { ...(next.musicCues ?? {}), [draft.id]: draft }
    onCommit(next)
    setSelectedCueId(draft.id)
    onMessage(`${draft.displayName} saved as a local cue.`)
  }

  const removeLocalCue = () => {
    if (!draft || !isLocal) return
    const next = cloneOverrides(localOverrides)
    const cues = { ...(next.musicCues ?? {}) }
    delete cues[draft.id]
    next.musicCues = cues
    onCommit(next)
    setSelectedCueId('')
    onMessage('Local cue override removed. Any server cue with the same id is visible again.')
  }

  const duplicateCue = () => {
    if (!draft) return
    const id = nextCueId(draft.track, effectiveCues)
    setDraft({ ...draft, id, displayName: `${draft.displayName} Copy` })
    setSelectedCueId(id)
  }

  const resetToFullTrack = () => {
    if (!draft) return
    const defaults = createDefaultMusicCue(
      draft.track,
      getMusicTrackSoundEntry(draft.track)?.loop ?? true
    )
    setDraft({
      ...defaults,
      id: draft.id,
      displayName: draft.displayName,
      restartPolicy: draft.restartPolicy,
    })
  }

  const resolveAsset = (cue: MusicCueDefinition) => {
    const remoteOrLocal = effectiveAssetMap.get(cue.track)
    const bundled = getMusicTrackSoundEntry(cue.track)
    const src = remoteOrLocal?.src ?? bundled?.src
    if (!src) return null
    return {
      key: `preview:${cue.track}`,
      track: cue.track,
      src,
      volume: remoteOrLocal?.volume ?? bundled?.volume ?? 0.5,
      loop: remoteOrLocal?.loop ?? bundled?.loop ?? true,
    }
  }

  const stopPreview = () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)
    transitionTimerRef.current = null
    engineRef.current?.stop()
    setPreviewing(false)
  }

  const previewCue = async () => {
    if (!draft || issues.length > 0) {
      onMessage(issues[0]?.message ?? 'Select or create a cue first.')
      return
    }
    stopPreview()
    const asset = resolveAsset(draft)
    if (!asset) {
      onMessage('No playable asset is registered for this cue track.')
      return
    }
    try {
      await engine().play(asset, draft)
      setPreviewing(true)
    } catch {
      stopPreview()
      onMessage('Cue preview could not start. Check browser audio permissions.')
    }
  }

  const previewTransition = async () => {
    if (!draft) return
    const sourceCue = effectiveCues[transitionFrom]
    if (!sourceCue) {
      onMessage('Choose a source cue for the transition preview.')
      return
    }
    const sourceAsset = resolveAsset(sourceCue)
    const targetAsset = resolveAsset(draft)
    if (!sourceAsset || !targetAsset) {
      onMessage('One of the transition tracks has no playable asset.')
      return
    }
    stopPreview()
    try {
      await engine().play(sourceAsset, { ...sourceCue, loop: true })
      setPreviewing(true)
      transitionTimerRef.current = window.setTimeout(() => {
        void engine()
          .play(targetAsset, draft)
          .catch(() => {
            stopPreview()
            onMessage('Transition preview failed while switching cues.')
          })
      }, 2500)
    } catch {
      stopPreview()
      onMessage('Transition preview could not start.')
    }
  }

  const maxTime = Math.max(1, duration ?? draft?.endAtSec ?? draft?.startAtSec ?? 1)
  const endValue = draft?.endAtSec ?? duration ?? maxTime

  return (
    <div className="music-manager__cue-layout">
      <aside className="music-manager__cue-library">
        <div className="music-manager__section-copy">
          <h3>Cue library</h3>
          <p>
            Create reusable sections of any indexed track, then assign them to phases or variants.
          </p>
        </div>
        <div className="music-manager__cue-create">
          <select
            value={newTrack}
            onChange={(event) => setNewTrack(event.target.value as CatalogMusicTrack)}
          >
            {MUSIC_TRACK_IDS.map((track) => (
              <option key={track} value={track}>
                {MUSIC_CATALOG[track].displayName}
              </option>
            ))}
          </select>
          <button type="button" onClick={createCue}>
            New cue
          </button>
        </div>
        <div className="music-manager__cue-list">
          {cueIds.length === 0 && <p className="music-manager__empty">No saved cues yet.</p>}
          {cueIds.map((cueId) => {
            const cue = effectiveCues[cueId]
            return (
              <button
                key={cueId}
                type="button"
                className={selectedCueId === cueId ? 'music-manager__cue-item--active' : ''}
                onClick={() => setSelectedCueId(cueId)}
              >
                <strong>{cue.displayName}</strong>
                <span>{MUSIC_CATALOG[cue.track].displayName}</span>
                <code>{cue.id}</code>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="music-manager__cue-editor">
        {!draft ? (
          <div className="music-manager__empty-card">
            <strong>Create or select a cue</strong>
            <span>A cue defines which part of a track plays and how it transitions.</span>
          </div>
        ) : (
          <>
            <div className="music-manager__cue-heading">
              <div>
                <h3>{draft.displayName}</h3>
                <code>{draft.id}</code>
              </div>
              <span
                className={
                  issues.length === 0 ? 'music-manager__cue-valid' : 'music-manager__cue-invalid'
                }
              >
                {issues.length === 0 ? 'Valid cue' : `${issues.length} issues`}
              </span>
            </div>

            {issues.length > 0 && (
              <ul className="music-manager__cue-issues">
                {issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            )}

            <div className="music-manager__cue-grid">
              <label>
                <span>Name</span>
                <input
                  value={draft.displayName}
                  onChange={(event) => patchDraft({ displayName: event.target.value })}
                />
              </label>
              <label>
                <span>Track</span>
                <select
                  value={draft.track}
                  onChange={(event) =>
                    patchDraft({
                      track: event.target.value as CatalogMusicTrack,
                      startAtSec: 0,
                      endAtSec: undefined,
                      loopStartSec: undefined,
                      loopEndSec: undefined,
                    })
                  }
                >
                  {MUSIC_TRACK_IDS.map((track) => (
                    <option key={track} value={track}>
                      {MUSIC_CATALOG[track].displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="music-manager__timeline">
              <div className="music-manager__timeline-meta">
                <span>
                  Segment {draft.startAtSec.toFixed(1)}s →{' '}
                  {draft.endAtSec?.toFixed(1) ?? 'track end'}
                </span>
                <span>{duration ? `Duration ${duration.toFixed(1)}s` : 'Reading duration…'}</span>
              </div>
              <div className="music-manager__timeline-track" aria-hidden="true">
                <span
                  style={{
                    left: `${Math.min(100, (draft.startAtSec / maxTime) * 100)}%`,
                    right: `${Math.max(0, 100 - (endValue / maxTime) * 100)}%`,
                  }}
                />
              </div>
              <label>
                <span>Start</span>
                <input
                  type="range"
                  min={0}
                  max={maxTime}
                  step={0.1}
                  value={Math.min(draft.startAtSec, maxTime)}
                  onChange={(event) => patchDraft({ startAtSec: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  type="range"
                  min={0}
                  max={maxTime}
                  step={0.1}
                  value={Math.min(endValue, maxTime)}
                  onChange={(event) => patchDraft({ endAtSec: Number(event.target.value) })}
                />
              </label>
            </div>

            <div className="music-manager__cue-grid music-manager__cue-grid--numbers">
              <label>
                <span>Start second</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft.startAtSec}
                  onChange={(event) => patchDraft({ startAtSec: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>End second</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft.endAtSec ?? ''}
                  placeholder="Track end"
                  onChange={(event) => patchDraft({ endAtSec: optionalNumber(event.target.value) })}
                />
              </label>
              <label>
                <span>Loop start</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft.loopStartSec ?? ''}
                  placeholder="Cue start"
                  onChange={(event) =>
                    patchDraft({ loopStartSec: optionalNumber(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Loop end</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft.loopEndSec ?? ''}
                  placeholder="Cue end"
                  onChange={(event) =>
                    patchDraft({ loopEndSec: optionalNumber(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Fade in (ms)</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={draft.fadeInMs}
                  onChange={(event) => patchDraft({ fadeInMs: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Fade out (ms)</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={draft.fadeOutMs}
                  onChange={(event) => patchDraft({ fadeOutMs: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Crossfade (ms)</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={draft.crossfadeMs}
                  onChange={(event) => patchDraft({ crossfadeMs: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Volume {Math.round(draft.volume * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.volume}
                  onChange={(event) => patchDraft({ volume: Number(event.target.value) })}
                />
              </label>
            </div>

            <div className="music-manager__cue-grid">
              <label className="music-manager__cue-toggle">
                <input
                  type="checkbox"
                  checked={draft.loop}
                  onChange={(event) => patchDraft({ loop: event.target.checked })}
                />
                <span>Loop selected segment</span>
              </label>
              <label>
                <span>Restart behavior</span>
                <select
                  value={draft.restartPolicy}
                  onChange={(event) =>
                    patchDraft({
                      restartPolicy: event.target.value as MusicCueDefinition['restartPolicy'],
                    })
                  }
                >
                  {MUSIC_RESTART_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {policy.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Effect preset</span>
                <select
                  value={draft.effectPreset}
                  onChange={(event) =>
                    patchDraft({
                      effectPreset: event.target.value as MusicCueDefinition['effectPreset'],
                    })
                  }
                >
                  {MUSIC_EFFECT_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fallback cue</span>
                <select
                  value={draft.fallbackCueId ?? ''}
                  onChange={(event) =>
                    patchDraft({ fallbackCueId: event.target.value || undefined })
                  }
                >
                  <option value="">None</option>
                  {cueIds
                    .filter((id) => id !== draft.id)
                    .map((id) => (
                      <option key={id} value={id}>
                        {effectiveCues[id].displayName}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="music-manager__cue-preview-row">
              <button type="button" onClick={previewing ? stopPreview : previewCue}>
                {previewing ? 'Stop preview' : 'Preview cue'}
              </button>
              <select
                value={transitionFrom}
                onChange={(event) => setTransitionFrom(event.target.value)}
                aria-label="Transition source cue"
              >
                <option value="">Transition from…</option>
                {cueIds
                  .filter((id) => id !== draft.id)
                  .map((id) => (
                    <option key={id} value={id}>
                      {effectiveCues[id].displayName}
                    </option>
                  ))}
              </select>
              <button type="button" onClick={previewTransition} disabled={!transitionFrom}>
                Preview transition
              </button>
            </div>

            <div className="music-manager__cue-actions">
              <button
                type="button"
                className="music-manager__primary"
                onClick={saveCue}
                disabled={issues.length > 0}
              >
                Save cue
              </button>
              <button type="button" onClick={duplicateCue}>
                Duplicate
              </button>
              <button type="button" onClick={resetToFullTrack}>
                Reset to full track
              </button>
              <button
                type="button"
                className="music-manager__danger"
                onClick={removeLocalCue}
                disabled={!isLocal}
              >
                Remove local cue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
