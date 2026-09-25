# Sound assets

Sound effects and cinematic audio are grouped by purpose so paths stay predictable and the GitHub folder is easy to browse.

- `cinematic/` — cinematic soundtrack/effect media used by presentation sequences.
- `events/` — player-level elimination and event cues.
- `minigames/` — competition and minigame sound effects and alternate minigame audio.
- `tv/` — broadcast, voting, winner, and live-show stingers.
- `ui/` — interface feedback, navigation, selection, and button sounds.

Background music remains in the sibling `../music/` directory.

## Naming

Keep filenames lowercase `snake_case` where practical and retain the functional prefix used by the audio registry (`minigame_`, `tv_`, `ui_`, etc.). When moving or renaming an asset, update `public/assets/audio.config.json`; `npm run generate:audio` regenerates the TypeScript manifest from that registry.
