# Minigame visual-audit bank

`current/` is the reviewed screenshot set for the latest UI revision. Each capture is deterministic: the same game seed, four players, rules skipped, and the minigame frame frozen. It contains the host game surface (not the surrounding QA controls) at both the initial game screen and the partial-result screen for every active minigame at every configured Playwright viewport.

Run `npm run audit:visual` whenever a minigame, shared game chrome, result screen, or responsive layout is redesigned. The command moves the existing `current/` set to `archive/<UTC timestamp>/` before creating a new one, so visual history remains available without confusing it with the present design.

Review `current/manifest.json` before using a set: only `"status": "complete"` is a valid audit. An incomplete run is preserved for diagnosis but must not be used as a design baseline.

If one browser engine is temporarily unavailable, set `VISUAL_AUDIT_PROJECTS` to a comma-separated project list. The resulting manifest is marked `"partial"` even when every requested project passes. Chromium projects automatically reuse an installed Chrome or Edge browser when Playwright's downloaded Chromium is unavailable.

If a capture is interrupted, rerun the same projects with `VISUAL_AUDIT_RESUME=1`. Games that already have both deterministic screenshots are skipped, so the bank continues without recapturing completed pairs.

Screenshot naming is:

`current/<Playwright project>/<game id>/start.png`

`current/<Playwright project>/<game id>/partial-result.png`

The bank is deliberately generated outside the normal E2E command. It makes the visual-review cost and artifact changes intentional, while keeping ordinary regression runs fast.
