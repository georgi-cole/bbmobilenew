# Remote Manager operator guide

The game reads its live configuration from:

`https://georgi-cole.github.io/bbmobilenew/config/live-config.json`

Released clients check at startup and refresh every five minutes. If the file is temporarily unavailable, the last valid cached configuration is used; bundled defaults remain the final fallback.

## Open the control panel

1. Open the deployed game with `#/remote-manager?debug=1&qa=1` at the end of its URL.
2. The first successful QA visit remembers access on that browser. You can also open **Remote Manager** from the QA Control Center afterward.
3. The panel loads the currently published JSON. Changes made in the form are only a local draft until you publish them.

## One-time GitHub setup

Create a fine-grained personal access token in GitHub, restricted to the `georgi-cole/bbmobilenew` repository.

- Repository permission **Contents: Read and write** is required to update the JSON file.
- Repository permission **Pull requests: Read and write** is required for the recommended review-PR flow.
- Give the token a short expiration and revoke it if it is ever shared.

Paste the token into the Publish tab when needed. The panel keeps it only in the current browser tab and never saves it in the repository, JSON, or local storage.

## Common operations

### Send a message to everyone

1. Open **Broadcast**.
2. Enable “Show this message to all players.”
3. Enter a title and message; choose Critical only for urgent notices.
4. Optionally schedule start and end times.
5. Open **Publish** and choose **Create review PR**.
6. Review and merge the PR on GitHub. GitHub Pages deploys the new file, and active clients pick it up within about five minutes.
7. To remove the message, disable it and publish again.

### Replace a music track

1. Host the audio at a public HTTPS URL that permits browser playback.
2. Open **Music**, choose **Add track override**, select the semantic game track, and paste the URL.
3. Set volume between 0 and 1 and publish.
4. Remove the override and publish again to return to the bundled track.

### Schedule a competition

1. Open **Game**, enable remote competition rules, and add a rule.
2. Choose whether it matches a day or remaining-player count, and whether it applies to LOH, POS, or either.
3. Choose a random game, category, or exact game.
4. Leave the winner on “Play normally,” choose a random winner, or enter an exact player ID.
5. Use priority when multiple rules can match; higher numbers win.
6. Publish. Protected twist rules and participant eligibility still take precedence.

### Tune Social/Drama energy

1. Open **Social**.
2. Change weekly energy or caps for normal and drama modes.
3. Update the revision note so the change is easy to identify.
4. Publish. Existing games use the refreshed settings when the runtime reads the social configuration.

## Publishing choices

- **Create review PR** is recommended. It creates a branch and PR, and nothing goes live until that PR is merged.
- **Publish directly to main** is for urgent changes. It commits immediately and starts the normal GitHub Pages deployment.

Publishing is not instant: wait for the Pages workflow to finish, then allow up to five minutes for an already-open game to refresh. A newly opened game fetches the current file immediately.

## Advanced JSON

The Advanced JSON tab supports the complete validated remote schema, including detailed music assignments, social text/policies, themes, player presentation overrides, and rollout controls. **Validate and apply JSON** removes unknown or unsafe fields before publishing. No remote field is executed as code.
