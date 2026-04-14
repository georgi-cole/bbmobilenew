# Contributing to bbmobilenew

Thank you for contributing! This guide covers everything you need to get up and running quickly, whether you are a human contributor or a Copilot agent starting a new task.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |

---

## Setup

Install all dependencies (root + nested `server/` package) in one step:

```bash
npm run bootstrap
```

To install only the root:

```bash
npm ci
```

To install only the server:

```bash
cd server && npm ci
```

Copy the server environment file and fill in your values before running the server:

```bash
cp server/.env.example server/.env
# Edit server/.env — never commit it
```

---

## Development

```bash
npm run dev        # Vite dev server at http://localhost:5173
```

```bash
cd server
npm run dev        # Express API server (default port 4000)
```

---

## Validation commands

Run these before opening or finalising a PR. Only run the suites relevant to the area you touched; running the full suite is fine but not always required for focused changes.

```bash
npm run lint:ci        # ESLint, zero warnings allowed
npm run typecheck      # TypeScript, no emit
npm test               # Vitest unit/integration suite
```

For end-to-end tests (requires a running dev server):

```bash
npx playwright test    # or: npm run test:e2e if the script exists
```

---

## Repo map

| Path | What lives here |
|------|----------------|
| `src/` | React + TypeScript app source |
| `src/types/` | Shared TypeScript interfaces |
| `src/store/` | GameContext / useReducer state |
| `src/components/` | Reusable UI and layout components |
| `src/screens/` | One folder per route/screen |
| `src/features/` | Self-contained feature slices |
| `src/minigames/` | Standalone mini-game implementations |
| `server/` | Express API server (OpenAI proxy, diary routes) |
| `docs/` | Architecture and design docs |
| `e2e/` | Playwright end-to-end tests |
| `tests/` | Vitest unit and integration tests |
| `.github/workflows/` | CI, lint, deploy, and e2e workflow definitions |

---

## Pull request expectations

- **Keep changes small and surgical.** One concern per PR is strongly preferred.
- **Do not modify unrelated code.** If you spot a pre-existing issue outside the scope of your task, open a separate issue rather than fixing it inline.
- **Match existing conventions.** Naming, file structure, import order, and code style should follow the patterns already present in the area you are editing.
- **UI changes must include screenshots or a short screen recording** in the PR description so reviewers can verify the visual result without running the app.
- **Do not commit `.env` or any file containing secrets.** Use `server/.env.example` to document new environment variables.
- **Add or update tests** for any logic changes. Place unit tests next to the source file (`__tests__/` subdirectory) or under `tests/` for integration/e2e scenarios.

---

## Environment variables and secrets

All server-side env vars are documented in [`server/.env.example`](server/.env.example). When adding a new variable:

1. Add it to `server/.env.example` with a comment explaining its purpose and default value.
2. Never add actual values to `.env.example`.
3. Never commit `server/.env` or any file ending in `.env`.

---

## Branch strategy

- Branch off `main` for every change.
- Use a short descriptive branch name, e.g. `fix/diary-room-scroll` or `feat/new-minigame`.
- Open a PR against `main` when ready.

---

## CI checks

The following GitHub Actions workflows run on pull requests:

| Workflow | What it checks |
|----------|---------------|
| `ci.yml` | Build |
| `lint.yml` | ESLint (`lint:ci`) |
| `e2e-playwright.yml` | Playwright end-to-end tests |

A PR should pass all CI checks before merging.
