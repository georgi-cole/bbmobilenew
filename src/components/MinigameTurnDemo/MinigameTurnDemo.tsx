import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import './MinigameTurnDemo.css'

export const TURN_DEMO_KEYS = new Set([
  'chainOfGreed',
  'blackjackTournament',
  'colorMatch',
  'memoryMatch',
  'hangman',
  'castleRescue',
  'castleRescueRemastered',
  'castleRescue2',
  'castleRescue2Remastered',
  'glass_bridge_brutal',
  'crystal_path_shattered',
  'trapAuction',
  'gridOfLuck',
  'minesweeps',
])
type Props = { gameKey: string; title?: string; guided?: boolean; onInteraction?: () => void }

function Shell({
  title,
  className = '',
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`turn-demo ${className}`} aria-label={`${title} example turn`}>
      <p className="turn-demo__kicker">Watch one turn</p>
      <div className="turn-demo__content">{children}</div>
    </section>
  )
}
function Card({ value, suit, down = false }: { value?: string; suit?: string; down?: boolean }) {
  return (
    <span className={`turn-demo__playing-card ${down ? 'turn-demo__playing-card--down' : ''}`}>
      {!down && (
        <>
          <b>{value}</b>
          <i>{suit}</i>
        </>
      )}
    </span>
  )
}
function Bar({ children }: { children: ReactNode }) {
  return <div className="turn-demo__gamebar">{children}</div>
}

function ChainDemo() {
  const [choice, setChoice] = useState<'higher' | 'lower' | null>(null)
  const win = choice === 'higher'
  return (
    <Shell title="Chain of Greed" className="turn-demo--chain">
      <div className="turn-demo__chain-head">
        <span>YOUR TURN</span>
        <b>ROUND BANK 350</b>
      </div>
      <div className="turn-demo__chain-board">
        <div className="turn-demo__chain-levels">
          <span>1,300</span>
          <span>900</span>
          <span>600</span>
          <span>350</span>
          <span>150</span>
        </div>
        <div className="turn-demo__chain-rail">
          {[0, 1, 2, 3, 4].map((step) => (
            <i key={step} className={step === 2 ? 'is-current' : step > 2 ? 'is-next' : ''} />
          ))}
        </div>
        <div className="turn-demo__chain-current">
          <small>CURRENT</small>
          <strong>{choice ? '72' : '50'}</strong>
          <em>{choice ? (win ? 'HIGHER ✓' : 'LOWER ✕') : 'NEXT NUMBER'}</em>
        </div>
      </div>
      <div className="turn-demo__chain-status">
        <span>STEP 3 OF 8</span>
        <span>POT 600</span>
        <span>NEXT 900</span>
      </div>
      {!choice ? (
        <div className="turn-demo__three-actions">
          <button onClick={() => setChoice('lower')}>LOWER</button>
          <button className="turn-demo__bank">BANK</button>
          <button onClick={() => setChoice('higher')}>HIGHER</button>
        </div>
      ) : (
        <p className={`turn-demo__result ${win ? '' : 'is-bad'}`}>
          {win ? '72 is higher — move up the ladder.' : '72 is higher — the active pot breaks.'}
        </p>
      )}
    </Shell>
  )
}
function BlackjackDemo() {
  const [result, setResult] = useState<'hit' | 'hold' | null>(null)
  return (
    <Shell title="Blackjack Tournament" className="turn-demo--blackjack">
      <div className="turn-demo__felt-label">
        <span>DEALER · 18</span>
        <span>YOUR TURN</span>
      </div>
      <div className="turn-demo__blackjack-hands">
        <div>
          <small>OPPONENT</small>
          <Card value="10" suit="♠" />
          <Card value="8" suit="♣" />
        </div>
        <div>
          <small>YOUR HAND · {result === 'hit' ? '20' : '16'}</small>
          <Card value="10" suit="♥" />
          <Card value="6" suit="♦" />
          {result === 'hit' && <Card value="4" suit="♠" />}
        </div>
      </div>
      {!result ? (
        <div className="turn-demo__blackjack-actions">
          <button onClick={() => setResult('hit')}>HIT</button>
          <button onClick={() => setResult('hold')}>HOLD</button>
        </div>
      ) : (
        <p className={`turn-demo__result ${result === 'hold' ? 'is-bad' : ''}`}>
          {result === 'hit'
            ? 'You draw 4 and reach 20 — ahead of 18.'
            : 'You hold at 16 — the dealer wins with 18.'}
        </p>
      )}
    </Shell>
  )
}
function ColorDemo() {
  const [values, setValues] = useState([170, 80, 180])
  const [submitted, setSubmitted] = useState(false)
  const target = [200, 110, 150]
  const accuracy = Math.max(
    0,
    100 - Math.round(values.reduce((sum, value, i) => sum + Math.abs(value - target[i]), 0) / 4)
  )
  const setValue = (index: number, value: number) => {
    setValues(values.map((v, i) => (i === index ? value : v)))
    setSubmitted(false)
  }
  return (
    <Shell title="Color Match" className="turn-demo--color">
      <div className="turn-demo__color-top">
        <span>ROUND 2 / 5</span>
        <b>00:18</b>
      </div>
      <div className="turn-demo__color-swatches">
        <div>
          <small>TARGET</small>
          <i style={{ background: 'rgb(200,110,150)' }} />
        </div>
        <div>
          <small>YOURS</small>
          <i style={{ background: `rgb(${values.join(',')})` }} />
        </div>
      </div>
      <div className="turn-demo__sliders">
        {['R', 'G', 'B'].map((channel, index) => (
          <label key={channel}>
            <b>{channel}</b>
            <input
              aria-label={`${channel} value`}
              type="range"
              min="0"
              max="255"
              value={values[index]}
              onChange={(event) => setValue(index, Number(event.target.value))}
            />
            <span>{values[index]}</span>
          </label>
        ))}
      </div>
      <button className="turn-demo__wide-button" onClick={() => setSubmitted(true)}>
        LOCK COLOUR
      </button>
      {submitted && (
        <p className="turn-demo__result">{accuracy}% match — each slider changes your colour.</p>
      )}
    </Shell>
  )
}
function MemoryDemo() {
  const sequence = [0, 2, 1]
  const [watching, setWatching] = useState(true)
  const [taps, setTaps] = useState<number[]>([])
  const complete = taps.length === 3 && taps.every((tap, index) => tap === sequence[index])
  const failed = taps.some((tap, index) => tap !== sequence[index])
  const tap = (index: number) => {
    if (!watching && !complete && !failed) setTaps([...taps, index])
  }
  return (
    <Shell title="Memory Colors" className="turn-demo--memory">
      <Bar>
        <span>ROUND 2</span>
        <b>{watching ? 'WATCH' : 'REPEAT'}</b>
        <span>♥ ♥ ♥</span>
      </Bar>
      <div className="turn-demo__memory-pads">
        {['#fb7185', '#60a5fa', '#facc15', '#34d399'].map((color, index) => (
          <button
            key={color}
            aria-label={`Colour pad ${index + 1}`}
            className={
              watching && sequence.includes(index)
                ? 'is-lit'
                : taps.includes(index)
                  ? 'is-picked'
                  : ''
            }
            style={{ '--pad': color } as CSSProperties}
            onClick={() => tap(index)}
          />
        ))}
      </div>
      {watching ? (
        <button className="turn-demo__wide-button" onClick={() => setWatching(false)}>
          REPEAT THE SEQUENCE
        </button>
      ) : (
        <p className={`turn-demo__result ${failed ? 'is-bad' : ''}`}>
          {complete
            ? 'Perfect — red, yellow, then blue.'
            : failed
              ? 'Wrong pad — a heart is lost.'
              : `Repeat it: ${taps.length}/3`}
        </p>
      )}
    </Shell>
  )
}
function VerdictDemo() {
  const [letters, setLetters] = useState<string[]>([])
  const reveal = (letter: string) => setLetters([...letters, letter])
  const show = (letter: string, index: number) =>
    index === 0 || index === 2 || letters.includes(letter) ? letter : '_'
  return (
    <Shell title="Verdict Board" className="turn-demo--verdict">
      <div className="turn-demo__verdict-bar">
        <span>CASE 04</span>
        <span>CHANCES ● ● ○</span>
      </div>
      <div className="turn-demo__word-board">
        {['B', 'I', 'G', 'E', 'Y', 'E'].map((letter, index) => (
          <span key={`${letter}-${index}`}>{show(letter, index)}</span>
        ))}
      </div>
      <p className="turn-demo__clue">CLUE: a famous watcher</p>
      <div className="turn-demo__letter-row">
        <button onClick={() => reveal('I')}>I</button>
        <button onClick={() => reveal('Y')}>Y</button>
        <button onClick={() => reveal('A')}>A</button>
      </div>
      {letters.length > 0 && (
        <p className={`turn-demo__result ${letters.includes('A') ? 'is-bad' : ''}`}>
          {letters.includes('A')
            ? 'A is a miss — you lose a chance.'
            : 'Correct letters light up the board.'}
        </p>
      )}
    </Shell>
  )
}
function TwinDemo() {
  const [entered, setEntered] = useState<number | null>(null)
  return (
    <Shell title="Find Your Twin" className="turn-demo--twin">
      <div className="turn-demo__platform-hud">
        <span>♥ ♥ ♥</span>
        <b>COINS 04</b>
        <span>WORLD 1-1</span>
      </div>
      <div className="turn-demo__platform-scene">
        <i className="turn-demo__cloud">☁</i>
        <i className="turn-demo__brick brick-a" />
        <i className="turn-demo__brick brick-b" />
        <i className="turn-demo__coin">●</i>
        <span className="turn-demo__hero">♟</span>
        {[0, 1, 2].map((pipe) => (
          <button
            aria-label={`Enter pipe ${pipe + 1}`}
            key={pipe}
            className={`turn-demo__platform-pipe pipe-${pipe} ${entered === pipe ? (pipe === 1 ? 'is-safe' : 'is-trap') : ''}`}
            onClick={() => setEntered(pipe)}
          >
            <i />
            <small>↓</small>
          </button>
        ))}
        <i className="turn-demo__ground" />
      </div>
      <div className="turn-demo__platform-controls">
        <button>←</button>
        <button>JUMP</button>
        <button>→</button>
      </div>
      {entered !== null && (
        <p className={`turn-demo__result ${entered === 1 ? '' : 'is-bad'}`}>
          {entered === 1
            ? 'Correct pipe — it takes you toward your twin.'
            : 'Wrong pipe — it sends you to a dead end.'}
        </p>
      )}
    </Shell>
  )
}
function CrystalDemo({ infinity }: { infinity: boolean }) {
  const [choice, setChoice] = useState<'left' | 'right' | null>(null)
  const safe = choice === 'left'
  const rows = infinity ? [0, 1, 2] : [0, 1]
  return (
    <Shell
      title={infinity ? 'Crystal Path: Infinity' : 'The Crystal Path'}
      className={`turn-demo--crystal ${infinity ? 'turn-demo--infinity' : ''}`}
    >
      <div className="turn-demo__crystal-hud">
        <span>YOU · ROW 2</span>
        <b>{infinity ? 'SP 80' : 'TIME 18'}</b>
        <span>{infinity ? '1💡' : 'NEXT STEP'}</span>
      </div>
      {infinity && (
        <div className="turn-demo__sp-bar">
          <i />
        </div>
      )}
      <div className="turn-demo__bridge">
        {rows.map((row) => (
          <div className={`turn-demo__bridge-row ${row === 0 ? 'is-active' : ''}`} key={row}>
            <small>{row + 2}</small>
            <button
              className={choice === 'left' && row === 0 ? 'is-safe' : ''}
              onClick={() => row === 0 && setChoice('left')}
            />
            {infinity && <i className="turn-demo__bridge-center">?</i>}
            <button
              className={choice === 'right' && row === 0 ? 'is-broken' : ''}
              onClick={() => row === 0 && setChoice('right')}
            />
          </div>
        ))}
      </div>
      {choice && (
        <p className={`turn-demo__result ${safe ? '' : 'is-bad'}`}>
          {safe
            ? 'The left tile holds — progress to row 3.'
            : 'The right tile cracks — you fall from the path.'}
        </p>
      )}{' '}
      {!choice && <p className="turn-demo__crystal-copy">Tap a glowing tile in the current row.</p>}
    </Shell>
  )
}
function TrapDemo() {
  const [bid, setBid] = useState(2)
  const [locked, setLocked] = useState(false)
  const update = (value: number) => {
    setBid(Math.max(1, Math.min(10, value)))
    setLocked(false)
  }
  return (
    <Shell title="Trap Auction" className="turn-demo--auction">
      <div className="turn-demo__auction-bar">
        <span>
          YOUR CREDITS <b>10</b>
        </span>
        <span>ROUND 2</span>
      </div>
      <div className="turn-demo__auction-stage">
        <span>SECRET BID</span>
        <div>
          <button onClick={() => update(bid - 1)}>−</button>
          <strong>{bid}</strong>
          <button onClick={() => update(bid + 1)}>+</button>
        </div>
        <small>Other players are hidden</small>
      </div>
      <button className="turn-demo__wide-button" onClick={() => setLocked(true)}>
        LOCK BID
      </button>
      {locked && (
        <p className="turn-demo__result">Bids reveal: 2, {bid}, 5. The lowest bid gets the trap.</p>
      )}
    </Shell>
  )
}
function GridDemo() {
  const [opened, setOpened] = useState<number | null>(null)
  return (
    <Shell title="Grid of Luck" className="turn-demo--gridluck">
      <Bar>
        <span>GRID OF LUCK</span>
        <b>LP 5</b>
        <span>TURN 3</span>
      </Bar>
      <p className="turn-demo__grid-copy">Pick one charged tile.</p>
      <div className="turn-demo__luck-grid">
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <button
            key={tile}
            className={opened === tile ? (tile === 3 ? 'is-power' : 'is-trap') : ''}
            onClick={() => setOpened(tile)}
          >
            {opened === tile ? (tile === 3 ? '+2' : '−1') : '✦'}
          </button>
        ))}
      </div>
      {opened !== null && (
        <p className={`turn-demo__result ${opened === 3 ? '' : 'is-bad'}`}>
          {opened === 3 ? 'Lucky tile: gain 2 LP.' : 'A drain tile: lose 1 LP.'}
        </p>
      )}
    </Shell>
  )
}
function MineDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Shell title="Minesweeps" className="turn-demo--mines">
      <Bar>
        <span>MINES 3</span>
        <b>SAFE 12</b>
        <span>FLAGS 1</span>
      </Bar>
      <div className="turn-demo__mine-board">
        {Array.from({ length: 16 }, (_, tile) => (
          <button
            key={tile}
            className={
              open && tile === 5
                ? 'is-number'
                : open && [1, 4, 6, 9].includes(tile)
                  ? 'is-cleared'
                  : tile === 10
                    ? 'is-flagged'
                    : ''
            }
            onClick={() => setOpen(true)}
          >
            {open && tile === 5 ? '1' : tile === 10 ? '⚑' : ''}
          </button>
        ))}
      </div>
      {open ? (
        <p className="turn-demo__result">
          The 1 touches one mine. Use that clue before opening another tile.
        </p>
      ) : (
        <p className="turn-demo__mine-copy">Open a tile. Numbers describe nearby mines.</p>
      )}
    </Shell>
  )
}

export default function MinigameTurnDemo({ gameKey, title, guided = false, onInteraction }: Props) {
  const demo = useMemo(() => {
    switch (gameKey) {
      case 'chainOfGreed':
        return <ChainDemo />
      case 'blackjackTournament':
        return <BlackjackDemo />
      case 'colorMatch':
        return <ColorDemo />
      case 'memoryMatch':
        return <MemoryDemo />
      case 'hangman':
        return <VerdictDemo />
      case 'castleRescue':
      case 'castleRescueRemastered':
      case 'castleRescue2':
      case 'castleRescue2Remastered':
        return <TwinDemo />
      case 'glass_bridge_brutal':
        return <CrystalDemo infinity={false} />
      case 'crystal_path_shattered':
        return <CrystalDemo infinity />
      case 'trapAuction':
        return <TrapDemo />
      case 'gridOfLuck':
        return <GridDemo />
      case 'minesweeps':
        return <MineDemo />
      default:
        return null
    }
  }, [gameKey])
  return (
    <div className={guided ? 'turn-demo-guide' : undefined} onClickCapture={onInteraction}>
      {demo ?? (
        <Shell title={title ?? gameKey}>
          <p>Make one choice, then see its result.</p>
        </Shell>
      )}
    </div>
  )
}
