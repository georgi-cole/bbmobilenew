import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import type { GameState, Player, Phase, TvEvent, MinigameResult, MinigameSession, BattleBackState, SpectatorActiveState } from '../types';
import { mulberry32, seededPick, seededPickN } from './rng';
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getDefaultCompetitionSeasonState,
  getMinigameAiModel,
  simulateAiPerformance,
  updateCompetitionSeasonStateByPlayerId,
  type CompetitionSeasonUpdateInput,
} from '../ai/competition';
import HOUSEGUESTS from '../data/houseguests';
import { loadActiveProfile, archiveKeyForActiveProfile } from './profilesSlice';
import { getConfiguredCastSize, DEFAULT_ROSTER_SIZE } from './settingsHelpers';
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../utils/juryUtils';
import type { SeasonArchive } from './seasonArchive';
import { loadSeasonArchives } from './archivePersistence';

// ─── Canonical phase order ────────────────────────────────────────────────────
const PHASE_ORDER: Phase[] = [
  'week_start',
  'hoh_comp',
  'hoh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pov_comp',
  'pov_results',
  'pov_ceremony',
  'pov_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
];

// ─── Houseguest pool ─────────────────────────────────────────────────────────
// All 22 houseguests in src/data/houseguests.ts have matching avatar images in
// public/avatars/. This pool is the source for AI opponents each game.
const HOUSEGUEST_POOL = HOUSEGUESTS.map((hg) => ({
  id: hg.id,
  name: hg.name,
  avatar: hg.sex === 'Female' ? '👩' : '🧑',
}));

const GAME_ROSTER_SIZE = DEFAULT_ROSTER_SIZE;

/**
 * Build the human player from the stored profile.
 * Falls back to name='You' and the You.png silhouette when no profile exists.
 * The avatar resolver finds avatars/You.png via the name-based candidate
 * capitalize('You') = 'You' → avatars/You.png.
 */
function buildUserPlayer(): Player {
  const profile = loadActiveProfile();
  return {
    id: 'user',
    name: profile.name,
    avatar: profile.avatar,
    status: 'active',
    isUser: true,
  };
}

/**
 * Pick (rosterSize - 1) houseguests at random from the full pool.
 * Uses Math.random() to seed the pick so each new game has a fresh roster.
 * rosterSize is read from persisted settings (gameUX.castSize) with a
 * fallback to the GAME_ROSTER_SIZE constant.
 */
function pickHouseguests(rosterSize = GAME_ROSTER_SIZE): Player[] {
  const seed = (Math.floor(Math.random() * 0x100000000)) >>> 0;
  const rng = mulberry32(seed);
  return seededPickN(rng, HOUSEGUEST_POOL, rosterSize - 1).map((hg) => ({
    ...hg,
    status: 'active' as const,
  }));
}

function buildInitialPlayers(): Player[] {
  const rosterSize = getConfiguredCastSize();
  return [buildUserPlayer(), ...pickHouseguests(rosterSize)];
}

function buildInitialCompetitionSeasonState(players: Player[]): Record<string, ReturnType<typeof getDefaultCompetitionSeasonState>> {
  return Object.fromEntries(players.map((player) => [player.id, getDefaultCompetitionSeasonState()]));
}

const initialPlayers = buildInitialPlayers();

const initialState: GameState = {
  season: 1,
  week: 1,
  phase: 'week_start',
  seed: 42,
  hohId: null,
  prevHohId: null,
  nomineeIds: [],
  povWinnerId: null,
  replacementNeeded: false,
  povSavedId: null,
  awaitingNominations: false,
  pendingNominee1Id: null,
  awaitingPovDecision: false,
  awaitingPovSaveTarget: false,
  votes: {},
  awaitingHumanVote: false,
  awaitingTieBreak: false,
  tiedNomineeIds: null,
  awaitingFinal3Eviction: false,
  awaitingFinal3Plea: false,
  aiReplacementStep: 0,
  aiReplacementWaiting: false,
  f3Part1WinnerId: null,
  f3Part2WinnerId: null,
  voteResults: null,
  evictionSplashId: null,
  pendingEviction: null,
  players: initialPlayers,
  competitionSeasonStateByPlayerId: buildInitialCompetitionSeasonState(initialPlayers),
  tvFeed: [
    { id: 'e0', text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.', type: 'game', timestamp: Date.now() },
  ],
  isLive: false,
  seasonArchives: loadSeasonArchives(archiveKeyForActiveProfile()) ?? [],
  spectatorActive: null,
};

// ─── Helper ──────────────────────────────────────────────────────────────────
/** Monotonic counter to guarantee unique event IDs within the same millisecond. */
let _pushEventCounter = 0;

function pushEvent(state: GameState, text: string, type: TvEvent['type']) {
  const ts = Date.now();
  const event: TvEvent = {
    id: `${state.phase}-w${state.week}-${ts}-${++_pushEventCounter}`,
    text,
    type,
    timestamp: ts,
  };
  state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
}

/**
 * Determine whether the next evicted player should become a juror ('jury')
 * or simply go home ('evicted'), based on the configured jury size.
 *
 * Formula (default jurySize = 7 for a 12-player season):
 *   nonJuryEvictions = totalPlayers - 2 - jurySize
 * The first `nonJuryEvictions` players evicted go home; the rest become jury.
 */
function evictedStatus(state: GameState): 'evicted' | 'jury' {
  const totalPlayers = state.players.length;
  const jurySize = state.cfg?.jurySize ?? 7;
  const nonJuryEvictions = totalPlayers - 2 - jurySize;
  const evictedSoFar = state.players.filter((p) => p.status === 'evicted').length;
  return evictedSoFar < nonJuryEvictions ? 'evicted' : 'jury';
}

/**
 * Increment timesNominated for a player by ID.
 * Initializes stats if not already present.
 */
function incrementTimesNominated(state: GameState, playerId: string) {
  const p = state.players.find((pl) => pl.id === playerId);
  if (p) {
    if (!p.stats) p.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
    p.stats.timesNominated += 1;
  }
}

type CompetitionSeasonUpdatePayload = Omit<CompetitionSeasonUpdateInput, 'playerIds'>;
type ApplyMinigameWinnerPayload = {
  winnerId: string;
  participants?: string[];
  scores?: Record<string, number>;
  includePlacementBonuses?: boolean;
  skipSeasonUpdate?: boolean;
};

function applyCompetitionSeasonUpdateToState(
  state: GameState,
  payload: CompetitionSeasonUpdatePayload,
) {
  const playerIds = state.players.map((player) => player.id);
  state.competitionSeasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(
    state.competitionSeasonStateByPlayerId,
    { playerIds, ...payload },
  );
}

function getAlivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
}

function resolveCompetitionParticipants(state: GameState): string[] {
  const alive = getAlivePlayers(state);
  const aliveIds = alive.map((p) => p.id);
  if (state.phase === 'hoh_comp' && state.prevHohId) {
    const eligible = alive.filter((p) => p.id !== state.prevHohId);
    if (eligible.length > 0) {
      return eligible.map((p) => p.id);
    }
    // Edge case: only the outgoing HOH remains alive; allow them for updates.
    return aliveIds;
  }
  return aliveIds;
}

function buildFallbackScores(participants: string[], winnerId: string): Record<string, number> {
  // Assumes winnerId is one of the participants; otherwise all scores stay at 0.
  return Object.fromEntries(
    participants.map((id) => [id, id === winnerId ? 1 : 0]),
  );
}

/**
 * Mark a player as the Final HOH winner (Part 3 of Final 3).
 * Sets the wonFinalHoh flag on their stats so it can be archived.
 */
function markFinalHohWinner(state: GameState, winnerId: string) {
  const p = state.players.find((pl) => pl.id === winnerId);
  if (p) {
    if (!p.stats) p.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
    p.stats.wonFinalHoh = true;
  }
}

/**
 * Apply an HOH winner to state.  Used by both advance() and completeMinigame().
 */
function applyHohWinner(state: GameState, winnerId: string) {
  state.hohId = winnerId;
  state.players.forEach((p) => {
    if (p.id === winnerId) p.status = 'hoh';
    else if (p.status === 'hoh') p.status = 'active';
  });
  const winner = state.players.find((p) => p.id === winnerId);
  if (winner) {
    if (!winner.stats) winner.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
    winner.stats.hohWins += 1;
  }
  pushEvent(state, `${winner?.name ?? winnerId} has won Head of Household! 👑`, 'game');
}

/**
 * Apply a POV winner to state.  Handles Final-4 bypass logic.
 * Returns the resolved next phase ('pov_results' or 'final4_eviction').
 */
function applyPovWinner(state: GameState, winnerId: string, alive: Player[]): Phase {
  state.povWinnerId = winnerId;
  const p = state.players.find((pl) => pl.id === winnerId);
  if (p) {
    if (p.status === 'hoh') p.status = 'hoh+pov';
    else if (p.status === 'nominated') p.status = 'nominated+pov';
    else p.status = 'pov';
    if (!p.stats) p.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
    p.stats.povWins += 1;
  }
  pushEvent(state, `${p?.name ?? winnerId} has won the Power of Veto! 🎭`, 'game');

  // ── Final 4 bypass (skip ceremony; POV holder has sole eviction vote) ──
  // This rule always applies at Final 4 regardless of any config flags.
  if (alive.length === 4) {
    let f4Nominees = alive.filter(
      (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId,
    );
    // Edge case: HOH wins POV → same ID excluded twice, leaving 3 candidates.
    // Fall back to the original nominees from the nominations phase.
    if (f4Nominees.length !== 2 && state.nomineeIds.length === 2) {
      f4Nominees = alive.filter((pl) => state.nomineeIds.includes(pl.id));
    }
    if (f4Nominees.length === 2) {
      const f4Names = f4Nominees.map((pl) => pl.name).join(' and ');
      state.nomineeIds = f4Nominees.map((pl) => pl.id);
      f4Nominees.forEach((pl) => {
        const fp = state.players.find((x) => x.id === pl.id);
        if (fp) {
          if (fp.status === 'pov' || fp.status === 'hoh+pov') {
            fp.status = 'nominated+pov';
          } else if (fp.status !== 'nominated' && fp.status !== 'nominated+pov') {
            fp.status = 'nominated';
          }
        }
      });
      pushEvent(
        state,
        `Final 4! ${f4Names} are on the block. The POV holder has the sole vote to evict. 🏆`,
        'game',
      );
      return 'final4_eviction';
    } else {
      pushEvent(
        state,
        `[Warning] Final 4 bypass skipped — unexpected eligible nominee count (${f4Nominees.length}).`,
        'game',
      );
    }
  }
  return 'pov_results';
}

/**
 * Pick the winner from a set of participants and their scores.
 * Returns the participant ID with the highest score.
 *
 * Ties are broken deterministically using an FNV-1a hash of the sorted tied
 * IDs + high score, so equal tap counts never bias toward earlier IDs.
 *
 * Guard: participants with score <= 0 are excluded from winning unless all
 * participants have score <= 0 (fallback to the full list).
 */
function determineWinner(participants: string[], scores: Record<string, number>): string {
  if (participants.length === 0) {
    throw new Error('determineWinner called with no participants');
  }

  // Prefer participants with a positive score; fall back to all if none qualify.
  const positivePool = participants.filter((id) => (scores[id] ?? 0) > 0);
  const pool = positivePool.length > 0 ? positivePool : participants;

  // Find the highest score within the eligible pool.
  let highScore = -1;
  for (const id of pool) {
    const score = scores[id] ?? 0;
    if (score > highScore) highScore = score;
  }

  // Collect all pool participants that share the top score.
  const topIds = pool.filter((id) => (scores[id] ?? 0) === highScore);

  // Single winner — return directly.
  if (topIds.length === 1) return topIds[0];

  // Tie-break deterministically: hash sorted IDs + high score via FNV-1a.
  const tieKey = `${[...topIds].sort().join('|')}:${highScore}`;
  let hash = 0x811c9dc5 >>> 0; // FNV-1a 32-bit offset basis
  for (let i = 0; i < tieKey.length; i++) {
    hash ^= tieKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV-1a 32-bit prime
  }
  const rng = mulberry32(hash >>> 0);
  return topIds[Math.floor(rng() * topIds.length)];
}

/**
 * FNV-1a 32-bit hash for a string.
 * Used to derive independent, deterministic per-voter RNG seeds from a
 * voter's string ID, ensuring each AI voter produces a stable and distinct
 * vote without needing a separate stored seed.
 */
function hashString(s: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Isolated AI voting logic.
 * Deterministic placeholder — replace this function with relationship-based
 * logic once the social module is installed.
 *
 * @param voterId     ID of the AI voter casting their vote
 * @param nomineeIds  IDs of eligible nominees (must have ≥1 entry)
 * @param gameSeed    Current game seed (keeps results varied across weeks)
 * @returns           The nominee ID that this AI voter chooses to evict
 */
function chooseAiEvictionVote(
  voterId: string,
  nomineeIds: string[],
  gameSeed: number,
): string {
  const voterSeed = (gameSeed ^ hashString(voterId)) >>> 0;
  const rng = mulberry32(voterSeed);
  return nomineeIds[Math.floor(rng() * nomineeIds.length)];
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setPhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload;
    },
    advanceWeek(state) {
      state.week += 1;
      state.phase = 'week_start';
    },
    updatePlayer(state, action: PayloadAction<Player>) {
      const idx = state.players.findIndex((p) => p.id === action.payload.id);
      if (idx !== -1) state.players[idx] = action.payload;
    },
    addTvEvent(state, action: PayloadAction<Omit<TvEvent, 'id' | 'timestamp'>>) {
      const event: TvEvent = {
        ...action.payload,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },
    /** Persist a social phase summary to the Diary Room log (not the TV feed). */
    addSocialSummary(state, action: PayloadAction<{ summary: string; week: number }>) {
      // Route ONLY to the DR channel so the summary never appears in the main-screen
      // TVLog strip. isVisibleInMainLog() returns false for events with channels=['dr'].
      // source: 'manual' is required for isVisibleInDr() to return true.
      const now = Date.now();
      const event: TvEvent = {
        id: crypto.randomUUID(),
        text: `📊 Social Summary (Week ${action.payload.week}): ${action.payload.summary}`,
        type: 'diary',
        timestamp: now,
        channels: ['dr'],
        source: 'manual',
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },
    setLive(state, action: PayloadAction<boolean>) {
      state.isLive = action.payload;
    },

    /**
     * Set up a pending TapRace session with pre-computed AI scores.
     * Called by the startMinigame thunk; the GameScreen reacts by showing the
     * TapRace overlay.
     */
    launchMinigame(state, action: PayloadAction<MinigameSession>) {
      state.pendingMinigame = action.payload;
    },

    /**
     * Record the human player's final tap score, compute all participant scores,
     * determine the winner, update personal records, and advance the phase.
     *
     * Called by the TapRace component when the timer expires and the player
     * presses the "Done" / "Continue ▶" button.
     */
    completeMinigame(state, action: PayloadAction<number>) {
      const session = state.pendingMinigame;
      if (!session) return;

      const humanPlayer = state.players.find((p) => p.isUser);
      // Merge human score with pre-computed AI scores
      const scores: Record<string, number> = { ...session.aiScores };
      if (humanPlayer && session.participants.includes(humanPlayer.id)) {
        scores[humanPlayer.id] = action.payload;
      }

      // Determine winner: highest tap count wins
      const winnerId = determineWinner(session.participants, scores);

      // Update personal records for every participant
      const personalRecords: Record<string, number> = {};
      for (const id of session.participants) {
        const p = state.players.find((pl) => pl.id === id);
        if (!p) continue;
        const score = scores[id] ?? 0;
        if (!p.stats) p.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
        if (p.stats.tapRacePR == null || score > p.stats.tapRacePR) {
          p.stats.tapRacePR = score;
          personalRecords[id] = score;
        }
      }

      applyCompetitionSeasonUpdateToState(state, {
        participants: session.participants,
        scores,
        winnerId,
      });

      state.pendingMinigame = null;

      // ── Auto-advance phase based on context ──────────────────────────────
      // Apply the winner inline so minigameResult is never left set in state,
      // which would risk being consumed by a later advance() call.
      const alive = getAlivePlayers(state);
      if (state.phase === 'hoh_comp') {
        applyHohWinner(state, winnerId);
        state.phase = 'hoh_results';
      } else if (state.phase === 'pov_comp') {
        state.phase = applyPovWinner(state, winnerId, alive);
      }
      // Always keep minigameResult null. The winner was applied inline above for
      // competition phases; for non-competition phases (e.g., debug Test TapRace)
      // there is nothing to apply and we must not leave stale data that could be
      // consumed by a future hoh_results / pov_results advance() call.
      state.minigameResult = null;
    },

    /**
     * Discard the active minigame session without completing it.
     * Useful for debug bypasses; a subsequent advance() will pick randomly.
     */
    skipMinigame(state) {
      state.pendingMinigame = null;
      pushEvent(state, `[DEBUG] Minigame skipped — winner will be picked randomly. 🔧`, 'game');
    },

    /**
     * Apply a minigame winner determined by the challenge flow (MinigameHost).
     * Advances the phase (hoh_comp → hoh_results, pov_comp → pov_results) and
     * applies the appropriate winner effects without relying on pendingMinigame.
     *
     * This action is idempotent: if the winner for the current phase has already
     * been applied (hohId or povWinnerId already set and phase has advanced), a
     * second call is silently ignored.
     */
    applyMinigameWinner(state, action: PayloadAction<ApplyMinigameWinnerPayload>) {
      const {
        winnerId,
        participants,
        scores,
        includePlacementBonuses,
        skipSeasonUpdate,
      } = action.payload;
      const alive = getAlivePlayers(state);
      const resolvedParticipants = participants ?? resolveCompetitionParticipants(state);
      const hasScores = scores !== undefined;
      const resolvedScores = scores ?? buildFallbackScores(resolvedParticipants, winnerId);
      // includePlacementBonuses takes precedence; scores imply we have ranking info.
      const usePlacementBonuses = includePlacementBonuses ?? hasScores;
      let winnerWasApplied = false;
      if (state.phase === 'hoh_comp') {
        // Idempotency: if hohId already set the winner was already applied.
        if (state.hohId) {
          console.log('[gameSlice] applyMinigameWinner: HOH already applied, skipping.');
          return;
        }
        console.log('[gameSlice] applyMinigameWinner: applying HOH winner', winnerId);
        applyHohWinner(state, winnerId);
        state.phase = 'hoh_results';
        winnerWasApplied = true;
      } else if (state.phase === 'pov_comp') {
        // Idempotency: if povWinnerId already set the winner was already applied.
        if (state.povWinnerId) {
          console.log('[gameSlice] applyMinigameWinner: POV already applied, skipping.');
          return;
        }
        console.log('[gameSlice] applyMinigameWinner: applying POV winner', winnerId);
        state.phase = applyPovWinner(state, winnerId, alive);
        winnerWasApplied = true;
      }

      if (!skipSeasonUpdate && winnerWasApplied && resolvedParticipants.length > 0) {
        applyCompetitionSeasonUpdateToState(state, {
          participants: resolvedParticipants,
          scores: resolvedScores,
          winnerId,
          includePlacementBonuses: usePlacementBonuses,
        });
      }
    },

    /**
     * Apply competition season-state updates after a deterministic competition result.
     * Used by the challenge flow to keep modifiers in sync with minigame outcomes.
     */
    applyCompetitionSeasonUpdate(
      state,
      action: PayloadAction<CompetitionSeasonUpdatePayload>,
    ) {
      applyCompetitionSeasonUpdateToState(state, action.payload);
    },

    /**
     * Apply the result of a Final 3 part minigame.
     *
     * Called by the GameScreen after the MinigameHost completes in a
     * final3_comp*_minigame phase.  Sets the part winner, clears
     * minigameContext, pushes result TV events, and advances to the
     * next Final 3 phase (same logic as the deterministic AI-only path).
     */
    applyF3MinigameWinner(state, action: PayloadAction<string>) {
      const winnerId = action.payload;
      const winner = state.players.find((p) => p.id === winnerId);

      if (state.phase === 'final3_comp1_minigame') {
        state.f3Part1WinnerId = winnerId;
        pushEvent(
          state,
          `Final 3 Part 1 result: ${winner?.name ?? winnerId} wins and advances directly to Part 3! The other two houseguests will compete in Part 2. 🏆`,
          'game',
        );
        state.minigameContext = null;
        state.phase = 'final3_comp2';
      } else if (state.phase === 'final3_comp2_minigame') {
        state.f3Part2WinnerId = winnerId;
        pushEvent(
          state,
          `Final 3 Part 2 result: ${winner?.name ?? winnerId} wins and advances to face the Part 1 winner in Part 3! 🏆`,
          'game',
        );
        state.minigameContext = null;
        state.phase = 'final3_comp3';
      } else if (state.phase === 'final3_comp3_minigame') {
        // Crown the Final HOH (mirrors the deterministic path in advance() for final3_comp3).
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        state.hohId = winnerId;
        markFinalHohWinner(state, winnerId);
        state.players.forEach((p) => {
          if (p.status === 'hoh') p.status = 'active';
        });
        const hohPlayer = state.players.find((p) => p.id === winnerId);
        if (hohPlayer) hohPlayer.status = 'hoh';

        const nominees = alive.filter((p) => p.id !== winnerId);
        state.nomineeIds = nominees.map((p) => p.id);
        nominees.forEach((p) => {
          const np = state.players.find((x) => x.id === p.id);
          if (np && np.status !== 'nominated') np.status = 'nominated';
        });

        pushEvent(
          state,
          `Final 3 Part 3: ${winner?.name ?? winnerId} wins and is crowned the Final Head of Household! 👑`,
          'game',
        );

        state.minigameContext = null;

        if (hohPlayer?.isUser) {
          state.awaitingFinal3Eviction = true;
          const nomineeNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ');
          pushEvent(
            state,
            `${winner?.name ?? winnerId}, you must now evict either ${nomineeNames} to set the Final 2. 🎯`,
            'game',
          );
          state.phase = 'final3_decision';
        } else {
          // AI Final HOH: deterministically evict (same as advance() AI path).
          const aiRng = mulberry32(state.seed + 1);
          const evictee = seededPick(aiRng, nominees);
          const evicteePlayer = state.players.find((p) => p.id === evictee.id);
          if (evicteePlayer) {
            evicteePlayer.status = evictedStatus(state);
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          }
          pushEvent(
            state,
            `${winner?.name ?? winnerId} has chosen to evict ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game',
          );
          pushEvent(state, `The Final 2 is set! The jury will now vote for the winner of Big Brother. 🏆`, 'game');
          state.phase = 'week_end';
        }
      }
    },

    /**
     * Record per-game personal-record scores for all participants after a
     * challenge completes.  Only updates a player's PR if the new score beats
     * their previous best.  `lowerIsBetter` controls comparison direction.
     */
    updateGamePRs(
      state,
      action: PayloadAction<{ gameKey: string; scores: Record<string, number>; lowerIsBetter?: boolean }>,
    ) {
      const { gameKey, scores, lowerIsBetter = false } = action.payload;
      for (const [id, score] of Object.entries(scores)) {
        const player = state.players.find((p) => p.id === id);
        if (!player) continue;
        if (!player.stats) player.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
        if (!player.stats.gamePRs) player.stats.gamePRs = {};
        const prev = player.stats.gamePRs[gameKey];
        const isBetter = prev === undefined || (lowerIsBetter ? score < prev : score > prev);
        if (isBetter) {
          player.stats.gamePRs[gameKey] = score;
        }
      }
    },

    /**
     * Human HOH picks a replacement nominee after a POV auto-save.
     * Clears replacementNeeded so the Continue button reappears.
     * Validates that the selected player is eligible (not HOH, not POV holder,
     * and not already a nominee) to guard against invalid dispatches.
     */
    setReplacementNominee(state, action: PayloadAction<string>) {
      const id = action.payload;
      // Eligibility guard: reject HOH, POV holder, already-nominated players, or the player saved by the veto
      if (
        id === state.hohId ||
        id === state.povWinnerId ||
        state.nomineeIds.includes(id) ||
        id === state.povSavedId
      ) {
        return;
      }
      const player = state.players.find((p) => p.id === id);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!player || !hohPlayer) return;

      state.nomineeIds.push(id);
      player.status = 'nominated';
      incrementTimesNominated(state, id);
      state.replacementNeeded = false;
      state.povSavedId = null;
      pushEvent(
        state,
        `${hohPlayer.name} named ${player.name} as the replacement nominee. 🎯`,
        'game',
      );
    },

    /**
     * Human HOH selects their first nominee during the two-step nomination flow.
     * Sets `pendingNominee1Id` so the UI can move on to step 2.
     * Eligibility: alive, not HOH. Guards: awaitingNominations must be true and
     * phase must be nomination_results.
     */
    selectNominee1(state, action: PayloadAction<string>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return;
      const id = action.payload;
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
      const eligible = alive.filter((p) => p.id !== state.hohId);
      if (!eligible.some((p) => p.id === id)) return;
      state.pendingNominee1Id = id;
    },

    /**
     * Human HOH selects their second nominee, finalizing nominations.
     * Validates: alive, not HOH, not equal to nominee 1.
     * Guards: awaitingNominations must be true, phase must be nomination_results,
     * and pendingNominee1Id must be set.
     * Clears `awaitingNominations` and `pendingNominee1Id`.
     */
    finalizeNominations(state, action: PayloadAction<string>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return;
      const id2 = action.payload;
      const id1 = state.pendingNominee1Id;
      if (!id1 || id2 === id1) return;
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
      const eligible = alive.filter((p) => p.id !== state.hohId);
      if (!eligible.some((p) => p.id === id2)) return;
      if (!eligible.some((p) => p.id === id1)) return;

      const p1 = state.players.find((p) => p.id === id1);
      const p2 = state.players.find((p) => p.id === id2);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!p1 || !p2) return;

      state.nomineeIds = [id1, id2];
      p1.status = 'nominated';
      p2.status = 'nominated';
      incrementTimesNominated(state, id1);
      incrementTimesNominated(state, id2);
      state.awaitingNominations = false;
      state.pendingNominee1Id = null;
      pushEvent(
        state,
        `${p1.name} and ${p2.name} have been nominated for eviction by ${hohPlayer?.name ?? 'the HOH'}. 🎯`,
        'game',
      );
    },

    /**
     * Human HOH commits two nominees in a single action (multi-select flow).
     * Replaces the two-step `selectNominee1` / `finalizeNominations` pattern
     * when TvMultiSelectModal is used. Validates both IDs are eligible.
     */
    commitNominees(state, action: PayloadAction<string[]>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return;
      const ids = action.payload;
      if (ids.length !== 2 || ids[0] === ids[1]) return;
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
      const eligible = alive.filter((p) => p.id !== state.hohId);
      if (!eligible.some((p) => p.id === ids[0])) return;
      if (!eligible.some((p) => p.id === ids[1])) return;

      const p1 = state.players.find((p) => p.id === ids[0]);
      const p2 = state.players.find((p) => p.id === ids[1]);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!p1 || !p2) return;

      state.nomineeIds = [ids[0], ids[1]];
      p1.status = 'nominated';
      p2.status = 'nominated';
      incrementTimesNominated(state, ids[0]);
      incrementTimesNominated(state, ids[1]);
      state.awaitingNominations = false;
      state.pendingNominee1Id = null;
      pushEvent(
        state,
        `${p1.name} and ${p2.name} have been nominated for eviction by ${hohPlayer?.name ?? 'the HOH'}. 🎯`,
        'game',
      );
    },

    /**
     * Human POV holder decides whether to use or not use the veto.
     * - `false`: the veto is not used; log the event and clear the flag.
     * - `true`: set `awaitingPovSaveTarget` so the player can pick who to save.
     */
    submitPovDecision(state, action: PayloadAction<boolean>) {
      if (!state.awaitingPovDecision) return;
      state.awaitingPovDecision = false;
      const povWinner = state.players.find((p) => p.id === state.povWinnerId);
      if (action.payload) {
        // Will use veto — wait for save target
        state.awaitingPovSaveTarget = true;
      } else {
        // Will not use veto
        pushEvent(
          state,
          `${povWinner?.name ?? 'The veto holder'} has decided NOT to use the Power of Veto. The nominations remain the same. ⚡`,
          'game',
        );
      }
    },

    /**
     * Human POV holder picks which nominee to save with the veto.
     * After saving, triggers the replacement nominee flow (human HOH → modal;
     * AI HOH → deterministic pick).
     */
    submitPovSaveTarget(state, action: PayloadAction<string>) {
      const saveId = action.payload;
      if (!state.awaitingPovSaveTarget) return;
      if (!state.nomineeIds.includes(saveId)) return;

      const savedPlayer = state.players.find((p) => p.id === saveId);
      const povWinner = state.players.find((p) => p.id === state.povWinnerId);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!savedPlayer || !povWinner) return;

      // Save the selected nominee
      state.nomineeIds = state.nomineeIds.filter((id) => id !== saveId);
      savedPlayer.status = 'active';
      state.awaitingPovSaveTarget = false;
      // Track the saved player so they cannot be immediately re-nominated as the replacement
      state.povSavedId = saveId;
      pushEvent(
        state,
        `${povWinner.name} used the Power of Veto on ${savedPlayer.name}! 🛡️`,
        'game',
      );

      // HOH must name a replacement
      if (hohPlayer?.isUser) {
        state.replacementNeeded = true;
        pushEvent(
          state,
          `${hohPlayer.name} must now name a replacement nominee. 🎯`,
          'game',
        );
      } else {
        // AI HOH: deterministically pick replacement
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const eligible = alive.filter(
          (pl) =>
            pl.id !== state.hohId &&
            pl.id !== state.povWinnerId &&
            !state.nomineeIds.includes(pl.id) &&
            pl.id !== saveId,
        );
        if (eligible.length > 0) {
          const rng = mulberry32(state.seed);
          const replacement = seededPick(rng, eligible);
          state.nomineeIds.push(replacement.id);
          const rp = state.players.find((pl) => pl.id === replacement.id);
          if (rp) rp.status = 'nominated';
          incrementTimesNominated(state, replacement.id);
          // Keep povSavedId set so the UI can detect "veto was used" and show
          // the AI replacement animation. Cleared at week_start.
          pushEvent(
            state,
            `${hohPlayer?.name ?? 'The HOH'} named ${replacement.name} as the replacement nominee. 🎯`,
            'game',
          );
        }
      }
    },

    /**
     * Human eligible voter casts their eviction vote during `live_vote`.
     * Adds the vote to `state.votes` and clears `awaitingHumanVote`.
     */
    submitHumanVote(state, action: PayloadAction<string>) {
      const nomineeId = action.payload;
      if (!state.awaitingHumanVote) return;
      if (!state.nomineeIds.includes(nomineeId)) return;
      const humanPlayer = state.players.find((p) => p.isUser);
      if (!humanPlayer) return;
      if (!state.votes) state.votes = {};
      state.votes[humanPlayer.id] = nomineeId;
      state.awaitingHumanVote = false;
    },

    /**
     * Human HOH breaks a tied eviction vote by selecting the evictee.
     * Evicts the chosen nominee, clears `awaitingTieBreak`, and advances
     * directly to `week_end` (consistent with the finalizeFinal3Eviction pattern).
     */
    submitTieBreak(state, action: PayloadAction<string>) {
      const nomineeId = action.payload;
      if (!state.awaitingTieBreak) return;
      const tied = state.tiedNomineeIds ?? state.nomineeIds;
      if (!tied.includes(nomineeId)) return;

      const evictee = state.players.find((p) => p.id === nomineeId);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!evictee) return;

      state.awaitingTieBreak = false;
      state.tiedNomineeIds = null;
      state.votes = {};
      // voteResults was already shown before the tie-break prompt; clear it now.
      state.voteResults = null;
      // Defer the eviction commit until the cinematic overlay completes.
      state.pendingEviction = {
        evicteeId: nomineeId,
        evictionMessage: `${hohPlayer?.name ?? 'The HOH'} breaks the tie, voting to evict ${evictee.name}. ${evictee.name} has been evicted from the Big Brother house. 🗳️`,
      };
      // Push the week-end banner now: submitTieBreak jumps directly to week_end,
      // bypassing the advance() case 'week_end' branch that normally emits it.
      pushEvent(state, `Week ${state.week} has come to an end. A new week begins soon… ✨`, 'game');
      state.phase = 'week_end';
    },

    /**
     * Dismiss the vote results popup after the player has viewed it.
     * Clears `voteResults`; the eviction cinematic is driven separately
     * by `pendingEviction` and GameScreen logic.
     */
    dismissVoteResults(state) {
      state.voteResults = null;
    },

    /**
     * Dismiss the eviction splash animation after the player has viewed it.
     * Clears the eviction splash ID.
     */
    dismissEvictionSplash(state) {
      state.evictionSplashId = null;
    },

    /**
     * Commit the deferred eviction after the cinematic overlay completes.
     *
     * Sets the evictee's status to 'evicted' or 'jury', removes them from
     * nomineeIds, pushes the eviction event, and clears pendingEviction.
     * For Final-4 evictions (phase === 'final4_eviction') also transitions
     * the phase to 'final3' and pushes the "Final 3!" event.
     */
    finalizePendingEviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload;
      if (!state.pendingEviction || state.pendingEviction.evicteeId !== evicteeId) return;

      const evictee = state.players.find((p) => p.id === evicteeId);
      if (!evictee) return;

      const msg = state.pendingEviction.evictionMessage;
      const isFinal4 = state.phase === 'final4_eviction';

      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);
      state.pendingEviction = null;

      pushEvent(state, msg, 'game');

      if (isFinal4) {
        state.phase = 'final3';
        pushEvent(state, `Final 3! Three houseguests remain. 🏆`, 'game');
      }
    },


    /**
     * Player voluntarily self-evicts from the Diary Room.
     * Always sets the player's status to 'evicted' (never jury, regardless of jury
     * threshold — self-eviction is not a normal eviction path).
     * Clears any authoritative fields that reference the self-evicting player and
     * resets all human-decision blocking flags so the store is in a clean state
     * if the user navigates back (e.g., via the browser history).
     * The caller should navigate to /self-evicted after dispatching this action.
     */
    selfEvict(state, action: PayloadAction<string>) {
      const playerId = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return;

      // Always 'evicted', never 'jury', for self-evictions.
      player.status = 'evicted';
      state.nomineeIds = state.nomineeIds.filter((id) => id !== playerId);

      // Clear fields that directly reference this player to avoid dangling IDs.
      if (state.hohId === playerId) state.hohId = null;
      if (state.povWinnerId === playerId) state.povWinnerId = null;
      if (state.povSavedId === playerId) state.povSavedId = null;
      if (state.pendingNominee1Id === playerId) state.pendingNominee1Id = null;
      if (state.pendingEviction?.evicteeId === playerId) state.pendingEviction = null;

      // Clear human-decision blocking flags so advance() can run cleanly.
      state.replacementNeeded = false;
      state.awaitingNominations = false;
      state.awaitingPovDecision = false;
      state.awaitingPovSaveTarget = false;
      state.awaitingHumanVote = false;
      state.awaitingTieBreak = false;
      state.tiedNomineeIds = null;
      state.awaitingFinal3Eviction = false;
      state.awaitingFinal3Plea = false;
      state.evictionSplashId = null;
      state.votes = {};
      state.voteResults = null;

      pushEvent(
        state,
        `${player.name} has chosen to self-evict from the Big Brother house. 🚪`,
        'game',
      );
    },

    /**
     * Called by the UI when it starts rendering the step-1 "HOH must name a
     * replacement nominee" announcement during the AI replacement ceremony.
     * Clears the aiReplacementWaiting flag so advance() can proceed to step 2.
     */
    aiReplacementRendered(state) {
      state.aiReplacementWaiting = false;
    },

    /**
     * Finalize the Final 4 eviction — used when the human POV holder casts their vote.
     * For AI, advance() handles the eviction automatically.
     * Validates that the evictee is a current nominee before proceeding.
     */
    finalizeFinal4Eviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload;
      // Validate the evictee is a current nominee
      if (!state.nomineeIds.includes(evicteeId)) return;
      const evictee = state.players.find((p) => p.id === evicteeId);
      const povHolder = state.players.find((p) => p.id === state.povWinnerId);
      if (!evictee || !povHolder) return;

      // Defer the eviction commit until the cinematic overlay completes.
      // finalizePendingEviction will set evictee.status and transition to final3.
      state.awaitingPovDecision = false;
      state.pendingEviction = {
        evicteeId,
        evictionMessage: `${povHolder.name} has chosen to evict ${evictee.name}. ${evictee.name} has been evicted from the Big Brother house. 🚪`,
      };
    },

    /**
     * Finalize the Final 3 eviction — used when the human Final HOH directly evicts
     * one of the 2 remaining houseguests in the `final3_decision` phase.
     * For AI Final HOH, advance() handles the eviction automatically.
     * Validates that the evictee is a current nominee before proceeding.
     */
    finalizeFinal3Eviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload;
      // Validate the evictee is a current nominee
      if (!state.nomineeIds.includes(evicteeId)) return;
      const evictee = state.players.find((p) => p.id === evicteeId);
      const finalHoh = state.players.find((p) => p.id === state.hohId);
      if (!evictee || !finalHoh) return;

      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);
      state.awaitingFinal3Eviction = false;
      pushEvent(
        state,
        `${finalHoh.name} has chosen to evict ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game',
      );
      state.phase = 'week_end';
      pushEvent(state, `The Final 2 is set! The jury will now vote for the winner of Big Brother. 🏆`, 'game');
    },

    // ─── Battle Back / Jury Return twist actions ──────────────────────────────

    /**
     * Activate the Battle Back twist after an eligible eviction.
     * Sets `battleBack.active = true` (blocks advance()) and pushes a TV event
     * with `major: 'twist'` so the TV filler shows an announcement.
     * The full-screen competition overlay is NOT shown yet — it only opens after
     * `openBattleBackCompetition` is dispatched (triggered by GameScreen once the
     * TV announcement has been seen, ~5 s after activation).
     * Called by the `tryActivateBattleBack` thunk when the probability roll passes.
     */
    activateBattleBack(
      state,
      action: PayloadAction<{ candidates: string[]; week: number }>,
    ) {
      const bb: BattleBackState = {
        used: false,
        active: true,
        competitionActive: false,
        weekDecided: action.payload.week,
        candidates: action.payload.candidates,
        winnerId: null,
      };
      state.battleBack = bb;
      state.twistActive = true;
      // Push event WITH major: 'twist' so TvZone shows the TvAnnouncementOverlay.
      const ts = Date.now();
      const event = {
        id: `${state.phase}-w${state.week}-${ts}-bb`,
        text: `🔥 TWIST: The Jury Return / Battle Back is here! Jurors will compete for a chance to return! 🏆`,
        type: 'twist' as const,
        timestamp: ts,
        major: 'twist',
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },

    /**
     * Open the full-screen Battle Back competition overlay.
     * Called by GameScreen ~5 s after `activateBattleBack`, once the TV
     * filler announcement has had time to be seen.
     */
    openBattleBackCompetition(state) {
      if (state.battleBack && state.battleBack.active) {
        state.battleBack.competitionActive = true;
      }
    },

    /**
     * Complete the Battle Back twist — the winning juror returns to the house.
     * Changes their status from 'jury' to 'active', pushes a TV event,
     * marks the twist as used, and clears the active overlay flag.
     */
    completeBattleBack(state, action: PayloadAction<string>) {
      const winnerId = action.payload;
      const bb = state.battleBack;

      // Validate that the Battle Back is active and the winnerId is a valid jury candidate.
      if (!bb || !bb.active) {
        return;
      }

      const isCandidate = bb.candidates.includes(winnerId);
      const winner = state.players.find((p) => p.id === winnerId);

      // Require the winner to be a current juror in the candidates list.
      if (!isCandidate || !winner || winner.status !== 'jury') {
        return;
      }

      winner.status = 'active';
      if (!winner.stats) winner.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
      winner.stats.battleBackWins = (winner.stats.battleBackWins ?? 0) + 1;
      pushEvent(
        state,
        `🔥 ${winner.name} has survived the Battle Back and RETURNS to the Big Brother house! 🏠✨`,
        'twist',
      );

      bb.active = false;
      bb.used = true;
      bb.winnerId = winnerId;
      state.twistActive = false;
    },

    /**
     * Dismiss the Battle Back overlay without a winner (e.g., cancelled or
     * all candidates were eliminated with no result). Marks the twist as used
     * so it does not fire again this season.
     */
    dismissBattleBack(state) {
      if (state.battleBack) {
        state.battleBack.active = false;
        state.battleBack.used = true;
      }
      state.twistActive = false;
    },

    // ─── Public's Favorite Player twist actions ───────────────────────────────

    /**
     * Begin the Public's Favorite Player voting phase.
     * Shows full-screen voting overlay after the finale winner reveal.
     * Feature-gated via settings.sim.enableFavoritePlayer.
     */
    startFavoritePlayerPhase(
      state,
      action: PayloadAction<{ candidates: string[]; awardAmount: number }>,
    ) {
      state.favoritePlayer = {
        active: true,
        votingStarted: false,
        candidates: action.payload.candidates,
        eliminated: [],
        votes: {},
        winnerId: null,
        awardAmount: action.payload.awardAmount,
      };
      state.twistActive = true;
      // Push a TV event WITH major: 'twist' so the TV filler shows the announcement
      // while the voting overlay waits for openFavoritePlayerVoting.
      const ts = Date.now();
      const event = {
        id: `${state.phase}-w${state.week}-${ts}-fp`,
        text: `⭐ AMERICA DECIDES: Vote for your Public's Favorite Player! 🏆`,
        type: 'twist' as const,
        timestamp: ts,
        major: 'twist',
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
      // Append a start event to game history
      if (!state.history) state.history = [];
      state.history.push({
        type: 'favoritePlayer:start',
        week: state.week,
        data: { candidates: action.payload.candidates, awardAmount: action.payload.awardAmount },
        timestamp: Date.now(),
      });
    },

    /**
     * Open the full-screen Public's Favorite voting overlay.
     * Called by GameScreen ~5 s after `startFavoritePlayerPhase`, once the TV
     * filler announcement has had time to be seen.
     */
    openFavoritePlayerVoting(state) {
      if (state.favoritePlayer && state.favoritePlayer.active) {
        state.favoritePlayer.votingStarted = true;
      }
    },

    /**
     * Eliminate a candidate from the Public's Favorite voting.
     * Called each time the lowest-voted candidate is removed.
     */
    eliminateFavoriteCandidate(state, action: PayloadAction<string>) {
      const fp = state.favoritePlayer;
      if (!fp || !fp.active) return;
      const elimId = action.payload;
      if (!fp.eliminated.includes(elimId)) {
        fp.eliminated.push(elimId);
      }
    },

    /**
     * Resolve the Public's Favorite Player vote with a winner.
     * Closes the overlay and records the winner in state and history.
     */
    resolveFavoritePlayerWinner(state, action: PayloadAction<string>) {
      const fp = state.favoritePlayer;
      if (!fp || !fp.active) return;
      fp.winnerId = action.payload;
      fp.active = false;
      state.twistActive = false;
      // Append a winner event to game history (append-only — do not mutate existing entry)
      if (!state.history) state.history = [];
      state.history.push({
        type: 'favoritePlayer:winner',
        week: state.week,
        data: { winnerId: action.payload, awardAmount: fp.awardAmount },
        timestamp: Date.now(),
      });
    },

    /**
     * Award hook for the Public's Favorite Player prize.
     * Currently a no-op that records intent in history.
     * Future integrations can attach to this action to update player balances.
     */
    awardFavoritePrize(state) {
      const fp = state.favoritePlayer;
      if (!fp || !fp.winnerId) return;
      // Append an award event to game history (balance update is left to future integration)
      if (!state.history) state.history = [];
      state.history.push({
        type: 'favoritePlayer:award',
        week: state.week,
        data: { winnerId: fp.winnerId, awardAmount: fp.awardAmount },
        timestamp: Date.now(),
      });
    },

    // ─── Spectator overlay ────────────────────────────────────────────────────

    /**
     * Open the SpectatorView overlay.  Sets spectatorActive with metadata so
     * advance() blocks until closeSpectator is dispatched.
     * No-op if spectatorActive is already set (deduplication guard).
     */
    openSpectator(state, action: PayloadAction<SpectatorActiveState>) {
      if (state.spectatorActive) {
        // Already open — prevent duplicate overlays and race conditions.
        if (import.meta.env.DEV) {
          console.log('[gameSlice] openSpectator: no-op (already active)', state.spectatorActive);
        }
        return;
      }
      if (import.meta.env.DEV) {
        console.log('[gameSlice] openSpectator', action.payload);
      }
      state.spectatorActive = action.payload;
    },

    /**
     * Close the SpectatorView overlay.  Clears spectatorActive so advance()
     * can proceed again.
     */
    closeSpectator(state) {
      if (import.meta.env.DEV) {
        console.log('[gameSlice] closeSpectator');
      }
      state.spectatorActive = null;
    },

    /**
     * Set or clear the awaitingFinal3Plea flag.
     * When true, the Final-3 ceremony overlay is shown (coronation → pleas →
     * HOH decision → eviction).  advance() blocks while this is true.
     */
    setAwaitingFinal3Plea(state, action: PayloadAction<boolean>) {
      state.awaitingFinal3Plea = action.payload;
      if (import.meta.env.DEV) {
        console.log('[gameSlice] awaitingFinal3Plea set to', action.payload);
      }
    },

    /**
     * Finalize the Final-3 ceremony: evict the chosen player, crown the Final
     * HOH, clear awaitingFinal3Plea, and advance to week_end.
     * Called by Final3Ceremony when the ceremony completes.
     */
    finalizeFinal3Decision(
      state,
      action: PayloadAction<{ hohWinnerId: string; evicteeId: string }>,
    ) {
      const { hohWinnerId, evicteeId } = action.payload;

      // Validate evictee is a current nominee.
      if (!state.nomineeIds.includes(evicteeId)) return;

      const hoh = state.players.find((p) => p.id === hohWinnerId);
      const evictee = state.players.find((p) => p.id === evicteeId);
      if (!evictee) return;

      // Crown HOH (may already be set from advance(); idempotent).
      if (hoh && state.hohId !== hohWinnerId) {
        state.hohId = hohWinnerId;
        state.players.forEach((p) => {
          if (p.status === 'hoh') p.status = 'active';
        });
        hoh.status = 'hoh';
      }

      // Evict the chosen player.
      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);

      pushEvent(
        state,
        `${hoh?.name ?? hohWinnerId} has chosen to evict ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game',
      );
      pushEvent(state, `The Final 2 is set! The jury will now vote for the winner of Big Brother. 🏆`, 'game');

      state.awaitingFinal3Plea = false;
      state.phase = 'week_end';

      if (import.meta.env.DEV) {
        console.log('[gameSlice] finalizeFinal3Decision: evicted', evicteeId, 'hoh', hohWinnerId);
      }
    },

    // ─── Debug-only actions ───────────────────────────────────────────────────
    /** Force a specific player to be HOH (debug only). */
    forceHoH(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.players.forEach((p) => {
        if (p.status === 'hoh') p.status = 'active';
        if (p.status === 'hoh+pov') p.status = 'pov';
      });
      state.hohId = id;
      const player = state.players.find((p) => p.id === id);
      if (player) {
        player.status = player.status === 'pov' ? 'hoh+pov' : 'hoh';
        pushEvent(state, `[DEBUG] ${player.name} forced as Head of Household. 👑`, 'game');
      }
    },
    /** Force specific players as nominees (debug only). */
    forceNominees(state, action: PayloadAction<string[]>) {
      const ids = action.payload;
      state.players.forEach((p) => {
        if (p.status === 'nominated') p.status = 'active';
        if (p.status === 'nominated+pov') p.status = 'pov';
      });
      state.nomineeIds = ids;
      const names: string[] = [];
      ids.forEach((id) => {
        const p = state.players.find((pl) => pl.id === id);
        if (p) {
          p.status = p.status === 'pov' ? 'nominated+pov' : 'nominated';
          names.push(p.name);
        }
      });
      pushEvent(state, `[DEBUG] ${names.join(' and ')} forced as nominees. 🎯`, 'game');
    },
    /** Force a specific player as POV winner (debug only). */
    forcePovWinner(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.players.forEach((p) => {
        if (p.status === 'pov') p.status = 'active';
        if (p.status === 'hoh+pov') p.status = 'hoh';
        if (p.status === 'nominated+pov') p.status = 'nominated';
      });
      state.povWinnerId = id;
      const player = state.players.find((p) => p.id === id);
      if (player) {
        if (player.status === 'hoh') player.status = 'hoh+pov';
        else if (player.status === 'nominated') player.status = 'nominated+pov';
        else player.status = 'pov';
        pushEvent(state, `[DEBUG] ${player.name} forced as POV winner. 🎭`, 'game');
      }
    },
    /** Force entry into Final 4 eviction phase (debug only). */
    forcePhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload;
      pushEvent(state, `[DEBUG] Phase forced to ${action.payload}. 🔧`, 'game');
    },
    /**
     * Mark the winner and runner-up in player data after the finale.
     * Called by the FinalFaceoff component once the winner is declared.
     */
    finalizeGame(state, action: PayloadAction<{ winnerId: string; runnerUpId: string }>) {
      const { winnerId, runnerUpId } = action.payload;
      state.players.forEach((p) => {
        if (p.id === winnerId) {
          p.isWinner = true;
          p.finalRank = 1;
        } else if (p.id === runnerUpId) {
          p.finalRank = 2;
        }
      });
      pushEvent(
        state,
        `🏆 ${state.players.find((p) => p.id === winnerId)?.name ?? 'The winner'} has won Big Brother – AI Edition! Congratulations! 🎉`,
        'game',
      );
    },

    /** Clear any blocking human-decision flags (replacementNeeded, awaitingFinal3Eviction, etc.)
     * that could prevent the Continue button from appearing (debug only).
     */
    clearBlockingFlags(state) {
      state.replacementNeeded = false;
      state.awaitingNominations = false;
      state.pendingNominee1Id = null;
      state.awaitingPovDecision = false;
      state.awaitingPovSaveTarget = false;
      state.awaitingHumanVote = false;
      state.awaitingTieBreak = false;
      state.tiedNomineeIds = null;
      state.awaitingFinal3Eviction = false;
      state.awaitingFinal3Plea = false;
      state.votes = {};
      state.voteResults = null;
      state.evictionSplashId = null;
      state.pendingEviction = null;
      pushEvent(state, `[DEBUG] Blocking flags cleared — Continue button restored. 🔧`, 'game');
    },
    /**
     * Archive the completed season.  Prepends the archive entry and caps the
     * list at 50 entries to bound memory usage.
     */
    archiveSeason(state, action: PayloadAction<SeasonArchive>) {
      if (!state.seasonArchives) state.seasonArchives = [];
      state.seasonArchives.unshift(action.payload);
      if (state.seasonArchives.length > 50) {
        state.seasonArchives = state.seasonArchives.slice(0, 50);
      }
    },
    /**
     * Replace the entire player list.  Used by the start-new-season flow to
     * inject a normalized roster (no stale evicted/jury/grayscale flags).
     */
    replacePlayers(state, action: PayloadAction<Player[]>) {
      state.players = action.payload;
      state.competitionSeasonStateByPlayerId = buildInitialCompetitionSeasonState(action.payload);
    },
    /** Reset game state with a fresh random roster (debug only). */
    resetGame(state, action: PayloadAction<SeasonArchive[] | undefined>) {
      // Mix Math.random() with Date.now() to derive a fresh 32-bit game seed.
      // This seed drives in-game RNG (HOH/POV/vote outcomes); it is independent
      // of the Math.random() seed used in pickHouseguests() for roster selection.
      const seed = (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0;
      // When an explicit archives array is provided (e.g. on profile switch) use it;
      // otherwise preserve the current in-memory archives so a regular game restart
      // does not lose season history.
      const seasonArchives = action.payload !== undefined
        ? action.payload
        : (state.seasonArchives ?? []);
      // Build a fresh normalized player roster — no stale eviction/jury/grayscale flags.
      const freshPlayers: Player[] = buildInitialPlayers().map((p) => ({
        ...p,
        status: 'active' as const,
        finalRank: undefined,
        isWinner: undefined,
      }));
      return {
        season: 1,
        week: 1,
        phase: 'week_start' as Phase,
        seed,
        hohId: null,
        prevHohId: null,
        nomineeIds: [],
        povWinnerId: null,
        replacementNeeded: false,
        povSavedId: null,
        awaitingNominations: false,
        pendingNominee1Id: null,
        awaitingPovDecision: false,
        awaitingPovSaveTarget: false,
        votes: {},
        awaitingHumanVote: false,
        awaitingTieBreak: false,
        tiedNomineeIds: null,
        awaitingFinal3Eviction: false,
        awaitingFinal3Plea: false,
        f3Part1WinnerId: null,
        f3Part2WinnerId: null,
        voteResults: null,
        evictionSplashId: null,
        pendingEviction: null,
        players: freshPlayers,
        competitionSeasonStateByPlayerId: buildInitialCompetitionSeasonState(freshPlayers),
        tvFeed: [
          {
            id: 'e0',
            text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.',
            type: 'game' as const,
            timestamp: Date.now(),
          },
        ],
        isLive: false,
        seasonArchives,
        spectatorActive: null,
      };
    },
    /** Generate a new random RNG seed (debug only). */
    rerollSeed(state) {
      // Mix Math.random() with the low 32 bits of Date.now() via XOR to derive a 32-bit seed.
      state.seed = (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0;
      pushEvent(state, `[DEBUG] RNG seed rerolled to ${state.seed}. 🎲`, 'game');
    },

    /** Advance to the next phase, computing outcomes deterministically via RNG. */
    advance(state) {
      // Guard: if any human-decision flag is set, advance() must not proceed.
      // This protects against programmatic dispatches (debug tools, fastForward)
      // bypassing mandatory decision steps and leaving state inconsistent.
      if (
        state.replacementNeeded ||
        state.awaitingNominations ||
        state.awaitingPovDecision ||
        state.awaitingPovSaveTarget ||
        state.awaitingHumanVote ||
        state.awaitingTieBreak ||
        state.awaitingFinal3Eviction ||
        state.awaitingFinal3Plea ||
        state.pendingEviction != null ||
        state.battleBack?.active ||
        state.favoritePlayer?.active ||
        state.spectatorActive
      ) {
        return;
      }

      // Guard: if a minigame is active the human must complete (or skip) it first.
      // This prevents fastForwardToEviction / debug advance from racing past an
      // open TapRace overlay and leaving it stuck on screen.
      if (state.pendingMinigame) {
        state.pendingMinigame = null; // Auto-dismiss; winner falls back to random pick below.
      }

      // Guard: if a Final 3 minigame is in progress, advance() must not proceed.
      // The player must complete (or dismiss) the minigame; applyF3MinigameWinner
      // handles the phase transition after the minigame result is received.
      if (
        state.phase === 'final3_comp1_minigame' ||
        state.phase === 'final3_comp2_minigame' ||
        state.phase === 'final3_comp3_minigame'
      ) {
        return;
      }

      // ── Special-phase handling (Final4 / Final3 are outside PHASE_ORDER) ──
      if (state.phase === 'final4_eviction') {
        // Guard: Final 4 eviction requires a valid POV holder
        if (!state.povWinnerId) return;

        const povHolder = state.players.find((p) => p.id === state.povWinnerId);
        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));

        // Emit plea sequence: POV holder asks nominees for their pleas
        pushEvent(
          state,
          `${povHolder?.name ?? 'The POV holder'} asks nominees for their pleas. 🎤`,
          'game',
        );
        nominees.forEach((nominee, idx) => {
          const plea = pickPhrase(NOMINEE_PLEA_TEMPLATES, state.seed, idx);
          pushEvent(state, `${nominee.name}: "${plea}"`, 'game');
        });

        // Guard: if the POV holder is the human player, set awaitingPovDecision
        // so the UI shows the decision modal and advance() is blocked until the
        // player acts (the general guard at the top of advance() will catch it).
        if (povHolder?.isUser) {
          state.awaitingPovDecision = true;
          return;
        }

        // AI POV holder casts the sole vote deterministically
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        if (nominees.length > 0) {
          const evictee = seededPick(rng, nominees);
          // Defer the eviction commit — overlay (finalizePendingEviction) will
          // set evictee.status and transition to final3 after the cinematic plays.
          state.pendingEviction = {
            evicteeId: evictee.id,
            evictionMessage: `${povHolder?.name ?? 'The POV holder'} has chosen to evict ${evictee.name}. ${evictee.name} has been evicted from the Big Brother house. 🚪`,
          };
        }
        return;
      }

      if (state.phase === 'final3') {
        // Reset week-level fields and start Final 3 Part 1.
        // Clear prevHohId — Final 3 comps have no outgoing-HOH restriction.
        state.week += 1;
        state.hohId = null;
        state.prevHohId = null;
        state.nomineeIds = [];
        state.povWinnerId = null;
        state.replacementNeeded = false;
        state.povSavedId = null;
        state.awaitingNominations = false;
        state.pendingNominee1Id = null;
        state.awaitingPovDecision = false;
        state.awaitingPovSaveTarget = false;
        state.votes = {};
        state.awaitingHumanVote = false;
        state.awaitingTieBreak = false;
        state.tiedNomineeIds = null;
        state.awaitingFinal3Eviction = false;
        state.f3Part1WinnerId = null;
        state.f3Part2WinnerId = null;
        state.players.forEach((p) => {
          if (['hoh', 'nominated', 'pov', 'hoh+pov', 'nominated+pov'].includes(p.status)) {
            p.status = 'active';
          }
        });
        pushEvent(state, `Final 3 — Week ${state.week}! The three-part HOH competition begins. 🏆`, 'game');
        state.phase = 'final3_comp1';
        return;
      }

      if (state.phase === 'final3_comp1') {
        // Part 1: all 3 finalists compete; winner advances to Part 3; 2 losers go to Part 2
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        pushEvent(
          state,
          `Final 3 Part 1 is underway! All three houseguests compete for the first leg of the Final HOH. 🏁`,
          'game',
        );

        // If any participant is human, launch interactive minigame instead of deterministic pick.
        const hasHuman = alive.some((p) => p.isUser);
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp1',
            participants: alive.map((p) => p.id),
            seed: state.seed,
          };
          state.phase = 'final3_comp1_minigame';
          return;
        }

        const winner = seededPick(rng, alive);
        state.f3Part1WinnerId = winner.id;

        pushEvent(
          state,
          `Final 3 Part 1 result: ${winner.name} wins and advances directly to Part 3! The other two houseguests will compete in Part 2. 🏆`,
          'game',
        );
        state.phase = 'final3_comp2';
        return;
      }

      if (state.phase === 'final3_comp2') {
        // Part 2: the 2 Part-1 losers compete; winner advances to Part 3
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const losers = alive.filter((p) => p.id !== state.f3Part1WinnerId);
        if (losers.length === 0) {
          // Defensive: should not happen in normal play; log and skip to Part 3
          pushEvent(state, `[Warning] No Part-2 competitors found — advancing to Part 3 directly.`, 'game');
          state.phase = 'final3_comp3';
          return;
        }
        pushEvent(
          state,
          `Final 3 Part 2 is underway! The remaining two houseguests battle to join the Part 1 winner in Part 3. 🏁`,
          'game',
        );

        // If any Part-2 competitor is human, launch interactive minigame.
        const hasHuman = losers.some((p) => p.isUser);
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp2',
            participants: losers.map((p) => p.id),
            seed: state.seed,
          };
          state.phase = 'final3_comp2_minigame';
          return;
        }

        const winner = seededPick(rng, losers);
        state.f3Part2WinnerId = winner.id;

        pushEvent(
          state,
          `Final 3 Part 2 result: ${winner.name} wins and advances to face the Part 1 winner in Part 3! 🏆`,
          'game',
        );
        state.phase = 'final3_comp3';
        return;
      }

      if (state.phase === 'final3_comp3') {
        // Part 3: Part-1 winner vs Part-2 winner → Final HOH crowned
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        const finalists = state.players.filter(
          (p) => p.id === state.f3Part1WinnerId || p.id === state.f3Part2WinnerId,
        );
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        // Only Part 1 and Part 2 winners should compete in Part 3.
        // Fallback to all alive players guards against corrupted state while preserving progress.
        const pool = finalists.length >= 2 ? finalists : alive;
        if (finalists.length < 2) {
          pushEvent(state, `[Warning] Part 3 finalists missing — using all alive players as fallback.`, 'game');
        }

        const f3Part1Name = state.players.find((p) => p.id === state.f3Part1WinnerId)?.name;
        const f3Part2Name = state.players.find((p) => p.id === state.f3Part2WinnerId)?.name;
        if (f3Part1Name && f3Part2Name) {
          pushEvent(
            state,
            `Final 3 Part 3 is underway! ${f3Part1Name} (Part 1 winner) vs ${f3Part2Name} (Part 2 winner) — the winner becomes the Final Head of Household! 🏁`,
            'game',
          );
        }

        // If any Part-3 competitor is human, launch interactive minigame.
        const hasHuman = pool.some((p) => p.isUser);
        if (hasHuman) {
          state.minigameContext = {
            phaseKey: 'final3_comp3',
            participants: pool.map((p) => p.id),
            seed: state.seed,
          };
          state.phase = 'final3_comp3_minigame';
          return;
        }

        const finalHoh = seededPick(rng, pool);

        // Crown the Final HOH
        state.hohId = finalHoh.id;
        markFinalHohWinner(state, finalHoh.id);
        state.players.forEach((p) => {
          if (p.status === 'hoh') p.status = 'active';
        });
        const hohPlayer = state.players.find((p) => p.id === finalHoh.id);
        if (hohPlayer) hohPlayer.status = 'hoh';

        // The 2 non-Final-HOH players are now nominees (eligible to be evicted)
        const nominees = alive.filter((p) => p.id !== finalHoh.id);
        state.nomineeIds = nominees.map((p) => p.id);
        nominees.forEach((p) => {
          const np = state.players.find((x) => x.id === p.id);
          if (np && np.status !== 'nominated') np.status = 'nominated';
        });

        pushEvent(
          state,
          `Final 3 Part 3: ${finalHoh.name} wins and is crowned the Final Head of Household! 👑`,
          'game',
        );

        // Check if Final HOH is the human player
        if (hohPlayer?.isUser) {
          state.awaitingFinal3Eviction = true;
          const nomineeNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ');
          pushEvent(
            state,
            `${finalHoh.name}, you must now evict either ${nomineeNames} to set the Final 2. 🎯`,
            'game',
          );
        } else {
          // AI Final HOH: trigger the Final-3 ceremony overlay so the user sees
          // the coronation, plea, and eviction cinematic before the game ends.
          // finalizeFinal3Decision (dispatched by Final3Ceremony on completion)
          // performs the actual eviction and clears this flag.
          state.awaitingFinal3Plea = true;
          if (import.meta.env.DEV) {
            console.log('[gameSlice] advance() final3_comp3: AI HOH crowned, awaitingFinal3Plea set', { hohId: finalHoh.id });
          }
        }

        state.phase = 'final3_decision';
        return;
      }

      if (state.phase === 'final3_decision') {
        // AI Final HOH evicts (fallback if UI wasn't shown / human didn't act)
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
        const finalHoh = state.players.find((p) => p.id === state.hohId);
        if (nominees.length > 0) {
          const evictee = seededPick(rng, nominees);
          evictee.status = evictedStatus(state);
          state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          state.awaitingFinal3Eviction = false;
          pushEvent(
            state,
            `${finalHoh?.name ?? 'The Final HOH'} has chosen to evict ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game',
          );
          pushEvent(state, `The Final 2 is set! The jury will now vote for the winner of Big Brother. 🏆`, 'game');
        }
        state.phase = 'week_end';
        return;
      }

      // Guard: jury is a terminal phase — advance() is a no-op once reached.
      if (state.phase === 'jury') return;

      // Guard: at week_end with ≤2 players alive the Final 2 is set.
      // Transition directly to jury instead of cycling back to week_start.
      if (state.phase === 'week_end') {
        const aliveAtEnd = state.players.filter(
          (p) => p.status !== 'evicted' && p.status !== 'jury',
        );
        if (aliveAtEnd.length <= 2) {
          state.phase = 'jury';
          return;
        }
      }

      // Guard: handle intermediate AI replacement steps (after veto auto-save or human POV use).
      // Each call to advance() processes one step so the TV shows each message separately.
      // Each step advances the seed to maintain the deterministic RNG sequence.
      if (state.aiReplacementStep === 1) {
        // Step 1: show "HOH must name a replacement" message; AI will pick on next advance.
        // Advance seed to keep the RNG sequence consistent with normal advance() calls.
        const seedRng1 = mulberry32(state.seed);
        state.seed = (seedRng1() * 0x100000000) >>> 0;
        const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
        pushEvent(
          state,
          `${hohPlayer?.name ?? 'The HOH'} must now name a replacement nominee. 🎯`,
          'game',
        );
        state.aiReplacementStep = 2;
        return;
      }
      if (state.aiReplacementStep === 2) {
        // Guard: wait until the UI has acknowledged the step-1 announcement.
        if (state.aiReplacementWaiting) return;
        // Step 2: AI HOH picks the replacement nominee.
        // Advance seed first, then use the new seed for the pick.
        const seedRng2 = mulberry32(state.seed);
        state.seed = (seedRng2() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);
        const aliveNow = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
        const eligible = aliveNow.filter(
          (pl) =>
            pl.id !== state.hohId &&
            pl.id !== state.povWinnerId &&
            !state.nomineeIds.includes(pl.id) &&
            pl.id !== state.povSavedId,
        );
        if (eligible.length > 0) {
          const replacement = seededPick(rng, eligible);
          state.nomineeIds.push(replacement.id);
          const rp = state.players.find((pl) => pl.id === replacement.id);
          if (rp) rp.status = 'nominated';
          incrementTimesNominated(state, replacement.id);
          pushEvent(
            state,
            `${hohPlayer?.name ?? 'The HOH'} named ${replacement.name} as the replacement nominee. 🎯`,
            'game',
          );
        }
        // Keep povSavedId set so the UI can detect "veto was used" and show
        // the AI replacement animation. Cleared at week_start.
        state.aiReplacementStep = 0;
        return;
      }

      const currentIdx = PHASE_ORDER.indexOf(state.phase);
      const nextIdx = (currentIdx + 1) % PHASE_ORDER.length;
      let nextPhase: Phase = PHASE_ORDER[nextIdx];

      // Advance seed: consume one RNG value so each advance uses a different seed
      const seedRng = mulberry32(state.seed);
      state.seed = (seedRng() * 0x100000000) >>> 0;
      const rng = mulberry32(state.seed);

      const alive = state.players.filter(
        (p) => p.status !== 'evicted' && p.status !== 'jury',
      );

      switch (nextPhase) {
        case 'week_start': {
          // week_end → week_start: increment week and reset week-level fields.
          // Save the outgoing HOH so they can be excluded from this week's HOH comp.
          state.prevHohId = state.hohId ?? null;
          state.week += 1;
          state.hohId = null;
          state.nomineeIds = [];
          state.povWinnerId = null;
          state.replacementNeeded = false;
          state.povSavedId = null;
          state.awaitingNominations = false;
          state.pendingNominee1Id = null;
          state.awaitingPovDecision = false;
          state.awaitingPovSaveTarget = false;
          state.votes = {};
          state.awaitingHumanVote = false;
          state.awaitingTieBreak = false;
          state.tiedNomineeIds = null;
          state.aiReplacementStep = 0;
          state.aiReplacementWaiting = false;
          state.players.forEach((p) => {
            if (['hoh', 'nominated', 'pov', 'hoh+pov', 'nominated+pov'].includes(p.status)) {
              p.status = 'active';
            }
          });
          pushEvent(state, `Week ${state.week} begins! 🏠 It's time for the HOH competition.`, 'game');
          break;
        }
        case 'hoh_comp': {
          pushEvent(state, `The Head of Household competition has begun! 🏆 Who will win power this week?`, 'game');
          break;
        }
        case 'hoh_results': {
          // completeMinigame() applies the HOH winner inline and advances the phase
          // directly, so minigameResult is always null here.  Always pick randomly.
          // Exclude the outgoing HOH (prevHohId) to respect the ineligibility rule.
          const hohPool = state.prevHohId
            ? alive.filter((p) => p.id !== state.prevHohId)
            : alive;
          const hoh = seededPick(rng, hohPool.length > 0 ? hohPool : alive);
          applyHohWinner(state, hoh.id);
          break;
        }
        case 'social_1': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The new HOH';
          pushEvent(state, `Houseguests congratulate ${hohName}. Alliances are already forming… 💬`, 'social');
          break;
        }
        case 'nominations': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The HOH';
          pushEvent(state, `${hohName} is preparing the nomination ceremony. 🎯`, 'game');
          break;
        }
        case 'nomination_results': {
          // Guard: need at least 3 players to nominate 2 (HOH + 2 nominees).
          const pool = alive.filter((p) => p.id !== state.hohId);
          if (pool.length < 2) break;

          const hohPlayer = state.players.find((p) => p.id === state.hohId);
          if (hohPlayer?.isUser) {
            // Human HOH: block advance() and wait for the two-step nomination UI
            state.awaitingNominations = true;
            state.pendingNominee1Id = null;
            pushEvent(
              state,
              `${hohPlayer.name}, it's time to make your nominations. Choose two houseguests to put on the block. 🎯`,
              'game',
            );
            break;
          }

          // AI HOH: pick randomly
          const nominees = seededPickN(rng, pool, 2);
          state.nomineeIds = nominees.map((n) => n.id);
          nominees.forEach((n) => {
            const p = state.players.find((pl) => pl.id === n.id);
            if (p) p.status = 'nominated';
            incrementTimesNominated(state, n.id);
          });
          const names = nominees.map((n) => n.name).join(' and ');
          pushEvent(state, `${names} have been nominated for eviction. 🎯`, 'game');
          break;
        }
        case 'pov_comp': {
          pushEvent(state, `The Power of Veto competition is underway! 🎭`, 'game');
          break;
        }
        case 'pov_results': {
          // completeMinigame() applies the POV winner inline and advances the phase
          // directly, so minigameResult is always null here.  Always pick randomly.
          const povWinnerId = seededPick(rng, alive).id;
          nextPhase = applyPovWinner(state, povWinnerId, alive);
          break;
        }
        case 'pov_ceremony': {
          const povName = state.players.find((p) => p.id === state.povWinnerId)?.name ?? 'The veto holder';
          pushEvent(state, `${povName} is holding the Veto Ceremony. ⚡`, 'game');
          break;
        }
        case 'pov_ceremony_results': {
          const povWinner = state.povWinnerId
            ? state.players.find((p) => p.id === state.povWinnerId) ?? null
            : null;
          const isNominee = povWinner !== null && state.nomineeIds.includes(povWinner.id);

          if (isNominee && povWinner !== null) {
            // ── POV auto-use rule: nominee who wins POV MUST use it on themselves ──
            const savedName = povWinner.name;
            const autoSavedId = povWinner.id;
            state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
            // Update status: was 'nominated+pov', now just 'pov' (saved themselves)
            povWinner.status = 'pov';
            // Track the self-saved player so they cannot be re-nominated as the replacement
            state.povSavedId = autoSavedId;
            pushEvent(state, `${savedName} used the Veto and saved themselves! 🛡️`, 'game');

            // HOH must name a replacement
            const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
            if (hohPlayer?.isUser) {
              // Human HOH: set flag; UI will render replacement picker; Continue hidden
              state.replacementNeeded = true;
              pushEvent(
                state,
                `${hohPlayer.name} must now name a replacement nominee. 🎯`,
                'game',
              );
            } else {
              // AI HOH: deterministically pick replacement (exclude HOH, POV holder, current nominees, and the self-saved player)
              const eligible = alive.filter(
                (pl) =>
                  pl.id !== state.hohId &&
                  pl.id !== state.povWinnerId &&
                  !state.nomineeIds.includes(pl.id) &&
                  pl.id !== autoSavedId,
              );
              if (eligible.length > 0) {
                const replacement = seededPick(rng, eligible);
                state.nomineeIds.push(replacement.id);
                const rp = state.players.find((pl) => pl.id === replacement.id);
                if (rp) rp.status = 'nominated';
                // Keep povSavedId set so the UI can detect "veto was used" and show
                // the AI replacement animation. Cleared at week_start.
                pushEvent(
                  state,
                  `${hohPlayer?.name ?? 'The HOH'} named ${replacement.name} as the replacement nominee. 🎯`,
                  'game',
                );
              }
            }
          } else if (povWinner?.isUser) {
            // Human POV holder who is not a nominee: they must decide whether to use it
            state.awaitingPovDecision = true;
            pushEvent(
              state,
              `${povWinner.name}, will you use the Power of Veto? ⚡`,
              'game',
            );
          } else {
            // AI POV holder who is not a nominee: does not use the veto
            const povName = povWinner?.name ?? 'The veto holder';
            pushEvent(
              state,
              `${povName} has decided NOT to use the Power of Veto. The nominations remain the same. ⚡`,
              'game',
            );
          }
          break;
        }
        case 'social_2': {
          pushEvent(state, `Houseguests make their final pitches before the live vote. 🤝`, 'social');
          break;
        }
        case 'live_vote': {
          const nomNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ');
          pushEvent(state, `The live eviction vote has begun! ${nomNames} face eviction. 🗳️`, 'vote');

          // Cast AI eligible votes (eligible = alive, not HOH, not nominee)
          state.votes = {};
          const eligibleVoters = alive.filter(
            (p) => p.id !== state.hohId && !state.nomineeIds.includes(p.id),
          );
          for (const voter of eligibleVoters) {
            if (!voter.isUser) {
              state.votes[voter.id] = chooseAiEvictionVote(voter.id, state.nomineeIds, state.seed);
            }
          }

          // Block advance() if the human player is an eligible voter
          const humanVoter = eligibleVoters.find((p) => p.isUser);
          if (humanVoter) {
            state.awaitingHumanVote = true;
          }
          break;
        }
        case 'eviction_results': {
          // Guard: never evict when fewer than 2 players remain (should not happen in
          // normal flow, but prevents infinite loops if endgame guards are bypassed).
          if (alive.length < 2) break;
          // Guard: if we're already waiting for a human tie-break, do nothing.
          if (state.awaitingTieBreak) break;

          const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
          if (nominees.length === 0) break;

          // ── Tally votes ───────────────────────────────────────────────────
          const voteCounts: Record<string, number> = {};
          for (const nomineeId of state.nomineeIds) voteCounts[nomineeId] = 0;
          for (const nomineeId of Object.values(state.votes ?? {})) {
            if (nomineeId in voteCounts) voteCounts[nomineeId]++;
          }

          // Find the highest vote count
          let maxVotes = -1;
          for (const count of Object.values(voteCounts)) {
            if (count > maxVotes) maxVotes = count;
          }
          const topNominees = state.nomineeIds.filter((id) => (voteCounts[id] ?? 0) === maxVotes);

          if (topNominees.length === 1) {
            // Clear winner — defer the commit until the cinematic overlay completes
            const evicted = state.players.find((p) => p.id === topNominees[0]);
            if (evicted) {
              // Store vote results for popup reveal, then queue the pending eviction
              state.voteResults = { ...voteCounts };
              state.votes = {};
              state.pendingEviction = {
                evicteeId: evicted.id,
                evictionMessage: `${evicted.name}, you have been evicted from the Big Brother house. 🚪`,
              };
            }
          } else {
            // Tie — HOH breaks the tie
            const hohPlayer = state.players.find((p) => p.id === state.hohId);
            if (hohPlayer?.isUser) {
              // Human HOH: show vote results first, then the tie-break modal
              state.voteResults = { ...voteCounts };
              state.awaitingTieBreak = true;
              state.tiedNomineeIds = topNominees;
              const tiedNames = topNominees
                .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
                .join(' and ');
              pushEvent(
                state,
                `It's a tie between ${tiedNames}! ${hohPlayer.name}, as HOH you must break the tie. 🗳️`,
                'game',
              );
            } else {
              // AI HOH: deterministically pick among tied nominees — defer commit
              const aiRng = mulberry32((state.seed ^ 0xdeadbeef) >>> 0);
              const evicteeId = topNominees[Math.floor(aiRng() * topNominees.length)];
              const evicted = state.players.find((p) => p.id === evicteeId);
              if (evicted) {
                // Store vote results for popup reveal, then queue the pending eviction
                state.voteResults = { ...voteCounts };
                state.votes = {};
                state.pendingEviction = {
                  evicteeId: evicted.id,
                  evictionMessage: `${hohPlayer?.name ?? 'The HOH'} breaks the tie, voting to evict ${evicted.name}. ${evicted.name} has been evicted from the Big Brother house. 🗳️`,
                };
              }
            }
          }
          break;
        }
        case 'week_end': {
          pushEvent(state, `Week ${state.week} has come to an end. A new week begins soon… ✨`, 'game');
          break;
        }
      }

      state.phase = nextPhase;
    },
  },
});

export const {
  setPhase,
  advanceWeek,
  updatePlayer,
  addTvEvent,
  addSocialSummary,
  setLive,
  launchMinigame,
  completeMinigame,
  skipMinigame,
  applyMinigameWinner,
  applyCompetitionSeasonUpdate,
  applyF3MinigameWinner,
  updateGamePRs,
  advance,
  setReplacementNominee,
  selectNominee1,
  finalizeNominations,
  commitNominees,
  submitPovDecision,
  submitPovSaveTarget,
  submitHumanVote,
  submitTieBreak,
  dismissVoteResults,
  dismissEvictionSplash,
  finalizePendingEviction,
  selfEvict,
  aiReplacementRendered,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  finalizeGame,
  activateBattleBack,
  completeBattleBack,
  dismissBattleBack,
  openBattleBackCompetition,
  startFavoritePlayerPhase,
  openFavoritePlayerVoting,
  eliminateFavoriteCandidate,
  resolveFavoritePlayerWinner,
  awardFavoritePrize,
  openSpectator,
  closeSpectator,
  setAwaitingFinal3Plea,
  finalizeFinal3Decision,
  forceHoH,
  forceNominees,
  forcePovWinner,
  forcePhase,
  clearBlockingFlags,
  archiveSeason,
  replacePlayers,
  resetGame,
  rerollSeed,
} = gameSlice.actions;
export default gameSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────
const selectPlayers = (state: RootState) => state.game.players;

export const selectAlivePlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status !== 'evicted' && p.status !== 'jury'),
);

export const selectEvictedPlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status === 'evicted' || p.status === 'jury'),
);

/**
 * Deterministically predicts the Final 3 Part 3 winner without mutating state.
 *
 * Mirrors the RNG logic in the `final3_comp3` branch of `advance()` so
 * SpectatorView can receive an authoritative `initialWinnerId` before
 * `advance()` is dispatched (which happens only after playback completes).
 *
 * Returns null when the prediction is not applicable (wrong phase, missing
 * finalists, or a human finalist is present — the minigame path takes over).
 */
export const selectF3Part3PredictedWinnerId = (state: RootState): string | null => {
  const { phase, seed, f3Part1WinnerId, f3Part2WinnerId, players } = state.game;
  if (phase !== 'final3_comp3' || !f3Part1WinnerId || !f3Part2WinnerId) return null;
  const finalists = players.filter(
    (p) => p.id === f3Part1WinnerId || p.id === f3Part2WinnerId,
  );
  if (finalists.length < 2) return null;
  // Bail out for the human-participant path (minigame handles that case).
  if (finalists.some((p) => p.isUser)) return null;
  const seedRng = mulberry32(seed);
  const newSeed = (seedRng() * 0x100000000) >>> 0;
  const rng = mulberry32(newSeed);
  return seededPick(rng, finalists).id;
};

/**
 * Deterministically predicts the Final 3 Part 2 winner without mutating state.
 *
 * Mirrors the RNG logic in the `final3_comp2` branch of `advance()` so
 * SpectatorView can receive an authoritative `initialWinnerId` before
 * `advance()` is dispatched (which happens only after playback completes).
 *
 * Returns null when the prediction is not applicable (wrong phase, missing
 * Part-1 winner, no Part-2 competitors, or a human is competing in Part 2 —
 * the minigame path takes over in that case). Mirrors the `advance()` guard
 * exactly: only `losers.length === 0` is treated as non-applicable so that a
 * single-competitor edge case (corrupted state) still yields a deterministic
 * result consistent with what `advance()` would pick.
 */
export const selectF3Part2PredictedWinnerId = (state: RootState): string | null => {
  const { phase, seed, f3Part1WinnerId, players } = state.game;
  if (phase !== 'final3_comp2' || !f3Part1WinnerId) return null;
  const alive = players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
  const losers = alive.filter((p) => p.id !== f3Part1WinnerId);
  if (losers.length === 0) return null;
  // Bail out for the human-participant path (minigame handles that case).
  if (losers.some((p) => p.isUser)) return null;
  const seedRng = mulberry32(seed);
  const newSeed = (seedRng() * 0x100000000) >>> 0;
  const rng = mulberry32(newSeed);
  return seededPick(rng, losers).id;
};

// ─── Debug thunks ─────────────────────────────────────────────────────────────
/** Dispatch advance() repeatedly until the phase reaches 'eviction_results' (debug only). */
export const fastForwardToEviction =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    let steps = 0;
    while (
      getState().game.phase !== 'eviction_results' &&
      getState().game.phase !== 'jury' &&
      steps < PHASE_ORDER.length
    ) {
      dispatch(advance());
      steps++;
    }
  };

/**
 * Public minigame API — startMinigame thunk.
 *
 * For human participants: pre-computes AI scores and dispatches launchMinigame
 * so the GameScreen can render the TapRace overlay.
 * For AI-only participants: immediately dispatches a complete result (no UI).
 *
 * Returns the MinigameResult for AI-only runs; undefined when human UI is shown.
 */
export const startMinigame =
  (opts: { key: string; participants: string[]; seed: number; options: { timeLimit: number } }) =>
  (dispatch: AppDispatch, getState: () => RootState): MinigameResult | undefined => {
    const state = getState().game;
    // Pre-compute AI scores, respecting the configured timeLimit
    const aiScores: Record<string, number> = {};
    const model = getMinigameAiModel(opts.key);
    opts.participants.forEach((id, index) => {
      const p = state.players.find((pl) => pl.id === id);
      if (p && !p.isUser) {
        aiScores[id] = simulateAiPerformance({
          minigameKey: opts.key,
          minigameModel: model,
          seed: opts.seed,
          playerId: id,
          participantIndex: index,
          profile: p.competitionProfile ?? getDefaultCompetitionProfile(),
          seasonState: getCompetitionSeasonState(state.competitionSeasonStateByPlayerId, id),
          options: { timeLimitSeconds: opts.options.timeLimit },
        });
      }
    });

    const session = {
      key: opts.key,
      participants: opts.participants,
      seed: opts.seed,
      options: opts.options,
      aiScores,
    };

    const hasHuman = opts.participants.some((id) => {
      const p = state.players.find((pl) => pl.id === id);
      return !!p?.isUser;
    });

    if (!hasHuman) {
      // AI-only: determine winner immediately and return the result directly.
      // We do NOT dispatch completeMinigame here — that would write a stale
      // minigameResult that could later be consumed by an unrelated advance().
      const winnerId = determineWinner(opts.participants, aiScores);
      const result: MinigameResult = { seedUsed: opts.seed, scores: aiScores, winnerId };
      dispatch(applyCompetitionSeasonUpdate({ participants: opts.participants, scores: aiScores, winnerId }));
      return result;
    }

    // Human present: launch UI and return undefined (UI resolves via completeMinigame)
    dispatch(launchMinigame(session));
    return undefined;
  };

/**
 * Attempt to activate the Battle Back / Jury Return twist after an eviction.
 *
 * Eligibility:
 *  - `settings.sim.enableTwists` must be true
 *  - twist has not been used this season (`!game.battleBack?.used`)
 *  - at least 3 jurors currently in the game
 *  - at least 5 active players remaining after the eviction
 *  - current phase is `eviction_results`
 *
 * If eligible, rolls a probability check using `settings.sim.battleBackChance`
 * (percentage, 0–100; default 30) and a seeded RNG derived from the game seed.
 *
 * Returns `true` if the twist was activated (overlay will appear); `false` otherwise.
 */
export const tryActivateBattleBack =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState();

    if (!settings.sim.enableTwists) return false;
    if (game.battleBack?.used) return false;
    if (game.phase !== 'eviction_results') return false;

    const jurors = game.players.filter((p) => p.status === 'jury');
    const active = game.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );

    if (jurors.length < 3) return false;
    if (active.length < 5) return false;

    const chance = settings.sim.battleBackChance ?? 30;
    // Use a twist-specific RNG offset so this roll is independent of the main
    // game seed sequence and does not perturb future HOH/POV/vote outcomes.
    const rng = mulberry32((game.seed ^ 0xba77eba0) >>> 0);
    const roll = rng() * 100;

    if (roll >= chance) return false;

    const candidates = jurors.map((p) => p.id);
    dispatch(activateBattleBack({ candidates, week: game.week }));
    return true;
  };
