import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import type { GameState, Player, Phase, TvEvent, MinigameResult, MinigameSession } from '../types';
import { mulberry32, seededPick, seededPickN } from './rng';
import { simulateTapRaceAI, DEFAULT_TAPRACE_OPTIONS } from './minigame';

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

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_PLAYERS: Player[] = [
  { id: 'p1',  name: 'Alex',    avatar: '🧑',  status: 'active', isUser: true },
  { id: 'p2',  name: 'Blake',   avatar: '👱',  status: 'active' },
  { id: 'p3',  name: 'Casey',   avatar: '👩',  status: 'active' },
  { id: 'p4',  name: 'Dana',    avatar: '🧔',  status: 'active' },
  { id: 'p5',  name: 'Ellis',   avatar: '👧',  status: 'active' },
  { id: 'p6',  name: 'Frankie', avatar: '🧓',  status: 'active' },
  { id: 'p7',  name: 'Grace',   avatar: '👩‍🦱', status: 'active' },
  { id: 'p8',  name: 'Harper',  avatar: '🧑‍🦰', status: 'active' },
  { id: 'p9',  name: 'Indigo',  avatar: '🧑‍🦳', status: 'active' },
  { id: 'p10', name: 'Jordan',  avatar: '👦',  status: 'active' },
  { id: 'p11', name: 'Kai',     avatar: '🧑‍🦲', status: 'active' },
  { id: 'p12', name: 'Logan',   avatar: '👴',  status: 'active' },
];

const initialState: GameState = {
  season: 1,
  week: 1,
  phase: 'week_start',
  seed: 42,
  hohId: null,
  nomineeIds: [],
  povWinnerId: null,
  replacementNeeded: false,
  awaitingFinal3Eviction: false,
  f3Part1WinnerId: null,
  f3Part2WinnerId: null,
  players: SEED_PLAYERS,
  tvFeed: [
    { id: 'e0', text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.', type: 'game', timestamp: Date.now() },
  ],
  isLive: false,
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function pushEvent(state: GameState, text: string, type: TvEvent['type']) {
  const event: TvEvent = {
    id: `${state.phase}-w${state.week}-${Date.now()}`,
    text,
    type,
    timestamp: Date.now(),
  };
  state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
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
  }
  pushEvent(state, `${p?.name ?? winnerId} has won the Power of Veto! 🎭`, 'game');

  // ── Final 4 bypass (skip ceremony; POV holder has sole eviction vote) ──
  if (alive.length === 4 && !state.cfg?.multiEviction) {
    const f4Nominees = alive.filter(
      (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId,
    );
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
 * Build a pending-minigame session with pre-simulated AI scores.
 * Each AI player gets a deterministic score derived from a per-player seed.
 */
function buildMinigameSession(
  state: GameState,
  participants: Player[],
): MinigameSession {
  const aiScores: Record<string, number> = {};
  let aiSeed = state.seed;
  participants.forEach((p) => {
    if (!p.isUser) {
      aiScores[p.id] = simulateTapRaceAI(aiSeed);
      // Advance seed for each AI player so scores are independent
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
    }
  });
  return {
    key: 'TapRace',
    participants: participants.map((p) => p.id),
    seed: state.seed,
    options: { ...DEFAULT_TAPRACE_OPTIONS },
    aiScores,
  };
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
      let winnerId = session.participants[0];
      let highScore = -1;
      for (const id of session.participants) {
        const score = scores[id] ?? 0;
        if (score > highScore) {
          highScore = score;
          winnerId = id;
        }
      }

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

      state.minigameResult = {
        seedUsed: session.seed,
        scores,
        winnerId,
        personalRecords,
      };
      state.pendingMinigame = null;

      // ── Auto-advance phase based on context ──────────────────────────────
      const alive = state.players.filter(
        (p) => p.status !== 'evicted' && p.status !== 'jury',
      );
      if (state.phase === 'hoh_comp') {
        applyHohWinner(state, winnerId);
        state.minigameResult = null;
        state.phase = 'hoh_results';
      } else if (state.phase === 'pov_comp') {
        state.phase = applyPovWinner(state, winnerId, alive);
        state.minigameResult = null;
      }
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
     * Human HOH picks a replacement nominee after a POV auto-save.
     * Clears replacementNeeded so the Continue button reappears.
     * Validates that the selected player is eligible (not HOH, not POV holder,
     * and not already a nominee) to guard against invalid dispatches.
     */
    setReplacementNominee(state, action: PayloadAction<string>) {
      const id = action.payload;
      // Eligibility guard: reject HOH, POV holder, or already-nominated players
      if (
        id === state.hohId ||
        id === state.povWinnerId ||
        state.nomineeIds.includes(id)
      ) {
        return;
      }
      const player = state.players.find((p) => p.id === id);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!player || !hohPlayer) return;

      state.nomineeIds.push(id);
      player.status = 'nominated';
      state.replacementNeeded = false;
      pushEvent(
        state,
        `${hohPlayer.name} named ${player.name} as the replacement nominee. 🎯`,
        'game',
      );
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

      evictee.status = 'evicted';
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);
      pushEvent(
        state,
        `${povHolder.name} votes to evict ${evictee.name}. ${evictee.name} has been evicted from the Big Brother house. 🚪`,
        'game',
      );
      state.phase = 'final3';
      pushEvent(state, `Final 3! Three houseguests remain. 🏆`, 'game');
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

      evictee.status = 'evicted';
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
     * Clear any blocking human-decision flags (replacementNeeded, awaitingFinal3Eviction)
     * that could prevent the Continue button from appearing (debug only).
     */
    clearBlockingFlags(state) {
      state.replacementNeeded = false;
      state.awaitingFinal3Eviction = false;
      pushEvent(state, `[DEBUG] Blocking flags cleared — Continue button restored. 🔧`, 'game');
    },
    /** Reset game state to the initial seed (debug only). */
    resetGame() {
      return {
        ...initialState,
        tvFeed: [
          {
            id: 'e0',
            text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.',
            type: 'game' as const,
            timestamp: Date.now(),
          },
        ],
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
      // ── Special-phase handling (Final4 / Final3 are outside PHASE_ORDER) ──
      if (state.phase === 'final4_eviction') {
        // Guard: Final 4 eviction requires a valid POV holder
        if (!state.povWinnerId) return;

        // Guard: if the POV holder is the human player, the decision must come
        // through finalizeFinal4Eviction (via TvDecisionModal) — not advance().
        const povHolderPlayer = state.players.find((p) => p.id === state.povWinnerId);
        if (povHolderPlayer?.isUser) return;

        // AI POV holder casts the sole vote deterministically
        const seedRng = mulberry32(state.seed);
        state.seed = (seedRng() * 0x100000000) >>> 0;
        const rng = mulberry32(state.seed);

        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
        if (nominees.length > 0) {
          const evictee = seededPick(rng, nominees);
          const povHolder = state.players.find((p) => p.id === state.povWinnerId);
          evictee.status = 'evicted';
          state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          pushEvent(
            state,
            `${povHolder?.name ?? 'The POV holder'} votes to evict ${evictee.name}. ${evictee.name} has been evicted from the Big Brother house. 🚪`,
            'game',
          );
        }
        state.phase = 'final3';
        pushEvent(state, `Final 3! Three houseguests remain. 🏆`, 'game');
        return;
      }

      if (state.phase === 'final3') {
        // Reset week-level fields and start Final 3 Part 1
        state.week += 1;
        state.hohId = null;
        state.nomineeIds = [];
        state.povWinnerId = null;
        state.replacementNeeded = false;
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
        const winner = seededPick(rng, alive);
        state.f3Part1WinnerId = winner.id;

        pushEvent(
          state,
          `Final 3 Part 1: ${winner.name} wins and advances directly to Part 3! 🏆`,
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
        const winner = seededPick(rng, losers);
        state.f3Part2WinnerId = winner.id;

        pushEvent(
          state,
          `Final 3 Part 2: ${winner.name} wins and advances to face the Part 1 winner in Part 3! 🏆`,
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
        const finalHoh = seededPick(rng, pool);

        // Crown the Final HOH
        state.hohId = finalHoh.id;
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
          // AI Final HOH: deterministically pick evictee using an independent RNG tick.
          // We use seed + 1 to derive a second independent RNG call from this same advance()
          // step, since `rng` has already been consumed for the Part 3 competition winner.
          const aiRng = mulberry32(state.seed + 1);
          const evictee = seededPick(aiRng, nominees);
          const evicteePlayer = state.players.find((p) => p.id === evictee.id);
          if (evicteePlayer) {
            evicteePlayer.status = 'evicted';
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          }
          pushEvent(
            state,
            `${finalHoh.name} has chosen to evict ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game',
          );
          pushEvent(state, `The Final 2 is set! The jury will now vote for the winner of Big Brother. 🏆`, 'game');
          state.phase = 'week_end';
          return;
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
          evictee.status = 'evicted';
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
          // week_end → week_start: increment week and reset week-level fields
          state.week += 1;
          state.hohId = null;
          state.nomineeIds = [];
          state.povWinnerId = null;
          state.replacementNeeded = false;
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
          // If the human player is still in the game, launch TapRace.
          if (alive.some((p) => p.isUser)) {
            state.pendingMinigame = buildMinigameSession(state, alive);
          }
          break;
        }
        case 'hoh_results': {
          if (state.minigameResult?.winnerId) {
            // Result was set by the human finishing TapRace — apply it.
            applyHohWinner(state, state.minigameResult.winnerId);
            state.minigameResult = null;
          } else {
            // AI-only or debug-advance — pick randomly.
            const hoh = seededPick(rng, alive);
            applyHohWinner(state, hoh.id);
          }
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
          const pool = alive.filter((p) => p.id !== state.hohId);
          const nominees = seededPickN(rng, pool, 2);
          state.nomineeIds = nominees.map((n) => n.id);
          nominees.forEach((n) => {
            const p = state.players.find((pl) => pl.id === n.id);
            if (p) p.status = 'nominated';
          });
          const names = nominees.map((n) => n.name).join(' and ');
          pushEvent(state, `${names} have been nominated for eviction. 🎯`, 'game');
          break;
        }
        case 'pov_comp': {
          pushEvent(state, `The Power of Veto competition is underway! 🎭`, 'game');
          // If the human player is still in the game, launch TapRace.
          if (alive.some((p) => p.isUser)) {
            state.pendingMinigame = buildMinigameSession(state, alive);
          }
          break;
        }
        case 'pov_results': {
          let povWinnerId: string;
          if (state.minigameResult?.winnerId) {
            // Result was set by the human finishing TapRace — apply it.
            povWinnerId = state.minigameResult.winnerId;
            state.minigameResult = null;
          } else {
            // AI-only or debug-advance — pick randomly.
            povWinnerId = seededPick(rng, alive).id;
          }
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
            state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
            // Update status: was 'nominated+pov', now just 'pov' (saved themselves)
            povWinner.status = 'pov';
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
              // AI HOH: deterministically pick replacement (exclude HOH, POV holder, current nominees)
              const eligible = alive.filter(
                (pl) =>
                  pl.id !== state.hohId &&
                  pl.id !== state.povWinnerId &&
                  !state.nomineeIds.includes(pl.id),
              );
              if (eligible.length > 0) {
                const replacement = seededPick(rng, eligible);
                state.nomineeIds.push(replacement.id);
                const rp = state.players.find((pl) => pl.id === replacement.id);
                if (rp) rp.status = 'nominated';
                pushEvent(
                  state,
                  `${hohPlayer?.name ?? 'The HOH'} named ${replacement.name} as the replacement nominee. 🎯`,
                  'game',
                );
              }
            }
          } else {
            // Normal case: POV holder is not a nominee — does not use the veto
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
          break;
        }
        case 'eviction_results': {
          const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
          if (nominees.length > 0) {
            const evicted = seededPick(rng, nominees);
            evicted.status = 'evicted';
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evicted.id);
            pushEvent(state, `${evicted.name}, you have been evicted from the Big Brother house. 🚪`, 'game');
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
  setLive,
  launchMinigame,
  completeMinigame,
  skipMinigame,
  advance,
  setReplacementNominee,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  forceHoH,
  forceNominees,
  forcePovWinner,
  forcePhase,
  clearBlockingFlags,
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

// ─── Debug thunks ─────────────────────────────────────────────────────────────
/** Dispatch advance() repeatedly until the phase reaches 'eviction_results' (debug only). */
export const fastForwardToEviction =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    let steps = 0;
    while (getState().game.phase !== 'eviction_results' && steps < PHASE_ORDER.length) {
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
    // Pre-compute AI scores
    const aiScores: Record<string, number> = {};
    let aiSeed = opts.seed;
    opts.participants.forEach((id) => {
      const p = state.players.find((pl) => pl.id === id);
      if (p && !p.isUser) {
        aiScores[id] = simulateTapRaceAI(aiSeed);
        aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0;
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
      // AI-only: determine winner immediately and return
      let winnerId = opts.participants[0];
      let highScore = -1;
      for (const id of opts.participants) {
        if ((aiScores[id] ?? 0) > highScore) {
          highScore = aiScores[id] ?? 0;
          winnerId = id;
        }
      }
      const result: MinigameResult = { seedUsed: opts.seed, scores: aiScores, winnerId };
      dispatch(launchMinigame(session));
      dispatch(completeMinigame(0)); // 0 since no human score
      return result;
    }

    // Human present: launch UI and return undefined (UI resolves via completeMinigame)
    dispatch(launchMinigame(session));
    return undefined;
  };
