/**
 * Redux slice for the "Silent Saboteur" elimination minigame.
 *
 * State machine:
 *
 *   idle
 *    └─ initSilentSaboteur ─────────────────────────────→ intro
 *         └─ advanceIntro ────────────────────────────→ select_victim
 *              (saboteur is assigned inside advanceIntro via _assignSaboteur)
 *                   └─ selectVictim ────────────────→ voting
 *                        └─ submitVote (all cast) ──→ reveal
 *                             └─ advanceReveal ─────→ round_transition  (≥3 active remain)
 *                                                  └─→ final2_jury       (2 remain, jury exists)
 *                                                  └─→ winner            (2 remain, no jury / auto)
 *                                                  └─→ winner            (1 remains)
 *                   └─ startNextRound ───────────────→ select_victim
 *         (final2_jury)
 *              └─ submitJuryVote (all cast) ────────→ winner
 *                   └─ advanceWinner ────────────────→ complete
 *
 * Rules summary:
 *   - Each round: RNG picks a hidden saboteur, saboteur picks victim, all vote.
 *   - Strict majority for saboteur → saboteur eliminated.
 *   - Otherwise → victim eliminated.
 *   - Final-3: 1-1-1 tie triggers Victim Override Rule.
 *   - Final-2: eliminated players (jury) vote; no jury → seeded fallback.
 *   - Outcome dispatch is idempotent via outcomeResolved guard.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  pickSaboteur,
  resolveRound as resolveRoundHelper,
  resolveFinal2,
  noJuryFallbackWinner,
  buildAiJuryVotes,
  pickVictimTieBreakVote,
} from './helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SilentSaboteurPrizeType = 'HOH' | 'POV';

export type SilentSaboteurPhase =
  | 'idle'
  | 'intro'
  | 'select_saboteur'
  | 'select_victim'
  | 'voting'
  | 'reveal'
  | 'round_transition'
  | 'final2_jury'
  | 'winner'
  | 'complete';

export type EliminationReason = 'saboteur_caught' | 'victim_eliminated';

export interface RevealInfo {
  eliminatedId: string;
  reason: EliminationReason;
  victimOverride: boolean;
  saboteurId: string;
  victimId: string;
  votes: Record<string, string>;
}

export interface SilentSaboteurState {
  phase: SilentSaboteurPhase;
  prizeType: SilentSaboteurPrizeType;
  seed: number;
  round: number;

  participantIds: string[];
  activeIds: string[];
  eliminatedIds: string[];

  humanPlayerId: string | null;

  /** Current round's saboteur (reset each round). */
  saboteurId: string | null;
  /** Current round's victim (reset each round). */
  victimId: string | null;
  /** votes[voterId] = accusedId */
  votes: Record<string, string>;

  /** Final-2 state */
  final2SaboteurId: string | null;
  final2VictimId: string | null;
  /** juryVotes[jurorId] = finalist they accuse */
  juryVotes: Record<string, string>;
  /** Victim's tiebreak vote (set if jury is tied) */
  final2TieBreakVote: string | null;

  /** Reveal metadata for the UI. */
  revealInfo: RevealInfo | null;

  /** Set when the game reaches final-2 with no jury players. */
  noJuryFallback: boolean;

  winnerId: string | null;
  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: SilentSaboteurState = {
  phase: 'idle',
  prizeType: 'HOH',
  seed: 0,
  round: 0,

  participantIds: [],
  activeIds: [],
  eliminatedIds: [],

  humanPlayerId: null,

  saboteurId: null,
  victimId: null,
  votes: {},

  final2SaboteurId: null,
  final2VictimId: null,
  juryVotes: {},
  final2TieBreakVote: null,

  revealInfo: null,

  noJuryFallback: false,

  winnerId: null,
  outcomeResolved: false,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const silentSaboteurSlice = createSlice({
  name: 'silentSaboteur',
  initialState,
  reducers: {
    // ── Init ──────────────────────────────────────────────────────────────────
    initSilentSaboteur(
      _state,
      action: PayloadAction<{
        participantIds: string[];
        prizeType: SilentSaboteurPrizeType;
        seed: number;
        humanPlayerId: string | null;
      }>,
    ): SilentSaboteurState {
      const { participantIds, prizeType, seed, humanPlayerId } = action.payload;
      return {
        ...initialState,
        phase: 'intro',
        prizeType,
        seed,
        participantIds: [...participantIds],
        activeIds: [...participantIds],
        eliminatedIds: [],
        humanPlayerId,
        round: 0,
      };
    },

    // ── Advance intro → select_saboteur ───────────────────────────────────────
    advanceIntro(state) {
      if (state.phase !== 'intro') return;
      state.phase = 'select_saboteur';
      _assignSaboteur(state);
    },

    // ── Select victim (dispatched by human saboteur or auto by AI) ────────────
    selectVictim(state, action: PayloadAction<{ victimId: string }>) {
      if (state.phase !== 'select_victim') return;
      const { victimId } = action.payload;
      // Guard: cannot self-target
      if (victimId === state.saboteurId) return;
      if (!state.activeIds.includes(victimId)) return;
      state.victimId = victimId;
      state.votes = {};
      state.phase = 'voting';
    },

    // ── Submit vote (human or auto AI) ────────────────────────────────────────
    submitVote(state, action: PayloadAction<{ voterId: string; accusedId: string }>) {
      if (state.phase !== 'voting') return;
      const { voterId, accusedId } = action.payload;
      // Guard: cannot self-vote
      if (voterId === accusedId) return;
      // Guard: must be active
      if (!state.activeIds.includes(voterId)) return;
      if (!state.activeIds.includes(accusedId)) return;
      // Guard: vote once only
      if (state.votes[voterId] !== undefined) return;

      state.votes[voterId] = accusedId;

      // Auto-advance when all active players have voted
      if (Object.keys(state.votes).length === state.activeIds.length) {
        _resolveVotingPhase(state);
      }
    },

    // ── Advance from reveal ────────────────────────────────────────────────────
    advanceReveal(state) {
      if (state.phase !== 'reveal') return;
      const remaining = state.activeIds.length;
      if (remaining === 1) {
        // Winner determined
        state.winnerId = state.activeIds[0];
        state.phase = 'winner';
      } else if (remaining === 2) {
        _startFinal2(state);
      } else {
        state.phase = 'round_transition';
      }
    },

    // ── Start next round (from round_transition) ──────────────────────────────
    startNextRound(state) {
      if (state.phase !== 'round_transition') return;
      // Clear round ephemeral state
      state.saboteurId = null;
      state.victimId = null;
      state.votes = {};
      state.revealInfo = null;
      state.round += 1;
      state.phase = 'select_saboteur';
      _assignSaboteur(state);
    },

    // ── Submit jury vote (final-2) ────────────────────────────────────────────
    submitJuryVote(state, action: PayloadAction<{ jurorId: string; accusedId: string }>) {
      if (state.phase !== 'final2_jury') return;
      const { jurorId, accusedId } = action.payload;
      // Must be a juror
      if (!state.eliminatedIds.includes(jurorId)) return;
      // Must accuse one of the two finalists
      const finalists = state.activeIds;
      if (!finalists.includes(accusedId)) return;
      // Cannot self-accuse (jurors are eliminated so this shouldn't happen,
      // but guard defensively)
      if (jurorId === accusedId) return;
      // Vote once only
      if (state.juryVotes[jurorId] !== undefined) return;

      state.juryVotes[jurorId] = accusedId;

      // Auto-advance when all jurors have voted
      if (Object.keys(state.juryVotes).length === state.eliminatedIds.length) {
        _resolveFinal2Phase(state);
      }
    },

    // ── Submit final-2 victim tiebreak vote ───────────────────────────────────
    submitFinal2TieBreak(state, action: PayloadAction<{ victimId: string; accusedId: string }>) {
      if (state.phase !== 'final2_jury') return;
      const { victimId, accusedId } = action.payload;
      if (victimId !== state.final2VictimId) return;
      const finalists = state.activeIds;
      if (!finalists.includes(accusedId)) return;
      state.final2TieBreakVote = accusedId;
      _resolveFinal2Phase(state);
    },

    // ── Advance winner → complete ─────────────────────────────────────────────
    advanceWinner(state) {
      if (state.phase !== 'winner') return;
      state.phase = 'complete';
    },

    // ── Idempotency guard ─────────────────────────────────────────────────────
    markSilentSaboteurOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    // ── Reset ─────────────────────────────────────────────────────────────────
    resetSilentSaboteur(): SilentSaboteurState {
      return initialState;
    },
  },
});

// ─── Internal helpers (operate on draft state) ────────────────────────────────

/** Assign the saboteur for the current round and advance phase. */
function _assignSaboteur(state: SilentSaboteurState) {
  const saboteur = pickSaboteur(state.seed, state.round, state.activeIds);
  state.saboteurId = saboteur;
  state.phase = 'select_victim';
}

/** Resolve votes and apply elimination. */
function _resolveVotingPhase(state: SilentSaboteurState) {
  const { votes, saboteurId, victimId, activeIds } = state;
  if (!saboteurId || !victimId) return;

  const outcome = resolveRoundHelper(votes, saboteurId, victimId, activeIds);
  const { eliminatedId, reason, victimOverride } = outcome;

  // Apply elimination
  state.activeIds = state.activeIds.filter((id) => id !== eliminatedId);
  state.eliminatedIds.push(eliminatedId);

  state.revealInfo = {
    eliminatedId,
    reason,
    victimOverride,
    saboteurId,
    victimId,
    votes: { ...votes },
  };
  state.phase = 'reveal';
}

/** Set up the Final-2 Jury Deduction Finale. */
function _startFinal2(state: SilentSaboteurState) {
  const [finalistA, finalistB] = state.activeIds;
  // Deterministically assign saboteur/victim roles for final-2
  const final2Saboteur = pickSaboteur(state.seed, state.round + 1000, state.activeIds);
  const final2Victim = final2Saboteur === finalistA ? finalistB : finalistA;

  state.final2SaboteurId = final2Saboteur;
  state.final2VictimId = final2Victim;
  state.juryVotes = {};
  state.final2TieBreakVote = null;

  if (state.eliminatedIds.length === 0) {
    // No jury — use deterministic fallback immediately
    state.noJuryFallback = true;
    const fallbackWinner = noJuryFallbackWinner(state.seed, final2Saboteur, final2Victim);
    state.winnerId = fallbackWinner;
    state.phase = 'winner';
    return;
  }

  // AI jurors vote immediately (pre-computed)
  const aiJurors = state.eliminatedIds.filter((id) => id !== state.humanPlayerId);
  if (aiJurors.length > 0) {
    const aiVotes = buildAiJuryVotes(state.seed, aiJurors, final2Saboteur, final2Victim);
    Object.assign(state.juryVotes, aiVotes);
  }

  state.phase = 'final2_jury';

  // If all jurors are AI (no human juror), auto-resolve now
  const humanIsJuror =
    state.humanPlayerId !== null && state.eliminatedIds.includes(state.humanPlayerId);
  if (!humanIsJuror && Object.keys(state.juryVotes).length === state.eliminatedIds.length) {
    _resolveFinal2Phase(state);
  }
}

/** Resolve the Final-2 phase. */
function _resolveFinal2Phase(state: SilentSaboteurState) {
  const saboteurId = state.final2SaboteurId!;
  const victimId = state.final2VictimId!;
  const { juryVotes, final2TieBreakVote } = state;

  // Determine victim's tiebreak vote if tie and victim is human (not yet submitted)
  // For AI victim we compute deterministically
  let tieBreakVote = final2TieBreakVote;
  if (tieBreakVote == null) {
    const allVotes = Object.values(juryVotes);
    const total = allVotes.length;
    const saboteurVotes = allVotes.filter((v) => v === saboteurId).length;
    const isTied = total > 0 && saboteurVotes * 2 === total;
    if (isTied) {
      const victimIsHuman = victimId === state.humanPlayerId;
      if (!victimIsHuman) {
        // AI victim: deterministic tiebreak
        tieBreakVote = pickVictimTieBreakVote(state.seed, victimId, saboteurId, victimId);
      }
      // Human victim: wait for submitFinal2TieBreak — bail out early
      if (victimIsHuman && final2TieBreakVote == null) return;
    }
  }

  const outcome = resolveFinal2(juryVotes, saboteurId, victimId, tieBreakVote);
  state.winnerId = outcome.winnerId;
  state.phase = 'winner';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const {
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  advanceReveal,
  startNextRound,
  submitJuryVote,
  submitFinal2TieBreak,
  advanceWinner,
  markSilentSaboteurOutcomeResolved,
  resetSilentSaboteur,
} = silentSaboteurSlice.actions;

export default silentSaboteurSlice.reducer;
