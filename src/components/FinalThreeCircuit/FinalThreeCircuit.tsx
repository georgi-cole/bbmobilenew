import { useMemo, useState, type CSSProperties } from 'react'
import { rankCircuitResults, type CircuitStageScores } from './finalThreeCircuitLogic'
import { simulateAiCircuitScores } from './finalThreeCircuitAi'
import CircuitTutorial from './CircuitTutorial'
import SignalHuntStage from './SignalHuntStage'
import SequenceStage from './SequenceStage'
import RiskRunStage from './RiskRunStage'
import './FinalThreeCircuit.css'
import './FinalThreeCircuitPolish.css'
import './FinalThreeCircuitMobile.css'

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

type View =
  | 'tutorialSignal'
  | 'signal'
  | 'summary1'
  | 'tutorialSequence'
  | 'sequence'
  | 'summary2'
  | 'risk'
  | 'final'

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
  if (participants && participants.length >= 2) return participants.slice(0, 3)

  const ids = [...(participantIds ?? [])].slice(0, 3)
  const desiredCount = ids.length === 2 ? 2 : 3
  while (ids.length < desiredCount) ids.push(`circuit-demo-${ids.length + 1}`)

  return ids.map((id, index) => ({
    id,
    name: index === 0 ? 'You' : `Finalist ${index + 1}`,
    isHuman: index === 0,
    precomputedScore: index === 1 ? 78 : index === 2 ? 68 : 0,
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

function StageBars({ scores, completed }: { scores: CircuitStageScores; completed: number }) {
  return (
    <div className="f3-circuit__stage-bars" aria-label={`${completed} of 3 stages complete`}>
      {scores.map((score, index) => (
        <span
          key={index}
          className={index < completed ? 'is-complete' : ''}
          style={index < completed ? ({ '--stage-fill': `${Math.max(8, score)}%` } as CSSProperties) : undefined}
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
  const finalPart = roster.length === 2 ? 2 : 1
  const human = roster.find((player) => player.isHuman) ?? roster[0]
  const [view, setView] = useState<View>('tutorialSignal')
  const [humanStages, setHumanStages] = useState<CircuitStageScores>([0, 0, 0])
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const stageScores = useMemo(() => {
    const result: Record<string, CircuitStageScores> = {}
    roster.forEach((player) => {
      result[player.id] =
        player.id === human.id
          ? humanStages
          : simulateAiCircuitScores(player.precomputedScore, seed, player.id)
    })
    return result
  }, [human.id, humanStages, roster, seed])

  const completedStages =
    view === 'tutorialSignal' || view === 'signal'
      ? 0
      : view === 'summary1' || view === 'tutorialSequence' || view === 'sequence'
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
    view === 'tutorialSignal' || view === 'signal' || view === 'summary1'
      ? 1
      : view === 'tutorialSequence' || view === 'sequence' || view === 'summary2'
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
  const showStandingsRail = summary || view === 'final'
  const summaryIndex = view === 'summary1' ? 0 : 1
  const stageName = summaryIndex === 0 ? 'Signal Hunt' : 'Sequence Builder'
  const winner = finalResult
    ? roster.find((player) => player.id === finalResult.ranking[0]) ?? roster[0]
    : null
  const humanFinalRank = finalResult ? finalResult.ranking.indexOf(human.id) + 1 : 0
  const otherPartTwoPlayer =
    finalPart === 1 && finalResult
      ? roster.find((player) => player.id !== human.id && player.id !== finalResult.ranking[0])
      : null

  return (
    <div className="f3-circuit" data-stage={currentStage} data-view={view} data-final-part={finalPart}>
      <div className="f3-circuit__grain" aria-hidden="true" />
      <div className="f3-circuit__ambient f3-circuit__ambient--one" />
      <div className="f3-circuit__ambient f3-circuit__ambient--two" />
      <div className="f3-circuit__spectacle" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
      <div className="f3-circuit__shell">
        <header className="f3-circuit__hero">
          <div className="f3-circuit__hero-copy">
            <p>Final HOH · Part {finalPart}</p>
            {view === 'tutorialSignal' && <h1>Final Three Circuit</h1>}
          </div>
          <div className="f3-circuit__progress" aria-label={`Stage ${currentStage} of 3`}>
            {[1, 2, 3].map((stage) => (
              <span key={stage} className={stage <= currentStage ? 'is-active' : ''} />
            ))}
          </div>
        </header>

        {showStandingsRail && (
          <section className="f3-circuit__finalist-rail" aria-label="Circuit standings">
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
        )}

        <main className="f3-circuit__main">
          {view === 'tutorialSignal' && (
            <CircuitTutorial kind="signal" onComplete={() => setView('signal')} />
          )}
          {view === 'signal' && <SignalHuntStage seed={seed} onComplete={completeSignal} />}
          {view === 'tutorialSequence' && (
            <CircuitTutorial kind="sequence" onComplete={() => setView('sequence')} />
          )}
          {view === 'sequence' && <SequenceStage seed={seed} onComplete={completeSequence} />}
          {view === 'risk' && <RiskRunStage seed={seed} onComplete={completeRisk} />}

          {summary && (
            <section className="f3-circuit__arena-card f3-circuit__summary-card">
              <div className="f3-circuit__summary-orbit" aria-hidden="true" />
              <p className="f3-circuit__eyebrow">Stage {summaryIndex + 1} complete</p>
              <h2>{stageName}</h2>
              <div className="f3-circuit__stage-results">
                {[...roster]
                  .sort((a, b) => displayStages[b.id][summaryIndex] - displayStages[a.id][summaryIndex])
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
                onClick={() => setView(summaryIndex === 0 ? 'tutorialSequence' : 'risk')}
              >
                {summaryIndex === 0 ? 'Next stage' : 'Enter Risk Run'}
              </button>
            </section>
          )}

          {view === 'final' && finalResult && winner && (
            <section className="f3-circuit__arena-card f3-circuit__final-results">
              <div className="f3-circuit__winner-aura" aria-hidden="true" />
              <div className="f3-circuit__final-results-header">
                <div>
                  <p className="f3-circuit__eyebrow">Circuit complete</p>
                  <h2>Part {finalPart} is decided</h2>
                </div>
                <div className="f3-circuit__winner-seal" aria-hidden="true">
                  <span>1</span>
                  <small>PART 3</small>
                </div>
              </div>

              <div className="f3-circuit__qualification-callout">
                <span className="f3-circuit__qualification-kicker">Part {finalPart} winner</span>
                <strong>{winner.name}</strong>
                <p>{winner.id === human.id ? 'You advance to Final HOH Part 3.' : `${winner.name} advances to Final HOH Part 3.`}</p>
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
                    <p>{finalPart === 1 ? 'The other two finalists now play Part 2.' : 'You earned the final Part 3 seat.'}</p>
                  </>
                ) : finalPart === 1 ? (
                  <>
                    <span>Your next challenge</span>
                    <strong>Final HOH Part 2</strong>
                    <p>You and {otherPartTwoPlayer?.name ?? 'the other non-winner'} compete for the final Part 3 seat.</p>
                  </>
                ) : (
                  <>
                    <span>Final HOH</span>
                    <strong>Your competition run ends here</strong>
                    <p>You remain one of the Final 3, but the Part 3 seat goes to {winner.name}.</p>
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
