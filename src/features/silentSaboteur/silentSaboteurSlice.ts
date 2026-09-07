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
 *   - A hidden saboteur persists through failed accusations in one case.
 *   - Each round: saboteur picks victim, all vote.
 *   - A unique leading accusation of the saboteur → saboteur eliminated and a new case starts.
 *   - Otherwise → victim eliminated and the case continues.
 *   - Final-3: 1-1-1 tie triggers Victim Override Rule.
 *   - Final-2: eliminated players (jury) vote; ties make the saboteur win; no jury → seeded fallback.
 *   - Outcome dispatch is idempotent via outcomeResolved guard.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  pickSaboteur,
  resolveRound as resolveRoundHelper,
  resolveFinal2,
  noJuryFallbackWinner,
  buildAiJuryVotes,
  pickVictimForAi,
  pickVoteForAiOrAbstain,
  buildRoundEvidence,
  buildAiSurvivorJuryVotes,
  resolveSurvivorJury,
  type SilentSaboteurRoundEvidence,
} from './helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SilentSaboteurPrizeType = 'LOH' | 'POS';
export type SilentSaboteurFinal2Kind = 'sabotage' | 'survivor_jury';

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
  /** The player who received the most votes (or was designated via Victim Override). */
  accusedId: string;
  votes: Record<string, string>;
}

export interface SilentSaboteurRoundHistoryEntry {
  round: number;
  victimId: string;
  /** Present only after a successful capture; unresolved cases keep the role secret. */
  saboteurId: string | null;
  accusedId: string;
  eliminatedId: string;
  reason: EliminationReason;
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

  /** Current case's saboteur. Persists through every failed accusation. */
  saboteurId: string | null;
  /** Current round's victim (reset each round). */
  victimId: string | null;
  /** votes[voterId] = accusedId */
  votes: Record<string, string>;
  /** Imperfect, sabotage-derived leads shown in the current round's Case File. */
  roundEvidence: SilentSaboteurRoundEvidence;

  /** Final-2 state */
  final2SaboteurId: string | null;
  final2VictimId: string | null;
  /** A normal sabotage verdict, or a survivor jury after the last case was solved. */
  final2Kind: SilentSaboteurFinal2Kind;
  /** juryVotes[jurorId] = finalist they accuse */
  juryVotes: Record<string, string>;
  /** Eligible final jurors. A caught final-three saboteur cannot choose the survivor. */
  juryIds: string[];
  /** Legacy field retained for state compatibility; Final-2 ties no longer use a tiebreak. */
  final2TieBreakVote: string | null;

  /** Reveal metadata for the UI. */
  revealInfo: RevealInfo | null;
  /** Completed rounds, retained after ephemeral round state is cleared. */
  roundHistory: SilentSaboteurRoundHistoryEntry[];

  /** Set when the game reaches final-2 with no jury players. */
  noJuryFallback: boolean;

  winnerId: string | null;
  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: SilentSaboteurState = {
  phase: 'idle',
  prizeType: 'LOH',
  seed: 0,
  round: 0,

  participantIds: [],
  activeIds: [],
  eliminatedIds: [],

  humanPlayerId: null,

  saboteurId: null,
  victimId: null,
  votes: {},
  roundEvidence: {},

  final2SaboteurId: null,
  final2VictimId: null,
  final2Kind: 'sabotage',
  juryVotes: {},
  juryIds: [],
  final2TieBreakVote: null,

  revealInfo: null,
  roundHistory: [],

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
      if (victimId === state.saboteurId) {
        if (import.meta.env.DEV) {
          console.error('[silentSaboteur] INVARIANT: victimId === saboteurId rejected', { victimId, saboteurId: state.saboteurId });
        }
        return;
      }
      if (!state.activeIds.includes(victimId)) return;
      state.victimId = victimId;
      state.votes = {};
      state.roundEvidence = state.saboteurId
        ? buildRoundEvidence(state.seed, state.round, state.activeIds, state.saboteurId, victimId, state.roundEvidence)
        : {};
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
      // Guard: victim is never a valid saboteur candidate in normal rounds
      if (accusedId === state.victimId) {
        if (import.meta.env.DEV) {
          console.warn(
            '[silentSaboteur] INVARIANT: vote targeting victim rejected',
            { voterId, accusedId, victimId: state.victimId },
          );
        }
        return;
      }
      // Guard: vote once only
      if (state.votes[voterId] !== undefined) return;

      state.votes[voterId] = accusedId;

      // Auto-advance when all active players have voted
      if (Object.keys(state.votes).length === state.activeIds.length) {
        _resolveVotingPhase(state);
      }
    },

    // ── End voting phase (timer expiry / forced resolve with abstentions) ─────
    endVotingPhase(state) {
      if (state.phase !== 'voting') return;
      _resolveVotingPhase(state);
    },

    // ── Advance from reveal ────────────────────────────────────────────────────
    advanceReveal(state) {
      if (state.phase !== 'reveal') return;
      _advanceAfterReveal(state);
    },

    // ── Start next round (from round_transition) ──────────────────────────────
    startNextRound(state) {
      if (state.phase !== 'round_transition') return;
      _startNextRound(state);
    },

    /** Resolve every remaining AI-only round immediately and stop on the winner screen. */
    fastForwardSilentSaboteur(state) {
      _fastForwardToWinner(state);
    },

    // ── Submit jury vote (final-2) ────────────────────────────────────────────
    submitJuryVote(state, action: PayloadAction<{ jurorId: string; accusedId: string }>) {
      if (state.phase !== 'final2_jury') return;
      const { jurorId, accusedId } = action.payload;
      // Must be a juror
      if (!state.juryIds.includes(jurorId)) return;
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
      if (Object.keys(state.juryVotes).length === state.juryIds.length) {
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

/** Assign the saboteur for a newly opened case and advance phase. */
function _assignSaboteur(state: SilentSaboteurState) {
  const saboteur = pickSaboteur(state.seed, state.round, state.activeIds);
  state.saboteurId = saboteur;
  state.phase = 'select_victim';
}

/** Resolve votes and apply elimination. */
function _resolveVotingPhase(state: SilentSaboteurState) {
  const { votes, saboteurId, victimId, activeIds } = state;
  if (!saboteurId || !victimId) return;

  // Dev invariant: saboteur and victim must be different
  if (import.meta.env.DEV) {
    if (saboteurId === victimId) {
      console.error('[silentSaboteur] INVARIANT FAILURE: saboteurId === victimId', { saboteurId, victimId });
    }
    // Verify no vote targets the victim
    for (const [voterId, accusedId] of Object.entries(votes)) {
      if (accusedId === victimId) {
        console.error(
          '[silentSaboteur] INVARIANT FAILURE: vote targets victim in normal round',
          { voterId, accusedId, victimId },
        );
      }
    }
  }

  const outcome = resolveRoundHelper(votes, saboteurId, victimId, activeIds);
  const { eliminatedId, reason, victimOverride, accusedId } = outcome;

  // Apply elimination
  state.activeIds = state.activeIds.filter((id) => id !== eliminatedId);
  state.eliminatedIds.push(eliminatedId);

  state.revealInfo = {
    eliminatedId,
    reason,
    victimOverride,
    saboteurId,
    victimId,
    accusedId,
    votes: { ...votes },
  };
  state.roundHistory.push({
    round: state.round + 1,
    victimId,
    saboteurId: reason === 'saboteur_caught' ? saboteurId : null,
    accusedId,
    eliminatedId,
    reason,
    votes: { ...votes },
  });
  state.phase = 'reveal';
}

function _advanceAfterReveal(state: SilentSaboteurState) {
  const remaining = state.activeIds.length;
  if (remaining === 1) {
    state.winnerId = state.activeIds[0];
    state.phase = 'winner';
  } else if (remaining === 2) {
    _startFinal2(state);
  } else {
    state.phase = 'round_transition';
  }
}

function _startNextRound(state: SilentSaboteurState) {
  const caseWasSolved = state.revealInfo?.reason === 'saboteur_caught';
  if (caseWasSolved) {
    state.saboteurId = null;
    state.roundEvidence = {};
  }
  state.victimId = null;
  state.votes = {};
  state.revealInfo = null;
  state.round += 1;
  if (state.saboteurId) {
    // A failed vote eliminates only the victim. The case remains open.
    state.phase = 'select_victim';
  } else {
    state.phase = 'select_saboteur';
    _assignSaboteur(state);
  }
}

function _fastForwardToWinner(state: SilentSaboteurState) {
  for (let guard = 0; guard < 100 && state.phase !== 'winner' && state.phase !== 'complete'; guard++) {
    if (state.phase === 'reveal') {
      _advanceAfterReveal(state);
    } else if (state.phase === 'round_transition') {
      _startNextRound(state);
    } else if (state.phase === 'select_victim' && state.saboteurId) {
      const victimId = pickVictimForAi(state.seed, state.round, state.saboteurId, state.activeIds);
      state.victimId = victimId;
      state.votes = {};
      state.roundEvidence = state.saboteurId
        ? buildRoundEvidence(state.seed, state.round, state.activeIds, state.saboteurId, victimId, state.roundEvidence)
        : {};
      state.phase = 'voting';
    } else if (state.phase === 'voting' && state.victimId) {
      for (const voterId of state.activeIds) {
        const accusedId = pickVoteForAiOrAbstain(
          state.seed,
          state.round,
          voterId,
          state.activeIds,
          state.victimId,
          state.roundEvidence,
        );
        if (accusedId !== null) state.votes[voterId] = accusedId;
      }
      _resolveVotingPhase(state);
    } else if (state.phase === 'final2_jury' && state.final2SaboteurId && state.final2VictimId) {
      const missingJurors = state.juryIds.filter((id) => state.juryVotes[id] === undefined);
      const finalists: [string, string] = [state.final2SaboteurId, state.final2VictimId];
      Object.assign(state.juryVotes, state.final2Kind === 'survivor_jury'
        ? buildAiSurvivorJuryVotes(state.seed, missingJurors, finalists)
        : buildAiJuryVotes(state.seed, missingJurors, state.final2SaboteurId, state.final2VictimId));
      _resolveFinal2Phase(state);
    } else {
      break;
    }
  }
}

/** Set up the Final-2 Jury Deduction Finale. */
function _startFinal2(state: SilentSaboteurState) {
  const [finalistA, finalistB] = state.activeIds;
  const lastCaseWasSolved = state.revealInfo?.reason === 'saboteur_caught';
  const unresolvedSaboteur = state.saboteurId && state.activeIds.includes(state.saboteurId)
    ? state.saboteurId
    : null;
  // A capture at final three leaves two innocent finalists. They receive a
  // survivor jury instead of inventing a role with no case history.
  const final2Kind: SilentSaboteurFinal2Kind = lastCaseWasSolved || !unresolvedSaboteur
    ? 'survivor_jury'
    : 'sabotage';
  const final2Saboteur = final2Kind === 'sabotage' ? unresolvedSaboteur! : finalistA;
  const final2Victim = final2Saboteur === finalistA ? finalistB : finalistA;

  state.final2SaboteurId = final2Saboteur;
  state.final2VictimId = final2Victim;
  state.final2Kind = final2Kind;
  state.juryVotes = {};
  state.juryIds = final2Kind === 'survivor_jury'
    ? state.eliminatedIds.filter((id) => id !== state.revealInfo?.eliminatedId)
    : [...state.eliminatedIds];
  state.final2TieBreakVote = null;

  if (state.juryIds.length === 0) {
    // No jury — use deterministic fallback immediately
    state.noJuryFallback = true;
    const fallbackWinner = noJuryFallbackWinner(state.seed, final2Saboteur, final2Victim);
    state.winnerId = fallbackWinner;
    state.phase = 'winner';
    return;
  }

  // The presentation layer reveals every tribunal vote after the player opens
  // the tribunal. This gives an all-AI tribunal the same cinematic sequence as
  // a tribunal with a human juror or finalist.
  state.phase = 'final2_jury';
}

/** Resolve the Final-2 phase. */
function _resolveFinal2Phase(state: SilentSaboteurState) {
  // Only resolve if we're in the Final-2 jury phase and finalists are known.
  if (state.phase !== 'final2_jury') {
    return;
  }
  if (!state.final2SaboteurId || !state.final2VictimId) {
    return;
  }

  const saboteurId = state.final2SaboteurId;
  const victimId = state.final2VictimId;
  const { juryVotes, juryIds } = state;

  // Guard: do not resolve until all jurors have voted.
  const jurorCount = juryIds.length;
  const votesReceived = Object.keys(juryVotes).length;
  if (votesReceived < jurorCount) {
    return;
  }

  state.winnerId = state.final2Kind === 'survivor_jury'
    ? resolveSurvivorJury(state.seed, juryVotes, [saboteurId, victimId])
    : resolveFinal2(juryVotes, saboteurId, victimId).winnerId;
  state.phase = 'winner';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const {
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  endVotingPhase,
  advanceReveal,
  startNextRound,
  fastForwardSilentSaboteur,
  submitJuryVote,
  advanceWinner,
  markSilentSaboteurOutcomeResolved,
  resetSilentSaboteur,
} = silentSaboteurSlice.actions;

export default silentSaboteurSlice.reducer;
