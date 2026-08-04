import { useMemo, useState } from 'react'
import type { Player } from '../../types'
import type { RelationshipsMap } from '../../social/types'
import {
  canHumanKnowFact,
  type DirectedRelationship,
  type RealityBelief,
  type RealityDomainState,
} from '../../social/reality'
import './RealityLedger.css'

type LedgerTab = 'knowledge' | 'deals' | 'house' | 'relationships'

export interface RealityLedgerProps {
  reality: RealityDomainState
  players: readonly Player[]
  humanId: string
  /** Live social graph used to keep labels/meters synchronized after actions. */
  relationships?: RelationshipsMap
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.82) return 'High confidence'
  if (confidence >= 0.55) return 'Plausible'
  return 'Uncertain'
}

function titleCase(value: string): string {
  return value
    .replace(/^CEREMONY_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function tension(edge: DirectedRelationship): number {
  return Math.round(
    Math.max(0, Math.min(100, edge.resentment * 0.45 + edge.suspicion * 0.35 + edge.fear * 0.2))
  )
}

function combinedLiveRelationship(
  relationships: RelationshipsMap | undefined,
  humanId: string,
  otherId: string
): { affinity: number; tags: Set<string> } | null {
  const outward = relationships?.[humanId]?.[otherId]
  const inward = relationships?.[otherId]?.[humanId]
  if (!outward && !inward) return null
  return {
    affinity: Math.round(((outward?.affinity ?? 0) + (inward?.affinity ?? 0)) / 2),
    tags: new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])]),
  }
}

function liveRelationshipLabel(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): string {
  if (!live) return titleCase(edge.perceivedLabel)
  const tags = live.tags
  if (tags.has('ex') || tags.has('broken_romance')) return '💔 Ex'
  if (tags.has('betrayal') || tags.has('broken_promise')) return 'Betrayed'
  if (tags.has('broken_alliance')) return 'Broken alliance'
  if (tags.has('rivalry') || tags.has('target')) return 'Rival'
  if (tags.has('romance')) return 'Romance'
  if (tags.has('bromance')) return 'Ride-or-die'
  if (tags.has('alliance') || tags.has('cupid_partner')) return 'Ally'
  if (live.affinity >= 55) return 'Close'
  if (live.affinity >= 20) return 'Friendly'
  if (live.affinity <= -45) return 'Hostile'
  if (live.affinity <= -15) return 'Tense'
  return titleCase(edge.perceivedLabel)
}

function liveRelationshipMetrics(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): Array<[string, number]> {
  if (!live) {
    return [
      ['Trust', edge.trust],
      ['Warmth', edge.warmth],
      ['Loyalty', edge.loyalty],
      ['Respect', edge.respect],
      ['Tension', tension(edge)],
    ]
  }
  const broken =
    live.tags.has('ex') ||
    live.tags.has('broken_romance') ||
    live.tags.has('broken_alliance') ||
    live.tags.has('betrayal') ||
    live.tags.has('broken_promise')
  const affinity = broken ? Math.min(-50, live.affinity) : live.affinity
  const trust = clampRelationship(edge.trust * 0.6 + affinity * 0.4)
  const warmth = clampRelationship(edge.warmth * 0.5 + affinity * 0.5)
  const loyalty = clampRelationship(
    broken ? Math.min(edge.loyalty, affinity) : edge.loyalty * 0.55 + affinity * 0.45
  )
  const respect = clampRelationship(edge.respect * 0.7 + affinity * 0.3)
  const liveTension = affinity < 0 ? Math.min(100, Math.abs(affinity) + (broken ? 30 : 8)) : 0
  return [
    ['Trust', trust],
    ['Warmth', warmth],
    ['Loyalty', loyalty],
    ['Respect', respect],
    ['Tension', Math.max(tension(edge), liveTension)],
  ]
}

function beliefSource(
  belief: RealityBelief,
  reality: RealityDomainState,
  playerName: (id: string) => string
): string {
  const memory = (reality.memoriesByOwner[belief.ownerId] ?? []).find((entry) =>
    belief.supportingMemoryIds.includes(entry.id)
  )
  if (!memory) return 'Source unavailable'
  if (memory.sourceType === 'OFFICIAL') return 'Official result'
  if (memory.sourceType === 'DIRECT') return 'You experienced this'
  if (memory.sourceType === 'WITNESSED') return 'You witnessed this'
  if (memory.sourceType === 'INFERRED') return 'Your read of the situation'
  const sourceId = memory.sourceChain.at(-1)
  return sourceId ? `Heard through ${playerName(sourceId)}` : 'Hearsay'
}

export default function RealityLedger({
  reality,
  players,
  humanId,
  relationships: liveRelationships,
}: RealityLedgerProps) {
  const [tab, setTab] = useState<LedgerTab>('relationships')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const activePlayerIds = useMemo(
    () =>
      new Set(
        players
          .filter(
            (player) =>
              player.id !== humanId && player.status !== 'evicted' && player.status !== 'jury'
          )
          .map((player) => player.id)
      ),
    [humanId, players]
  )
  const playerName = (id: string) =>
    id === humanId ? 'You' : (players.find((player) => player.id === id)?.name ?? 'Unknown')

  const knownFacts = useMemo(
    () =>
      Object.values(reality.facts)
        .filter((fact) => canHumanKnowFact(fact, humanId, 'PLAYER_LIMITED'))
        .sort((left, right) => right.day - left.day || right.phase.localeCompare(left.phase)),
    [humanId, reality.facts]
  )
  const beliefs = useMemo(
    () =>
      Object.values(reality.beliefsByOwner[humanId] ?? {})
        .filter((belief) => belief.status !== 'STALE' && belief.status !== 'DISPROVEN')
        .sort((left, right) => right.lastUpdatedDay - left.lastUpdatedDay),
    [humanId, reality.beliefsByOwner]
  )
  const promises = useMemo(
    () =>
      Object.values(reality.promises)
        .filter(
          (promise) =>
            promise.promisorId === humanId ||
            promise.beneficiaryIds.includes(humanId) ||
            promise.witnessIds.includes(humanId)
        )
        .sort((left, right) => right.createdAt.day - left.createdAt.day),
    [humanId, reality.promises]
  )
  const debts = useMemo(
    () =>
      Object.values(reality.debts).filter(
        (debt) => debt.debtorId === humanId || debt.creditorId === humanId
      ),
    [humanId, reality.debts]
  )
  const threads = useMemo(
    () =>
      Object.values(reality.threads).filter(
        (thread) => thread.participantIds.includes(humanId) || thread.observerIds.includes(humanId)
      ),
    [humanId, reality.threads]
  )
  const alliances = useMemo(
    () =>
      Object.values(reality.alliances).filter(
        (alliance) =>
          alliance.memberIds.includes(humanId) || alliance.suspectedByIds.includes(humanId)
      ),
    [humanId, reality.alliances]
  )
  const relationships = useMemo(
    () =>
      Object.values(reality.relationships[humanId] ?? {})
        .filter((edge) => activePlayerIds.has(edge.toId))
        .sort(
          (left, right) => right.familiarity - left.familiarity || left.toId.localeCompare(right.toId)
        ),
    [activePlayerIds, humanId, reality.relationships]
  )
  const selectedRelationship =
    relationships.find((edge) => edge.toId === selectedPlayerId) ?? relationships[0]
  const selectedLiveRelationship = selectedRelationship
    ? combinedLiveRelationship(liveRelationships, humanId, selectedRelationship.toId)
    : null

  return (
    <section className="reality-ledger" aria-label="Reality ledger">
      <div className="reality-ledger__intro">
        <span>Your private game read</span>
        <small>Only information your player has learned appears here.</small>
      </div>
      <nav className="reality-ledger__tabs" aria-label="Reality ledger sections">
        {(['relationships', 'knowledge', 'deals', 'house'] as LedgerTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'is-active' : ''}
            onClick={() => setTab(item)}
          >
            {item === 'knowledge' ? 'Known' : item === 'relationships' ? 'People' : item}
          </button>
        ))}
      </nav>

      <div className="reality-ledger__content">
        {tab === 'knowledge' && (
          <>
            <h3>Facts and claims</h3>
            {knownFacts.length === 0 && beliefs.length === 0 ? (
              <p className="reality-ledger__empty">You have not learned any durable intel yet.</p>
            ) : (
              <>
                {knownFacts.slice(0, 12).map((fact) => (
                  <article className="reality-ledger__item" key={fact.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--fact">
                        Official fact
                      </span>
                      <small>Day {fact.day}</small>
                    </div>
                    <strong>{titleCase(fact.propositionType)}</strong>
                    <p>{fact.subjectIds.map(playerName).join(' · ')}</p>
                  </article>
                ))}
                {beliefs.slice(0, 12).map((belief) => (
                  <article className="reality-ledger__item" key={belief.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--claim">
                        Claim
                      </span>
                      <small>{confidenceLabel(belief.confidence)}</small>
                    </div>
                    <strong>{titleCase(belief.propositionType)}</strong>
                    <p>{belief.subjectIds.map(playerName).join(' · ')}</p>
                    <em>{beliefSource(belief, reality, playerName)}</em>
                  </article>
                ))}
              </>
            )}
          </>
        )}

        {tab === 'deals' && (
          <>
            <h3>Promises and debts</h3>
            {promises.length === 0 && debts.length === 0 ? (
              <p className="reality-ledger__empty">No promises or favors involve you yet.</p>
            ) : (
              <>
                {promises.map((promise) => (
                  <article className="reality-ledger__item" key={promise.id}>
                    <div>
                      <span
                        className={`reality-ledger__badge reality-ledger__badge--${promise.status.toLowerCase()}`}
                      >
                        {titleCase(promise.status)}
                      </span>
                      <small>
                        {promise.deadline
                          ? `Due Day ${promise.deadline.day}`
                          : `Made Day ${promise.createdAt.day}`}
                      </small>
                    </div>
                    <strong>{titleCase(promise.kind)}</strong>
                    <p>
                      {playerName(promise.promisorId)} →{' '}
                      {promise.beneficiaryIds.map(playerName).join(', ')}
                    </p>
                  </article>
                ))}
                {debts.map((debt) => (
                  <article className="reality-ledger__item" key={debt.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--debt">
                        Favor · {titleCase(debt.status)}
                      </span>
                      <small>Weight {Math.round(debt.magnitude * 100)}%</small>
                    </div>
                    <strong>
                      {playerName(debt.debtorId)} owes {playerName(debt.creditorId)}
                    </strong>
                  </article>
                ))}
              </>
            )}
          </>
        )}

        {tab === 'house' && (
          <>
            <h3>Your groups and open stories</h3>
            {alliances.length === 0 && threads.length === 0 ? (
              <p className="reality-ledger__empty">No known group or unresolved story is active.</p>
            ) : (
              <>
                {alliances.map((alliance) => {
                  const isMember = alliance.memberIds.includes(humanId)
                  return (
                    <article className="reality-ledger__item" key={alliance.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--alliance">
                          {isMember ? titleCase(alliance.status) : 'Suspected group'}
                        </span>
                        <small>{Math.round(alliance.cohesion * 100)}% cohesion</small>
                      </div>
                      <strong>{alliance.name ?? 'Unnamed alliance'}</strong>
                      <p>
                        {isMember
                          ? alliance.memberIds.map(playerName).join(' · ')
                          : 'You suspect this group exists, but do not know its full membership.'}
                      </p>
                    </article>
                  )
                })}
                {threads.map((thread) => (
                  <article className="reality-ledger__item" key={thread.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--thread">
                        {titleCase(thread.status)}
                      </span>
                      <small>Urgency {Math.round(thread.urgency * 100)}%</small>
                    </div>
                    <strong>{titleCase(thread.type)}</strong>
                    <p>{thread.participantIds.map(playerName).join(' · ')}</p>
                  </article>
                ))}
              </>
            )}
          </>
        )}

        {tab === 'relationships' && (
          <>
            <h3>Your relationship reads</h3>
            {relationships.length === 0 ? (
              <p className="reality-ledger__empty">Your relationships are still forming.</p>
            ) : (
              <>
                <div className="reality-ledger__people" role="list">
                  {relationships.map((edge) => {
                    const live = combinedLiveRelationship(liveRelationships, humanId, edge.toId)
                    return (
                      <button
                        role="listitem"
                        key={edge.toId}
                        type="button"
                        className={selectedRelationship?.toId === edge.toId ? 'is-active' : ''}
                        onClick={() => setSelectedPlayerId(edge.toId)}
                      >
                        <strong>{playerName(edge.toId)}</strong>
                        <small>{liveRelationshipLabel(edge, live)}</small>
                      </button>
                    )
                  })}
                </div>
                {selectedRelationship && (
                  <article className="reality-ledger__relationship">
                    <div>
                      <strong>{playerName(selectedRelationship.toId)}</strong>
                      <span>
                        {liveRelationshipLabel(selectedRelationship, selectedLiveRelationship)}
                      </span>
                    </div>
                    {liveRelationshipMetrics(selectedRelationship, selectedLiveRelationship).map(
                      ([label, rawValue]) => {
                        const value = Number(rawValue)
                        const normalized = label === 'Tension' ? value : (value + 100) / 2
                        return (
                          <label key={String(label)}>
                            <span>{label}</span>
                            <meter min="0" max="100" value={normalized} />
                          </label>
                        )
                      }
                    )}
                    <small>
                      This is your character’s read. Their private opinion of you remains hidden.
                    </small>
                  </article>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
