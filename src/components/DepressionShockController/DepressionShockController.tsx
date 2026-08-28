import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { resolveSkinAsset } from '../../utils/skinAssets'
import {
  buildDepressionShockDayContext,
  evaluateDepressionShockAtDayStart,
  getDepressionShockPresentation,
  getDepressionShockVisualPhase,
  isDepressionShockActiveOnDay,
  loadDepressionShockState,
  markDepressionShockPresentationSeen,
  saveDepressionShockState,
  setDepressionShockVisualPhase,
  type DepressionShockPresentation,
  type DepressionShockState,
} from '../../features/twists/depressionShock'
import './DepressionShockController.css'

const INTRO_COPY =
  'The weather has been bad for so long that the players have slipped into depression. For the next two days, watch out — they may not act like themselves.'
const DAY_TWO_COPY =
  'The house is still very depressed. Even the colours have drained away. The Big Eye has sent chocolates to try to lift the mood.'
const END_COPY =
  'The sun finally breaks through the clouds. Light floods the house, a rainbow appears, and the housemates begin to feel like themselves again.'

function presentationCopy(presentation: Exclude<DepressionShockPresentation, null>): {
  eyebrow: string
  title: string
  body: string
  button: string
  symbol: string
} {
  switch (presentation) {
    case 'intro':
      return {
        eyebrow: 'HOUSE SHOCK',
        title: 'Depression Shock',
        body: INTRO_COPY,
        button: 'Enter the storm',
        symbol: '🌧️',
      }
    case 'day2':
      return {
        eyebrow: 'DAY TWO',
        title: 'The mood has not lifted',
        body: DAY_TWO_COPY,
        button: 'Continue',
        symbol: '🍫',
      }
    case 'ending':
      return {
        eyebrow: 'THE WEATHER BREAKS',
        title: 'Sunshine at last',
        body: END_COPY,
        button: 'Back to the game',
        symbol: '🌈',
      }
  }
}

export default function DepressionShockController() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const enableTwists = useAppSelector((state) => state.settings.sim.enableTwists)
  const [runtime, setRuntime] = useState<DepressionShockState>(() =>
    loadDepressionShockState(game.gameId)
  )

  useEffect(() => {
    setRuntime(loadDepressionShockState(game.gameId))
  }, [game.gameId])

  // Resolve the Day-5 roll before GameScreen's passive twist effects run. This
  // lets Depression Shock claim a free week_start window without racing the
  // existing day-start shock/secret-mission activators.
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

    const activeToday = isDepressionShockActiveOnDay(next, game.week)
    if (activeToday && game.twistActivatedThisWeek !== true) {
      // There is intentionally no second twist state machine in gameSlice. The
      // generic per-day guard remains authoritative for preventing overlap.
      dispatch({
        type: 'game/hydrateGame',
        payload: { ...game, twistActivatedThisWeek: true },
      })
    }

    if (evaluation.event === 'activated') {
      dispatch({
        type: 'game/addTvEvent',
        payload: {
          text: INTRO_COPY,
          type: 'twist',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: { major: 'depression_shock_start', week: game.week },
        },
      })
    }
  }, [dispatch, enableTwists, game])

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
    const root = document.documentElement
    if (visualPhase === 'inactive') {
      delete root.dataset.depressionShock
      root.style.removeProperty('--depression-shock-weather-image')
      return
    }

    root.dataset.depressionShock = visualPhase
    const weatherKey = visualPhase === 'day2' ? 'rain' : 'thunderstorm'
    const weather = resolveSkinAsset(weatherKey, 'night')
    root.style.setProperty('--depression-shock-weather-image', `url("${weather.url}")`)
  }, [visualPhase])

  useEffect(
    () => () => {
      setDepressionShockVisualPhase('inactive')
      delete document.documentElement.dataset.depressionShock
      document.documentElement.style.removeProperty('--depression-shock-weather-image')
    },
    []
  )

  const dismissPresentation = () => {
    if (!presentation) return
    const current = loadDepressionShockState(game.gameId)
    const next = markDepressionShockPresentationSeen(current, presentation, game.week)
    setRuntime(next)

    if (presentation === 'day2') {
      dispatch({
        type: 'game/addTvEvent',
        payload: {
          text: 'The house is still deeply down. The Big Eye has sent chocolates for everyone in an attempt to lift the mood. 🍫',
          type: 'twist',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: { major: 'depression_shock_day_2', week: game.week },
        },
      })
    } else if (presentation === 'ending') {
      dispatch({
        type: 'game/addTvEvent',
        payload: {
          text: 'The clouds break apart, sunlight floods the House and a rainbow appears. Depression Shock is over. 🌈',
          type: 'twist',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: { major: 'depression_shock_end', week: game.week },
        },
      })
    }
  }

  if (visualPhase === 'inactive' && !presentation) return null

  return (
    <>
      <div
        className={`depression-shock-weather depression-shock-weather--${visualPhase}`}
        aria-hidden="true"
      />
      {presentation && (
        <div
          className={`depression-shock-modal depression-shock-modal--${presentation}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="depression-shock-title"
          aria-describedby="depression-shock-description"
        >
          <section className="depression-shock-card">
            <div className="depression-shock-card__symbol" aria-hidden="true">
              {presentationCopy(presentation).symbol}
            </div>
            <p className="depression-shock-card__eyebrow">
              {presentationCopy(presentation).eyebrow}
            </p>
            <h2 id="depression-shock-title" className="depression-shock-card__title">
              {presentationCopy(presentation).title}
            </h2>
            <p id="depression-shock-description" className="depression-shock-card__body">
              {presentationCopy(presentation).body}
            </p>
            {presentation === 'day2' && (
              <div className="depression-shock-chocolates" aria-hidden="true">
                <span>🍫</span>
                <span>🍫</span>
                <span>🍫</span>
              </div>
            )}
            <button
              type="button"
              className="depression-shock-card__button"
              onClick={dismissPresentation}
            >
              {presentationCopy(presentation).button}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
