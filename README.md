# bbmobilenew — Big Brother AI Edition

A React + TypeScript + Vite mobile-first app.

## Dev setup

```bash
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # output in dist/
npm run preview    # preview the production build
```

## GitHub Pages deployment

Pushes to `main` trigger the **Build and deploy Pages** workflow, which runs
`npm run build` and publishes the `./dist` folder to the `github-pages`
environment. The site is served at
`https://georgi-cole.github.io/bbmobilenew/`.

## Architecture

```
src/
  types/           # TypeScript interfaces (Player, GameState, Phase…)
  store/           # GameContext — useReducer state, no Redux
  components/
    ui/            # StatusPill, PlayerAvatar, TvZone
    layout/        # AppShell, NavBar
  screens/         # One folder per screen
    HomeHub/
    GameScreen/    # TvZone + interactive avatar roster
    DiaryRoom/     # Confessional + event log
    Houseguests/
    Profile/
    Leaderboard/
    Credits/
    Week/
    CreatePlayer/
  routes.tsx       # All routes in one place
  App.tsx          # Root: GameProvider + RouterProvider
```

### Adding a new screen

1. `src/screens/MyScreen/MyScreen.tsx` (+ optional `.css`)
2. Import and add a `<Route>` in `src/routes.tsx`
3. _(Optional)_ Add a nav tab in `src/components/layout/NavBar.tsx`

### Adding a new status pill variant

1. Add the key to `StatusPillVariant` in `src/types/index.ts`
2. Add a `.status-pill--<key>` rule in `src/components/ui/StatusPill.css`

### Adding a new game event type

1. Extend the `TvEvent.type` union in `src/types/index.ts`
2. Add an emoji mapping in `TvZone.tsx` and a border-left colour in `TvZone.css`

