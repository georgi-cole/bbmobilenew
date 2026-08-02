import { useState } from 'react'
import CastleRescueGame from '../../minigames/castleRescue/CastleRescueGame'
import './FindYourTwin2.css'

function freshSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1
}

export default function FindYourTwin2() {
  const [playing, setPlaying] = useState(false)
  const [seed, setSeed] = useState(20260802)

  if (playing) {
    return <CastleRescueGame key={seed} seed={seed} variant="benny-lenny" autoStart />
  }

  return (
    <main className="fyt2" data-testid="find-your-twin-2">
      <div className="fyt2__windows" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <section className="fyt2__card">
        <p className="fyt2__eyebrow">A Find Your Twin spin-off</p>
        <h1>Find Your Twin 2</h1>
        <h2>Benny &amp; Lenny: The Lost Castle</h2>
        <p className="fyt2__story">
          Meet twin brothers Benny and Lenny for the first time. While exploring an ancient castle,
          a maze of enchanted doors separates them. Now Benny must cross the castle and find Lenny
          before time runs out.
        </p>

        <div className="fyt2__rules">
          <article>
            <span>🚪</span>
            <strong>Three hidden doors</strong>
            <small>Find the correct doors in order to unlock Lenny&apos;s wing.</small>
          </article>
          <article>
            <span>⚔️</span>
            <strong>Familiar danger</strong>
            <small>Jump, stomp enemies, avoid traps, and protect Benny&apos;s three hearts.</small>
          </article>
          <article>
            <span>🖼️</span>
            <strong>Secret castle rooms</strong>
            <small>Discover the Housemate Gallery and the mysterious Kolequant Vault.</small>
          </article>
        </div>

        <p className="fyt2__same-rules">
          Move with Left and Right, jump over danger, and stand in front of a door before pressing
          Up to enter. Find three correct doors in order, then reach Lenny within 2:30. Eyeoleans,
          enemies, bricks, checkpoints, mistakes, and elapsed time all affect the final score.
        </p>

        <label className="fyt2__seed">
          <span>Castle seed</span>
          <input
            type="number"
            value={seed}
            onChange={(event) =>
              setSeed(Math.max(1, Math.trunc(event.currentTarget.valueAsNumber || 1)))
            }
          />
        </label>
        <div className="fyt2__actions">
          <button type="button" className="fyt2__secondary" onClick={() => setSeed(freshSeed())}>
            New castle
          </button>
          <a className="fyt2__secondary" href="#/find-your-twin-experiment">
            Play against AIs
          </a>
          <button type="button" className="fyt2__start" onClick={() => setPlaying(true)}>
            Help Benny find Lenny
          </button>
        </div>
      </section>
    </main>
  )
}
