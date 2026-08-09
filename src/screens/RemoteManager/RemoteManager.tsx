import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { getAllGames, type GameCategory } from '../../minigames/registry'
import { MUSIC_TRACK_IDS, type CatalogMusicTrack } from '../../services/sound/musicCatalog'
import type { MusicTrackAssetOverride } from '../../services/sound/musicCatalog'
import type { SocialRuntimeOverride } from '../../social/socialRuntimeConfig'
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

type Section = 'broadcast' | 'music' | 'game' | 'social' | 'json' | 'publish'

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
    season: { music: { tracks: [] } },
    gameManager: { enabled: false, rules: [] },
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
  const gameManager = config.gameManager ?? { enabled: false, rules: [] }
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
        {(['broadcast', 'music', 'game', 'social', 'json', 'publish'] as Section[]).map((item) => (
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
        ))}
      </nav>

      {section === 'broadcast' && (
        <section className="remote-manager__card">
          <h2>Broadcast message</h2>
          <p>Active games refresh this file every five minutes. Date fields are optional.</p>
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
          <h2>Social economy</h2>
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
