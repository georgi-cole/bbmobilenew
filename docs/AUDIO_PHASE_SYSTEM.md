# Audio Phase System — BBMobile New

> **Last updated:** 2025-Q2  
> **Authoritative code reference:** `src/services/sound/audioPhases.ts`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase Hierarchy](#phase-hierarchy)
3. [Phase Details — Intro Flow](#phase-details--intro-flow)
4. [Phase Details — Gameplay Flow](#phase-details--gameplay-flow)
5. [Phase Details — Finale Flow](#phase-details--finale-flow)
6. [Audio Entry-Points](#audio-entry-points)
7. [Phase Transition Rules](#phase-transition-rules)
8. [SFX Policy (One-Shot Sounds)](#sfx-policy-one-shot-sounds)
9. [Minigame Sub-Phases](#minigame-sub-phases)
10. [Edge Cases and Notable Rules](#edge-cases-and-notable-rules)
11. [Track Registry Reference](#track-registry-reference)

---

## Architecture Overview

Music in BBMobile New is **phase-gated** — the active background music track is determined entirely by the current phase of the application, not by which screen happens to be mounted.

### Resolution Pipeline

```
Redux state
  game.phase                (gameplay phase)
  challenge.pending         (active minigame)
  social.panelOpen          (social module)
  ui.musicScene             (special scene override)
  game.spectatorActive      (spectator mode)
       │
       ▼
resolveDesiredMusic()       ← pure function, no side effects
  (src/services/sound/resolveDesiredMusic.ts)
       │  returns MusicTrack
       ▼
AudioStateSync              ← React component (no DOM)
  (src/services/sound/AudioStateSync.tsx)
       │  calls SoundManager.setDesiredMusic(track)
       ▼
SoundManager                ← singleton BGM channel + SFX pools
  (src/services/sound/SoundManager.ts)
```

### Resolution Priority (Highest → Lowest)

| Priority | Source | Condition |
|----------|--------|-----------|
| 1 | `ui.musicScene` override | scene ≠ 'none' and scene resolves to a non-none track |
| 2 | Minigame | `challenge.pending.phase === 'playing'` |
| 3 | Spectator mode | `game.spectatorActive` is truthy |
| 4 | Social module | `social.panelOpen` or `social.incomingInboxOpen` |
| 5 | Game phase | Matched against COMPETITION / NOMINATION / VETO phase sets |
| 6 | Intro hub | `canPlayIntroHubMusic === true` AND `hash === '#/'` |
| 7 | Fallback | `'none'` (silence) |

---

## Phase Hierarchy

```
╔═══════════════════════════════════════════════════════════════════════╗
║  INTRO FLOW                                                           ║
║  ─────────────────────────────────────────────────────────────────── ║
║  splash                 ← app open / KolequantSplash animation        ║
║  intro_hub              ← home hub, after splash, before Play         ║
║  intro_hub_rules        ← /rules sub-module                           ║
║  intro_hub_profile      ← /profile sub-module                         ║
║  intro_hub_houseguests  ← /houseguests sub-module                     ║
╠═══════════════════════════════════════════════════════════════════════╣
║  GAMEPLAY FLOW                                                        ║
║  ─────────────────────────────────────────────────────────────────── ║
║  week_start             ← week begins                                 ║
║  loh_comp               ← LOH competition in progress                 ║
║  loh_results            ← LOH competition results                     ║
║  nominations            ← LOH nomination ceremony                     ║
║  nomination_results     ← nominees displayed                          ║
║  pre_veto_public_save   ← pre-veto public save (optional)             ║
║  pos_comp               ← POS competition in progress                 ║
║  pos_results            ← POS competition results                     ║
║  pos_ceremony           ← POS ceremony (save or no-save)              ║
║  pos_ceremony_results   ← POS ceremony results                        ║
║  social                 ← social module panel / inbox                 ║
║  minigame               ← active competition minigame                 ║
║    ├─ riskWheel         ←   Risk Wheel (track: risk_wheel)            ║
║    ├─ glass_bridge_*    ←   Glass Bridge family (track: glass_bridge) ║
║    ├─ quickTap / …      ←   Quick Tap family (track: quick_tap)       ║
║    └─ wildcardWestern   ←   Wildcard Western (track: wildcard_western)║
║  live_vote              ← live eviction vote (SFX only)               ║
║  eviction_results       ← eviction cinematic (SFX only)               ║
║  week_end               ← week wrap-up boundary                       ║
║  final4_eviction        ← Final-4 POS holder sole vote                ║
║  spectator              ← spectator mode (season replay)              ║
╠═══════════════════════════════════════════════════════════════════════╣
║  FINALE FLOW                                                          ║
║  ─────────────────────────────────────────────────────────────────── ║
║  finale_pre_voting      ← game.phase === 'jury', before FinalFaceoff ║
║  tribunal_part1         ← FinalFaceoff 'clues' act (hidden votes)     ║
║  finale_recap           ← FinalFaceoff 'recap' act (SeasonRecap)      ║
║  tribunal_part2         ← FinalFaceoff 'revealVotes' act              ║
║  public_voting          ← SeasonFinaleOverlay public-favourite flow   ║
║  season_complete        ← game-over / season complete                 ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## Phase Details — Intro Flow

### `splash`

| Field | Value |
|-------|-------|
| **Purpose** | True app-open splash animation (KolequantSplash component). |
| **Screens / modules** | `KolequantSplash` overlay within `HomeHub`. |
| **Entry trigger** | `HomeHub` mounts AND `hasSeenHomeHubSplashForGame(gameId)` returns false. |
| **Exit trigger** | `KolequantSplash.onFinish` fires (~1.2 s after mount); calls `markHomeHubSplashSeenForGame(gameId)`. |
| **Audio track** | `introhub` (`music:intro_hub_loop`) |
| **BGM mechanism** | `resolveDesiredMusic` returns `'introhub'` when `hash === '#/'` AND `canPlayIntroHubMusic === true`. |
| **Notes** | There is no separate audio state for "splash vs. intro hub" — both share `introhub` music. The splash is a visual overlay; the HomeHub (and its music) is already active behind it. |

---

### `intro_hub`

| Field | Value |
|-------|-------|
| **Purpose** | Home hub screen — the main entry point after the splash dismisses. |
| **Screens / modules** | `HomeHub` component at route `'/'` (hash `#/`). |
| **Entry trigger** | Splash dismissed OR user navigates back to `#/`. |
| **Exit trigger** | User presses **Play** (calls `markHomeHubGameStarted(gameId)`) OR navigates to a sub-module. |
| **Audio track** | `introhub` (`music:intro_hub_loop`) — only while hash is `#/` AND `canPlayIntroHubMusic` is true. |
| **Music block** | Once **Play** is pressed, `canPlayIntroHubMusic` becomes false for the rest of the session. Returning to `#/` via the home button will NOT restart the intro-hub track. |

---

### `intro_hub_rules`, `intro_hub_profile`, `intro_hub_houseguests`

| Field | Value |
|-------|-------|
| **Purpose** | Informational sub-modules accessible from the intro hub. |
| **Screens** | `/rules`, `/profile`, `/houseguests`. |
| **Audio track** | `none` — these routes change the hash away from `#/` so the intro-hub gate fails. |
| **Notes** | These sub-modules are within the intro flow conceptually but do not restart or continue intro-hub music. They are silent unless a future track is intentionally assigned. |

---

## Phase Details — Gameplay Flow

### `week_start` / `week_end`

| Field | Value |
|-------|-------|
| **Purpose** | Week boundary markers. |
| **Audio track** | `none` |
| **Notes** | These phases act as clean resets between gameplay phases. |

---

### `loh_comp` / `loh_results`

| Field | Value |
|-------|-------|
| **Purpose** | Lord/Lady of the House competition and its results screen. |
| **Entry trigger** | `game/advance` transitions game phase to `loh_comp`. |
| **SFX on entry** | `minigame:start` SFX plays when `loh_comp` begins. |
| **SFX on results** | `tv:event` stinger plays when phase transitions to `loh_results`. |
| **Audio track** | `competition` (`music:hoh_comp_general`) for both phases. |

---

### `nominations` / `nomination_results`

| Field | Value |
|-------|-------|
| **Purpose** | LOH nomination ceremony and nominated players display. |
| **Entry trigger** | `game/advance` to `nominations`. |
| **Audio track** | `nominations` (`music:nominations_main`) for both phases. |

---

### `pre_veto_public_save`

| Field | Value |
|-------|-------|
| **Purpose** | Public save decision before the veto competition (public mode only). |
| **Audio track** | `nominations` (same as nomination phase — no jarring transition). |
| **Notes** | Skipped unless `publicModeEnabled === true` and not a double eviction week. |

---

### `pos_comp` / `pos_results`

| Field | Value |
|-------|-------|
| **Purpose** | Power of Salvation (veto) competition and results. |
| **Entry trigger** | `game/advance` to `pos_comp`. |
| **SFX on entry** | `minigame:start` SFX plays when `pos_comp` begins. |
| **SFX on results** | `tv:event` stinger plays on `pos_results`. |
| **Audio track** | `competition` (`music:hoh_comp_general`) for both phases. |

---

### `pos_ceremony` / `pos_ceremony_results`

| Field | Value |
|-------|-------|
| **Purpose** | POS holder decides whether to save a nominee; results displayed. |
| **Entry trigger** | `game/advance` to `pos_ceremony`. |
| **SFX on entry** | `tv:veto_ceremony` stinger plays on `pos_ceremony` start only. |
| **Audio track** | `veto` (`music:veto_phase`) for both phases. |
| **Notes** | The stinger plays only on `pos_ceremony`, not on `pos_ceremony_results`, to avoid double-playing. |

---

### `social`

| Field | Value |
|-------|-------|
| **Purpose** | Social module — outgoing message panel or incoming inbox. |
| **Entry trigger** | `social/openSocialPanel` or `social/openIncomingInbox`. |
| **Exit trigger** | `social/closeSocialPanel` or `social/closeIncomingInbox`. |
| **Audio track** | `social` (`music:social_module`). |
| **Priority** | Overrides spectator and game-phase music (but not minigame or scene overrides). |
| **Notes** | When the panel closes, the resolver falls back to the parent game-phase track automatically. |

---

### `minigame`

| Field | Value |
|-------|-------|
| **Purpose** | Active competition minigame. |
| **Entry trigger** | `challenge.pending.phase === 'playing'`. |
| **Exit trigger** | `game/completeMinigame` or `game/skipMinigame`. |
| **SFX on complete** | `minigame:results` plays. |
| **SFX on skip** | `ui:error` plays. |
| **Audio track** | Determined per-game by `trackForMinigame(gameKey)` — see [Minigame Sub-Phases](#minigame-sub-phases). |

---

### `live_vote`

| Field | Value |
|-------|-------|
| **Purpose** | Live eviction vote — houseguests cast their votes. |
| **Entry trigger** | `game/advance` to `live_vote`. |
| **SFX** | `tv:voting_eviction` stinger (one-shot, no looping BGM). |
| **Audio track** | `none` — silence during the vote reveal. |

---

### `eviction_results`

| Field | Value |
|-------|-------|
| **Purpose** | Eviction cinematic showing who was evicted. |
| **Entry trigger** | `game/setEvictionOverlay(playerId)` — deferred until the cinematic actually begins. |
| **SFX** | `player:evicted` — plays on null→id overlay transition only. |
| **Audio track** | `none` — the dramatic silence is intentional during the eviction. |
| **Dedup guard** | `_lastEvictionSfxId` in soundMiddleware prevents the SFX from double-playing (React StrictMode, Battle Back return). |
| **Battle Back** | If `battleBack.used === true` and `battleBack.winnerId === playerId`, the eviction SFX is suppressed (it's a return, not an eviction). |

---

### `final4_eviction`

| Field | Value |
|-------|-------|
| **Purpose** | Final-4 special eviction where the POS holder has the sole vote. |
| **Audio track** | `none` — same treatment as regular eviction. |

---

### `spectator`

| Field | Value |
|-------|-------|
| **Purpose** | Spectator mode — the user is watching a replayed previous season. |
| **Entry trigger** | `game.spectatorActive` becomes truthy. |
| **Audio track** | `spectator` (`music:spectator_loop`). |

---

## Phase Details — Finale Flow

### How Finale Phases Map to Redux

The finale uses two mechanisms to signal the audio phase:

| Finale Phase | Redux Mechanism | Value Set |
|---|---|---|
| `finale_pre_voting` | `game.phase === 'jury'` (before FinalFaceoff starts) | Handled by game-phase flow |
| `tribunal_part1` | `ui.musicScene` | `'tribunal_part1'` |
| `finale_recap` | `ui.musicScene` | `'season_recap'` |
| `tribunal_part2` | `ui.musicScene` | `'jury_voting'` |
| `public_voting` | `ui.musicScene` | `'public_voting'` |

---

### `finale_pre_voting`

| Field | Value |
|-------|-------|
| **Purpose** | Brief transitional window when `game.phase === 'jury'` but before FinalFaceoff has initialised its UI. |
| **Screens / modules** | `AppShell` showing `FinalFaceoff`; `finaleSlice.isActive === false` still. |
| **Audio track** | `jury_voting` — the tribunal atmosphere begins immediately on phase entry. |
| **Entry trigger** | `game/advance` transitions `week_end → jury`. |
| **Notes** | This phase is very brief (milliseconds before FinalFaceoff renders). The jury_voting track provides continuous atmosphere into `tribunal_part1`. |

---

### `tribunal_part1`

| Field | Value |
|-------|-------|
| **Purpose** | FinalFaceoff **'clues' act** — jurors send cryptic messages without revealing their votes. No vote chips are shown. |
| **Screens / modules** | `FinalFaceoff` component, internal `phase === 'clues'`. |
| **Audio track** | `jury_voting` (`music:jury_voting_bg`) |
| **Entry trigger** | `FinalFaceoff` mounts and `phase === 'clues'` → dispatches `setMusicScene('tribunal_part1')`. |
| **Exit trigger** | All clues revealed → `phase` advances to `'recap'` → dispatches `setMusicScene('season_recap')`. |
| **Notes** | Previously this act had no music (`setMusicScene('none')`). The `tribunal_part1` scene was added to provide atmospheric continuity from finale entry through to the vote reveal. |

---

### `finale_recap`

| Field | Value |
|-------|-------|
| **Purpose** | FinalFaceoff **'recap' act** — `SeasonRecapCinematic` plays, showing "Road to the Final" highlights. |
| **Screens / modules** | `SeasonRecapCinematic` component within `FinalFaceoff`. |
| **Audio track** | `season_recap` (`music:season_recap` → `tribunal_phase/season_recap_music_new.mp3`) |
| **Entry trigger** | All clue timers done → `setPhase('recap')` → dispatches `setMusicScene('season_recap')`. |
| **Exit trigger** | `SeasonRecapCinematic.onComplete` fires → `setPhase('revealVotes')`. |
| **Notes** | `music:season_recap` (`tribunal_phase/season_recap_music_new.mp3`) is resolved centrally via `ui.musicScene = 'season_recap'`, so the recap plays only that track and replaces any prior phase music. |

---

### `tribunal_part2`

| Field | Value |
|-------|-------|
| **Purpose** | FinalFaceoff **'revealVotes' act** — vote chips animate in one-by-one, final tally shown, winner crowned, houseguests interviewed. |
| **Screens / modules** | `FinalFaceoff` (revealVotes state), `SeasonFinaleOverlay` (winnerCinematic, winnerInterview). |
| **Audio track** | `jury_voting` (`music:jury_voting_bg`) |
| **Entry trigger** | `SeasonRecapCinematic.onComplete` → `setPhase('revealVotes')` → dispatches `setMusicScene('jury_voting')`. |
| **Exit trigger** | `persistWinnerToSeasonFinale()` → dispatches `setMusicScene('none')` + `SoundManager.stopAllMusic()`. |
| **SFX** | `ui:tribunal_vote_reveal` plays for each vote chip; `finale/castVote` plays `ui:jury_vote`; `game/startWinnerCinematic` plays `tv:winner_reveal`. |

---

### `public_voting`

| Field | Value |
|-------|-------|
| **Purpose** | `SeasonFinaleOverlay` public-favourite vote flow — audience votes for their favourite houseguest. |
| **Screens / modules** | `SeasonFinaleOverlay` (`publicFavoriteSetup`, `publicFavoriteFlow` phases). |
| **Audio track** | `public_voting` (`music:public_voting`) |
| **Entry trigger** | `SeasonFinaleOverlay` enters `publicFavoriteSetup` or `publicFavoriteFlow` → dispatches `setMusicScene('public_voting')`. |
| **Notes** | Music continues through the winner reveal card and stops when the public-favourite modal is dismissed. |

---

### `season_complete`

| Field | Value |
|-------|-------|
| **Purpose** | Season fully complete; app navigates to game-over screen. |
| **Screens / modules** | `GameOver` screen at `/game-over`. |
| **Audio track** | `final_modal` (`music:final_modal`) while the URL hash is `#/game-over`. |
| **Notes** | The cue stops when the player leaves the game-over screen or when the non-looping track finishes. |

---

## Audio Entry-Points

The following table lists every component, hook, or module that interacts with the audio system.

| Entry-point | File | What it does |
|-------------|------|-------------|
| `AudioStateSync` | `src/services/sound/AudioStateSync.tsx` | Subscribes to Redux state; calls `SoundManager.setDesiredMusic(track)` whenever `resolveDesiredMusic` returns a new result. Also listens to `hashchange` for intro-hub gate. |
| `resolveDesiredMusic` | `src/services/sound/resolveDesiredMusic.ts` | Pure function; the single source of truth for which BGM track should be playing. |
| `soundMiddleware` | `src/store/soundMiddleware.ts` | Redux middleware; fires one-shot SFX on specific actions. Does **not** control BGM directly. |
| `FinalFaceoff` | `src/components/FinalFaceoff/FinalFaceoff.tsx` | Dispatches `setMusicScene` when switching between finale acts. |
| `HomeHub / handlePlay` | `src/screens/HomeHub/HomeHub.tsx` | Calls `markHomeHubGameStarted(gameId)` → sets `canPlayIntroHubMusic = false` permanently for this session. Also calls `SoundManager.unlockFromGesture()` on Play. |
| `SoundConsentPopup` | `src/components/SoundConsentPopup/SoundConsentPopup.tsx` | Calls `SoundManager.unlockFromGesture()` when the user grants sound consent. |
| `cinematicAudio` | `src/services/sound/cinematicAudio.ts` | Provides `createCinematicAudio()` for inline audio helpers outside SoundManager. |
| `SeasonRecapCinematic` | `src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx` | Renders the recap visuals; recap music now comes from SoundManager via `ui.musicScene = 'season_recap'`. |
| `audioSettingsSync` | `src/services/sound/audioSettingsSync.ts` | Syncs Redux settings (music enabled/volume) to SoundManager. |
| `useSound` | `src/hooks/useSound.ts` | Hook that exposes `play()`, `requestBgm()`, `releaseBgm()` to components. Components should use this hook rather than importing SoundManager directly. |

---

## Phase Transition Rules

### Rule A — One Active Phase at a Time

`resolveDesiredMusic` always returns a single `MusicTrack`. The SoundManager enforces exactly one BGM channel at a time. Competing track requests are resolved by the priority stack.

### Rule B — Music Belongs to the Phase, Not the Screen

Screens must not call `SoundManager.playMusic()` directly. All BGM must flow through `AudioStateSync → resolveDesiredMusic → setDesiredMusic`. SFX can be played via `SoundManager.play(key)` from `soundMiddleware` or `useSound`.

### Rule C — Phase Exit Kills Old Music

When `resolveDesiredMusic` returns a different track, `SoundManager.setDesiredMusic` replaces the BGM element. The old track is stopped immediately (no cross-fade in the current implementation).

### Rule D — No Cross-Phase Music Reuse (Splash Rule)

Once **Play** is pressed, `markHomeHubGameStarted(gameId)` is called. For the remainder of that game session, `canPlayIntroHubMusic === false`. Returning to `#/` via the home button will never restart the intro-hub track. This is enforced by `homeHubMusicSession.ts` + `AudioStateSync`.

### Rule E — Sub-modules Do Not Override Phase Music

`/rules`, `/profile`, `/houseguests` change the URL hash away from `#/`. The intro-hub gate in `resolveDesiredMusic` fails, returning `'none'`. They cannot start new music.

### Rule F — Minigame Audio Is Sub-Phase-Scoped

While `challenge.pending.phase === 'playing'`, the resolver overrides all game-phase, social, and spectator tracks with the minigame-specific track. When the minigame ends, the resolver falls back to the parent game-phase track.

### Rule G — Social Audio Overrides Phase Music

While the social panel or inbox is open, the `social` track plays. Phase music resumes automatically on close.

---

## SFX Policy (One-Shot Sounds)

SFX are independent of the BGM phase system. They are fired by `soundMiddleware` in response to specific Redux actions. They play on top of (or instead of) the current BGM without replacing it.

| Trigger Action | SFX Key | Notes |
|----------------|---------|-------|
| `game/advance` → `loh_comp` or `pos_comp` | `minigame:start` | Competition start jingle |
| `game/advance` → `loh_results` or `pos_results` | `tv:event` | Results stinger |
| `game/advance` → `pos_ceremony` | `tv:veto_ceremony` | Ceremony stinger (once only) |
| `game/advance` → `live_vote` | `tv:voting_eviction` | Voting stinger |
| `game/setEvictionOverlay(id)` | `player:evicted` | Null→id transition only; deduped |
| `game/completeMinigame` | `minigame:results` | Minigame end jingle |
| `game/applyMinigameWinner` | `ui:confirm` | Winner applied confirmation |
| `game/skipMinigame` | `ui:error` | Skip error tone |
| `game/submitHumanVote` | `ui:navigate` | Eviction vote cast |
| `game/activateBattleBack` | `tv:battleback` | Battle Back twist activated |
| `finale/castVote` | `ui:jury_vote` | Jury member votes |
| `game/startWinnerCinematic` | `tv:winner_reveal` | Winner revealed stinger |

---

## Minigame Sub-Phases

Each minigame has a dedicated music track. The resolver picks the track from `trackForMinigame(gameKey)` while `challenge.pending.phase === 'playing'`.

| `challenge.pending.game.key` | MusicTrack | Sound Key | File |
|---|---|---|---|
| `riskWheel` | `risk_wheel` | `music:risk_wheel_loop` | `risk_wheel_loop.mp3` |
| `glass_bridge_brutal` | `glass_bridge` | `music:gb_main` | `glassbridge/glass bridge main 1.mp3` |
| `crystal_path_shattered` | `glass_bridge` | `music:gb_main` | (shared) |
| `quickTap` | `quick_tap` | `music:quicktap_main` | `quicktap_main.mp3` |
| `laneRacers` | `quick_tap` | `music:quicktap_main` | (shared) |
| `memoryMatch` | `quick_tap` | `music:quicktap_main` | (shared) |
| `wildcardWestern` | `wildcard_western` | `music:wildcard_western_main` | `wildcard_western_main.mp3` |
| *(any other key)* | `none` | — | Silence |

---

## Edge Cases and Notable Rules

### Splash Music Permanently Blocked After Play

Once the user presses **Play**:
1. `markHomeHubGameStarted(gameId)` writes `gameId` to `localStorage` key `'bb:homeHubMusicStartedForGameId'`.
2. `AudioStateSync` reads `hasStartedHomeHubGame(gameId)` on every state update and passes `canPlayIntroHubMusic: false` to `resolveDesiredMusic`.
3. `resolveDesiredMusic` skips the intro-hub gate regardless of the URL hash.
4. **The intro-hub track can never play again for this game session**, even if the user navigates back to `#/`.

To reset this (e.g. when starting a new season via `game/resetGame`), the next `gameId` will produce a different key so `hasStartedHomeHubGame` returns `false` again.

---

### Eviction SFX Dedup

`player:evicted` can be triggered from multiple dispatch sites:
- `Final3Ceremony` explicitly dispatches `setEvictionOverlay(id)`.
- `SpotlightEvictionOverlay` also dispatches it on mount.
- React StrictMode double-invokes mount effects.

The `_lastEvictionSfxId` variable in `soundMiddleware` ensures the SFX fires only once per eviction by tracking the last ID for which it played.

---

### Battle Back Return vs. Eviction

`SpotlightEvictionOverlay` (variant `"return"`) uses the same `setEvictionOverlay` action as an eviction cinematic. The middleware checks `battleBack.used === true && battleBack.winnerId === playerId` to distinguish returns from evictions and suppresses `player:evicted` for returns.

---

### SeasonRecapCinematic Audio Routing

During the 'recap' act, `FinalFaceoff` dispatches `setMusicScene('season_recap')`. `resolveDesiredMusic` maps that to `music:season_recap`, which plays `tribunal_phase/season_recap_music_new.mp3`. When the recap completes, `setMusicScene('jury_voting')` restores the tribunal BGM channel.

---

### `music:season_recap` is Active at Runtime

The sound key `music:season_recap` (`tribunal_phase/season_recap_music_new.mp3`) is defined in `sounds.ts`, mapped by `resolveDesiredMusic.ts`, and dispatched by `FinalFaceoff` while the recap cinematic is active.

---

### Social Module Resumes Phase Music Automatically

When the social panel closes, no explicit "resume" call is needed. `resolveDesiredMusic` simply stops returning `'social'` once `panelOpen === false`, and the next `setDesiredMusic` call switches back to the parent phase track.

---

## Track Registry Reference

| MusicTrack | Sound Key | File (under `assets/sounds/`) | Used in Phases |
|---|---|---|---|
| `introhub` | `music:intro_hub_loop` | `intro_hub_loop.mp3` | splash, intro_hub |
| `spectator` | `music:spectator_loop` | `spectator_loop.mp3` | spectator |
| `social` | `music:social_module` | `Social_module.mp3` | social |
| `competition` | `music:hoh_comp_general` | `Hoh_competition_and_general_competition.mp3` | loh_comp, loh_results, pos_comp, pos_results |
| `nominations` | `music:nominations_main` | `nominations_main.mp3` | nominations, nomination_results, pre_veto_public_save |
| `veto` | `music:veto_phase` | `veto_phase.mp3` | pos_ceremony, pos_ceremony_results |
| `risk_wheel` | `music:risk_wheel_loop` | `risk_wheel_loop.mp3` | minigame (riskWheel) |
| `glass_bridge` | `music:gb_main` | `glassbridge/glass bridge main 1.mp3` | minigame (glass_bridge_*, crystal_path_*) |
| `quick_tap` | `music:quicktap_main` | `quicktap_main.mp3` | minigame (quickTap, laneRacers, memoryMatch) |
| `wildcard_western` | `music:wildcard_western_main` | `wildcard_western_main.mp3` | minigame (wildcardWestern) |
| `season_recap` | `music:season_recap` | `tribunal_phase/season_recap_music_new.mp3` | finale_recap |
| `jury_voting` | `music:jury_voting_bg` | `tribunal_phase/Jury_voting_backgound_music.mp3` | tribunal_part1, tribunal_part2, finale_pre_voting |
