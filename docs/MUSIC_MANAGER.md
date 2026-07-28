# Music Manager

The Music Manager is the declarative policy layer for background music and configurable event sounds. Playback still flows through one `SoundManager` BGM channel; components do not own background tracks directly.

## Runtime pipeline

1. Redux and route state form a music context: game mode, phase, finale scene, active minigame and minigame stage, social state and spectator state.
2. `resolveDesiredMusicCue` resolves one semantic cue from the effective music configuration.
3. `AudioStateSync` reconciles the cue, including managed minigame fade-in, results hold and fade-out behavior.
4. `SoundManager` selects an asset, applies runtime fallback and owns playback.

The MinigameHost publishes its real lifecycle to Redux as `rules`, `countdown`, `playing` and `results`. Music routing must never depend on CSS selectors or mounted-screen detection.

## Configuration precedence

Assignment maps are layered in this order:

1. bundled defaults;
2. validated server assignments;
3. local Advanced Settings assignments.

Track assets are layered separately:

1. bundled asset;
2. legacy remote competition URL;
3. remote semantic track URL;
4. local semantic track URL.

Later layers win for the same semantic key. Removing a local override exposes the server or bundled value again.

## Cue resolution priority

The first non-inherited assignment wins:

1. explicit cinematic/finale scene;
2. completed finale context;
3. game-over route;
4. mode-specific minigame-stage assignment;
5. shared minigame-stage assignment;
6. minigame profile;
7. minigame category policy;
8. spectator context;
9. social context;
10. mode-specific or shared game phase;
11. configured fallback;
12. emergency silence.

`inherit`, `silence` and an absent assignment are intentionally different:

- `inherit` records an explicit decision to continue down the resolution chain;
- `silence` stops resolution and deliberately returns no BGM;
- an absent local assignment leaves the server or bundled layer unchanged.

## Redux state compatibility

Bundled policy documents may expose read-only collections, but server and local override documents are normalized into mutable, serializable data before they enter Redux. This keeps the configuration compatible with Immer drafts without weakening the read-only contract of the shipped defaults.

## Asset fallback

When a remote or local URL fails to load or decode, `SoundManager` does not permanently silence the phase. It attempts:

1. the configured semantic override;
2. the bundled asset for the same semantic track;
3. each semantic fallback declared in `musicCatalog.ts`;
4. silence only after all candidates fail.

Stale errors from a previously reused audio element are ignored and cannot poison a newer track.

## Remote JSON example

```json
{
  "season": {
    "music": {
      "tracks": [
        {
          "track": "competition",
          "src": "https://cdn.example.com/music/competition.mp3",
          "volume": 0.5,
          "loop": true
        }
      ],
      "assignments": {
        "modePhaseOverrides": {
          "survival": {
            "nominations": { "kind": "track", "track": "nominations" }
          }
        },
        "minigameAssignments": {
          "any": {
            "batteryLow": {
              "rules": { "kind": "silence" },
              "countdown": { "kind": "silence" },
              "playing": { "kind": "track", "track": "challenge_group_1" },
              "results": { "kind": "silence" }
            }
          }
        },
        "eventSounds": {
          "finale.winner": {
            "soundKey": "tv:winner_reveal",
            "volume": 1
          }
        }
      }
    }
  }
}
```

Only HTTP and HTTPS asset URLs are accepted. Unknown tracks, phases, scenes, events and unsafe object keys are discarded. Volumes are clamped to `0–1`; transition durations are clamped to the supported range.

## Advanced Settings

The Music Manager tab supports:

- separate Classic and Survival phase assignments;
- per-minigame assignments for rules, countdown, playing, results and done stages;
- semantic event-sound assignment and volume;
- semantic track URL overrides and preview;
- source badges for bundled, server and local values;
- configuration audit;
- validated JSON import/export;
- reset of local overrides without deleting server configuration.

## Adding a track

1. Add the semantic track to `musicCatalog.ts` with its bundled sound metadata and fallback chain.
2. Reference the semantic ID from configuration; do not route raw filenames from components.
3. Add resolver/audit coverage for any new policy behavior.
4. Verify missing and invalid asset behavior as well as normal playback.

## Adding a minigame

Every active minigame must resolve through at least one deliberate policy:

- an explicit mode/stage assignment;
- a shared stage assignment;
- a minigame profile; or
- an explicit category inheritance policy.

The audit should report a newly registered active game if none of those policies exists.
