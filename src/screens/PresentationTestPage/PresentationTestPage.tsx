import { useState } from 'react'
import { WeatherGlyph } from '../../weather/WeatherBulletinOverlay'
import type { WeatherConditionId } from '../../weather/weatherRuntime'
import './PresentationTestPage.css'

const WEATHER_STATES: WeatherConditionId[] = [
  'sunny',
  'mostly_sunny',
  'partly_cloudy',
  'cloudy',
  'rainy',
  'stormy',
  'snowy',
  'clearing',
]

const DEMO_PLAYERS = [
  { name: 'Aria', color: '#d49a72' },
  { name: 'Jax', color: '#d9b267' },
  { name: 'Ivy', color: '#c78c7b' },
  { name: 'Lux', color: '#e0c47a' },
]

export default function PresentationTestPage() {
  const [weather, setWeather] = useState<WeatherConditionId>('clearing')
  const [showNomineeGlow, setShowNomineeGlow] = useState(true)

  return (
    <main className="presentation-test">
      <header className="presentation-test__header">
        <p className="presentation-test__eyebrow">Big Eye presentation lab</p>
        <h1>Visual change test page</h1>
        <p>
          Preview the nominee indication and premium Faux-TV weather artwork without starting a
          season.
        </p>
      </header>

      <section className="presentation-test__section">
        <div className="presentation-test__section-head">
          <div>
            <p className="presentation-test__eyebrow">Live vote treatment</p>
            <h2>Nominee edge indication</h2>
          </div>
          <button type="button" onClick={() => setShowNomineeGlow((visible) => !visible)}>
            {showNomineeGlow ? 'Hide nominee cue' : 'Show nominee cue'}
          </button>
        </div>
        <div className={`presentation-test__roster${showNomineeGlow ? ' evictionDrama' : ''}`}>
          {DEMO_PLAYERS.map((player, index) => (
            <article
              className="presentation-test__player"
              data-eviction-nominee={
                showNomineeGlow && (index === 0 || index === 2) ? 'true' : undefined
              }
              key={player.name}
            >
              <div
                className="presentation-test__portrait"
                style={{ background: `linear-gradient(145deg, ${player.color}, #17111f 70%)` }}
              >
                <span>{player.name[0]}</span>
              </div>
              <strong>{player.name}</strong>
              <small>{showNomineeGlow && (index === 0 || index === 2) ? 'NOMINEE' : 'SAFE'}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="presentation-test__section presentation-test__weather">
        <div className="presentation-test__section-head">
          <div>
            <p className="presentation-test__eyebrow">Faux-TV weather card</p>
            <h2>Premium weather glyphs</h2>
          </div>
          <select
            value={weather}
            onChange={(event) => setWeather(event.target.value as WeatherConditionId)}
            aria-label="Weather state"
          >
            {WEATHER_STATES.map((state) => (
              <option key={state} value={state}>
                {state.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className={`presentation-test__tv weather-tv-card--${weather}`}>
          <div className="presentation-test__weather-main">
            <span className="presentation-test__temperature">
              22<sup>°C</sup>
            </span>
            <div className="presentation-test__weather-icon">
              <WeatherGlyph condition={weather} rainbow={false} />
              <strong>{weather.replace('_', ' ')}</strong>
            </div>
          </div>
          <p className="presentation-test__copy">
            The premium weather artwork now used by the Faux-TV card.
          </p>
        </div>
      </section>
    </main>
  )
}
