import { useEffect, useMemo, useState } from 'react'
import type { Player } from '../../types'
import type { RelationshipsMap } from '../../social/types'
import {
  canHumanKnowFact,
  getRealityAllianceKnowledgeView,
  getRelationshipStoryLabel,
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
  onRenameAlliance?: (allianceId: string, name: string) => void
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

function allianceStatusLabel(status: string): string {
  if (status === 'PROBATIONARY') return 'New pact'
  if (status === 'ACTIVE') return 'Active'
  if (status === 'DORMANT') return 'Dormant'
  if (status === 'FRACTURED') return 'Fractured'
  if (status === 'DISSOLVED') return 'Ended'
  return titleCase(status)
}

function allianceSecrecyLabel(value: number): string {
  if (value >= 0.72) return 'Highly secret'
  if (value >= 0.42) return 'Low profile'
  if (value > 0.2) return 'Leaking'
  return 'Exposed'
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
  if (!outward) return null
  return {
    affinity: outward.affinity,
    tags: new Set(outward.tags ?? []),
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
  onRenameAlliance,
}: RealityLedgerProps) {
  const [tab, setTab] = useState<LedgerTab>('relationships')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  useEffect(() => {
    const setLedgerTab = (event: Event) => {
      const nextTab = (event as CustomEvent<string>).detail
      if (
        nextTab === 'relationships' ||
        nextTab === 'knowledge' ||
        nextTab === 'deals' ||
        nextTab === 'house'
      ) {
        setTab(nextTab)
      }
    }
    window.addEventListener('reality-social-tutorial:set-ledger-tab', setLedgerTab)
    return () =>
      window.removeEventListener('reality-social-tutorial:set-ledger-tab', setLedgerTab)
  }, [])
  const [editingAllianceId, setEditingAllianceId] = useState<string | null>(null)
  const [allianceNameDraft, setAllianceNameDraft] = useState('')
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
        (thread) =>
          !thread.type.startsWith('RELATIONSHIP_') &&
          (thread.participantIds.includes(humanId) || thread.observerIds.includes(humanId)) &&
          (thread.type !== 'PLAYER_NEMESIS' ||
            Object.values(reality.relationshipAutonomy.evidence).some(
              (evidence) =>
                evidence.ownerId === thread.participantIds[0] &&
                evidence.targetId === thread.participantIds[1]
            ))
      ),
    [humanId, reality.relationshipAutonomy.evidence, reality.threads]
  )
  const knownRelationshipStories = useMemo(() => {
    const directEvidence = new Set(
      Object.values(reality.relationshipAutonomy.evidence)
        .filter((entry) => entry.ownerId === humanId || entry.targetId === humanId)
        .map((entry) => `${entry.ownerId}:${entry.targetId}`)
    )
    return Object.values(reality.relationshipAutonomy.intents)
      .filter(
        (intent) =>
          intent.status !== 'CLOSED' &&
          (intent.ownerId === humanId || intent.targetId === humanId) &&
          directEvidence.has(`${intent.ownerId}:${intent.targetId}`)
      )
      .sort(
        (left, right) =>
          right.lastAdvancedAt.day - left.lastAdvancedAt.day || right.importance - left.importance
      )
  }, [humanId, reality.relationshipAutonomy])
  const alliances = useMemo(
    () =>
      Object.values(reality.alliances)
        .map((alliance) => ({
          alliance,
          knowledge: getRealityAllianceKnowledgeView(reality, alliance.id, humanId),
        }))
        .filter(({ knowledge }) => knowledge.level !== 'UNKNOWN')
        .sort(
          (left, right) =>
            Number(right.knowledge.level === 'MEMBER') -
              Number(left.knowledge.level === 'MEMBER') ||
            right.knowledge.confidence - left.knowledge.confidence ||
            left.alliance.id.localeCompare(right.alliance.id)
        ),
    [humanId, reality]
  )
  const relationships = useMemo(
    () =>
      Object.values(reality.relationships[humanId] ?? {})
        .filter((edge) => activePlayerIds.has(edge.toId))
        .sort(
          (left, right) =>
            right.familiarity - left.familiarity || left.toId.localeCompare(right.toId)
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
      <nav
        className="reality-ledger__tabs"
        aria-label="Reality ledger sections"
        data-reality-tutorial="ledger-tabs"
      >
        {(['relationships', 'knowledge', 'deals', 'house'] as LedgerTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'is-active' : ''}
            data-reality-tutorial={item === 'house' ? 'ledger-house' : undefined}
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
                        Known fact
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
            {alliances.length === 0 &&
            threads.length === 0 &&
            knownRelationshipStories.length === 0 ? (
              <p className="reality-ledger__empty">No known group or unresolved story is active.</p>
            ) : (
              <>
                {alliances.map(({ alliance, knowledge }) => {
                  const isMember = knowledge.level === 'MEMBER'
                  const badge = isMember
                    ? allianceStatusLabel(alliance.status)
                    : knowledge.level === 'PUBLIC'
                      ? 'Public alliance'
                      : knowledge.level === 'CONFIRMED'
                        ? 'Confirmed pact'
                        : 'Suspected pact'
                  const detail = isMember
                    ? `${Math.round((knowledge.cohesion ?? 0) * 100)}% cohesion · ${allianceSecrecyLabel(
                        knowledge.secrecy ?? 0
                      )}`
                    : knowledge.level === 'PUBLIC'
                      ? 'House-known'
                      : confidenceLabel(knowledge.confidence)
                  const title =
                    knowledge.displayName ??
                    (isMember
                      ? 'Private pact'
                      : knowledge.level === 'PUBLIC'
                        ? 'Exposed alliance'
                        : 'Possible alliance')
                  const knownMembers = knowledge.knownMemberIds.map(playerName).join(' · ')
                  const memberHierarchy = isMember
                    ? knowledge.knownMemberIds
                        .map((memberId) => {
                          const leaderIndex = alliance.leaderIds.indexOf(memberId)
                          const role =
                            leaderIndex === 0
                              ? 'Leader'
                              : leaderIndex === 1
                                ? 'Co-leader'
                                : titleCase(alliance.memberPerceivedStatus[memberId] ?? 'member')
                          return `${playerName(memberId)} (${role})`
                        })
                        .join(' · ')
                    : ''
                  const editingName = editingAllianceId === alliance.id
                  return (
                    <article className="reality-ledger__item" key={alliance.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--alliance">
                          {badge}
                        </span>
                        <small>{detail}</small>
                      </div>
                      <strong>{title}</strong>
                      <p>
                        {isMember
                          ? memberHierarchy
                          : knownMembers
                            ? `Known links: ${knownMembers}${knowledge.fullMembershipKnown ? '' : ' · other members unknown'}`
                            : 'You suspect a pact exists, but do not know who is fully inside it.'}
                      </p>
                      {isMember && onRenameAlliance && alliance.status !== 'DISSOLVED' && (
                        <div className="reality-ledger__alliance-actions">
                          {editingName ? (
                            <>
                              <input
                                type="text"
                                value={allianceNameDraft}
                                maxLength={28}
                                aria-label="Alliance name"
                                onChange={(event) => setAllianceNameDraft(event.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextName = allianceNameDraft.trim()
                                  if (nextName.length < 2) return
                                  onRenameAlliance(alliance.id, nextName)
                                  setEditingAllianceId(null)
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAllianceId(null)
                                  setAllianceNameDraft('')
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAllianceId(alliance.id)
                                setAllianceNameDraft(alliance.name ?? '')
                              }}
                            >
                              Rename alliance
                            </button>
                          )}
                        </div>
                      )}
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
                {knownRelationshipStories.map((story) => {
                  const otherId = story.ownerId === humanId ? story.targetId : story.ownerId
                  return (
                    <article className="reality-ledger__item" key={story.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--thread">
                          {titleCase(story.stage)}
                        </span>
                        <small>Day {story.lastAdvancedAt.day}</small>
                      </div>
                      <strong>{getRelationshipStoryLabel(story.kind)}</strong>
                      <p>With {playerName(otherId)}</p>
                    </article>
                  )
                })}
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
