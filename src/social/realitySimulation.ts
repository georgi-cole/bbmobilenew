/**
 * Reality Mode deterministic simulation primitives.
 *
 * The current v2 engines use several independently-derived seeded rolls. V3
 * needs one persisted social random stream so a save can resume without
 * changing later social outcomes. This module provides that stream and a
 * bounded, serialisable trace without changing v2 action behavior yet.
 */

export const REALITY_SIMULATION_VERSION = 1
export const REALITY_SIMULATION_TRACE_LIMIT = 400

const MULBERRY_INCREMENT = 0x6d2b79f5
const REALITY_TRACE_STAGES = new Set<RealityTraceStage>([
  'context',
  'candidate',
  'blocked',
  'selected',
  'response',
  'outcome',
  'deadline',
  'migration',
])

export interface RealityRngState {
  /** Original stream seed, retained for replay/debug display. */
  seed: number
  /** Current Mulberry32 state. */
  state: number
  /** Number of values consumed from this stream. */
  cursor: number
}

export type RealityTraceStage =
  | 'context'
  | 'candidate'
  | 'blocked'
  | 'selected'
  | 'response'
  | 'outcome'
  | 'deadline'
  | 'migration'

export interface RealityCandidateTrace {
  id: string
  eligible: boolean
  weight: number
  score?: number
  blockedReasons?: string[]
}

export interface RealitySimulationTrace {
  id: string
  sequence: number
  day: number
  phase: string
  stage: RealityTraceStage
  actorId?: string
  targetIds?: string[]
  actionId?: string
  reason?: string
  candidates?: RealityCandidateTrace[]
  knowledgeIds?: string[]
  witnessIds?: string[]
  randomDraw?: number
  rngCursor?: number
}

export interface RealitySimulationState {
  version: number
  /**
   * Null until the social stream is bound to the current game's seed. Keeping
   * this explicit prevents old saves from silently sharing a magic seed.
   */
  rng: RealityRngState | null
  trace: RealitySimulationTrace[]
  nextTraceSequence: number
}

export interface RealityHarnessCandidate {
  id: string
  weight: number
  score?: number
  eligible: boolean
  blockedReasons?: string[]
}

export interface RealityHarnessOpportunity {
  day: number
  phase: string
  actorId: string
  targetIds?: string[]
  candidates: RealityHarnessCandidate[]
}

export interface RealityHarnessSelection {
  day: number
  phase: string
  actorId: string
  selectedActionId: string | null
  randomDraw: number | null
  rngCursor: number
}

export interface RealityHarnessResult {
  simulation: RealitySimulationState
  selections: RealityHarnessSelection[]
}

function toUint32(value: number): number {
  return value >>> 0
}

function finiteNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function deriveRealitySimulationSeed(gameSeed: number, gameId: string): number {
  return toUint32(toUint32(gameSeed) ^ stableHash(gameId || 'reality-mode'))
}

export function createRealityRng(seed: number): RealityRngState {
  const normalizedSeed = toUint32(seed)
  return {
    seed: normalizedSeed,
    state: normalizedSeed,
    cursor: 0,
  }
}

export function createInitialRealitySimulationState(seed?: number): RealitySimulationState {
  return {
    version: REALITY_SIMULATION_VERSION,
    rng: seed === undefined ? null : createRealityRng(seed),
    trace: [],
    nextTraceSequence: 0,
  }
}

/**
 * Consume exactly one deterministic value. The returned state is safe to
 * persist directly; callers never need to replay prior draws after hydration.
 */
export function drawRealityRandom(rng: RealityRngState): {
  value: number
  next: RealityRngState
} {
  const state = toUint32(rng.state + MULBERRY_INCREMENT)
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000

  return {
    value,
    next: {
      seed: toUint32(rng.seed),
      state,
      cursor: finiteNonNegativeInteger(rng.cursor) + 1,
    },
  }
}

export function appendRealitySimulationTrace(
  simulation: RealitySimulationState,
  entry: Omit<RealitySimulationTrace, 'id' | 'sequence'>
): RealitySimulationState {
  const sequence = finiteNonNegativeInteger(simulation.nextTraceSequence)
  const traceEntry: RealitySimulationTrace = {
    ...entry,
    id: `reality-trace-${sequence}`,
    sequence,
  }

  return {
    ...simulation,
    trace: [...simulation.trace, traceEntry].slice(-REALITY_SIMULATION_TRACE_LIMIT),
    nextTraceSequence: sequence + 1,
  }
}

export function normalizeRealitySimulationState(raw: unknown): RealitySimulationState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createInitialRealitySimulationState()
  }

  const input = raw as Partial<RealitySimulationState>
  const rawRng = input.rng
  const rng =
    rawRng &&
    typeof rawRng === 'object' &&
    Number.isFinite(rawRng.seed) &&
    Number.isFinite(rawRng.state)
      ? {
          seed: toUint32(rawRng.seed),
          state: toUint32(rawRng.state),
          cursor: finiteNonNegativeInteger(rawRng.cursor),
        }
      : null
  const trace = Array.isArray(input.trace)
    ? input.trace
        .flatMap((entry, index): RealitySimulationTrace[] => {
          if (!entry || typeof entry !== 'object') return []
          const candidate = entry as RealitySimulationTrace
          if (typeof candidate.phase !== 'string' || !REALITY_TRACE_STAGES.has(candidate.stage)) {
            return []
          }
          const sequence = finiteNonNegativeInteger(candidate.sequence, index)
          return [
            {
              ...candidate,
              id:
                typeof candidate.id === 'string' && candidate.id
                  ? candidate.id
                  : `reality-trace-${sequence}`,
              sequence,
              day: finiteNonNegativeInteger(candidate.day),
            },
          ]
        })
        .slice(-REALITY_SIMULATION_TRACE_LIMIT)
    : []
  const highestSequence = trace.reduce(
    (highest, entry) => Math.max(highest, finiteNonNegativeInteger(entry.sequence, -1)),
    -1
  )

  return {
    version: REALITY_SIMULATION_VERSION,
    rng,
    trace,
    nextTraceSequence: Math.max(
      highestSequence + 1,
      finiteNonNegativeInteger(input.nextTraceSequence)
    ),
  }
}

function selectWeightedCandidate(
  candidates: readonly RealityHarnessCandidate[],
  draw: number
): RealityHarnessCandidate | null {
  const eligible = candidates
    .filter((candidate) => candidate.eligible && Number.isFinite(candidate.weight))
    .map((candidate) => ({ ...candidate, weight: Math.max(0, candidate.weight) }))
    .filter((candidate) => candidate.weight > 0)
    .sort((left, right) => left.id.localeCompare(right.id))
  const totalWeight = eligible.reduce((sum, candidate) => sum + candidate.weight, 0)
  if (totalWeight <= 0) return null

  let threshold = draw * totalWeight
  for (const candidate of eligible) {
    threshold -= candidate.weight
    if (threshold < 0) return candidate
  }
  return eligible[eligible.length - 1] ?? null
}

/**
 * Small deterministic characterization harness used before the v3
 * orchestrator replaces v2 policies. It deliberately accepts pre-scored
 * candidates: PR3 can plug its scorer into this seam without changing replay
 * or trace semantics.
 */
export function runRealitySimulationHarness(input: {
  seed: number
  opportunities: readonly RealityHarnessOpportunity[]
}): RealityHarnessResult {
  let simulation = createInitialRealitySimulationState(input.seed)
  const selections: RealityHarnessSelection[] = []

  for (const opportunity of input.opportunities) {
    const rng = simulation.rng
    if (!rng) throw new Error('Reality simulation RNG was not initialized')

    const viable = opportunity.candidates.some(
      (candidate) => candidate.eligible && Number.isFinite(candidate.weight) && candidate.weight > 0
    )
    let randomDraw: number | null = null
    let selectedActionId: string | null = null

    if (viable) {
      const draw = drawRealityRandom(rng)
      randomDraw = draw.value
      simulation = { ...simulation, rng: draw.next }
      selectedActionId = selectWeightedCandidate(opportunity.candidates, randomDraw)?.id ?? null
    }

    simulation = appendRealitySimulationTrace(simulation, {
      day: opportunity.day,
      phase: opportunity.phase,
      stage: selectedActionId ? 'selected' : 'blocked',
      actorId: opportunity.actorId,
      targetIds: opportunity.targetIds,
      actionId: selectedActionId ?? undefined,
      reason: selectedActionId ? 'bounded_weighted_selection' : 'no_eligible_candidate',
      candidates: opportunity.candidates.map((candidate) => ({
        id: candidate.id,
        eligible: candidate.eligible,
        weight: candidate.weight,
        score: candidate.score,
        blockedReasons: candidate.blockedReasons,
      })),
      randomDraw: randomDraw ?? undefined,
      rngCursor: simulation.rng?.cursor ?? rng.cursor,
    })
    selections.push({
      day: opportunity.day,
      phase: opportunity.phase,
      actorId: opportunity.actorId,
      selectedActionId,
      randomDraw,
      rngCursor: simulation.rng?.cursor ?? rng.cursor,
    })
  }

  return { simulation, selections }
}
