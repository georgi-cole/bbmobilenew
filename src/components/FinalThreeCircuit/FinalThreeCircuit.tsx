import { useMemo, useState } from 'react'
import { rankCircuitResults, splitAiCircuitScore, type CircuitStageScores } from './finalThreeCircuitLogic'
import SignalHuntStage from './SignalHuntStage'
import SequenceStage from './SequenceStage'
import RiskRunStage from './RiskRunStage'
import './FinalThreeCircuit.css'

interface CircuitParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  precomputedScore: number
  previousPR: number | null
}

interface FinalThreeCircuitProps {
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null
      authoritativeLastPlaceId?: string | null
      rawValue?: number
      rawResults?: Record<string, number>
      tiebreakerMs?: number
    }
  ) => void
  seed?: number
  participantIds?: string[]
  participants?: CircuitParticipant[]
}

type View = 'signal' | 'summary1' | 'sequence' | 'summary2' | 'risk' | 'final'

interface FinalResult {
  humanTotal: number
  totals: Record<string, number>
  stages: Record<string, CircuitStageScores>
  ranking: string[]
}

function fallbackParticipants(
  participants?: CircuitParticipant[],
  participantIds?: string[]
): CircuitParticipant[] {
  if (participants && participants.length >= 3) return participants.slice(0, 3)
  const ids = [...(participantIds ?? [])]
  while (ids.length < 3) ids.push(`circuit-demo-${ids.length + 1}`)
  return ids.slice(0, 3).map((id, index) => ({
    id,
    name: index === 0 ? 'You' : `Finalist ${index + 1}`,
    isHuman: index === 0,
    precomputedScore: index === 1 ? 232 : index === 2 ? 216 : 0,
    previousPR: null,
  }))
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function normalizeCircuitAiTotal(score: number): number {
  // Minigame Lab supplies generic 0-100 preview scores. Hosted Final 3 runs use
  // the Circuit's native 0-300 score economy, so lift only preview-scale values.
  if (score >= 0 && score <= 100) return Math.round(150 + score * 1.2)
  return score
}

function StageBars({ scores, completed }: { scores: CircuitStageScores; completed: number }) {
  return (
    <div className="f3-circuit__stage-bars" aria-label={`${completed} of 3 stages complete`}>
      {scores.map((score, index) => (
        <span
          key={index}
          className={index < completed ? 'is-complete' : ''}
          style={index < completed ? { '--stage-fill': `${Math.max(8, score)}%` } as React.CSSProperties : undefined}
        >
          <i />
        </span>
      ))}
    </div>
  )
}

export default function FinalThreeCircuit({
  onFinish,
  seed = 0,
  participantIds,
  participants,
}: FinalThreeCircuitProps) {
  const roster = useMemo(
    () => fallbackParticipants(participants, participantIds),
    [participantIds, participants]
  )
  const human = roster.find((player) => player.isHuman) ?? roster[0]
  const [view, setView] = useState<View>('signal')
  const [humanStages, setHumanStages] = useState<CircuitStageScores>([0, 0, 0])
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const stageScores = useMemo(() => {
    const result: Record<string, CircuitStageScores> = {}
    roster.forEach((player) => {
      result[player.id] =
        player.id === human.id
          ? humanStages
          : splitAiCircuitScore(normalizeCircuitAiTotal(player.precomputedScore), seed, player.id)
    })
    return result
  }, [human.id, humanStages, roster, seed])

  const completedStages =
    view === 'signal'
      ? 0
      : view === 'summary1' || view === 'sequence'
        ? 1
        : view === 'summary2' || view === 'risk'
          ? 2
          : 3

  const displayStages = finalResult?.stages ?? stageScores
  const totals = useMemo(
    () =>
      finalResult?.totals ??
      Object.fromEntries(
        roster.map((player) => [
          player.id,
          stageScores[player.id]
            .slice(0, completedStages)
            .reduce((sum, score) => sum + score, 0),
        ])
      ),
    [completedStages, finalResult, roster, stageScores]
  )

  const standings = useMemo(() => {
    const rankOrder = finalResult?.ranking
    if (rankOrder) {
      const position = new Map(rankOrder.map((id, index) => [id, index]))
      return [...roster].sort((a, b) => (position.get(a.id) ?? 99) - (position.get(b.id) ?? 99))
    }
    return [...roster].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
  }, [finalResult, roster, totals])

  const currentStage =
    view === 'signal' || view === 'summary1'
      ? 1
      : view === 'sequence' || view === 'summary2'
        ? 2
        : 3

  const completeSignal = (score: number) => {
    setHumanStages((current) => [score, current[1], current[2]])
    setView('summary1')
  }

  const completeSequence = (score: number) => {
    setHumanStages((current) => [current[0], score, current[2]])
    setView('summary2')
  }

  const completeRisk = (score: number) => {
    const finalHumanStages: CircuitStageScores = [humanStages[0], humanStages[1], score]
    const finalStages = { ...stageScores, [human.id]: finalHumanStages }
    const finalTotals = Object.fromEntries(
      roster.map((player) => [
        player.id,
        finalStages[player.id].reduce((sum, stageScore) => sum + stageScore, 0),
      ])
    )
    const ranking = rankCircuitResults(
      roster.map((player) => player.id),
      finalTotals,
      finalStages,
      seed
    )
    const humanTotal = finalTotals[human.id] ?? 0

    setHumanStages(finalHumanStages)
    setFinalResult({ humanTotal, totals: finalTotals, stages: finalStages, ranking })
    setView('final')
  }

  const submitFinalResult = () => {
    if (!finalResult || submitted) return
    setSubmitted(true)
    onFinish?.(finalResult.humanTotal, undefined, {
      authoritativeWinnerId: finalResult.ranking[0] ?? human.id,
      authoritativeLastPlaceId: finalResult.ranking[finalResult.ranking.length - 1] ?? null,
      rawValue: finalResult.humanTotal,
      rawResults: finalResult.totals,
    })
  }

  const summary = view === 'summary1' || view === 'summary2'
  const summaryIndex = view === 'summary1' ? 0 : 1
  const stageName = summaryIndex === 0 ? 'Signal Hunt' : 'Sequence Builder'
  const winner = finalResult
    ? roster.find((player) => player.id === finalResult.ranking[0]) ?? roster[0]
    : null
  const humanFinalRank = finalResult ? finalResult.ranking.indexOf(human.id) + 1 : 0
  const otherPartTwoPlayer = finalResult
    ? roster.find(
        (player) =>
          player.id !== human.id && player.id !== finalResult.ranking[0]
      )
    : null

  return (
    <div className="f3-circuit" data-stage={currentStage} data-view={view}>
      <div className="f3-circuit__grain" aria-hidden="true" />
      <div className="f3-circuit__ambient f3-circuit__ambient--one" />
      <div className="f3-circuit__ambient f3-circuit__ambient--two" />
      <div className="f3-circuit__shell">
        <header className="f3-circuit__hero">
          <div className="f3-circuit__hero-copy">
            <p>Final HOH · Part 1</p>
            <h1>Final Three Circuit</h1>
          </div>
          <div className="f3-circuit__progress" aria-label={`Stage ${currentStage} of 3`}>
            {[1, 2, 3].map((stage) => (
              <span key={stage} className={stage <= currentStage ? 'is-active' : ''} />
            ))}
          </div>
        </header>

        <section className="f3-circuit__finalist-rail" aria-label="Final Three standings">
          {standings.map((player, index) => (
            <div
              className={[
                'f3-circuit__finalist',
                player.id === human.id ? 'is-human' : '',
                index === 0 && completedStages > 0 ? 'is-leading' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={player.id}
            >
              <div className="f3-circuit__finalist-rank">#{index + 1}</div>
              <div className="f3-circuit__avatar" aria-hidden="true">
                {player.avatar ? <img src={player.avatar} alt="" /> : initials(player.name)}
              </div>
              <div className="f3-circuit__finalist-copy">
                <strong>{player.name}</strong>
                <span>{completedStages === 0 ? 'Ready' : `${totals[player.id] ?? 0} pts`}</span>
                <StageBars scores={displayStages[player.id]} completed={completedStages} />
              </div>
            </div>
          ))}
        </section>

        <main className="f3-circuit__main">
          {view === 'signal' && <SignalHuntStage seed={seed} onComplete={completeSignal} />}
          {view === 'sequence' && <SequenceStage seed={seed} onComplete={completeSequence} />}
          {view === 'risk' && <RiskRunStage seed={seed} onComplete={completeRisk} />}

          {summary && (
            <section className="f3-circuit__arena-card f3-circuit__summary-card">
              <div className="f3-circuit__summary-orbit" aria-hidden="true" />
              <p className="f3-circuit__eyebrow">Stage {summaryIndex + 1} complete</p>
              <h2>{stageName}</h2>
              <div className="f3-circuit__stage-results">
                {[...roster]
                  .sort(
                    (a, b) => displayStages[b.id][summaryIndex] - displayStages[a.id][summaryIndex]
                  )
                  .map((player, index) => (
                    <div key={player.id} className={player.id === human.id ? 'is-human' : ''}>
                      <span>#{index + 1} {player.name}</span>
                      <strong>{displayStages[player.id][summaryIndex]} / 100</strong>
                    </div>
                  ))}
              </div>
              <button
                type="button"
                className="f3-circuit__primary"
                onClick={() => setView(summaryIndex === 0 ? 'sequence' : 'risk')}
              >
                {summaryIndex === 0 ? 'Enter Sequence Builder' : 'Enter Risk Run'}
              </button>
            </section>
          )}

          {view === 'final' && finalResult && winner && (
            <section className="f3-circuit__arena-card f3-circuit__final-results">
              <div className="f3-circuit__winner-aura" aria-hidden="true" />
              <div className="f3-circuit__final-results-header">
                <div>
                  <p className="f3-circuit__eyebrow">Final Three Circuit complete</p>
                  <h2>Part 1 is decided</h2>
                </div>
                <div className="f3-circuit__winner-seal" aria-hidden="true">
                  <span>1</span>
                  <small>PART 3</small>
                </div>
              </div>

              <div className="f3-circuit__qualification-callout">
                <span className="f3-circuit__qualification-kicker">Direct qualifier</span>
                <strong>{winner.name}</strong>
                <p>
                  {winner.id === human.id
                    ? 'You won Part 1 and advance directly to Final HOH Part 3.'
                    : `${winner.name} advances directly to Final HOH Part 3.`}
                </p>
              </div>

              <div className="f3-circuit__final-scoreboard" role="table" aria-label="Final Three Circuit results">
                {standings.map((player, index) => {
                  const scores = finalResult.stages[player.id]
                  return (
                    <div
                      className={`f3-circuit__final-score-row ${player.id === human.id ? 'is-human' : ''} ${index === 0 ? 'is-winner' : ''}`}
                      key={player.id}
                      role="row"
                    >
                      <span className="f3-circuit__final-place">#{index + 1}</span>
                      <div className="f3-circuit__final-person">
                        <div className="f3-circuit__avatar" aria-hidden="true">
                          {player.avatar ? <img src={player.avatar} alt="" /> : initials(player.name)}
                        </div>
                        <strong>{player.name}</strong>
                      </div>
                      <div className="f3-circuit__score-breakdown">
                        <span><small>S1</small>{scores[0]}</span>
                        <span><small>S2</small>{scores[1]}</span>
                        <span><small>S3</small>{scores[2]}</span>
                      </div>
                      <strong className="f3-circuit__final-total">{finalResult.totals[player.id]}</strong>
                    </div>
                  )
                })}
              </div>

              <div className="f3-circuit__next-step">
                {humanFinalRank === 1 ? (
                  <>
                    <span>Next stop</span>
                    <strong>Final HOH Part 3</strong>
                    <p>The other two finalists will face each other in Part 2.</p>
                  </>
                ) : (
                  <>
                    <span>Your next challenge</span>
                    <strong>Final HOH Part 2</strong>
                    <p>
                      You and {otherPartTwoPlayer?.name ?? 'the other non-winner'} compete for the final Part 3 seat.
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                className="f3-circuit__primary f3-circuit__primary--final"
                onClick={submitFinalResult}
                disabled={submitted}
              >
                {submitted ? 'Result confirmed' : 'Confirm results'}
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
