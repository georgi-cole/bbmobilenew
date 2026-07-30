import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { hydrateGame } from '../../store/gameSlice'
import { hydrateFinale } from '../../store/finaleSlice'
import { hydrateChallenge } from '../../store/challengeSlice'
import { hydrateSocial } from '../../social/socialSlice'
import { hydratePublicOpinion } from '../../publicOpinion/publicOpinionSlice'
import type { RootState } from '../../store/store'
import {
  getDiagnosticActionHistory,
  getLastGameDiagnostic,
} from '../../services/diagnostics/gameDiagnostics'
import { revokeDebugAccess } from '../../utils/debugMode'

const CHECKPOINT_KEY = 'bbmobilenew:debug-checkpoint:v1'
const SNAPSHOT_VERSION = 1

type DebugSnapshot = {
  version: typeof SNAPSHOT_VERSION
  exportedAt: string
  route: string
  state: Pick<
    RootState,
    'game' | 'finale' | 'challenge' | 'social' | 'publicOpinion' | 'settings' | 'vip'
  >
}

type HealthIssue = {
  severity: 'error' | 'warning'
  message: string
}

function buildSnapshot(state: RootState): DebugSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    route: `${window.location.pathname}${window.location.hash}`,
    state: {
      game: state.game,
      finale: state.finale,
      challenge: state.challenge,
      social: state.social,
      publicOpinion: state.publicOpinion,
      settings: state.settings,
      vip: state.vip,
    },
  }
}

function parseSnapshot(raw: string): DebugSnapshot {
  const parsed = JSON.parse(raw) as Partial<DebugSnapshot>
  if (
    parsed.version !== SNAPSHOT_VERSION ||
    !parsed.state ||
    !parsed.state.game ||
    !parsed.state.finale ||
    !parsed.state.social ||
    !parsed.state.challenge ||
    !parsed.state.publicOpinion
  ) {
    throw new Error('This is not a compatible debug snapshot.')
  }
  return parsed as DebugSnapshot
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function collectHealthIssues(state: RootState): HealthIssue[] {
  const { game, social } = state
  const issues: HealthIssue[] = []
  const playerIds = new Set(game.players.map((player) => player.id))
  const aliveIds = new Set(
    game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )

  if (game.players.filter((player) => player.isUser).length !== 1) {
    issues.push({ severity: 'error', message: 'The season must have exactly one human player.' })
  }
  if (new Set(game.players.map((player) => player.id)).size !== game.players.length) {
    issues.push({ severity: 'error', message: 'Duplicate player IDs exist.' })
  }
  if (game.lohId && !aliveIds.has(game.lohId)) {
    issues.push({ severity: 'error', message: 'The current LOH is not an active player.' })
  }
  if (game.posWinnerId && !aliveIds.has(game.posWinnerId)) {
    issues.push({ severity: 'error', message: 'The current POS winner is not active.' })
  }
  if (new Set(game.nomineeIds).size !== game.nomineeIds.length) {
    issues.push({ severity: 'error', message: 'The nominee list contains duplicates.' })
  }
  for (const nomineeId of game.nomineeIds) {
    if (!playerIds.has(nomineeId)) {
      issues.push({ severity: 'error', message: `Nominee ${nomineeId} does not exist.` })
    } else if (!aliveIds.has(nomineeId)) {
      issues.push({
        severity: 'error',
        message: `Nominee ${nomineeId} is already out of the house.`,
      })
    }
  }
  if (game.lohId && game.nomineeIds.includes(game.lohId)) {
    issues.push({ severity: 'error', message: 'The LOH is also nominated.' })
  }
  if (game.pendingMinigame) {
    for (const participantId of game.pendingMinigame.participants) {
      if (!playerIds.has(participantId)) {
        issues.push({
          severity: 'error',
          message: `Minigame participant ${participantId} does not exist.`,
        })
      }
    }
  }
  if (game.replacementNeeded && game.nomineeIds.length < 1) {
    issues.push({
      severity: 'warning',
      message: 'A replacement nominee is requested without an existing nominee.',
    })
  }
  if (game.phase.startsWith('final4') && aliveIds.size !== 4) {
    issues.push({
      severity: 'warning',
      message: `Final 4 flow currently has ${aliveIds.size} active players.`,
    })
  }
  if (game.phase.startsWith('final3') && aliveIds.size !== 3) {
    issues.push({
      severity: 'warning',
      message: `Final 3 flow currently has ${aliveIds.size} active players.`,
    })
  }
  for (const interaction of social.incomingInteractions ?? []) {
    if (!playerIds.has(interaction.fromId)) {
      issues.push({
        severity: 'warning',
        message: `Incoming interaction ${interaction.id} has an unknown sender.`,
      })
    }
  }
  return issues
}

export default function DebugDiagnostics() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useStore<RootState>()
  const state = useAppSelector((root) => root)
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const issues = useMemo(() => collectHealthIssues(state), [state])
  const simulation = state.social.realitySimulation
  const reality = state.social.reality
  const latestTrace = simulation.trace.at(-1)
  const actionHistory = getDiagnosticActionHistory()
  const lastError = getLastGameDiagnostic()

  const restoreSnapshot = (snapshot: DebugSnapshot) => {
    dispatch(hydrateGame(snapshot.state.game))
    dispatch(hydrateFinale(snapshot.state.finale))
    dispatch(hydrateChallenge(snapshot.state.challenge))
    dispatch(hydrateSocial(snapshot.state.social))
    dispatch(hydratePublicOpinion(snapshot.state.publicOpinion))
    setStatus(`Restored snapshot from ${new Date(snapshot.exportedAt).toLocaleString()}.`)
  }

  const handleCopyReport = async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      route: `${window.location.pathname}${window.location.hash}`,
      build: import.meta.env.MODE,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      health: issues,
      lastError,
      recentActions: actionHistory,
      state: buildSnapshot(store.getState()).state,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setStatus('Full diagnostic report copied.')
    } catch {
      downloadJson('big-eye-diagnostic.json', report)
      setStatus('Clipboard unavailable; downloaded the report instead.')
    }
  }

  const handleSaveCheckpoint = () => {
    try {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(buildSnapshot(store.getState())))
      setStatus('Checkpoint saved on this device.')
    } catch {
      setStatus('Checkpoint could not be saved; browser storage may be full.')
    }
  }

  const handleRestoreCheckpoint = () => {
    const raw = localStorage.getItem(CHECKPOINT_KEY)
    if (!raw) {
      setStatus('No checkpoint exists on this device.')
      return
    }
    if (!window.confirm('Replace the current campaign with the saved debug checkpoint?')) return
    try {
      restoreSnapshot(parseSnapshot(raw))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Checkpoint could not be restored.')
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const snapshot = parseSnapshot(await file.text())
      if (!window.confirm('Replace the current campaign with this imported debug snapshot?')) return
      restoreSnapshot(snapshot)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Snapshot import failed.')
    }
  }

  const toggleLayoutOverlay = () => {
    const enabled = localStorage.getItem('bbmobile:debugLayout') === '1'
    if (enabled) localStorage.removeItem('bbmobile:debugLayout')
    else localStorage.setItem('bbmobile:debugLayout', '1')
    setStatus(`Layout overlay ${enabled ? 'disabled' : 'enabled'}; reloading.`)
    window.setTimeout(() => window.location.reload(), 50)
  }

  const endQaSession = () => {
    revokeDebugAccess()
    navigate('/', { replace: true })
    window.setTimeout(() => window.location.reload(), 50)
  }

  return (
    <>
      <section className="dbg-section">
        <h3 className="dbg-section__title">State health</h3>
        <div
          className={`dbg-health ${issues.length === 0 ? 'dbg-health--ok' : 'dbg-health--issues'}`}
          role="status"
        >
          {issues.length === 0 ? 'All core state checks passed' : `${issues.length} issue(s) found`}
        </div>
        {issues.length > 0 && (
          <ul className="dbg-issue-list">
            {issues.map((issue, index) => (
              <li
                key={`${issue.message}-${index}`}
                className={`dbg-issue dbg-issue--${issue.severity}`}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        <dl className="dbg-grid">
          <dt>Build</dt>
          <dd>{import.meta.env.MODE}</dd>
          <dt>Online</dt>
          <dd>{navigator.onLine ? 'yes' : 'no'}</dd>
          <dt>Viewport</dt>
          <dd>
            {window.innerWidth}×{window.innerHeight} @ {window.devicePixelRatio}
          </dd>
          <dt>Last action</dt>
          <dd>{actionHistory.at(-1)?.type ?? '—'}</dd>
          <dt>Last error</dt>
          <dd>{lastError?.message ?? lastError?.reason ?? '—'}</dd>
        </dl>
      </section>

      <section className="dbg-section">
        <h3 className="dbg-section__title">Reality diagnostics</h3>
        <dl className="dbg-grid">
          <dt>RNG seed</dt>
          <dd>{simulation.rng?.seed ?? 'not set'}</dd>
          <dt>RNG draw</dt>
          <dd>{simulation.rng?.cursor ?? 0}</dd>
          <dt>Events</dt>
          <dd>{reality.events.length}</dd>
          <dt>Interactions</dt>
          <dd>{Object.keys(reality.interactions).length}</dd>
          <dt>Alliances</dt>
          <dd>{Object.keys(reality.alliances).length}</dd>
          <dt>Romances</dt>
          <dd>{Object.keys(reality.romances).length}</dd>
          <dt>Grievances</dt>
          <dd>{Object.keys(reality.grievances).length}</dd>
          <dt>Trace entries</dt>
          <dd>{simulation.trace.length}</dd>
          <dt>Last trace</dt>
          <dd>
            {latestTrace
              ? `${latestTrace.stage} · ${latestTrace.actionId ?? latestTrace.reason ?? 'no action'}`
              : '—'}
          </dd>
        </dl>
      </section>

      <section className="dbg-section">
        <h3 className="dbg-section__title">Snapshots & reports</h3>
        <div className="dbg-row">
          <button className="dbg-btn dbg-btn--wide" onClick={handleSaveCheckpoint}>
            Save Checkpoint
          </button>
          <button className="dbg-btn dbg-btn--wide" onClick={handleRestoreCheckpoint}>
            Restore Checkpoint
          </button>
        </div>
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() => {
              const snapshot = buildSnapshot(store.getState())
              downloadJson(`big-eye-debug-${Date.now()}.json`, snapshot)
              setStatus('Snapshot exported.')
            }}
          >
            Export Snapshot
          </button>
          <button className="dbg-btn dbg-btn--wide" onClick={() => fileRef.current?.click()}>
            Import Snapshot
          </button>
          <input
            ref={fileRef}
            className="dbg-file-input"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            aria-label="Import debug snapshot"
          />
        </div>
        <button className="dbg-btn dbg-btn--wide" onClick={handleCopyReport}>
          Copy Full Diagnostic Report
        </button>
      </section>

      <section className="dbg-section">
        <h3 className="dbg-section__title">QA tools</h3>
        <div className="dbg-row">
          <button className="dbg-btn dbg-btn--wide" onClick={() => navigate('/gamedebug')}>
            Open Minigame Auditor
          </button>
          <button className="dbg-btn dbg-btn--wide" onClick={() => navigate('/settingsatiste')}>
            Open Advanced Settings
          </button>
        </div>
        <div className="dbg-row">
          <button className="dbg-btn dbg-btn--wide" onClick={toggleLayoutOverlay}>
            Toggle Layout Overlay
          </button>
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() => downloadJson('big-eye-reality-trace.json', simulation.trace)}
          >
            Export Reality Trace
          </button>
        </div>
        <div className="dbg-row">
          {['/', '/game', '/diary-room', '/houseguests', '/week', '/settings'].map((route) => (
            <button key={route} className="dbg-btn" onClick={() => navigate(route)}>
              {route === '/' ? 'Home' : route.slice(1)}
            </button>
          ))}
        </div>
        <button className="dbg-btn dbg-btn--wide dbg-btn--danger" onClick={endQaSession}>
          End QA Session
        </button>
        <p className="dbg-help">
          Re-enable in a published build with <code>?debug=1&amp;qa=1</code>. Press Ctrl+Shift+D to
          open or close this panel anywhere in the app.
        </p>
      </section>

      {status && (
        <p className="dbg-status" role="status">
          {status}
        </p>
      )}
    </>
  )
}
