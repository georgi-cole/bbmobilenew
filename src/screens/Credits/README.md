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

## Editing credits content

Credits data lives in **`src/data/credits.ts`**. The screen renders each entry as a stacked text card over the static background image, positioned above the city skyline on the right.

## Required screen assets

The credits screen uses these public assets:

- `public/assets/credits/credits-background.png`
