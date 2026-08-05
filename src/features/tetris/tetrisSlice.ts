/**
 * Redux slice for the "Fit Me In" scored tournament.
 *
 * The React minigame owns its adaptive round structure and submits one
 * authoritative tournament result after the final. The legacy single-run
 * setHumanScore reducer remains available for compatibility with saved tests
 * and older callers.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type TetrisPrizeType = 'LOH' | 'POS'
export type TetrisPhase = 'idle' | 'playing' | 'complete'

export interface TetrisParticipant {
  id: string
  name: string
  isHuman: boolean
}

export interface TetrisState {
  phase: TetrisPhase
  competitionType: TetrisPrizeType
  seed: number
  participants: TetrisParticipant[]
  humanPlayerId: string | null
  aiScores: Record<string, number>
  humanScore: number | null
  finalScores: Record<string, number>
  winnerId: string | null
  lastPlaceId: string | null
  outcomeResolved: boolean
}

const initialState: TetrisState = {
  phase: 'idle',
  competitionType: 'LOH',
  seed: 0,
  participants: [],
  humanPlayerId: null,
  aiScores: {},
  humanScore: null,
  finalScores: {},
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
}

function deriveWinnerAndLastPlace(
  scores: Record<string, number>,
  participantIds: string[]
): { winnerId: string | null; lastPlaceId: string | null } {
  const eligible = participantIds.filter((id) => id in scores)
  if (eligible.length === 0) return { winnerId: null, lastPlaceId: null }

  let winnerId = eligible[0]
  let lastPlaceId = eligible[0]

  for (const id of eligible) {
    if (scores[id] > scores[winnerId]) winnerId = id
    if (scores[id] < scores[lastPlaceId]) lastPlaceId = id
  }

  return { winnerId, lastPlaceId }
}

export interface InitTetrisPayload {
  participantIds: string[]
  participantNames: Record<string, string>
  humanPlayerId: string | null
  competitionType: TetrisPrizeType
  seed: number
  aiScores: Record<string, number>
}

export interface CompleteTetrisTournamentPayload {
  finalScores: Record<string, number>
  winnerId: string
  lastPlaceId: string
  humanScore: number | null
}

const tetrisSlice = createSlice({
  name: 'tetris',
  initialState,
  reducers: {
    initTetris(state, action: PayloadAction<InitTetrisPayload>) {
      const { participantIds, participantNames, humanPlayerId, competitionType, seed, aiScores } =
        action.payload

      state.phase = 'playing'
      state.competitionType = competitionType
      state.seed = seed
      state.humanPlayerId = humanPlayerId
      state.aiScores = aiScores
      state.humanScore = null
      state.finalScores = {}
      state.winnerId = null
      state.lastPlaceId = null
      state.outcomeResolved = false
      state.participants = participantIds.map((id) => ({
        id,
        name: participantNames[id] ?? id,
        isHuman: id === humanPlayerId,
      }))
    },

    setHumanScore(state, action: PayloadAction<number>) {
      if (state.phase !== 'playing') return

      const humanScore = action.payload
      state.humanScore = humanScore

      const allScores: Record<string, number> = { ...state.aiScores }
      if (state.humanPlayerId) allScores[state.humanPlayerId] = humanScore
      state.finalScores = allScores

      const participantIds = state.participants.map((participant) => participant.id)
      const { winnerId, lastPlaceId } = deriveWinnerAndLastPlace(allScores, participantIds)
      state.winnerId = winnerId
      state.lastPlaceId = lastPlaceId
      state.phase = 'complete'
    },

    completeTetrisTournament(state, action: PayloadAction<CompleteTetrisTournamentPayload>) {
      if (state.phase !== 'playing') return

      state.finalScores = { ...action.payload.finalScores }
      state.winnerId = action.payload.winnerId
      state.lastPlaceId = action.payload.lastPlaceId
      state.humanScore = action.payload.humanScore
      state.phase = 'complete'
    },

    markTetrisOutcomeResolved(state) {
      state.outcomeResolved = true
    },

    resetTetris() {
      return { ...initialState }
    },
  },
})

export const {
  initTetris,
  setHumanScore,
  completeTetrisTournament,
  markTetrisOutcomeResolved,
  resetTetris,
} = tetrisSlice.actions

export default tetrisSlice.reducer
