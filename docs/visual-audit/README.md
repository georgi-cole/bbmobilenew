# Minigame visual-audit bank

`current/` is the reviewed screenshot set for the latest UI revision. Each capture is deterministic: the same game seed, four players, rules skipped, and the minigame frame frozen. It contains both the initial game screen and the host's partial-result screen for every active minigame at every configured Playwright viewport.

Run `npm run audit:visual` whenever a minigame, shared game chrome, result screen, or responsive layout is redesigned. The command moves the existing `current/` set to `archive/<UTC timestamp>/` before creating a new one, so visual history remains available without confusing it with the present design.

Review `current/manifest.json` before using a set: only `"status": "complete"` is a valid audit. An incomplete run is preserved for diagnosis but must not be used as a design baseline.

Screenshot naming is:

`current/<Playwright project>/<game id>/start.png`

`current/<Playwright project>/<game id>/partial-result.png`

The bank is deliberately generated outside the normal E2E command. It makes the visual-review cost and artifact changes intentional, while keeping ordinary regression runs fast.
