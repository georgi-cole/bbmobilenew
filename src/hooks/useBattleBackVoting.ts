/**
 * useBattleBackVoting — deterministic live public-vote simulator.
 *
 * The board can receive authoritative target percentages derived from the
 * season's Public Opinion state. Live values move around those targets, while
 * eliminations follow the target ranking so visual noise cannot randomly
 * replace the season's actual public favorite.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  calculatePublicVotingEliminationIntervalMs,
  getPublicVotingAudioDurationMs,
} from '../services/sound/publicVotingAudioTiming'

export interface BattleBackVoteState {
  votes: Record<string, number>
  eliminated: string[]
  winnerId: string | null
  isComplete: boolean
}

interface Options {
  candidates: string[]
  seed: number
  eliminationIntervalMs?: number
  tickIntervalMs?: number
  driftAmount?: number
  /** Optional display targets; values are normalized and need not sum to 100. */
  targetPercentages?: Record<string, number>
  /** Optional generic momentum bias. Public Favorite keeps this unset. */
  surgeTargetId?: string | null
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

function toIntPercentages(values: number[]): number[] {
  if (values.length === 0) return []
  if (values.length === 1) return [100]

  const safeValues = values.map((value) =>
    Number.isFinite(value) ? Math.max(0.001, value) : 0.001
  )
  const total = safeValues.reduce((sum, value) => sum + value, 0) || 1
  const scaled = safeValues.map((value) => (value / total) * 100)
  const floored = scaled.map(Math.floor)
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0)
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)

  let cursor = 0
  while (remainder > 0 && order.length > 0) {
    floored[order[cursor % order.length].index] += 1
    remainder -= 1
    cursor += 1
  }
  return floored
}

function randomPercentages(rng: () => number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [100]
  return toIntPercentages(Array.from({ length: count }, () => rng() + 0.25))
}

function normalizedTargets(
  candidates: string[],
  targets?: Record<string, number>
): number[] | null {
  if (!targets) return null
  const values = candidates.map((candidate) => targets[candidate])
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return null
  }
  return toIntPercentages(values as number[])
}

function initializeAroundTargets(targets: number[], rng: () => number): number[] {
  return toIntPercentages(targets.map((target) => Math.max(0.5, target + (rng() - 0.5) * 7)))
}

function driftPercentages(
  current: number[],
  rng: () => number,
  drift: number,
  targets: number[] | null,
  surgeIndex: number | null = null
): number[] {
  if (current.length <= 1) return current

  const next = current.map((value, index) => {
    const targetPull = targets ? (targets[index] - value) * 0.18 : 0
    const noise = (rng() - 0.5) * drift * 2
    return Math.max(0.5, value + targetPull + noise)
  })

  if (surgeIndex !== null && surgeIndex >= 0 && surgeIndex < next.length) {
    const momentumShift = 0.45
    const donorTotal = next.reduce(
      (sum, value, index) => (index === surgeIndex ? sum : sum + Math.max(0, value - 0.5)),
      0
    )
    if (donorTotal > 0) {
      next[surgeIndex] += momentumShift
      for (let index = 0; index < next.length; index += 1) {
        if (index === surgeIndex) continue
        const donorWeight = Math.max(0, next[index] - 0.5) / donorTotal
        next[index] = Math.max(0.5, next[index] - momentumShift * donorWeight)
      }
    }
  }

  return toIntPercentages(next)
}

type VotingState = {
  active: string[]
  pcts: number[]
  eliminated: string[]
  winnerId: string | null
  isComplete: boolean
}

type VotingAction =
  | { type: 'reset'; state: VotingState }
  | { type: 'drift'; pcts: number[] }
  | {
      type: 'eliminate'
      remaining: string[]
      pcts: number[]
      lowestId: string
      winnerId: string | null
    }

function votingReducer(state: VotingState, action: VotingAction): VotingState {
  switch (action.type) {
    case 'reset':
      return action.state
    case 'drift':
      return { ...state, pcts: action.pcts }
    case 'eliminate':
      return {
        ...state,
        active: action.remaining,
        pcts: action.pcts,
        eliminated: [...state.eliminated, action.lowestId],
        winnerId: action.winnerId,
        isComplete: action.winnerId !== null,
      }
  }
}

function makeInitialState(
  candidateList: string[],
  rngSeed: number,
  targets?: Record<string, number>
): VotingState {
  if (candidateList.length === 0) {
    return { active: [], pcts: [], eliminated: [], winnerId: null, isComplete: true }
  }
  if (candidateList.length === 1) {
    return {
      active: [...candidateList],
      pcts: [100],
      eliminated: [],
      winnerId: candidateList[0],
      isComplete: true,
    }
  }

  const rng = mulberry32(rngSeed)
  const targetValues = normalizedTargets(candidateList, targets)
  return {
    active: [...candidateList],
    pcts: targetValues
      ? initializeAroundTargets(targetValues, rng)
      : randomPercentages(rng, candidateList.length),
    eliminated: [],
    winnerId: null,
    isComplete: false,
  }
}

function decodeCandidates(signature: string): string[] {
  try {
    const parsed = JSON.parse(signature)
    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

function decodeTargets(signature: string): Record<string, number> | undefined {
  if (!signature) return undefined
  try {
    const parsed = JSON.parse(signature)
    if (!Array.isArray(parsed)) return undefined
    const entries = parsed.filter(
      (entry): entry is [string, number] =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1])
    )
    return Object.fromEntries(entries)
  } catch {
    return undefined
  }
}

export function useBattleBackVoting({
  candidates,
  seed,
  eliminationIntervalMs = 3500,
  tickIntervalMs = 400,
  driftAmount = 5,
  targetPercentages,
  surgeTargetId = null,
}: Options): BattleBackVoteState {
  const candidatesSignature = JSON.stringify(candidates)
  const targetsSignature = targetPercentages
    ? JSON.stringify(candidates.map((candidate) => [candidate, targetPercentages[candidate]]))
    : ''
  const rngRef = useRef(mulberry32(seed))
  const surgeTargetRef = useRef<string | null>(surgeTargetId)
  const targetPercentagesRef = useRef<Record<string, number> | undefined>(targetPercentages)
  const [resolvedEliminationIntervalMs, setResolvedEliminationIntervalMs] = useReducer(
    (_current: number, next: number) => next,
    eliminationIntervalMs
  )

  useEffect(() => {
    let cancelled = false
    const isPublicFavoriteVoting =
      typeof document !== 'undefined' && document.querySelector('.pf-overlay') !== null
    const isFastForwardCadence = eliminationIntervalMs < 1000

    if (!isPublicFavoriteVoting || isFastForwardCadence) {
      setResolvedEliminationIntervalMs(eliminationIntervalMs)
      return () => {
        cancelled = true
      }
    }

    void getPublicVotingAudioDurationMs().then((durationMs) => {
      if (cancelled) return
      setResolvedEliminationIntervalMs(
        calculatePublicVotingEliminationIntervalMs(
          durationMs,
          candidates.length,
          eliminationIntervalMs
        )
      )
    })

    return () => {
      cancelled = true
    }
  }, [candidates.length, eliminationIntervalMs])

  const [state, dispatch] = useReducer(votingReducer, undefined, () =>
    makeInitialState(candidates, seed, targetPercentages)
  )

  const activeRef = useRef(state.active)
  const pctsRef = useRef(state.pcts)
  const eliminatedRef = useRef(state.eliminated)
  useEffect(() => {
    activeRef.current = state.active
  }, [state.active])
  useEffect(() => {
    pctsRef.current = state.pcts
  }, [state.pcts])
  useEffect(() => {
    eliminatedRef.current = state.eliminated
  }, [state.eliminated])
  useEffect(() => {
    surgeTargetRef.current = surgeTargetId
  }, [surgeTargetId])
  useEffect(() => {
    targetPercentagesRef.current = targetPercentages
  }, [targetPercentages])

  useEffect(() => {
    const candidateSnapshot = decodeCandidates(candidatesSignature)
    const targetSnapshot = decodeTargets(targetsSignature)
    const nextState = makeInitialState(candidateSnapshot, seed, targetSnapshot)
    rngRef.current = mulberry32((seed ^ 0x5a7d3c1e) >>> 0)
    activeRef.current = nextState.active
    pctsRef.current = nextState.pcts
    eliminatedRef.current = []
    targetPercentagesRef.current = targetSnapshot
    dispatch({ type: 'reset', state: nextState })
  }, [seed, candidatesSignature, targetsSignature])

  useEffect(() => {
    if (state.isComplete) return
    const id = window.setInterval(() => {
      const active = activeRef.current
      const targetValues = normalizedTargets(active, targetPercentagesRef.current)
      const currentSurgeId = surgeTargetRef.current
      const currentSurgeIndex = currentSurgeId ? active.indexOf(currentSurgeId) : -1
      const next = driftPercentages(
        pctsRef.current,
        rngRef.current,
        driftAmount,
        targetValues,
        currentSurgeIndex >= 0 ? currentSurgeIndex : null
      )
      pctsRef.current = next
      dispatch({ type: 'drift', pcts: next })
    }, tickIntervalMs)
    return () => window.clearInterval(id)
  }, [state.isComplete, tickIntervalMs, driftAmount])

  const eliminateLowest = useCallback(() => {
    const currentCandidates = activeRef.current
    const currentPercentages = pctsRef.current
    if (currentCandidates.length <= 1) return

    const targets = targetPercentagesRef.current
    let lowestIndex = 0
    for (let index = 1; index < currentCandidates.length; index += 1) {
      const candidateTarget = targets?.[currentCandidates[index]]
      const currentLowestTarget = targets?.[currentCandidates[lowestIndex]]
      const hasTargets =
        typeof candidateTarget === 'number' && typeof currentLowestTarget === 'number'
      if (
        (hasTargets && candidateTarget < currentLowestTarget) ||
        (hasTargets &&
          candidateTarget === currentLowestTarget &&
          currentPercentages[index] < currentPercentages[lowestIndex]) ||
        (!hasTargets && currentPercentages[index] < currentPercentages[lowestIndex])
      ) {
        lowestIndex = index
      }
    }

    const lowestId = currentCandidates[lowestIndex]
    const remaining = currentCandidates.filter((_, index) => index !== lowestIndex)
    const remainingPercentages = currentPercentages.filter((_, index) => index !== lowestIndex)
    const redistributed = toIntPercentages(remainingPercentages)
    const winnerId = remaining.length === 1 ? remaining[0] : null

    activeRef.current = remaining
    pctsRef.current = redistributed
    eliminatedRef.current = [...eliminatedRef.current, lowestId]
    dispatch({
      type: 'eliminate',
      remaining,
      pcts: redistributed,
      lowestId,
      winnerId,
    })
  }, [])

  useEffect(() => {
    if (state.isComplete) return
    const id = window.setInterval(eliminateLowest, resolvedEliminationIntervalMs)
    return () => window.clearInterval(id)
  }, [state.isComplete, resolvedEliminationIntervalMs, eliminateLowest])

  const votes: Record<string, number> = {}
  state.active.forEach((id, index) => {
    votes[id] = state.pcts[index] ?? 0
  })
  state.eliminated.forEach((id) => {
    votes[id] = 0
  })

  return {
    votes,
    eliminated: state.eliminated,
    winnerId: state.winnerId,
    isComplete: state.isComplete,
  }
}
