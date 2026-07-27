# Content and configuration hosting audit

## Executive conclusion

The project already has a useful remote-config foundation, but it is **not yet structured for full server-side management of question banks, gameplay configuration, or game presentation**.

The current separation is mixed:

- Runtime live configuration is centralised and safely fetched as JSON.
- Several important content banks are separated from their game components, but remain compile-time TypeScript or JavaScript modules.
- Minigame metadata is centralised in a registry, but executable wiring and editable metadata live in the same code structure.
- Most visual design remains embedded in React components and CSS, with only a small theme surface remotely configurable.

This is a good starting point, not a finished content-management architecture.

## What is already well designed

### Remote live-config pipeline

The existing `src/remoteConfig` module has several sound properties:

- A typed root configuration contract.
- A sanitisation boundary that drops invalid or unknown values.
- Pure-data handling with no remote code execution.
- Absolute HTTP(S) URL validation for packaged builds.
- Local fallback caching when the server is unavailable.
- A configurable endpoint through `VITE_REMOTE_CONFIG_URL`.
- A server route that serves a static JSON file and falls back safely to `{}`.

This is suitable for operational switches, event copy, limited theme changes, challenge selection, and small profile overrides.

### Central minigame registry

`src/minigames/registryBase.ts` centralises titles, descriptions, instructions, scoring metadata, categories, weights, availability, and component/module wiring. This is much better than scattering those values through every screen.

### Separated content modules

Question/content banks such as CWGO, Biography Blitz, Number Trivia, Majority Rules, and Wildcard Western are generally placed in dedicated files rather than being authored directly inside rendering components. Some newer games already use JSON data.

### Canonical TypeScript houseguest data

`src/data/houseguests.ts` is documented as the canonical profile source and includes competition profiles. The `houseguestLookup` utility correctly merges canonical profile data with live player state.

## Main gaps and risks

### 1. Question banks are still compiled into the application

Most question banks are TypeScript or JavaScript exports. Editing them requires a code change, rebuild, release, and store/web deployment. They cannot currently be updated from a server.

The CWGO bank is now explicitly serialisable and versioned, but there is not yet:

- a remote question-bank endpoint;
- runtime schema validation for the bank;
- a bundled fallback plus remote override loader;
- content revision selection;
- an enable/disable or publication state per question;
- localisation support;
- duplicate-ID and semantic validation on the server.

### 2. Editable metadata and executable wiring are combined

The minigame registry contains both remotely editable values and code-only values.

Potentially remote:

- title;
- description;
- instructions;
- weight;
- retired/enabled state;
- player-count limits;
- selected scoring parameters.

Must remain local executable code:

- React component keys;
- module paths;
- implementation type;
- authoritative resolver behavior;
- scoring-adapter implementation references.

Serving the entire registry remotely would be unsafe and brittle. It should be split into a local executable registry and a validated remote metadata/config overlay.

### 3. Visual design is only minimally configurable

Remote config currently exposes accent colours, background, selected imagery, music, and limited copy. Most game-specific layout, typography, spacing, animation, surfaces, and responsive behavior remains in CSS and React.

This is appropriate for structural design. It does mean the game cannot currently be substantially redesigned from a server without a release.

The recommended boundary is to expose controlled design tokens and predefined presentation variants remotely, not arbitrary CSS or HTML.

Examples:

- density: `compact | comfortable`;
- card style: `glass | solid`;
- animation intensity: `reduced | standard | cinematic`;
- approved colour tokens;
- per-game artwork and copy URLs;
- predefined layout variant IDs implemented locally.

### 4. Duplicate legacy/public datasets can drift

Houseguest data also exists in legacy and generated/public locations. Even when the TypeScript source is canonical, multiple committed copies create a maintenance risk unless they are generated automatically and checked for drift.

The same risk applies to legacy minigame question strings and newer TypeScript content banks.

### 5. The server endpoint is read-only and weakly versioned

The live-config route safely serves JSON, but it does not currently provide:

- JSON Schema validation before publishing;
- a schema version requirement;
- content revision identifiers;
- `ETag`/conditional requests;
- staged publication;
- rollback history;
- authenticated admin writes;
- separate development, staging, and production channels;
- integrity/signature metadata.

Client sanitisation is still necessary, but invalid content should ideally be rejected before it is published.

## Recommended target architecture

### Keep executable behavior in the application

The app should retain:

- React components;
- game state machines;
- AI algorithms;
- scoring adapters;
- security-sensitive rules;
- allowed layout/presentation variants;
- bundled fallback content.

### Host validated pure data remotely

Recommended endpoints or equivalent static files:

- `/api/content/manifest`
- `/api/content/cwgo/questions`
- `/api/content/number-trivia/questions`
- `/api/content/majority-rules/questions`
- `/api/config/gameplay`
- `/api/config/presentation`

A manifest should identify the active revision of every bank, for example:

```json
{
  "schemaVersion": 1,
  "revision": "2026-07-27.1",
  "banks": {
    "cwgo": {
      "revision": "3",
      "url": "/api/content/cwgo/questions?v=3"
    }
  }
}
```

Each bank should contain only serialisable data and include:

- `schemaVersion`;
- `revision`;
- stable IDs;
- optional `enabled` status;
- locale;
- questions/content;
- optional validity dates;
- source/verification notes for facts likely to change.

### Runtime loading behavior

1. Start immediately with the bundled validated fallback.
2. Fetch the manifest and active remote revision.
3. Validate the entire remote bank before accepting it.
4. Reject the whole revision if structural validation fails.
5. Cache the last valid revision.
6. Activate a new revision only between competitions, never halfway through one.
7. Record the question-bank revision in the saved game/session for deterministic replays and support diagnostics.

### Publishing workflow

A practical first version does not require a full CMS. A protected repository or storage bucket containing reviewed JSON files is sufficient when combined with:

- automated schema validation in CI;
- a staging URL;
- explicit promotion to production;
- immutable revision files;
- a small manifest pointer for rollback.

An authenticated editor can be added later without changing the client contract.

## Recommended implementation order

### Phase 1 — contracts and validation

- Define JSON Schemas for remote config and each question-bank family.
- Add validators and bank-level tests for IDs, answer ranges, modes, duplicate content, and required metadata.
- Convert compile-time banks to JSON-compatible source modules or JSON files while preserving bundled fallbacks.

### Phase 2 — remote content loader

- Add a generic versioned content loader with timeout, cache, validation, and bundled fallback.
- Integrate one low-risk bank first, preferably CWGO.
- Persist the selected content revision in competition state.

### Phase 3 — registry/config overlays

- Split local executable minigame definitions from remotely editable metadata.
- Add a strict allow-list of editable gameplay and presentation fields.
- Add controlled design-token and layout-variant overlays.

### Phase 4 — publishing and operations

- Add CI validation, staging, immutable revisions, promotion, and rollback.
- Add authenticated editing only after the schemas and publishing workflow are stable.

## CWGO-specific status after this change

The CWGO question model is now prepared for eventual remote hosting because it is pure serialisable data with:

- a schema version;
- stable IDs;
- explicit difficulty;
- explicit human answer mode;
- optional plausible mistakes;
- numeric bounds and scale hints.

However, this pull request intentionally keeps the bank bundled. Remote loading should be implemented as a separate change so the AI behavior fix is not coupled to networking, caching, save compatibility, and content publication concerns.
