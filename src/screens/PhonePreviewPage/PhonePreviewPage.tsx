import { useMemo, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import './PhonePreviewPage.css'

type PreviewTarget =
  | 'fullApp'
  | 'game'
  | 'battleBack'
  | 'publicFavorite'
  | 'twinShockExposed'
  | 'twinShockSecret'

interface PreviewDevice {
  id: 'iphone' | 'android'
  label: string
  family: string
  width: number
  height: number
  frame: 'dynamic-island' | 'punch-hole'
}

const DEVICES: PreviewDevice[] = [
  {
    id: 'iphone',
    label: 'iPhone 15 / 16 Pro',
    family: 'Representative modern iPhone',
    width: 393,
    height: 852,
    frame: 'dynamic-island',
  },
  {
    id: 'android',
    label: 'Google Pixel 8 / 9',
    family: 'Representative modern Android',
    width: 412,
    height: 915,
    frame: 'punch-hole',
  },
]

const TARGETS: Array<{ value: PreviewTarget; label: string }> = [
  { value: 'fullApp', label: 'Full game · start or continue' },
  { value: 'game', label: 'Current gameplay screen' },
  { value: 'battleBack', label: 'Back 2 the Game' },
  { value: 'publicFavorite', label: "Public's Favorite" },
  { value: 'twinShockExposed', label: 'Twin Shock · exposed' },
  { value: 'twinShockSecret', label: 'Twin Shock · secret kept' },
]

function isPreviewTarget(value: string | null): value is PreviewTarget {
  return TARGETS.some((target) => target.value === value)
}

function buildPhonePreviewUrl(target: PreviewTarget, device: PreviewDevice) {
  const platformParams = `phonePreview=true&phonePlatform=${device.id}`
  switch (target) {
    case 'battleBack':
      return `${import.meta.env.BASE_URL}#/twists-test?preview=battle-back&${platformParams}`
    case 'publicFavorite':
      return `${import.meta.env.BASE_URL}#/twists-test?preview=public-favorite&${platformParams}`
    case 'twinShockExposed':
      return `${import.meta.env.BASE_URL}#/twists-test?preview=twin-shock-exposed&${platformParams}`
    case 'twinShockSecret':
      return `${import.meta.env.BASE_URL}#/twists-test?preview=twin-shock-secret&${platformParams}`
    case 'fullApp':
      return `${import.meta.env.BASE_URL}#/?${platformParams}`
    case 'game':
    default:
      return `${import.meta.env.BASE_URL}#/game?${platformParams}`
  }
}

export default function PhonePreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTarget = searchParams.get('target')
  const target = isPreviewTarget(requestedTarget) ? requestedTarget : 'fullApp'

  const targetLabel =
    TARGETS.find((entry) => entry.value === target)?.label ?? 'Full game · start or continue'
  const previews = useMemo(
    () => DEVICES.map((device) => ({ device, url: buildPhonePreviewUrl(target, device) })),
    [target]
  )

  const selectTarget = (nextTarget: PreviewTarget) => {
    setSearchParams({ target: nextTarget }, { replace: true })
  }

  return (
    <main className="phone-preview-page">
      <header className="phone-preview-page__intro">
        <div>
          <p className="phone-preview-page__eyebrow">Dual-device QA lab</p>
          <h1>iPhone + Android preview</h1>
          <p>Play the complete app or compare a QA scenario at two modern phone sizes.</p>
        </div>
        <div className="phone-preview-page__controls">
          <label>
            Screen
            <select
              value={target}
              onChange={(event) => selectTarget(event.target.value as PreviewTarget)}
            >
              {TARGETS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <a className="phone-preview-page__back" href="#/twists-test">
            Back to twist tests
          </a>
        </div>
      </header>

      <section
        className="phone-preview-page__devices"
        aria-label={`${targetLabel} device previews`}
      >
        {previews.map(({ device, url }) => (
          <article className="phone-preview-page__device" key={device.id}>
            <div className="phone-preview-page__device-heading">
              <div>
                <strong>{device.label}</strong>
                <span>{device.family}</span>
              </div>
              <code>
                {device.width} × {device.height}
              </code>
            </div>
            <div
              className={`phone-preview-page__phone phone-preview-page__phone--${device.frame}`}
              aria-label={`${device.label}, ${device.width} by ${device.height} phone simulator`}
              style={
                {
                  '--phone-width': `${device.width}px`,
                  '--phone-height': `${device.height}px`,
                  '--phone-aspect': `${device.width} / ${device.height}`,
                } as CSSProperties
              }
            >
              <div className="phone-preview-page__camera" aria-hidden="true" />
              <div
                className="phone-preview-page__side-button phone-preview-page__side-button--volume"
                aria-hidden="true"
              />
              <div
                className="phone-preview-page__side-button phone-preview-page__side-button--power"
                aria-hidden="true"
              />
              <iframe
                className="phone-preview-page__screen"
                name={`phone-preview:${device.id}`}
                title={`${device.label} ${targetLabel} preview`}
                src={url}
              />
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
