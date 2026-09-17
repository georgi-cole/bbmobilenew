import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import {
  buildMemoryLaneQuestionBank,
  simulateMemoryLaneAiDecision,
  type MemoryLaneQuestion,
} from './downMemoryLaneLogic'
import './DownMemoryLane.css'

const STARTING_LIVES = 5
const OPEN_BUZZ_WINDOW_MS = 8_000
const HUMAN_ANSWER_WINDOW_MS = 6_000
const BETWEEN_QUESTIONS_MS = 1_450

function portraitFor(
  id: string,
  gamePlayers: Array<{ id: string; avatar: string }>,
  fallback?: string
): string {
  return gamePlayers.find((player) => player.id === id)?.avatar || fallback || '👤'
}

function isImageAvatar(value: string | undefined): boolean {
  if (!value) return false
  return /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(value) || value.startsWith('/') || value.startsWith('assets/') || value.startsWith('http')
}

function LifePips({ lives, side }: { lives: number; side: 'human' | 'ai' }) {
  return (
    <div className={`memory-lane__lives is-${side}`} aria-label={`${lives} lives remaining`}>
      {Array.from({ length: STARTING_LIVES }, (_, index) => (
        <span key={index} className={index < lives ? 'is-live' : 'is-lost'} />
      ))}
    </div>
  )
}

export default function DownMemoryLane({
  seed = 424242,
  participantIds = [],
  participants = [],
  onFinish,
}: GenericMinigameProps) {
  const game = useAppSelector((state) => state.game)
  const duelists = useMemo(() => {
    const ordered = participantIds
      .map((id) => participants.find((participant) => participant.id === id))
      .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
    const source = ordered.length >= 2 ? ordered : participants
    const human = source.find((participant) => participant.isHuman) ?? source[0]
    const ai = source.find((participant) => participant.id !== human?.id) ?? source[1]
    return { human, ai }
  }, [participantIds, participants])

  const questionBank = useMemo(() => buildMemoryLaneQuestionBank(game, seed), [game, seed])
  const [screen, setScreen] = useState<'tutorial' | 'duel' | 'finished'>('tutorial')
  const [practiceDone, setPracticeDone] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [humanLives, setHumanLives] = useState(STARTING_LIVES)
  const [aiLives, setAiLives] = useState(STARTING_LIVES)
  const [buzzOwner, setBuzzOwner] = useState<'human' | 'ai' | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackTone, setFeedbackTone] = useState<'good' | 'bad' | 'neutral'>('neutral')
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now())
  const [humanAnswerRemaining, setHumanAnswerRemaining] = useState(HUMAN_ANSWER_WINDOW_MS)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const timerRefs = useRef<number[]>([])

  const clearTimers = () => {
    timerRefs.current.forEach((timer) => window.clearTimeout(timer))
    timerRefs.current = []
  }

  useEffect(() => clearTimers, [])

  const currentQuestion: MemoryLaneQuestion | null =
    questionBank.length > 0 ? questionBank[questionIndex % questionBank.length] : null

  const gamePlayersById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player])),
    [game.players]
  )

  const opponentAbility = useMemo(() => {
    const score = duelists.ai?.precomputedScore
    if (typeof score === 'number' && Number.isFinite(score)) return score
    const profile = gamePlayersById.get(duelists.ai?.id ?? '')?.competitionProfile
    if (!profile) return 68
    const numeric = Object.values(profile).filter((value): value is number => typeof value === 'number')
    if (numeric.length === 0) return 68
    const average = numeric.reduce((sum, value) => sum + value, 0) / numeric.length
    return average <= 1 ? average * 100 : average
  }, [duelists.ai?.id, duelists.ai?.precomputedScore, gamePlayersById])

  const advanceQuestion = () => {
    clearTimers()
    setBuzzOwner(null)
    setSelectedAnswer(null)
    setFeedback(null)
    setFeedbackTone('neutral')
    setHumanAnswerRemaining(HUMAN_ANSWER_WINDOW_MS)
    setQuestionIndex((current) => current + 1)
    setQuestionStartedAt(Date.now())
  }

  const finishDuel = (nextWinnerId: string, nextHumanLives: number, nextAiLives: number) => {
    clearTimers()
    setWinnerId(nextWinnerId)
    setHumanLives(nextHumanLives)
    setAiLives(nextAiLives)
    setScreen('finished')
  }

  const applyDamage = (
    answeredBy: 'human' | 'ai',
    correct: boolean,
    answerId: string
  ) => {
    if (!currentQuestion || !duelists.human || !duelists.ai) return
    setSelectedAnswer(answerId)
    const answerName = gamePlayersById.get(answerId)?.name ?? participants.find((p) => p.id === answerId)?.name ?? 'That answer'
    if (answeredBy === 'human') {
      if (correct) {
        const nextAiLives = Math.max(0, aiLives - 1)
        setAiLives(nextAiLives)
        setFeedback(`${answerName} — correct. ${duelists.ai.name} loses a life.`)
        setFeedbackTone('good')
        if (nextAiLives === 0) {
          timerRefs.current.push(window.setTimeout(() => finishDuel(duelists.human!.id, humanLives, nextAiLives), 900))
          return
        }
      } else {
        const nextHumanLives = Math.max(0, humanLives - 1)
        setHumanLives(nextHumanLives)
        setFeedback(`${answerName} — wrong. You lose a life.`)
        setFeedbackTone('bad')
        if (nextHumanLives === 0) {
          timerRefs.current.push(window.setTimeout(() => finishDuel(duelists.ai!.id, nextHumanLives, aiLives), 900))
          return
        }
      }
    } else {
      if (correct) {
        const nextHumanLives = Math.max(0, humanLives - 1)
        setHumanLives(nextHumanLives)
        setFeedback(`${duelists.ai.name} got it right. You lose a life.`)
        setFeedbackTone('bad')
        if (nextHumanLives === 0) {
          timerRefs.current.push(window.setTimeout(() => finishDuel(duelists.ai!.id, nextHumanLives, aiLives), 900))
          return
        }
      } else {
        const nextAiLives = Math.max(0, aiLives - 1)
        setAiLives(nextAiLives)
        setFeedback(`${duelists.ai.name} missed it and loses a life.`)
        setFeedbackTone('good')
        if (nextAiLives === 0) {
          timerRefs.current.push(window.setTimeout(() => finishDuel(duelists.human!.id, humanLives, nextAiLives), 900))
          return
        }
      }
    }
    timerRefs.current.push(window.setTimeout(advanceQuestion, BETWEEN_QUESTIONS_MS))
  }

  useEffect(() => {
    if (screen !== 'duel' || !currentQuestion || buzzOwner || feedback || !duelists.ai || !duelists.human) return
    clearTimers()
    const aiDecision = simulateMemoryLaneAiDecision({
      seed: seed + questionIndex * 977,
      question: currentQuestion,
      aiPlayerId: duelists.ai.id,
      aiAbility: opponentAbility,
      aiLives,
      humanLives,
    })

    if (aiDecision.willBuzz) {
      const aiTimer = window.setTimeout(() => {
        setBuzzOwner('ai')
        const resolveTimer = window.setTimeout(() => {
          applyDamage('ai', aiDecision.correct, aiDecision.answerPlayerId)
        }, 720)
        timerRefs.current.push(resolveTimer)
      }, aiDecision.delayMs)
      timerRefs.current.push(aiTimer)
    }

    const expireTimer = window.setTimeout(() => {
      setFeedback('Nobody buzzed. Next memory.')
      setFeedbackTone('neutral')
      timerRefs.current.push(window.setTimeout(advanceQuestion, 850))
    }, OPEN_BUZZ_WINDOW_MS)
    timerRefs.current.push(expireTimer)

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, questionIndex, currentQuestion?.id, buzzOwner])

  useEffect(() => {
    if (screen !== 'duel' || buzzOwner !== 'human' || feedback) return
    setHumanAnswerRemaining(HUMAN_ANSWER_WINDOW_MS)
    const interval = window.setInterval(() => {
      setHumanAnswerRemaining((current) => Math.max(0, current - 100))
    }, 100)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      if (currentQuestion) applyDamage('human', false, '__timeout__')
    }, HUMAN_ANSWER_WINDOW_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzOwner, screen])

  if (!duelists.human || !duelists.ai) {
    return (
      <div className="memory-lane memory-lane--empty">
        <strong>Down Memory Lane needs two finalists.</strong>
      </div>
    )
  }

  if (questionBank.length < 4) {
    return (
      <div className="memory-lane memory-lane--empty">
        <strong>Not enough season receipts yet.</strong>
        <span>This finale duel needs a completed season history to build fair questions.</span>
      </div>
    )
  }

  if (screen === 'tutorial') {
    return (
      <div className="memory-lane memory-lane--tutorial">
        <div className="memory-lane__aurora" aria-hidden="true" />
        <p className="memory-lane__kicker">Final HOH · Part 3</p>
        <h1>Down Memory Lane</h1>
        <p className="memory-lane__lede">Five lives each. Buzz first, then choose the housemate who matches the season memory.</p>
        <div className="memory-lane__tutorial-rule">
          <span>✓ Correct</span><strong>Opponent −1 life</strong>
          <span>✕ Wrong</span><strong>You −1 life</strong>
        </div>
        <div className="memory-lane__practice">
          <small>Try the buzzer once</small>
          <button
            type="button"
            className={practiceDone ? 'memory-lane__buzzer is-practiced' : 'memory-lane__buzzer'}
            onClick={() => setPracticeDone(true)}
          >
            <span>{practiceDone ? 'READY' : 'BUZZ'}</span>
          </button>
        </div>
        <button
          type="button"
          className="memory-lane__start"
          disabled={!practiceDone}
          onClick={() => {
            setScreen('duel')
            setQuestionStartedAt(Date.now())
          }}
        >
          Start the duel
        </button>
      </div>
    )
  }

  if (screen === 'finished') {
    const humanWon = winnerId === duelists.human.id
    return (
      <div className={`memory-lane memory-lane--finished ${humanWon ? 'is-win' : 'is-loss'}`}>
        <div className="memory-lane__aurora" aria-hidden="true" />
        <p className="memory-lane__kicker">Final answer</p>
        <h1>{humanWon ? 'You own the memories.' : `${duelists.ai.name} remembers.`}</h1>
        <div className="memory-lane__winner-medallion">
          {(() => {
            const winner = winnerId === duelists.human.id ? duelists.human : duelists.ai
            const avatar = portraitFor(winner.id, game.players, winner.avatar)
            return isImageAvatar(avatar) ? <img src={avatar} alt={winner.name} /> : <span>{avatar}</span>
          })()}
        </div>
        <strong className="memory-lane__winner-name">
          {winnerId === duelists.human.id ? duelists.human.name : duelists.ai.name} wins Part 3
        </strong>
        <p className="memory-lane__final-copy">The Final HOH is decided. One final power remains.</p>
        <button
          type="button"
          className="memory-lane__start"
          onClick={() => {
            const humanScore = humanLives * 20 + (humanWon ? 100 : 0)
            onFinish?.(humanScore, undefined, {
              authoritativeWinnerId: winnerId,
              authoritativeLastPlaceId: humanWon ? duelists.ai!.id : duelists.human!.id,
              rawValue: humanScore,
              rawResults: {
                [duelists.human!.id]: humanLives,
                [duelists.ai!.id]: aiLives,
              },
            })
          }}
        >
          Confirm Final HOH
        </button>
      </div>
    )
  }

  if (!currentQuestion) return null

  const humanAvatar = portraitFor(duelists.human.id, game.players, duelists.human.avatar)
  const aiAvatar = portraitFor(duelists.ai.id, game.players, duelists.ai.avatar)
  const elapsed = Math.max(0, Date.now() - questionStartedAt)
  const buzzWindowPct = Math.max(0, Math.min(100, 100 - (elapsed / OPEN_BUZZ_WINDOW_MS) * 100))

  return (
    <div className={`memory-lane memory-lane--duel ${feedbackTone !== 'neutral' ? `is-${feedbackTone}` : ''}`}>
      <div className="memory-lane__aurora" aria-hidden="true" />
      <header className="memory-lane__duel-header">
        <div className="memory-lane__fighter is-human">
          <div className="memory-lane__portrait">
            {isImageAvatar(humanAvatar) ? <img src={humanAvatar} alt={duelists.human.name} /> : <span>{humanAvatar}</span>}
          </div>
          <div><strong>{duelists.human.name}</strong><LifePips lives={humanLives} side="human" /></div>
        </div>
        <div className="memory-lane__versus">VS</div>
        <div className="memory-lane__fighter is-ai">
          <div><strong>{duelists.ai.name}</strong><LifePips lives={aiLives} side="ai" /></div>
          <div className="memory-lane__portrait">
            {isImageAvatar(aiAvatar) ? <img src={aiAvatar} alt={duelists.ai.name} /> : <span>{aiAvatar}</span>}
          </div>
        </div>
      </header>

      <main className="memory-lane__question-stage">
        <div className="memory-lane__question-meta">
          <span>{currentQuestion.category}</span>
          <span>Memory {questionIndex + 1}</span>
        </div>
        <h2>{currentQuestion.prompt}</h2>

        {!buzzOwner && !feedback && (
          <>
            <div className="memory-lane__buzz-clock"><i style={{ width: `${buzzWindowPct}%` }} /></div>
            <button
              type="button"
              className="memory-lane__buzzer memory-lane__buzzer--live"
              onClick={() => {
                clearTimers()
                setBuzzOwner('human')
              }}
            >
              <span>BUZZ</span>
              <small>Tap when you know it</small>
            </button>
          </>
        )}

        {buzzOwner === 'ai' && !feedback && (
          <div className="memory-lane__ai-buzz" role="status">
            <span className="memory-lane__pulse-ring" />
            <strong>{duelists.ai.name} buzzed!</strong>
            <small>Answer locked…</small>
          </div>
        )}

        {buzzOwner === 'human' && !feedback && (
          <>
            <div className="memory-lane__answer-clock">
              <span>Choose</span>
              <strong>{Math.max(0, Math.ceil(humanAnswerRemaining / 1000))}</strong>
            </div>
            <div className="memory-lane__answers">
              {currentQuestion.optionPlayerIds.map((id) => {
                const player = gamePlayersById.get(id)
                const participant = participants.find((entry) => entry.id === id)
                const name = player?.name ?? participant?.name ?? id
                const avatar = portraitFor(id, game.players, participant?.avatar)
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => applyDamage('human', id === currentQuestion.correctPlayerId, id)}
                  >
                    <div className="memory-lane__answer-photo">
                      {isImageAvatar(avatar) ? <img src={avatar} alt="" /> : <span>{avatar}</span>}
                    </div>
                    <strong>{name}</strong>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {feedback && (
          <div className={`memory-lane__feedback is-${feedbackTone}`} role="status">
            <strong>{feedbackTone === 'good' ? 'NICE MEMORY' : feedbackTone === 'bad' ? 'OOPS' : 'TIME'}</strong>
            <span>{feedback}</span>
            {selectedAnswer && selectedAnswer !== '__timeout__' && currentQuestion.correctPlayerId !== selectedAnswer && (
              <small>Correct: {gamePlayersById.get(currentQuestion.correctPlayerId)?.name ?? currentQuestion.correctPlayerId}</small>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
