import { useMemo, useState } from 'react'
import { rankCircuitResults, splitAiCircuitScore, type CircuitStageScores } from './finalThreeCircuitLogic'
import PrecisionStage from './PrecisionStage'
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

type View = 'precision' | 'summary1' | 'sequence' | 'summary2' | 'risk'

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
    precomputedScore: index === 1 ? 216 : index === 2 ? 204 : 0,
    previousPR: null,
  }))
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

export default function FinalThreeCircuit({
  onFinish,
  seed = 0,
  participantIds,
  participants,
}: FinalThreeCircuitProps) {
  const roster = useMemo(() => fallbackParticipants(participants, participantIds), [participantIds, participants])
  const human = roster.find((player) => player.isHuman) ?? roster[0]
  const [view, setView] = useState<View>('precision')
  const [humanStages, setHumanStages] = useState<CircuitStageScores>([0, 0, 0])

  const stageScores = useMemo(() => {
    const result: Record<string, CircuitStageScores> = {}
    roster.forEach((player) => {
      result[player.id] = player.id === human.id
        ? humanStages
        : splitAiCircuitScore(player.precomputedScore, seed, player.id)
    })
    return result
  }, [human.id, humanStages, roster, seed])

  const completedStages = view === 'precision' ? 0 : view === 'summary1' || view === 'sequence' ? 1 : 2
  const totals = useMemo(() => Object.fromEntries(roster.map((player) => [
    player.id,
    stageScores[player.id].slice(0, completedStages).reduce((sum, score) => sum + score, 0),
  ])), [completedStages, roster, stageScores])
  const standings = useMemo(() => [...roster].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0)), [roster, totals])

  const completePrecision = (score: number) => {
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
    const finalTotals = Object.fromEntries(roster.map((player) => [
      player.id,
      finalStages[player.id].reduce((sum, stageScore) => sum + stageScore, 0),
    ]))
    const ranking = rankCircuitResults(roster.map((player) => player.id), finalTotals, finalStages, seed)
    const humanTotal = finalTotals[human.id] ?? 0
    setHumanStages(finalHumanStages)
    onFinish?.(humanTotal, undefined, {
      authoritativeWinnerId: ranking[0] ?? human.id,
      authoritativeLastPlaceId: ranking[ranking.length - 1] ?? null,
      rawValue: humanTotal,
      rawResults: finalTotals,
    })
  }

  const scoreboard = (
    <div className="f3-circuit__scoreboard" aria-label="Final Three Circuit standings">
      {standings.map((player, index) => (
        <div className={`f3-circuit__score-row ${player.id === human.id ? 'is-human' : ''}`} key={player.id}>
          <span className="f3-circuit__rank">{index + 1}</span>
          <span className="f3-circuit__avatar" aria-hidden="true">{player.avatar ? <img src={player.avatar} alt="" /> : initials(player.name)}</span>
          <span className="f3-circuit__name">{player.name}</span>
          <strong>{totals[player.id] ?? 0}</strong>
        </div>
      ))}
    </div>
  )

  const summary = view === 'summary1' || view === 'summary2'
  const summaryIndex = view === 'summary1' ? 0 : 1
  const stageName = summaryIndex === 0 ? 'Precision Lock' : 'Sequence Builder'

  return (
    <div className="f3-circuit">
      <div className="f3-circuit__shell">
        <header className="f3-circuit__header">
          <div><p>Final HOH · Part 1</p><h1>Final Three Circuit</h1></div>
          <div className="f3-circuit__stage-chip">{view === 'precision' || view === 'summary1' ? '1 / 3' : view === 'sequence' || view === 'summary2' ? '2 / 3' : '3 / 3'}</div>
        </header>

        {!summary && <div className="f3-circuit__compact-board">{scoreboard}</div>}

        <main className="f3-circuit__main">
          {view === 'precision' && <PrecisionStage seed={seed} onComplete={completePrecision} />}
          {view === 'sequence' && <SequenceStage seed={seed} onComplete={completeSequence} />}
          {view === 'risk' && <RiskRunStage seed={seed} onComplete={completeRisk} />}
          {summary && (
            <section className="f3-circuit__panel f3-circuit__summary-panel">
              <p className="f3-circuit__eyebrow">Stage {summaryIndex + 1} complete</p>
              <h2>{stageName}</h2>
              <div className="f3-circuit__stage-results">
                {[...roster].sort((a, b) => stageScores[b.id][summaryIndex] - stageScores[a.id][summaryIndex]).map((player) => (
                  <div key={player.id}><span>{player.name}</span><strong>{stageScores[player.id][summaryIndex]} / 100</strong></div>
                ))}
              </div>
              <div className="f3-circuit__summary-standings">{scoreboard}</div>
              <button type="button" className="f3-circuit__primary" onClick={() => setView(summaryIndex === 0 ? 'sequence' : 'risk')}>
                {summaryIndex === 0 ? 'Enter Sequence Builder' : 'Enter Risk Run'}
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
