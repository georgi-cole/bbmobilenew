# App review notes

## Access

- No account, sign-in, subscription, or demo credentials are required for the core game.
- The app opens directly into the game hub. A reviewer can create a player and start a season from the main menu.
- The experience is portrait-only on phones and tablets.

## Network-dependent and optional behavior

- The core season uses local game logic and remains playable without the optional AI responder service.
- If the premium Diary Room service is not configured or unavailable, the app uses deterministic local replies.
- Location is optional and is used only to select an ambient weather/day-night visual theme. Denying location does not block play.
- The codebase contains an ad bridge, but real advertising appears only if a native advertising SDK and bridge are included in the submitted binary. Confirm the final binary state before answering “Contains ads.”

## Suggested review path

1. Create a player.
2. Start a new season.
3. Advance to a competition and play the displayed minigame.
4. Open the social panel and complete an interaction.
5. Continue to a nomination or vote decision.

The Big Eye is an original fictional game and is not affiliated with a television network or reality-show franchise.
