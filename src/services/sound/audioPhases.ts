/**
 * audioPhases.ts — Formal phase model for the BBMobile New audio system.
 *
 * This file is the single authoritative source of truth for:
 *  - every named audio phase in the application
 *  - the music track associated with each phase
 *  - the minigame sub-phases and their dedicated tracks
 *  - transition rules and edge-case policies
 *
 * Architecture summary
 * ────────────────────
 * Music is resolved from the **current audio phase and route**. The resolution
 * pipeline is:
 *
 *   Redux state (game.phase, challenge.pending, social, ui.musicScene) + route
 *       │
 *       ▼
 *   resolveDesiredMusic()          ← pure function, no side effects
 *       │  returns MusicTrack
 *       ▼
 *   AudioStateSync (React component)
 *       │  calls SoundManager.setDesiredMusic(track)
 *       ▼
 *   SoundManager                   ← single BGM channel, SFX pools
 *
 * The phase-to-track map here is the reference implementation; the actual
 * runtime resolution lives in resolveDesiredMusic.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE HIERARCHY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ┌─ INTRO FLOW ──────────────────────────────────────────────────────────────┐
 * │  splash              App open / KolequantSplash animation                 │
 * │  intro_hub           Home hub after splash, before Play is pressed        │
 * │  intro_hub_rules     /rules sub-module                                    │
 * │  intro_hub_profile   /profile sub-module                                  │
 * │  intro_hub_houseguests /houseguests sub-module                            │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ GAMEPLAY FLOW ────────────────────────────────────────────────────────────┐
 * │  week_start          Week begins — no music                               │
 * │  loh_comp            LOH competition in progress                         │
 * │  loh_results         LOH competition results                             │
 * │  nominations         LOH nomination ceremony                             │
 * │  nomination_results  Nominees displayed on screen                        │
 * │  pre_veto_public_save  Pre-veto public save decision (skipped if unused) │
 * │  pos_comp            POS / veto competition in progress                  │
 * │  pos_results         POS competition results                             │
 * │  pos_ceremony        POS / veto ceremony (save or no-save decision)      │
 * │  pos_ceremony_results  POS ceremony results screen                       │
 * │  social              Social module open (panel or inbox)                 │
 * │  minigame            Active competition minigame (sub-tracks per game)   │
 * │    ├─ riskWheel      Risk Wheel                                          │
 * │    ├─ glass_bridge_brutal / crystal_path_shattered  Glass Bridge         │
 * │    ├─ quickTap / laneRacers / memoryMatch           Quick Tap family     │
 * │    └─ wildcardWestern                               Wildcard Western     │
 * │  live_vote           Live eviction vote       (Safety music ducked)      │
 * │  eviction_results    Eviction cinematic       (Safety music ducked)      │
 * │  week_end            Week wrap-up              (Safety music resumes)     │
 * │  final4_eviction     Final 4 POS holder sole vote                        │
 * │  final3_comp*        Final 3 competition minigames (week_end after)      │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FINALE FLOW ──────────────────────────────────────────────────────────────┐
 * │  finale_pre_voting   game.phase === 'jury', before FinalFaceoff starts   │
 * │  tribunal_part1      FinalFaceoff 'clues' act — hidden votes / juror msgs│
 * │  finale_recap        FinalFaceoff 'recap' act — SeasonRecapCinematic     │
 * │  tribunal_part2      FinalFaceoff 'revealVotes' act — votes revealed     │
 * │  public_voting       SeasonFinaleOverlay public favourite vote           │
 * │  season_complete     Season complete / game-over screen                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SPLASH PHASE RULES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. The `splash` phase corresponds to the KolequantSplash animation shown
 *     on true app-open (or on first HomeHub mount when the splash has not yet
 *     been dismissed for the current gameId).
 *  2. Splash is silent; normal Intro Hub routes use the centrally managed
 *     `introhub` track.
 *  3. Cinematic overlays such as Hubmates take their own audio ownership.
 *  4. If the user returns via the home button during gameplay, they arrive at
 *     `intro_hub` not `splash` — the splash gate is only crossed once per
 *     session.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDIO PHASE TRANSITION RULES
 * ─────────────────────────────────────────────────────────────────────────────
 *  A. ONE ACTIVE PHASE AT A TIME — resolveDesiredMusic returns a single
 *     MusicTrack; the SoundManager enforces a single BGM channel.
 *  B. MUSIC BELONGS TO THE PHASE, NOT THE SCREEN — components must not play
 *     music directly.  All BGM must flow through AudioStateSync →
 *     resolveDesiredMusic → SoundManager.setDesiredMusic.
 *  C. PHASE EXIT KILLS OLD MUSIC — when resolveDesiredMusic returns a
 *     different track the SoundManager replaces the BGM element.
 *  D. NO CROSS-PHASE MUSIC REUSE — a track associated with a finished phase
 *     cannot be re-triggered from an unrelated phase.
 *  E. SUBMODULES DO NOT OVERRIDE PHASE MUSIC — houseguests / profile / rules
 *     are intro sub-modules but must not independently start new music.
 *  F. MINIGAME AUDIO IS SUB-PHASE-SCOPED — while challenge.pending.phase ===
 *     'playing' the resolver returns the minigame-specific track regardless of
 *     the game phase.  When the minigame ends the resolver falls through to the
 *     parent phase track.
 *  G. SOCIAL AUDIO IS A SILENCE FALLBACK — opening social.panelOpen or
 *     social.incomingInboxOpen preserves an active phase track. The social
 *     theme starts only when the underlying phase has no music.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SFX (ONE-SHOT SOUNDS) — handled by soundMiddleware.ts, NOT this module
 * ─────────────────────────────────────────────────────────────────────────────
 *  SFX are separate from phase music and are not gated by the phase model.
 *  They are triggered by specific Redux actions:
 *    loh_results / pos_results     → tv:event
 *    pos_ceremony                  → tv:veto_ceremony
 *    live_vote                     → tv:voting_eviction
 *    game/setEvictionOverlay(id)   → player:evicted  (null→id only, deduped)
 *    game/completeMinigame         → minigame:results
 *    game/applyMinigameWinner      → ui:confirm
 *    game/skipMinigame             → ui:error
 *    game/submitHumanVote          → ui:navigate
 *    game/activateBattleBack       → tv:battleback
 *    finale/castVote               → ui:jury_vote
 *    game/startWinnerCinematic     → tv:winner_reveal
 *    loh_comp / pos_comp (start)   → minigame:start
 */

import type { MusicTrack } from './musicTracks'

// ─── Phase type ───────────────────────────────────────────────────────────────

/**
 * Every named audio phase in the application.
 *
 * Not all phases map to a music track; some are silent (track = 'none').
 * The complete track mapping is in {@link AUDIO_PHASE_MUSIC_MAP}.
 */
export type AppAudioPhase =
  // ── Intro flow ──────────────────────────────────────────────────────────────
  /** True splash entry: KolequantSplash animation on app open. */
  | 'splash'
  /** Home hub screen after splash dismisses, before Play is pressed. */
  | 'intro_hub'
  /** /rules sub-module — within intro flow, no independent music. */
  | 'intro_hub_rules'
  /** /profile sub-module — within intro flow, no independent music. */
  | 'intro_hub_profile'
  /** /houseguests sub-module — within intro flow, no independent music. */
  | 'intro_hub_houseguests'

  // ── Gameplay flow ────────────────────────────────────────────────────────────
  /** Week begins; no music. */
  | 'week_start'
  /** LOH competition in progress. */
  | 'loh_comp'
  /** LOH competition results screen. */
  | 'loh_results'
  /** LOH nomination ceremony. */
  | 'nominations'
  /** Nominated players shown on screen. */
  | 'nomination_results'
  /** Pre-veto public save decision (skipped unless public mode active). */
  | 'pre_veto_public_save'
  /** POS (Power of Salvation) competition in progress. */
  | 'pos_comp'
  /** POS competition results screen. */
  | 'pos_results'
  /** POS ceremony — holder decides to save or not. */
  | 'pos_ceremony'
  /** POS ceremony results shown. */
  | 'pos_ceremony_results'
  /** Social module panel or inbox open. */
  | 'social'
  /**
   * Minigame competition active.
   * Each minigame type has its own dedicated music track — see
   * {@link MINIGAME_KEY_TO_AUDIO_PHASE} and resolveDesiredMusic.ts for the
   * per-key mapping.
   */
  | 'minigame'
  /** Live eviction vote (stinger only; no looping BGM). */
  | 'live_vote'
  /** Eviction cinematic and results (stinger only; no looping BGM). */
  | 'eviction_results'
  /** Week wrap-up boundary; no music. */
  | 'week_end'
  /** Final-4: POS holder has sole eviction vote. */
  | 'final4_eviction'
  /** Spectator mode active (replaying a previous season). */
  | 'spectator'

  // ── Finale flow ──────────────────────────────────────────────────────────────
  /**
   * game.phase === 'jury' but FinalFaceoff has not yet started its UI.
   * Brief transitional window; shares the jury_voting atmosphere.
   */
  | 'finale_pre_voting'
  /**
   * FinalFaceoff 'clues' act: jurors send cryptic messages without revealing
   * their votes.  Dispatch ui.musicScene = 'tribunal_part1' to enter this
   * phase.
   */
  | 'tribunal_part1'
  /**
   * FinalFaceoff 'recap' act: SeasonRecapCinematic plays.
   * Uses the dedicated season recap background track.
   */
  | 'finale_recap'
  /**
   * FinalFaceoff 'revealVotes' act: vote chips animate in, tally revealed,
   * winner crowned, houseguests interviewed.
   * Dispatch ui.musicScene = 'jury_voting' to enter this phase.
   */
  | 'tribunal_part2'
  /**
   * SeasonFinaleOverlay public favourite vote flow
   * (publicFavoriteSetup / publicFavoriteFlow phases).
   * Uses the dedicated public-voting background track.
   */
  | 'public_voting'
  /** Season fully complete; game-over screen uses the final modal cue. */
  | 'season_complete'

// ─── Phase → MusicTrack map ───────────────────────────────────────────────────

/**
 * Reference mapping from every {@link AppAudioPhase} to its desired
 * {@link MusicTrack}.
 *
 * Phases not listed here (or mapped to 'none') are silent.
 *
 * NOTE: This map is documentation/reference only.  The actual runtime
 * resolution is performed by resolveDesiredMusic.ts which reads Redux state
 * and the URL hash rather than a standalone phase enum.
 */
export const AUDIO_PHASE_MUSIC_MAP: Readonly<Record<AppAudioPhase, MusicTrack>> = {
  // Intro flow
  splash: 'none',
  intro_hub: 'introhub',
  intro_hub_rules: 'introhub',
  intro_hub_profile: 'introhub',
  intro_hub_houseguests: 'none',

  // Gameplay flow — competition
  week_start: 'none',
  loh_comp: 'competition',
  loh_results: 'competition',
  nominations: 'nominations',
  nomination_results: 'nominations',
  pre_veto_public_save: 'nominations',
  pos_comp: 'competition',
  pos_results: 'competition',
  pos_ceremony: 'veto',
  pos_ceremony_results: 'veto',

  // Gameplay flow — special
  social: 'social',
  minigame: 'none', // sub-tracks handled by resolveDesiredMusic per challenge key
  live_vote: 'veto', // continues Safety Ceremony music, ducked under voting
  eviction_results: 'veto', // continues ducked under the elimination reveal
  week_end: 'veto', // resumes for the day-end message, then fades at day start
  final4_eviction: 'none',
  spectator: 'spectator',

  // Finale flow
  finale_pre_voting: 'jury_voting',
  tribunal_part1: 'jury_voting',
  finale_recap: 'season_recap',
  tribunal_part2: 'jury_voting',
  public_voting: 'public_voting',
  season_complete: 'final_modal',
}

// ─── Minigame sub-phase → audio track ─────────────────────────────────────────

/**
 * Maps a minigame challenge key (challenge.pending.game.key) to the
 * {@link AppAudioPhase} it belongs to while playing.
 *
 * This table is purely for documentation; the runtime mapping is inside
 * resolveDesiredMusic.ts / trackForMinigame().
 */
export const MINIGAME_KEY_TO_AUDIO_PHASE: Readonly<Record<string, AppAudioPhase>> = {
  riskWheel: 'minigame', // track: risk_wheel
  glass_bridge_brutal: 'minigame', // track: glass_bridge
  crystal_path_shattered: 'minigame', // track: glass_bridge (shared asset)
  quickTap: 'minigame', // track: quick_tap
  laneRacers: 'minigame', // track: quick_tap (shared asset)
  memoryMatch: 'minigame', // track: quick_tap (shared asset)
  wildcardWestern: 'minigame', // track: wildcard_western
}

// ─── Hooks and components that call into the audio manager ────────────────────

/**
 * Audio entry-points — which component/hook is responsible for each audio
 * action.  This table is for documentation only.
 *
 * | Entry-point                    | What it does                                        |
 * |-------------------------------|-----------------------------------------------------|
 * | AudioStateSync (React)         | Subscribes to Redux, calls setDesiredMusic on change |
 * | resolveDesiredMusic (pure fn)  | Determines desired MusicTrack from state + hash      |
 * | soundMiddleware (Redux)        | Fires one-shot SFX on specific Redux actions         |
 * | FinalFaceoff (React)           | Dispatches setMusicScene for finale acts             |
 * | HomeHub / handlePlay (React)   | Calls SoundManager.unlockFromGesture before gameplay  |
 * | cinematicAudio (module)        | Manages SeasonRecapCinematic audio outside SoundManager|
 */
export const _AUDIO_ENTRY_POINTS = undefined // documentation-only export
