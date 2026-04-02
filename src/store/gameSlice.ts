import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import type {
  GameState,
  Player,
  Phase,
  TvEvent,
  MinigameResult,
  MinigameSession,
  CompleteMinigamePayload,
  BattleBackState,
  SpectatorActiveState,
  SeasonFinaleState,
  SpecialVetoType,
} from '../types';
import { mulberry32, seededPick, seededPickN } from './rng';
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getDefaultCompetitionSeasonState,
  getMinigameAiModel,
  simulateAiPerformance,
  simulateQuickTapAiScore,
  updateCompetitionSeasonStateByPlayerId,
  type CompetitionSeasonUpdateInput,
} from '../ai/competition';
import {
  isHybridScoredGame,
  resolveHybridAiScores,
} from '../ai/competition/hybridScoreResolver';
import { simulateSnakeAiScore } from '../ai/competition/snakeAiSimulator';
import HOUSEGUESTS from '../data/houseguests';
import { loadActiveProfile, archiveKeyForActiveProfile, loadProfilesState } from './profilesSlice';
import { loadSettings } from './settingsSlice';
import { getConfiguredCastSize, DEFAULT_ROSTER_SIZE } from './settingsHelpers';
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../utils/juryUtils';
import type { SeasonArchive } from './seasonArchive';
import { loadSeasonArchives } from './archivePersistence';
import { resolvePublicSaveNominee } from '../publicOpinion/PublicSaveService';
import {
  createSecretMissionState,
  buildMissionTasks,
  checkSecretMissionTrigger,
  createMissionReward,
  MISSION_TEMPLATES,
  canUseDoubleVote,
  canUseVoteDeduction,
  type MissionTask,
  type MissionRewardType,
} from '../bb/secretMission';

// ─── Canonical phase order ────────────────────────────────────────────────────
const PHASE_ORDER: Phase[] = [
  'week_start',
  'hoh_comp_announcement',
  'hoh_comp',
  'hoh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
  'pov_comp_announcement',
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

type SecretMissionTaskBuildResult = {
  templateId: string;
  tasks: MissionTask[];
};

function buildSecretMissionTasksForTemplate(
  templateId: string,
  triggeredDay: number,
): SecretMissionTaskBuildResult {
  const template = MISSION_TEMPLATES.find((t) => t.id === templateId)
    ?? MISSION_TEMPLATES[0];
  return {
    templateId: template.id,
    tasks: buildMissionTasks(template, triggeredDay),
  };
}

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

export const FINALE_INTERVIEW_VARIANT_COUNT = 3;

/**
 * Derive the next season number from an array of season archives.
 * Uses the maximum archived `seasonIndex` rather than array length so the
 * result remains correct after the 50-entry archive cap truncates history
 * or if entries are ever non-contiguous / out of order.
 *
 * Returns 1 when no archives exist yet.
 */
function nextSeasonNumber(archives: SeasonArchive[]): number {
  if (archives.length === 0) return 1;
  const maxIndex = archives.reduce((max, a) => Math.max(max, a.seasonIndex ?? 0), 0);
  return maxIndex + 1;
}

/**
 * Build a fresh initial game state from the current settings and profile.
 * Called both at store initialization and on every manual game reset, so that
 * each new season always uses the latest persisted configuration rather than
 * stale module-scope values.
 */
export function createInitialGameState(): GameState {
  const freshPlayers = buildInitialPlayers();
  const freshSettings = loadSettings();
  // Guest mode never persists archives — treat as an empty history so guest
  // sessions always start at Season 1 regardless of any logged-in user data.
  const isGuest = loadProfilesState().isGuest;
  const seasonArchives: SeasonArchive[] = isGuest
    ? []
    : loadSeasonArchives(archiveKeyForActiveProfile()) ?? [];
  const season = nextSeasonNumber(seasonArchives);
  return {
    season,
    week: 1,
    phase: 'week_start',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: freshSettings.sim.publicMode === true,
    povWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    lastHohCompFinisherId: null,
    lastHohCompFinisherType: null,
    publicSavedNomineeId: null,
    nominationContext: null,
    awaitingPublicSave: false,
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
    players: freshPlayers,
    competitionSeasonStateByPlayerId: buildInitialCompetitionSeasonState(freshPlayers),
    tvFeed: [
      { id: 'e0', text: `Welcome to The Big Eye house! 🏠 Season ${season} is about to begin.`, type: 'game', timestamp: Date.now() },
      { id: 'e1', text: `[Rules] Public mode: ${freshSettings.sim.publicMode === true ? 'ON' : 'OFF'}`, type: 'game', timestamp: Date.now() },
    ],
    isLive: false,
    seasonArchives,
    spectatorActive: null,
    seasonFinale: null,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
    specialVeto: {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
  };
}

const initialState: GameState = createInitialGameState();

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

function formatNameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return names.join(', ');
}

function pushPovCompetitionAnnouncement(state: GameState) {
  pushEvent(
    state,
    `It is time for the Power of Safety competition! 🎭 Housemates will battle for the most powerful item in the game.`,
    'game',
  );
}

type CommitPublicSavePayload =
  | string
  | {
      savedId: string;
      supportPercent?: number;
    };

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
 * Stamp the explicit season placement for a player at the moment they leave
 * the house. This gives finale recap / archive views a reliable ordering
 * source instead of inferring placement from the current array order.
 */
function assignSeasonPlacementOnExit(state: GameState, playerId: string) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || typeof player.seasonPlacement === 'number') return;

  // Count houseguests still in the game at the moment the player leaves.
  // Callers invoke this *before* mutating the player's status, so the exiting
  // player is included in the count: 6 alive → evicted player finishes 6th.
  const aliveCount = state.players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury',
  ).length;
  player.seasonPlacement = aliveCount;
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
  /**
   * Explicitly identify the last-place finisher for this HOH competition.
   * When provided (and valid), this takes precedence over score-based derivation
   * and the arbitrary nonWinners[0] fallback, ensuring the nomination auto-nominee
   * matches the result shown on the competition scoreboard.
   *
   * For last-player-standing comps, pass the first-eliminated player.
   * For scored comps, pass the lowest-scoring player.
   */
  lastPlaceId?: string | null;
  /**
   * Competition type for the HOH comp. Stored in state.lastHohCompFinisherType and
   * used to pick the compact disabled-option label in the nomination UI:
   *   'scored'   → "Lowest Score"
   *   'survival' → "First out"
   * When omitted, defaults to 'scored' when scores are provided; when no scores
   * are provided, the stored value will be null and the UI may apply its own default.
   */
  lastPlaceType?: 'scored' | 'survival';
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
function applyHohWinner(state: GameState, winnerId: string, source?: string) {
  if (import.meta.env.DEV) {
    console.log('[applyHohWinner]', {
      source: source ?? 'unknown',
      previousHohId: state.hohId,
      nextHohId: winnerId,
      currentPhase: state.phase,
    });
  }
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
  pushEvent(state, `${winner?.name ?? winnerId} has won Leader of the House! 👑`, 'game');
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
  pushEvent(state, `${p?.name ?? winnerId} has won the Power of Safety! 🎭`, 'game');

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
        `Final 4! ${f4Names} are on the block. The POS holder has the sole vote to eliminate. 🏆`,
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
        text: `📊 Social Summary (Day ${action.payload.week}): ${action.payload.summary}`,
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
     * Called by the QuickTapRace component when the timer expires and the player
     * presses the "Done" / "Continue ▶" button.
     *
     * Accepts either a legacy numeric payload (backward-compat) or a rich
     * `CompleteMinigamePayload` with `humanScore` and optional canonical
     * `winnerId` / `lastPlaceId` values. When supplied, those IDs are used
     * directly rather than re-deriving from scores, ensuring the results UI
     * and the applied state transition read from the same authoritative data.
     */
    completeMinigame(
      state,
      action: PayloadAction<number | CompleteMinigamePayload>,
    ) {
      const session = state.pendingMinigame;
      if (!session) return;

      // Normalise legacy number payload → rich payload
      const payload: CompleteMinigamePayload =
        typeof action.payload === 'number'
          ? { humanScore: action.payload }
          : action.payload;

      const humanPlayer = state.players.find((p) => p.isUser);

      if (import.meta.env.DEV) {
        console.log('[completeMinigame] received', {
          payload,
          sessionKey: session.key,
          sessionParticipants: session.participants,
          hybridResolveOnComplete: session.hybridResolveOnComplete,
          currentPhase: state.phase,
          precomputedAiScores: session.aiScores,
          humanPlayerId: humanPlayer?.id,
        });
      }

      let scores: Record<string, number>;

      if (session.hybridResolveOnComplete) {
        // ── Hybrid resolver path (score-based games) ─────────────────────────
        // AI scores are computed NOW, after the human score is known.
        let resolvedAiScores: Record<string, number>;

        if (session.key === 'snake') {
          // Snake uses the headless simulator so the authoritative Redux scores
          // match exactly what the SnakeGame UI displays.
          resolvedAiScores = {};
          for (const id of session.participants) {
            if (id === humanPlayer?.id) continue;
            const p = state.players.find((pl) => pl.id === id);
            resolvedAiScores[id] = simulateSnakeAiScore({
              sessionSeed: session.seed,
              playerId: id,
              profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
            });
          }
        } else {
          // Generic hybrid resolver for all other score-based games.
          // This prevents precomputed scores from collapsing near a very low human score.
          const aiParticipants = session.participants
            .filter((id) => id !== humanPlayer?.id)
            .map((id) => {
              const p = state.players.find((pl) => pl.id === id);
              return { id, profile: p?.competitionProfile };
            });

          resolvedAiScores = resolveHybridAiScores({
            gameKey: session.key,
            humanScore: payload.humanScore,
            aiParticipants,
            seed: session.seed,
          });
        }

        scores = { ...resolvedAiScores };
        if (humanPlayer && session.participants.includes(humanPlayer.id)) {
          scores[humanPlayer.id] = payload.humanScore;
        }
      } else {
        // ── Legacy / precomputed path (endurance, special games, test fixtures) ──
        scores = { ...session.aiScores };
        if (humanPlayer && session.participants.includes(humanPlayer.id)) {
          scores[humanPlayer.id] = payload.humanScore;
        }
      }

      // Prefer a canonical winner supplied by the UI component so the
      // displayed leaderboard and the applied state transition stay aligned.
      // When using the hybrid resolver the component also calls it with the
      // same inputs, so the winnerId it supplies will be consistent.
      const derivedWinnerId = determineWinner(session.participants, scores);
      const winnerId = payload.winnerId ?? derivedWinnerId;

      if (import.meta.env.DEV) {
        console.log('[completeMinigame] winner resolution', {
          sessionKey: session.key,
          resolvedScores: scores,
          payloadWinnerId: payload.winnerId,
          derivedWinnerId,
          chosenWinnerId: winnerId,
          usedExplicit: payload.winnerId != null,
          currentPhase: state.phase,
          payloadLastPlaceId: payload.lastPlaceId,
        });
      }

      // Update personal records for every participant
      const personalRecords: Record<string, number> = {};
      for (const id of session.participants) {
        const p = state.players.find((pl) => pl.id === id);
        if (!p) continue;
        const score = scores[id] ?? 0;
        if (!p.stats) p.stats = { hohWins: 0, povWins: 0, timesNominated: 0 };
        // tapRacePR is specific to the Quick Tap Race minigame — only update it
        // for that key so that TravelingDots (and other games sharing this reducer
        // path) don't corrupt Quick Tap personal-record data.
        if (session.key === 'quickTap') {
          if (p.stats.tapRacePR == null || score > p.stats.tapRacePR) {
            p.stats.tapRacePR = score;
            personalRecords[id] = score;
          }
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
        applyHohWinner(state, winnerId, '[completeMinigame]');
        state.phase = 'hoh_results';
        // Track the last-place HOH competition finisher for the third-nominee rule.
        // Priority:
        //   1. lastPlaceId explicitly supplied by the game component (authoritative)
        //   2. Score-based derivation (fallback)
        const nonWinners = session.participants.filter((id) => id !== winnerId);
        if (nonWinners.length > 0) {
          const explicitLastPlace =
            payload.lastPlaceId != null && nonWinners.includes(payload.lastPlaceId)
              ? payload.lastPlaceId
              : null;
          state.lastHohCompFinisherId = explicitLastPlace
            ?? nonWinners.reduce(
              (worst, id) => (scores[id] ?? 0) < (scores[worst] ?? 0) ? id : worst,
              nonWinners[0],
            );
        }
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
        lastPlaceId,
        lastPlaceType,
      } = action.payload;
      const alive = getAlivePlayers(state);
      const resolvedParticipants = participants ?? resolveCompetitionParticipants(state);
      const hasScores = scores !== undefined;
      const resolvedScores = scores ?? buildFallbackScores(resolvedParticipants, winnerId);
      // includePlacementBonuses takes precedence; scores imply we have ranking info.
      const usePlacementBonuses = includePlacementBonuses ?? hasScores;

      if (import.meta.env.DEV) {
        console.log('[applyMinigameWinner] entry', {
          incomingWinnerId: winnerId,
          incomingParticipants: participants,
          resolvedParticipants,
          incomingScores: scores,
          resolvedScores,
          lastPlaceId,
          lastPlaceType,
          currentPhase: state.phase,
          currentHohId: state.hohId,
        });
      }

      let winnerWasApplied = false;
      if (state.phase === 'hoh_comp') {
        // Idempotency: if hohId already set the winner was already applied.
        if (state.hohId) {
          if (import.meta.env.DEV) {
            console.log('[applyMinigameWinner] HOH already applied, skipping.', {
              existingHohId: state.hohId,
              incomingWinnerId: winnerId,
            });
          }
          return;
        }
        if (import.meta.env.DEV) {
          console.log('[applyMinigameWinner] applying HOH winner', {
            winnerId,
            currentPhase: state.phase,
          });
        }
        applyHohWinner(state, winnerId, '[applyMinigameWinner]');
        state.phase = 'hoh_results';
        winnerWasApplied = true;
        // Track the last-place HOH competition finisher for the third-nominee rule.
        // Priority order:
        //   1. lastPlaceId if explicitly provided by the caller (authoritative — from
        //      elimination order or actual scores in the feature slice).
        //   2. Score-based derivation when scores are available.
        //   3. nonWinners[0] fallback (arbitrary, kept for backward compat).
        const nonWinners = resolvedParticipants.filter((id) => id !== winnerId);
        if (nonWinners.length > 0) {
          const validLastPlace =
            lastPlaceId != null &&
            nonWinners.includes(lastPlaceId)
              ? lastPlaceId
              : null;
          state.lastHohCompFinisherId = validLastPlace
            ?? (hasScores
              ? nonWinners.reduce(
                  (worst, id) =>
                    (resolvedScores[id] ?? 0) < (resolvedScores[worst] ?? 0) ? id : worst,
                  nonWinners[0],
                )
              : nonWinners[0]);
          // Persist competition type for compact nomination-UI label selection.
          // Explicit lastPlaceType wins; otherwise derive from whether scores were provided.
          state.lastHohCompFinisherType = lastPlaceType ?? (hasScores ? 'scored' : null);
        }
      } else if (state.phase === 'pov_comp') {
        // Idempotency: if povWinnerId already set the winner was already applied.
        if (state.povWinnerId) {
          if (import.meta.env.DEV) {
            console.log('[applyMinigameWinner] POV already applied, skipping.', {
              existingPovWinnerId: state.povWinnerId,
              incomingWinnerId: winnerId,
            });
          }
          return;
        }
        if (import.meta.env.DEV) {
          console.log('[applyMinigameWinner] applying POV winner', { winnerId, currentPhase: state.phase });
        }
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
          `Final 3 Part 1 result: ${winner?.name ?? winnerId} wins and advances directly to Part 3! The other two housemates will compete in Part 2. 🏆`,
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
        if (import.meta.env.DEV) {
          console.log('[applyHohWinner]', {
            source: '[applyF3MinigameWinner/final3_comp3_minigame]',
            previousHohId: state.hohId,
            nextHohId: winnerId,
            currentPhase: state.phase,
          });
        }
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
          `Final 3 Part 3: ${winner?.name ?? winnerId} wins and is crowned the Final Leader of the House! 👑`,
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
            `${winner?.name ?? winnerId}, you must now eliminate either ${nomineeNames} to set the Final 2. 🎯`,
            'game',
          );
          state.phase = 'final3_decision';
        } else {
          // AI Final HOH: deterministically evict (same as advance() AI path).
          const aiRng = mulberry32(state.seed + 1);
          const evictee = seededPick(aiRng, nominees);
          const evicteePlayer = state.players.find((p) => p.id === evictee.id);
          if (evicteePlayer) {
            assignSeasonPlacementOnExit(state, evictee.id);
            evicteePlayer.status = evictedStatus(state);
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          }
          pushEvent(
            state,
            `${winner?.name ?? winnerId} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game',
          );
          pushEvent(state, `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`, 'game');
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
      // VIP: advance stage after first replacement (stage 1 → 2) or second replacement (stage 3 → -1)
      if (state.specialVeto?.activeType === 'vip') {
        if (state.specialVeto.vipUseStage === 1) {
          state.specialVeto.vipUseStage = 2;
        } else if (state.specialVeto.vipUseStage === 3) {
          state.specialVeto.vipUseStage = -1;
        }
      }
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
        `${p1.name} and ${p2.name} have been nominated for elimination by ${hohPlayer?.name ?? 'the LOH'}. 🎯`,
        'game',
      );
    },

    /**
     * Human HOH commits nominees in a single action (multi-select flow).
     * Accepts 2 nominees normally; accepts 3 nominees during a Double Eviction week.
     * Replaces the two-step `selectNominee1` / `finalizeNominations` pattern
     * when TvMultiSelectModal is used. Validates all IDs are eligible.
     */
    commitNominees(state, action: PayloadAction<string[]>) {
      if (!state.awaitingNominations || state.phase !== 'nomination_results') return;
      const isDoubleEviction = state.doubleEviction?.weekActive === true;
      const publicModeEnabled = state.publicModeEnabled === true;
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
      const canUsePublicNomineeRule = publicModeEnabled && !isDoubleEviction;

      // Defensive: in public mode non-DE weeks, strip the forced auto-nominee from the
      // submitted IDs before validating count. The UI disables that option, but if it
      // somehow appears in the payload it must not reduce the total to only 2 nominees.
      const ids = canUsePublicNomineeRule && state.lastHohCompFinisherId
        ? action.payload.filter((id) => id !== state.lastHohCompFinisherId)
        : action.payload;

      // Human always picks 2 in normal weeks (3rd is auto-appended); picks 3 in DE.
      const expectedCount = isDoubleEviction ? 3 : 2;
      if (ids.length !== expectedCount) return;
      if (new Set(ids).size !== ids.length) return; // duplicates check
      const eligible = alive.filter((p) => p.id !== state.hohId);
      if (!ids.every((id) => eligible.some((p) => p.id === id))) return;

      const nominees = ids.map((id) => state.players.find((p) => p.id === id)!).filter(Boolean);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (nominees.length !== expectedCount) return;

      state.nomineeIds = ids;
      nominees.forEach((n) => {
        n.status = 'nominated';
        incrementTimesNominated(state, n.id);
      });

      // In eligible weeks (including Final 4), auto-append the last-place HOH comp finisher.
      if (canUsePublicNomineeRule && state.lastHohCompFinisherId) {
        const autoId = state.lastHohCompFinisherId;
        let autoNomineeId: string | null = null;
        if (!state.nomineeIds.includes(autoId)) {
          const autoPlayer = eligible.find((p) => p.id === autoId);
          if (autoPlayer) {
            state.nomineeIds = [...state.nomineeIds, autoId];
            autoPlayer.status = 'nominated';
            incrementTimesNominated(state, autoId);
            autoNomineeId = autoId;
          }
        }
        state.nominationContext = {
          hohNomineeIds: ids,
          autoNomineeId,
          publicSaveApplied: false,
        };
      }

      state.awaitingNominations = false;
      state.pendingNominee1Id = null;
      const allNomineePlayers = state.nomineeIds
        .map((id) => state.players.find((p) => p.id === id))
        .filter(Boolean);
      const nameList = formatNameList(allNomineePlayers.map((n) => n!.name));
      const autoNomineePlayer = state.nominationContext?.autoNomineeId
        ? allNomineePlayers.find((player) => player?.id === state.nominationContext?.autoNomineeId)
        : null;
      const hohName = hohPlayer?.name ?? 'the LOH';
      const hohNomineeNames = formatNameList(nominees.map((n) => n.name));
      const autoNomineeReason = autoNomineePlayer
        ? `${autoNomineePlayer.name} was automatically nominated for finishing last in the LOH competition`
        : null;
      const autoNomineeClause = autoNomineePlayer
        ? `${hohName} nominated ${hohNomineeNames}, and ${autoNomineeReason}`
        : null;
      const eventText = autoNomineeClause
        ? `${nameList} have been nominated for elimination. ${autoNomineeClause}. 🎯`
        : `${nameList} have been nominated for elimination by ${hohName}. 🎯`;
      pushEvent(state, eventText, 'game');
    },

    /**
     * Resolve the pre-veto public save phase (normal weeks only).
     * The UI calls this with the ID of the nominee to save (highest approval).
     * Removes the saved player from nomineeIds, records publicSavedNomineeId,
     * clears awaitingPublicSave, and advances the phase to pov_comp_announcement.
     */
    commitPublicSave(state, action: PayloadAction<CommitPublicSavePayload>) {
      if (!state.awaitingPublicSave || state.phase !== 'pre_veto_public_save') return;
      if (state.nomineeIds.length !== 3) return;
      const savedId = typeof action.payload === 'string' ? action.payload : action.payload.savedId;
      const supportPercent =
        typeof action.payload === 'string' ? null : action.payload.supportPercent ?? null;
      if (!state.nomineeIds.includes(savedId)) return;

      const savedPlayer = state.players.find((p) => p.id === savedId);
      if (!savedPlayer) return;

      const remainingNomineeIds = state.nomineeIds.filter((id) => id !== savedId);
      if (remainingNomineeIds.length !== 2) return;
      const remainingNomineeNames = remainingNomineeIds
        .map((id) => state.players.find((p) => p.id === id)?.name)
        .filter((name): name is string => Boolean(name));

      // Remove from active nominee block
      state.nomineeIds = remainingNomineeIds;
      savedPlayer.status = 'active';

      // Record metadata
      state.publicSavedNomineeId = savedId;
      if (state.nominationContext) {
        state.nominationContext.publicSaveApplied = true;
      }

      state.awaitingPublicSave = false;
      // Advance directly to pov_comp_announcement so veto starts with 2 nominees
      state.phase = 'pov_comp_announcement';

      pushPovCompetitionAnnouncement(state);
      pushEvent(
        state,
        supportPercent !== null && remainingNomineeNames.length === 2
          ? `${savedPlayer.name} was saved with ${Math.round(supportPercent)}% of the public support. ${formatNameList(remainingNomineeNames)} will face the live eviction.`
          : remainingNomineeNames.length === 2
            ? `${savedPlayer.name} was saved by the public. ${formatNameList(remainingNomineeNames)} will face the live eviction.`
            : `${savedPlayer.name} was saved by the public.`,
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
        const svType = state.specialVeto?.activeType;
        if (svType === 'coup') {
          // Detox: remove both nominees, await holder replacement picks
          const oldNominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
          oldNominees.forEach((n) => { n.status = 'active'; });
          const removedNames = oldNominees.map((n) => n.name).join(' and ');
          state.nomineeIds = [];
          state.povSavedId = null;
          pushEvent(
            state,
            `${povWinner?.name ?? 'The Detox holder'} used Detox! ${removedNames} are cleared from the block! ⚡`,
            'game',
          );
          pushEvent(state, `${povWinner?.name ?? 'The Detox holder'}, name your two backup nominees. ⚡`, 'game');
          state.specialVeto!.awaitingCoupReplacement1 = true;
        } else {
          // Standard / VIP / Diamond / Spotlight: set awaitingPovSaveTarget
          state.awaitingPovSaveTarget = true;
        }
      } else {
        // not using veto
        if (state.specialVeto?.activeType === 'vip') {
          state.specialVeto.vipUseStage = -1;
        }
        pushEvent(
          state,
          `${povWinner?.name ?? 'The holder'} has decided NOT to use the power. The nominations remain the same. ⚡`,
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
        `${povWinner.name} used the power on ${savedPlayer.name}! 🛡️`,
        'game',
      );

      // Diamond: holder names replacement (not HOH)
      if (state.specialVeto?.activeType === 'diamond') {
        if (povWinner.isUser) {
          state.specialVeto.awaitingHolderReplacement = true;
            pushEvent(
              state,
              `${povWinner.name}, as the Halo Exchange holder, you must name the backup nominee. 😇`,
              'game',
            );
        } else {
          // AI holder names replacement
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
            pushEvent(
              state,
              `${povWinner.name} named ${replacement.name} as the Halo Exchange backup nominee. 😇`,
              'game',
            );
          }
        }
        return;
      }

      // HOH must name a replacement
      if (hohPlayer?.isUser) {
        state.replacementNeeded = true;
        // VIP: track first use stage
        if (state.specialVeto?.activeType === 'vip') {
          state.specialVeto.vipUseStage = 1;
        }
        pushEvent(
          state,
          `${hohPlayer.name} must now name a backup nominee. 🎯`,
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
            `${hohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
            'game',
          );
          // VIP: after AI HOH replacement is done inline, stage is immediately 2
          if (state.specialVeto?.activeType === 'vip') {
            state.specialVeto.vipUseStage = 2;
          }
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
        evictionMessage: `${hohPlayer?.name ?? 'The LOH'} breaks the tie, voting to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🗳️`,
      };
      // Push the week-end banner now: submitTieBreak jumps directly to week_end,
      // bypassing the advance() case 'week_end' branch that normally emits it.
      pushEvent(state, `Day ${state.week} has come to an end. A new day begins soon… ✨`, 'game');
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
     * Set or clear the player currently shown in a fullscreen eviction overlay.
     * Pass the player's id to mark overlay active; pass null to clear.
     * Used by SpotlightEvictionOverlay (on mount/unmount) and Final3Ceremony
     * (on eviction_splash enter/exit) so AvatarTile can hide itself (isEvicting)
     * during the match-cut, preventing the duplicated fullscreen avatar start.
     */
    setEvictionOverlay(state, action: PayloadAction<string | null>) {
      state.evictionOverlayPlayerId = action.payload;
    },

    /**
     * Clear the eviction overlay flag only if it still refers to the given player.
     * Safe to call from unmount cleanup: if a new overlay has already mounted for
     * a different player, this action is a no-op and does not disturb that overlay.
     */
    clearEvictionOverlay(state, action: PayloadAction<string>) {
      if (state.evictionOverlayPlayerId === action.payload) {
        state.evictionOverlayPlayerId = null;
      }
    },

    /**
     * Commit the deferred eviction after the cinematic overlay completes.
     *
     * Sets the evictee's status to 'evicted' or 'jury', removes them from
     * nomineeIds, pushes the eviction event, and clears pendingEviction.
     * For Final-4 evictions (phase === 'final4_eviction') also transitions
     * the phase to 'final3' and pushes the "Final 3!" event.
     * For Double Eviction weeks, promotes the pending second eviction to
     * `pendingEviction` after the first resolves; clears `doubleEviction.weekActive`
     * once both evictions have been committed.
     */
    finalizePendingEviction(state, action: PayloadAction<string>) {
      const evicteeId = action.payload;
      if (!state.pendingEviction || state.pendingEviction.evicteeId !== evicteeId) return;

      const evictee = state.players.find((p) => p.id === evicteeId);
      if (!evictee) return;

      const msg = state.pendingEviction.evictionMessage;
      const isFinal4 = state.phase === 'final4_eviction';

      assignSeasonPlacementOnExit(state, evicteeId);
      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);
      state.pendingEviction = null;

      pushEvent(state, msg, 'game');

      if (isFinal4) {
        state.phase = 'final3';
        pushEvent(state, `Final 3! Three housemates remain. 🏆`, 'game');
      } else if (state.doubleEviction?.pendingSecondEviction) {
        // Double Eviction: promote the second eviction to the main pending slot.
        state.pendingEviction = state.doubleEviction.pendingSecondEviction;
        state.doubleEviction.pendingSecondEviction = null;
      } else if (state.doubleEviction?.weekActive) {
        // Both double eviction evictions are done — reset the weekly flag.
        state.doubleEviction.weekActive = false;
        state.twistActive = false;
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
      assignSeasonPlacementOnExit(state, playerId);
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
        `${player.name} has chosen to self-evict from The Big Eye house. 🚪`,
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
        evictionMessage: `${povHolder.name} has chosen to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🚪`,
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

      assignSeasonPlacementOnExit(state, evicteeId);
      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);
      state.awaitingFinal3Eviction = false;
      pushEvent(
        state,
        `${finalHoh.name} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game',
      );
      state.phase = 'week_end';
      pushEvent(state, `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`, 'game');
    },

    // ─── Battle Back / Jury Return twist actions ──────────────────────────────

    /**
     * Activate the Battle Back twist after an eligible eviction.
     * Sets `battleBack.active = true` (blocks advance()) and pushes a TV event
     * with `major: 'battle_back'` so the TV filler shows an announcement.
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
      // Push event WITH major: 'battle_back' so TvZone shows the TvAnnouncementOverlay.
      const ts = Date.now();
      const event = {
        id: `${state.phase}-w${state.week}-${ts}-bb`,
        text: `🔥 SHOCK: The Tribunal Return / Battle Back is here! Judges will compete for a chance to return! 🏆`,
        type: 'twist' as const,
        timestamp: ts,
        major: 'battle_back',
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
        `🔥 ${winner.name} has survived the Battle Back and RETURNS to The Big Eye house! 🏠✨`,
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

    // ─── Double Eviction twist actions ───────────────────────────────────────

    /**
     * Activate the Double Eviction twist for the current week.
     * Sets `doubleEviction.weekActive = true`, increments `usedCount`, sets
     * `twistActive`, and pushes a TV event with `major: 'double_eviction'` so
     * TvZone shows the announcement overlay.
     * Called by the `tryActivateDoubleEviction` thunk when the probability roll passes.
     */
    activateDoubleEviction(state) {
      if (!state.doubleEviction) {
        state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null };
      }
      state.doubleEviction.weekActive = true;
      state.doubleEviction.usedCount += 1;
      state.doubleEviction.pendingSecondEviction = null;
      state.twistActive = true;
      state.twistActivatedThisWeek = true;
      // Push event WITH major: 'double_eviction' so TvZone shows the overlay.
      const ts = Date.now();
      const event: TvEvent = {
        id: `nominations-w${state.week}-${ts}-de`,
        text: `⚡ DOUBLE ELIMINATION! Tonight the LOH must nominate THREE housemates. TWO will be eliminated live! ⚡`,
        type: 'twist',
        timestamp: ts,
        major: 'double_eviction',
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },

    /**
     * Activate a special veto twist for the current week.
     * Called by the `tryActivateSpecialVeto` thunk when the probability roll passes.
     */
    activateSpecialVeto(state, action: PayloadAction<{ type: SpecialVetoType; week: number }>) {
      const { type, week } = action.payload;
      if (!state.specialVeto) {
        state.specialVeto = {
          seasonUsed: false,
          activeType: null,
          activatedWeek: null,
          vipUseStage: 0,
          awaitingHolderReplacement: false,
          awaitingCoupReplacement1: false,
          awaitingCoupReplacement2: false,
          coupReplacement1Id: null,
          awaitingVipSecondUseDecision: false,
          awaitingVipSecondSaveTarget: false,
        };
      }
      state.specialVeto.seasonUsed = true;
      state.specialVeto.activeType = type;
      state.specialVeto.activatedWeek = week;
      state.specialVeto.vipUseStage = 0;
      state.twistActive = true;
      state.twistActivatedThisWeek = true;

      const typeLabels: Record<SpecialVetoType, string> = {
        vip: 'DOUBLE TROUBLE! This week, the holder may use the power TWICE! 👑',
        diamond: 'HALO EXCHANGE! This week, the holder may name the replacement nominee. 😇',
        coup: 'DETOX! This week, the holder may clear both nominees and name two replacements! ⚡',
        spotlight: 'FORCE MAJEURE! This week, the holder is forced to use the power. ✨',
      };
      const majorKeys: Record<SpecialVetoType, string> = {
        vip: 'vip_veto',
        diamond: 'diamond_pov',
        coup: 'coup_detat',
        spotlight: 'spotlight_veto',
      };
      const ts = Date.now();
      const event: TvEvent = {
        id: `special-veto-${type}-w${week}-${ts}`,
        text: typeLabels[type],
        type: 'twist',
        major: majorKeys[type],
        meta: { major: majorKeys[type], week },
        timestamp: ts,
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },

    /**
     * Human Halo Exchange holder picks the replacement nominee.
     */
    submitDiamondReplacement(state, action: PayloadAction<string>) {
      if (!state.specialVeto?.awaitingHolderReplacement) return;
      if (state.specialVeto.activeType !== 'diamond') return;
      const id = action.payload;
      if (
        id === state.hohId ||
        id === state.povWinnerId ||
        state.nomineeIds.includes(id) ||
        id === state.povSavedId
      ) return;
      const player = state.players.find((p) => p.id === id);
      const povHolder = state.players.find((p) => p.id === state.povWinnerId);
      if (!player) return;
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
      if (!alive.some((p) => p.id === id)) return;

      state.nomineeIds.push(id);
      player.status = 'nominated';
      incrementTimesNominated(state, id);
      state.specialVeto.awaitingHolderReplacement = false;
      pushEvent(
        state,
        `${povHolder?.name ?? 'The Halo Exchange holder'} named ${player.name} as the replacement nominee. 😇`,
        'game',
      );
    },

    /**
     * Human Detox holder picks replacement nominees (called twice: first and second pick).
     */
    submitCoupReplacement(state, action: PayloadAction<string>) {
      if (!state.specialVeto?.awaitingCoupReplacement1 && !state.specialVeto?.awaitingCoupReplacement2) return;
      if (state.specialVeto.activeType !== 'coup') return;
      const id = action.payload;
      const povHolder = state.players.find((p) => p.id === state.povWinnerId);
      const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');

      if (state.specialVeto.awaitingCoupReplacement1) {
        if (id === state.hohId || id === state.povWinnerId || state.nomineeIds.includes(id)) return;
        if (!alive.some((p) => p.id === id)) return;
        state.specialVeto.coupReplacement1Id = id;
        state.specialVeto.awaitingCoupReplacement1 = false;
        state.specialVeto.awaitingCoupReplacement2 = true;
        const player = state.players.find((p) => p.id === id);
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Detox holder'} selects ${player?.name ?? id} as the first replacement. Choose a second. ⚡`,
          'game',
        );
      } else if (state.specialVeto.awaitingCoupReplacement2) {
        const rep1Id = state.specialVeto.coupReplacement1Id;
        if (id === state.hohId || id === state.povWinnerId || id === rep1Id || state.nomineeIds.includes(id)) return;
        if (!alive.some((p) => p.id === id)) return;

        const rep1 = state.players.find((p) => p.id === rep1Id);
        const rep2 = state.players.find((p) => p.id === id);
        if (!rep1 || !rep2) return;

        [rep1, rep2].forEach((r) => {
          state.nomineeIds.push(r.id);
          r.status = 'nominated';
          incrementTimesNominated(state, r.id);
        });
        state.specialVeto.awaitingCoupReplacement2 = false;
        state.specialVeto.coupReplacement1Id = null;
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Detox holder'} named ${rep1.name} and ${rep2.name} as the new nominees. ⚡`,
          'game',
        );
      }
    },

    /**
     * Human Double Trouble holder decides whether to use the power a second time.
     */
    submitVipSecondUseDecision(state, action: PayloadAction<boolean>) {
      if (!state.specialVeto?.awaitingVipSecondUseDecision) return;
      state.specialVeto.awaitingVipSecondUseDecision = false;
      const povHolder = state.players.find((p) => p.id === state.povWinnerId);
      if (action.payload) {
        state.specialVeto.awaitingVipSecondSaveTarget = true;
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Double Trouble holder'} will use Double Trouble a second time! Choose a nominee to save. 👑`,
          'game',
        );
      } else {
        state.specialVeto.vipUseStage = -1;
        pushEvent(
          state,
          `${povHolder?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble a second time. 👑`,
          'game',
        );
      }
    },

    /**
     * Human Double Trouble holder picks which nominee to save on the second use.
     */
    submitVipSecondSaveTarget(state, action: PayloadAction<string>) {
      if (!state.specialVeto?.awaitingVipSecondSaveTarget) return;
      if (state.specialVeto.activeType !== 'vip') return;
      const saveId = action.payload;
      if (!state.nomineeIds.includes(saveId)) return;

      const savedPlayer = state.players.find((p) => p.id === saveId);
      const povHolder = state.players.find((p) => p.id === state.povWinnerId);
      const hohPlayer = state.players.find((p) => p.id === state.hohId);
      if (!savedPlayer || !povHolder) return;

      state.nomineeIds = state.nomineeIds.filter((id) => id !== saveId);
      savedPlayer.status = 'active';
      state.specialVeto.awaitingVipSecondSaveTarget = false;
      state.specialVeto.vipUseStage = 3;
      state.povSavedId = saveId;
      pushEvent(
        state,
        `${povHolder.name} used Double Trouble a second time, saving ${savedPlayer.name}! 👑`,
        'game',
      );
      if (hohPlayer?.isUser) {
        state.replacementNeeded = true;
        pushEvent(state, `${hohPlayer.name} must now name another backup nominee. 🎯`, 'game');
      } else {
        const aliveNow = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const eligible = aliveNow.filter(
          (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId &&
            !state.nomineeIds.includes(pl.id) && pl.id !== saveId,
        );
        if (eligible.length > 0) {
          const rng = mulberry32(state.seed);
          const replacement = seededPick(rng, eligible);
          state.nomineeIds.push(replacement.id);
          const rp = state.players.find((pl) => pl.id === replacement.id);
          if (rp) rp.status = 'nominated';
          incrementTimesNominated(state, replacement.id);
          pushEvent(state, `${hohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`, 'game');
          state.specialVeto.vipUseStage = -1;
        } else {
          state.specialVeto.vipUseStage = -1;
        }
      }
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
        text: `⭐ THE PUBLIC DECIDES: Vote for your Public's Favorite Player! 🏆`,
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
        if (import.meta.env.DEV) {
          console.log('[applyHohWinner]', {
            source: '[finalizeFinal3Decision]',
            previousHohId: state.hohId,
            nextHohId: hohWinnerId,
            currentPhase: state.phase,
          });
        }
        state.hohId = hohWinnerId;
        state.players.forEach((p) => {
          if (p.status === 'hoh') p.status = 'active';
        });
        hoh.status = 'hoh';
      }

      // Evict the chosen player.
      assignSeasonPlacementOnExit(state, evicteeId);
      evictee.status = evictedStatus(state);
      state.nomineeIds = state.nomineeIds.filter((id) => id !== evicteeId);

      pushEvent(
        state,
        `${hoh?.name ?? hohWinnerId} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
        'game',
      );
      pushEvent(state, `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`, 'game');

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
        pushEvent(state, `[DEBUG] ${player.name} forced as Leader of the House. 👑`, 'game');
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
        pushEvent(state, `[DEBUG] ${player.name} forced as POS winner. 🎭`, 'game');
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
        `🏆 ${state.players.find((p) => p.id === winnerId)?.name ?? 'The winner'} has won The Big Eye – AI Edition! Congratulations! 🎉`,
        'game',
      );
    },
    startWinnerCinematic(
      state,
      action: PayloadAction<{
        winnerId: string;
        seed: number;
        publicFavoriteEnabled: boolean;
      }>,
    ) {
      const { winnerId, seed, publicFavoriteEnabled } = action.payload;
      const interviewIndex = seed % FINALE_INTERVIEW_VARIANT_COUNT;
      const nextFinaleState: SeasonFinaleState = {
        phase: 'winnerCinematic',
        winnerId,
        interviewIndex,
        goodbyeIndex: 0,
        isChatOpen: false,
        isLightsOffAnimating: false,
        publicFavoriteEnabled,
      };
      state.seasonFinale = nextFinaleState;
    },
    startWinnerInterview(state) {
      if (state.seasonFinale?.phase !== 'winnerCinematic') return;
      state.seasonFinale.phase = 'winnerInterview';
      state.seasonFinale.isChatOpen = true;
    },
    advanceInterview(state) {
      if (state.seasonFinale?.phase !== 'winnerInterview') return;
      if (state.seasonFinale.publicFavoriteEnabled) {
        state.seasonFinale.phase = 'publicFavoriteSetup';
        state.seasonFinale.isChatOpen = true;
        return;
      }
      state.seasonFinale.phase = 'goodbyeSequence';
      state.seasonFinale.goodbyeIndex = 0;
      state.seasonFinale.isChatOpen = true;
    },
    startPublicFavorite(state) {
      if (state.seasonFinale?.phase !== 'publicFavoriteSetup') return;
      state.seasonFinale.phase = 'publicFavoriteFlow';
      state.seasonFinale.isChatOpen = false;
    },
    resumeAfterPublicFavorite(state, action: PayloadAction<{ winnerId?: string }>) {
      if (state.seasonFinale?.phase !== 'publicFavoriteFlow') return;
      state.seasonFinale.phase = 'goodbyeSequence';
      state.seasonFinale.publicFavoriteWinnerId = action.payload.winnerId;
      state.seasonFinale.goodbyeIndex = 0;
      state.seasonFinale.isChatOpen = true;
    },
    startGoodbyeSequence(state) {
      if (
        state.seasonFinale?.phase !== 'winnerInterview' &&
        state.seasonFinale?.phase !== 'publicFavoriteFlow' &&
        state.seasonFinale?.phase !== 'publicFavoriteSetup'
      ) {
        return;
      }
      state.seasonFinale.phase = 'goodbyeSequence';
      state.seasonFinale.goodbyeIndex = 0;
      state.seasonFinale.isChatOpen = true;
    },
    advanceGoodbyeSequence(state, action: PayloadAction<number>) {
      if (state.seasonFinale?.phase !== 'goodbyeSequence') return;
      state.seasonFinale.goodbyeIndex = Math.max(state.seasonFinale.goodbyeIndex, action.payload);
    },
    startLightsOff(state) {
      if (state.seasonFinale?.phase !== 'goodbyeSequence') return;
      state.seasonFinale.phase = 'lightsOffTransition';
      state.seasonFinale.isChatOpen = false;
      state.seasonFinale.isLightsOffAnimating = true;
    },
    completeFinale(state) {
      if (state.seasonFinale?.phase !== 'lightsOffTransition') return;
      state.seasonFinale.phase = 'seasonComplete';
      state.seasonFinale.isLightsOffAnimating = false;
      state.seasonFinale.isChatOpen = false;
    },

    /** Clear any blocking human-decision flags (replacementNeeded, awaitingFinal3Eviction, etc.)
     * that could prevent the Continue button from appearing (debug only).
     */
    clearBlockingFlags(state) {
      state.replacementNeeded = false;
      state.awaitingNominations = false;
      state.pendingNominee1Id = null;
      state.awaitingPublicSave = false;
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
    /** Reset game state with a fresh random roster. */
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
      // Derive the next season number from the maximum archived seasonIndex so the
      // result is stable even after the 50-entry archive cap or non-contiguous entries.
      const season = nextSeasonNumber(seasonArchives);
      // Use the factory to build a fully fresh initial state from the latest
      // persisted settings/profile, then override seed, seasonArchives, and season.
      const fresh = { ...createInitialGameState(), seed, seasonArchives, season };
      // Update the welcome message to reflect the actual season number.
      // publicModeEnabled is already derived from settings inside createInitialGameState().
      fresh.tvFeed = [
        {
          id: 'e0',
          text: `Welcome to The Big Eye house! 🏠 Season ${season} is about to begin.`,
          type: 'game' as const,
          timestamp: Date.now(),
        },
        {
          id: 'e1',
          text: `[Rules] Public mode: ${fresh.publicModeEnabled === true ? 'ON' : 'OFF'}`,
          type: 'game' as const,
          timestamp: Date.now(),
        },
      ];
      return fresh;
    },
    /**
     * Restore a previously saved in-progress game state (manual save/resume).
     * Replaces the entire game slice with the snapshot.
     * seasonFinale field is always preserved as-is from the snapshot.
     */
    hydrateGame(_state, action: PayloadAction<GameState>) {
      return action.payload;
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
        (state.awaitingPublicSave &&
          state.phase === 'pre_veto_public_save' &&
          state.nomineeIds.length === 3) ||
        state.awaitingPovDecision ||
        state.awaitingPovSaveTarget ||
        state.awaitingHumanVote ||
        state.awaitingTieBreak ||
        state.awaitingFinal3Eviction ||
        state.awaitingFinal3Plea ||
        state.specialVeto?.awaitingHolderReplacement ||
        state.specialVeto?.awaitingCoupReplacement1 ||
        state.specialVeto?.awaitingCoupReplacement2 ||
        state.specialVeto?.awaitingVipSecondUseDecision ||
        state.specialVeto?.awaitingVipSecondSaveTarget ||
        state.pendingEviction != null ||
        state.battleBack?.active ||
        state.favoritePlayer?.active ||
        (state.seasonFinale != null && state.seasonFinale.phase !== 'seasonComplete') ||
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
          `${povHolder?.name ?? 'The POS holder'} asks nominees for their pleas. 🎤`,
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
            evictionMessage: `${povHolder?.name ?? 'The POS holder'} has chosen to eliminate ${evictee.name}. ${evictee.name} has been eliminated from The Big Eye house. 🚪`,
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
        state.lastHohCompFinisherId = null;
        state.lastHohCompFinisherType = null;
        state.publicSavedNomineeId = null;
        state.nominationContext = null;
        state.awaitingPublicSave = false;
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
        pushEvent(state, `Final 3 — Day ${state.week}! The three-part LOH competition begins. 🏆`, 'game');
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
          `Final 3 Part 1 is underway! All three houseguests compete for the first leg of the Final LOH. 🏁`,
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
          `Final 3 Part 1 result: ${winner.name} wins and advances directly to Part 3! The other two housemates will compete in Part 2. 🏆`,
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
            `Final 3 Part 3 is underway! ${f3Part1Name} (Part 1 winner) vs ${f3Part2Name} (Part 2 winner) — the winner becomes the Final Leader of the House! 🏁`,
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
        if (import.meta.env.DEV) {
          console.log('[applyHohWinner]', {
            source: '[advance/final3_comp3]',
            previousHohId: state.hohId,
            nextHohId: finalHoh.id,
            currentPhase: state.phase,
          });
        }
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
          `Final 3 Part 3: ${finalHoh.name} wins and is crowned the Final Leader of the House! 👑`,
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
            `${finalHoh.name}, you must now eliminate either ${nomineeNames} to set the Final 2. 🎯`,
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
          assignSeasonPlacementOnExit(state, evictee.id);
          evictee.status = evictedStatus(state);
          state.nomineeIds = state.nomineeIds.filter((id) => id !== evictee.id);
          state.awaitingFinal3Eviction = false;
          pushEvent(
            state,
            `${finalHoh?.name ?? 'The Final LOH'} has chosen to eliminate ${evictee.name}. ${evictee.name} finishes in 3rd place. 🥉`,
            'game',
          );
          pushEvent(state, `The Final 2 is set! The Tribunal will now vote for the winner of The Big Eye. 🏆`, 'game');
        }
        state.phase = 'week_end';
        return;
      }

      // Guard: jury is a terminal phase — advance() is a no-op once reached.
      if (state.phase === 'jury') return;

      // Guard: jury_announcement → jury_cinematic (user dismissed the modal).
      if (state.phase === 'jury_announcement') {
        state.phase = 'jury_cinematic';
        return;
      }

      // Guard: jury_cinematic → jury (cinematic complete or skipped).
      if (state.phase === 'jury_cinematic') {
        state.phase = 'jury';
        return;
      }

      // Guard: at week_end with ≤2 players alive the Final 2 is set.
      // Transition to jury_announcement so the UI can show the modal/cinematic
      // before entering jury voting.
      if (state.phase === 'week_end') {
        const aliveAtEnd = state.players.filter(
          (p) => p.status !== 'evicted' && p.status !== 'jury',
        );
        if (aliveAtEnd.length <= 2) {
          state.phase = 'jury_announcement';
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
          `${hohPlayer?.name ?? 'The LOH'} must now name a backup nominee. 🎯`,
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
            `${hohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
            'game',
          );
        }
        // Keep povSavedId set so the UI can detect "veto was used" and show
        // the AI replacement animation. Cleared at week_start.
        state.aiReplacementStep = 0;
        // VIP: after AI replacement completes first use, advance to second-use decision stage
        if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 1) {
          state.specialVeto.vipUseStage = 2;
        }
        // VIP: after AI replacement completes second use, mark ceremony done
        if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 3) {
          state.specialVeto.vipUseStage = -1;
        }
        return;
      }

      // ── Double Trouble second-use handling ──────────────────────────────────────
      if (state.specialVeto?.activeType === 'vip' && state.specialVeto.vipUseStage === 2) {
        const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
        if (nominees.length === 0) {
          state.specialVeto.vipUseStage = -1;
          return;
        }
        const povHolder = state.players.find((p) => p.id === state.povWinnerId);
        if (povHolder?.isUser) {
          state.specialVeto.awaitingVipSecondUseDecision = true;
          pushEvent(
            state,
            `${povHolder.name}, you may use Double Trouble a second time! Would you like to save another nominee? 👑`,
            'game',
          );
        } else {
          // AI: seeded decision — tends to use second time (~70%)
          const seedRng2 = mulberry32(state.seed);
          state.seed = (seedRng2() * 0x100000000) >>> 0;
          const rng2 = mulberry32(state.seed);
          const useSecond = rng2() < 0.70;
          if (useSecond && nominees.length > 0) {
            const nominee2 = seededPick(rng2, nominees);
            state.nomineeIds = state.nomineeIds.filter((id) => id !== nominee2.id);
            const savedP = state.players.find((p) => p.id === nominee2.id);
            if (savedP) savedP.status = 'active';
            state.povSavedId = nominee2.id;
            pushEvent(
              state,
              `${povHolder?.name ?? 'The Double Trouble holder'} used Double Trouble a second time, saving ${nominee2.name}! 👑`,
              'game',
            );
            const hohP = state.players.find((p) => p.id === state.hohId);
            if (hohP?.isUser) {
              state.specialVeto.vipUseStage = 3;
              state.replacementNeeded = true;
              pushEvent(state, `${hohP.name} must now name another backup nominee. 🎯`, 'game');
            } else {
              state.specialVeto.vipUseStage = 3;
              state.aiReplacementStep = 1;
            }
          } else {
            state.specialVeto.vipUseStage = -1;
            pushEvent(
              state,
              `${povHolder?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble a second time. The nominations stand. 👑`,
              'game',
            );
          }
        }
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
          state.lastHohCompFinisherId = null;
          state.lastHohCompFinisherType = null;
          state.publicSavedNomineeId = null;
          state.nominationContext = null;
          state.awaitingPublicSave = false;
          state.votes = {};
          state.awaitingHumanVote = false;
          state.awaitingTieBreak = false;
          state.tiedNomineeIds = null;
          state.aiReplacementStep = 0;
          state.aiReplacementWaiting = false;
          // Clear per-week special veto ceremony flags (preserve seasonUsed flag)
          if (state.specialVeto) {
            state.specialVeto.activeType = null;
            state.specialVeto.activatedWeek = null;
            state.specialVeto.vipUseStage = 0;
            state.specialVeto.awaitingHolderReplacement = false;
            state.specialVeto.awaitingCoupReplacement1 = false;
            state.specialVeto.awaitingCoupReplacement2 = false;
            state.specialVeto.coupReplacement1Id = null;
            state.specialVeto.awaitingVipSecondUseDecision = false;
            state.specialVeto.awaitingVipSecondSaveTarget = false;
            state.twistActive = false;
          }
          state.twistActivatedThisWeek = false;
          state.players.forEach((p) => {
            if (['hoh', 'nominated', 'pov', 'hoh+pov', 'nominated+pov'].includes(p.status)) {
              p.status = 'active';
            }
          });
          pushEvent(state, `Day ${state.week} begins! 🏠 It's time for the LOH competition.`, 'game');
          break;
        }
        case 'hoh_comp_announcement': {
          pushEvent(state, `The Leader of the House competition is about to begin! 🏆 Power is up for grabs among the eligible housemates — who will reign supreme this week?`, 'game');
          break;
        }
        case 'hoh_comp': {
          pushEvent(state, `The Leader of the House competition has begun! 🏆 Who will win power this week?`, 'game');
          break;
        }
        case 'hoh_results': {
          // completeMinigame() applies the HOH winner inline and advances the phase
          // directly, so minigameResult is always null here.  Always pick randomly.
          // Exclude the outgoing HOH (prevHohId) to respect the ineligibility rule.
          const hohPool = state.prevHohId
            ? alive.filter((p) => p.id !== state.prevHohId)
            : alive;
          const hohEligible = hohPool.length > 0 ? hohPool : alive;
          const hoh = seededPick(rng, hohEligible);
          applyHohWinner(state, hoh.id, '[advance/hoh_results]');
          // Track last-place HOH competition finisher for the third-nominee rule.
          // Use RNG to pick deterministically among non-HOH eligible players.
          const lastPlacePool = hohEligible.filter((p) => p.id !== hoh.id);
          if (lastPlacePool.length > 0) {
            state.lastHohCompFinisherId = seededPick(rng, lastPlacePool).id;
          }
          break;
        }
        case 'social_1': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The new LOH';
          pushEvent(state, `Housemates congratulate ${hohName}. Alliances are already forming… 💬`, 'social');
          break;
        }
        case 'nominations': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The LOH';
          pushEvent(state, `${hohName} is preparing the nomination ceremony. 🎯`, 'game');
          break;
        }
        case 'nomination_results': {
          // Double Eviction week: HOH nominates 3; otherwise 2.
          const isDoubleEviction = state.doubleEviction?.weekActive === true;
          const publicModeEnabled = state.publicModeEnabled === true;
          const canUsePublicNomineeRule = publicModeEnabled && !isDoubleEviction;
          const nomineeCount = isDoubleEviction ? 3 : 2;
          // Guard: need HOH + nomineeCount eligible players.
          const pool = alive.filter((p) => p.id !== state.hohId);
          if (pool.length < nomineeCount) break;

          const hohPlayer = state.players.find((p) => p.id === state.hohId);
          if (hohPlayer?.isUser) {
            // Human HOH: block advance() and wait for the multi-select nomination UI.
            // Human still picks 2; the 3rd auto-nominee is appended by commitNominees.
            state.awaitingNominations = true;
            state.pendingNominee1Id = null;
            const countWord = isDoubleEviction ? 'three' : 'two';
            pushEvent(
              state,
              `${hohPlayer.name}, it's time to make your nominations. Choose ${countWord} houseguests to put on the block. 🎯`,
              'game',
            );
            break;
          }

          // AI HOH: pick randomly (2 for normal weeks, 3 for DE).
          // In public mode non-DE weeks, exclude the forced auto-nominee from the AI pick
          // pool so the AI always selects distinct nominees and the auto-nominee is reliably
          // appended as the third nominee below.
          const aiPool =
            canUsePublicNomineeRule && state.lastHohCompFinisherId
              ? pool.filter((p) => p.id !== state.lastHohCompFinisherId)
              : pool;
          const nominees = seededPickN(rng, aiPool, nomineeCount);
          state.nomineeIds = nominees.map((n) => n.id);
          nominees.forEach((n) => {
            const p = state.players.find((pl) => pl.id === n.id);
            if (p) p.status = 'nominated';
            incrementTimesNominated(state, n.id);
          });

          // In public mode on non-Double Eviction weeks, auto-append the last-place HOH comp finisher.
          if (canUsePublicNomineeRule && state.lastHohCompFinisherId) {
            const autoId = state.lastHohCompFinisherId;
            let autoNomineeId: string | null = null;
            if (!state.nomineeIds.includes(autoId)) {
              const autoPlayer = pool.find((p) => p.id === autoId);
              if (autoPlayer) {
                state.nomineeIds = [...state.nomineeIds, autoId];
                const ap = state.players.find((p) => p.id === autoId);
                if (ap) ap.status = 'nominated';
                incrementTimesNominated(state, autoId);
                autoNomineeId = autoId;
              }
            }
            state.nominationContext = {
              hohNomineeIds: nominees.map((n) => n.id),
              autoNomineeId,
              publicSaveApplied: false,
            };
          }

          const allNominees = state.nomineeIds.map((id) => state.players.find((p) => p.id === id));
          const names = allNominees
            .filter(Boolean)
            .map((n) => n!.name);
          const nameList = isDoubleEviction ? names.join(', ') : formatNameList(names);
          pushEvent(state, `${nameList} have been nominated for elimination. 🎯`, 'game');
          break;
        }
        case 'pre_veto_public_save': {
          // Skip this phase unless Public mode is on, this is not a Double Eviction,
          // and there is a valid 3-nominee block to reduce back to 2 before veto.
          if (
            state.publicModeEnabled !== true ||
            state.doubleEviction?.weekActive ||
            state.nomineeIds.length !== 3
          ) {
            if (import.meta.env.DEV && state.publicModeEnabled === true) {
              const reason = state.doubleEviction?.weekActive
                ? 'double eviction active'
                : `nomineeIds.length is ${state.nomineeIds.length} (expected 3)`;
              console.warn(
                `[publicMode] pre_veto_public_save skipped even though publicModeEnabled=true — reason: ${reason}`,
                { week: state.week, nomineeCount: state.nomineeIds.length },
              );
            }
            nextPhase = 'pov_comp_announcement';
            pushPovCompetitionAnnouncement(state);
            break;
          }
          // Normal weeks: block advance() and let the UI resolve which nominee is saved.
          state.awaitingPublicSave = true;
          pushEvent(
            state,
            `The final list of nominees today will be decided with the public's help.`,
            'game',
          );
          break;
        }
        case 'pov_comp_announcement': {
          pushPovCompetitionAnnouncement(state);
          break;
        }
        case 'pov_comp': {
          pushEvent(state, `The Power of Safety competition is underway! 🎭`, 'game');
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
          const povName = state.players.find((p) => p.id === state.povWinnerId)?.name ?? 'The safety holder';
          pushEvent(state, `${povName} is holding the Safety Ceremony. ⚡`, 'game');
          break;
        }
        case 'pov_ceremony_results': {
          const svType = state.specialVeto?.activeType ?? null;

          // VIP: if already processed (stage not 0), this is a second pass – skip to advance phase.
          if (svType === 'vip' && state.specialVeto!.vipUseStage !== 0) {
            break;
          }

          const povWinner = state.povWinnerId
            ? state.players.find((p) => p.id === state.povWinnerId) ?? null
            : null;
          const isNominee = povWinner !== null && state.nomineeIds.includes(povWinner.id);

          // ── Force Majeure: mandatory use (no choice) ──────────────────────────
          if (svType === 'spotlight') {
            if (isNominee && povWinner !== null) {
              // Nominee auto-saves self
              const savedName = povWinner.name;
              const autoSavedId = povWinner.id;
              state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
              povWinner.status = 'pov';
              state.povSavedId = autoSavedId;
              pushEvent(state, `${savedName} used Force Majeure and saved themselves! ✨`, 'game');
              const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
              if (hohPlayer?.isUser) {
                state.replacementNeeded = true;
                pushEvent(state, `${hohPlayer.name} must now name a backup nominee. 🎯`, 'game');
              } else {
                const eligible = alive.filter(
                  (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId &&
                    !state.nomineeIds.includes(pl.id) && pl.id !== autoSavedId,
                );
                if (eligible.length > 0) {
                  const replacement = seededPick(rng, eligible);
                  state.nomineeIds.push(replacement.id);
                  const rp = state.players.find((pl) => pl.id === replacement.id);
                  if (rp) rp.status = 'nominated';
                  incrementTimesNominated(state, replacement.id);
                  pushEvent(state, `${hohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`, 'game');
                }
              }
            } else if (povWinner?.isUser) {
              // Human must use — directly to save target
              state.awaitingPovSaveTarget = true;
              pushEvent(state, `${povWinner.name}, Force Majeure MUST be used! Choose a nominee to save. ✨`, 'game');
            } else {
              // AI: pick one nominee to save
              const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
              if (nominees.length > 0) {
                const nomineeToSave = seededPick(rng, nominees);
                const savedName = nomineeToSave.name;
                state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id);
                const savedP = state.players.find((p) => p.id === nomineeToSave.id);
                if (savedP) savedP.status = 'active';
                state.povSavedId = nomineeToSave.id;
                pushEvent(state, `${povWinner?.name ?? 'The Force Majeure holder'} used Force Majeure on ${savedName}! ✨`, 'game');
                const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
                if (hohPlayer?.isUser) {
                  state.replacementNeeded = true;
                  pushEvent(state, `${hohPlayer.name} must now name a backup nominee. 🎯`, 'game');
                } else {
                  state.aiReplacementStep = 1;
                }
              }
            }
            break;
          }

          // ── Halo Exchange: holder names the replacement ────────────────────────
          if (svType === 'diamond') {
            if (isNominee && povWinner !== null) {
              const savedName = povWinner.name;
              const autoSavedId = povWinner.id;
              state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
              povWinner.status = 'pov';
              state.povSavedId = autoSavedId;
              pushEvent(state, `${savedName} used Halo Exchange and saved themselves! 😇`, 'game');
              if (povWinner.isUser) {
                state.specialVeto!.awaitingHolderReplacement = true;
                pushEvent(state, `${povWinner.name}, as the Halo Exchange holder, you must name the backup nominee. 😇`, 'game');
              } else {
                const eligible = alive.filter(
                  (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId &&
                    !state.nomineeIds.includes(pl.id) && pl.id !== autoSavedId,
                );
                if (eligible.length > 0) {
                  const replacement = seededPick(rng, eligible);
                  state.nomineeIds.push(replacement.id);
                  const rp = state.players.find((pl) => pl.id === replacement.id);
                  if (rp) rp.status = 'nominated';
                  incrementTimesNominated(state, replacement.id);
                  pushEvent(state, `${povWinner.name} named ${replacement.name} as the Halo Exchange backup nominee. 😇`, 'game');
                }
              }
            } else if (povWinner?.isUser) {
              state.awaitingPovDecision = true;
              pushEvent(state, `${povWinner.name}, will you use Halo Exchange? 😇`, 'game');
            } else {
              const useIt = rng() < 0.70;
              if (useIt) {
                const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
                if (nominees.length > 0) {
                  const nomineeToSave = seededPick(rng, nominees);
                  state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id);
                  const savedP = state.players.find((p) => p.id === nomineeToSave.id);
                  if (savedP) savedP.status = 'active';
                  state.povSavedId = nomineeToSave.id;
                  pushEvent(state, `${povWinner?.name ?? 'The Halo Exchange holder'} used Halo Exchange on ${nomineeToSave.name}! 😇`, 'game');
                  const eligible = alive.filter(
                    (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId &&
                      !state.nomineeIds.includes(pl.id) && pl.id !== nomineeToSave.id,
                  );
                  if (eligible.length > 0) {
                    const replacement = seededPick(rng, eligible);
                    state.nomineeIds.push(replacement.id);
                    const rp = state.players.find((pl) => pl.id === replacement.id);
                    if (rp) rp.status = 'nominated';
                    incrementTimesNominated(state, replacement.id);
                    pushEvent(state, `${povWinner?.name ?? 'The Halo Exchange holder'} named ${replacement.name} as the backup nominee. 😇`, 'game');
                  }
                }
              } else {
                pushEvent(state, `${povWinner?.name ?? 'The Halo Exchange holder'} chose not to use Halo Exchange. 😇`, 'game');
              }
            }
            break;
          }

          // ── Detox: removes both nominees, holder names both replacements ────────
          if (svType === 'coup') {
            if (povWinner?.isUser) {
              state.awaitingPovDecision = true;
              pushEvent(
                state,
                `${povWinner.name}, will you use Detox? ⚡ Both nominees would be removed and you would name two replacements!`,
                'game',
              );
            } else {
              const useIt = rng() < 0.65;
              if (useIt) {
                const oldNominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
                oldNominees.forEach((n) => { n.status = 'active'; });
                state.nomineeIds = [];
                state.povSavedId = null;
                const removedNames = oldNominees.map((n) => n.name).join(' and ');
                pushEvent(state, `${povWinner?.name ?? 'The Detox holder'} used Detox! ${removedNames} are cleared from the block! ⚡`, 'game');
                const eligible = alive.filter(
                  (pl) => pl.id !== state.hohId && pl.id !== state.povWinnerId,
                );
                if (eligible.length >= 2) {
                  const replacements = seededPickN(rng, eligible, 2);
                  replacements.forEach((r) => {
                    state.nomineeIds.push(r.id);
                    const rp = state.players.find((pl) => pl.id === r.id);
                    if (rp) rp.status = 'nominated';
                    incrementTimesNominated(state, r.id);
                  });
                  const repNames = replacements.map((r) => r.name).join(' and ');
                  pushEvent(state, `${povWinner?.name ?? 'The Detox holder'} named ${repNames} as the new nominees. ⚡`, 'game');
                } else if (eligible.length === 1) {
                  const r = eligible[0];
                  state.nomineeIds.push(r.id);
                  const rp = state.players.find((pl) => pl.id === r.id);
                  if (rp) rp.status = 'nominated';
                  incrementTimesNominated(state, r.id);
                  pushEvent(state, `${povWinner?.name ?? 'The Detox holder'} named ${r.name} as the only available replacement. ⚡`, 'game');
                }
              } else {
                pushEvent(state, `${povWinner?.name ?? 'The Detox holder'} chose not to use Detox. ⚡`, 'game');
              }
            }
            break;
          }

          // ── Double Trouble: like standard but holder may use it twice ───────────
          if (svType === 'vip') {
            if (isNominee && povWinner !== null) {
              const savedName = povWinner.name;
              const autoSavedId = povWinner.id;
              state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
              povWinner.status = 'pov';
              state.povSavedId = autoSavedId;
              state.specialVeto!.vipUseStage = 1;
              pushEvent(state, `${savedName} used Double Trouble and saved themselves! 👑`, 'game');
              const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
              if (hohPlayer?.isUser) {
                state.replacementNeeded = true;
                pushEvent(state, `${hohPlayer.name} must now name a backup nominee. 🎯`, 'game');
              } else {
                state.aiReplacementStep = 1;
              }
            } else if (povWinner?.isUser) {
              state.awaitingPovDecision = true;
              pushEvent(
                state,
                `${povWinner.name}, will you use Double Trouble? 👑 You may use it TWICE this ceremony!`,
                'game',
              );
            } else {
              const useIt = rng() < 0.85;
              if (useIt) {
                const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
                if (nominees.length > 0) {
                  const nomineeToSave = seededPick(rng, nominees);
                  state.nomineeIds = state.nomineeIds.filter((id) => id !== nomineeToSave.id);
                  const savedP = state.players.find((p) => p.id === nomineeToSave.id);
                  if (savedP) savedP.status = 'active';
                  state.povSavedId = nomineeToSave.id;
                  state.specialVeto!.vipUseStage = 1;
                  pushEvent(state, `${povWinner?.name ?? 'The Double Trouble holder'} used Double Trouble on ${nomineeToSave.name}! 👑`, 'game');
                  const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
                  if (hohPlayer?.isUser) {
                    state.replacementNeeded = true;
                    pushEvent(state, `${hohPlayer.name} must now name a backup nominee. 🎯`, 'game');
                  } else {
                    state.aiReplacementStep = 1;
                  }
                } else {
                  state.specialVeto!.vipUseStage = -1;
                }
              } else {
                state.specialVeto!.vipUseStage = -1;
                pushEvent(state, `${povWinner?.name ?? 'The Double Trouble holder'} chose not to use Double Trouble. 👑`, 'game');
              }
            }
            break;
          }

          // ── Standard (no special veto) ────────────────────────────────────────
          if (isNominee && povWinner !== null) {
            // ── POV auto-use rule: nominee who wins POV MUST use it on themselves ──
            const savedName = povWinner.name;
            const autoSavedId = povWinner.id;
            state.nomineeIds = state.nomineeIds.filter((id) => id !== povWinner.id);
            // Update status: was 'nominated+pov', now just 'pov' (saved themselves)
            povWinner.status = 'pov';
            // Track the self-saved player so they cannot be re-nominated as the replacement
            state.povSavedId = autoSavedId;
            pushEvent(state, `${savedName} used the Safety and saved themselves! 🛡️`, 'game');

            // HOH must name a replacement
            const hohPlayer = state.players.find((pl) => pl.id === state.hohId);
            if (hohPlayer?.isUser) {
              // Human HOH: set flag; UI will render replacement picker; Continue hidden
              state.replacementNeeded = true;
              pushEvent(
                state,
                `${hohPlayer.name} must now name a backup nominee. 🎯`,
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
                  `${hohPlayer?.name ?? 'The LOH'} named ${replacement.name} as the backup nominee. 🎯`,
                  'game',
                );
              }
            }
          } else if (povWinner?.isUser) {
            // Human POV holder who is not a nominee: they must decide whether to use it
            state.awaitingPovDecision = true;
            pushEvent(
              state,
              `${povWinner.name}, will you use the Power of Safety? ⚡`,
              'game',
            );
          } else {
            // AI POV holder who is not a nominee: does not use the veto
            const povName = povWinner?.name ?? 'The safety holder';
            pushEvent(
              state,
              `${povName} has decided NOT to use the Power of Safety. The nominations remain the same. ⚡`,
              'game',
            );
          }
          break;
        }
        case 'social_2': {
          pushEvent(state, `Housemates make their final pitches before the live vote. 🤝`, 'social');
          break;
        }
        case 'live_vote': {
          const nomNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ');
          pushEvent(state, `The live elimination vote has begun! ${nomNames} face elimination. 🗳️`, 'vote');

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

            // PR 3 — doubleVote offer: if the player has an eligible doubleVote
            // reward and no conflicting twist is active, prompt them before the
            // vote modal so they can choose whether to cast two votes.
            // Note: the switch runs for the phase being ENTERED (nextPhase), so
            // state.phase still holds the previous phase. Build a check state
            // that reflects the phase we are entering ('live_vote').
            const dvCheck = {
              phase: nextPhase as string,
              secretMission: state.secretMission,
              nomineeIds: state.nomineeIds,
              hohId: state.hohId,
              players: state.players,
              doubleEviction: state.doubleEviction,
              voteResults: state.voteResults,
              awaitingTieBreak: state.awaitingTieBreak,
            };
            if (canUseDoubleVote(dvCheck) && !state.humanDoubleVoteActive) {
              state.awaitingDoubleVoteOffer = true;
            }
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

          // ── Double Eviction: evict top 2 nominees ─────────────────────────
          if (state.doubleEviction?.weekActive && nominees.length >= 2) {
            // Precompute deterministic tie-break ranks for the current nominee
            // IDs so the comparator stays transitive/stable for tied vote counts.
            const aiRng = mulberry32((state.seed ^ 0xdeadbeef) >>> 0);
            const tieBreakRanks: Record<string, number> = {};
            for (const nomineeId of state.nomineeIds) {
              tieBreakRanks[nomineeId] = aiRng();
            }

            // Sort nominees by vote count descending; use precomputed ranks for ties.
            const sortedIds = [...state.nomineeIds].sort((a, b) => {
              const diff = (voteCounts[b] ?? 0) - (voteCounts[a] ?? 0);
              if (diff !== 0) return diff;
              return (tieBreakRanks[b] ?? 0) - (tieBreakRanks[a] ?? 0);
            });

            const firstId = sortedIds[0];
            const secondId = sortedIds[1];
            const firstEvictee = state.players.find((p) => p.id === firstId);
            const secondEvictee = state.players.find((p) => p.id === secondId);

            if (firstEvictee && secondEvictee) {
              state.voteResults = { ...voteCounts };
              state.votes = {};
              state.pendingEviction = {
                evicteeId: firstId,
                evictionMessage: `${firstEvictee.name}, you have been eliminated from The Big Eye house. 🚪`,
              };
              state.doubleEviction.pendingSecondEviction = {
                evicteeId: secondId,
                evictionMessage: `${secondEvictee.name}, you have also been evicted in tonight's Double Eviction! 🚪`,
              };
            }
            break;
          }

          // ── Standard single eviction ──────────────────────────────────────
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
                evictionMessage: `${evicted.name}, you have been eliminated from The Big Eye house. 🚪`,
              };

              // PR 3 — voteDeduction offer: if the human player is on the block
              // with votes against them and has an eligible voteDeduction reward,
              // pause the flow so they can decide whether to use the power.
              // Note: state.phase still holds the previous phase here — pass nextPhase
              // explicitly so canUseVoteDeduction sees the correct phase ('eviction_results').
              const vdCheck = {
                phase: nextPhase as string,
                secretMission: state.secretMission,
                nomineeIds: state.nomineeIds,
                hohId: state.hohId,
                players: state.players,
                doubleEviction: state.doubleEviction,
                voteResults: state.voteResults,
                awaitingTieBreak: state.awaitingTieBreak,
              };
              if (canUseVoteDeduction(vdCheck)) {
                state.awaitingVoteDeductionPrompt = true;
              }
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
                `It's a tie between ${tiedNames}! ${hohPlayer.name}, as LOH you must break the tie. 🗳️`,
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
                  evictionMessage: `${hohPlayer?.name ?? 'The LOH'} breaks the tie, voting to eliminate ${evicted.name}. ${evicted.name} has been eliminated from The Big Eye house. 🗳️`,
                };
              }
            }
          }
          break;
        }
        case 'week_end': {
          pushEvent(state, `Day ${state.week} has come to an end. A new day begins soon… ✨`, 'game');
          break;
        }
      }

      state.phase = nextPhase;
    },

    // ── Secret Mission reducers ────────────────────────────────────────────

    /**
     * Trigger a new secret mission for the current season.
     * Idempotent: ignored if a mission already exists (at most one per season).
     * @param day  The game week / day on which the trigger fires.
     */
    triggerSecretMission(state, action: PayloadAction<number>) {
      if (state.secretMission) return; // already triggered this season
      const day = action.payload;
      state.secretMission = createSecretMissionState(day);
    },

    /**
     * Mark the mission as offered in the Confessional (status → 'offered').
     * Records the day of the offer and increments the offer count.
     * @param day  Current game week / day when the offer is shown.
     */
    offerSecretMission(state, action: PayloadAction<number>) {
      const sm = state.secretMission;
      if (!sm || (sm.status !== 'available' && sm.status !== 'declined')) return;
      // Limit to 2 offers (original + one re-offer after decline)
      if (sm.offerCount >= 2) return;
      sm.status = 'offered';
      sm.offeredDay = action.payload;
      sm.offerCount += 1;
    },

    /**
     * Player accepted the mission (status → 'accepted').
     * Initialises the task list from the matching template.
     */
    acceptSecretMission(state) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'offered') return;
      const nextMission = buildSecretMissionTasksForTemplate(sm.templateId, sm.triggeredDay);
      sm.status = 'accepted';
      sm.templateId = nextMission.templateId;
      sm.tasks = nextMission.tasks;
    },

    /**
     * Rotate an accepted mission to the next template in the pool and rebuild
     * its checklist from scratch for the original trigger day.
     */
    reshuffleSecretMission(state) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'accepted') return;
      const currentIndex = MISSION_TEMPLATES.findIndex((t) => t.id === sm.templateId);
      const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % MISSION_TEMPLATES.length
        : 0;
      const nextMission = buildSecretMissionTasksForTemplate(
        MISSION_TEMPLATES[nextIndex]?.id ?? MISSION_TEMPLATES[0].id,
        sm.triggeredDay,
      );
      sm.templateId = nextMission.templateId;
      sm.tasks = nextMission.tasks;
    },

    /**
     * Player declined the mission (status → 'declined').
     * Records the day of the decline.
     * @param day  Current game week / day when the player declined.
     */
    declineSecretMission(state, action: PayloadAction<number>) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'offered') return;
      sm.status = 'declined';
      sm.declinedDay = action.payload;
    },

    /**
     * Update progress on a single mission task.
     * Automatically marks the task completed when current >= target.
     * If all tasks complete, transitions the mission to 'rewardPending'.
     */
    updateMissionTaskProgress(
      state,
      action: PayloadAction<{ taskId: string; current: number }>,
    ) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'accepted') return;
      const task = sm.tasks.find((t) => t.id === action.payload.taskId);
      if (!task) return;
      task.current = action.payload.current;
      task.completed = task.current >= task.target;
      // Check if all tasks are done
      const allDone = sm.tasks.length > 0 && sm.tasks.every((t) => t.completed);
      if (allDone) {
        sm.status = 'rewardPending';
      }
    },

    /**
     * Anti-cheese: credit a unique day for a task that requires visits on
     * separate calendar days (e.g. `confessional_visits`).
     *
     * Rules:
     *  - The day string must NOT already be in `task.uniqueDays`.
     *  - `task.current` never decreases when `uniqueDays` is introduced for an
     *    upgraded save; new credits only move progress forward.
     *  - If `current >= target` the task is marked completed and, if all
     *    tasks finish, the mission transitions to 'rewardPending'.
     *
     * Idempotent: re-crediting a day that was already counted is a no-op.
     */
    addUniqueDayToTask(
      state,
      action: PayloadAction<{ taskId: string; day: string }>,
    ) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'accepted') return;
      const task = sm.tasks.find((t) => t.id === action.payload.taskId);
      if (!task || task.completed) return;
      const previousCurrent = typeof task.current === 'number' ? task.current : 0;
      if (!task.uniqueDays) task.uniqueDays = [];
      if (task.uniqueDays.includes(action.payload.day)) return; // already counted
      task.uniqueDays.push(action.payload.day);
      task.current = Math.max(previousCurrent, task.uniqueDays.length);
      task.completed = task.current >= task.target;
      const allDone = sm.tasks.length > 0 && sm.tasks.every((t) => t.completed);
      if (allDone) {
        sm.status = 'rewardPending';
      }
    },

    /**
     * Explicitly mark the mission as completed (e.g. when the final task
     * is ticked via a passive update path).
     * Transitions to rewardPending.
     */
    completeMission(state) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'accepted') return;
      sm.tasks.forEach((t) => { t.completed = true; t.current = t.target; });
      sm.status = 'rewardPending';
    },

    /**
     * Record the mystery-box reward the player selected (status → 'rewardClaimed').
     * Only valid from 'rewardPending'.
     *
     * @param rewardType  The MissionRewardType outcome assigned to the chosen box.
     *
     * Note: +1000 influence application is handled separately by the caller
     * (DiaryRoom) by dispatching applyInfluenceDelta immediately after this.
     * Vote-related rewards (doubleVote, voteDeduction) are stored here but
     * not yet wired into live voting — that is PR 3 work.
     */
    claimMissionReward(state, action: PayloadAction<MissionRewardType>) {
      const sm = state.secretMission;
      if (!sm || sm.status !== 'rewardPending') return;
      sm.reward = createMissionReward(action.payload);
      sm.status = 'rewardClaimed';
    },

    /**
     * Expire a claimed reward when Final 4 is reached.
     * Only runs when the reward exists and is still eligible (i.e. not consumed
     * and not already an empty box).  Idempotent — safe to call multiple times.
     *
     * The Final 4 restriction: rewards can only be used BEFORE Final 4 week.
     * Once Final 4 begins, any stored eligible reward is expired and becomes unusable.
     */
    expireMissionReward(state) {
      const sm = state.secretMission;
      if (!sm || !sm.reward) return;
      if (sm.reward.consumed) return; // already used — nothing to expire
      if (!sm.reward.eligible) return; // emptyBox or already expired — skip
      sm.reward.expired = true;
      sm.reward.eligible = false;
    },

    // ── PR 3: doubleVote activation reducers ──────────────────────────────

    /**
     * Accept the Big Eye doubleVote offer — activates the double-vote mode
     * for the current live_vote phase.
     *
     * Sets `humanDoubleVoteActive = true` and clears `awaitingDoubleVoteOffer`.
     * The live-vote modal in GameScreen detects `humanDoubleVoteActive` and shows
     * two nominee selectors instead of one.
     *
     * Guard: only applies when `awaitingDoubleVoteOffer` is true and an eligible
     * doubleVote reward exists.
     */
    activateDoubleVoteReward(state) {
      if (!state.awaitingDoubleVoteOffer) return;
      // Always clear the offer flag (ensures UI won't be stuck if state is inconsistent)
      state.awaitingDoubleVoteOffer = false;
      const sm = state.secretMission;
      if (!sm?.reward || sm.reward.type !== 'doubleVote' || !sm.reward.eligible) return;
      state.humanDoubleVoteActive = true;
    },

    /**
     * Decline the Big Eye doubleVote offer — clears `awaitingDoubleVoteOffer`
     * without consuming the reward. The reward remains stored for a future vote.
     */
    declineDoubleVoteReward(state) {
      state.awaitingDoubleVoteOffer = false;
      // humanDoubleVoteActive stays false (or undefined); normal vote modal follows.
    },

    /**
     * Submit two vote targets when the human player has the doubleVote power active.
     * Records both votes in `state.votes` using `<humanId>` and `<humanId>__dv2`
     * as the voter keys, then consumes the reward and clears the activation flag.
     *
     * @param action.payload  Tuple [primaryTarget, secondaryTarget] — both must be
     *                        valid nominee IDs.  The same nominee may be chosen twice.
     */
    submitHumanDoubleVote(state, action: PayloadAction<[string, string]>) {
      if (!state.humanDoubleVoteActive) return;
      const [target1, target2] = action.payload;
      if (!state.nomineeIds.includes(target1)) return;
      if (!state.nomineeIds.includes(target2)) return;

      const humanPlayer = state.players.find((p) => p.isUser);
      if (!humanPlayer) return;
      if (!state.votes) state.votes = {};

      // Primary vote (same key as a normal vote)
      state.votes[humanPlayer.id] = target1;
      // Secondary vote stored under a suffix key — tallied by the same loop
      // in advance() that iterates Object.values(state.votes).
      state.votes[`${humanPlayer.id}__dv2`] = target2;

      state.awaitingHumanVote = false;
      state.humanDoubleVoteActive = false;

      // Consume the reward
      const sm = state.secretMission;
      if (sm?.reward && sm.reward.type === 'doubleVote') {
        sm.reward.consumed = true;
        sm.reward.eligible = false;
      }
    },

    // ── PR 3: voteDeduction activation reducers ───────────────────────────

    /**
     * Accept the Big Eye voteDeduction offer — subtracts 1 vote from the human
     * player's tally in `voteResults`, recomputes `pendingEviction` based on the
     * updated counts, consumes the reward, and clears `awaitingVoteDeductionPrompt`.
     *
     * Guard: only applies when `awaitingVoteDeductionPrompt` is true and an
     * eligible voteDeduction reward exists.
     */
    activateVoteDeductionReward(state) {
      if (!state.awaitingVoteDeductionPrompt) return;
      // Always clear the prompt flag (ensures UI won't be stuck if state is inconsistent)
      state.awaitingVoteDeductionPrompt = false;
      const sm = state.secretMission;
      if (!sm?.reward || sm.reward.type !== 'voteDeduction' || !sm.reward.eligible) return;
      if (!state.voteResults) return;

      const humanPlayer = state.players.find((p) => p.isUser);
      if (!humanPlayer) return;
      if (!(humanPlayer.id in state.voteResults)) return;

      // Apply the deduction (floor at 0 to be safe)
      state.voteResults[humanPlayer.id] = Math.max(0, (state.voteResults[humanPlayer.id] ?? 0) - 1);

      // Recompute the evictee based on the updated tallies
      let maxVotes = -1;
      for (const id of state.nomineeIds) {
        const count = state.voteResults[id] ?? 0;
        if (count > maxVotes) maxVotes = count;
      }
      const topNominees = state.nomineeIds.filter(
        (id) => (state.voteResults![id] ?? 0) === maxVotes,
      );

      if (topNominees.length === 1) {
        const newEvictee = state.players.find((p) => p.id === topNominees[0]);
        if (newEvictee) {
          state.pendingEviction = {
            evicteeId: newEvictee.id,
            evictionMessage: `${newEvictee.name}, you have been eliminated from The Big Eye house. 🚪`,
          };
        }
      }
      // Note: canUseVoteDeduction guards against tie-creation so topNominees.length
      // should always be 1 here.

      // Consume the reward
      sm.reward.consumed = true;
      sm.reward.eligible = false;
    },

    /**
     * Decline the Big Eye voteDeduction offer — clears `awaitingVoteDeductionPrompt`
     * without consuming the reward. The power remains stored for a future vote week.
     */
    declineVoteDeduction(state) {
      state.awaitingVoteDeductionPrompt = false;
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
  commitPublicSave,
  submitPovDecision,
  submitPovSaveTarget,
  submitHumanVote,
  submitTieBreak,
  dismissVoteResults,
  dismissEvictionSplash,
  setEvictionOverlay,
  clearEvictionOverlay,
  finalizePendingEviction,
  selfEvict,
  aiReplacementRendered,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  finalizeGame,
  startWinnerCinematic,
  startWinnerInterview,
  advanceInterview,
  startPublicFavorite,
  resumeAfterPublicFavorite,
  startGoodbyeSequence,
  advanceGoodbyeSequence,
  startLightsOff,
  completeFinale,
  activateBattleBack,
  completeBattleBack,
  dismissBattleBack,
  openBattleBackCompetition,
  activateDoubleEviction,
  activateSpecialVeto,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitVipSecondUseDecision,
  submitVipSecondSaveTarget,
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
  hydrateGame,
  triggerSecretMission,
  offerSecretMission,
  acceptSecretMission,
  reshuffleSecretMission,
  declineSecretMission,
  updateMissionTaskProgress,
  addUniqueDayToTask,
  completeMission,
  claimMissionReward,
  expireMissionReward,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  submitHumanDoubleVote,
  activateVoteDeductionReward,
  declineVoteDeduction,
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
      const rootState = getState();
      const state = rootState.game;
      // Auto-resolve pre-veto public save only when it is actually actionable.
      if (
        state.awaitingPublicSave &&
        state.phase === 'pre_veto_public_save' &&
        state.nomineeIds.length === 3
      ) {
        const savedId =
          resolvePublicSaveNominee({
            nomineeIds: state.nomineeIds,
            profiles: rootState.publicOpinion?.profiles ?? {},
          }).savedId || state.nomineeIds[0];
        dispatch(
          commitPublicSave({
            savedId,
            supportPercent: rootState.publicOpinion?.profiles?.[savedId]?.approval,
          }),
        );
      } else {
        dispatch(advance());
      }
      steps++;
    }
  };

/**
 * Public minigame API — startMinigame thunk.
 *
 * Score-based (non-endurance) games with a human participant:
 *   AI scores are NOT precomputed here. Instead the session is flagged with
 *   `hybridResolveOnComplete: true` and the central hybrid resolver in
 *   `completeMinigame` generates AI scores after the human score is known.
 *   This prevents a predictable outcome before the human has finished playing.
 *
 * Endurance / non-hybrid games with a human participant:
 *   AI scores ARE precomputed and stored in `session.aiScores` as before.
 *
 * AI-only games (no human participant):
 *   Precomputed scores are used immediately to derive the winner — no UI needed.
 *
 * Returns the MinigameResult for AI-only runs; undefined when human UI is shown.
 */
export const startMinigame =
  (opts: { key: string; participants: string[]; seed: number; options: { timeLimit: number } }) =>
  (dispatch: AppDispatch, getState: () => RootState): MinigameResult | undefined => {
    const state = getState().game;
    const model = getMinigameAiModel(opts.key);
    const isHybrid = isHybridScoredGame(opts.key);

    // Always precompute AI scores for AI-only runs (no UI is involved) and for
    // endurance/non-hybrid games (which keep the old precomputed path).
    // For hybrid games with a human participant, precomputation is skipped.
    const aiScores: Record<string, number> = {};

    const hasHuman = opts.participants.some((id) => {
      const p = state.players.find((pl) => pl.id === id);
      return !!p?.isUser;
    });

    if (!isHybrid || !hasHuman) {
      // Precompute for: (a) AI-only runs, (b) endurance/non-hybrid games
      const isQuickTap = opts.key === 'quickTap';
      const isSnake = opts.key === 'snake';
      opts.participants.forEach((id, index) => {
        const p = state.players.find((pl) => pl.id === id);
        if (p && !p.isUser) {
          if (isQuickTap) {
            // Quick Tap had a bespoke band-based simulator; keep it for AI-only runs.
            // Human-present Quick Tap is hybrid-resolved (isHybrid=true, hasHuman=true).
            aiScores[id] = simulateQuickTapAiScore({
              seed: opts.seed,
              playerId: id,
              participantIndex: index,
              profile: p.competitionProfile ?? getDefaultCompetitionProfile(),
              timeLimitSeconds: opts.options.timeLimit,
            });
          } else if (isSnake) {
            // Snake AI uses real headless play simulation — same board rules as
            // the human game — rather than a generic statistical model.
            aiScores[id] = simulateSnakeAiScore({
              sessionSeed: opts.seed,
              playerId: id,
              profile: p.competitionProfile ?? getDefaultCompetitionProfile(),
            });
          } else {
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
        }
      });
    }

    if (!hasHuman) {
      // AI-only: determine winner immediately and return the result directly.
      // We do NOT dispatch completeMinigame here — that would write a stale
      // minigameResult that could later be consumed by an unrelated advance().
      const winnerId = determineWinner(opts.participants, aiScores);
      const result: MinigameResult = { seedUsed: opts.seed, scores: aiScores, winnerId };
      dispatch(applyCompetitionSeasonUpdate({ participants: opts.participants, scores: aiScores, winnerId }));
      return result;
    }

    // Human present: launch UI and return undefined (UI resolves via completeMinigame).
    // For hybrid (scored) games, flag the session so completeMinigame resolves AI scores.
    const session = {
      key: opts.key,
      participants: opts.participants,
      seed: opts.seed,
      options: opts.options,
      aiScores,
      ...(isHybrid ? { hybridResolveOnComplete: true } : {}),
    };
    dispatch(launchMinigame(session));
    return undefined;
  };

/**
 * Attempt to trigger the seasonal secret mission for the current day.
 *
 * Rules:
 *  - Evaluates only on Day 5–12 via the centralized chance helper
 *  - At most one mission may trigger per season
 *  - The testing overrides affect only this calculation
 *  - Uses a twist-specific RNG path so it does not perturb other outcomes
 *
 * Returns `true` if the mission triggered for the current day.
 */
export const tryActivateSecretMission =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState();

    if (game.phase !== 'week_start') return false;
    if (game.secretMission) return false;

    const forcedWeek = settings.sim.secretMissionTriggerWeekOverride;
    if (forcedWeek !== null) {
      if (game.week !== forcedWeek) return false;
      dispatch(triggerSecretMission(game.week));
      return true;
    }

    const override = settings.sim.secretMissionTriggerOverride;
    const rng = mulberry32((game.seed ^ Math.imul(game.week, 0x9e3779b1)) >>> 0);

    if (!checkSecretMissionTrigger(game.week, rng, override)) return false;

    dispatch(triggerSecretMission(game.week));
    return true;
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

/**
 * Attempt to activate the Double Eviction twist for the current week.
 *
 * Activation rules (eviction-count pacing):
 *  - Does not attempt until at least 5 evictions have happened this season.
 *  - Does not attempt at final 5 or fewer alive players.
 *  - Typically attempted at most once per eligible week by the main UI.
 *  - Each eligible attempt rolls against `settings.sim.doubleEvictionChance` (default 35%).
 *  - May activate up to 2 times per season; failed attempts do not consume a use.
 *  - Cannot activate during the same week as a Special Veto.
 *
 * Eligibility:
 *  - `settings.sim.enableTwists` must be true
 *  - current phase must be `nominations`
 *  - double eviction must not already be active this week
 *  - no other twist has already activated this week (`twistActivatedThisWeek`)
 *
 * Returns `true` if the twist was activated; `false` otherwise.
 */
export const tryActivateDoubleEviction =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState();

    if (!settings.sim.enableTwists) return false;
    if (game.phase !== 'nominations') return false;
    // Don't activate twice in the same week
    if (game.doubleEviction?.weekActive) return false;
    // No two twists in the same week
    if (game.twistActivatedThisWeek) return false;

    const evictionsSoFar = game.players.filter(
      (p) => p.status === 'evicted' || p.status === 'jury',
    ).length;
    const alive = game.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const aliveCount = alive.length;
    const usedCount = game.doubleEviction?.usedCount ?? 0;

    // Only attempt mid-season: after 5 evictions and above final 5
    if (evictionsSoFar < 5) return false;
    if (aliveCount <= 5) return false;
    // Cap at 2 uses per season
    if (usedCount >= 2) return false;

    const chance = settings.sim.doubleEvictionChance ?? 35;

    // Use a twist-specific RNG offset so this roll is independent of the main
    // game seed sequence and does not perturb future HOH/POV/vote outcomes.
    const rng = mulberry32((game.seed ^ 0xde1cef01) >>> 0);
    const roll = rng() * 100; // [0, 100)

    if (roll >= chance) return false;

    dispatch(activateDoubleEviction());
    return true;
  };

/**
 * Attempt to activate a special safety twist after the POV winner is determined.
 *
 * Activation rules:
 *  - `settings.sim.enableTwists` must be true
 *  - current phase must be `pov_results`
 *  - at least 5 evictions must have happened this season
 *  - at least 6 alive players (above final 5)
 *  - not a Double Eviction week
 *  - no other twist has already activated this week (`twistActivatedThisWeek`)
 *  - the season must not already have had a special safety activated
 *
 * If eligible, rolls `settings.sim.specialSafetyChance` (0-100, default 25) and
 * picks a random safety type deterministically.
 *
 * Note: the thunk/function name and `specialVeto` state key remain legacy internal
 * identifiers for compatibility, even though the user-facing terminology is Safety.
 *
 * Returns `true` if activated, `false` otherwise.
 */
export const tryActivateSpecialVeto =
  () =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, settings } = getState();

    if (!settings.sim.enableTwists) return false;
    if (game.phase !== 'pov_results') return false;
    if (game.doubleEviction?.weekActive) return false;
    // No two twists in the same week
    if (game.twistActivatedThisWeek) return false;
    if (game.specialVeto?.seasonUsed) return false;

    const alive = game.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    if (alive.length <= 5) return false;

    // Only attempt mid-season: after 5 evictions
    const evictionsSoFar = game.players.filter(
      (p) => p.status === 'evicted' || p.status === 'jury',
    ).length;
    if (evictionsSoFar < 5) return false;

    const chance = settings.sim.specialSafetyChance ?? 25;
    // Use a twist-specific RNG offset so this roll is independent of the main game seed
    // sequence and does not perturb future HOH/POV/vote outcomes.
    const SPECIAL_VETO_RNG_SALT = 0x5e7c7074; // arbitrary constant distinguishing this roll from others
    const rngSpecial = mulberry32(((game.seed ^ SPECIAL_VETO_RNG_SALT) >>> 0));
    const roll = rngSpecial() * 100;

    if (roll >= chance) return false;

    // Deterministically pick one of the 4 veto types
    const types: SpecialVetoType[] = ['vip', 'diamond', 'coup', 'spotlight'];
    const typeRoll = rngSpecial();
    const chosenType = types[Math.floor(typeRoll * types.length)];

    dispatch(activateSpecialVeto({ type: chosenType, week: game.week }));
    return true;
  };
