import type { Phase } from '../types'

const STORAGE_KEY = 'bb_vox_nomination_reveal_v1'
const FIRST_PROMPT_SEEN_KEY = 'bb_vox_nomination_reveal_intro_seen_v1'
const EDUCATION_PENDING_KEY = 'bb_vox_nomination_reveal_education_pending_v1'

export type VoxNominationRevealStatus = 'ready' | 'available' | 'revealed' | 'declined'

export interface VoxNominationReveal {
  week: number
  ballots: Record<string, string[]>
  status: VoxNominationRevealStatus
}

export interface VoxNominationRevealRow {
  voterId: string
  voterName: string
  targetNames: string[]
}

export function loadVoxNominationReveal(): VoxNominationReveal | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as VoxNominationReveal) : null
  } catch {
    return null
  }
}

export function saveVoxNominationReveal(reveal: VoxNominationReveal): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reveal))
  } catch {
    // Optional reward history should never block the game.
  }
}

export function hasSeenVoxNominationRevealIntro(): boolean {
  try {
    return localStorage.getItem(FIRST_PROMPT_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function markVoxNominationRevealIntroSeen(): void {
  try {
    localStorage.setItem(FIRST_PROMPT_SEEN_KEY, 'true')
    localStorage.setItem(EDUCATION_PENDING_KEY, 'true')
  } catch {
    // The reveal remains usable for this session even if persistence is unavailable.
  }
}

export function consumeVoxNominationRevealEducationPending(): boolean {
  try {
    if (localStorage.getItem(EDUCATION_PENDING_KEY) !== 'true') return false
    localStorage.removeItem(EDUCATION_PENDING_KEY)
    return true
  } catch {
    return false
  }
}

export function isVoxNominationRevealPhrase(text: string): boolean {
  return /^\s*reveal\s+(?:the\s+)?nominations?[.!?]*\s*$/i.test(text)
}

export function isVoxNominationRevealActive(
  reveal: VoxNominationReveal | null,
  week: number,
  phase: Phase
): reveal is VoxNominationReveal {
  return Boolean(
    reveal &&
      reveal.week === week &&
      phase !== 'week_start' &&
      phase !== 'loh_comp_announcement' &&
      phase !== 'loh_comp' &&
      phase !== 'loh_results' &&
      phase !== 'social_1' &&
      phase !== 'nominations'
  )
}

export function updateVoxNominationRevealStatus(
  status: VoxNominationRevealStatus
): VoxNominationReveal | null {
  const current = loadVoxNominationReveal()
  if (!current) return null
  const next = { ...current, status }
  saveVoxNominationReveal(next)
  return next
}

export function buildVoxNominationRevealRows(
  ballots: Record<string, string[]>,
  playerNamesById: Record<string, string>
): VoxNominationRevealRow[] {
  return Object.entries(ballots).map(([voterId, targetIds]) => ({
    voterId,
    voterName: playerNamesById[voterId] ?? voterId,
    targetNames: targetIds.map((id) => playerNamesById[id] ?? id),
  }))
}
