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
    DiaryRoom/     # Confessional + event log + Weekly Diary Room Log
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

---

## Diary Room Log — Weekly

The **Weekly Diary Room Log** feature lets admins record and publish a
structured summary of each Big Brother game week. Guests can view published
weeks; only admins may create, edit, or export unpublished drafts.

### Feature flag

| Variable | Default | Description |
|---|---|---|
| `FEATURE_DIARY_WEEK` (server) | `true` | Set to `false` to disable the backend routes entirely. |
| `VITE_FEATURE_DIARY_WEEK` (frontend) | `true` | Set to `false` to hide the Weekly tab in the UI. |
| `ADMIN_API_KEY` (server) | _(unset)_ | Secret key required for admin write operations. |

### Migration

If you add a relational database, run the migration in
`src/migrations/20260222_add_diary_week_table.sql` against your PostgreSQL
instance:

```bash
psql -d <your_db> -f src/migrations/20260222_add_diary_week_table.sql
```

To revert, run the DOWN section at the bottom of the migration file.

> **Current behaviour:** The server uses an in-memory store (no persistent DB).
> Data is lost on restart. The SQL migration is a forward-looking schema stub
> for when a persistent DB is introduced.

### API endpoints

All routes are under `/api` and rate-limited together with the rest of the API.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/seasons/:seasonId/weeks` | Guest | List weeks. Add `?publishedOnly=true` to hide drafts (admins always see all). |
| `GET` | `/api/seasons/:seasonId/weeks/:weekNumber` | Guest (published only) | Fetch a single week. |
| `POST` | `/api/seasons/:seasonId/weeks` | **Admin** | Create a new week. |
| `PATCH` | `/api/seasons/:seasonId/weeks/:weekNumber` | **Admin** | Partially update a week. |
| `GET` | `/api/weeks/:id/export?format=json` | Guest (published only) | Export full week payload as JSON. |

Admin requests must include the `x-admin-key` header matching `ADMIN_API_KEY`.

### Payload example — Create week

```jsonc
// POST /api/seasons/1/weeks
// x-admin-key: <your-ADMIN_API_KEY>
{
  "weekNumber": 1,
  "startAt": "2026-01-05",
  "endAt": "2026-01-12",
  "hohWinner": "Alice",
  "povWinner": "Bob",
  "nominees": ["Charlie", "Dave"],
  "replacementNominee": null,
  "evictionVotes": [
    { "voter": "Alice", "votedFor": "Charlie" },
    { "voter": "Bob",   "votedFor": "Charlie" },
    { "voter": "Eve",   "votedFor": "Dave" }
  ],
  "socialEvents": ["Pool party on Day 3", "Cooking competition Day 5"],
  "misc": ["Houseguest twist announced"],
  "notes": "Quiet week overall.",
  "published": false
}
```

Response `201 Created`:

```jsonc
{
  "data": {
    "id": "dw_1704412800000_1",
    "seasonId": "1",
    "weekNumber": 1,
    "hohWinner": "Alice",
    "povWinner": "Bob",
    "nominees": ["Charlie", "Dave"],
    "replacementNominee": null,
    "evictionVotes": [...],
    "published": false,
    "createdBy": "admin",
    "createdAt": "2026-01-05T00:00:00.000Z",
    "updatedBy": "admin",
    "updatedAt": "2026-01-05T00:00:00.000Z"
  }
}
```

### Running the tests

```bash
# from the repo root — requires server deps to be installed
cd server && npm install && cd ..
NODE_PATH=./server/node_modules node --test tests/diaryWeek.spec.cjs
```

All 15 integration tests should pass (create, fetch, patch, export, list).

### QA checklist

- [ ] `npm run typecheck` — no TypeScript errors
- [ ] `npm run lint` — no ESLint errors
- [ ] `NODE_PATH=./server/node_modules node --test tests/diaryWeek.spec.cjs` — all 15 tests pass
- [ ] Start the server (`cd server && npm start`) and the frontend (`npm run dev`)
- [ ] Open the Diary Room screen → **Weekly** tab appears
- [ ] Without an admin key, the editor is hidden; only the view is shown
- [ ] Enter a valid admin key → **Edit** button appears
- [ ] Create a week as admin → week appears in view
- [ ] Export JSON downloads a `.json` file
- [ ] A non-admin `curl -X POST /api/seasons/1/weeks` returns `403 Forbidden`

