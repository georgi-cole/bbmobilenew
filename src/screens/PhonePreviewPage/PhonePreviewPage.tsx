import { useMemo, useState, type CSSProperties } from 'react'
import './PhonePreviewPage.css'

type DeviceId = 'iphone15' | 'iphone15max' | 'pixel8' | 'galaxyS23'
type PreviewTarget = 'game' | 'publicFavorite'

const DEVICES: Record<
  DeviceId,
  {
    label: string
    width: number
    height: number
    frame: 'dynamic-island' | 'punch-hole' | 'teardrop'
  }
> = {
  iphone15: { label: 'iPhone 15 / 15 Pro', width: 393, height: 852, frame: 'dynamic-island' },
  iphone15max: { label: 'iPhone 15 Pro Max', width: 430, height: 932, frame: 'dynamic-island' },
  pixel8: { label: 'Google Pixel 8', width: 412, height: 915, frame: 'punch-hole' },
  galaxyS23: { label: 'Galaxy S23', width: 360, height: 800, frame: 'teardrop' },
}

export default function PhonePreviewPage() {
  const [deviceId, setDeviceId] = useState<DeviceId>('iphone15')
  const [target, setTarget] = useState<PreviewTarget>('game')
  const device = DEVICES[deviceId]
  const previewUrl = useMemo(
    () =>
      target === 'game'
        ? `${import.meta.env.BASE_URL}#/game?phonePreview=true`
        : `${import.meta.env.BASE_URL}#/twists-test?preview=public-favorite&phonePreview=true`,
    [target]
  )

  return (
    <main className="phone-preview-page">
      <div className="phone-preview-page__intro">
        <p className="phone-preview-page__eyebrow">Local device preview</p>
        <h1>Real-phone preview</h1>
        <p>Test the live game at the same viewport size and handset shape players will use.</p>
        <div className="phone-preview-page__controls">
          <label>
            Device
            <select
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value as DeviceId)}
            >
              {Object.entries(DEVICES).map(([id, entry]) => (
                <option key={id} value={id}>
                  {entry.label} · {entry.width} × {entry.height}
                </option>
              ))}
            </select>
          </label>
          <label>
            Screen
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as PreviewTarget)}
            >
              <option value="game">Live game</option>
              <option value="publicFavorite">Public Favorite QA</option>
            </select>
          </label>
        </div>
        <a className="phone-preview-page__back" href="#/twists-test">
          Back to the test page
        </a>
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
          title={`${device.label} ${target === 'game' ? 'game' : 'Public Favorite'} preview`}
          src={previewUrl}
        />
      </div>
    </main>
  )
}
