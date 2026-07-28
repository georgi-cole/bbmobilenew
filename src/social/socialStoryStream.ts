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

interface ScoredBeat {
  beat: SocialStoryBeat
  score: number
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

function arcDescription(arc: DramaArc, first: string, second: string): string {
  const pair = `${first} and ${second}`
  if (arc.type === 'romance') {
    return arc.stage === 'strained'
      ? `${pair} can no longer hide that something between them is off.`
      : `${pair} keep finding reasons to disappear together, and the house is starting to notice.`
  }
  if (arc.type === 'bromance') return `${pair} are moving through the house like a dependable unit.`
  if (arc.type === 'rivalry') return `${pair} now treat even ordinary conversations like a contest.`
  return `${pair} are still living with the fallout of a move that changed their trust.`
}

function eventToBeat(
  event: DramaHouseEvent,
  network: DramaSocialNetwork,
  nameOf: (id: string) => string
): ScoredBeat {
  const first = nameOf(event.participantIds[0] ?? '')
  const second = nameOf(event.participantIds[1] ?? '')
  const arc = event.relatedArcId
    ? network.arcs.find((candidate) => candidate.id === event.relatedArcId)
    : undefined
  let kind: SocialStoryBeatKind = event.public ? 'public' : 'strategy'
  let title = event.title ?? 'The house shifted'
  let text = event.text
  if (event.type === 'confrontation') {
    kind = 'conflict'
    title = `${first} and ${second} finally snapped`
    text =
      'A disagreement that had stayed private is now forcing the rest of the house to choose sides.'
  } else if (event.type === 'reconciliation') {
    kind = 'repair'
    title = `${first} and ${second} called a truce`
    text = 'They made a visible effort to stop the tension from controlling their games.'
  } else if (event.type === 'alliance_beat') {
    kind = 'strategy'
    title = 'A voting pair is taking shape'
    text = `${first} and ${second} are coordinating often enough that the house has started counting them together.`
  } else if (event.type === 'exposure') {
    kind = 'public'
    title = 'A private story just went public'
    text = `${first} dragged information involving ${second} into the open, and the fallout is only beginning.`
  } else if (event.type === 'rumour_spread') {
    kind = 'intel'
    title = 'One story is spreading fast'
    text = `A claim involving ${second} has escaped its original conversation and is changing how people read the house.`
  } else if (event.type === 'discovery') {
    kind = 'intel'
    title = 'New information surfaced'
    text = event.text || `${first} noticed a plan involving ${second} that had stayed hidden.`
  } else if (event.type === 'arc_beat' && arc) {
    kind = arc.type === 'rivalry' || arc.type === 'betrayal' ? 'conflict' : 'bond'
    title =
      arc.type === 'romance'
        ? 'Chemistry is becoming obvious'
        : arc.type === 'bromance'
          ? 'A close pair is forming'
          : arc.type === 'rivalry'
            ? 'A rivalry is taking over'
            : 'Trust is cracking'
    text = arcDescription(arc, first, second)
  }
  const severityScore = event.severity === 'major' ? 100 : event.severity === 'notable' ? 70 : 45
  return {
    score: severityScore,
    beat: {
      id: `event:${event.id}`,
      kind,
      title,
      text,
      participantIds: event.participantIds,
      week: event.week,
      phase: event.phase,
      severity: event.severity,
      createdAt: event.createdAt,
      dedupeKey: `pair:${pairKey(event.participantIds[0] ?? event.id, event.participantIds[1] ?? event.id)}:${event.week}`,
    },
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
  nameOf: (id: string) => string
}): ScoredBeat[] {
  const recent = actionHistory.filter(
    (entry) =>
      entry.source === 'system' &&
      entry.actorId !== entry.targetId &&
      (entry.week ?? currentWeek) === currentWeek
  )
  const byActor = new Map<string, SocialActionLogEntry[]>()
  const byPair = new Map<string, SocialActionLogEntry[]>()
  for (const entry of recent) {
    byActor.set(entry.actorId, [...(byActor.get(entry.actorId) ?? []), entry])
    const key = pairKey(entry.actorId, entry.targetId)
    byPair.set(key, [...(byPair.get(key) ?? []), entry])
  }

  const beats: ScoredBeat[] = []
  const clusteredActors = new Set<string>()
  for (const [actorId, entries] of byActor) {
    const targets = [...new Set(entries.map((entry) => entry.targetId))]
    if (entries.length < 3 || targets.length < 3) continue
    const positive = entries.filter(
      (entry) => entry.outcome === 'success' && entry.delta > 0
    ).length
    const negative = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId)
    ).length
    const strategic = entries.filter((entry) => STRATEGY_ACTIONS.has(entry.actionId)).length
    const latest = [...entries].sort((left, right) => right.timestamp - left.timestamp)[0]
    const targetNames = targets.slice(0, 3).map((id) => (id === humanId ? 'you' : nameOf(id)))
    const actorName = actorId === humanId ? 'You' : nameOf(actorId)
    let kind: SocialStoryBeatKind | null = null
    let title = ''
    let text = ''
    if (negative >= 3 && negative >= positive) {
      kind = 'conflict'
      title = `${actorName} is burning bridges`
      text = `Tension followed ${actorName} through conversations with ${targetNames.join(', ')}. The pattern is becoming part of their reputation.`
    } else if (strategic >= 2) {
      kind = 'strategy'
      title = `${actorName} is quietly building numbers`
      text = `${actorName} spent the day comparing plans with ${targetNames.join(', ')}. It looks less like socialising and more like preparation.`
    } else if (positive >= 3) {
      kind = 'bond'
      title = `${actorName} is working the room`
      text = `${actorName} made a deliberate effort with ${targetNames.join(', ')}. The house is noticing how many doors are opening.`
    }
    if (!kind) continue
    clusteredActors.add(actorId)
    beats.push({
      score: 78 + Math.min(12, entries.length),
      beat: {
        id: `actor:${actorId}:${currentWeek}:${kind}`,
        kind,
        title,
        text,
        participantIds: [actorId, ...targets.slice(0, 3)],
        week: currentWeek,
        phase: 'social',
        severity: 'notable',
        createdAt: latest?.timestamp ?? 0,
        dedupeKey: `actor:${actorId}:${currentWeek}`,
      },
    })
  }

  for (const [key, entries] of byPair) {
    const [leftId, rightId] = key.split('|')
    if (!leftId || !rightId) continue
    const current = averageMutualAffinity(relationships, leftId, rightId)
    const baseline = averageMutualAffinity(weekStartRelSnapshot, leftId, rightId)
    const shift = current - baseline
    const latest = [...entries].sort((left, right) => right.timestamp - left.timestamp)[0]
    const visibleConflict = entries.some(
      (entry) => PUBLIC_ACTIONS.has(entry.actionId) && CONFLICT_ACTIONS.has(entry.actionId)
    )
    const positive = entries.filter(
      (entry) => entry.outcome === 'success' && entry.delta > 0
    ).length
    const negative = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId)
    ).length
    const repairs = entries.filter((entry) => REPAIR_ACTIONS.has(entry.actionId)).length
    const strategy = entries.filter((entry) => STRATEGY_ACTIONS.has(entry.actionId)).length
    const tags = new Set([
      ...(relationships[leftId]?.[rightId]?.tags ?? []),
      ...(relationships[rightId]?.[leftId]?.tags ?? []),
    ])
    const majorPairSignal =
      visibleConflict ||
      Math.abs(shift) >= 10 ||
      entries.length >= 3 ||
      tags.has('alliance') ||
      tags.has('rivalry') ||
      tags.has('betrayal')
    if (!majorPairSignal) continue
    if (
      (clusteredActors.has(leftId) || clusteredActors.has(rightId)) &&
      !visibleConflict &&
      Math.abs(shift) < 12
    ) {
      continue
    }
    const leftName = leftId === humanId ? 'You' : nameOf(leftId)
    const rightName = rightId === humanId ? 'you' : nameOf(rightId)
    let kind: SocialStoryBeatKind | null = null
    let title = ''
    let text = ''
    let score = 0
    if (
      visibleConflict ||
      negative >= 2 ||
      shift <= -8 ||
      tags.has('rivalry') ||
      tags.has('betrayal')
    ) {
      kind = 'conflict'
      title = visibleConflict
        ? `${leftName} and ${rightName} finally snapped`
        : 'Trust is sliding fast'
      text = visibleConflict
        ? 'Their private tension reached the rest of the house, and people are beginning to choose sides.'
        : `${leftName} and ${rightName} have grown colder after a pattern of strained exchanges.`
      score = 72 + Math.min(20, Math.abs(shift) + negative * 3)
    } else if (baseline <= -5 && shift >= 6 && (repairs > 0 || positive >= 2)) {
      kind = 'repair'
      title = `${leftName} and ${rightName} may be calling a truce`
      text = 'A relationship that looked damaged is showing the first signs of a real repair.'
      score = 66 + Math.min(18, shift)
    } else if (strategy >= 2 || tags.has('alliance') || tags.has('protection')) {
      kind = 'strategy'
      title = 'A pair is starting to move together'
      text = `${leftName} and ${rightName} are coordinating often enough that their interests now look connected.`
      score = 68 + Math.min(16, shift + strategy * 3)
    } else if (positive >= 3 || shift >= 10) {
      kind = 'bond'
      title = 'A new bond is becoming hard to miss'
      text = `${leftName} and ${rightName} keep seeking each other out, and the connection now looks deliberate.`
      score = 62 + Math.min(18, shift + positive * 2)
    }
    if (!kind) continue
    beats.push({
      score,
      beat: {
        id: `pair:${key}:${currentWeek}:${kind}`,
        kind,
        title,
        text,
        participantIds: [leftId, rightId],
        week: currentWeek,
        phase: 'social',
        severity: score >= 86 ? 'major' : score >= 68 ? 'notable' : 'quiet',
        createdAt: latest?.timestamp ?? 0,
        dedupeKey: `pair:${key}:${currentWeek}`,
      },
    })
  }
  return beats
}

export function buildSocialStoryStream({
  network,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  players,
  humanId,
  currentWeek,
  maxBeats = 5,
}: BuildSocialStoryStreamInput): SocialStoryBeat[] {
  const playerById = new Map(players.map((player) => [player.id, player]))
  const nameOf = (id: string) => (playerById.get(id)?.name ?? id) || 'Someone'
  const knownEvents = network.events.filter(
    (event) =>
      event.week === currentWeek &&
      (event.public ||
        event.participantIds.includes(humanId) ||
        (event.type === 'discovery' && event.participantIds[0] === humanId))
  )
  const candidates = [
    ...knownEvents.map((event) => eventToBeat(event, network, nameOf)),
    ...buildActionBeats({
      actionHistory,
      relationships,
      weekStartRelSnapshot,
      humanId,
      currentWeek,
      nameOf,
    }),
  ]
  const deduped = new Map<string, ScoredBeat>()
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.beat.dedupeKey)
    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score && candidate.beat.createdAt > existing.beat.createdAt)
    ) {
      deduped.set(candidate.beat.dedupeKey, candidate)
    }
  }
  return [...deduped.values()]
    .sort((left, right) => right.score - left.score || right.beat.createdAt - left.beat.createdAt)
    .slice(0, Math.max(1, Math.min(5, maxBeats)))
    .map((entry) => entry.beat)
}
