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
 * Music is gated by the **current audio phase**, never by screen presence
 * alone.  The resolution pipeline is:
 *
 *   Redux state (game.phase, challenge.pending, social, ui.musicScene)
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
 * │  live_vote           Live eviction vote              (stinger only)      │
 * │  eviction_results    Eviction cinematic              (stinger only)      │
 * │  week_end            Week wrap-up — no music                             │
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
 *  2. The intro-hub music (`music:intro_hub_loop`) plays for BOTH `splash` and
 *     `intro_hub` because the same track is appropriate for both.
 *  3. Once the user presses **Play**, `markHomeHubGameStarted(gameId)` is
 *     called.  From that point forward `canPlayIntroHubMusic` resolves to
 *     `false` for the remainder of that game session.  Introhub music is
 *     permanently blocked — navigating back to the HomeHub or visiting
 *     sub-modules does NOT restart it.
 *  4. Intro-hub sub-modules (/rules, /profile, /houseguests) change the URL
 *     hash away from '#/' so they are never eligible for introhub music even
 *     before Play is pressed (the hash check in resolveDesiredMusic fails).
 *  5. If the user returns via the home button during gameplay, they arrive at
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
 *     cannot be re-triggered from an unrelated phase.  The canPlayIntroHubMusic
 *     flag enforces this for the splash/intro phases.
 *  E. SUBMODULES DO NOT OVERRIDE PHASE MUSIC — houseguests / profile / rules
 *     are intro sub-modules but must not independently start new music.
 *  F. MINIGAME AUDIO IS SUB-PHASE-SCOPED — while challenge.pending.phase ===
 *     'playing' the resolver returns the minigame-specific track regardless of
 *     the game phase.  When the minigame ends the resolver falls through to the
 *     parent phase track.
 *  G. SOCIAL AUDIO OVERRIDES PHASE MUSIC — while social.panelOpen or
 *     social.incomingInboxOpen the social track plays, then the phase track
 *     resumes when the panel closes.
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

import type { MusicTrack } from './musicTracks';

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
   * Background music is managed inline by SeasonRecapCinematic via
   * createCinematicAudio (final_recap_sound.mp3).  SoundManager BGM is
   * stopped while this phase is active (musicScene = 'none').
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
   * No dedicated BGM track — silent or ambient only.
   */
  | 'public_voting'
  /** Season fully complete; heading to the game-over screen. */
  | 'season_complete';

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
  splash:                  'introhub',
  intro_hub:               'introhub',
  intro_hub_rules:         'none',
  intro_hub_profile:       'none',
  intro_hub_houseguests:   'none',

  // Gameplay flow — competition
  week_start:              'none',
  loh_comp:                'competition',
  loh_results:             'competition',
  nominations:             'nominations',
  nomination_results:      'nominations',
  pre_veto_public_save:    'nominations',
  pos_comp:                'competition',
  pos_results:             'competition',
  pos_ceremony:            'veto',
  pos_ceremony_results:    'veto',

  // Gameplay flow — special
  social:                  'social',
  minigame:                'none', // sub-tracks handled by resolveDesiredMusic per challenge key
  live_vote:               'none', // stinger only (tv:voting_eviction), no BGM
  eviction_results:        'none', // stinger only (player:evicted), no BGM
  week_end:                'none',
  final4_eviction:         'none',
  spectator:               'spectator',

  // Finale flow
  finale_pre_voting:       'jury_voting',
  tribunal_part1:          'jury_voting',
  finale_recap:            'none',   // SeasonRecapCinematic handles its own audio
  tribunal_part2:          'jury_voting',
  public_voting:           'none',
  season_complete:         'none',
};

// ─── Minigame sub-phase → audio track ─────────────────────────────────────────

/**
 * Maps a minigame challenge key (challenge.pending.game.key) to the
 * {@link AppAudioPhase} it belongs to while playing.
 *
 * This table is purely for documentation; the runtime mapping is inside
 * resolveDesiredMusic.ts / trackForMinigame().
 */
export const MINIGAME_KEY_TO_AUDIO_PHASE: Readonly<Record<string, AppAudioPhase>> = {
  riskWheel:              'minigame', // track: risk_wheel
  glass_bridge_brutal:    'minigame', // track: glass_bridge
  crystal_path_shattered: 'minigame', // track: glass_bridge (shared asset)
  quickTap:               'minigame', // track: quick_tap
  laneRacers:             'minigame', // track: quick_tap (shared asset)
  memoryMatch:            'minigame', // track: quick_tap (shared asset)
  wildcardWestern:        'minigame', // track: wildcard_western
};

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
 * | HomeHub / handlePlay (React)   | Calls markHomeHubGameStarted → canPlayIntroHubMusic  |
 * | SoundConsentPopup (React)      | Calls SoundManager.unlockFromGesture on consent      |
 * | cinematicAudio (module)        | Manages SeasonRecapCinematic audio outside SoundManager|
 */
export const _AUDIO_ENTRY_POINTS = undefined; // documentation-only export
