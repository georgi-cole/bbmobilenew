# Localization workflow and quality gate

The application uses English (US) as its canonical source catalogue. Every player-facing string must enter the application through a translation key rather than being embedded directly in a component, minigame, rules file, notification, or narrative configuration.

## Adding or changing player-facing copy

1. Add or update the English (US) entry in `src/i18n/messages.ts`.
2. Add or update the corresponding entry in every full language catalogue.
3. Keep English (UK) sparse: add an override only when UK wording should differ from the US source.
4. Preserve exactly the same interpolation placeholders in every translation, for example `{name}` and `{week}`.
5. Render the copy through `t('namespace.key')`. Data-driven modules should store translation keys or structured event data, not finished English sentences.
6. Run `npm run validate:i18n` before opening or updating a pull request.

## What CI enforces

The localization quality gate runs on every pull request and every push to `main`. It validates:

- every configured language has a message catalogue;
- every full catalogue contains exactly the English (US) key set;
- English (UK) overrides cannot introduce unknown keys;
- translations are non-empty;
- interpolation placeholders match the source message;
- an English source-message edit cannot leave an existing translation silently stale;
- newly added JSX text, accessibility copy, labels, descriptions, messages, prompts, rules, instructions, notifications, and similar player-facing literals are not hard-coded outside the catalogue;
- new modules and minigames are checked because the scan operates on all added product-code lines rather than a fixed list of existing screens.

The changed-line scan is progressive. Existing legacy English text does not block unrelated work, but adding a new literal or editing an existing literal brings that line under enforcement.

## English source changes that need no translated wording change

Occasionally an English source edit does not require a particular translated value to change. In that case, add a reviewed acknowledgement to `config/localization-source-review.json` using the exact source hash printed by the failed CI check:

```json
{
  "locale": "fr-FR",
  "key": "example.message",
  "sourceHash": "sha256:...",
  "reason": "The existing French wording already expresses the revised English meaning."
}
```

The acknowledgement is tied to the exact source text. A later English edit invalidates it automatically and requires another review.

## Genuine non-translatable literals

Technical identifiers, routes, asset paths, CSS classes, translation keys, and similar implementation strings are ignored automatically. For an exceptional player-visible literal that must remain outside localization, place a specific waiver on the same line or immediately above it:

```ts
// i18n-ignore: Licensed programme title must remain unchanged in every market
const title = 'Licensed Programme Name'
```

A bare `i18n-ignore` or a vague reason fails CI. Waivers are printed in the validation output so they remain visible during review.

## Scope and limitation

The gate prevents missing keys, stale source edits, placeholder damage, and escaped hard-coded additions. It cannot determine whether a translation is idiomatic or culturally appropriate. Linguistic quality still requires human review, especially for humour, slang, ceremonies, relationship dialogue, and region-specific terminology.
