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

type View = 'signal' | 'summary1' | 'sequence' | 'summary2' | 'risk'

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
    view === 'signal' ? 0 : view === 'summary1' || view === 'sequence' ? 1 : 2
  const totals = useMemo(
    () =>
      Object.fromEntries(
        roster.map((player) => [
          player.id,
          stageScores[player.id]
            .slice(0, completedStages)
            .reduce((sum, score) => sum + score, 0),
        ])
      ),
    [completedStages, roster, stageScores]
  )
  const standings = useMemo(
    () => [...roster].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0)),
    [roster, totals]
  )

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
    onFinish?.(humanTotal, undefined, {
      authoritativeWinnerId: ranking[0] ?? human.id,
      authoritativeLastPlaceId: ranking[ranking.length - 1] ?? null,
      rawValue: humanTotal,
      rawResults: finalTotals,
    })
  }

  const summary = view === 'summary1' || view === 'summary2'
  const summaryIndex = view === 'summary1' ? 0 : 1
  const stageName = summaryIndex === 0 ? 'Signal Hunt' : 'Sequence Builder'

  return (
    <div className="f3-circuit" data-stage={currentStage}>
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
              className={`f3-circuit__finalist ${player.id === human.id ? 'is-human' : ''}`}
              key={player.id}
            >
              <div className="f3-circuit__finalist-rank">#{index + 1}</div>
              <div className="f3-circuit__avatar" aria-hidden="true">
                {player.avatar ? <img src={player.avatar} alt="" /> : initials(player.name)}
              </div>
              <div className="f3-circuit__finalist-copy">
                <strong>{player.name}</strong>
                <span>{completedStages === 0 ? 'Ready' : `${totals[player.id] ?? 0} pts`}</span>
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
              <p className="f3-circuit__eyebrow">Stage {summaryIndex + 1} complete</p>
              <h2>{stageName}</h2>
              <div className="f3-circuit__stage-results">
                {[...roster]
                  .sort(
                    (a, b) => stageScores[b.id][summaryIndex] - stageScores[a.id][summaryIndex]
                  )
                  .map((player, index) => (
                    <div key={player.id} className={player.id === human.id ? 'is-human' : ''}>
                      <span>#{index + 1} {player.name}</span>
                      <strong>{stageScores[player.id][summaryIndex]} / 100</strong>
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
        </main>
      </div>
    </div>
  )
}
