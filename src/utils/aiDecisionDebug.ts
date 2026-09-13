import { canAccessSpecialSettings } from './debugMode'

export type AiDecisionKind =
  | 'loh_nomination'
  | 'vox_nomination'
  | 'eviction_vote'
  | 'cupid_pair_eviction_vote'
  | 'safety_use'
  | 'safety_save'
  | 'replacement_nominee'

export type AiDecisionFactor = number | string | boolean | null

export interface AiDecisionCandidate {
  id: string
  label?: string
  eligible?: boolean
  total?: number
  factors?: Record<string, AiDecisionFactor>
  rejectedReason?: string
}

export interface AiDecisionTrace {
  id: string
  timestamp: number
  kind: AiDecisionKind
  actorId?: string
  actorName?: string
  chosenId?: string | null
  chosenIds?: string[]
  week?: number
  phase?: string
  seed?: number
  reason?: string
  context?: Record<string, AiDecisionFactor | string[]>
  candidates: AiDecisionCandidate[]
}

export interface AiDecisionDebugApi {
  enable: () => void
  disable: () => void
  clear: () => void
  last: () => AiDecisionTrace | null
  list: () => AiDecisionTrace[]
  filter: (query?: {
    week?: number
    phase?: string
    kind?: AiDecisionKind
    actorId?: string
  }) => AiDecisionTrace[]
  export: () => string
}

const MAX_TRACE_ENTRIES = 300
const traces: AiDecisionTrace[] = []
let enabledOverride: boolean | null = null
let sequence = 0
const AI_DEBUG_PROPERTY = ['__ai', 'Debug'].join('')

function isDebugEnabled(): boolean {
  if (enabledOverride !== null) return enabledOverride
  return canAccessSpecialSettings()
}

function installDebugApi(): void {
  if (typeof window === 'undefined' || !canAccessSpecialSettings()) return

  const win = window as unknown as Record<string, unknown>
  const existing = win[AI_DEBUG_PROPERTY] as AiDecisionDebugApi | undefined
  if (existing) return

  const api: AiDecisionDebugApi = {
    enable: () => {
      if (canAccessSpecialSettings()) enabledOverride = true
    },
    disable: () => {
      enabledOverride = false
    },
    clear: () => {
      traces.length = 0
    },
    last: () => traces.at(-1) ?? null,
    list: () => traces.map((entry) => ({ ...entry, candidates: [...entry.candidates] })),
    filter: (query = {}) =>
      api.list().filter(
        (entry) =>
          (query.week === undefined || entry.week === query.week) &&
          (query.phase === undefined || entry.phase === query.phase) &&
          (query.kind === undefined || entry.kind === query.kind) &&
          (query.actorId === undefined || entry.actorId === query.actorId)
      ),
    export: () => JSON.stringify(traces, null, 2),
  }

  win[AI_DEBUG_PROPERTY] = api
  console.info(
    `[AI decision debug] ${AI_DEBUG_PROPERTY} is available: list(), filter(), last(), export()`
  )
}

export function traceAiDecision(input: Omit<AiDecisionTrace, 'id' | 'timestamp'>): void {
  if (!isDebugEnabled()) return
  installDebugApi()

  const entry: AiDecisionTrace = {
    ...input,
    id: `ai-decision-${++sequence}`,
    timestamp: Date.now(),
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      factors: candidate.factors ? { ...candidate.factors } : undefined,
    })),
  }
  traces.push(entry)
  if (traces.length > MAX_TRACE_ENTRIES) traces.splice(0, traces.length - MAX_TRACE_ENTRIES)

  const label = entry.actorName ?? entry.actorId ?? 'system'
  console.groupCollapsed(`[AI decision] ${entry.kind} · ${label}`)
  console.info({
    decisionId: entry.id,
    chosen: entry.chosenId ?? entry.chosenIds ?? null,
    reason: entry.reason ?? null,
    week: entry.week,
    phase: entry.phase,
    seed: entry.seed,
    context: entry.context ?? null,
  })
  console.table(
    entry.candidates.map((candidate) => ({
      candidate: candidate.label ?? candidate.id,
      eligible: candidate.eligible ?? true,
      total: candidate.total ?? null,
      ...candidate.factors,
      rejected: candidate.rejectedReason ?? '',
    }))
  )
  console.groupEnd()
}

// The module is loaded after the browser exists in normal app startup. Install
// the helper eagerly so QA can inspect an empty trace before the first decision.
if (typeof window !== 'undefined') installDebugApi()
