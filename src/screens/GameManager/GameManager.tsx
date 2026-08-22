import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { getAllGames, type GameCategory } from '../../minigames/registry'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setGameUX } from '../../store/settingsSlice'
import { isDebugAccessGranted } from '../../utils/debugMode'
import {
  DEFAULT_GAME_MANAGER_CONFIG,
  describeGameManagerRule,
  type GameManagerRule,
} from '../../gameManager/gameManager'
import './GameManager.css'
import ManagerPublishBar from '../../components/ManagerPublishBar/ManagerPublishBar'
import { selectRemoteConfig } from '../../remoteConfig/remoteConfigSlice'

const CATEGORIES: GameCategory[] = ['arcade', 'logic', 'trivia', 'endurance']

function newRule(day: number): GameManagerRule {
  return {
    id: `game-rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    priority: 100,
    trigger: 'day',
    day,
    competition: 'any',
    selection: 'random',
    outcome: 'play',
  }
}

export default function GameManager() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const config = useAppSelector((state) => state.settings.gameUX.gameManager)
  const hasAccess = isDebugAccessGranted(searchParams, window.location.hostname)
  const games = useMemo(() => getAllGames().filter((entry) => !entry.retired), [])
  const remoteConfig = useAppSelector(selectRemoteConfig)
  const [selectedRuleGame, setSelectedRuleGame] = useState(games[0]?.key ?? '')
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, { description: string; instructions: string[] }>>({})
  const activePlayers = useMemo(
    () => game.players.filter((player) => player.status === 'active'),
    [game.players]
  )
  const selectedRuleEntry = games.find((entry) => entry.key === selectedRuleGame) ?? games[0]
  const selectedRule = selectedRuleEntry
    ? ruleDrafts[selectedRuleEntry.key] ?? remoteConfig?.rulesManager?.games?.[selectedRuleEntry.key] ?? selectedRuleEntry
    : null
  const saveRuleDraft = (description: string, instructions: string[]) => {
    if (!selectedRuleEntry) return
    setRuleDrafts((current) => ({ ...current, [selectedRuleEntry.key]: { description, instructions } }))
  }

  if (!hasAccess) return <Navigate to="/" replace />

  const save = (rules: GameManagerRule[], enabled = config.enabled) => {
    dispatch(setGameUX({ gameManager: { enabled, rules } }))
  }
  const update = (id: string, changes: Partial<GameManagerRule>) =>
    save(config.rules.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)))

  return (
    <main className="game-manager">
      <header className="game-manager__header">
        <div>
          <p className="game-manager__eyebrow">Producer controls · Day {game.week}</p>
          <h1>Game Manager</h1>
          <p>
            Schedule the exact competition experience by day or remaining-player count. Rules are
            evaluated by priority; system twists always keep their safety and format precedence.
          </p>
        </div>
        <button
          type="button"
          className="game-manager__back"
          onClick={() => navigate('/game?debug=1')}
        >
          Back to game
        </button>
      </header>
      <ManagerPublishBar
        managerName="Game Manager"
        exportFileName="game-manager-remote-config.json"
        getPatch={() => ({
          gameManager: { enabled: config.enabled, rules: config.rules },
          ...(Object.keys(ruleDrafts).length ? { rulesManager: { enabled: true, games: ruleDrafts } } : {}),
        })}
      />

      <section className="game-manager__rules-editor" aria-label="Rules Manager">
        <div className="game-manager__rule-heading"><div><h2>Rules Manager</h2><p>Edit the player-facing rules modal for one or more games, then publish them with the controls above.</p></div><strong>{Object.keys(ruleDrafts).length} changed</strong></div>
        {selectedRule && selectedRuleEntry && <>
          <label>Game<select value={selectedRuleEntry.key} onChange={(event) => setSelectedRuleGame(event.target.value)}>{games.map((entry) => <option key={entry.key} value={entry.key}>{entry.title}</option>)}</select></label>
          <label>Description<textarea rows={3} value={selectedRule.description ?? ''} onChange={(event) => saveRuleDraft(event.target.value, selectedRule.instructions ?? [])} /></label>
          <label>How to play <small>One instruction per line</small><textarea rows={8} value={(selectedRule.instructions ?? []).join('\n')} onChange={(event) => saveRuleDraft(selectedRule.description ?? '', event.target.value.split('\n'))} /></label>
        </>}
      </section>

      <section className="game-manager__safety" aria-label="Rule priority">
        <strong>Priority protection</strong>
        <span>
          Democracia replaces the LOH competition on its active day. Ineligible players, roster
          limits, expansion formats, and debug overrides are also respected before a schedule rule.
        </span>
      </section>

      <section className="game-manager__controls">
        <label className="game-manager__switch">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => save(config.rules, event.target.checked)}
          />
          Enable scheduled competition controls
        </label>
        <div>
          <button
            type="button"
            className="game-manager__primary"
            onClick={() => save([...config.rules, newRule(game.week)])}
          >
            Add rule
          </button>
          <button type="button" onClick={() => save([])} disabled={config.rules.length === 0}>
            Clear rules
          </button>
          <button
            type="button"
            onClick={() => dispatch(setGameUX({ gameManager: DEFAULT_GAME_MANAGER_CONFIG }))}
          >
            Reset manager
          </button>
        </div>
      </section>

      {config.rules.length === 0 ? (
        <section className="game-manager__empty">
          <h2>No scheduled rules yet</h2>
          <p>
            Add a rule for a day or a player count. With no matching rule, the normal campaign
            scheduler stays in charge.
          </p>
        </section>
      ) : (
        <section className="game-manager__rules" aria-label="Competition schedule rules">
          {config.rules
            .slice()
            .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
            .map((rule) => (
              <article
                className={rule.enabled ? 'game-manager__rule' : 'game-manager__rule is-disabled'}
                key={rule.id}
              >
                <div className="game-manager__rule-heading">
                  <label className="game-manager__switch">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => update(rule.id, { enabled: event.target.checked })}
                    />
                    {describeGameManagerRule(rule)}
                  </label>
                  <button
                    type="button"
                    className="game-manager__danger"
                    onClick={() => save(config.rules.filter((entry) => entry.id !== rule.id))}
                  >
                    Remove
                  </button>
                </div>

                <div className="game-manager__grid">
                  <label>
                    When
                    <select
                      value={rule.trigger}
                      onChange={(event) =>
                        update(rule.id, {
                          trigger: event.target.value as GameManagerRule['trigger'],
                          ...(event.target.value === 'day'
                            ? { day: game.week }
                            : { playerCount: activePlayers.length }),
                        })
                      }
                    >
                      <option value="day">On day</option>
                      <option value="players">At player count</option>
                    </select>
                  </label>
                  <label>
                    {rule.trigger === 'day' ? 'Day' : 'Players remaining'}
                    <input
                      type="number"
                      min={rule.trigger === 'day' ? 1 : 2}
                      max={50}
                      value={
                        rule.trigger === 'day'
                          ? (rule.day ?? game.week)
                          : (rule.playerCount ?? activePlayers.length)
                      }
                      onChange={(event) =>
                        update(
                          rule.id,
                          rule.trigger === 'day'
                            ? { day: Math.max(1, Number(event.target.value) || 1) }
                            : { playerCount: Math.max(2, Number(event.target.value) || 2) }
                        )
                      }
                    />
                  </label>
                  <label>
                    Competition
                    <select
                      value={rule.competition}
                      onChange={(event) =>
                        update(rule.id, {
                          competition: event.target.value as GameManagerRule['competition'],
                        })
                      }
                    >
                      <option value="any">LOH or POS</option>
                      <option value="LOH">LOH</option>
                      <option value="POS">Power of Safety</option>
                    </select>
                  </label>
                  <label>
                    Priority
                    <input
                      type="number"
                      value={rule.priority}
                      onChange={(event) =>
                        update(rule.id, { priority: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                </div>

                <div className="game-manager__grid">
                  <label>
                    Game selection
                    <select
                      value={rule.selection}
                      onChange={(event) =>
                        update(rule.id, {
                          selection: event.target.value as GameManagerRule['selection'],
                        })
                      }
                    >
                      <option value="random">Random eligible game</option>
                      <option value="category">Random from type</option>
                      <option value="game">Specific minigame</option>
                    </select>
                  </label>
                  {rule.selection === 'category' && (
                    <label>
                      Game type
                      <select
                        value={rule.category ?? 'arcade'}
                        onChange={(event) =>
                          update(rule.id, { category: event.target.value as GameCategory })
                        }
                      >
                        {CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {rule.selection === 'game' && (
                    <label className="game-manager__wide">
                      Minigame
                      <select
                        value={rule.gameKey ?? ''}
                        onChange={(event) => update(rule.id, { gameKey: event.target.value })}
                      >
                        <option value="">Choose an eligible minigame</option>
                        {games.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.title} · {entry.category}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Results control
                    <select
                      value={rule.outcome}
                      onChange={(event) =>
                        update(rule.id, {
                          outcome: event.target.value as GameManagerRule['outcome'],
                        })
                      }
                    >
                      <option value="play">Play normally</option>
                      <option value="random">Random winner after game</option>
                      <option value="player">Force winner</option>
                    </select>
                  </label>
                  {rule.outcome === 'player' && (
                    <label>
                      Winner
                      <select
                        value={rule.winnerId ?? ''}
                        onChange={(event) => update(rule.id, { winnerId: event.target.value })}
                      >
                        <option value="">Choose an active player</option>
                        {activePlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </article>
            ))}
        </section>
      )}
    </main>
  )
}
