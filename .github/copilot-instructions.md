# Copilot repository instructions

## Stack

This is a **React 19 + TypeScript + Vite** single-page application with a nested **Express** server (`server/`) that acts as a proxy for OpenAI and houses diary/season API routes.

Key libraries: React Router, Redux Toolkit (game/finale/challenge/settings/social/ui slices), Capacitor (iOS), Vitest, Playwright.

## Repo layout

```
src/            React + TS app source
  types/        Shared interfaces (Player, GameState, Phase, …)
  store/        Redux Toolkit store (store.ts) and slice reducers (game, finale, challenge, settings, social, ui, ads, …); GameContext is limited-scope legacy state
  components/   Reusable UI (ui/, layout/) and feature components
  screens/      One folder per route/screen
  features/     Self-contained feature slices
  minigames/    Standalone mini-game implementations
server/         Express API (OpenAI proxy, diary routes)
docs/           Architecture docs
e2e/            Playwright tests
tests/          Vitest unit/integration tests
```

## Code style and conventions

- Follow the naming and file-structure patterns already present in the area you are editing.
- Prefer **minimal, surgical diffs**. Do not reformat unrelated code or touch files outside the task scope.
- Use `100dvh` (dynamic viewport) rather than `100vh` for full-height mobile layouts.
- Use `cryptoSeed()` from `src/features/riskWheel/cryptoSpin` for non-deterministic per-session seeds; treat `seed === 0 || seed === undefined` as "no explicit seed".
- Export only React components from `.tsx` files; put non-component helpers in separate `.ts` modules to satisfy `react-refresh/only-export-components`.

## Validation

Before finishing any task, run the commands relevant to the area touched:

```bash
npm run lint:ci      # ESLint — zero warnings
npm run typecheck    # TypeScript — no emit
npm test             # Vitest unit + integration suite
```

For end-to-end changes:

```bash
npx playwright test
```

## Environment and secrets

- Never commit `server/.env` or any file ending in `.env`.
- Document new server env vars in `server/.env.example` with a comment and a safe default.

## UI changes

- Include before/after screenshots or a short screen recording in the PR description.

## General

- Do not introduce new dependencies unless absolutely necessary.
- Do not remove or skip existing tests.
- Do not undertake broad refactors unless the task explicitly requires it.
- Preserve existing architecture; if you spot an unrelated bug, open a separate issue rather than fixing it inline.
