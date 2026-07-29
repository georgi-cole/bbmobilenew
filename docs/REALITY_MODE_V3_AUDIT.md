# Reality Mode v3: current-state audit and incremental rebuild plan

Date: 2026-07-29  
Specification: `BB_SOCIAL_SIMULATION_DESIRED_STATE.md`  
Audit scope: social actions, incoming interactions, relationships, AI policy,
public opinion, confessional flow, formal decisions, jury, modes, persistence,
configuration, tests, and central-screen integration.

> Implementation status: the v3 plan produced by this audit has been completed.
> See `docs/REALITY_MODE_V3_IMPLEMENTATION.md` for the delivered architecture,
> compatibility decisions, and validation record.

## Executive finding

The repository already has a substantial v2 social product. It should be
evolved, not replaced. The reusable core includes a directed relationship map,
a shared action eligibility guard, deterministic policy helpers, an incoming
interaction scheduler, structured high-stakes commitments, persistent Drama
arcs/rumours/beliefs, runtime configuration, save hydration, and extensive
tests.

The current model is not yet the desired causal simulation:

- Most social meaning is compressed into one directed `affinity` number and
  tags.
- The interaction clock, expiry model, copy, cooldowns, reports, and snapshots
  are organized around the legacy `week` field. The game now presents daily
  cycles; `week` must become a compatibility alias, not the social clock.
- Normal intensity intentionally removes Influence, Information, important
  actions, promises, rumours, and strategic nominations. This contradicts the
  requirement that Normal remain a complete strategy game.
- Drama contains useful causal state, but romance and several arc transitions
  can still emerge from pair scores without a separately accepted target
  response or an anchor event.
- Formal nominations, POS, votes, jury, and public opinion consume different
  subsets of social state. There is no single typed event/outcome seam.
- The audience headline service can invent relationship stories independently
  of social truth, while jury votes are largely seeded random choices.
- Existing random helpers are often seeded, but the social subsystem had no
  persisted RNG cursor. IDs/timestamps also use `Date.now()` in simulation
  paths, preventing exact replay.

The safe approach is the seven-slice sequence in the specification. This
document and the deterministic v3 foundation are PR1. Existing v2 public APIs
stay operational until later slices have compatibility adapters and equivalent
tests.

## Naming and compatibility decision

The product-facing v3 name is **Reality Mode**. Existing identifiers remain
compatibility aliases:

- Redux/settings/VIP key: `dramaMode`
- Entitlement: `dramaMode`
- Store product ID and environment variable: unchanged
- Existing `normal | drama` intensity values: unchanged until a versioned mode
  adapter is introduced
- Existing `GameState.week`: treated as the legacy persisted day/cycle counter
  until the daily clock migration

This prevents purchases and saves from being orphaned while allowing the UI
and new architecture to use the Reality Mode name.

## Current-state architecture map

### Social actions and execution

- **Definitions:** `src/social/socialActions.ts`,
  `src/social/dramaModeConfig.ts`, `src/social/socialActionCatalog.ts`
- **Eligibility and normalization:** `src/social/socialActionEligibility.ts`,
  `src/social/socialExecutionGuard.ts`, `src/social/smExecNormalize.ts`
- **Execution:** `src/social/SocialManeuvers.ts`
- **State owner:** `src/social/socialSlice.ts`
- **UI callers:** `src/components/SocialPanelV2/SocialPanelV2.tsx`,
  `ActionGrid.tsx`, and `ActionCard.tsx`
- **AI callers:** `src/social/socialAIDriver.ts`
- **Mutation path:** caller → shared eligibility/guard → `executeAction` or
  multi-target equivalent → resource deductions → `updateRelationship`,
  social memory, action logs → middleware Drama/public side effects
- **Persistence:** session logs are transient; bounded `actionHistory`,
  resources, relationships, memory, and Drama network are saved
- **Strength:** UI and AI share much of the same eligibility boundary.
- **Risk:** the action type lacks purpose, direction, response, witness,
  visibility, cooldown, memory-template, and follow-up contracts. Normal and
  Drama normalize costs and visibility differently.

### AI social selection

- **Normal policy:** `src/social/SocialPolicy.ts`
- **Premium policy:** `src/social/dramaAIPolicy.ts`
- **Driver:** `src/social/socialAIDriver.ts`
- **Lifecycle:** `src/social/SocialEngine.ts` and
  `src/social/socialMiddleware.ts`
- **Selection path:** phase start → driver ticks → policy candidate/target
  choice → guard → action execution or AI-to-human incoming conversion
- **Strength:** seeded hashes and capped candidate sampling already exist.
- **Risk:** two policies encode different games; the target does not perform an
  independent response evaluation. `computeOutcomeScore` can fall back to
  `Math.random`, and runtime trace data is incomplete.

### Relationships and memory

- **Types/state:** `RelationshipEntry`, `RelationshipsMap`,
  `SocialMemoryEntry`, and `SocialMemoryMap` in `src/social/types.ts`
- **Mutation:** `updateRelationship` and `updateSocialMemory` reducers in
  `src/social/socialSlice.ts`
- **Rules:** `src/social/socialAlliance.ts`,
  `src/social/socialMemory.ts`, `src/social/weekSocialSeed.ts`
- **Consumers:** action eligibility, both AI policies, incoming autonomy,
  GameScreen relationship cards, nomination/POS/vote helpers, Drama engine
- **Strength:** the map is directed (`source → target`) and memory is directed.
- **Risk:** the semantic relationship is one affinity plus tags. Eligibility
  unions tags from both directions, erasing direction for tag requirements.
  Memory is four accumulators plus recent events, not event/belief retrieval.

### Alliances

- **Legacy representation:** reciprocal `alliance` tags in relationships
- **Drama representation:** `DramaAlliance` in `src/social/types.ts`
- **Rules:** `src/social/socialAlliance.ts`,
  `src/social/dramaModeEngine.ts`, alliance actions in
  `src/social/dramaModeConfig.ts`
- **Strength:** Drama preserves secrecy, unequal loyalty, false pretence,
  discovery, primary status, and active/strained/broken state.
- **Risk:** alliances are pair-only and have no shared plan, roles, meetings,
  recruitment, member-specific target beliefs, merge/dormancy, or operational
  decision loop.

### Romance and story arcs

- **State/rules:** `DramaArc` and `src/social/dramaModeEngine.ts`
- **Definitions/content:** romance actions in `src/social/dramaModeConfig.ts`
- **Presentation:** `src/components/HousePulse/HousePulse.tsx`
- **Strength:** private/public status, stages, intensity, exclusivity, discovery,
  and persistent events exist.
- **Risk:** arcs are symmetric pair records. Successful flirt-style actions and
  periodic affinity checks can start/advance romance without a separately
  modeled response, preferences, mutual acceptance, or anchor hysteresis.

### Incoming interactions

- **Generation:** `src/social/incomingInteractionAutonomy.ts`,
  `incomingInteractionFactory.ts`
- **Scheduling/delivery:** `src/social/incomingInteractionScheduler.ts`,
  `incomingInteractionPhases.ts`
- **Response/presentation:** `src/social/incomingInteractions.ts`,
  `incomingResponseEffects.ts`, `incomingInteractionPresentation.ts`,
  `src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx`
- **State owner:** incoming, scheduled, delivery counters, and decision logs in
  `src/social/socialSlice.ts`
- **Call path:** phase transition in social middleware → autonomy candidate
  scoring → scheduled slot → capped delivery → inbox response thunk → effects,
  commitments, memory, logs, and Drama state
- **Strength:** actionability policies, phase slots, caps, dedupe, concrete
  subjects, contextual response variants, and invalidation already exist.
- **Risk:** the interaction itself expires by `expiresAtWeek`; scheduled phase
  is separate from the response deadline. Required interactions share a
  generic ignore fallback. Several high-stakes scenarios exist only in Drama.
  Most incoming traffic is AI→human.

### Promises

- **State/rules:** `SocialCommitment` in `src/social/types.ts` and
  `src/social/socialCommitments.ts`
- **Creation:** accepted high-stakes incoming responses in
  `src/social/incomingInteractions.ts`
- **Resolution:** social middleware observes nomination, POS, and voting actions
- **Presentation:** active promise and reliability sections in the inbox
- **Strength:** protection, Safety-use, and vote promises are objects that can
  be kept, broken, or voided.
- **Risk:** creation is premium-only, deadlines are `dueWeek`, witnesses/scope/
  stakes are absent, and debts/secrets/open narrative threads do not share a
  formal lifecycle.

### House feed and narrative output

- **Game feed:** `GameState.tvFeed` and game actions
- **Social output:** action histories, middleware announcements, Drama events
- **Public output:** `src/publicOpinion/PublicHeadlineService.ts`,
  `AudiencePulseService.ts`, and public middleware
- **Strength:** important Drama announcements can be visibility-limited before
  becoming public.
- **Risk:** public headlines are randomly templated and can imply romance,
  rumours, or betrayals without consuming a matching social event. Private
  action history has no universal visibility field before audience scoring.

### Confessional

- **UI:** `src/screens/DiaryRoom/DiaryRoom.tsx`
- **Routing:** `src/components/ConfessionalFlowBridge/ConfessionalFlowBridge.tsx`
- **Decision derivation:** `src/store/confessionalDecisionSelectors.ts`
- **Integration:** `src/screens/GameScreen/GameScreen.tsx`,
  `src/components/FloatingActionBar/FloatingActionBar.tsx`
- **Strength:** mandatory ceremony decisions are derived instead of duplicated,
  and confessional routing owns the blocking human choice.
- **Risk:** no social recap/focus ledger exists. Privacy is conventional rather
  than enforced by a knowledge/visibility layer.

### Public mode

- **State:** `src/publicOpinion/types.ts` and
  `src/publicOpinion/publicOpinionSlice.ts`
- **Effects:** public middleware, `AudiencePulseService.ts`,
  `DramaPublicSaveIntegration.ts`, `DramaPublicSaveService.ts`
- **Strength:** one persistent public slice and explicit public-mode gating
  already exist.
- **Risk:** public perception is primarily scalar approval and independent
  randomized headlines. It does not yet derive from a visibility-filtered
  common event ledger, and viewer knowledge is not separate.

### Formal ceremonies and decisions

- **State/rules:** `src/store/gameSlice.ts`
- **Relationship bridge:** `strategicRelationships` copied from social before
  `game/advance`; `dramaSocialMode` selects premium behavior
- **Helpers:** strategic nomination, Safety/POS, and eviction vote scoring in
  `gameSlice.ts`
- **Strength:** POS and eviction helpers already consume affinity/tags/threat,
  and human blocking flags prevent several ceremony deadlocks.
- **Risk:** Normal nominations fall back to seeded random targets. Stated,
  intended, and actual vote are one `votes` result. Promises/beliefs/alliance
  plans are not common decision inputs. Aftermath is scattered across phase
  hooks and premium-only consequences.

### Jury and finale

- **State/rules:** `src/store/finaleSlice.ts`,
  `src/utils/juryUtils.ts`
- **Public finalist vote:** public approval integration
- **Strength:** finale state and votes are persistent and deterministic.
- **Risk:** `aiJurorVote` is a seeded finalist pick and does not consume
  relationship history, strategic respect, betrayal, explanations, goodbye
  messages, jury discussion, or questions.

### Modes

- **Game modes:** `src/modes/modeTypes.ts`, `src/modes/gameModes.ts`
- **Social intensity:** `src/social/socialMode.ts`
- **Settings/entitlements:** `src/store/settingsSlice.ts`,
  `src/store/vipSlice.ts`, `src/vip/vipConfig.ts`
- **Risk:** Survival currently disables social and public features, rather than
  using an adapter. Normal and Drama are behavior forks rather than density
  configurations over one complete engine.

### Saves and migrations

- **Snapshot:** `src/store/saveStatePersistence.ts`
- **Autosave:** `src/store/store.ts`
- **Hydration callers:** `src/screens/HomeHub/HomeHub.tsx`,
  `src/screens/ProfilePicker/ProfilePicker.tsx`
- **Social migration:** `src/social/socialStateMigration.ts`
- **Strength:** the full social and public slices are already persisted.
- **Risk:** the prior social version was 2 and migration was merge/normalization
  rather than explicit per-version steps. There was no persisted social RNG.
  `Date.now()`-based IDs/timestamps still make exact state replay diverge.
  `game/resetGame` does not currently reset the complete social slice, so
  cross-season state requires a dedicated migration/reset decision.

### Data and configuration

- **Actions/content:** `src/social/socialActions.ts`,
  `dramaModeConfig.ts`, `interactionVariantBank.ts`,
  `socialNarratives.ts`
- **Runtime config:** `src/social/socialRuntimeConfig.ts`
- **Strength:** bundled fallback configuration is validated/sanitized and is
  compatible with future remote delivery while remaining offline.
- **Risk:** behavioral contracts and executable logic are still distributed
  across catalogues, maneuvers, policies, autonomy, middleware, and UI copy.

### Central-screen integration

- **File:** `src/screens/GameScreen/GameScreen.tsx` (about 2,100 lines)
- **Current seam:** mounts `SocialPanelV2`, incoming inbox, summaries, FAB, and
  confessional routes; passes game context through Redux
- **Strength:** core social scoring/execution is not implemented directly in
  the screen.
- **Risk:** the screen still has hard-coded interaction phases and several
  social visibility/routing decisions. New v3 logic must stay behind a typed
  orchestrator/adapter rather than increasing this file.

## Definition-of-Done traceability matrix

Status values describe the audited v2 baseline plus the PR1 foundation.

| #   | Desired-state requirement                                       | Evidence                                                                                          | Status           | User-visible consequence                                      | Technical risk                                   | Recommended change                                               | Priority | Slice    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- | -------- | -------- |
| 1   | One causal action system for all directions                     | `socialActions`, `SocialManeuvers`, `socialAIDriver`, incoming thunks                             | Partial          | Similar actions resolve differently by direction/mode         | Divergent balance and effects                    | Universal action/interaction contract and one resolver           | P0       | PR3–4    |
| 2   | Phase/role/knowledge/relationship/resource/cooldown aware       | shared eligibility covers phase/role/relationship/resources; knowledge and cooldown are scattered | Partial          | Plausible actions can use wrong knowledge or timing           | Invalid decisions rescued downstream             | Central context and hard-filter registry                         | P0       | PR3      |
| 3   | Directed multidimensional relationships                         | `RelationshipsMap` is directed but stores affinity/tags                                           | Partial          | Bonds, fear, trust, attraction, and threat collapse together  | Impossible believable transformations            | Add v3 edge; keep affinity selector                              | P0       | PR2      |
| 4   | Anchor events and credible transformations                      | Drama stages/events; no general anchors/hysteresis                                                | Absent           | Labels/arcs can form or flap too easily                       | Narrative contradiction                          | Anchor/grievance ledger and derived-label state machine          | P1       | PR5      |
| 5   | Operational alliance lifecycle                                  | pair Drama alliances with loyalty/secrecy                                                         | Partial          | Alliances are labels more than organizations                  | Formal decisions ignore shared plans             | Multi-member alliance engine and plan beliefs                    | P0       | PR5      |
| 6   | Mutual configurable romance                                     | Drama arcs and actions                                                                            | Contradictory    | Romance can emerge without mutual acceptance                  | Consent/preferences and save semantics           | Response-gated escalation and settings adapter                   | P0       | PR5      |
| 7   | Rival/enemy/repair/truce distinctions                           | rivalry/betrayal arcs and actions                                                                 | Partial          | Conflict states feel interchangeable                          | One delta can over-repair severe harm            | Separate state machines and repair debt                          | P1       | PR5      |
| 8   | Separate truth/belief/human/viewer/public/jury layers           | Drama beliefs/rumour listeners; public slice                                                      | Partial          | Hidden knowledge can be hard to reason about                  | Omniscience and leaks                            | Knowledge entitlement service and ledgers                        | P0       | PR2      |
| 9   | Rumour source/confidence/error                                  | `DramaRumour` has truth, evidence, source chain, listeners                                        | Partial          | Works only in premium story path                              | Parallel truth representations                   | Promote to shared information records                            | P1       | PR2–3    |
| 10  | Persistent promises/debts/secrets/grievances                    | structured commitments; Drama rumours/memory                                                      | Partial          | Some promises pay off; most threads do not                    | Lost narrative causality                         | Shared promise/debt/secret/thread schemas                        | P0       | PR2      |
| 11  | Bounded mood/environment/experience/impulse                     | personality and Drama temperature; no persistent emotion/experience                               | Absent           | Variation reads as random personality noise                   | Balance collapse if bolted onto scores           | Two-speed affect and capped modifiers                            | P1       | PR3      |
| 12  | Normal complete; Drama adds density                             | Normal hides resources/actions/promises/strategy                                                  | Contradictory    | Base mode loses the strategic social game                     | Monetization fork blocks one-engine design       | Enable complete contracts; intensity changes budgets/temperature | P0       | PR3–4    |
| 13  | Public changes audience, not AI knowledge                       | separate public slice, but random headlines                                                       | Partial          | Audience stories may contradict private truth                 | Duplicate narrative model                        | Visibility-filtered common event projection                      | P0       | PR6      |
| 14  | Every ceremony has aftermath/replanning                         | phase scheduler and some Drama effects                                                            | Partial          | Several results have little social reaction                   | Stale plans and missed promises                  | Mandatory typed ceremony outcome hooks                           | P0       | PR6      |
| 15  | Formal decisions consume social state                           | some POS/votes; Drama nominations; random jury                                                    | Contradictory    | Relationships matter inconsistently                           | Split decision algorithms                        | Shared formal-decision adapters                                  | P0       | PR6      |
| 16  | Human initiate/respond/observe/join/intervene/ignore/lay low    | initiate/respond/ignore; limited observe                                                          | Partial          | Human cannot meaningfully enter AI scenes                     | Protagonist-only inbox remains                   | Joinable/interruptible scene instances and defer/lay-low         | P1       | PR4      |
| 17  | Avoid protagonist gravity                                       | AI→AI actions exist; inbox caps exist                                                             | Partial          | Social life exists off-screen but human remains special route | AI→AI underrepresented in state/presentation     | Direction budgets and distribution metrics                       | P1       | PR3–4    |
| 18  | Phase/day deadlines and action-specific ignore                  | scheduled phases, week expiry, generic ignore fallback                                            | Contradictory    | “Answer this week” and uniform penalties                      | Missed same-day windows                          | Deadline `{day, phase}` and per-action expiry resolver           | P0       | PR4      |
| 19  | Influence and Information materially retained                   | premium banks/costs/yields; Normal bypasses both                                                  | Unsafe           | Values disappear from base strategy                           | Existing focused tests already disagree on units | Canonical units and complete-mode costs/effects                  | P0       | PR2–4    |
| 20  | Offline, deterministic, save-compatible, data-driven, efficient | bundled config/caps/save; PR1 persisted RNG/trace                                                 | Partial          | Mostly offline/stable, but reload can diverge                 | clocks/IDs/random fallbacks                      | Adopt persisted RNG everywhere; deterministic IDs; migrations    | P0       | PR1–7    |
| 21  | Narrow central-screen seam                                      | domain logic mostly outside `GameScreen`                                                          | Partial          | Screen is large but not the engine                            | More overlays could increase coupling            | Typed integration adapter/event bus                              | P1       | PR3–4    |
| 22  | Debug trace for selected/blocked actions                        | incoming logs; Drama reasons; PR1 trace/harness                                                   | Partial          | Developers cannot explain all AI choices                      | Logic bugs require guesswork                     | Feed every orchestrator stage into bounded trace                 | P0       | PR1–3    |
| 23  | Tests for validity, leaks, deadlocks, divergence, balance       | large suite; 31 focused baseline failures; no full-season social harness                          | Unsafe           | Regressions and balance collapse may ship                     | No trusted green baseline                        | Repair baseline, add invariants and seeded seasons               | P0       | every PR |
| 24  | Preserve working features                                       | v2 remains active; PR1 additive migration                                                         | Complete for PR1 | Existing game remains playable                                | Later deletions could regress behavior           | Compatibility adapters before removal                            | P0       | every PR |

## Logic-flaw report

| Audit check                                    | Finding                                      | Evidence / impact                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symmetric single-value relationships           | **Partially present**                        | Storage is directed, but only affinity/tags. Drama arcs/alliances are symmetric pairs.                                                                |
| Omniscient AI / hidden-information leaks       | **Not proven globally safe**                 | Rumour listeners protect some knowledge, but no universal entitlement layer guards all policy/formal-decision reads.                                  |
| Random action before validation                | **Partially guarded**                        | Shared eligibility runs before execution, but selection logic is split and some helpers have random fallbacks.                                        |
| Instant labels/romance from thresholds         | **Confirmed**                                | Drama network can start/advance romance from successful actions or mutual affinity hashes without independent acceptance/anchor.                      |
| Alliance arrays without operational behavior   | **Confirmed**                                | `DramaAlliance` persists useful metadata but no meeting/plan/recruitment/merge loop.                                                                  |
| Automatic perfect alliance information/voting  | **Partial risk**                             | Reciprocal tags and pair state imply common alliance knowledge; members cannot hold different plan beliefs.                                           |
| Stated vote conflated with intended/actual     | **Confirmed**                                | `GameState.votes` records one choice; no stated or intended vote object.                                                                              |
| No ceremony aftermath/replanning               | **Confirmed for several paths**              | Some phase hooks and Drama effects exist, but no mandatory outcome event consumed by every actor.                                                     |
| Generic actions in invalid phases              | **Reduced but not eliminated**               | Shared eligibility checks many phases; action definitions lack one authoritative allowed-phase contract.                                              |
| Human protagonist gravity                      | **Partial**                                  | AI→AI driver exists, but inbox/autonomy is explicitly AI→human and human-target caps are a special path.                                              |
| AI→AI only cosmetic                            | **Not globally**                             | AI→AI can mutate relationships/resources/Drama. However, target response is not independently modeled.                                                |
| Rumours become truth without source/confidence | **Not in Drama rumour state**                | Drama rumours preserve both. Other headline/narrative paths can imply ungrounded facts.                                                               |
| Promises only in dialogue                      | **Not for three high-stakes kinds**          | Commitments are formal objects. Other deals/promises remain text or tags, and Normal does not create them.                                            |
| Weekly expiry after daily migration            | **Confirmed**                                | `createdWeek`, `expiresAtWeek`, `dueWeek`, week cooldowns, “Answer this week,” and week-start auto-resolution.                                        |
| Uniform ignore penalties                       | **Confirmed fallback**                       | `incomingResponseEffects` supplies type effects, but missing authored ignore behavior falls back to a common penalty.                                 |
| Drama as unbounded randomness                  | **No**                                       | Drama has capped budgets, eligibility, and temperature. The flaw is duplicated/premium-only causal logic, not unbounded chaos.                        |
| Duplicated public/Survival social logic        | **Confirmed/contradictory**                  | Public headline narrative is independent; Survival disables the social module rather than adapting it.                                                |
| Social monolith in central screen              | **Not currently**                            | `GameScreen` is large and hard-codes some routing/phases, but social algorithms live in domain modules. Do not add new logic there.                   |
| Missing save state/migrations                  | **Partial**                                  | Social is saved and migrated, but v2 lacked social RNG and future knowledge/thread fields.                                                            |
| Non-deterministic save/load                    | **Confirmed**                                | `Date.now()` IDs/timestamps and random fallbacks coexist with seeded helpers; no prior persisted social cursor.                                       |
| Malformed interpolation/raw symbols            | **Guarded but still a risk**                 | Encoding regression tests exist and source UTF-8 is valid; PowerShell display can show mojibake. Content remains distributed and lacks one validator. |
| Removed/dead Influence or Information          | **Functionally gated and test-inconsistent** | Both banks/actions exist, but Normal zeroes them. Focused baseline failures show unit/cost/yield expectations are currently inconsistent.             |

## Focused baseline before v3 edits

Command scope: `src/social/__tests__`, `tests/social`, and the social/incoming
integration suites.

- 30 test files
- 425 tests
- 394 passed
- 31 failed before the v3 implementation

Failure clusters:

- Normal/Drama cost and yield semantics for Influence and Information
- alliance resource rewards and stale alliance repair
- AI affordability expectations
- one incoming autonomy cooldown expectation
- one Drama rumour-listener belief expectation
- two daily-versus-weekly unanswered-interaction summaries
- one role-bound Safety summary

These failures are not caused by the v3 foundation and must remain visible
until the relevant compatibility/economy slice resolves the intended behavior.

## PR1 implementation delivered with this audit

- Product-facing **Reality Mode** terminology while preserving the
  `dramaMode` setting, entitlement, and product identifier.
- Social save schema version 3.
- `realitySimulation` state with:
  - game-specific seed derivation;
  - persisted Mulberry32 state and cursor;
  - bounded serialisable trace;
  - deterministic trace IDs and sequence;
  - explicit null/unbound state for migrated saves.
- Pure bounded-selection characterization harness:
  - hard-blocked candidates are never selectable;
  - candidate order is stabilized by ID;
  - no RNG value is consumed when no candidate is eligible;
  - candidate scores, weights, blocked reasons, selected action, draw, and
    cursor are recorded.
- Migration preserves v2 resources, relationships, interactions, commitments,
  Drama network, and histories and supplies the new state default.
- Runtime seeding occurs before social action/phase processing and resets only
  the new Reality stream for a new game. Hydrated old saves bind the stream to
  the current saved game seed.

This is a foundation, not a claim that current v2 action selection has already
been moved onto the new stream.

## Risk-controlled implementation plan

### PR2: core state and compatibility selectors

- **Likely files:** `src/social/types.ts`, new
  `src/social/reality/{relationships,knowledge,memory,promises,threads}.ts`,
  `socialStateMigration.ts`, `socialSlice.ts`, save tests
- **Change:** add directed dimensions, event memories, beliefs/visibility,
  generalized promises/debts/secrets/threads, and explicit v2→v3 migration.
- **Compatibility:** derive legacy affinity/tags and current card trends from
  v3 edges; retain existing banks and Drama arrays during dual-write.
- **Tests:** directionality, hidden knowledge, old-save migration, save/resume
  cursor, bounded collections, Influence/Information preservation.
- **Rollback:** selectors can continue reading the untouched v2 fields.

### PR3: universal action contract and AI→AI orchestrator

- **Likely files:** new `src/social/reality/{actionContract,candidates,scoring,
response,outcome,orchestrator}.ts`, action data/validator, middleware adapter
- **Change:** validate definitions, build context, hard-filter, score, select
  with the persisted RNG, independently resolve response/outcome, emit typed
  events and traces.
- **Compatibility:** adapt existing action IDs/resolvers first; do not delete
  `SocialManeuvers` or current policies until parity tests pass.
- **Tests:** phase/role/knowledge hard blocks, target rejection/counteroffer,
  anti-repetition, Normal/Reality validity parity, deterministic replay.
- **Rollback:** feature flag routes back to the v2 driver.

### PR4: human flow and daily incoming deadlines

- **Likely files:** incoming types/factory/scheduler/response effects,
  `IncomingInteractionsInbox.tsx`, SocialPanel adapter
- **Change:** one interaction instance for all directions; `{day, phase}`
  deadline; context-specific ignore/counteroffers; Influence/Information spend;
  observe/join/intervene/defer routes.
- **Migration:** translate `expiresAtWeek` to a compatibility day and safe
  terminal phase without expiring a save immediately.
- **Tests:** same-day deadline, action-specific ignore, caps, blocking-modal
  queue, AI rejection, hidden AI scene becoming evidence.
- **Rollback:** legacy week fields remain readable for one schema generation.

### PR5: relationship form engines

- **Likely files:** relationship/anchor/label, alliance, romance, conflict, and
  repair engines plus House Pulse/relationship detail
- **Change:** hysteresis, anchors, grievances, multi-member operational
  alliances, mutual romance, rivalry/enmity/truce, repair debt.
- **Tests:** no label flapping, mutual acceptance, fake alliance discovery,
  different member plan beliefs, severe betrayal not erased by one apology.
- **Rollback:** compatibility labels continue to project into v2 tags.

### PR6: ceremonies, modes, public, and jury

- **Likely files:** typed game/social event bridge, `gameSlice` helper adapters,
  finale/jury utilities, public projection, game mode adapters
- **Change:** nominations/POS/votes/jury consume entitled v3 state; separate
  stated/intended/actual vote; mandatory aftermath; Classic/Survival adapters;
  visibility-derived public and jury perceptions.
- **Tests:** LOH independent choice after pitches, POS broken promise,
  vote divergence, jury history/questions, confessional privacy, public
  visibility, ceremony deadlock invariants.
- **Rollback:** preserve old formal-decision helpers behind an adapter flag.

### PR7: UI/content, balance, and remote-ready bundled data

- **Likely files:** social hub/inbox/feed/relationship detail/ledgers,
  confessional recap, bundled data loader/validators, simulation tooling
- **Change:** complete mobile UI, fact/claim/rumour markers, privacy-safe detail,
  dialogue validation, full-season metrics and tuning.
- **Tests:** accessibility, safe areas, malformed tokens, data validation,
  performance caps, long-run balance and save divergence.
- **Rollback:** bundled fallback remains authoritative; new panels can be
  disabled independently.

## Immediate next gates

1. Repair or explicitly re-baseline the 31 existing focused test failures,
   starting with the Influence/Information unit contract.
2. Land PR2 state behind compatibility selectors.
3. Do not migrate incoming expiry until the game’s canonical daily phase
   adapter is explicit; guessing a deadline would corrupt live saves.
4. Keep Reality Mode premium density, spectacle, and UI while moving the
   complete strategic contract into Normal.

## Preservation statement

PR1 removes no social action, interaction type, resource, ceremony, route,
minigame, save field, or entitlement. Influence and Information remain stored
and executable exactly as in v2; their existing Normal-mode gating and failing
unit expectations are documented rather than hidden. No new week-based logic
was introduced, and no v3 decision code was added to `GameScreen`.
