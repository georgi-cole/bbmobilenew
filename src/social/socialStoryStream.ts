import type {
  DramaArc,
  DramaHouseEvent,
  DramaSocialNetwork,
  RelationshipsMap,
  SocialActionLogEntry,
} from './types'

export type SocialStoryBeatKind = 'bond' | 'strategy' | 'conflict' | 'repair' | 'intel' | 'public'

export interface SocialStoryBeat {
  id: string
  kind: SocialStoryBeatKind
  title: string
  text: string
  participantIds: string[]
  week: number
  phase: string
  severity: 'quiet' | 'notable' | 'major'
  createdAt: number
  /** Stable key used to collapse multiple records describing the same story beat. */
  dedupeKey: string
}

interface StoryPlayer {
  id: string
  name?: string
}

export interface BuildSocialStoryStreamInput {
  network: DramaSocialNetwork
  actionHistory: readonly SocialActionLogEntry[]
  relationships: RelationshipsMap
  weekStartRelSnapshot: Record<string, Record<string, number>>
  players: readonly StoryPlayer[]
  humanId: string
  currentWeek: number
  maxBeats?: number
}

const PUBLIC_ACTIONS = new Set([
  'group_chat',
  'startFight',
  'confront',
  'public_callout',
  'expose_secret',
  'go_public',
  'break_alliance',
  'break_bromance',
  'end_romance',
])

const CONFLICT_ACTIONS = new Set([
  'betray',
  'nominate',
  'rumor',
  'startFight',
  'confront',
  'plant_lie',
  'stir_rivalry',
  'public_callout',
  'expose_secret',
  'break_alliance',
  'break_bromance',
  'end_romance',
])

const REPAIR_ACTIONS = new Set(['apologize', 'repair_bond', 'reassure'])
const STRATEGY_ACTIONS = new Set([
  'ally',
  'proposeAlliance',
  'protect',
  'share_intel',
  'trade_secrets',
  'ask_use_safety',
])

function pairKey(left: string, right: string): string {
  return [left, right].sort().join('|')
}

function averageMutualAffinity(
  relationships: Record<string, Record<string, number | { affinity: number }>>,
  left: string,
  right: string
): number {
  const leftValue = relationships[left]?.[right]
  const rightValue = relationships[right]?.[left]
  const leftAffinity = typeof leftValue === 'number' ? leftValue : (leftValue?.affinity ?? 0)
  const rightAffinity = typeof rightValue === 'number' ? rightValue : (rightValue?.affinity ?? 0)
  return (leftAffinity + rightAffinity) / 2
}

function arcDescription(arc: DramaArc, leftName: string, rightName: string): string {
  const pair = `${leftName} and ${rightName}`
  switch (arc.type) {
    case 'romance':
      return arc.stage === 'strained'
        ? `${pair} are no longer hiding that something between them is off.`
        : `${pair} keep finding reasons to spend time together, and the chemistry is becoming harder to miss.`
    case 'bromance':
      return `${pair} are increasingly moving through the house as a dependable pair.`
    case 'rivalry':
      return `${pair} are reading each other as direct competition, and ordinary exchanges now carry an edge.`
    case 'betrayal':
      return `${pair} are still dealing with a move that changed how much they trust one another.`
  }
}

function eventToBeat(
  event: DramaHouseEvent,
  network: DramaSocialNetwork,
  nameOf: (playerId: string) => string
): SocialStoryBeat {
  const names = event.participantIds.map(nameOf)
  const first = names[0] ?? 'Someone'
  const second = names[1] ?? 'another housemate'
  const relatedArc = event.relatedArcId
    ? network.arcs.find((arc) => arc.id === event.relatedArcId)
    : undefined

  let kind: SocialStoryBeatKind = event.public ? 'public' : 'strategy'
  let title = event.title ?? 'House shift'
  let text = event.text

  switch (event.type) {
    case 'confrontation':
      kind = 'conflict'
      title = 'Tension became visible'
      text = `${first} and ${second} stopped keeping their disagreement beneath the surface.`
      break
    case 'reconciliation':
      kind = 'repair'
      title = 'A relationship started repairing'
      text = `${first} and ${second} made a visible effort to move past recent tension.`
      break
    case 'alliance_beat':
      kind = 'strategy'
      title = 'A strategic pair is taking shape'
      text = `${first} and ${second} are coordinating often enough for the rest of the house to notice.`
      break
    case 'exposure':
      kind = 'public'
      title = 'Private information went public'
      text = `${first} brought a hidden story involving ${second} into the open.`
      break
    case 'rumour_spread':
      kind = 'intel'
      title = 'A story is travelling'
      text = `A claim involving ${second} has moved beyond its original source and is beginning to affect how people read the house.`
      break
    case 'discovery':
      kind = 'intel'
      title = 'New information surfaced'
      text = `${first} noticed a connection or plan that had previously stayed out of view.`
      break
    case 'arc_beat':
      if (relatedArc) {
        kind = relatedArc.type === 'rivalry' || relatedArc.type === 'betrayal' ? 'conflict' : 'bond'
        title =
          relatedArc.type === 'romance'
            ? 'Chemistry is developing'
            : relatedArc.type === 'bromance'
              ? 'A close pair is forming'
              : relatedArc.type === 'rivalry'
                ? 'A rivalry is intensifying'
                : 'Trust is under pressure'
        text = arcDescription(relatedArc, first, second)
      }
      break
  }

  return {
    id: `event:${event.id}`,
    kind,
    title,
    text,
    participantIds: event.participantIds,
    week: event.week,
    phase: event.phase,
    severity: event.severity,
    createdAt: event.createdAt,
    dedupeKey: `${pairKey(event.participantIds[0] ?? event.id, event.participantIds[1] ?? event.id)}:${kind}:${event.week}`,
  }
}

function buildActionBeats({
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  humanId,
  currentWeek,
  nameOf,
}: Pick<
  BuildSocialStoryStreamInput,
  'actionHistory' | 'relationships' | 'weekStartRelSnapshot' | 'humanId' | 'currentWeek'
> & {
  nameOf: (playerId: string) => string
}): SocialStoryBeat[] {
  const recent = actionHistory.filter(
    (entry) =>
      entry.source === 'system' &&
      entry.actorId !== entry.targetId &&
      (entry.week ?? currentWeek) === currentWeek
  )
  const groups = new Map<string, SocialActionLogEntry[]>()

  for (const entry of recent) {
    const key = pairKey(entry.actorId, entry.targetId)
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }

  const beats: SocialStoryBeat[] = []
  for (const [key, entries] of groups) {
    const [leftId, rightId] = key.split('|')
    if (!leftId || !rightId) continue

    const current = averageMutualAffinity(relationships, leftId, rightId)
    const baseline = averageMutualAffinity(weekStartRelSnapshot, leftId, rightId)
    const shift = current - baseline
    const latest = [...entries].sort((left, right) => right.timestamp - left.timestamp)[0]
    const visibleAction = entries.some((entry) => PUBLIC_ACTIONS.has(entry.actionId))
    const involvesHuman = leftId === humanId || rightId === humanId
    const positiveCount = entries.filter(
      (entry) => entry.delta > 0 && entry.outcome === 'success'
    ).length
    const negativeCount = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId)
    ).length
    const hasStrategy = entries.some((entry) => STRATEGY_ACTIONS.has(entry.actionId))
    const hasRepair = entries.some((entry) => REPAIR_ACTIONS.has(entry.actionId))

    // Private one-off exchanges between two NPCs stay private. Repetition, a
    // visible confrontation, or a material relationship shift makes the beat
    // observable enough to belong in House Pulse.
    if (
      !involvesHuman &&
      !visibleAction &&
      positiveCount < 2 &&
      negativeCount < 2 &&
      Math.abs(shift) < 7
    ) {
      continue
    }

    const leftName = leftId === humanId ? 'You' : nameOf(leftId)
    const rightName = rightId === humanId ? 'you' : nameOf(rightId)
    const tags = new Set([
      ...(relationships[leftId]?.[rightId]?.tags ?? []),
      ...(relationships[rightId]?.[leftId]?.tags ?? []),
    ])

    let kind: SocialStoryBeatKind = 'bond'
    let title = 'A bond is becoming visible'
    let text = `${leftName} and ${rightName} have repeatedly sought each other out, and the relationship is moving closer.`
    let severity: SocialStoryBeat['severity'] = Math.abs(shift) >= 12 ? 'notable' : 'quiet'

    if (hasRepair && shift >= 0) {
      kind = 'repair'
      title = 'A relationship is repairing'
      text = `${leftName} and ${rightName} appear to be rebuilding after earlier tension instead of letting it keep escalating.`
    } else if (negativeCount > 0 || shift <= -7 || tags.has('rivalry') || tags.has('betrayal')) {
      kind = 'conflict'
      title = visibleAction ? 'Tension broke into the open' : 'A relationship is deteriorating'
      text = visibleAction
        ? `${leftName} and ${rightName} are no longer containing their disagreement to private conversations.`
        : `${leftName} and ${rightName} have grown noticeably colder after several strained interactions.`
      severity = visibleAction || shift <= -12 ? 'notable' : 'quiet'
    } else if (hasStrategy || tags.has('alliance') || tags.has('protection')) {
      kind = 'strategy'
      title = tags.has('alliance') ? 'A pair is moving together' : 'Strategic trust is building'
      text = `${leftName} and ${rightName} are coordinating often enough that their game interests now look connected.`
    }

    beats.push({
      id: `activity:${key}:${latest?.week ?? currentWeek}:${kind}`,
      kind,
      title,
      text,
      participantIds: [leftId, rightId],
      week: latest?.week ?? currentWeek,
      phase: 'social',
      severity,
      createdAt: latest?.timestamp ?? 0,
      dedupeKey: `${key}:${kind}:${latest?.week ?? currentWeek}`,
    })
  }

  return beats
}

/**
 * Project existing deterministic state into a coherent, player-knowable stream.
 * Nothing is persisted here: save compatibility stays unchanged and the stream
 * cannot invent facts that are absent from actions, relationships or Drama events.
 */
export function buildSocialStoryStream({
  network,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  players,
  humanId,
  currentWeek,
  maxBeats = 14,
}: BuildSocialStoryStreamInput): SocialStoryBeat[] {
  const playerById = new Map(players.map((player) => [player.id, player]))
  const nameOf = (playerId: string) => playerById.get(playerId)?.name ?? playerId

  const knownEvents = network.events.filter(
    (event) =>
      event.public ||
      event.participantIds.includes(humanId) ||
      (event.type === 'discovery' && event.participantIds[0] === humanId)
  )
  const eventBeats = knownEvents.map((event) => eventToBeat(event, network, nameOf))
  const actionBeats = buildActionBeats({
    actionHistory,
    relationships,
    weekStartRelSnapshot,
    humanId,
    currentWeek,
    nameOf,
  })

  const byStory = new Map<string, SocialStoryBeat>()
  for (const beat of [...actionBeats, ...eventBeats]) {
    const existing = byStory.get(beat.dedupeKey)
    if (!existing || beat.createdAt >= existing.createdAt) byStory.set(beat.dedupeKey, beat)
  }

  return [...byStory.values()]
    .sort((left, right) => right.week - left.week || right.createdAt - left.createdAt)
    .slice(0, Math.max(1, maxBeats))
}
