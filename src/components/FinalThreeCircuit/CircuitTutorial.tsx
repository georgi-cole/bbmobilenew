import { useState } from 'react'
import {
  EMPTY_SEQUENCE_TILE,
  isSequenceSolved,
  slideSequenceTile,
} from './finalThreeCircuitLogic'

export type CircuitTutorialKind = 'signal' | 'sequence' | 'warden' | 'power' | 'override'

interface CircuitTutorialProps {
  kind: CircuitTutorialKind
  onComplete: () => void
}

const META: Record<
  CircuitTutorialKind,
  { eyebrow: string; title: string; intro: string; startLabel: string; rules: string[] }
> = {
  signal: {
    eyebrow: 'Stage 1 · Quick practice',
    title: 'Signal Hunt',
    intro: 'A number appears as your live target. Find that number in the grid before the clock runs down. The board reshuffles after every correct hit.',
    startLabel: 'Start Signal Hunt',
    rules: ['Tap only the requested number.', 'Wrong taps cost both time and points.', 'The target and grid change after every success.'],
  },
  sequence: {
    eyebrow: 'Stage 2 · Quick practice',
    title: 'Sequence Builder',
    intro: 'Rebuild the visible target by sliding tiles into the empty space. You cannot swap arbitrary tiles - only a tile touching the empty slot can move.',
    startLabel: 'Start Sequence Builder',
    rules: ['The target remains visible.', 'Only adjacent tiles can slide into the gap.', 'Fewer unnecessary moves produce a stronger score.'],
  },
  warden: {
    eyebrow: 'Risk Run · Quick practice',
    title: 'Warden Escape',
    intro: 'This is a pursuit puzzle, not a race. You move one tile, then the guard moves up to two. He closes the horizontal gap first, then the vertical gap.',
    startLabel: 'Choose Warden difficulty',
    rules: ['You move 1 tile per turn.', 'The guard gets up to 2 moves immediately after you.', 'Use walls to manipulate his predictable horizontal-first pursuit.'],
  },
  power: {
    eyebrow: 'Risk Run · Quick practice',
    title: 'Power Balance',
    intro: 'Build the requested load by committing power cells. Once you activate a cell, it is locked in - you cannot remove it later.',
    startLabel: 'Choose Power difficulty',
    rules: ['You get only a few commitments.', 'Committed cells cannot be undone.', 'Safe allows a wider target range; Risky requires an exact total.'],
  },
  override: {
    eyebrow: 'Final Push · Quick practice',
    title: 'Final Override',
    intro: 'Five rapid logic questions decide whether your stake is added to or deducted from your Risk Run bank. Higher stakes require more correct answers.',
    startLabel: 'Begin Final Override',
    rules: ['Every question has one correct answer.', 'The real round is timed.', '10% needs 3/5, 25% needs 4/5, and 40% needs 5/5.'],
  },
}

function SignalPractice({ onReady }: { onReady: () => void }) {
  const [message, setMessage] = useState('Tap node 7.')
  const [done, setDone] = useState(false)
  const values = [12, 4, 7, 19, 2, 15]

  return (
    <div className={`f3-circuit__practice f3-circuit__practice--signal ${done ? 'is-complete' : ''}`}>
      <div className="f3-circuit__practice-command"><span>LIVE TARGET</span><strong>7</strong></div>
      <div className="f3-circuit__practice-signal-grid">
        {values.map((value) => (
          <button
            type="button"
            key={value}
            disabled={done}
            className={value === 7 ? 'is-target' : ''}
            onClick={() => {
              if (value === 7) {
                setDone(true)
                setMessage('Correct. In the real game the board now reshuffles and a new target appears.')
                onReady()
              } else {
                setMessage('That would cost time and points. Look for the requested number: 7.')
              }
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
    </div>
  )
}

function SequencePractice({ onReady }: { onReady: () => void }) {
  const target = ['1', '2', '3', '4', '5', EMPTY_SEQUENCE_TILE]
  const [order, setOrder] = useState(['1', '2', '3', '4', EMPTY_SEQUENCE_TILE, '5'])
  const solved = isSequenceSolved(order, target)

  return (
    <div className={`f3-circuit__practice f3-circuit__practice--sequence ${solved ? 'is-complete' : ''}`}>
      <div className="f3-circuit__practice-sequence-pair">
        <div>
          <span>TARGET</span>
          <div className="f3-circuit__practice-slide-grid">
            {target.map((token, index) => <i key={`${token}-${index}`}>{token === EMPTY_SEQUENCE_TILE ? '' : token}</i>)}
          </div>
        </div>
        <div>
          <span>TRY IT</span>
          <div className="f3-circuit__practice-slide-grid">
            {order.map((token, index) => (
              <button
                type="button"
                key={`${token}-${index}`}
                disabled={solved || token === EMPTY_SEQUENCE_TILE}
                className={token === '5' ? 'is-highlighted' : token === EMPTY_SEQUENCE_TILE ? 'is-empty' : ''}
                onClick={() => {
                  const next = slideSequenceTile(order, index, 2, 3)
                  if (!next) return
                  setOrder(next)
                  if (isSequenceSolved(next, target)) onReady()
                }}
              >
                {token === EMPTY_SEQUENCE_TILE ? '' : token}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p role="status">{solved ? 'Exactly. Tile 5 could move because it touched the empty slot.' : 'Tap the glowing 5 to slide it into the empty slot.'}</p>
    </div>
  )
}

function WardenPractice({ onReady }: { onReady: () => void }) {
  const [player, setPlayer] = useState(12)
  const [guard, setGuard] = useState(0)
  const [done, setDone] = useState(false)
  const walls = new Set([6, 10])
  const highlighted = 13

  const makeMove = () => {
    if (done) return
    setPlayer(highlighted)
    window.setTimeout(() => setGuard(1), 170)
    window.setTimeout(() => {
      setGuard(5)
      setDone(true)
      onReady()
    }, 360)
  }

  return (
    <div className={`f3-circuit__practice f3-circuit__practice--warden ${done ? 'is-complete' : ''}`}>
      <div className="f3-circuit__practice-turn-rule">
        <strong>YOU <b>1</b></strong><span>→ then →</span><strong>GUARD <b>2</b></strong>
      </div>
      <div className="f3-circuit__practice-prison">
        {Array.from({ length: 16 }, (_unused, cell) => {
          const wall = walls.has(cell)
          const isPlayer = cell === player
          const isGuard = cell === guard
          const isExit = cell === 3
          const canTry = !done && cell === highlighted
          return (
            <button
              type="button"
              key={cell}
              className={[
                wall ? 'is-wall' : '',
                isPlayer ? 'is-player' : '',
                isGuard ? 'is-guard' : '',
                isExit ? 'is-exit' : '',
                canTry ? 'is-highlighted' : '',
              ].filter(Boolean).join(' ')}
              disabled={!canTry}
              onClick={makeMove}
              aria-label={canTry ? 'Practice move' : undefined}
            >
              {isPlayer ? 'YOU' : isGuard ? 'G' : isExit ? 'EXIT' : ''}
            </button>
          )
        })}
      </div>
      <p role="status">
        {done
          ? 'You moved one tile. The guard moved right first, then down - two pursuit steps immediately after your move.'
          : 'Tap the glowing square to make one move and watch the guard response.'}
      </p>
    </div>
  )
}

function PowerPractice({ onReady }: { onReady: () => void }) {
  const [selected, setSelected] = useState(false)
  const values = [8, 12, 17]

  return (
    <div className={`f3-circuit__practice f3-circuit__practice--power ${selected ? 'is-complete' : ''}`}>
      <div className="f3-circuit__practice-load"><span>TARGET LOAD</span><strong>20</strong><small>Current {selected ? 8 : 0}</small></div>
      <div className="f3-circuit__practice-cells">
        {values.map((value) => (
          <button
            type="button"
            key={value}
            disabled={selected || value !== 8}
            className={value === 8 ? 'is-highlighted' : ''}
            onClick={() => {
              setSelected(true)
              onReady()
            }}
          >
            <small>POWER CELL</small><strong>+{value}</strong>
          </button>
        ))}
      </div>
      <p role="status">{selected ? '+8 is now permanently committed. In the real round, choose the remaining cells carefully.' : 'Activate the glowing +8 cell. Once committed, it cannot be removed.'}</p>
    </div>
  )
}

function OverridePractice({ onReady }: { onReady: () => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const correct = choice === '47'

  return (
    <div className={`f3-circuit__practice f3-circuit__practice--override ${choice ? (correct ? 'is-complete' : 'is-error') : ''}`}>
      <div className="f3-circuit__practice-question"><span>SAMPLE PROTOCOL</span><strong>Which value is closest to 50?</strong></div>
      <div className="f3-circuit__practice-answers">
        {['31', '47', '64', '78'].map((option) => (
          <button
            type="button"
            key={option}
            disabled={correct}
            onClick={() => {
              setChoice(option)
              if (option === '47') onReady()
            }}
          >
            {option}
          </button>
        ))}
      </div>
      <p role="status">{choice == null ? 'Pick an answer. The real five questions are timed.' : correct ? 'Correct. The real Final Override works exactly like this, but against the clock.' : 'Not quite. 47 is only 3 away from 50 - try again.'}</p>
    </div>
  )
}

export default function CircuitTutorial({ kind, onComplete }: CircuitTutorialProps) {
  const [ready, setReady] = useState(false)
  const meta = META[kind]

  return (
    <section className={`f3-circuit__arena-card f3-circuit__tutorial f3-circuit__tutorial--${kind}`}>
      <div className="f3-circuit__tutorial-beam" aria-hidden="true" />
      <div className="f3-circuit__section-heading">
        <div>
          <p className="f3-circuit__eyebrow">{meta.eyebrow}</p>
          <h2>{meta.title}</h2>
        </div>
        <span>Practice</span>
      </div>

      <p className="f3-circuit__copy f3-circuit__tutorial-intro">{meta.intro}</p>

      <div className="f3-circuit__tutorial-rules">
        {meta.rules.map((rule, index) => (
          <div key={rule}><span>0{index + 1}</span><p>{rule}</p></div>
        ))}
      </div>

      {kind === 'signal' && <SignalPractice onReady={() => setReady(true)} />}
      {kind === 'sequence' && <SequencePractice onReady={() => setReady(true)} />}
      {kind === 'warden' && <WardenPractice onReady={() => setReady(true)} />}
      {kind === 'power' && <PowerPractice onReady={() => setReady(true)} />}
      {kind === 'override' && <OverridePractice onReady={() => setReady(true)} />}

      <button
        type="button"
        className={`f3-circuit__primary f3-circuit__tutorial-start ${ready ? 'is-ready' : ''}`}
        disabled={!ready}
        onClick={onComplete}
      >
        {ready ? meta.startLabel : 'Try the practice move first'}
      </button>
    </section>
  )
}
