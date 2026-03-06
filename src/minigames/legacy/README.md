# Legacy Minigames — DEPRECATED

> **All modules in this folder are deprecated.**
> They are kept temporarily to avoid breaking any remaining consumers during
> the migration period, but will be removed in a follow-up cleanup PR.

## What this folder contains

Self-contained, containerized JavaScript minigame modules that were previously
loaded at runtime by `LegacyMinigameWrapper` via `modulePath` registry entries.

## Migration guide

New minigames should be implemented as native React components and registered
with `implementation: 'react'` and a `reactComponentKey` in
`src/minigames/registry.ts`.  `MinigameHost` routes games to the correct
component based on these fields — see the `holdWall` and `tiltedLedge` entries
for examples.

### TiltedLedge (already migrated)

| Artefact | Location |
|---|---|
| React component | `src/components/TiltedLedge/TiltedLedge.tsx` |
| Screen wrapper  | `src/screens/TiltedLedgeTestPage/TiltedLedgeScreen.tsx` |
| Registry entry  | `src/minigames/registry.ts` → `tiltedLedge` |
| Legacy module *(deprecated)* | `src/minigames/legacy/tilted-ledge.js` |

## Notes

- Do **not** add new modules to this folder.
- Do **not** add new registry entries that reference `modulePath` or set
  `legacy: true`.
- If you still consume a legacy module directly, migrate to the corresponding
  React component listed above.
