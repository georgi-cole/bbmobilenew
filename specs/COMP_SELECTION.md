# Comp Selection — Design Spec (RFC / WIP)

> **Status:** Draft — exploratory PR.  Implementation details will be updated
> once the repository's API endpoints, storage pattern, and UI conventions have
> been confirmed.

---

## 1. Overview

The **Comp Selection** feature lets players (and/or admins) choose which
competitions are eligible to appear during a season.  It is a game-settings
control that lives in the Settings screen and is persisted across sessions.

---

## 2. Modes

| Mode | Description |
|------|-------------|
| **Full pool** | All enabled competitions are equally likely each week. |
| **Weekly draw** | Each week a random subset of `weeklyLimit` comps is drawn from the enabled pool. |
| **Category filter** | Player narrows the pool to a single category before saving; only matching comps are eligible. |

---

## 3. Data model

### 3.1 Client-side (TypeScript)

```ts
interface CompSelectionPayload {
  enabledIds:     string[];          // IDs of enabled comps
  weeklyLimit:    number | null;     // null = no limit
  filterCategory: CompCategory | null; // null = all categories
}
```

Persisted via `localStorage` (same pattern as `SettingsState` in
`src/store/settingsSlice.ts`) until a server-side endpoint is available.

### 3.2 Server-side (PostgreSQL — forward-looking stub)

See `src/migrations/20260304_add_comp_selection.sql`.

Key tables:

- `comp_selection_settings` — one row per (user, season); holds `weekly_limit`
  and `filter_category`.
- `comp_selection_enabled_games` — child rows for each enabled `game_id`.

### 3.3 JSON schema

See `src/api/schema/comp_selection.json` (JSON Schema draft-07).  Used by the
server to validate the `POST /api/settings/comp-selection` request body.

---

## 4. Validation rules

| Rule | Condition |
|------|-----------|
| **At least one comp** | `enabledIds.length >= 1` |
| **Known IDs only** | Every ID in `enabledIds` must exist in the game catalogue |
| **Weekly limit bounds** | `weeklyLimit === null \|\| (weeklyLimit >= 1 && weeklyLimit <= enabledIds.length)` |
| **Category enum** | `filterCategory` must be one of `physical`, `mental`, `endurance`, `social`, `mixed`, or `null` |

Validation is implemented client-side in `src/components/compSelectionUtils.ts`
(`validateCompSelection`). For constraints that are expressible in draft-07 JSON
Schema, the client-side rules mirror the server schema; other rules (e.g. **Known
IDs only** and `weeklyLimit <= enabledIds.length`) are enforced in application
logic outside the JSON Schema.

---

## 5. UI component

**File:** `src/components/CompSelection.tsx`

The component uses **dependency injection** for data fetching and persistence so
it can be exercised without server changes:

```tsx
<CompSelection
  fetchGames={() => Promise.resolve(MY_GAMES)}
  onSave={(payload) => console.log(payload)}
/>
```

### 5.1 Props

| Prop | Type | Description |
|------|------|-------------|
| `fetchGames` | `() => Promise<CompGame[]>` | Async loader for the available game catalogue |
| `onSave` | `(p: CompSelectionPayload) => Promise<void> \| void` | Called with the validated payload on save |
| `initialPayload` | `Partial<CompSelectionPayload>` | Pre-populates the form (e.g. from localStorage) |

### 5.2 UI states

- **Loading** — spinner/text while `fetchGames()` is in-flight.
- **Error** — fetch failure message.
- **Idle** — full form (filter bar → game list → weekly limit → save button).
- **Saving** — save button disabled + "Saving…" label.
- **Success** — "Saved!" confirmation after `onSave` resolves.
- **Validation error** — inline error list when the save attempt fails validation.

---

## 6. Integration points (TBD)

These will be confirmed by inspecting the repository after the draft PR is
created:

| Concern | Current best guess | To confirm |
|---------|--------------------|------------|
| **API endpoint** | `POST /api/settings/comp-selection` | Check `server/` directory |
| **Game catalogue source** | `src/store/challengeSlice.ts` game registry | Confirm canonical list |
| **Storage** | `localStorage` → eventually DB via migration | Check `settingsSlice.ts` pattern |
| **UI framework** | React (web, Vite) | Confirm no React Native wrapper |
| **Styling** | CSS modules matching `Settings.css` conventions | Check `src/screens/Settings/` |
| **i18n** | None observed yet — plain string literals | Check for any i18n setup |

---

## 7. Next steps

1. **Inspect** the repo's `server/` directory and existing API routes to find
   the canonical endpoint pattern.
2. **Wire** `fetchGames()` to the actual game catalogue (likely
   `src/store/challengeSlice.ts` or `src/minigames/`).
3. **Integrate** `onSave()` with the settings store (extend `settingsSlice.ts`)
   and/or server API.
4. **Add CSS** to `src/screens/Settings/Settings.css` (or a co-located module)
   following existing class-name conventions.
5. **Convert** the SQL migration to the project's migration tooling once
   confirmed (knex / Prisma / raw SQL).
6. **Expand tests** in `tests/comp_selection.test.ts` to cover the wired
   integration paths.
