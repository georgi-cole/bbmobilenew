# Social Integration

This document describes the end-to-end lifecycle of the social subsystem,
covering how the middleware, engine, AI driver, and Diary Room summary are
wired together.

## Architecture overview

```
src/social/
├── SocialEngine.ts          — phase orchestration (startPhase / endPhase)
├── socialAIDriver.ts        — budget-aware AI action driver
├── SocialSummaryBridge.ts   — persists phase summaries to the Diary Room
├── socialMiddleware.ts      — Redux middleware: watches game phase changes
├── socialConfig.ts          — configuration (budgets, AI driver, policy)
├── SocialPolicy.ts          — action + target selection for AI players
├── SocialManeuvers.ts       — action execution (energy deduction, relationship updates)
├── SocialInfluence.ts       — nomination/veto bias computation
├── SocialEnergyBank.ts      — per-player energy bank (Redux-backed)
├── socialSlice.ts           — Redux slice for social state
├── constants.ts             — DEFAULT_ENERGY, SOCIAL_INITIAL_STATE
├── types.ts                 — TypeScript types
└── index.ts                 — public re-exports
```

## Lifecycle

```
App bootstrap
  └─ SocialEngine.init(store)
       ├─ initInfluence(store)
       ├─ initManeuvers(store)
       └─ socialAIDriver.setStore(store)

game/setPhase  ──► socialMiddleware
                    ├─ if entering social_1 / social_2:
                    │    SocialEngine.startPhase(phase)
                    │      ├─ computes per-player energy budgets (LCG PRNG, game seed)
                    │      ├─ dispatches social/engineReady  → state.social.energyBank
                    │      └─ socialAIDriver.start()  (if AI players have budget > 0)
                    │           └─ every tickIntervalMs:
                    │                for each AI player with budget > 0:
                    │                  SocialPolicy.chooseActionFor(player, context)
                    │                  SocialPolicy.chooseTargetsFor(player, action, context)
                    │                  SocialManeuvers.executeAction(actor, target, action)
                    │                    ├─ deducts energy via SocialEnergyBank
                    │                    ├─ dispatches social/updateRelationship
                    │                    └─ dispatches social/recordSocialAction
                    │                stops when all budgets = 0 or MAX_TICKS reached
                    │
                    └─ if leaving social_1 / social_2:
                         SocialEngine.endPhase(phase)
                           ├─ socialAIDriver.stop()
                           ├─ computes influence weights (social/influenceUpdated)
                           ├─ builds SocialPhaseReport
                           ├─ dispatches social/engineComplete
                           ├─ dispatches social/setLastReport  → state.social.lastReport
                           └─ SocialSummaryBridge.dispatchSocialSummary()
                                └─ dispatches game/addSocialSummary
                                     → state.game.tvFeed entry { type: 'diary' }
                                     (NOT a regular TV event)
```

## Configuration (`src/social/socialConfig.ts`)

| Key | Default | Description |
|---|---|---|
| `targetSpendPctRange` | `[0.5, 0.9]` | Fraction of DEFAULT_ENERGY to spend |
| `minActionsPerPlayer` | `1` | Min social actions per AI player per phase |
| `maxActionsPerPlayer` | `4` | Max social actions per AI player per phase |
| `tickIntervalMs` | `375` | Milliseconds between AI driver ticks |
| `allowOverspend` | `false` | When false, driver stops when all budgets hit 0 |
| `verbose` | `false` | Enable driver console debug logs |
| `maxTicksPerPhase` | `30` | Safety guard: driver stops after this many ticks regardless |

`DEFAULT_ENERGY` (= `5`) is defined in `src/social/constants.ts`.

## Redux state

All social state lives under `state.social` (type `SocialState`):

| Field | Type | Description |
|---|---|---|
| `energyBank` | `Record<string, number>` | Per-player budgets set at phase start |
| `lastReport` | `SocialPhaseReport \| null` | Report from the most recent phase |
| `relationships` | `RelationshipsMap` | Player relationship graph |
| `sessionLogs` | `SocialActionLogEntry[]` | Append-only action log |
| `influenceWeights` | `Record<string, Record<string, Record<string, number>>>` | Nomination/veto biases |

The Diary Room entry is stored in `state.game.tvFeed` with `type: 'diary'`.

## Debug commands (browser DevTools console)

```js
// Trigger a social phase manually (e.g. from DebugPanel):
window.store.dispatch({ type: 'game/setPhase', payload: 'social_1' });

// Inspect per-player energy budgets:
SocialEngine.getBudgets();
// → { "hg-1": 7, "hg-2": 6, ... }

// Check AI driver status:
window.__smAutoDriver.getStatus();
// → { running: true, tickCount: 2, actionsExecuted: 5 }

// Read the last phase report:
SocialEngine.getLastReport();
// → { id: "social_1_w3_...", week: 3, summary: "...", ... }

// Rebuild and persist a social summary manually (e.g. for testing):
window.__rebuildSocialSummary = () => {
  const report = SocialEngine.getLastReport();
  if (report) {
    window.store.dispatch({
      type: 'game/addSocialSummary',
      payload: { summary: report.summary, week: report.week },
    });
  }
};
window.__rebuildSocialSummary();

// Confirm no new TV events were added (diary entry has type 'diary'):
window.store.getState().game.tvFeed.filter(e => e.type === 'diary');

// Check the last social report in Redux state:
window.store.getState().social.lastReport;
```

## Manual QA checklist

1. Start dev server (`npm run dev`).
2. Use DebugPanel to `setPhase('social_1')`.
   - Verify `state.social.energyBank` is populated (Redux DevTools).
   - Confirm AI driver started: `window.__smAutoDriver.getStatus()` → `running: true`.
3. Wait ~2 s or advance the phase via DebugPanel to a non-social phase.
4. Confirm `state.social.lastReport` is set and `state.game.tvFeed` contains a
   `{ type: 'diary' }` entry with the weekly summary text.
5. Confirm no extra `{ type: 'game' }` or `{ type: 'eviction' }` events were added
   by the summary logic.
6. Run the integration test: `npm test -- tests/integration/social.lifecycle.test.ts`.
