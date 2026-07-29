# Reality Mode v3 implementation

Date: 2026-07-29  
Product name: **Reality Mode**  
Compatibility alias: existing `dramaMode` settings, entitlements, and saves

## Delivered

Reality Mode v3 is a causal, deterministic social simulation shared by Classic
and Surveyeval. Normal intensity remains a complete strategy game; Reality
intensity adds denser actions and story pressure without using a separate
simulation.

The delivered runtime includes:

- A persisted seeded random stream with a cursor, bounded selections, replay
  traces, and full-season determinism checks.
- One typed action contract for player actions, AI-to-AI actions, AI-to-player
  requests, independent group responses, and self-directed actions.
- Directed multi-dimensional relationships with anchored labels, asymmetric
  beliefs, event memory, facts, confidence, sources, secrets, debts, promises,
  grievances, and unresolved story threads.
- Operational multi-member alliances with meetings, plans, unequal member
  beliefs, independent votes, leaks, fracture, and dissolution.
- Mutual, response-gated romance lifecycles with a saved
  **Romance storylines** setting.
- Conflict, apology, repair debt, and truce lifecycles that cannot be erased by
  one small positive interaction.
- Daily phase deadlines for incoming interactions, including explicit player
  choices and type-specific ignored outcomes.
- Typed power, nomination, Safety, vote, eviction, and jury events with
  contestant aftermath and replanning.
- Separate stated, intended, and actual votes. Nominations, Safety, voting, and
  jury evaluation now consume the same social state.
- Visibility and entitlement rules separating truth, contestant belief, player
  knowledge, viewer output, public perception, and jury knowledge.
- Grounded public storytelling: background headlines cannot invent alliances,
  romance, rumours, betrayals, promises, or ceremony outcomes.
- Player-facing private ledgers in **House Pulse → My game** and the
  Confessional, plus development-only Reality diagnostics.
- Versioned migration and complete social reset between seasons.

## Compatibility

- Existing v2 social APIs remain available through adapters while the v3 domain
  is the canonical simulation state.
- Existing saves migrate on hydration; `week` remains a compatibility alias for
  the new day clock.
- Existing store purchases and VIP entitlements continue to use the
  `dramaMode` key.
- Player-facing text uses **Reality Mode**.

## Validation

- Formatting transition gate: passed.
- Strict lint with zero warnings: passed.
- TypeScript project build: passed.
- Production build and debug-global guard: passed.
- Focused Reality, Settings, Diary Room, public causality, and season replay:
  96 tests passed.
- Broader social UI, inbox, House Pulse, decision, and finale regression:
  297 tests passed.
- Additional finale/deadline verification after full-suite feedback:
  22 tests passed.
- Full repository run: 4,742 tests passed. Remaining failures are in unrelated
  pre-existing minigame, sound-asset, CSS contract, and legacy-flow areas.
- Manual browser QA passed for Reality Mode enablement, the romance setting,
  the social action panel, House Pulse private ledger, Confessional recap, and
  browser console errors.

## Local QA

Start the development server and open:

`http://127.0.0.1:4173/bbmobilenew/#/game`

For a clean browser profile, Reality Mode can be enabled from the development
Advanced Settings route:

`http://127.0.0.1:4173/bbmobilenew/#/settingsatiste`
