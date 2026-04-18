# Credits Screen — Local Testing Guide

## Running locally

```bash
# Development server (hot-reload):
npm run dev
# Then open: http://localhost:5173/#/credits

# Production preview (closest to GitHub Pages):
npm run build && npm run preview
# Then open: http://localhost:4173/#/credits
```

## What to look for in the console

Open DevTools → Console before navigating to `/#/credits`.

| Log message | Meaning |
|---|---|
| `[CreditsScene] canvas init error` | Pixi scene setup failed and the fallback overlay is shown |

## Editing credits content

Credits data lives in **`src/data/credits.ts`**. The screen maps each `{ role, name }` pair into a cinematic two-line credit card inside the projector beam.

## Required scene assets

The Pixi scene loads these public assets through the Pixi `Assets` loader:

- `public/assets/credits/city.png`
- `public/assets/credits/big-eye.svg`
- `public/assets/credits/moon.svg`
