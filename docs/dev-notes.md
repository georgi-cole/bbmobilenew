# Developer Notes

## Testing the IntroHub / HomeHub Buttons Across Platforms

### Why this matters

When users add the app to their iOS Home Screen (A2HS / Add-to-Home-Screen), Safari
launches the page in a *standalone webview* context that disables `backdrop-filter`,
resets `border-radius` on `<button>` elements, and ignores some `-webkit-appearance`
overrides.  Without explicit fixes the asymmetric rounded buttons appear flat and
rectangular.

The changes in `src/utils/displayMode.ts`, `src/styles/_introhub-buttons.css`, and
`src/styles/_ios-standalone-fixes.css` address this by:

1. Applying `html.is-standalone` / `html.is-webkit` / `html.is-chrome-android` classes
   early so CSS can target each environment with plain selectors.
2. Wrapping `backdrop-filter` in `@supports` and providing `box-shadow` + opaque
   gradient fallbacks for contexts where blur compositing is unavailable.
3. Using explicit per-corner `border-radius` values (e.g. `28px 8px 28px 8px`) instead
   of shorthands that standalone WebKit may reset on repaint.

---

## How to Test

### iOS — Safari in-browser

1. Open `https://<your-host>/bbmobilenew/` in Safari on an iPhone or iPad.
2. The buttons should show the asymmetric pill shape with a frosted-glass blur effect.
3. Tap a button; it should lift (`translateY`) and the corners should remain rounded.

### iOS — Add to Home Screen (A2HS / standalone)

1. In Safari, tap the **Share** icon → **Add to Home Screen**.
2. Launch the app from the new icon.
3. The `html` element should have the class `is-standalone` (verify via **Safari Develop
   → Inspect** on the device — see remote-debug steps below).
4. Buttons must look identical to the in-browser view: same rounded corners, same depth
   (shadows replace blur if `backdrop-filter` is unavailable).

#### Remote-debugging iOS with Safari Develop menu

```
macOS Safari → Settings → Advanced → Show features for web developers
iPhone/iPad → Settings → Safari → Advanced → Web Inspector (on)
```

Connect the device via USB, then in macOS Safari: **Develop → [device name] →
[page title]** to open a remote Web Inspector.  Check `html` classes and computed
styles on `.home-hub__btn`.

### Chrome on iOS

1. Open the URL in Chrome for iOS.
2. Chrome on iOS uses WebKit under the hood, so `html.is-webkit` will be set.
3. Buttons should look the same as Safari.

### Android Chrome

1. Open the URL in Chrome on Android.
2. Add to Home Screen via Chrome menu → **Add to Home screen**.
3. `html.is-standalone` and `html.is-chrome-android` should both be set.
4. Backdrop-filter works well on Android Chrome, so the glass blur should be visible.

#### Remote-debugging Android with Chrome DevTools

```
chrome://inspect  (on desktop Chrome)
Enable USB debugging on Android: Settings → Developer options → USB debugging
```

Connect via USB, click **Inspect** next to your page, then check the Elements panel
for `html` classes and the Computed styles for `.home-hub__btn`.

### Desktop (Chrome / Firefox / Edge / Safari)

1. Open the URL on desktop.
2. `is-webkit` is only set in desktop Safari; other browsers get no extra classes.
3. Buttons should show the asymmetric shape and glass blur in all four browsers.

---

## CSS architecture quick-reference

| File | Responsibility |
|------|---------------|
| `src/screens/HomeHub/HomeHub.css` | Base button layout, sizing, colours, shadows |
| `src/styles/_introhub-buttons.css` | `@supports` guards, `is-webkit` / `is-standalone` overrides |
| `src/styles/_ios-standalone-fixes.css` | Standalone-specific token overrides; nulls `backdrop-filter` in A2HS |
| `src/utils/displayMode.ts` | Runtime detection; sets `is-standalone`, `is-webkit`, `is-chrome-android` on `<html>` |

---

## Follow-up: SVG option for asymmetric shapes

If a future design requires shapes that `border-radius` cannot express (e.g.
one concave corner), an alternative is to replace the button background with an
inline SVG `background-image` using a `path` that scales with `viewBox` and
`preserveAspectRatio="none"`.  This is noted as a follow-up task; the
current implementation uses only `border-radius` and pseudo-elements so that the
shape scales automatically with button width.
