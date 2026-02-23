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
2. Add an emoji mapping in `TVLog.tsx` (`TYPE_ICONS`) and a border-left colour in `TVLog.css`
3. Add teaser/full template strings to `src/data/tv-log-templates.json`

### TVLog component

`src/components/TVLog/TVLog.tsx` is the scrollable event-log strip rendered
below the main TV viewport in `TvZone`.

**Props**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `entries` | `TvEvent[]` | — | Full list of TV events, newest first |
| `mainTVMessage` | `string?` | `undefined` | Text shown in the TV viewport; the first log entry is suppressed when it matches, preventing a duplicate row |
| `maxVisible` | `number?` | `3` | Number of rows visible before the log scrolls |

**Teaser truncation** — long event texts are clipped to 60 characters in the
collapsed state.  Click/tap any row to toggle the full text.

**Message templates** — `src/data/tv-log-templates.json` defines `teaser` and
`full` template strings for each event type in a Big-Brother tone.  The
`getTemplate(type)` utility in `src/utils/tvLogTemplates.ts` returns the right
pair for generating event text — intended for use at **event-creation time**
(e.g. when building the `text` passed to `addTvEvent()`), not inside TVLog
itself.  The `tease(text, maxLen?)` function handles plain-text truncation of
whatever text is passed into the component.

### TV Announcement Overlay

`TvZone` renders an inline broadcast-stinger overlay (`TvAnnouncementOverlay`)
inside the TV viewport whenever a **major** game event arrives.  The overlay
displays a styled announcement (title, subtitle, optional live badge and a
progress bar for auto-dismissing announcements) and exposes an info button that
opens a fullscreen `TvAnnouncementModal` with detailed phase copy.

**Triggering an announcement**

Set `meta.major` (or the top-level `major` field) on a `TvEvent` to one of the
recognised keys:

| Key | Auto-dismiss |
|-----|-------------|
| `week_start` | 4 s |
| `nomination_ceremony` | manual |
| `veto_competition` | 4 s |
| `veto_ceremony` | 4 s |
| `live_eviction` | manual |
| `final4` | manual |
| `final3` | manual |
| `final_hoh` | manual |
| `jury` | manual |
| `twist` | 4 s |

Example event shape:

```ts
addTvEvent({
  id: 'evt-nom-1',
  type: 'game',
  text: 'The nominations are set — Rune and Nova are on the block.',
  timestamp: Date.now(),
  meta: { major: 'nomination_ceremony', week: 1 },
});
```

Manual-dismiss announcements also show a **Continue ▶** FAB at the bottom-right
of the TV bezel.  The countdown pauses automatically while the user hovers or
focuses the overlay.

---

## iOS Home Screen (A2HS) / Standalone Testing

When the app is added to an iOS home screen and launched as a PWA (standalone
mode), Safari uses a different rendering context that can strip `backdrop-filter`,
flatten `border-radius` on `<button>` elements, and ignore custom shadows.

### How to reproduce

1. Open the deployed site (`https://georgi-cole.github.io/bbmobilenew/`) in
   **Safari on iOS** (not Chrome/Firefox — they don't support `navigator.standalone`).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch the app from the home-screen icon — it now runs in standalone mode.
4. Verify the HomeHub button stack renders with asymmetric rounded corners and
   visible shadows (not flattened system-style buttons).

### How the fix works

* **`src/main.tsx`** — detects standalone mode via `navigator.standalone` and
  `matchMedia('(display-mode: standalone)')` and adds `is-standalone` to
  `<html>`.
* **`src/styles/_ios-standalone-fixes.css`** — scoped under both
  `@media (display-mode: standalone)` and `html.is-standalone` to ensure rules
  fire even before JS has run. Key overrides:
  * `-webkit-appearance: none` — prevents Safari from rendering native button
    chrome.
  * `border-radius: 28px 8px 28px 8px` — explicit px values that WebKit honours
    in standalone context.
  * `border-radius: inherit` on `::before` / `::after` pseudo-elements.
  * `backdrop-filter: none` + enhanced `box-shadow` — consistent shadow without
    relying on blur compositing.
* **`index.html`** — `apple-mobile-web-app-capable` and related meta tags
  enable proper standalone behaviour and status-bar integration.

### Remote debugging on iOS

1. Enable **Safari → Preferences → Advanced → Show Develop menu** on your Mac.
2. Connect iPhone via USB; trust the connection.
3. Open **Develop → [Your iPhone] → [page]** in desktop Safari DevTools.
4. Inspect element styles and verify `html.is-standalone` class is present and
   the standalone-specific CSS rules are applied.



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


## TvZone Announcement Overlay — phase trigger reference

The inline stinger overlay in `TvZone` is driven by **game-phase transitions**, not text heuristics.  Popups are shown only for the following phases:

| Phase              | Trigger condition                       | Announcement shown            |
|--------------------|-----------------------------------------|-------------------------------|
| `nominations`      | any alive count                         | Nomination Ceremony           |
| `pov_ceremony`     | alive count !== 4                       | Veto Ceremony                 |
| `pov_ceremony`     | alive count === 4                       | Final 4 — Veto Ceremony       |
| `live_vote`        | any alive count                         | Live Eviction                 |
| `final3`           | alive count === 3                       | Final 3                       |
| `final3_decision`  | any alive count                         | Final HOH Decision            |
| `jury`             | any alive count                         | Jury Votes                    |

**No overlay** is shown for: `week_start`, `hoh_comp`, `pov_comp`, `final3_comp1`, `final3_comp2`, `final3_comp3`, and all other phases — these remain normal text messages.

All overlay announcements require manual dismissal (FAB dispatches `tv:announcement-dismiss`).  An explicit `event.meta.major` or `event.major` field on a `TvEvent` can also trigger an overlay for backwards compatibility (valid keys: `nomination_ceremony`, `veto_ceremony`, `live_eviction`, `final4`, `final3_announcement`, `final_hoh`, `jury`, `twist`).
