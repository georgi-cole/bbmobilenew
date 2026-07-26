# After the Eye remote content

The post-finale tabloid loads its editorial content from `public/config/afterTheEyeOutcomes.json`. In production that path can be replaced by a server-hosted file, or `VITE_AFTER_THE_EYE_CONFIG_URL` can point to another JSON endpoint.

Loading order is:

1. Valid remote configuration.
2. Last known valid configuration cached in the browser.
3. The bundled fallback in `src/screens/GameOver/afterTheEyeOutcomes.json`.

A bad request or malformed edit cannot block the finale. The remote file is treated only as text data and is never rendered as HTML.

## Editing

Each individual scenario contains:

- `id`: stable unique identifier.
- `category`: a key from `categories`.
- `tone`: `excellent`, `good`, `neutral`, `bad`, or `tragic`.
- `weight`: relative selection probability.
- `cooldownGroup`: prevents near-duplicate stories in one issue.
- `eligibility`: optional placement, season-tag, and relationship rules.
- Multiple `headlines`, `subheadlines`, `bodies`, `bulletPoints`, and `twists`.

Supported placeholders are:

`{name}`, `{firstName}`, `{subject}`, `{object}`, `{possessive}`, `{placement}`, `{allyName}`, `{rivalName}`, `{romanticName}`, `{partnerName}`, `{competitionWins}`, `{nominationCount}`, `{seasonNumber}`, `{winnerName}`, and `{publicApproval}`.

A scenario using `{allyName}`, `{rivalName}`, or `{romanticName}` must declare the matching `eligibility.requiresRelation`. `{partnerName}` is reserved for linked scenarios.

After editing, keep the server and bundled copies synchronized and run:

```bash
npm run validate:after-eye
```

Already published season issues are persisted separately, so changing the databank affects newly generated issues only.
