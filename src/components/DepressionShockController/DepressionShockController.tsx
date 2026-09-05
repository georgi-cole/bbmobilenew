import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  buildDepressionShockDayContext,
  evaluateDepressionShockAtDayStart,
  getDepressionShockPresentation,
  getDepressionShockVisualPhase,
  isDepressionShockActiveOnDay,
  loadDepressionShockState,
  markDepressionShockPresentationSeen,
  saveDepressionShockState,
  setDepressionShockPortraitMode,
  setDepressionShockVisualPhase,
  type DepressionShockState,
} from '../../features/twists/depressionShock'
import {
  buildLegacyDepressionShockMirror,
  legacyDepressionShockMirrorEquals,
} from '../../features/twists/depressionShockLifecycle'
import DepressionShockRosterCinematic, {
  type DepressionShockCinematicKind,
} from './DepressionShockRosterCinematic'
import './DepressionShockController.css'

const INTRO_COPY =
  'A storm has settled over the hub. The rain will not let up, and a deep melancholy is changing how the players think, speak, and play.'
const DAY_TWO_COPY =
  'The rain continues. Today even the colour is draining from the hub. Every familiar room feels colder, flatter, and farther away.'
const END_COPY =
  'Morning light breaks through the clouds. Colour returns, familiar faces reappear, and the hub finally exhales. Depression Shock is over.'

const PHASE_BROADCASTS = [
  {
    visualPhase: 'day1',
    phase: 'social_1',
    templateId: 'depression-shock.day1-silence',
    text: 'The rain has swallowed the usual noise. Conversations start softly and end before anyone says what they mean.',
    major: 'depression_shock_melancholy',
  },
  {
    visualPhase: 'day1',
    phase: 'week_end',
    templateId: 'depression-shock.day1-night',
    text: 'Night gathers behind rain-streaked windows. Nobody is quite ready to admit how heavy the hub feels.',
    major: undefined,
  },
  {
    visualPhase: 'day2',
    phase: 'social_1',
    templateId: 'depression-shock.chocolates',
    text: 'The Big Eye has left chocolates for everyone. Wrappers open in the quiet, but the rain keeps speaking louder. 🍫',
    major: 'depression_shock_chocolates',
  },
  {
    visualPhase: 'day2',
    phase: 'social_2',
    templateId: 'depression-shock.day2-melancholy',
    text: 'A few pieces of chocolate are gone. The grey light remains, and even laughter sounds borrowed today.',
    major: undefined,
  },
] as const

export default function DepressionShockController() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const enableTwists = useAppSelector((state) => state.settings.sim.enableTwists)
  const [runtime, setRuntime] = useState<DepressionShockState>(() =>
    loadDepressionShockState(game.gameId)
  )
  const [cinematic, setCinematic] = useState<DepressionShockCinematicKind | null>(null)

  useEffect(() => {
    setRuntime(loadDepressionShockState(game.gameId))
  }, [game])

  useLayoutEffect(() => {
    if (game.phase !== 'week_start') return
    const current = loadDepressionShockState(game.gameId)
    const baseContext = buildDepressionShockDayContext(game)
    const evaluation = evaluateDepressionShockAtDayStart(current, {
      ...baseContext,
      eligibleMode: baseContext.eligibleMode && enableTwists,
    })
    const next = saveDepressionShockState(evaluation.state)
    setRuntime(next)

    if (isDepressionShockActiveOnDay(next, game.week) && game.twistActivatedThisWeek !== true) {
      dispatch({ type: 'game/hydrateGame', payload: { ...game, twistActivatedThisWeek: true } })
    }
  }, [dispatch, enableTwists, game])

  // The persisted controller is the sole lifecycle authority. Keep the former
  // Redux shape as a one-way compatibility mirror so legacy social actions see
  // Day 1 and Day 2 identically, including when QA activates either stage.
  useEffect(() => {
    const mirror = buildLegacyDepressionShockMirror(runtime, game.week)
    if (legacyDepressionShockMirrorEquals(game.depressionShock, mirror)) return
    dispatch({ type: 'game/hydrateGame', payload: { ...game, depressionShock: mirror } })
  }, [dispatch, game, runtime])

  const presentation = useMemo(
    () => getDepressionShockPresentation(runtime, game.week, game.phase),
    [game.phase, game.week, runtime]
  )
  const visualPhase = useMemo(
    () => getDepressionShockVisualPhase(runtime, game.week, game.phase),
    [game.phase, game.week, runtime]
  )

  useEffect(() => {
    setDepressionShockVisualPhase(visualPhase)
    // Portraits are derived from persisted lifecycle state, not from the
    // thunder cinematic callback. A continued season may restore mid-shock
    // without replaying that cinematic, and must still show the sad roster.
    setDepressionShockPortraitMode(
      visualPhase === 'day1' || visualPhase === 'day2' ? 'sad' : 'normal'
    )
    const root = document.documentElement
    if (visualPhase === 'inactive') {
      delete root.dataset.depressionShock
      return
    }
    root.dataset.depressionShock = visualPhase
  }, [presentation, visualPhase])

  useEffect(
    () => () => {
      setDepressionShockVisualPhase('inactive')
      setDepressionShockPortraitMode('normal')
      delete document.documentElement.dataset.depressionShock
    },
    []
  )

  useEffect(() => {
    if (presentation !== 'intro' && presentation !== 'day2') return
    const current = loadDepressionShockState(game.gameId)
    setRuntime(markDepressionShockPresentationSeen(current, presentation, game.week))
    dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: presentation === 'intro' ? INTRO_COPY : DAY_TWO_COPY,
        type: 'twist',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          major: presentation === 'intro' ? 'depression_shock_start' : 'depression_shock_day_2',
          broadcastPriority: 'critical',
          broadcastCampaign: 'depression_shock',
          week: game.week,
        },
      },
    })
  }, [dispatch, game.gameId, game.week, presentation])

  useEffect(() => {
    const broadcast = PHASE_BROADCASTS.find(
      (candidate) => candidate.visualPhase === visualPhase && candidate.phase === game.phase
    )
    if (!broadcast) return
    const alreadyQueuedForShock = game.tvFeed.some(
      (event) =>
        event.meta?.week === game.week &&
        event.meta?.broadcastTemplateId === broadcast.templateId &&
        event.meta?.depressionShockQueued === true
    )
    if (alreadyQueuedForShock) return
    dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: broadcast.text,
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          broadcastTemplateId: broadcast.templateId,
          broadcastCampaign: 'depression_shock',
          broadcastLevel: broadcast.major ? 'major' : 'minor',
          forceOnTv: true,
          requeueDuplicateBroadcast: true,
          depressionShockQueued: true,
          ...(broadcast.major ? { major: broadcast.major } : {}),
          week: game.week,
        },
      },
    })
  }, [dispatch, game.phase, game.tvFeed, game.week, visualPhase])

  const finishSunrise = useCallback(() => {
    const current = loadDepressionShockState(game.gameId)
    setRuntime(markDepressionShockPresentationSeen(current, 'ending', game.week))
    dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: END_COPY,
        type: 'twist',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          major: 'depression_shock_end',
          broadcastPriority: 'critical',
          broadcastCampaign: 'depression_shock',
          week: game.week,
        },
      },
    })
    setCinematic(null)
  }, [dispatch, game.gameId, game.week])

  useEffect(() => {
    const handleThunder = () => setCinematic('thunder')
    const handleChocolate = () => setCinematic('chocolate')
    window.addEventListener('depression-shock:thunder-presented', handleThunder)
    window.addEventListener('depression-shock:chocolate-presented', handleChocolate)
    return () => {
      window.removeEventListener('depression-shock:thunder-presented', handleThunder)
      window.removeEventListener('depression-shock:chocolate-presented', handleChocolate)
    }
  }, [])

  const handleCinematicImpact = useCallback(() => {
    if (cinematic === 'thunder') setDepressionShockPortraitMode('sad')
    if (cinematic === 'sunlight') setDepressionShockPortraitMode('normal')
  }, [cinematic])

  const handleSunlightImpact = useCallback(() => {
    setDepressionShockPortraitMode('normal')
  }, [])

  const handleCinematicComplete = useCallback(() => {
    if (cinematic === 'sunlight') {
      finishSunrise()
      return
    }
    setCinematic(null)
  }, [cinematic, finishSunrise])

  if (visualPhase === 'inactive' && presentation !== 'ending') return null

  return (
    <>
      {presentation === 'ending' && cinematic !== 'sunlight' ? (
        <DepressionShockRosterCinematic
          kind="sunlight"
          onImpact={handleSunlightImpact}
          onComplete={finishSunrise}
        />
      ) : null}
      {cinematic ? (
        <DepressionShockRosterCinematic
          kind={cinematic}
          onImpact={handleCinematicImpact}
          onComplete={handleCinematicComplete}
        />
      ) : null}
    </>
  )
}
