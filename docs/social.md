# Social Module

## Overview

The social module drives player-to-player social interactions whenever the human player is alive and the game is in a non-vote interaction window. This includes LOH phases, POS phases, nomination phases, pre-vote phases, and the traditional `social_1` / `social_2` windows. Social interactions are blocked during `live_vote` and eviction resolution phases. It consists of two UI layers:

| Layer | Component | Status |
|---|---|---|
| **Legacy** | `src/components/SocialPanel/SocialPanel.tsx` | Hidden behind `FEATURE_SOCIAL_V2` |
| **Current** | `src/components/SocialPanelV2/SocialPanelV2.tsx` | Active (default) |

## Feature flag: `FEATURE_SOCIAL_V2`

The old (legacy) `SocialPanel` is gated behind the `FEATURE_SOCIAL_V2` flag defined in
`src/config/featureFlags.ts`.

| Env var | Default | Effect |
|---|---|---|
| `VITE_FEATURE_SOCIAL_V2` | `true` | Set to `false` to re-enable the legacy SocialPanel |

> **Note:** Vite only exposes `VITE_`-prefixed env vars to `import.meta.env` by default.
> `REACT_APP_*` variables have no effect unless `envPrefix` is configured in `vite.config.ts`.

When the flag is **`true`** (default):
- `SocialPanelV2` handles all social-phase UI (full-screen modal overlay).
- The legacy `SocialPanel` is **not rendered** (no DOM node, no layout gap).

When the flag is **`false`**:
- The legacy `SocialPanel` is rendered during non-vote interaction phases (LOH, POS, nomination, pre-vote, and social windows).
- `SocialPanelV2` is still mounted in the tree but remains invisible unless opened via the FAB.

### Re-enabling the old module

Add the following to your local `.env` (or `.env.local`) file and restart the dev server:

```
VITE_FEATURE_SOCIAL_V2=false
```

The legacy panel will immediately reappear during social phases. No code changes are required — all original code is preserved in the repository.

## Architecture notes

- `src/social/` — engine, Redux slice, AI driver, and policy (phase-independent).
- `src/components/SocialPanel/` — legacy UI (hidden, code intact).
- `src/components/SocialPanelV2/` — current production UI.
- `src/config/featureFlags.ts` — central location for compile-time feature flags.
