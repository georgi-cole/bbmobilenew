import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  setPhase,
  forceHoH,
  forceNominees,
  forcePovWinner,
  forcePlayerStatus,
  prepareVoxFinalThreeTest,
  prepareClassicFinalThreeTest,
  forcePhase,
  finalizeFinal4Eviction,
  clearBlockingFlags,
  resetGame,
  rerollSeed,
  skipMinigame,
  fastForwardToEviction,
  simulateImmediateEliminationCycle,
  startMinigame,
  queueForcedShock,
  clearForcedShock,
  completeMission,
  activateCupidArrowNow,
  setCupidArrowSchedule,
  breakCupidArrowNow,
  activateVoxPopuliNow,
  setVoxPopuliSchedule,
  addTvEvent,
} from '../../store/gameSlice'
import { DEFAULT_SETTINGS, setSim } from '../../store/settingsSlice'
import {
  clearIncomingInteractionLogs,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  selectIncomingInteractionLogs,
  updateSocialMemory,
} from '../../social/socialSlice'
import { autoResolveExpiredIncomingInteractionsForWeek } from '../../social/incomingInteractions'
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler'
import { INCOMING_INTERACTION_PHASE_ORDER } from '../../social/incomingInteractionPhases'
import { socialConfig } from '../../social/socialConfig'
import FinaleDebugControls from './FinaleControls.debug'
import MinigameDebugControls from './MinigameDebugControls'
import SurvivorDebugControls from './SurvivorDebugControls'
import DebugDiagnostics from './DebugDiagnostics'
import SimulationDebugControls from './SimulationDebugControls'
import { isDebugAccessGranted, persistDebugAccess } from '../../utils/debugMode'
import type { ForcedShockType, Phase } from '../../types'
import type { IncomingInteraction, IncomingInteractionType } from '../../social/types'
import { selectDebugExpansionUnlocks, setDebugExpansionUnlock } from '../../store/uiSlice'
import {
  activateDepressionShockForDebug,
  setDepressionShockStageForDebug,
} from '../../features/twists/depressionShock'
import './DebugPanel.css'

const PHASES: Phase[] = [
  'season_start',
  'week_start',
  'loh_comp_announcement',
  'loh_comp',
  'loh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pos_comp_announcement',
  'pos_comp',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
  'final4_eviction',
  'final3',
  'final3_comp1',
  'final3_comp2',
  'final3_comp3',
  'final3_decision',
  'jury_announcement',
  'jury_cinematic',
  'jury',
]

const INCOMING_TYPES: IncomingInteractionType[] = [
  'compliment',
  'gossip',
  'warning',
  'alliance_proposal',
  'deal_offer',
  'nomination_plea',
  'check_in',
  'snide_remark',
  'other',
]

const INCOMING_TEXT: Record<IncomingInteractionType, string[]> = {
  compliment: ['Your speech was iconic tonight.', 'You handled that ceremony like a pro.'],
  gossip: [
    'Everyone is whispering about the next targets.',
    'There is a rumor about the Safety decision.',
  ],
  warning: ['Be careful — eyes are on your alliances.', 'Watch out for the vote split tonight.'],
  alliance_proposal: ['Want to lock in something solid?', 'Let’s ride this out together.'],
  deal_offer: ['If you keep me safe, I owe you.', 'Let’s make a quiet side deal.'],
  nomination_plea: ['Please don’t nominate me.', 'I’ll do anything to stay safe.'],
  check_in: ['How are you feeling about the week?', 'Checking in — you okay?'],
  snide_remark: ['Nice move… if it actually works.', 'Bold choice. Hope it pays off.'],
  other: ['We need to talk later.', 'Just wanted to say hey.'],
}

const INCOMING_BATCH_SIZE = 6
const FORCED_SHOCK_OPTIONS: Array<{ value: ForcedShockType; label: string }> = [
  { value: 'doubleEviction', label: 'Double Elimination' },
  { value: 'dayStartShock', label: 'Morning Shock' },
  { value: 'battleBack', label: 'Back 2 the Game' },
  { value: 'vip', label: 'Double Trouble Safety' },
  { value: 'diamond', label: 'Halo Exchange Safety' },
  { value: 'coup', label: 'Detox Safety' },
  { value: 'spotlight', label: 'Force Majeure Safety' },
  { value: 'democracia', label: 'Democracia' },
  { value: 'twinShock', label: 'Twin Shock' },
  { value: 'depressionShock', label: 'Depression Shock' },
]

let incomingSeedCounter = 0

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

function interactionRequiresResponse(type: IncomingInteractionType): boolean {
  return type === 'alliance_proposal' || type === 'deal_offer' || type === 'nomination_plea'
}

function buildIncomingInteraction(
  fromId: string,
  week: number,
  overrides: { type?: IncomingInteractionType; expiresAtWeek?: number } = {}
): IncomingInteraction {
  const type = overrides.type ?? pickRandom(INCOMING_TYPES)
  const text = pickRandom(INCOMING_TEXT[type])
  const now = Date.now()
  const canUseUuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  const id = canUseUuid ? crypto.randomUUID() : `incoming-${now}-${incomingSeedCounter++}`
  return {
    id,
    fromId,
    type,
    text,
    createdAt: now,
    createdWeek: week,
    expiresAtWeek: overrides.expiresAtWeek ?? week + 1,
    read: false,
    requiresResponse: interactionRequiresResponse(type),
    resolved: false,
  }
}

function buildScheduledInteraction(
  fromId: string,
  week: number,
  phase: string,
  type: IncomingInteractionType
) {
  const interaction = buildIncomingInteraction(fromId, week, { type, expiresAtWeek: week + 1 })
  return {
    interaction,
    priority: getIncomingInteractionPriority(type),
    scheduledAt: Date.now(),
    scheduledForWeek: week,
    scheduledForPhase: phase,
    deliveryReason: 'debug_seed',
  }
}

export default function DebugPanel() {
  const [searchParams] = useSearchParams()
  const isPhonePreview =
    searchParams.get('phonePreview') === 'true' || window.name.startsWith('phone-preview:')
  const isE2E = (window as { __E2E__?: boolean }).__E2E__ === true
  const isDebug = isE2E || isDebugAccessGranted(searchParams, window.location.hostname)

  useEffect(() => {
    if (!isPhonePreview && searchParams.get('debug') === '1' && searchParams.get('qa') === '1') {
      persistDebugAccess()
    }
  }, [isPhonePreview, searchParams])

  if (!isDebug || isPhonePreview) return null

  return <DebugPanelContent searchParams={searchParams} />
}

function DebugPanelContent({ searchParams }: { searchParams: URLSearchParams }) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const settings = useAppSelector((s) => s.settings ?? DEFAULT_SETTINGS)
  const incomingLogs = useAppSelector(selectIncomingInteractionLogs)
  const debugExpansionUnlocks = useAppSelector(selectDebugExpansionUnlocks)

  const [isOpen, setIsOpen] = useState(true)
  const [selectedPhase, setSelectedPhase] = useState<Phase>(game.phase)
  const [selectedHoH, setSelectedHoH] = useState('')
  const [nominee1, setNominee1] = useState('')
  const [nominee2, setNominee2] = useState('')
  const [selectedPov, setSelectedPov] = useState('')
  const [selectedStatusPlayer, setSelectedStatusPlayer] = useState('')
  const [selectedF4Evictee, setSelectedF4Evictee] = useState('')
  const [selectedForcedShock, setSelectedForcedShock] = useState<ForcedShockType>('doubleEviction')
  const [cupidSeasonInput, setCupidSeasonInput] = useState(
    settings.sim.cupidArrowSeasonOverride?.toString() ?? ''
  )
  const [voxSeasonInput, setVoxSeasonInput] = useState(
    settings.sim.voxPopuliSeasonOverride?.toString() ?? ''
  )

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setIsOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const jumpToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
  const evicted = game.players.filter((p) => p.status === 'evicted' || p.status === 'jury')
  const humanPlayer = game.players.find((p) => p.isUser)
  const aiPlayers = alive.filter((p) => !p.isUser)

  const hohName = game.lohId
    ? (game.players.find((p) => p.id === game.lohId)?.name ?? game.lohId)
    : '—'
  const povName = game.posWinnerId
    ? (game.players.find((p) => p.id === game.posWinnerId)?.name ?? game.posWinnerId)
    : '—'
  const nomineeNames = game.nomineeIds.length
    ? game.nomineeIds.map((id) => game.players.find((p) => p.id === id)?.name ?? id).join(', ')
    : '—'

  // Players eligible to be evicted in Final4 (current nominees)
  const f4Nominees = game.players.filter((p) => game.nomineeIds.includes(p.id))
  const canSeedInteraction = aiPlayers.length > 0 && !!humanPlayer
  const memoryCaps = socialConfig.socialMemoryConfig.caps

  function handleSeedIncomingInteraction() {
    if (!canSeedInteraction || !humanPlayer) return
    const fromPlayer = pickRandom(aiPlayers)
    dispatch(pushIncomingInteraction(buildIncomingInteraction(fromPlayer.id, game.week)))
  }

  function handleSeedIncomingBatch() {
    if (!canSeedInteraction || !humanPlayer) return
    const batchSize = Math.min(INCOMING_BATCH_SIZE, aiPlayers.length * 2)
    for (let i = 0; i < batchSize; i += 1) {
      const fromPlayer = pickRandom(aiPlayers)
      dispatch(pushIncomingInteraction(buildIncomingInteraction(fromPlayer.id, game.week)))
    }
  }

  function handleScheduleBusyWeek() {
    if (!canSeedInteraction || !humanPlayer) return
    INCOMING_INTERACTION_PHASE_ORDER.forEach((phase) => {
      const fromPlayer = pickRandom(aiPlayers)
      const type = pickRandom(INCOMING_TYPES)
      dispatch(
        scheduleIncomingInteraction(
          buildScheduledInteraction(fromPlayer.id, game.week, phase, type)
        )
      )
    })
  }

  function handleAutoResolveIgnored() {
    dispatch(autoResolveExpiredIncomingInteractionsForWeek(game.week + 1))
  }

  function handleBoostTrust() {
    if (!humanPlayer) return
    aiPlayers.forEach((player) => {
      dispatch(
        updateSocialMemory({
          actorId: player.id,
          targetId: humanPlayer.id,
          deltas: {
            gratitude: memoryCaps.gratitude,
            trustMomentum: memoryCaps.trustMomentum,
          },
        })
      )
    })
  }

  function handleBoostResentment() {
    if (!humanPlayer) return
    aiPlayers.forEach((player) => {
      dispatch(
        updateSocialMemory({
          actorId: player.id,
          targetId: humanPlayer.id,
          deltas: {
            resentment: memoryCaps.resentment,
            neglect: memoryCaps.neglect,
            trustMomentum: -memoryCaps.trustMomentum,
          },
        })
      )
    })
  }

  function handleClearInteractionLogs() {
    dispatch(clearIncomingInteractionLogs())
  }

  function handleQueueForcedShock() {
    dispatch(queueForcedShock(selectedForcedShock))
  }

  function handleActivateDepressionShock() {
    activateDepressionShockForDebug(game.gameId, game.week)
    dispatch(
      addTvEvent({
        type: 'twist',
        text: 'Depression Shock activated for debug testing.',
        channels: ['mainLog'],
        meta: { debug: true, suppressTv: true },
      })
    )
  }

  function handleDepressionShockStage(stage: 'day2' | 'recovery') {
    setDepressionShockStageForDebug(game.gameId, game.week, stage)
    dispatch(
      addTvEvent({
        type: 'twist',
        text: `Depression Shock ${stage === 'day2' ? 'Day 2' : 'recovery'} activated for debug testing.`,
        channels: ['mainLog'],
        meta: { debug: true, suppressTv: true },
      })
    )
  }

  function handleCupidSeasonSchedule() {
    const parsed = Number(cupidSeasonInput)
    const season = Number.isInteger(parsed) && parsed > 0 ? parsed : null
    dispatch(setSim({ cupidArrowSeasonOverride: season }))
    dispatch(setCupidArrowSchedule(season))
    setCupidSeasonInput(season?.toString() ?? '')
  }

  function handleVoxSeasonSchedule() {
    const parsed = Number(voxSeasonInput)
    const season = Number.isInteger(parsed) && parsed > 0 ? parsed : null
    dispatch(setSim({ voxPopuliSeasonOverride: season }))
    dispatch(setVoxPopuliSchedule(season))
    setVoxSeasonInput(season?.toString() ?? '')
  }

  return (
    <>
      <button
        className="dbg-fab"
        onClick={() => setIsOpen((o) => !o)}
        title="Toggle Debug Panel"
        aria-label="Toggle Debug Panel"
      >
        🐛
      </button>

      {isOpen && (
        <aside className="dbg-panel" aria-label="Debug Panel">
          <header className="dbg-panel__header">
            <span>QA Control Center</span>
            <button
              className="dbg-panel__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close Debug Panel"
            >
              ✕
            </button>
          </header>

          <nav className="dbg-panel__nav" aria-label="Debug categories">
            {[
              ['dbg-overview', 'Overview'],
              ['dbg-season', 'Season'],
              ['dbg-social', 'Social'],
              ['dbg-minigames', 'Games'],
              ['dbg-finale', 'Finale'],
              ['dbg-tools', 'Tools'],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => jumpToSection(id)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="dbg-panel__body">
            {/* ── Inspector ── */}
            <section className="dbg-section" id="dbg-overview">
              <h3 className="dbg-section__title">Inspector</h3>
              <dl className="dbg-grid">
                <dt>Day</dt> <dd>{game.week}</dd>
                <dt>Phase</dt> <dd>{game.phase}</dd>
                <dt>Seed</dt> <dd>{game.seed}</dd>
                <dt>LOH</dt> <dd>{hohName}</dd>
                <dt>Nominees</dt> <dd>{nomineeNames}</dd>
                <dt>POS Winner</dt> <dd>{povName}</dd>
                <dt>Replacement?</dt> <dd>{game.replacementNeeded ? 'yes' : 'no'}</dd>
                <dt>Minigame?</dt> <dd>{game.pendingMinigame ? game.pendingMinigame.key : '—'}</dd>
                <dt>Alive</dt> <dd>{alive.length}</dd>
                <dt>Evicted</dt> <dd>{evicted.length}</dd>
              </dl>
              <button
                className="dbg-btn dbg-btn--wide"
                type="button"
                onClick={() => navigate('/broadcast-manager?debug=1')}
              >
                {/* i18n-ignore: Debug-only navigation control intentionally uses canonical English */}
                Open Broadcast Manager
              </button>
              <button
                className="dbg-btn dbg-btn--wide"
                type="button"
                onClick={() => navigate('/game-manager?debug=1')}
              >
                {/* i18n-ignore: Debug-only navigation control intentionally uses canonical English */}
                Open Game Manager
              </button>
              <button
                className="dbg-btn dbg-btn--wide"
                type="button"
                onClick={() => navigate('/remote-manager?debug=1')}
              >
                {/* i18n-ignore: Debug-only navigation control intentionally uses canonical English */}
                Open Remote Manager
              </button>

              <details className="dbg-players">
                <summary>Players ({game.players.length})</summary>
                <ul className="dbg-player-list">
                  {game.players.map((p) => (
                    <li
                      key={p.id}
                      className={`dbg-player dbg-player--${p.status.replace('+', '-')}`}
                    >
                      {p.avatar} {p.name}
                      <span className="dbg-player__status">{p.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── Controls ── */}
            <section className="dbg-section" id="dbg-season">
              <h3 className="dbg-section__title">Controls</h3>

              <div className="dbg-row">
                <label className="dbg-label">Set Phase</label>
                <select
                  className="dbg-select"
                  value={selectedPhase}
                  onChange={(e) => setSelectedPhase(e.target.value as Phase)}
                >
                  {PHASES.map((ph) => (
                    <option key={ph} value={ph}>
                      {ph}
                    </option>
                  ))}
                </select>
                <button className="dbg-btn" onClick={() => dispatch(setPhase(selectedPhase))}>
                  Set
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(advance())}>
                  Advance Phase
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(fastForwardToEviction())}
                >
                  Fast-fwd → Eviction
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(simulateImmediateEliminationCycle())}
                >
                  Simulate Elimination Cycle
                </button>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force LOH</label>
                <select
                  className="dbg-select"
                  value={selectedHoH}
                  onChange={(e) => setSelectedHoH(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedHoH}
                  onClick={() => {
                    dispatch(forceHoH(selectedHoH))
                    setSelectedHoH('')
                  }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label">Force Nominees</label>
                <div className="dbg-row">
                  <select
                    className="dbg-select"
                    value={nominee1}
                    onChange={(e) => setNominee1(e.target.value)}
                  >
                    <option value="">— pick 1 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee2}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="dbg-select"
                    value={nominee2}
                    onChange={(e) => setNominee2(e.target.value)}
                  >
                    <option value="">— pick 2 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee1}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="dbg-btn"
                    disabled={!nominee1 || !nominee2}
                    onClick={() => {
                      dispatch(forceNominees([nominee1, nominee2]))
                      setNominee1('')
                      setNominee2('')
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force POS</label>
                <select
                  className="dbg-select"
                  value={selectedPov}
                  onChange={(e) => setSelectedPov(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedPov}
                  onClick={() => {
                    dispatch(forcePovWinner(selectedPov))
                    setSelectedPov('')
                  }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label">Player House Status</label>
                <select
                  aria-label="Player House Status"
                  className="dbg-select"
                  value={selectedStatusPlayer}
                  onChange={(e) => setSelectedStatusPlayer(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {game.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </option>
                  ))}
                </select>
                <div className="dbg-row">
                  <button
                    className="dbg-btn"
                    disabled={!selectedStatusPlayer}
                    onClick={() =>
                      dispatch(
                        forcePlayerStatus({ playerId: selectedStatusPlayer, status: 'jury' })
                      )
                    }
                  >
                    Set Tribunal
                  </button>
                  <button
                    className="dbg-btn"
                    disabled={!selectedStatusPlayer}
                    onClick={() =>
                      dispatch(
                        forcePlayerStatus({ playerId: selectedStatusPlayer, status: 'evicted' })
                      )
                    }
                  >
                    Set Pre-jury Evicted
                  </button>
                  <button
                    className="dbg-btn"
                    disabled={!selectedStatusPlayer}
                    onClick={() =>
                      dispatch(
                        forcePlayerStatus({ playerId: selectedStatusPlayer, status: 'active' })
                      )
                    }
                  >
                    Restore Active
                  </button>
                </div>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force Shock</label>
                <select
                  aria-label="Force Shock"
                  className="dbg-select"
                  value={selectedForcedShock}
                  onChange={(e) => setSelectedForcedShock(e.target.value as ForcedShockType)}
                >
                  {FORCED_SHOCK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="dbg-btn" onClick={handleQueueForcedShock}>
                  Queue
                </button>
                <button
                  className="dbg-btn"
                  onClick={() => dispatch(clearForcedShock())}
                  disabled={!game.pendingForcedShock}
                >
                  Clear
                </button>
                <button className="dbg-btn" type="button" onClick={handleActivateDepressionShock}>
                  Activate Depression Shock
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() => handleDepressionShockStage('day2')}
                >
                  Depression Day 2
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() => handleDepressionShockStage('recovery')}
                >
                  Depression Sunrise
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() => dispatch(activateCupidArrowNow())}
                  disabled={
                    game.cupidArrow?.status === 'active' ||
                    game.voxPopuli?.status === 'scheduled' ||
                    game.voxPopuli?.status === 'active'
                  }
                >
                  Activate Cupid
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() => dispatch(activateVoxPopuliNow())}
                  disabled={
                    game.voxPopuli?.status === 'active' ||
                    game.voxPopuli?.status === 'complete' ||
                    game.cupidArrow?.status === 'scheduled' ||
                    game.cupidArrow?.status === 'active'
                  }
                >
                  Activate Vox
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() =>
                    dispatch(
                      setDebugExpansionUnlock({
                        expansion: 'cupidArrow',
                        unlocked: !debugExpansionUnlocks.cupidArrow,
                      })
                    )
                  }
                >
                  {debugExpansionUnlocks.cupidArrow ? 'Lock Cupid Test' : 'Unlock Cupid Test'}
                </button>
                <button
                  className="dbg-btn"
                  type="button"
                  onClick={() =>
                    dispatch(
                      setDebugExpansionUnlock({
                        expansion: 'voxPopuli',
                        unlocked: !debugExpansionUnlocks.voxPopuli,
                      })
                    )
                  }
                >
                  {debugExpansionUnlocks.voxPopuli ? 'Lock Vox Test' : 'Unlock Vox Test'}
                </button>
              </div>

              {game.pendingForcedShock && (
                <div className="dbg-row">
                  <span className="dbg-label">Queued Shock</span>
                  <span>
                    {FORCED_SHOCK_OPTIONS.find(
                      (option) => option.value === game.pendingForcedShock?.type
                    )?.label ?? game.pendingForcedShock.type}{' '}
                    (earliest Day {game.pendingForcedShock.earliestWeek})
                  </span>
                </div>
              )}

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label" htmlFor="dbg-cupid-season">
                  Cupid&apos;s Arrow Season
                </label>
                <div className="dbg-row">
                  <input
                    id="dbg-cupid-season"
                    className="dbg-select"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="e.g. 3"
                    value={cupidSeasonInput}
                    onChange={(event) => setCupidSeasonInput(event.target.value)}
                  />
                  <button
                    className="dbg-btn"
                    type="button"
                    aria-label="Schedule Cupid season"
                    onClick={handleCupidSeasonSchedule}
                  >
                    Schedule
                  </button>
                  <button
                    className="dbg-btn"
                    type="button"
                    onClick={() => {
                      setCupidSeasonInput('')
                      dispatch(setSim({ cupidArrowSeasonOverride: null }))
                      dispatch(setCupidArrowSchedule(null))
                    }}
                  >
                    Disable
                  </button>
                </div>
                <span className="dbg-help">
                  {game.cupidArrow?.status === 'active'
                    ? `Active · ${game.cupidArrow.eliminatedPairCount}/4 pairs eliminated`
                    : game.cupidArrow?.status === 'broken'
                      ? 'Spell broken · individual game resumed'
                      : game.cupidArrow?.scheduledSeason
                        ? `Scheduled for Season ${game.cupidArrow.scheduledSeason}`
                        : 'Not scheduled'}
                </span>
                {game.cupidArrow?.status === 'active' && (
                  <button
                    className="dbg-btn dbg-btn--wide"
                    type="button"
                    onClick={() => dispatch(breakCupidArrowNow())}
                  >
                    Test Cupid Dissociation
                  </button>
                )}
              </div>

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label" htmlFor="dbg-vox-season">
                  Vox Populi Season
                </label>
                <div className="dbg-row">
                  <input
                    id="dbg-vox-season"
                    className="dbg-select"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="e.g. 4"
                    value={voxSeasonInput}
                    onChange={(event) => setVoxSeasonInput(event.target.value)}
                  />
                  <button
                    className="dbg-btn"
                    type="button"
                    aria-label="Schedule Vox season"
                    onClick={handleVoxSeasonSchedule}
                  >
                    Schedule
                  </button>
                  <button
                    className="dbg-btn"
                    type="button"
                    onClick={() => {
                      setVoxSeasonInput('')
                      dispatch(setSim({ voxPopuliSeasonOverride: null }))
                      dispatch(setVoxPopuliSchedule(null))
                    }}
                  >
                    Disable
                  </button>
                </div>
                <span className="dbg-help">
                  {game.voxPopuli?.status === 'active'
                    ? 'Active · audience-led format'
                    : game.voxPopuli?.status === 'complete'
                      ? 'Season complete'
                      : game.voxPopuli?.scheduledSeason
                        ? `Scheduled for Season ${game.voxPopuli.scheduledSeason}`
                        : 'Not scheduled'}
                </span>
              </div>

              <div className="dbg-row">
                {game.voxPopuli?.status !== 'active' && (
                  <button
                    className="dbg-btn dbg-btn--wide"
                    onClick={() => dispatch(prepareClassicFinalThreeTest())}
                  >
                    Prepare Classic Final 3 Test
                  </button>
                )}
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(prepareVoxFinalThreeTest())}
                  disabled={game.voxPopuli?.status !== 'active'}
                >
                  Prepare Vox Final 3 Test
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final4_eviction'))}
                >
                  Force Final 4
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3'))}
                >
                  Force Final 3
                </button>
              </div>

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp1'))}
                >
                  F3 Part 1
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp2'))}
                >
                  F3 Part 2
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp3'))}
                >
                  F3 Part 3
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_decision'))}
                >
                  F3 Decision
                </button>
              </div>

              {/* Final 4 eviction pick (debug) */}
              {game.phase === 'final4_eviction' && f4Nominees.length > 0 && (
                <div className="dbg-row">
                  <label className="dbg-label">F4 Evict</label>
                  <select
                    className="dbg-select"
                    value={selectedF4Evictee}
                    onChange={(e) => setSelectedF4Evictee(e.target.value)}
                  >
                    <option value="">— pick evictee —</option>
                    {f4Nominees.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="dbg-btn"
                    disabled={!selectedF4Evictee}
                    onClick={() => {
                      dispatch(finalizeFinal4Eviction(selectedF4Evictee))
                      setSelectedF4Evictee('')
                    }}
                  >
                    Evict
                  </button>
                  <button
                    className="dbg-btn"
                    onClick={() => {
                      dispatch(advance())
                    }}
                    title="⚠ Overrides human POS holder decision — for debug use only"
                  >
                    AI Pick ⚠
                  </button>
                </div>
              )}

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(clearBlockingFlags())}
                  title="Clears replacementNeeded / awaitingFinal3Eviction if the game gets stuck"
                >
                  Clear Stuck Flags
                </button>
              </div>

              {/* ── Minigame debug controls ── */}
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(skipMinigame())}
                  disabled={!game.pendingMinigame}
                  title="Dismiss the active TapRace overlay; winner will be picked randomly"
                >
                  Skip Minigame
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() =>
                    dispatch(
                      startMinigame({
                        key: 'TapRace',
                        participants: alive.map((p) => p.id),
                        seed: game.seed,
                        options: { timeLimit: 10 },
                      })
                    )
                  }
                  disabled={!!game.pendingMinigame}
                  title="Launch a standalone TapRace session for testing"
                >
                  Test TapRace
                </button>
              </div>

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(completeMission())}
                  disabled={game.secretMission?.status !== 'accepted'}
                  title="Complete every active Secret Mission task and reveal its reward"
                >
                  Complete Secret Mission
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(rerollSeed())}>
                  Re-roll Seed
                </button>
                <button
                  className="dbg-btn dbg-btn--wide dbg-btn--danger"
                  onClick={() => dispatch(resetGame())}
                >
                  Reset Season
                </button>
              </div>

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() =>
                    navigate({
                      pathname: '/settingsatiste',
                      search: searchParams.toString() ? `?${searchParams.toString()}` : '',
                    })
                  }
                >
                  Open Advanced Settings
                </button>
              </div>
            </section>

            <SimulationDebugControls />

            {/* ── Incoming Interaction Debugging ── */}
            <section className="dbg-section" id="dbg-social">
              <h3 className="dbg-section__title">Incoming Interactions</h3>
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleSeedIncomingInteraction}
                >
                  Seed Interaction
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleSeedIncomingBatch}
                >
                  Seed Busy Inbox
                </button>
              </div>
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleScheduleBusyWeek}
                >
                  Queue Busy Day
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={handleAutoResolveIgnored}>
                  Auto-resolve Ignored
                </button>
              </div>
              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={handleBoostTrust}>
                  Boost Trust
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={handleBoostResentment}>
                  Boost Resentment
                </button>
              </div>
              <details className="dbg-logs">
                <summary>Interaction Logs ({incomingLogs.length})</summary>
                <div className="dbg-row">
                  <button className="dbg-btn dbg-btn--wide" onClick={handleClearInteractionLogs}>
                    Clear Logs
                  </button>
                </div>
                <ul className="dbg-log-list">
                  {incomingLogs.slice(-12).map((entry) => (
                    <li key={entry.id} className="dbg-log">
                      <span className="dbg-log__stage">{entry.stage}</span>
                      <span className="dbg-log__reason">{entry.reason}</span>
                      <span className="dbg-log__meta">
                        {entry.actorId ?? 'unknown'}
                        {entry.type ? ` · ${entry.type}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── Finale Debug Controls ── */}
            <div id="dbg-finale">
              <FinaleDebugControls />
            </div>

            {/* ── Minigame Debug Controls ── */}
            <div id="dbg-minigames">
              <MinigameDebugControls />
            </div>

            {/* ── Survivor Debug Controls ── */}
            <SurvivorDebugControls />

            {/* ── Diagnostics, snapshots and centralized QA navigation ── */}
            <div id="dbg-tools">
              <DebugDiagnostics />
            </div>
          </div>
        </aside>
      )}
    </>
  )
}
