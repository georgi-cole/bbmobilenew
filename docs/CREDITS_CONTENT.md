# Runtime credits content

The credits renderer loads `public/config/credits.json` every time the Credits screen opens. Copy, names and card timing can therefore change without re-rendering the cinematic background.

For a server-managed file, set either:

- `window.__BIG_EYE_CREDITS_URL__` before the app mounts; or
- `<meta name="big-eye-credits-url" content="https://…/credits.json">`.

The remote document must use version `1`, contain unique card IDs, use non-overlapping time ranges, stay inside the 54-second composition, and use one of the supported text styles from `cinematicConfig.ts`. Invalid or unavailable documents fall back to the bundled credit list, so the screen never opens blank.

The background remains the current live Remotion/WebGL composition. The text layer is now independent, which also allows a future pre-rendered background video to use the same editable JSON without being rendered again.
