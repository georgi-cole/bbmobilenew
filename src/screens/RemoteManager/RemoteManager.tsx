import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { getAllGames, type GameCategory } from '../../minigames/registry'
import { MUSIC_TRACK_IDS, type CatalogMusicTrack } from '../../services/sound/musicCatalog'
import type { MusicTrackAssetOverride } from '../../services/sound/musicCatalog'
import { DEFAULT_PHASE_MUSIC_POLICY } from '../../services/sound/musicConfig'
import type { SocialRuntimeOverride } from '../../social/socialRuntimeConfig'
import {
  buildEffectiveSocialActions,
  sanitiseSocialActionOverrides,
  type SocialActionOverride,
} from '../../social/socialActionManager'
import {
  ALL_BROADCAST_PHASES,
  getBroadcastTemplatesForPhase,
} from '../../broadcasting/broadcastTemplateCatalog'
import type { BroadcastLevel, CustomBroadcastMessage, Phase, TvEvent } from '../../types'
import type { GameManagerRule } from '../../gameManager/gameManager'
import {
  DEFAULT_REMOTE_CONFIG_URL,
  GITHUB_PAGES_REMOTE_CONFIG_URL,
  sanitiseRemoteConfig,
} from '../../remoteConfig/remoteConfigService'
import type { RemoteConfig } from '../../remoteConfig/remoteConfigTypes'
import {
  publishConfigAsPullRequest,
  publishConfigDirectly,
  type GitHubPublishTarget,
} from '../../remoteConfig/githubConfigPublisher'
import { isDebugAccessGranted } from '../../utils/debugMode'
import './RemoteManager.css'

type Section = 'broadcast' | 'music' | 'game' | 'social' | 'tutorial' | 'json' | 'publish'

const DEFAULT_TARGET: GitHubPublishTarget = {
  owner: 'georgi-cole',
  repo: 'bbmobilenew',
  branch: 'main',
  path: 'public/config/live-config.json',
}
const CATEGORIES: GameCategory[] = ['arcade', 'logic', 'trivia', 'endurance']

function initialConfig(): RemoteConfig {
  return {
    broadcast: { enabled: false, title: 'Big Brother Update', message: '', priority: 'normal' },
    broadcastManager: { enabled: false, overrides: {}, customMessages: [] },
    season: { music: { tracks: [] } },
    gameManager: { enabled: false, rules: [] },
    socialManager: { enabled: false, actionOverrides: {} },
    social: {
      schemaVersion: 1,
      revision: 'remote-1',
      economy: {
        normal: { weeklyEnergy: 5, energyCap: 5 },
        drama: { weeklyEnergy: 10, energyCap: 30 },
        influenceCap: 10_000,
        infoCap: 10_000,
      },
    },
  }
}

function newRule(): GameManagerRule {
  return {
    id: `remote-rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    priority: 100,
    trigger: 'day',
    day: 1,
    competition: 'any',
    selection: 'random',
    outcome: 'play',
  }
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function RemoteManager() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hasAccess = isDebugAccessGranted(searchParams, window.location.hostname)
  const [section, setSection] = useState<Section>('broadcast')
  const [config, setConfig] = useState<RemoteConfig>(initialConfig)
  const [jsonDraft, setJsonDraft] = useState('')
  const [token, setToken] = useState('')
  const [target, setTarget] = useState(DEFAULT_TARGET)
  const [status, setStatus] = useState('Loading the currently published configuration…')
  const [busy, setBusy] = useState(false)
  const [broadcastPhase, setBroadcastPhase] = useState<Phase>('week_start')
  const [socialActionId, setSocialActionId] = useState('compliment')
  const [socialActionJson, setSocialActionJson] = useState('')
  const games = useMemo(() => getAllGames().filter((game) => !game.retired), [])

  const refreshJson = (next = config) => setJsonDraft(JSON.stringify(next, null, 2))

  useEffect(() => {
    if (!hasAccess) return
    const controller = new AbortController()
    fetch(GITHUB_PAGES_REMOTE_CONFIG_URL, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const loaded = sanitiseRemoteConfig(await response.json())
        if (!loaded) throw new Error('The published file is not a valid config object.')
        setConfig(loaded)
        setJsonDraft(JSON.stringify(loaded, null, 2))
        setStatus('Published configuration loaded. Your edits are local until you publish.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const fallback = initialConfig()
        setConfig(fallback)
        setJsonDraft(JSON.stringify(fallback, null, 2))
        setStatus(`No published config could be loaded; using a safe template. ${String(error)}`)
      })
    return () => controller.abort()
  }, [hasAccess])

  if (!hasAccess) return <Navigate to="/" replace />

  const broadcast = config.broadcast ?? {}
  const tracks = config.season?.music?.tracks ?? []
  const phaseMusic = config.season?.music?.assignments?.phaseMusic ?? {}
  const gameManager = config.gameManager ?? { enabled: false, rules: [] }
  const broadcastManager = config.broadcastManager ?? {
    enabled: false,
    overrides: {},
    customMessages: [],
  }
  const socialManager = config.socialManager ?? { enabled: false, actionOverrides: {} }
  const remoteActions = buildEffectiveSocialActions(socialManager.actionOverrides)
  const selectedSocialAction =
    remoteActions.find((action) => action.id === socialActionId) ?? remoteActions[0]
  const social = config.social ?? {}
  const economy = social.economy ?? {}

  const updateBroadcast = (changes: Partial<NonNullable<RemoteConfig['broadcast']>>) =>
    setConfig((current) => ({ ...current, broadcast: { ...current.broadcast, ...changes } }))

  const updateTracks = (next: MusicTrackAssetOverride[]) =>
    setConfig((current) => ({
      ...current,
      season: {
        ...current.season,
        music: { ...current.season?.music, tracks: next },
      },
    }))

  const updatePhaseMusic = (phase: Phase, value: string) =>
    setConfig((current) => ({
      ...current,
      season: {
        ...current.season,
        music: {
          ...current.season?.music,
          assignments: {
            ...current.season?.music?.assignments,
            phaseMusic: {
              ...current.season?.music?.assignments?.phaseMusic,
              [phase]:
                value === 'silence'
                  ? { kind: 'silence' }
                  : value === 'inherit'
                    ? { kind: 'inherit' }
                    : { kind: 'track', track: value },
            },
          },
        },
      },
    }))

  const updateBroadcastManager = (
    changes: Partial<NonNullable<RemoteConfig['broadcastManager']>>
  ) =>
    setConfig((current) => ({
      ...current,
      broadcastManager: { ...current.broadcastManager, ...changes },
    }))

  const updateTemplateOverride = (id: string, changes: Record<string, unknown>) =>
    updateBroadcastManager({
      overrides: {
        ...broadcastManager.overrides,
        [id]: { ...broadcastManager.overrides?.[id], ...changes },
      },
    })

  const updateCustomMessages = (customMessages: CustomBroadcastMessage[]) =>
    updateBroadcastManager({ customMessages })

  const updateSocialActions = (
    actionOverrides: NonNullable<RemoteConfig['socialManager']>['actionOverrides']
  ) =>
    setConfig((current) => ({
      ...current,
      socialManager: { enabled: current.socialManager?.enabled ?? false, actionOverrides },
    }))

  const updateSocialAction = (id: string, changes: SocialActionOverride) =>
    updateSocialActions({
      ...socialManager.actionOverrides,
      [id]: { ...socialManager.actionOverrides?.[id], ...changes },
    })

  const updateRules = (rules: GameManagerRule[]) =>
    setConfig((current) => ({
      ...current,
      gameManager: { enabled: current.gameManager?.enabled ?? false, rules },
    }))

  const updateRule = (id: string, changes: Partial<GameManagerRule>) =>
    updateRules(gameManager.rules.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)))

  const updateEconomy = (
    mode: 'normal' | 'drama',
    key: 'weeklyEnergy' | 'energyCap',
    value: number
  ) =>
    setConfig((current) => {
      const currentSocial = current.social ?? {}
      const currentEconomy = currentSocial.economy ?? {}
      return {
        ...current,
        social: {
          ...currentSocial,
          schemaVersion: 1,
          economy: {
            ...currentEconomy,
            [mode]: { ...currentEconomy[mode], [key]: value },
          },
        },
      }
    })

  const applyJson = () => {
    try {
      const parsed = sanitiseRemoteConfig(JSON.parse(jsonDraft))
      if (!parsed) throw new Error('The root value must be an object.')
      setConfig(parsed)
      setJsonDraft(JSON.stringify(parsed, null, 2))
      setStatus('JSON validated and applied to the forms.')
    } catch (error) {
      setStatus(`JSON was not applied: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const publish = async (mode: 'pr' | 'direct') => {
    if (!token.trim()) {
      setStatus('Enter a fine-grained GitHub token before publishing.')
      setSection('publish')
      return
    }
    const validated = sanitiseRemoteConfig(config)
    if (!validated) {
      setStatus('The current form data is not valid and was not published.')
      return
    }
    setBusy(true)
    setStatus(mode === 'pr' ? 'Creating a review branch and pull request…' : 'Publishing to main…')
    try {
      const result =
        mode === 'pr'
          ? await publishConfigAsPullRequest(token.trim(), target, validated)
          : await publishConfigDirectly(token.trim(), target, validated)
      setStatus(
        mode === 'pr'
          ? `Pull request #${result.pullRequestNumber} created: ${result.url}`
          : `Configuration committed. GitHub Pages will deploy it shortly: ${result.url}`
      )
    } catch (error) {
      setStatus(`Publish failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="remote-manager">
      <header className="remote-manager__hero">
        <div>
          <p className="remote-manager__eyebrow">Central live operations</p>
          <h1>Remote Manager</h1>
          <p>Edit broadcasts, music, games, and social tuning without changing source code.</p>
        </div>
        <button type="button" onClick={() => navigate('/game?debug=1')}>
          Back to game
        </button>
      </header>

      <aside className="remote-manager__notice" aria-live="polite">
        {status}
      </aside>

      <nav className="remote-manager__tabs" aria-label="Remote manager sections">
        {(['broadcast', 'music', 'game', 'social', 'tutorial', 'json', 'publish'] as Section[]).map(
          (item) => (
            <button
              type="button"
              className={section === item ? 'is-active' : ''}
              onClick={() => {
                if (item === 'json') refreshJson()
                setSection(item)
              }}
              key={item}
            >
              {item === 'json' ? 'Advanced JSON' : item[0].toUpperCase() + item.slice(1)}
            </button>
          )
        )}
      </nav>

      {section === 'broadcast' && (
        <section className="remote-manager__card">
          <h2>Broadcast Manager</h2>
          <p>
            Global alert plus the same built-in phase templates and custom messages used by the
            local Broadcast Manager.
          </p>
          <label className="remote-manager__check">
            <input
              type="checkbox"
              checked={broadcast.enabled ?? false}
              onChange={(event) => updateBroadcast({ enabled: event.target.checked })}
            />
            Show this message to all players
          </label>
          <div className="remote-manager__grid">
            <label>
              Title
              <input
                value={broadcast.title ?? ''}
                maxLength={100}
                onChange={(event) => updateBroadcast({ title: event.target.value })}
              />
            </label>
            <label>
              Priority
              <select
                value={broadcast.priority ?? 'normal'}
                onChange={(event) =>
                  updateBroadcast({ priority: event.target.value as 'normal' | 'critical' })
                }
              >
                <option value="normal">Normal</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="remote-manager__wide">
              Message
              <textarea
                value={broadcast.message ?? ''}
                maxLength={500}
                rows={5}
                onChange={(event) => updateBroadcast({ message: event.target.value })}
              />
            </label>
            <label>
              Starts at
              <input
                type="datetime-local"
                value={broadcast.startsAt?.slice(0, 16) ?? ''}
                onChange={(event) =>
                  updateBroadcast({
                    startsAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              Ends at
              <input
                type="datetime-local"
                value={broadcast.endsAt?.slice(0, 16) ?? ''}
                onChange={(event) =>
                  updateBroadcast({
                    endsAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  })
                }
              />
            </label>
          </div>
          <hr className="remote-manager__divider" />
          <div className="remote-manager__heading-row">
            <div>
              <h3>Phase broadcast library</h3>
              <p>
                Enable this only when you want the central configuration to replace each player's
                local Broadcast Manager data.
              </p>
            </div>
            <label className="remote-manager__check">
              <input
                type="checkbox"
                checked={broadcastManager.enabled ?? false}
                onChange={(event) => updateBroadcastManager({ enabled: event.target.checked })}
              />
              Use central phase broadcasts
            </label>
          </div>
          <label className="remote-manager__phase-picker">
            Phase
            <select
              value={broadcastPhase}
              onChange={(event) => setBroadcastPhase(event.target.value as Phase)}
            >
              {ALL_BROADCAST_PHASES.map((phase) => (
                <option value={phase} key={phase}>
                  {phase.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <div className="remote-manager__template-list">
            {getBroadcastTemplatesForPhase(broadcastPhase).map((template) => {
              const override = broadcastManager.overrides?.[template.id] ?? {}
              return (
                <article className="remote-manager__template" key={template.id}>
                  <div>
                    <strong>{template.title ?? template.id}</strong>
                    <code>{template.id}</code>
                  </div>
                  <label>
                    Message
                    <textarea
                      rows={3}
                      value={override.text ?? template.text}
                      onChange={(event) =>
                        updateTemplateOverride(template.id, { text: event.target.value })
                      }
                    />
                  </label>
                  <div className="remote-manager__grid remote-manager__grid--compact">
                    <label>
                      TV title
                      <input
                        value={override.title ?? template.title ?? ''}
                        onChange={(event) =>
                          updateTemplateOverride(template.id, { title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Level
                      <select
                        value={override.level ?? template.level}
                        onChange={(event) =>
                          updateTemplateOverride(template.id, {
                            level: event.target.value as BroadcastLevel,
                          })
                        }
                      >
                        <option value="minor">Minor</option>
                        <option value="major">Major</option>
                        <option value="critical">Critical</option>
                      </select>
                    </label>
                    <label className="remote-manager__check">
                      <input
                        type="checkbox"
                        checked={override.disabled === true}
                        onChange={(event) =>
                          updateTemplateOverride(template.id, { disabled: event.target.checked })
                        }
                      />
                      Disable template
                    </label>
                  </div>
                </article>
              )
            })}
          </div>
          <div className="remote-manager__heading-row remote-manager__subhead">
            <div>
              <h3>Custom messages for this phase</h3>
              <p>These are emitted automatically whenever the phase begins.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateCustomMessages([
                  ...(broadcastManager.customMessages ?? []),
                  {
                    id: `remote-broadcast-${Date.now()}`,
                    key: `custom.remote-${Date.now()}`,
                    phase: broadcastPhase,
                    text: 'New broadcast message',
                    type: 'game' as TvEvent['type'],
                    level: 'minor',
                    enabled: true,
                    forceOnTv: true,
                  },
                ])
              }
            >
              Add phase message
            </button>
          </div>
          {(broadcastManager.customMessages ?? [])
            .filter((message) => message.phase === broadcastPhase)
            .map((message) => (
              <article className="remote-manager__template" key={message.id}>
                <div className="remote-manager__heading-row">
                  <code>{message.key ?? message.id}</code>
                  <button
                    type="button"
                    className="remote-manager__danger"
                    onClick={() =>
                      updateCustomMessages(
                        (broadcastManager.customMessages ?? []).filter(
                          (item) => item.id !== message.id
                        )
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                <label>
                  Message
                  <textarea
                    rows={3}
                    value={message.text}
                    onChange={(event) =>
                      updateCustomMessages(
                        (broadcastManager.customMessages ?? []).map((item) =>
                          item.id === message.id ? { ...item, text: event.target.value } : item
                        )
                      )
                    }
                  />
                </label>
                <div className="remote-manager__grid remote-manager__grid--compact">
                  <label>
                    Key
                    <input
                      value={message.key ?? ''}
                      onChange={(event) =>
                        updateCustomMessages(
                          (broadcastManager.customMessages ?? []).map((item) =>
                            item.id === message.id ? { ...item, key: event.target.value } : item
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    Level
                    <select
                      value={message.level}
                      onChange={(event) =>
                        updateCustomMessages(
                          (broadcastManager.customMessages ?? []).map((item) =>
                            item.id === message.id
                              ? { ...item, level: event.target.value as BroadcastLevel }
                              : item
                          )
                        )
                      }
                    >
                      <option value="minor">Minor</option>
                      <option value="major">Major</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label className="remote-manager__check">
                    <input
                      type="checkbox"
                      checked={message.enabled}
                      onChange={(event) =>
                        updateCustomMessages(
                          (broadcastManager.customMessages ?? []).map((item) =>
                            item.id === message.id
                              ? { ...item, enabled: event.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    Enabled
                  </label>
                </div>
              </article>
            ))}
        </section>
      )}

      {section === 'music' && (
        <section className="remote-manager__card">
          <div className="remote-manager__heading-row">
            <div>
              <h2>Music overrides</h2>
              <p>Replace any bundled track with a remotely hosted HTTPS audio file.</p>
            </div>
            <button
              type="button"
              onClick={() => updateTracks([...tracks, { track: MUSIC_TRACK_IDS[0], src: '' }])}
            >
              Add track override
            </button>
          </div>
          {tracks.length === 0 && (
            <p className="remote-manager__empty">
              No remote music overrides. Bundled music remains active.
            </p>
          )}
          {tracks.map((track, index) => (
            <div className="remote-manager__row" key={`${track.track}-${index}`}>
              <label>
                Game track
                <select
                  value={track.track}
                  onChange={(event) =>
                    updateTracks(
                      tracks.map((entry, item) =>
                        item === index
                          ? { ...entry, track: event.target.value as CatalogMusicTrack }
                          : entry
                      )
                    )
                  }
                >
                  {MUSIC_TRACK_IDS.map((id) => (
                    <option value={id} key={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                HTTPS audio URL
                <input
                  type="url"
                  value={track.src}
                  placeholder="https://…/song.mp3"
                  onChange={(event) =>
                    updateTracks(
                      tracks.map((entry, item) =>
                        item === index ? { ...entry, src: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <label>
                Volume
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={track.volume ?? 0.5}
                  onChange={(event) =>
                    updateTracks(
                      tracks.map((entry, item) =>
                        item === index
                          ? { ...entry, volume: numberValue(event.target.value, 0.5) }
                          : entry
                      )
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="remote-manager__danger"
                onClick={() => updateTracks(tracks.filter((_, item) => item !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <hr className="remote-manager__divider" />
          <h3>Phase score assignments</h3>
          <p>
            These are the central equivalent of the local Music Manager’s Phase Score tab. Choose a
            track, silence, or inherit the bundled policy for each phase.
          </p>
          <div className="remote-manager__assignment-list">
            {(Object.keys(DEFAULT_PHASE_MUSIC_POLICY) as Phase[]).map((phase) => {
              const selection = phaseMusic[phase]
              const value =
                selection?.kind === 'track' ? selection.track : (selection?.kind ?? 'inherit')
              return (
                <label className="remote-manager__assignment" key={phase}>
                  <span>
                    <strong>{phase.replace(/_/g, ' ')}</strong>
                    <code>{phase}</code>
                  </span>
                  <select
                    value={value}
                    onChange={(event) => updatePhaseMusic(phase, event.target.value)}
                  >
                    <option value="inherit">Bundled default</option>
                    <option value="silence">Silence</option>
                    {MUSIC_TRACK_IDS.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {section === 'game' && (
        <section className="remote-manager__card">
          <div className="remote-manager__heading-row">
            <div>
              <h2>Competition schedule</h2>
              <p>Higher-priority matching rules run first.</p>
            </div>
            <button type="button" onClick={() => updateRules([...gameManager.rules, newRule()])}>
              Add rule
            </button>
          </div>
          <label className="remote-manager__check">
            <input
              type="checkbox"
              checked={gameManager.enabled}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  gameManager: { ...gameManager, enabled: event.target.checked },
                }))
              }
            />
            Enable remote competition rules
          </label>
          {gameManager.rules.map((rule) => (
            <article className="remote-manager__rule" key={rule.id}>
              <div className="remote-manager__heading-row">
                <label className="remote-manager__check">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                  />
                  Rule enabled
                </label>
                <button
                  type="button"
                  className="remote-manager__danger"
                  onClick={() =>
                    updateRules(gameManager.rules.filter((item) => item.id !== rule.id))
                  }
                >
                  Remove
                </button>
              </div>
              <div className="remote-manager__grid remote-manager__grid--rules">
                <label>
                  Trigger
                  <select
                    value={rule.trigger}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        trigger: event.target.value as GameManagerRule['trigger'],
                      })
                    }
                  >
                    <option value="day">Day</option>
                    <option value="players">Players remaining</option>
                  </select>
                </label>
                <label>
                  {rule.trigger === 'day' ? 'Day' : 'Player count'}
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={rule.trigger === 'day' ? (rule.day ?? 1) : (rule.playerCount ?? 2)}
                    onChange={(event) =>
                      updateRule(
                        rule.id,
                        rule.trigger === 'day'
                          ? { day: numberValue(event.target.value, 1) }
                          : { playerCount: numberValue(event.target.value, 2) }
                      )
                    }
                  />
                </label>
                <label>
                  Competition
                  <select
                    value={rule.competition}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        competition: event.target.value as GameManagerRule['competition'],
                      })
                    }
                  >
                    <option value="any">Any</option>
                    <option value="LOH">LOH</option>
                    <option value="POS">POS</option>
                  </select>
                </label>
                <label>
                  Game choice
                  <select
                    value={rule.selection}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        selection: event.target.value as GameManagerRule['selection'],
                      })
                    }
                  >
                    <option value="random">Random game</option>
                    <option value="category">Category</option>
                    <option value="game">Exact game</option>
                  </select>
                </label>
                {rule.selection === 'category' && (
                  <label>
                    Category
                    <select
                      value={rule.category ?? 'arcade'}
                      onChange={(event) =>
                        updateRule(rule.id, { category: event.target.value as GameCategory })
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {rule.selection === 'game' && (
                  <label>
                    Exact game
                    <select
                      value={rule.gameKey ?? games[0]?.key ?? ''}
                      onChange={(event) => updateRule(rule.id, { gameKey: event.target.value })}
                    >
                      {games.map((game) => (
                        <option value={game.key} key={game.key}>
                          {game.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Winner
                  <select
                    value={rule.outcome}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        outcome: event.target.value as GameManagerRule['outcome'],
                      })
                    }
                  >
                    <option value="play">Play normally</option>
                    <option value="random">Random winner</option>
                    <option value="player">Specific player ID</option>
                  </select>
                </label>
                {rule.outcome === 'player' && (
                  <label>
                    Winner player ID
                    <input
                      value={rule.winnerId ?? ''}
                      onChange={(event) => updateRule(rule.id, { winnerId: event.target.value })}
                    />
                  </label>
                )}
                <label>
                  Priority
                  <input
                    type="number"
                    min="-1000"
                    max="1000"
                    value={rule.priority}
                    onChange={(event) =>
                      updateRule(rule.id, { priority: numberValue(event.target.value, 0) })
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </section>
      )}

      {section === 'social' && (
        <section className="remote-manager__card">
          <h2>Social Manager</h2>
          <p>
            Tune the most common Social and Drama limits. Advanced content remains available in the
            JSON tab.
          </p>
          <div className="remote-manager__grid">
            <label>
              Normal weekly energy
              <input
                type="number"
                min="1"
                max="50"
                value={economy.normal?.weeklyEnergy ?? 5}
                onChange={(event) =>
                  updateEconomy('normal', 'weeklyEnergy', numberValue(event.target.value, 5))
                }
              />
            </label>
            <label>
              Normal energy cap
              <input
                type="number"
                min="1"
                max="100"
                value={economy.normal?.energyCap ?? 5}
                onChange={(event) =>
                  updateEconomy('normal', 'energyCap', numberValue(event.target.value, 5))
                }
              />
            </label>
            <label>
              Drama weekly energy
              <input
                type="number"
                min="1"
                max="50"
                value={economy.drama?.weeklyEnergy ?? 10}
                onChange={(event) =>
                  updateEconomy('drama', 'weeklyEnergy', numberValue(event.target.value, 10))
                }
              />
            </label>
            <label>
              Drama energy cap
              <input
                type="number"
                min="1"
                max="100"
                value={economy.drama?.energyCap ?? 30}
                onChange={(event) =>
                  updateEconomy('drama', 'energyCap', numberValue(event.target.value, 30))
                }
              />
            </label>
            <label>
              Revision note
              <input
                value={social.revision ?? ''}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    social: {
                      ...current.social,
                      revision: event.target.value,
                    } as SocialRuntimeOverride,
                  }))
                }
              />
            </label>
          </div>
          <hr className="remote-manager__divider" />
          <div className="remote-manager__heading-row">
            <div>
              <h3>Action catalog</h3>
              <p>
                This is the remotely applied version of the local Social Manager. Central overrides
                take precedence over each player’s local action settings while enabled.
              </p>
            </div>
            <label className="remote-manager__check">
              <input
                type="checkbox"
                checked={socialManager.enabled ?? false}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    socialManager: { ...current.socialManager, enabled: event.target.checked },
                  }))
                }
              />
              Use central action settings
            </label>
          </div>
          {selectedSocialAction && (
            <div className="remote-manager__social-editor">
              <label>
                Choose action
                <select
                  value={selectedSocialAction.id}
                  onChange={(event) => {
                    setSocialActionId(event.target.value)
                    setSocialActionJson(
                      JSON.stringify(
                        socialManager.actionOverrides?.[event.target.value] ?? {},
                        null,
                        2
                      )
                    )
                  }}
                >
                  <option value="">Choose an action</option>
                  {remoteActions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.title} · {action.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="remote-manager__grid">
                <label>
                  Display title
                  <input
                    value={selectedSocialAction.title}
                    onChange={(event) =>
                      updateSocialAction(selectedSocialAction.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="remote-manager__check">
                  <input
                    type="checkbox"
                    checked={selectedSocialAction.enabled !== false}
                    onChange={(event) =>
                      updateSocialAction(selectedSocialAction.id, { enabled: event.target.checked })
                    }
                  />
                  Action enabled
                </label>
                <label className="remote-manager__wide">
                  Description
                  <textarea
                    rows={3}
                    value={selectedSocialAction.description ?? ''}
                    onChange={(event) =>
                      updateSocialAction(selectedSocialAction.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Full action override JSON
                <textarea
                  className="remote-manager__json remote-manager__json--short"
                  rows={10}
                  value={
                    socialActionJson ||
                    JSON.stringify(
                      socialManager.actionOverrides?.[selectedSocialAction.id] ?? {},
                      null,
                      2
                    )
                  }
                  onChange={(event) => setSocialActionJson(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = sanitiseSocialActionOverrides({
                      [selectedSocialAction.id]: JSON.parse(socialActionJson || '{}'),
                    })
                    updateSocialActions({ ...socialManager.actionOverrides, ...parsed })
                    setStatus(
                      `${selectedSocialAction.title} action override validated and applied.`
                    )
                  } catch {
                    setStatus('That action JSON is not valid.')
                  }
                }}
              >
                Validate and apply this action
              </button>
            </div>
          )}
        </section>
      )}

      {section === 'tutorial' && (
        <section className="remote-manager__card remote-manager__tutorial">
          <h2>How remote changes reach the real game</h2>
          <p>
            This screen is your central production desk. Nothing changes for players until you
            publish the draft.
          </p>
          <ol>
            <li>
              <strong>Edit a manager tab.</strong> Broadcast edits update template messages and
              custom phase lines; Music edits update remote tracks and phase score; Game edits
              update future competition scheduling; Social edits update rules and action
              definitions.
            </li>
            <li>
              <strong>Review your draft.</strong> Use Advanced JSON if you need a field not shown in
              the form. “Validate and apply” removes unsafe or unsupported values.
            </li>
            <li>
              <strong>Open Publish.</strong> Enter a fine-grained GitHub token for this repository
              only. The token lives only in this browser tab.
            </li>
            <li>
              <strong>Choose Create review PR.</strong> This is the normal workflow: review the
              generated JSON change on GitHub and merge it when ready. Use direct publishing only
              for an urgent live notice.
            </li>
            <li>
              <strong>GitHub Pages deploys the JSON.</strong> After the workflow finishes, the
              public endpoint changes. A player opening the game reads it immediately; an
              already-open game checks again every five minutes.
            </li>
          </ol>
          <h3>Examples</h3>
          <ul>
            <li>
              <strong>Emergency announcement:</strong> Broadcast → enable the global alert → write
              title/message → Publish. Set an end time so it removes itself automatically.
            </li>
            <li>
              <strong>Change a ceremony song:</strong> Music → Phase score assignments → choose the
              phase and a track → Publish. The bundled song remains the fallback if an external URL
              fails.
            </li>
            <li>
              <strong>Schedule a specific LOH game:</strong> Game → Add rule → Day, LOH, Exact game
              → Publish. The rule applies when the matching competition is created.
            </li>
            <li>
              <strong>Disable or rename a social action:</strong> Social → enable central action
              settings → choose the action → change its fields or full JSON → Validate and apply →
              Publish.
            </li>
            <li>
              <strong>Edit a phase broadcast:</strong> Broadcast → enable central phase broadcasts →
              choose a phase → change the exact template text or add a custom line → Publish.
            </li>
          </ul>
          <p className="remote-manager__notice">
            <strong>Important:</strong> remote controls are data only. They cannot execute code. If
            a remote file is unavailable or invalid, the game uses its last valid cached
            configuration and then bundled defaults.
          </p>
        </section>
      )}

      {section === 'json' && (
        <section className="remote-manager__card">
          <h2>Advanced JSON</h2>
          <p>
            Use this for manager fields that are not in the quick forms. Invalid and unknown fields
            are removed when applied.
          </p>
          <textarea
            className="remote-manager__json"
            value={jsonDraft}
            rows={28}
            spellCheck={false}
            onChange={(event) => setJsonDraft(event.target.value)}
          />
          <button type="button" onClick={applyJson}>
            Validate and apply JSON
          </button>
        </section>
      )}

      {section === 'publish' && (
        <section className="remote-manager__card">
          <h2>Publish to GitHub Pages</h2>
          <p>
            Use a fine-grained token limited to this repository. It needs Contents read/write;
            creating a PR also needs Pull requests read/write. The token is kept only in this tab.
          </p>
          <div className="remote-manager__grid">
            <label>
              Repository owner
              <input
                value={target.owner}
                onChange={(event) => setTarget({ ...target, owner: event.target.value })}
              />
            </label>
            <label>
              Repository
              <input
                value={target.repo}
                onChange={(event) => setTarget({ ...target, repo: event.target.value })}
              />
            </label>
            <label>
              Base branch
              <input
                value={target.branch}
                onChange={(event) => setTarget({ ...target, branch: event.target.value })}
              />
            </label>
            <label>
              Config path
              <input
                value={target.path}
                onChange={(event) => setTarget({ ...target, path: event.target.value })}
              />
            </label>
            <label className="remote-manager__wide">
              Fine-grained GitHub token
              <input
                type="password"
                value={token}
                autoComplete="off"
                placeholder="github_pat_…"
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
          </div>
          <div className="remote-manager__publish-actions">
            <button type="button" disabled={busy} onClick={() => void publish('pr')}>
              Create review PR
            </button>
            <button
              type="button"
              className="remote-manager__danger"
              disabled={busy}
              onClick={() =>
                window.confirm(
                  'Publish directly to main? This starts the live deployment immediately.'
                ) && void publish('direct')
              }
            >
              Publish directly to main
            </button>
          </div>
          <p className="remote-manager__endpoint">
            Live endpoint:{' '}
            <a href={DEFAULT_REMOTE_CONFIG_URL} target="_blank" rel="noreferrer">
              {DEFAULT_REMOTE_CONFIG_URL}
            </a>
          </p>
        </section>
      )}
    </main>
  )
}
