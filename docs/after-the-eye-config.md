# After the Eye remote content

The post-finale tabloid requests `public/config/afterTheEyeOutcomes.json` by default. Web, Android, iOS, and local development builds generate that file automatically from the editable scenario databank in `src/screens/GameOver/afterTheEyeOutcomeScenarios1.ts` through `afterTheEyeOutcomeScenarios5.ts`, plus `afterTheEyeOutcomeLinkedScenarios.ts`.

A deployed server can replace the generated JSON without rebuilding the app. To host it at another address, set `VITE_AFTER_THE_EYE_CONFIG_URL` to the JSON endpoint.

Loading order is:

1. A valid remote configuration.
2. The last known valid configuration cached in the browser.
3. The bundled TypeScript fallback assembled by `afterTheEyeOutcomeConfig.ts`.

A failed request or malformed edit cannot block the finale. Remote content is treated strictly as text data and is never injected as HTML.

## Editing the databank

Each compact source scenario contains:

- `id`: stable unique identifier.
- `category`: a key from the supported categories.
- `tone`: `excellent`, `good`, `neutral`, `bad`, or `tragic`.
- `weight`: relative selection probability.
- `cooldownGroup`: prevents near-duplicate stories in one issue.
- `eligibility`: optional season-tag and relationship rules.
- Multiple `headlines`, three narrative `beats`, and multiple `twists`.

The generator expands those beats into several subheadline and body structures, then writes the complete server JSON.

Supported placeholders are:

`{name}`, `{firstName}`, `{subject}`, `{object}`, `{possessive}`, `{placement}`, `{allyName}`, `{rivalName}`, `{romanticName}`, `{partnerName}`, `{competitionWins}`, `{nominationCount}`, `{seasonNumber}`, `{winnerName}`, and `{publicApproval}`.

A scenario using `{allyName}`, `{rivalName}`, or `{romanticName}` must declare the matching `eligibility.requiresRelation`. `{partnerName}` is reserved for linked scenarios.

After editing the source databank, run:

```bash
npm run generate:after-eye
npm run validate:after-eye
```

The first command writes `public/config/afterTheEyeOutcomes.json`; the second checks IDs, categories, relationships, placeholders, weights, required text collections, and whether an existing generated file is current. Normal development and production builds run generation automatically.

## Editing only the deployed server copy

You may also edit the generated JSON directly on the server for fast copy changes. Keep `version` at `1`, retain valid scenario IDs, and do not introduce unsupported placeholders. The app validates the complete file before accepting it. When an edit is rejected, players receive the last known valid copy or the bundled fallback instead.

Already published season issues are persisted independently, so changing the databank affects newly generated issues only and does not rewrite a completed season's established aftermath.
