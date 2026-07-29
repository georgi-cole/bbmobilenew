import type { RealitySimulationState } from '../../social/realitySimulation'
import type { RealityDomainState } from '../../social/reality'
import './RealityDebugPanel.css'

export default function RealityDebugPanel({
  simulation,
  reality,
}: {
  simulation: RealitySimulationState
  reality: RealityDomainState
}) {
  if (!import.meta.env.DEV) return null
  const latest = simulation.trace.at(-1)
  const blocked = latest?.candidates
    ?.flatMap((candidate) => candidate.blockedReasons ?? [])
    .slice(0, 4)

  return (
    <details className="reality-debug">
      <summary>Reality diagnostics</summary>
      <div>
        <span>Seed {simulation.rng?.seed ?? 'not set'}</span>
        <span>Draw {simulation.rng?.cursor ?? 0}</span>
        <span>{reality.events.length} events</span>
        <span>{Object.keys(reality.interactions).length} interactions</span>
      </div>
      {latest && (
        <p>
          Last: {latest.stage} · {latest.actionId ?? latest.reason ?? 'no action'} · Day{' '}
          {latest.day} {latest.phase}
        </p>
      )}
      {blocked && blocked.length > 0 && <small>Blocked: {[...new Set(blocked)].join(', ')}</small>}
    </details>
  )
}
