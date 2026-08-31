import { useMemo, useState, type CSSProperties } from 'react'
import './ReleaseFixesPreview.css'

type FixPreview = {
  id: number
  title: string
  result: string
  href: string
  action: string
}

const FIXES: FixPreview[] = [
  {
    id: 1,
    title: 'House Feed',
    result: 'Inline feed owns the log and TV occupancy count.',
    href: '#/game',
    action: 'Open game + Debug panel',
  },
  {
    id: 2,
    title: 'Crystal Path: Infinity',
    result: 'Scrollable results, Leader of the House copy, clearer bridge.',
    href: '#/minigame-lab?game=crystal_path_shattered&seed=424242&players=8',
    action: 'Open Crystal Path',
  },
  {
    id: 3,
    title: 'Verdict Board',
    result: 'Mystery Box is now a compact accept/decline dialog.',
    href: '#/minigame-lab?game=hangman&seed=42&players=4&skipRules=1&skipCountdown=1',
    action: 'Open Verdict Board',
  },
  {
    id: 4,
    title: 'Elimination lockout',
    result: 'Confessional message is concise and uses normal TV copy.',
    href: '#/broadcast-manager',
    action: 'Open broadcast manager',
  },
  {
    id: 5,
    title: 'Shock announcements',
    result: 'Fullscreen shocks share the Double Elimination sequence.',
    href: '#/twists-test',
    action: 'Open shock tester',
  },
  {
    id: 6,
    title: 'Classical Safety',
    result: 'No Cupid “pair” language or lingering recovery weather.',
    href: '#/game',
    action: 'Open game + Debug panel',
  },
  {
    id: 7,
    title: 'Timing Bar',
    result: 'Round-two handoff has only the information needed to begin.',
    href: '#/tb-test',
    action: 'Open Round 2 preview',
  },
  {
    id: 8,
    title: 'Final Three announcement',
    result: 'The main broadcast is the only finale announcement.',
    href: '#/gamedebug',
    action: 'Open game debugger',
  },
  {
    id: 9,
    title: 'Fit Me In rules',
    result: 'Short rules describe the board, cuts, and final clearly.',
    href: '#/minigame-lab?game=tetris&seed=424242&players=4',
    action: 'Open Fit Me In',
  },
  {
    id: 10,
    title: 'Season recap',
    result: 'One Skip action replaces duplicate exit actions.',
    href: '#/season-recap-test',
    action: 'Open recap preview',
  },
  {
    id: 11,
    title: 'Credits',
    result: 'Credits autoplay and audio no longer repeatedly resync.',
    href: '#/credits',
    action: 'Open credits',
  },
  {
    id: 12,
    title: 'Centered vote control',
    result: 'Nominee controls keep the selection indicator vertically centered.',
    href: '#/game',
    action: 'Open confessional vote',
  },
  {
    id: 13,
    title: 'In-game answer keyboard',
    result: 'Famous Figures and Capitalization accept answers without opening the phone keyboard.',
    href: '#/minigame-lab?game=famous_figures&seed=424242&players=4',
    action: 'Open Famous Figures',
  },
  {
    id: 14,
    title: 'Tribunal reveal',
    result: 'Juror portraits use a larger cinematic treatment and cleaner message balance.',
    href: '#/game',
    action: 'Open tribunal preview',
  },
  {
    id: 15,
    title: 'Tilt Labyrinth results',
    result: 'Standings rows are denser, aligned, and readable on narrow screens.',
    href: '#/minigame-lab?game=tilt_labyrinth&seed=424242&players=16',
    action: 'Open Tilt Labyrinth',
  },
]

/** Dev-only release checklist: a direct route into every repaired surface. */
export default function ReleaseFixesPreview() {
  const [selectedId, setSelectedId] = useState(2)
  const selected = FIXES.find((fix) => fix.id === selectedId) ?? FIXES[0]
  const emulatorUrl = `${import.meta.env.BASE_URL}${selected.href}`
  const frames = useMemo(
    () => [
      { id: 'iphone', label: 'iPhone 15 Pro', width: 393, height: 852, frame: 'island' },
      { id: 'android', label: 'Pixel 9', width: 412, height: 915, frame: 'punch' },
    ],
    []
  )

  return (
    <main className="release-fixes-preview">
      <header>
        <p>Temporary QA route</p>
        <h1>Release fixes</h1>
        <span>Choose a fix to load it simultaneously in iPhone and Android frames.</span>
      </header>
      <section aria-label="Release fixes" className="release-fixes-preview__grid">
        {FIXES.map((fix) => (
          <article key={fix.id} className="release-fixes-preview__card">
            <b>{String(fix.id).padStart(2, '0')}</b>
            <h2>{fix.title}</h2>
            <p>{fix.result}</p>
            <button type="button" onClick={() => setSelectedId(fix.id)}>
              Preview in phones →
            </button>
            <a href={fix.href}>Open full-screen</a>
          </article>
        ))}
      </section>
      <section
        className="release-fixes-preview__emulators"
        aria-label={`${selected.title} emulators`}
      >
        <h2>{selected.title} · phone comparison</h2>
        <div className="release-fixes-preview__devices">
          {frames.map((device) => (
            <article key={device.id} className="release-fixes-preview__device">
              <strong>{device.label}</strong>
              <div
                className={`release-fixes-preview__phone release-fixes-preview__phone--${device.frame}`}
                style={
                  {
                    '--preview-width': `${device.width}px`,
                    '--preview-height': `${device.height}px`,
                  } as CSSProperties
                }
              >
                <span className="release-fixes-preview__camera" aria-hidden="true" />
                <iframe
                  title={`${device.label}: ${selected.title}`}
                  src={emulatorUrl}
                  allow="autoplay; fullscreen"
                />
              </div>
            </article>
          ))}
        </div>
        <a className="release-fixes-preview__full-link" href={selected.href}>
          Open {selected.title} full-screen →
        </a>
      </section>
    </main>
  )
}
