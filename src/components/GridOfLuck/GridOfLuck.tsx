import { AnimatePresence, motion } from 'framer-motion'
import type { VariantLabels, Variants } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  boxOpenSequence,
  boxVariants,
  lpFloatVariants,
  playerVariants,
  screenEffects,
} from '../../animations/gridOfLuckAnimations'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import { getNextEligiblePlayer } from './gridOfLuckLogic'
import { mulberry32 } from '../../store/rng'
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar'
import { resolvePresentationAvatar } from '../../utils/presentationAvatar'
import './GridOfLuck.css'

type BoxCategory = 'positive' | 'negative' | 'aggressive' | 'strategic' | 'chaos'
type GamePhase = 'normal' | 'final' | 'finished'
type TurnMode =
  | 'box'
  | 'animating'
  | 'target'
  | 'martyr-blessing'
  | 'martyr-curse'
  | 'awaiting-continue'
  | 'spectator-choice'
  | 'finished'
type ScreenMode = 'idle' | 'vignette' | 'zoomIn' | 'flash'

type BoxType =
  | 'gain200'
  | 'shield'
  | 'doubleGain'
  | 'reveal2'
  | 'immunity'
  | 'hiddenBonus'
  | 'lose150'
  | 'loseNextTurn'
  | 'give100'
  | 'trap'
  | 'steal150'
  | 'forceOpen'
  | 'swapLp'
  | 'removeLeader200'
  | 'execution'
  | 'swapBoxes'
  | 'lockBox'
  | 'copyLastPower'
  | 'gridShuffle'
  | 'martyrdom'

interface ResolvedParticipant {
  id: string
  name: string
  isHuman: boolean
  precomputedScore: number
  avatar: string
}

interface GridPlayer {
  id: string
  name: string
  avatar: string
  lp: number
  isEliminated: boolean
  shield: boolean
  statusEffects: string[]
  doubleNextGain: boolean
  immunityRounds: number
  skipTurns: number
  trapArmed: boolean
  recentAttackerId: string | null
  isHuman: boolean
  support: number
}

interface GridBox {
  id: number
  type: BoxType
  isOpened: boolean
  isLocked: boolean
  isPeeked: boolean
}

interface PendingSelection {
  actorId: string
  effectType: BoxType
  sourceBoxId: number
  chosenTargets: string[]
  step: Exclude<TurnMode, 'box' | 'resolving' | 'finished'>
}

interface FloatingLpBurst {
  id: string
  playerId: string
  boxId: number
  value: number
  tone: 'gain' | 'loss' | 'neutral'
}

interface RevealState {
  boxId: number
  effectType: BoxType
  actorName: string
  phase: 'selection' | 'reveal' | 'resolved'
  message: string
  lpDeltas: { playerName: string; delta: number }[]
}

interface GameState {
  players: GridPlayer[]
  gridBoxes: GridBox[]
  turnOrder: string[]
  currentTurnIndex: number
  lastPowerUsed: BoxType | null
  gamePhase: GamePhase
  openedCount: number
  recentEvents: string[]
  winnerId: string | null
}

interface ResolutionOutcome {
  state: GameState
  pendingSelection?: PendingSelection
  message: string
  floatingBursts: FloatingLpBurst[]
  screenMode?: ScreenMode
  revealedEffectType?: BoxType
}

interface EventCardChip {
  label: string
  tone: 'gain' | 'loss' | 'neutral'
}

interface EventCardState {
  accent: string
  badge: string
  eyebrow: string | null
  title: string
  message: string
  detail: string | null
  meta: string | null
  symbol: string
  chips: EventCardChip[]
}

const FALLBACK_PARTICIPANTS: ResolvedParticipant[] = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 88, avatar: '🜂' },
  { id: 'ai-1', name: 'Nyx', isHuman: false, precomputedScore: 82, avatar: '🌙' },
  { id: 'ai-2', name: 'Vex', isHuman: false, precomputedScore: 76, avatar: '⚡' },
  { id: 'ai-3', name: 'Mara', isHuman: false, precomputedScore: 71, avatar: '🕯️' },
  { id: 'ai-4', name: 'Orion', isHuman: false, precomputedScore: 64, avatar: '☄️' },
  { id: 'ai-5', name: 'Sable', isHuman: false, precomputedScore: 59, avatar: '🜃' },
]

const BOX_ORDER: BoxType[] = [
  'gain200',
  'shield',
  'doubleGain',
  'reveal2',
  'immunity',
  'hiddenBonus',
  'lose150',
  'loseNextTurn',
  'give100',
  'trap',
  'steal150',
  'forceOpen',
  'swapLp',
  'removeLeader200',
  'execution',
  'swapBoxes',
  'lockBox',
  'copyLastPower',
  'gridShuffle',
  'martyrdom',
]

const BOX_META: Record<
  BoxType,
  { label: string; symbol: string; category: BoxCategory; description: string }
> = {
  gain200: {
    label: '+200 LP',
    symbol: '✦',
    category: 'positive',
    description: 'Pure life surges into your veins.',
  },
  shield: {
    label: 'Shield',
    symbol: '🛡',
    category: 'positive',
    description: 'Blocks the next damage or elimination.',
  },
  doubleGain: {
    label: 'Double Next Gain',
    symbol: '⬖',
    category: 'positive',
    description: 'Your next LP gain is doubled.',
  },
  reveal2: {
    label: 'Reveal 2',
    symbol: '◈',
    category: 'positive',
    description: 'Glimpse two dormant boxes.',
  },
  immunity: {
    label: 'Immunity',
    symbol: '☉',
    category: 'positive',
    description: 'Cannot be targeted for one round.',
  },
  hiddenBonus: {
    label: 'Hidden Bonus',
    symbol: '✺',
    category: 'positive',
    description: 'The chamber grants a random boon.',
  },
  lose150: {
    label: '-150 LP',
    symbol: '☠',
    category: 'negative',
    description: 'The chamber drinks your life.',
  },
  loseNextTurn: {
    label: 'Lose Next Turn',
    symbol: '⌛',
    category: 'negative',
    description: 'Your voice is silenced next round.',
  },
  give100: {
    label: 'Give 100 LP',
    symbol: '⇄',
    category: 'negative',
    description: 'Transfer your strength to someone else.',
  },
  trap: {
    label: 'Trap',
    symbol: '🜏',
    category: 'negative',
    description: 'Your next negative effect is doubled.',
  },
  steal150: {
    label: 'Steal 150 LP',
    symbol: '⛧',
    category: 'aggressive',
    description: 'Rip life from another player.',
  },
  forceOpen: {
    label: 'Force Open',
    symbol: '⫷',
    category: 'aggressive',
    description: 'Compel another player to open immediately.',
  },
  swapLp: {
    label: 'Swap LP',
    symbol: '⇆',
    category: 'aggressive',
    description: 'Exchange your fate with another.',
  },
  removeLeader200: {
    label: 'Drain Leader',
    symbol: '♛',
    category: 'aggressive',
    description: 'Remove 200 LP from the current leader.',
  },
  execution: {
    label: 'Execution',
    symbol: '⚚',
    category: 'aggressive',
    description: 'Instantly eliminate any eligible rival.',
  },
  swapBoxes: {
    label: 'Swap Boxes',
    symbol: '⌘',
    category: 'strategic',
    description: 'Rearrange two unopened relics.',
  },
  lockBox: {
    label: 'Lock Box',
    symbol: '⛓',
    category: 'strategic',
    description: 'Seal one box from selection.',
  },
  copyLastPower: {
    label: 'Copy Last Power',
    symbol: '🜁',
    category: 'strategic',
    description: 'Echo the last power used.',
  },
  gridShuffle: {
    label: 'Grid Shuffle',
    symbol: '☄',
    category: 'chaos',
    description: 'Unopened powers spin through the chamber.',
  },
  martyrdom: {
    label: 'Martyrdom',
    symbol: '✠',
    category: 'chaos',
    description: 'Fall, bless one, and curse another — or the same rival in a duel.',
  },
}

const CATEGORY_COLORS: Record<BoxCategory, string> = {
  positive: '#4cf4dd',
  negative: '#8a53ff',
  aggressive: '#ff4b5e',
  strategic: '#f3c269',
  chaos: '#f2f5ff',
}

const STATUS_ICON_GROUPS = {
  buff: '🔥',
  debuff: '❄️',
  special: '⚡',
} as const

const ELIMINATION_TYPES = new Set<BoxType>(['execution', 'martyrdom'])
const HUMAN_PICK_DELAY_MS = 1200
const BOX_CHOICE_BEAT_MS = 600
const BOX_REVEAL_BEAT_MS = 850
const SCREEN_MODE_RESET_MS = 850
const MAX_CHAIN_DEPTH = 4
const MAX_GRID_OF_LUCK_PLAYERS = 10
const MARTYRDOM_ELIMINATION_DAMAGE = 10_000
const BOX_REVEAL_VARIANTS: VariantLabels = ['preOpen', 'crack', 'settle']
const SYMBOL_REVEAL_VARIANTS: VariantLabels = ['reveal', 'settle']
const FLOAT_BASE_LEFT = 15
const FLOAT_COLUMN_OFFSET = 20
const FLOAT_BASE_TOP = 48
const FLOAT_ROW_OFFSET = 10
const CONTINUE_RITUAL_LABEL = 'Continue Ritual'
const CONTINUE_WATCHING_LABEL = 'Continue Watching'
// Skip counters can stack to 2 and advanceTurn may need to wrap the order more than
// once while also stepping past eliminated players, so allow several full passes.
const TURN_ADVANCE_ATTEMPT_MULTIPLIER = 6
const MIN_TURN_ADVANCE_ATTEMPTS = 12
// Skip-to-results simulates the rest of the chamber using the same deterministic
// state transitions; 320 steps is ample for a 20-box game with chained effects.
const MAX_SIMULATION_ITERATIONS = 320

const cameraEffects: Variants = {
  idle: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
  zoomIn: {
    scale: 1.03,
    opacity: 1,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandom<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

function appendEvent(recentEvents: string[], message: string): string[] {
  return [message, ...recentEvents].slice(0, 7)
}

function toDeltaChipLabel(delta: RevealState['lpDeltas'][number]): string {
  return `${delta.playerName}: ${delta.delta > 0 ? '+' : ''}${delta.delta} LP`
}

function getLpDeltaTone(delta: number): EventCardChip['tone'] {
  if (delta > 0) return 'gain'
  if (delta < 0) return 'loss'
  return 'neutral'
}

function toNextUpChipLabel(nextUp: string): string {
  return `Next: ${nextUp}`
}

function getResolvedTitleForSingleDelta(
  revealMetaLabel: string,
  lpDeltas: RevealState['lpDeltas']
): string {
  if (lpDeltas.length !== 1) return revealMetaLabel
  const [delta] = lpDeltas
  return `${delta.delta > 0 ? '+' : ''}${delta.delta} LP`
}

function withStatusEffects(player: GridPlayer): GridPlayer {
  const statusEffects: string[] = []
  if (player.shield) statusEffects.push('Shielded')
  if (player.doubleNextGain) statusEffects.push('Double gain')
  if (player.immunityRounds > 0) statusEffects.push('Immune')
  if (player.skipTurns > 0) statusEffects.push('Turn lost')
  if (player.trapArmed) statusEffects.push('Trap primed')
  return { ...player, statusEffects }
}

function clonePlayers(players: GridPlayer[]): GridPlayer[] {
  return players.map((player) =>
    withStatusEffects({ ...player, statusEffects: [...player.statusEffects] })
  )
}

function cloneBoxes(boxes: GridBox[]): GridBox[] {
  return boxes.map((box) => ({ ...box }))
}

function resolveParticipants(props: GenericMinigameProps): ResolvedParticipant[] {
  if (props.participants && props.participants.length > 0) {
    return props.participants.slice(0, MAX_GRID_OF_LUCK_PLAYERS).map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      precomputedScore:
        participant.previousPR ?? participant.precomputedScore ?? Math.max(1, 90 - index * 5),
      avatar: participant.avatar ?? '',
    }))
  }
  if (props.participantIds && props.participantIds.length > 0) {
    return props.participantIds.slice(0, MAX_GRID_OF_LUCK_PLAYERS).map((id, index) => ({
      id,
      name: index === 0 ? 'You' : `Player ${index + 1}`,
      isHuman: index === 0,
      precomputedScore: 90 - index * 5,
      avatar: index === 0 ? '🜂' : String.fromCharCode(65 + (index % 26)),
    }))
  }
  return FALLBACK_PARTICIPANTS
}

function buildPlayers(participants: ResolvedParticipant[]): GridPlayer[] {
  return participants.map((participant) =>
    withStatusEffects({
      id: participant.id,
      name: participant.name,
      avatar: participant.avatar,
      lp: 500,
      isEliminated: false,
      shield: false,
      statusEffects: [],
      doubleNextGain: false,
      immunityRounds: 0,
      skipTurns: 0,
      trapArmed: false,
      recentAttackerId: null,
      isHuman: participant.isHuman,
      support: participant.precomputedScore,
    })
  )
}

function buildBoxes(seed: number): GridBox[] {
  const rng = mulberry32(seed >>> 0)
  return shuffleWithRng(BOX_ORDER, rng).map((type, index) => ({
    id: index,
    type,
    isOpened: false,
    isLocked: false,
    isPeeked: false,
  }))
}

function createInitialState(participants: ResolvedParticipant[], seed: number): GameState {
  const players = buildPlayers(participants).sort((left, right) => right.support - left.support)
  return {
    players,
    gridBoxes: buildBoxes(seed),
    turnOrder: players.map((player) => player.id),
    currentTurnIndex: 0,
    lastPowerUsed: null,
    gamePhase: 'normal',
    openedCount: 0,
    recentEvents: ['The chamber awakens.'],
    winnerId: null,
  }
}

function getPlayer(players: GridPlayer[], playerId: string): GridPlayer {
  const player = players.find((entry) => entry.id === playerId)
  if (!player) {
    throw new Error(`Grid of Luck player '${playerId}' not found.`)
  }
  return player
}

function getCurrentPlayer(state: GameState): GridPlayer {
  return getPlayer(state.players, state.turnOrder[state.currentTurnIndex] ?? state.turnOrder[0])
}

function getAlivePlayers(players: GridPlayer[]): GridPlayer[] {
  return players.filter((player) => !player.isEliminated)
}

function getOpenableBoxes(boxes: GridBox[]): GridBox[] {
  return boxes.filter((box) => !box.isOpened && !box.isLocked)
}

function getValidTargets(
  players: GridPlayer[],
  actorId: string,
  effectType: BoxType
): GridPlayer[] {
  const aliveOthers = players.filter(
    (player) => !player.isEliminated && player.id !== actorId && player.immunityRounds <= 0
  )
  if (effectType === 'removeLeader200') {
    const actor = getPlayer(players, actorId)
    const leader = [...getAlivePlayers(players)].sort((left, right) => {
      if (right.lp !== left.lp) return right.lp - left.lp
      return right.support - left.support
    })[0]
    return leader && (leader.id === actor.id || leader.immunityRounds <= 0) ? [leader] : []
  }
  return aliveOthers
}

function chooseAiBox(state: GameState, actorId: string, rng: () => number): GridBox {
  const actor = getPlayer(state.players, actorId)
  const openable = getOpenableBoxes(state.gridBoxes)
  const peeked = openable.filter((box) => box.isPeeked)
  if (peeked.length > 0 && rng() > 0.34) {
    return pickRandom(rng, peeked)
  }
  const aliveSorted = getAlivePlayers(state.players).sort((left, right) => right.lp - left.lp)
  const actorRank = aliveSorted.findIndex((player) => player.id === actor.id)
  const biasThreshold = actorRank <= 1 ? 0.35 : actorRank >= aliveSorted.length - 2 ? 0.75 : 0.55
  if (rng() > biasThreshold) {
    return openable[Math.floor(rng() * openable.length)]
  }
  const weighted = [...openable].sort((left, right) => {
    const leftMeta = BOX_META[left.type]
    const rightMeta = BOX_META[right.type]
    const actorUnderPressure = actor.lp <= 300
    const leftScore =
      (left.isPeeked ? 2 : 0) +
      (leftMeta.category === 'positive' && actorUnderPressure ? 1 : 0) +
      (leftMeta.category === 'chaos' && actorRank >= aliveSorted.length - 2 ? 1 : 0)
    const rightScore =
      (right.isPeeked ? 2 : 0) +
      (rightMeta.category === 'positive' && actorUnderPressure ? 1 : 0) +
      (rightMeta.category === 'chaos' && actorRank >= aliveSorted.length - 2 ? 1 : 0)
    return rightScore - leftScore
  })
  return weighted[0] ?? openable[0]
}

function chooseAiTarget(
  players: GridPlayer[],
  actorId: string,
  effectType: BoxType,
  rng: () => number,
  excludedIds: string[] = []
): GridPlayer | null {
  const actor = getPlayer(players, actorId)
  const aliveSorted = [...getAlivePlayers(players)].sort((left, right) => {
    if (right.lp !== left.lp) return right.lp - left.lp
    return right.support - left.support
  })
  const actorRank = aliveSorted.findIndex((player) => player.id === actorId)
  const valid = getValidTargets(players, actorId, effectType).filter(
    (player) => !excludedIds.includes(player.id)
  )
  if (valid.length === 0) return null
  const leaderStyle = actorRank === 0
  const lowLpStyle = actorRank >= aliveSorted.length - 2 || actor.lp <= 240
  const revengeTarget = valid.find((player) => player.id === actor.recentAttackerId)
  if (revengeTarget && rng() > 0.18) return revengeTarget
  const ranked = [...valid].sort((left, right) => {
    const threatGap = right.lp - left.lp
    const defensiveBias = Math.abs(left.lp - actor.lp) - Math.abs(right.lp - actor.lp)
    return leaderStyle ? defensiveBias || threatGap : threatGap
  })
  const randomness = 0.15 + rng() * 0.1
  if (rng() < randomness) {
    return pickRandom(rng, valid)
  }
  if (lowLpStyle) {
    return ranked[0] ?? valid[0]
  }
  return leaderStyle ? (ranked[ranked.length - 1] ?? valid[0]) : (ranked[0] ?? valid[0])
}

function determineGamePhase(players: GridPlayer[], boxes: GridBox[]): GamePhase {
  const alive = getAlivePlayers(players)
  const remaining = boxes.filter((box) => !box.isOpened).length
  if (alive.length <= 1 || remaining <= 0) return 'finished'
  if (alive.length <= 3 || remaining <= 2) return 'final'
  return 'normal'
}

function finalizeState(state: GameState, message: string): GameState {
  const players = clonePlayers(state.players).sort((left, right) => {
    if (right.lp !== left.lp) return right.lp - left.lp
    return right.support - left.support
  })
  const gridBoxes = cloneBoxes(state.gridBoxes)
  const unopenedLocked = gridBoxes.filter((box) => !box.isOpened && box.isLocked)
  const unopened = gridBoxes.filter((box) => !box.isOpened)
  if (unopened.length > 0 && unopenedLocked.length === unopened.length) {
    unopenedLocked.forEach((box) => {
      box.isLocked = false
    })
  }
  const gamePhase = determineGamePhase(players, gridBoxes)
  const winnerId =
    gamePhase === 'finished'
      ? (players.find((player) => !player.isEliminated)?.id ?? players[0]?.id ?? null)
      : null
  return {
    ...state,
    players,
    gridBoxes,
    gamePhase,
    recentEvents: appendEvent(state.recentEvents, message),
    winnerId,
  }
}

function addBurst(
  floatingBursts: FloatingLpBurst[],
  playerId: string,
  boxId: number,
  value: number
): FloatingLpBurst[] {
  if (!value) return floatingBursts
  return [
    ...floatingBursts,
    {
      id: `${playerId}-${boxId}-${floatingBursts.length}-${Math.abs(value)}`,
      playerId,
      boxId,
      value,
      tone: value > 0 ? 'gain' : value < 0 ? 'loss' : 'neutral',
    },
  ]
}

function applyGain(
  players: GridPlayer[],
  playerId: string,
  amount: number
): { players: GridPlayer[]; applied: number } {
  const nextPlayers = clonePlayers(players)
  const player = getPlayer(nextPlayers, playerId)
  const multiplier = player.doubleNextGain ? 2 : 1
  const applied = amount * multiplier
  player.lp += applied
  player.doubleNextGain = false
  return { players: nextPlayers.map(withStatusEffects), applied }
}

function applyLossValue(
  players: GridPlayer[],
  playerId: string,
  amount: number,
  unopenedAfterReveal: number
): { players: GridPlayer[]; applied: number; blocked: boolean; spared: boolean } {
  const nextPlayers = clonePlayers(players)
  const player = getPlayer(nextPlayers, playerId)
  let appliedAmount = amount
  if (player.trapArmed) {
    appliedAmount *= 2
    player.trapArmed = false
  }
  if (player.shield) {
    player.shield = false
    return { players: nextPlayers.map(withStatusEffects), applied: 0, blocked: true, spared: false }
  }
  const aliveCount = getAlivePlayers(nextPlayers).length
  const wouldEliminate = player.lp - appliedAmount <= 0
  if (wouldEliminate && unopenedAfterReveal > 2 && aliveCount <= 3) {
    player.lp = Math.max(1, player.lp)
    return { players: nextPlayers.map(withStatusEffects), applied: 0, blocked: false, spared: true }
  }
  player.lp -= appliedAmount
  if (player.lp <= 0) {
    player.lp = 0
    player.isEliminated = true
  }
  return {
    players: nextPlayers.map(withStatusEffects),
    applied: appliedAmount,
    blocked: false,
    spared: false,
  }
}

function applyTransferLoss(
  players: GridPlayer[],
  playerId: string,
  amount: number,
  unopenedAfterReveal: number
): { players: GridPlayer[]; applied: number; spared: boolean } {
  const nextPlayers = clonePlayers(players)
  const player = getPlayer(nextPlayers, playerId)
  let appliedAmount = amount
  if (player.trapArmed) {
    appliedAmount *= 2
    player.trapArmed = false
  }
  const aliveCount = getAlivePlayers(nextPlayers).length
  const wouldEliminate = player.lp - appliedAmount <= 0
  if (wouldEliminate && unopenedAfterReveal > 2 && aliveCount <= 3) {
    player.lp = Math.max(1, player.lp)
    return { players: nextPlayers.map(withStatusEffects), applied: 0, spared: true }
  }
  player.lp -= appliedAmount
  if (player.lp <= 0) {
    player.lp = 0
    player.isEliminated = true
  }
  return { players: nextPlayers.map(withStatusEffects), applied: appliedAmount, spared: false }
}

function applySkip(
  players: GridPlayer[],
  playerId: string
): { players: GridPlayer[]; applied: number } {
  const nextPlayers = clonePlayers(players)
  const player = getPlayer(nextPlayers, playerId)
  const applied = player.trapArmed ? 2 : 1
  player.trapArmed = false
  player.skipTurns += applied
  return { players: nextPlayers.map(withStatusEffects), applied }
}

function swapBoxTypes(boxes: GridBox[], firstId: number, secondId: number): GridBox[] {
  const nextBoxes = cloneBoxes(boxes)
  const first = nextBoxes.find((box) => box.id === firstId)
  const second = nextBoxes.find((box) => box.id === secondId)
  if (!first || !second) return nextBoxes
  ;[first.type, second.type] = [second.type, first.type]
  first.isPeeked = false
  second.isPeeked = false
  return nextBoxes
}

function pickSafeTypeForEarlyTurn(
  boxes: GridBox[],
  boxId: number
): { boxes: GridBox[]; effectType: BoxType } {
  const currentBox = boxes.find((box) => box.id === boxId)
  if (!currentBox) return { boxes, effectType: 'hiddenBonus' }
  if (!ELIMINATION_TYPES.has(currentBox.type)) {
    return { boxes, effectType: currentBox.type }
  }
  const replacement = boxes.find(
    (box) => !box.isOpened && box.id !== boxId && !ELIMINATION_TYPES.has(box.type)
  )
  if (!replacement) {
    return { boxes, effectType: 'hiddenBonus' }
  }
  return {
    boxes: swapBoxTypes(boxes, boxId, replacement.id),
    effectType: replacement.type,
  }
}

function advanceTurn(state: GameState): { state: GameState; message: string } {
  let players = clonePlayers(state.players)
  let nextIndex = state.currentTurnIndex
  const skippedPlayerNames = new Set<string>()
  const maxAttempts = Math.max(
    state.turnOrder.length * TURN_ADVANCE_ATTEMPT_MULTIPLIER,
    MIN_TURN_ADVANCE_ATTEMPTS
  )

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    nextIndex = (nextIndex + 1) % state.turnOrder.length
    if (nextIndex === 0) {
      players = players.map((player) =>
        withStatusEffects({
          ...player,
          immunityRounds: Math.max(0, player.immunityRounds - 1),
        })
      )
    }
    const candidate = getPlayer(players, state.turnOrder[nextIndex])
    if (candidate.isEliminated) continue
    if (candidate.skipTurns > 0) {
      candidate.skipTurns -= 1
      skippedPlayerNames.add(candidate.name)
      players = players.map(withStatusEffects)
      continue
    }
    const skippedPrefix =
      skippedPlayerNames.size > 0
        ? `${Array.from(skippedPlayerNames).join(', ')} ${skippedPlayerNames.size > 1 ? 'lose their turns' : 'loses their turn'}. `
        : ''
    return {
      state: finalizeState(
        { ...state, players, currentTurnIndex: nextIndex },
        `${skippedPrefix}${candidate.name} steps into the spotlight.`
      ),
      message: `${skippedPrefix}${candidate.name} steps into the spotlight.`,
    }
  }

  const fallback =
    getAlivePlayers(players)[0] ?? getPlayer(players, state.turnOrder[state.currentTurnIndex])
  const skippedPrefix =
    skippedPlayerNames.size > 0
      ? `${Array.from(skippedPlayerNames).join(', ')} ${skippedPlayerNames.size > 1 ? 'lose their turns' : 'loses their turn'}. `
      : ''
  const message = `${skippedPrefix}${fallback.name} steps into the spotlight.`
  return {
    state: finalizeState(
      { ...state, players, currentTurnIndex: state.turnOrder.indexOf(fallback.id) },
      message
    ),
    message,
  }
}

function resolveAutoTargetIds(
  players: GridPlayer[],
  actorId: string,
  effectType: BoxType,
  rng: () => number
): string[] {
  if (effectType === 'martyrdom') {
    const blessing = chooseAiTarget(players, actorId, 'steal150', rng)
    const curse = chooseAiTarget(players, actorId, 'steal150', rng, blessing ? [blessing.id] : [])
    return [blessing?.id, curse?.id].filter((value): value is string => Boolean(value))
  }
  const target = chooseAiTarget(players, actorId, effectType, rng)
  return target ? [target.id] : []
}

function resolveForcedOpen(
  state: GameState,
  targetId: string,
  rng: () => number,
  chainDepth: number
): { state: GameState; message: string; floatingBursts: FloatingLpBurst[] } {
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    return { state, message: 'The chamber refuses to spiral any further.', floatingBursts: [] }
  }
  const openable = getOpenableBoxes(state.gridBoxes)
  if (openable.length === 0) {
    return {
      state,
      message: 'No unopened boxes remain — the force fizzles out.',
      floatingBursts: [],
    }
  }
  const chosenBox = chooseAiBox(state, targetId, rng)
  const selection = resolveBoxSelection(state, targetId, chosenBox.id, rng, chainDepth + 1, true)
  if (selection.pendingSelection) {
    const targetIds = resolveAutoTargetIds(
      selection.state.players,
      selection.pendingSelection.actorId,
      selection.pendingSelection.effectType,
      rng
    )
    return applyEffectSelection(
      selection.state,
      selection.pendingSelection.actorId,
      selection.pendingSelection.effectType,
      selection.pendingSelection.sourceBoxId,
      targetIds,
      rng,
      chainDepth + 1,
      true
    )
  }
  return {
    state: selection.state,
    message: selection.message,
    floatingBursts: selection.floatingBursts,
  }
}

function applyEffectSelection(
  state: GameState,
  actorId: string,
  effectType: BoxType,
  sourceBoxId: number,
  targetIds: string[],
  rng: () => number,
  chainDepth = 0,
  fromForcedOpen = false
): ResolutionOutcome {
  let nextState: GameState = {
    ...state,
    players: clonePlayers(state.players),
    gridBoxes: cloneBoxes(state.gridBoxes),
    lastPowerUsed: effectType,
  }
  let message = ''
  let floatingBursts: FloatingLpBurst[] = []
  const actor = getPlayer(nextState.players, actorId)
  const actorPossessive = getActorPossessive(actor)
  const unopenedAfterReveal = nextState.gridBoxes.filter((box) => !box.isOpened).length

  const targetId = targetIds[0] ?? null
  const secondTargetId = targetIds[1] ?? null

  switch (effectType) {
    case 'gain200': {
      const gain = applyGain(nextState.players, actorId, 200)
      nextState.players = gain.players
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, gain.applied)
      message = actor.isHuman
        ? `You claim +${gain.applied} LP.`
        : `${actor.name} claims +${gain.applied} LP.`
      break
    }
    case 'shield': {
      getPlayer(nextState.players, actorId).shield = true
      nextState.players = nextState.players.map(withStatusEffects)
      message = actor.isHuman
        ? 'You are wrapped in a ritual shield.'
        : `${actor.name} is wrapped in a ritual shield.`
      break
    }
    case 'doubleGain': {
      getPlayer(nextState.players, actorId).doubleNextGain = true
      nextState.players = nextState.players.map(withStatusEffects)
      message = `${actorPossessive} next LP gain will be doubled.`
      break
    }
    case 'reveal2': {
      const revealTargets = shuffleWithRng(getOpenableBoxes(nextState.gridBoxes), rng).slice(0, 2)
      revealTargets.forEach((box) => {
        const targetBox = nextState.gridBoxes.find((entry) => entry.id === box.id)
        if (targetBox) targetBox.isPeeked = true
      })
      message =
        revealTargets.length > 0
          ? actor.isHuman
            ? `You peek at ${revealTargets.map((box) => BOX_META[box.type].label).join(' and ')}.`
            : `${actor.name} peeks at ${revealTargets.map((box) => BOX_META[box.type].label).join(' and ')}.`
          : actor.isHuman
            ? 'You reach for visions, but the chamber offers none.'
            : `${actor.name} reaches for visions, but the chamber offers none.`
      break
    }
    case 'immunity': {
      getPlayer(nextState.players, actorId).immunityRounds = 1
      nextState.players = nextState.players.map(withStatusEffects)
      message = actor.isHuman
        ? 'You cannot be targeted until the next round turns.'
        : `${actor.name} cannot be targeted until the next round turns.`
      break
    }
    case 'hiddenBonus': {
      const amount = 50 + Math.floor(rng() * 101)
      const gain = applyGain(nextState.players, actorId, amount)
      nextState.players = gain.players
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, gain.applied)
      message = actor.isHuman
        ? 'You uncover a hidden bonus.'
        : `${actor.name} uncovers a hidden bonus.`
      break
    }
    case 'lose150': {
      const loss = applyLossValue(nextState.players, actorId, 150, unopenedAfterReveal)
      nextState.players = loss.players
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, -loss.applied)
      message = loss.blocked
        ? actor.isHuman
          ? 'Your shield devours the curse.'
          : `${actor.name}'s shield devours the curse.`
        : loss.spared
          ? actor.isHuman
            ? 'You should have fallen, but the chamber spares you for now.'
            : `${actor.name} should have fallen, but the chamber spares them for now.`
          : actor.isHuman
            ? `You lose ${loss.applied} LP.`
            : `${actor.name} loses ${loss.applied} LP.`
      break
    }
    case 'loseNextTurn': {
      const skip = applySkip(nextState.players, actorId)
      nextState.players = skip.players
      message = actor.isHuman
        ? `You will lose ${skip.applied > 1 ? `${skip.applied} turns` : 'your next turn'}.`
        : `${actor.name} will lose ${skip.applied > 1 ? `${skip.applied} turns` : 'their next turn'}.`
      break
    }
    case 'give100': {
      if (!targetId) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const transfer = applyTransferLoss(nextState.players, actorId, 100, unopenedAfterReveal)
      nextState.players = transfer.players
      if (transfer.applied > 0) {
        const gain = applyGain(nextState.players, targetId, transfer.applied)
        nextState.players = gain.players
        floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, -transfer.applied)
        floatingBursts = addBurst(floatingBursts, targetId, sourceBoxId, transfer.applied)
      }
      message = transfer.spared
        ? actor.isHuman
          ? 'You almost give away everything, but the chamber keeps you alive for the final turns.'
          : `${actor.name} almost gives away everything, but the chamber keeps them alive for the final turns.`
        : actor.isHuman
          ? `You grant ${transfer.applied} LP to ${getPlayer(nextState.players, targetId).name}.`
          : `${actor.name} grants ${transfer.applied} LP to ${getPlayer(nextState.players, targetId).name}.`
      break
    }
    case 'trap': {
      getPlayer(nextState.players, actorId).trapArmed = true
      nextState.players = nextState.players.map(withStatusEffects)
      message = actor.isHuman
        ? 'You are marked — the next negative effect will be doubled.'
        : `${actor.name} is marked — the next negative effect will be doubled.`
      break
    }
    case 'steal150': {
      if (!targetId) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const victim = getPlayer(nextState.players, targetId)
      const loss = applyLossValue(nextState.players, targetId, 150, unopenedAfterReveal)
      nextState.players = loss.players
      if (loss.applied > 0) {
        const gain = applyGain(nextState.players, actorId, loss.applied)
        nextState.players = gain.players
      }
      getPlayer(nextState.players, targetId).recentAttackerId = actorId
      floatingBursts = addBurst(floatingBursts, targetId, sourceBoxId, -loss.applied)
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, loss.applied)
      message = loss.blocked
        ? actor.isHuman
          ? `${victim.name}'s shield denies you the theft.`
          : `${victim.name}'s shield denies ${actor.name} the theft.`
        : loss.spared
          ? actor.isHuman
            ? `${victim.name} clings to 1 LP as your theft almost ends them.`
            : `${victim.name} clings to 1 LP as ${actor.name}'s theft almost ends them.`
          : actor.isHuman
            ? `You steal ${loss.applied} LP from ${victim.name}.`
            : `${actor.name} steals ${loss.applied} LP from ${victim.name}.`
      break
    }
    case 'forceOpen': {
      if (!targetId) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const forced = resolveForcedOpen(nextState, targetId, rng, chainDepth + 1)
      nextState = forced.state
      message = actor.isHuman
        ? `You compel ${getPlayer(nextState.players, targetId).name} to open a box. ${forced.message}`
        : `${actor.name} compels ${getPlayer(nextState.players, targetId).name} to open a box. ${forced.message}`
      floatingBursts = [...floatingBursts, ...forced.floatingBursts]
      break
    }
    case 'swapLp': {
      if (!targetId) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const self = getPlayer(nextState.players, actorId)
      const target = getPlayer(nextState.players, targetId)
      ;[self.lp, target.lp] = [target.lp, self.lp]
      message = actor.isHuman
        ? `You swap LP totals with ${target.name}.`
        : `${self.name} swaps LP totals with ${target.name}.`
      break
    }
    case 'removeLeader200': {
      const target = chooseAiTarget(nextState.players, actorId, 'removeLeader200', rng)
      if (!target) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const loss = applyLossValue(nextState.players, target.id, 200, unopenedAfterReveal)
      nextState.players = loss.players
      floatingBursts = addBurst(floatingBursts, target.id, sourceBoxId, -loss.applied)
      getPlayer(nextState.players, target.id).recentAttackerId = actorId
      message = loss.blocked
        ? `${target.name}'s shield defies the leader drain.`
        : `${target.name}, the leader, loses ${loss.applied} LP.`
      break
    }
    case 'execution': {
      if (!targetId) {
        return applyEffectSelection(
          nextState,
          actorId,
          'hiddenBonus',
          sourceBoxId,
          [],
          rng,
          chainDepth + 1,
          fromForcedOpen
        )
      }
      const target = getPlayer(nextState.players, targetId)
      if (target.shield) {
        target.shield = false
        nextState.players = nextState.players.map(withStatusEffects)
        message = `${target.name}'s shield blocks execution.`
        break
      }
      target.lp = 0
      target.isEliminated = true
      nextState.players = nextState.players.map(withStatusEffects)
      message = actor.isHuman
        ? `You execute ${target.name} instantly.`
        : `${actor.name} executes ${target.name} instantly.`
      break
    }
    case 'swapBoxes': {
      const unopened = shuffleWithRng(
        nextState.gridBoxes.filter((box) => !box.isOpened),
        rng
      )
      if (unopened.length >= 2) {
        nextState.gridBoxes = swapBoxTypes(nextState.gridBoxes, unopened[0].id, unopened[1].id)
        message = actor.isHuman
          ? 'You swap two dormant boxes in the shadows.'
          : `${actor.name} swaps two dormant boxes in the shadows.`
      } else {
        message = actor.isHuman
          ? 'You try to shift the grid, but there are not enough unopened boxes.'
          : `${actor.name} tries to shift the grid, but there are not enough unopened boxes.`
      }
      break
    }
    case 'lockBox': {
      const candidates = nextState.gridBoxes.filter((box) => !box.isOpened && !box.isLocked)
      const chosen = candidates.length > 0 ? pickRandom(rng, candidates) : null
      if (chosen) {
        const target = nextState.gridBoxes.find((box) => box.id === chosen.id)
        if (target) target.isLocked = true
        message = actor.isHuman ? 'You seal one box shut.' : `${actor.name} seals one box shut.`
      } else {
        message = actor.isHuman
          ? 'You reach for a lock, but every box is already marked.'
          : `${actor.name} reaches for a lock, but every box is already marked.`
      }
      break
    }
    case 'copyLastPower': {
      const copied =
        nextState.lastPowerUsed && nextState.lastPowerUsed !== 'copyLastPower'
          ? nextState.lastPowerUsed
          : 'hiddenBonus'
      const copiedTargets = resolveAutoTargetIds(nextState.players, actorId, copied, rng)
      const copiedResolution = applyEffectSelection(
        nextState,
        actorId,
        copied,
        sourceBoxId,
        copiedTargets,
        rng,
        chainDepth + 1,
        fromForcedOpen
      )
      copiedResolution.state.lastPowerUsed = copied
      return {
        ...copiedResolution,
        message: `${actor.isHuman ? 'You echo' : `${actor.name} echoes`} ${BOX_META[copied].label}. ${copiedResolution.message}`,
        revealedEffectType: copied,
      }
    }
    case 'gridShuffle': {
      const unopened = nextState.gridBoxes.filter((box) => !box.isOpened)
      const shuffledTypes = shuffleWithRng(
        unopened.map((box) => box.type),
        rng
      )
      unopened.forEach((box, index) => {
        const target = nextState.gridBoxes.find((entry) => entry.id === box.id)
        if (target) {
          target.type = shuffledTypes[index] ?? target.type
          target.isPeeked = false
        }
      })
      message = actor.isHuman
        ? 'You trigger a grid shuffle.'
        : `${actor.name} triggers a grid shuffle.`
      break
    }
    case 'martyrdom': {
      const blessingId = targetId
      const curseId = secondTargetId ?? blessingId
      const sacrifice = applyLossValue(
        nextState.players,
        actorId,
        MARTYRDOM_ELIMINATION_DAMAGE,
        unopenedAfterReveal
      )
      nextState.players = sacrifice.players
      if (blessingId) {
        const blessing = applyGain(nextState.players, blessingId, 300)
        nextState.players = blessing.players
        floatingBursts = addBurst(floatingBursts, blessingId, sourceBoxId, blessing.applied)
      }
      if (curseId) {
        const curse = applyLossValue(nextState.players, curseId, 200, unopenedAfterReveal)
        nextState.players = curse.players
        floatingBursts = addBurst(floatingBursts, curseId, sourceBoxId, -curse.applied)
      }
      const affectsSingleRival = blessingId !== undefined && blessingId === curseId
      message = sacrifice.spared
        ? actor.isHuman
          ? 'You offer martyrdom, but the chamber refuses the death before the endgame.'
          : `${actor.name} offers martyrdom, but the chamber refuses the death before the endgame.`
        : affectsSingleRival
          ? actor.isHuman
            ? 'You embrace martyrdom and twist the fate of a lone rival.'
            : `${actor.name} embraces martyrdom and twists the fate of a lone rival.`
          : actor.isHuman
            ? 'You embrace martyrdom and twist the fate of two rivals.'
            : `${actor.name} embraces martyrdom and twists the fate of two rivals.`
      break
    }
  }

  nextState = finalizeState(nextState, message)
  return {
    state: nextState,
    message,
    floatingBursts,
    screenMode: effectType === 'gridShuffle' || effectType === 'martyrdom' ? 'flash' : 'vignette',
    revealedEffectType: effectType,
  }
}

function resolveBoxSelection(
  state: GameState,
  actorId: string,
  boxId: number,
  rng: () => number,
  chainDepth = 0,
  fromForcedOpen = false
): ResolutionOutcome {
  const box = state.gridBoxes.find((entry) => entry.id === boxId)
  if (!box || box.isOpened || box.isLocked) {
    return { state, message: 'That box cannot be opened.', floatingBursts: [] }
  }

  const nextState: GameState = {
    ...state,
    players: clonePlayers(state.players),
    gridBoxes: cloneBoxes(state.gridBoxes),
  }
  let effectType = box.type

  if (nextState.openedCount < 3 && ELIMINATION_TYPES.has(effectType)) {
    const safePick = pickSafeTypeForEarlyTurn(nextState.gridBoxes, boxId)
    nextState.gridBoxes = safePick.boxes
    effectType = safePick.effectType
  }

  const targetBox = nextState.gridBoxes.find((entry) => entry.id === boxId)
  if (!targetBox) {
    return { state, message: 'The chosen box vanishes before it can open.', floatingBursts: [] }
  }

  targetBox.isOpened = true
  targetBox.isLocked = false
  targetBox.isPeeked = false
  nextState.openedCount += 1

  const requiresTarget =
    ['give100', 'steal150', 'forceOpen', 'swapLp', 'execution'].includes(effectType) ||
    effectType === 'martyrdom'
  if (requiresTarget && !fromForcedOpen) {
    const validTargets = getValidTargets(nextState.players, actorId, effectType)
    if (
      effectType === 'martyrdom' &&
      validTargets.length >= 2 &&
      getPlayer(nextState.players, actorId).isHuman
    ) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'martyr-blessing',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose who is blessed by martyrdom.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      }
    }
    if (
      effectType === 'martyrdom' &&
      validTargets.length === 1 &&
      getPlayer(nextState.players, actorId).isHuman
    ) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'target',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose the rival touched by martyrdom.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      }
    }
    if (validTargets.length >= 1 && getPlayer(nextState.players, actorId).isHuman) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'target',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose a target for ${BOX_META[effectType].label}.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      }
    }
  }

  const targetIds = requiresTarget
    ? resolveAutoTargetIds(nextState.players, actorId, effectType, rng)
    : []
  return applyEffectSelection(
    nextState,
    actorId,
    effectType,
    boxId,
    targetIds,
    rng,
    chainDepth + 1,
    fromForcedOpen
  )
}

function getBoxTone(effectType: BoxType): string {
  return CATEGORY_COLORS[BOX_META[effectType].category]
}

function getPlayerStatusIcons(player: GridPlayer): string[] {
  if (player.isEliminated || player.statusEffects.length === 0) return []

  const iconSet = new Set<string>()

  player.statusEffects.forEach((effect) => {
    const normalized = effect.toLowerCase()
    if (
      normalized.includes('shield') ||
      normalized.includes('immune') ||
      normalized.includes('double') ||
      normalized.includes('bonus') ||
      normalized.includes('bless')
    ) {
      iconSet.add(STATUS_ICON_GROUPS.buff)
    } else if (
      normalized.includes('trap') ||
      normalized.includes('lose') ||
      normalized.includes('curse') ||
      normalized.includes('turn lost') ||
      normalized.includes('lock')
    ) {
      iconSet.add(STATUS_ICON_GROUPS.debuff)
    } else {
      iconSet.add(STATUS_ICON_GROUPS.special)
    }
  })

  return [...iconSet]
}

function getBoxState(box: GridBox): keyof typeof boxVariants {
  if (box.isOpened) return 'opened'
  if (box.isLocked) return 'locked'
  return 'idle'
}

function getPreviewEffectType(state: GameState, boxId: number): BoxType {
  const box = state.gridBoxes.find((entry) => entry.id === boxId)
  if (!box) return 'hiddenBonus'

  let effectType = box.type
  if (state.openedCount < 3 && ELIMINATION_TYPES.has(effectType)) {
    effectType = pickSafeTypeForEarlyTurn(state.gridBoxes, boxId).effectType
  }

  if (effectType === 'copyLastPower' && state.lastPowerUsed) {
    return state.lastPowerUsed
  }

  return effectType
}

function getRevealTransitionMessage(boxId: number, effectType: BoxType): string {
  return `Box ${boxId + 1} opens and reveals ${BOX_META[effectType].label}.`
}

function getActorPossessive(player: GridPlayer): string {
  return player.isHuman ? 'Your' : `${player.name}'s`
}

function describeActorBoxChoice(player: GridPlayer, boxId: number): string {
  return player.isHuman
    ? `You reach for box ${boxId + 1}.`
    : `${player.name} reaches for box ${boxId + 1}.`
}

function GridOfLuckAvatar({ player }: { player: GridPlayer }) {
  const candidates = useMemo(
    () =>
      resolveAvatarCandidates({ id: player.id, name: player.name, avatar: player.avatar }).map(
        resolvePresentationAvatar
      ),
    [player.avatar, player.id, player.name]
  )
  const [candidateIdx, setCandidateIdx] = useState(0)
  const [showFallback, setShowFallback] = useState(false)

  if (showFallback) {
    return (
      <span className="grid-of-luck__avatar-fallback" aria-hidden="true">
        {isEmoji(player.avatar) ? player.avatar : player.name.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      className="grid-of-luck__avatar"
      src={candidates[candidateIdx] ?? ''}
      alt={player.name}
      onError={() => {
        if (candidateIdx < candidates.length - 1) {
          setCandidateIdx((index) => index + 1)
          return
        }
        setShowFallback(true)
      }}
    />
  )
}

export default function GridOfLuck(props: GenericMinigameProps) {
  const resolvedParticipants = useMemo(() => resolveParticipants(props), [props])
  const [sessionSeed] = useState<number>(() =>
    props.seed !== undefined && props.seed !== 0 ? props.seed : cryptoSeed()
  )
  const rngRef = useRef<() => number>(mulberry32(sessionSeed >>> 0))
  const revealTimerIds = useRef<Array<ReturnType<typeof window.setTimeout>>>([])
  const revealSequenceRef = useRef(0)
  const revealResolutionStateRef = useRef<GameState | null>(null)
  const [state, setState] = useState<GameState>(() =>
    createInitialState(resolvedParticipants, sessionSeed)
  )
  const [turnMode, setTurnMode] = useState<TurnMode>('box')
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null)
  const [announcement, setAnnouncement] = useState('Choose a box to begin the ritual.')
  const [floatingBursts, setFloatingBursts] = useState<FloatingLpBurst[]>([])
  const [screenMode, setScreenMode] = useState<ScreenMode>('idle')
  const [revealState, setRevealState] = useState<RevealState | null>(null)
  const [completed, setCompleted] = useState(false)
  const [isSpectatorMode, setIsSpectatorMode] = useState(false)
  const [showSpectatorChoice, setShowSpectatorChoice] = useState(false)
  const [autoplay, setAutoplay] = useState(false)

  const activePlayer = getCurrentPlayer(state)
  const humanPlayer = useMemo(
    () => state.players.find((player) => player.isHuman) ?? null,
    [state.players]
  )
  const ranking = useMemo(
    () =>
      [...state.players].sort((left, right) => {
        if (right.lp !== left.lp) return right.lp - left.lp
        return right.support - left.support
      }),
    [state.players]
  )

  const nextPlayer = useMemo(() => {
    return getNextEligiblePlayer(state)
  }, [state])

  const displayPlayers = useMemo(() => {
    const turnIndexById = new Map(state.turnOrder.map((playerId, index) => [playerId, index]))
    const totalTurns = Math.max(1, state.turnOrder.length)
    const humanId = humanPlayer?.id ?? null

    return [...state.players].sort((left, right) => {
      if (left.id === humanId) return -1
      if (right.id === humanId) return 1
      if (left.isEliminated !== right.isEliminated) return left.isEliminated ? 1 : -1

      const leftTurnIndex = turnIndexById.get(left.id) ?? 0
      const rightTurnIndex = turnIndexById.get(right.id) ?? 0
      const leftDistance = (leftTurnIndex - state.currentTurnIndex + totalTurns) % totalTurns
      const rightDistance = (rightTurnIndex - state.currentTurnIndex + totalTurns) % totalTurns

      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      if (right.lp !== left.lp) return right.lp - left.lp
      return right.support - left.support
    })
  }, [humanPlayer?.id, state.currentTurnIndex, state.players, state.turnOrder])

  const boxesRemaining = useMemo(
    () => state.gridBoxes.filter((box) => !box.isOpened).length,
    [state.gridBoxes]
  )

  const ritualFeedEntries = useMemo(() => state.recentEvents.slice(0, 4), [state.recentEvents])

  const validTargets = useMemo(() => {
    if (!pendingSelection) return []
    if (pendingSelection.step === 'martyr-curse') {
      return getValidTargets(state.players, pendingSelection.actorId, 'steal150').filter(
        (player) => !pendingSelection.chosenTargets.includes(player.id)
      )
    }
    return getValidTargets(
      state.players,
      pendingSelection.actorId,
      pendingSelection.effectType
    ).filter((player) => !pendingSelection.chosenTargets.includes(player.id))
  }, [pendingSelection, state.players])

  const eventCard = useMemo<EventCardState>(() => {
    if (turnMode === 'finished') {
      const winner = state.winnerId
        ? (state.players.find((player) => player.id === state.winnerId) ?? ranking[0])
        : ranking[0]
      return {
        accent: '#f3c269',
        badge: 'Ritual complete',
        eyebrow: null,
        title: winner ? `${winner.name} wins the chamber` : 'The ritual is complete',
        message: announcement,
        detail: winner ? `${winner.lp} LP` : null,
        meta: boxesRemaining === 0 ? 'All boxes opened' : `${boxesRemaining} boxes left`,
        symbol: '✦',
        chips: [],
      }
    }

    if (pendingSelection) {
      const pendingMeta = BOX_META[pendingSelection.effectType]
      const actor = state.players.find((player) => player.id === pendingSelection.actorId)
      const prompt =
        validTargets.length === 1
          ? 'Tap the highlighted player to continue.'
          : 'Tap a highlighted player to continue.'
      return {
        accent: CATEGORY_COLORS[pendingMeta.category],
        badge: 'Resolve effect',
        eyebrow:
          pendingSelection.step === 'martyr-blessing'
            ? 'Choose blessing target'
            : pendingSelection.step === 'martyr-curse'
              ? 'Choose curse target'
              : 'Choose target',
        title: pendingMeta.label,
        message: announcement,
        detail: validTargets.length > 0 ? prompt : pendingMeta.description,
        meta: actor ? `${actor.name} is resolving this power` : 'Resolve the chamber effect',
        symbol: pendingMeta.symbol,
        chips: [],
      }
    }

    if (revealState) {
      const revealMeta = BOX_META[revealState.effectType]
      const resolvedTitle =
        revealState.phase === 'resolved'
          ? getResolvedTitleForSingleDelta(revealMeta.label, revealState.lpDeltas)
          : revealMeta.label
      const revealChips: EventCardChip[] =
        revealState.phase === 'resolved'
          ? [
              ...revealState.lpDeltas.map((lpDelta) => ({
                label: toDeltaChipLabel(lpDelta),
                tone: getLpDeltaTone(lpDelta.delta),
              })),
              ...(nextPlayer
                ? [
                    {
                      label: toNextUpChipLabel(`${nextPlayer.name} · ${nextPlayer.lp} LP`),
                      tone: 'neutral' as const,
                    },
                  ]
                : []),
            ]
          : []
      return {
        accent: CATEGORY_COLORS[revealMeta.category],
        badge:
          revealState.phase === 'selection'
            ? 'Choice locked'
            : revealState.phase === 'reveal'
              ? 'Seal opening'
              : revealMeta.label,
        eyebrow:
          revealState.phase === 'selection'
            ? 'Chosen box'
            : revealState.phase === 'reveal'
              ? 'Revealed effect'
              : null,
        title:
          revealState.phase === 'selection'
            ? `${revealState.actorName} chose box ${revealState.boxId + 1}`
            : resolvedTitle,
        message: revealState.message,
        detail: revealState.phase === 'resolved' ? null : revealMeta.description,
        meta: `Box ${revealState.boxId + 1}`,
        symbol: revealMeta.symbol,
        chips: revealChips,
      }
    }

    return {
      accent: activePlayer.isHuman && turnMode === 'box' ? '#f3c269' : '#a855f7',
      badge:
        activePlayer.isHuman && turnMode === 'box'
          ? 'Your turn'
          : turnMode === 'spectator-choice'
            ? 'Spectator mode'
            : `${activePlayer.name}'s turn`,
      eyebrow: 'Current turn',
      title: activePlayer.name,
      message: announcement,
      detail:
        activePlayer.statusEffects.length > 0
          ? activePlayer.statusEffects.join(' • ')
          : activePlayer.isHuman && turnMode === 'box'
            ? 'Pick one sealed box to trigger the next chamber event.'
            : 'Watch the next reveal unfold.',
      meta: `${activePlayer.lp} LP`,
      symbol: activePlayer.isHuman && turnMode === 'box' ? '✦' : '◈',
      chips: [],
    }
  }, [
    activePlayer,
    announcement,
    boxesRemaining,
    nextPlayer,
    pendingSelection,
    ranking,
    revealState,
    state.players,
    state.winnerId,
    turnMode,
    validTargets.length,
  ])

  const clearRevealTimers = useCallback(() => {
    revealTimerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    revealTimerIds.current = []
  }, [])

  useEffect(() => {
    if (screenMode === 'idle') return undefined
    const timer = setTimeout(() => setScreenMode('idle'), SCREEN_MODE_RESET_MS)
    return () => clearTimeout(timer)
  }, [screenMode])

  useEffect(() => clearRevealTimers, [clearRevealTimers])

  const resolveOutcome = useCallback(
    (outcome: ResolutionOutcome, boxId: number | null = null) => {
      setState(outcome.state)
      setAnnouncement(outcome.message)
      setPendingSelection(outcome.pendingSelection ?? null)
      if (outcome.revealedEffectType && boxId !== null) {
        setRevealState({
          boxId,
          effectType: outcome.revealedEffectType,
          actorName: activePlayer.name,
          phase: 'resolved',
          message: outcome.message,
          lpDeltas: outcome.floatingBursts.map((burst) => ({
            playerName:
              outcome.state.players.find((player) => player.id === burst.playerId)?.name ?? '',
            delta: burst.value,
          })),
        })
      }
      setFloatingBursts((current) => [...current, ...outcome.floatingBursts])
      if (outcome.screenMode) {
        setScreenMode(outcome.screenMode)
      }
      if (outcome.pendingSelection) {
        setTurnMode(outcome.pendingSelection.step)
        return
      }
      if (outcome.state.gamePhase === 'finished') {
        setTurnMode('finished')
        return
      }
      const resolvedHuman = outcome.state.players.find((player) => player.isHuman)
      if (resolvedHuman?.isEliminated && !isSpectatorMode) {
        setShowSpectatorChoice(true)
        setAnnouncement(
          "You've been eliminated. Watch the ritual through or skip straight to the results."
        )
        setTurnMode('spectator-choice')
        return
      }
      setTurnMode('awaiting-continue')
    },
    [activePlayer.name, isSpectatorMode]
  )

  const stageBoxReveal = useCallback(
    (sourceState: GameState, actor: GridPlayer, boxId: number) => {
      clearRevealTimers()
      revealSequenceRef.current += 1
      const revealSequence = revealSequenceRef.current
      revealResolutionStateRef.current = sourceState

      const previewEffectType = getPreviewEffectType(sourceState, boxId)
      setPendingSelection(null)
      setTurnMode('animating')
      const boxChoiceMessage = describeActorBoxChoice(actor, boxId)
      setAnnouncement(boxChoiceMessage)
      setRevealState({
        boxId,
        effectType: previewEffectType,
        actorName: actor.name,
        phase: 'selection',
        message: boxChoiceMessage,
        lpDeltas: [],
      })
      setScreenMode('zoomIn')

      revealTimerIds.current.push(
        window.setTimeout(() => {
          if (revealSequenceRef.current !== revealSequence) return
          setRevealState((current) => {
            if (!current || current.boxId !== boxId) return current
            return {
              ...current,
              phase: 'reveal',
              message: getRevealTransitionMessage(boxId, previewEffectType),
            }
          })
          setScreenMode('vignette')
        }, BOX_CHOICE_BEAT_MS)
      )

      revealTimerIds.current.push(
        window.setTimeout(() => {
          if (revealSequenceRef.current !== revealSequence) return
          resolveOutcome(
            resolveBoxSelection(
              revealResolutionStateRef.current ?? sourceState,
              actor.id,
              boxId,
              rngRef.current
            ),
            boxId
          )
        }, BOX_CHOICE_BEAT_MS + BOX_REVEAL_BEAT_MS)
      )
    },
    [clearRevealTimers, resolveOutcome]
  )

  const handleBoxSelection = useCallback(
    (boxId: number) => {
      if (turnMode !== 'box' || state.gamePhase === 'finished') return
      if (!activePlayer.isHuman) return
      stageBoxReveal(state, activePlayer, boxId)
    },
    [activePlayer, stageBoxReveal, state, turnMode]
  )

  const handleTargetSelection = useCallback(
    (playerId: string) => {
      if (!pendingSelection) return
      if (!validTargets.some((player) => player.id === playerId)) return
      if (pendingSelection.step === 'martyr-blessing') {
        setPendingSelection({
          ...pendingSelection,
          chosenTargets: [playerId],
          step: 'martyr-curse',
        })
        setTurnMode('martyr-curse')
        setAnnouncement(
          `${getPlayer(state.players, pendingSelection.actorId).name} must now choose who loses 200 LP.`
        )
        return
      }
      const targetIds =
        pendingSelection.step === 'martyr-curse'
          ? [...pendingSelection.chosenTargets, playerId]
          : [playerId]
      const outcome = applyEffectSelection(
        state,
        pendingSelection.actorId,
        pendingSelection.effectType,
        pendingSelection.sourceBoxId,
        targetIds,
        rngRef.current
      )
      resolveOutcome(outcome, pendingSelection.sourceBoxId)
    },
    [pendingSelection, resolveOutcome, state, validTargets]
  )

  useEffect(() => {
    if (!autoplay || !pendingSelection || validTargets.length === 0) return undefined
    const timer = setTimeout(() => {
      const target =
        validTargets[Math.floor(rngRef.current() * validTargets.length)] ?? validTargets[0]
      if (target) handleTargetSelection(target.id)
    }, 650)
    return () => clearTimeout(timer)
  }, [autoplay, handleTargetSelection, pendingSelection, validTargets])

  useEffect(() => {
    if (turnMode !== 'box') return undefined
    if (state.gamePhase === 'finished') return undefined
    if (activePlayer.isHuman && !autoplay) return undefined
    const timer = setTimeout(
      () => {
        const box = chooseAiBox(state, activePlayer.id, rngRef.current)
        stageBoxReveal(state, activePlayer, box.id)
      },
      state.gamePhase === 'final' ? 700 : state.players.length >= 5 ? 850 : HUMAN_PICK_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [activePlayer, autoplay, stageBoxReveal, state, turnMode])

  useEffect(() => {
    if (floatingBursts.length === 0) return undefined
    const timer = setTimeout(() => {
      setFloatingBursts((current) => current.slice(1))
    }, 1300)
    return () => clearTimeout(timer)
  }, [floatingBursts])

  const finishMinigame = useCallback(() => {
    if (!props.onFinish || completed) return
    const winner = ranking[0]
    if (!winner) return
    setCompleted(true)
    props.onFinish(winner.lp, undefined, {
      authoritativeWinnerId: winner.id,
      rawValue: winner.lp,
      rawResults: Object.fromEntries(ranking.map((player) => [player.id, player.lp])),
    })
  }, [completed, props, ranking])

  const handleContinueTurn = useCallback(() => {
    if (turnMode !== 'awaiting-continue') return
    const advanced = advanceTurn(state)
    setState(advanced.state)
    setAnnouncement(advanced.message)
    setTurnMode('box')
    setRevealState(null)
  }, [state, turnMode])

  const handleContinueSpectating = useCallback(() => {
    setIsSpectatorMode(true)
    setShowSpectatorChoice(false)
    setAnnouncement('You remain in the chamber as a spectator. Continue when ready.')
    setTurnMode(state.gamePhase === 'finished' ? 'finished' : 'awaiting-continue')
  }, [state.gamePhase])

  const handleSkipToResults = useCallback(() => {
    let simulatedState = state
    let latestMessage = announcement
    let safety = MAX_SIMULATION_ITERATIONS

    while (simulatedState.gamePhase !== 'finished' && safety > 0) {
      safety -= 1
      const current = getCurrentPlayer(simulatedState)
      if (current.isEliminated) {
        const advanced = advanceTurn(simulatedState)
        simulatedState = advanced.state
        latestMessage = advanced.message
        continue
      }
      const box = chooseAiBox(simulatedState, current.id, rngRef.current)
      const outcome = resolveBoxSelection(simulatedState, current.id, box.id, rngRef.current)
      simulatedState = outcome.state
      latestMessage = outcome.message
      if (simulatedState.gamePhase === 'finished') break
      const advanced = advanceTurn(simulatedState)
      simulatedState = advanced.state
      latestMessage = advanced.message
    }

    setShowSpectatorChoice(false)
    setIsSpectatorMode(true)
    setRevealState(null)
    setPendingSelection(null)
    setState(simulatedState)
    setAnnouncement(
      simulatedState.gamePhase === 'finished'
        ? 'The remaining ritual is resolved. Continue to results.'
        : latestMessage
    )
    setTurnMode(simulatedState.gamePhase === 'finished' ? 'finished' : 'awaiting-continue')
  }, [announcement, state])

  return (
    <motion.div
      className={`grid-of-luck${state.gamePhase === 'final' ? ' grid-of-luck--final' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="grid-of-luck__backdrop"
        animate={screenMode}
        variants={screenEffects}
        aria-hidden="true"
      />
      <motion.div
        className="grid-of-luck__camera"
        animate={screenMode === 'zoomIn' ? 'zoomIn' : 'idle'}
        variants={cameraEffects}
      >
        <motion.header className="grid-of-luck__header" layout>
          <motion.div className="grid-of-luck__header-bar" layout>
            <motion.h2 className="grid-of-luck__title">
              {state.gamePhase === 'finished'
                ? 'Ritual Complete'
                : state.gamePhase === 'final'
                  ? 'Final Phase'
                  : 'Mystic Chamber'}
            </motion.h2>
            <motion.div className="grid-of-luck__turn-meta">
              <label className="grid-of-luck__autoplay">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(event) => setAutoplay(event.target.checked)}
                />
                Autoplay
              </label>
              <span className="grid-of-luck__boxes-remaining">{boxesRemaining} boxes</span>
              {state.gamePhase === 'final' && (
                <span className="grid-of-luck__phase-badge">Final</span>
              )}
            </motion.div>
          </motion.div>
        </motion.header>

        <motion.section className="grid-of-luck__players" layout>
          {displayPlayers.map((player) => {
            const isActive = activePlayer.id === player.id && turnMode !== 'finished'
            const isTargetable = validTargets.some((entry) => entry.id === player.id)
            const lpPercent = Math.max(0, Math.min(100, (player.lp / 900) * 100))
            const statusIcons = getPlayerStatusIcons(player)
            const variant = player.isEliminated
              ? 'eliminatedPlayer'
              : isTargetable
                ? 'targetedPlayer'
                : isActive
                  ? 'activePlayer'
                  : undefined
            return (
              <motion.button
                key={player.id}
                className={`grid-of-luck__player-card${player.isEliminated ? ' is-eliminated' : ''}${isTargetable ? ' is-targetable' : ''}${isActive ? ' is-active' : ''}`}
                type="button"
                data-testid="grid-of-luck-player-card"
                aria-label={`${player.name} ${player.lp} LP ${player.isEliminated ? 'Eliminated' : player.statusEffects.length > 0 ? player.statusEffects.join(', ') : 'No active effects'}`}
                variants={playerVariants}
                animate={variant}
                onClick={() => handleTargetSelection(player.id)}
                disabled={!isTargetable}
                whileHover={isTargetable ? { scale: 1.02 } : undefined}
                whileTap={isTargetable ? { scale: 0.985 } : undefined}
              >
                <motion.div className="grid-of-luck__player-spotlight" aria-hidden="true" />
                <motion.div className="grid-of-luck__avatar-shell">
                  <GridOfLuckAvatar player={player} />
                </motion.div>
                <motion.div className="grid-of-luck__player-chip-copy">
                  <motion.div className="grid-of-luck__player-name">{player.name}</motion.div>
                  <motion.div className="grid-of-luck__player-lp">{player.lp} LP</motion.div>
                </motion.div>
                <motion.div className="grid-of-luck__player-effects">
                  {player.isEliminated ? (
                    <span className="grid-of-luck__player-effect is-eliminated" aria-hidden="true">
                      ☠️
                    </span>
                  ) : (
                    statusIcons.map((icon, effectIndex) => (
                      <span
                        key={`${player.id}-${icon}-${effectIndex}`}
                        className="grid-of-luck__player-effect"
                        aria-hidden="true"
                      >
                        {icon}
                      </span>
                    ))
                  )}
                </motion.div>
                <motion.div className="grid-of-luck__lp-bar" aria-hidden="true">
                  <motion.div
                    className="grid-of-luck__lp-fill"
                    style={{ width: `${lpPercent}%` }}
                  />
                </motion.div>
              </motion.button>
            )
          })}
        </motion.section>

        <motion.section className="grid-of-luck__arena" layout>
          <motion.div className="grid-of-luck__grid-shell">
            <motion.div className="grid-of-luck__grid" layout>
              {state.gridBoxes.map((box) => {
                const opened = box.isOpened
                const effectMeta = BOX_META[box.type]
                const glow = opened ? getBoxTone(box.type) : 'rgba(185, 150, 255, 0.75)'
                const isCurrentReveal = revealState?.boxId === box.id
                const isClickable =
                  turnMode === 'box' &&
                  activePlayer.isHuman &&
                  !autoplay &&
                  !opened &&
                  !box.isLocked &&
                  state.gamePhase !== 'finished'
                return (
                  <motion.button
                    key={box.id}
                    className={`grid-of-luck__box${opened ? ' is-opened' : ''}${box.isPeeked ? ' is-peeked' : ''}${box.isLocked ? ' is-locked' : ''}${isClickable ? ' is-clickable' : ''}`}
                    type="button"
                    data-testid="grid-of-luck-box"
                    disabled={!isClickable}
                    variants={{ ...boxVariants, ...boxOpenSequence }}
                    animate={
                      (isCurrentReveal ? BOX_REVEAL_VARIANTS : getBoxState(box)) as VariantLabels
                    }
                    initial={false}
                    whileHover={isClickable ? 'hover' : undefined}
                    whileTap={isClickable ? 'press' : undefined}
                    style={{ ['--grid-of-luck-glow' as string]: glow }}
                    onClick={() => handleBoxSelection(box.id)}
                  >
                    <motion.div className="grid-of-luck__box-inner">
                      <motion.div className="grid-of-luck__box-id">{box.id + 1}</motion.div>
                      <motion.div className="grid-of-luck__box-whisper" aria-hidden="true" />
                      <motion.div
                        className="grid-of-luck__box-symbol"
                        animate={
                          (opened || isCurrentReveal ? SYMBOL_REVEAL_VARIANTS : undefined) as
                            | VariantLabels
                            | undefined
                        }
                        variants={boxOpenSequence}
                      >
                        {opened || box.isPeeked ? effectMeta.symbol : '?'}
                      </motion.div>
                      <motion.div className="grid-of-luck__box-label">
                        {opened
                          ? effectMeta.label
                          : box.isLocked
                            ? 'Locked'
                            : box.isPeeked
                              ? effectMeta.label
                              : 'Sealed'}
                      </motion.div>
                    </motion.div>
                  </motion.button>
                )
              })}
            </motion.div>
          </motion.div>

          <motion.aside className="grid-of-luck__sidebar" layout>
            <motion.div
              className="grid-of-luck__event-card"
              data-testid="grid-of-luck-event-card"
              style={{ ['--event-color' as string]: eventCard.accent }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="grid-of-luck__event-topline">
                <span className="grid-of-luck__event-badge">{eventCard.badge}</span>
                {eventCard.meta && (
                  <span className="grid-of-luck__event-meta">{eventCard.meta}</span>
                )}
              </div>
              <div className="grid-of-luck__event-main">
                <span className="grid-of-luck__event-symbol" aria-hidden="true">
                  {eventCard.symbol}
                </span>
                <div className="grid-of-luck__event-copy">
                  {eventCard.eyebrow && (
                    <span className="grid-of-luck__sidebar-label">{eventCard.eyebrow}</span>
                  )}
                  <strong className="grid-of-luck__event-title">{eventCard.title}</strong>
                  <p className="grid-of-luck__event-message">{eventCard.message}</p>
                  {eventCard.detail && (
                    <p className="grid-of-luck__event-detail">{eventCard.detail}</p>
                  )}
                </div>
              </div>
              {eventCard.chips.length > 0 && (
                <div className="grid-of-luck__event-chips">
                  {eventCard.chips.map((chip, index) => (
                    <span
                      key={`${chip.label}-${index}`}
                      className={`grid-of-luck__event-chip is-${chip.tone}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              )}
              {(turnMode === 'awaiting-continue' || turnMode === 'finished') && (
                <div className="grid-of-luck__event-footer">
                  {turnMode === 'awaiting-continue' && (
                    <motion.button
                      className="grid-of-luck__event-action"
                      type="button"
                      onClick={handleContinueTurn}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {isSpectatorMode || humanPlayer?.isEliminated
                        ? CONTINUE_WATCHING_LABEL
                        : CONTINUE_RITUAL_LABEL}
                    </motion.button>
                  )}
                  {turnMode === 'finished' && (
                    <motion.button
                      className="grid-of-luck__event-action"
                      type="button"
                      onClick={finishMinigame}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Continue
                    </motion.button>
                  )}
                </div>
              )}
            </motion.div>
            <motion.div className="grid-of-luck__log-card" data-testid="grid-of-luck-ritual-feed">
              <span className="grid-of-luck__sidebar-label">Ritual feed</span>
              <ul className="grid-of-luck__log-list">
                {ritualFeedEntries.length > 0 ? (
                  ritualFeedEntries.map((entry, index) => (
                    <li
                      key={`${entry}-${index}`}
                      className={`grid-of-luck__log-entry${index === 0 ? ' is-latest' : ''}`}
                    >
                      {entry}
                    </li>
                  ))
                ) : (
                  <li className="grid-of-luck__log-entry is-latest">
                    The chamber waits in silence.
                  </li>
                )}
              </ul>
            </motion.div>
          </motion.aside>
        </motion.section>
      </motion.div>

      <AnimatePresence>
        {showSpectatorChoice && (
          <motion.div
            className="grid-of-luck__spectator-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="grid-of-luck__spectator-card"
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
            >
              <span className="grid-of-luck__sidebar-label">Eliminated</span>
              <strong>
                {humanPlayer?.name ?? 'You'} can still watch the chamber or jump to the final
                results.
              </strong>
              <div className="grid-of-luck__spectator-actions">
                <button type="button" onClick={handleContinueSpectating}>
                  Stay as Spectator
                </button>
                <button type="button" className="is-danger" onClick={handleSkipToResults}>
                  Skip to Results
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {floatingBursts.map((burst) => {
          const row = Math.floor(burst.boxId / 4)
          const column = burst.boxId % 4
          return (
            <motion.div
              key={burst.id}
              className={`grid-of-luck__floating-lp is-${burst.tone}`}
              variants={lpFloatVariants}
              initial="initial"
              animate="animate"
              exit={{ opacity: 0 }}
              style={{
                left: `calc(${FLOAT_BASE_LEFT + column * FLOAT_COLUMN_OFFSET}% )`,
                top: `calc(${FLOAT_BASE_TOP + row * FLOAT_ROW_OFFSET}% )`,
              }}
            >
              {burst.value > 0 ? '+' : ''}
              {burst.value}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </motion.div>
  )
}
