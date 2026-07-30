# Music Cue Phase 2

The runtime now distinguishes an audio **asset**, a reusable **cue**, and a gameplay **assignment**.

A cue can select a segment of a track, define an internal loop, apply cue-relative volume, fade in/out, crossfade to another cue, choose restart/resume/continue behavior, and request a safe effect preset. Unsupported WebAudio effects degrade to clean playback.

Minigames publish semantic variants (`normal`, `intense`, `final_round`, `sudden_death`, `overtime`, `victory_lap`) through `MinigameHost`; Redux remains the source of truth. Risk Wheel publishes `final_round` automatically when it reaches its final field/round and `victory_lap` on completion.

Existing whole-track assignments remain backward compatible and continue through the original single-element path. The two-deck engine activates only for advanced cues.
