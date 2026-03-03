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
| `[CreditsScene] mounted { url, env }` | Component mounted successfully |
| `[CreditsScene] canvas init error { message, stack }` | Runtime canvas failure — check the stack trace |

## Editing credits content

Credits data lives in **`src/data/credits.ts`** — each entry has a `role` and `name` field.

## If the cinematic scene doesn't appear

1. Check for `[CreditsScene] canvas init error` in the console.
2. If the fallback UI shows "Credits unavailable", a canvas context error occurred.
3. Verify your browser supports the Canvas 2D API (all modern browsers do).
4. Check the network tab for any failed chunk loads (the Credits component is lazy-loaded).
