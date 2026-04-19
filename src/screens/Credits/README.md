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

Credits data lives in **`src/data/credits.ts`**. The screen now keeps the opening credit visible immediately on first load, then fades later credits in and out across a 19.6 second sequence, positioned above the city skyline on the right, and plays `public/assets/sounds/credits_sound.mp3` during the run.

## Required screen assets

The credits screen uses these public assets:

- `public/assets/credits/city skyline reduced.jpg`
