# Houseguests Migration — Verification Guide

This document describes how to verify the avatar image system and the houseguest profile modal
that were ported from **bbmobile** into **bbmobilenew**.

---

## Files added / modified

| Change  | File |
|---------|------|
| ADD | `src/data/houseguests.ts` — canonical dataset (22 houseguests) |
| ADD | `public/avatars/*.png` — 28 avatar images copied from bbmobile |
| ADD | `src/utils/avatar.ts` — `resolveAvatar()` + `getDicebear()` |
| ADD | `src/utils/houseguestLookup.ts` — `enrichPlayer()`, `findById()`, `findByName()` |
| ADD | `src/types/houseguest.ts` — `Houseguest` and `EnrichedPlayer` interfaces |
| MOD | `src/components/ui/PlayerAvatar.tsx` — render `<img>` with `onError` fallback |
| MOD | `src/components/ui/PlayerAvatar.css` — image and fallback emoji styles |
| ADD | `src/components/HouseguestProfile/HouseguestProfile.tsx` — profile sheet modal |
| ADD | `src/components/HouseguestProfile/HouseguestProfile.css` — modal styles |
| MOD | `src/screens/Houseguests/Houseguests.tsx` — open HouseguestProfile on avatar tap |

---

## Manual verification steps

### 1. TypeScript build passes

```bash
cd bbmobilenew
npm run build        # or: yarn build
npm run typecheck    # no TS errors
```

### 2. Avatar images load

1. Run `npm run dev` and open the app in a browser.
2. Navigate to the **Houseguests** screen.
3. Player tiles should display photo-realistic AI avatars instead of emoji for players
   whose names match an image in `public/avatars/` (e.g. Finn, Mimi, Rae …).

### 3. Profile modal opens

1. Tap / click any avatar tile on the Houseguests screen.
2. A bottom-sheet modal should slide up showing:
   - Full name, age, location, profession
   - Motto (if any)
   - Fun fact (if any)
   - Bio / story paragraph
3. Click the **✕** button or tap the dark overlay to dismiss the modal.

### 4. Fallback behaviour (missing avatar)

1. Temporarily rename or delete `public/avatars/Finn.png`.
2. Reload the app — Finn's tile should render a [Dicebear pixel-art](https://www.dicebear.com/) avatar
   instead of a broken image.
3. Open the browser DevTools Network tab and confirm there is **only one** failing request
   for `Finn.png` — no repeated 404 storms (the `onerror = null` guard prevents loops).
4. Restore the file when done.

### 5. Evicted players

1. Advance the game until at least one player is evicted.
2. Navigate to the Houseguests screen — evicted/jury players appear in the lower section
   with reduced opacity (`houseguests-screen__grid--out`), consistent with previous behaviour.

---

## Avatar resolver priority

`resolveAvatar(player)` in `src/utils/avatar.ts` tries in order:

1. `player.avatar` — if it is already a URL (starts with `http` or `/`), use it directly.
2. `/avatars/{Name}.png` — capitalised first letter, matching the bbmobile file naming.
3. Dicebear SVG (`getDicebear(player.name)`) — set via `<img onError>` as a client-side fallback.

---

## Dataset notes

`src/data/houseguests.ts` exports:

```ts
export default HOUSEGUESTS;        // full array
export function getAll()           // copy of array
export function getById(id)        // lookup by stable lowercase id
export function findByName(name)   // case-insensitive name lookup
```

`src/utils/houseguestLookup.ts` re-exports these and adds `enrichPlayer(player)` which
merges a live `Player` object (from Redux) with the static profile fields.
