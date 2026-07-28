# Automatic audio asset indexing

Audio binaries are split by playback role:

- `public/assets/music/` — background music and longer score beds. Every supported file is added to the Music Manager automatically.
- `public/assets/sounds/` — short UI, TV, player and minigame cues. Every supported file is added to the generated sound registry automatically.

Supported extensions are `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac` and `.flac`.

## Music filenames

The filename stem becomes the semantic Music Manager track id and display label unless `public/assets/audio.config.json` provides an explicit binding.

Examples:

| File | Generated track id | Display label |
| --- | --- | --- |
| `music/confessional_ambient.mp3` | `confessional_ambient` | Confessional Ambient |
| `music/nomination_tension.mp3` | `nomination_tension` | Nomination Tension |
| `music/risk_wheel_main.mp3` | `risk_wheel_main` | Risk Wheel Main |

Music defaults to looping at volume `0.5`. New tracks fall back to `competition` when that track exists. Use `audio.config.json` for a different fallback, volume, loop policy, display name or tags.

## Sound filenames

The preferred grammar is:

`<category>_<feature>_<event>.<extension>`

Recognized categories are `ui`, `tv`, `player` and `minigame`.

Examples:

| File | Generated sound key |
| --- | --- |
| `sounds/ui_confirm.mp3` | `ui:confirm` |
| `sounds/tv_winner_reveal.mp3` | `tv:winner_reveal` |
| `sounds/player_evicted.mp3` | `player:evicted` |
| `sounds/minigame_risk_wheel_spin.mp3` | `minigame:risk_wheel_spin` |

An unprefixed filename that begins with a known feature name is treated as a minigame cue. Therefore `sounds/risk_wheel_spin.mp3` also becomes `minigame:risk_wheel_spin`. Prefixes are still recommended because they make intent explicit and avoid warnings.

## Build integration

Run:

```bash
npm run generate:audio
```

The generator scans both directories and writes `src/services/sound/generatedAudioManifest.ts`. Development, type checking, tests, web builds and mobile builds generate the manifest automatically.

The generated manifest is committed so IDEs and static analysis can resolve literal music ids before a local command runs. Never edit it manually.

## Explicit metadata and compatibility aliases

`public/assets/audio.config.json` contains only exceptions and migrated compatibility data. It may:

- bind one physical file to one or more semantic keys;
- assign an existing Music Manager track id;
- set volume, looping, fallback and display metadata;
- preserve an old key as an alias of a new canonical key;
- preserve legacy filename aliases;
- declare feature names used by deterministic smart inference.

Existing code should use canonical keys. Compatibility aliases exist to prevent old saves, tests or delayed branches from losing audio during migration.

## Validation rules

Generation fails when:

- two files or bindings produce the same semantic key;
- two music files produce the same track id;
- an explicit binding references a missing file;
- a key uses the wrong category prefix;
- a fallback track does not exist;
- volume is outside `0–1`;
- configuration contains an invalid category.

Ambiguous unprefixed short sounds are indexed as minigame cues with a generator warning. Rename them with an explicit prefix or add a binding before release.
