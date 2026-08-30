# After the Eye remote content

The post-finale tabloid requests `public/config/afterTheEyeOutcomes.json` by default. Web, Android, iOS, and local development builds generate that file automatically from the editable scenario databank in `src/screens/GameOver/afterTheEyeOutcomeScenarios1.ts` through `afterTheEyeOutcomeScenarios5.ts`, plus `afterTheEyeOutcomeLinkedScenarios.ts`.

A deployed server can replace the generated JSON without rebuilding the app. To host it at another address, set `VITE_AFTER_THE_EYE_CONFIG_URL` to the JSON endpoint.

Loading order is:

1. A valid remote configuration.
2. The last known valid configuration cached in the browser.
3. The bundled TypeScript fallback assembled by `afterTheEyeOutcomeConfig.ts`.

A failed request or malformed edit cannot block the finale. Remote content is treated strictly as text data and is never injected as HTML.

## Modular drama databank

The individual story files now define drama templates rather than one-off finished articles. A template supplies interchangeable narrative pools:

- `headlines`
- `setups`
- `escalations`
- `outcomes`
- `twists`

Each template is compiled into five stable `ScenarioSpec` variants. The linked relationship databank uses the same model and compiles three variants per template. The current source bank produces 120 individual outcomes and 30 relationship-linked outcomes before the normal seeded runtime selection is applied.

This means two seasons can draw from the same broad archetype - pregnancy, affair, family secret, accident, blackmail, recovery, wedding disaster, financial collapse, legal scandal, disappearance, and so on - without receiving the same setup/escalation/outcome combination.

The compiled scenario still contains the standard runtime fields:

- `id`: stable unique identifier.
- `category`: a key from the supported categories.
- `tone`: `excellent`, `good`, `neutral`, `bad`, or `tragic`.
- `weight`: relative selection probability.
- `cooldownGroup`: prevents near-duplicate stories in one issue.
- `eligibility`: optional season-tag and relationship rules.
- Multiple `headlines`, three narrative `beats`, and multiple `twists`.

`tone` is internal selection and balancing metadata. Player-facing copy uses the neutral `AFTERMATH` label rather than exposing excellent/good/neutral/bad/tragic as a verdict.

The generator expands the three compiled beats into several subheadline and article-body structures, then writes the complete server JSON. The runtime continues to use the season seed, scenario weights, player tags, relationship graph, used-scenario IDs, tone/category diversity penalties, and cooldown groups when assigning stories.

## Relationships and eligibility

Relationship-specific plots only become eligible when the played season provides the required relationship context. Individual templates can require an ally, rival, or romantic partner. Linked templates use the actual paired housemates for romantic, betrayal, rival, and ally stories.

Supported placeholders are:

`{name}`, `{firstName}`, `{subject}`, `{object}`, `{possessive}`, `{placement}`, `{allyName}`, `{rivalName}`, `{romanticName}`, `{partnerName}`, `{competitionWins}`, `{nominationCount}`, `{seasonNumber}`, `{winnerName}`, and `{publicApproval}`.

A scenario using `{allyName}`, `{rivalName}`, or `{romanticName}` must declare the matching `eligibility.requiresRelation`. `{partnerName}` is reserved for linked scenarios.

## Validation and generation

After editing the source databank, run:

```bash
npm run generate:after-eye
npm run validate:after-eye
```

The generator checks IDs, categories, relationships, placeholders, weights, required text collections, all five internal tone tiers, a minimum of 100 compiled individual scenarios, a minimum linked-story bank, and presence of the core high-drama categories. Normal development and production builds run generation automatically.

The first command writes `public/config/afterTheEyeOutcomes.json`; the second also checks whether an existing generated file is current.

## Editing only the deployed server copy

You may also edit the generated JSON directly on the server for fast copy changes. Keep `version` at `1`, retain valid scenario IDs, and do not introduce unsupported placeholders. The app validates the complete file before accepting it. When an edit is rejected, players receive the last known valid copy or the bundled fallback instead.

Already published season issues are persisted independently, so changing the databank affects newly generated issues only and does not rewrite a completed season's established aftermath.
