# Animation Setup & Rebuild Guide

## Overview

This project is a **React web application** (Vite + TypeScript), not a React Native app.
All animation components use CSS keyframe animations and React state — no native rebuild
or Babel plugin is required.

> **Note:** The original issue referenced `react-native-reanimated`, but the repository
> is a standard web project. The animation deliverables have been implemented using
> browser-native CSS animations for full compatibility without any native build step.

---

## New Animation Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AnimatedVoteResultsModal` | `src/components/AnimatedVoteResultsModal/` | Sequential per-vote reveal, eviction announcement, tie banner |
| `TiebreakerModal` | `src/components/TiebreakerModal/` | HOH tie-break UI + AI-HOH countdown |
| `NominationAnimator` | `src/components/NominationAnimator/` | Full-screen nomination ceremony animation |
| `CrownAnimation` | `src/components/CrownAnimation/` | HOH/POV winner crown + shine overlay |

---

## Running the Project

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run unit tests
npm test

# Type-check
npm run typecheck
```

No CocoaPods, no Android Gradle, no Metro cache — this is a standard web app.

---

## Using the New Animation Components

### AnimatedVoteResultsModal

```tsx
import AnimatedVoteResultsModal from './components/AnimatedVoteResultsModal/AnimatedVoteResultsModal';

<AnimatedVoteResultsModal
  nominees={tallies}           // VoteTally[]
  evictee={evicteePlayer}      // Player | null (null = let component detect tie)
  onTiebreakerRequired={(ids) => dispatch(setTieBreak(ids))}
  onDone={() => dispatch(dismissVoteResults())}
  revealIntervalMs={700}       // ms between each vote reveal
  postRevealDelayMs={1000}     // ms to wait after last vote
  countdownMs={4000}           // countdown before onDone fires
/>
```

### TiebreakerModal

```tsx
import TiebreakerModal from './components/TiebreakerModal/TiebreakerModal';

<TiebreakerModal
  tiedNominees={tiedPlayers}          // Player[]
  isHoh={currentUserIsHoh}            // boolean
  onSelect={(id) => dispatch(submitTieBreak(id))}
  countdownSec={3}                    // AI HOH countdown (seconds)
/>
```

### NominationAnimator

```tsx
import NominationAnimator from './components/NominationAnimator/NominationAnimator';

<NominationAnimator
  nominees={nominatedPlayers}  // Player[]
  onDone={() => setShowNomAnim(false)}
  holdMs={2000}                // how long to hold the centred state
/>
```

### CrownAnimation

```tsx
import CrownAnimation from './components/CrownAnimation/CrownAnimation';

<CrownAnimation
  winner={hohWinnerPlayer}    // Player
  label="Head of Household"  // competition name
  onDone={() => setShowCrown(false)}
  durationMs={3000}           // total display duration before onDone
/>
```

---

## Accessibility

All new components:
- Include `role="dialog"` or `role="status"` with `aria-label`
- Use `aria-live="assertive"` for dynamic announcements
- Respect `prefers-reduced-motion` — all CSS animations are disabled via media query
  when the user has requested reduced motion

---

## Testing

```bash
# Run all unit tests
npm test

# Run only the new competition / log tests
npx vitest run tests/competition.test.ts tests/logsReducer.test.ts
```

---

## QA Checklist

### HOH Competition Guard
- [ ] Play TapRace and submit 0 taps — verify the AI player with the highest score wins HOH, not the 0-tap player
- [ ] All players score 0 (edge case) — a winner is still deterministically selected

### Vote Results — Non-Tie
- [ ] Advance game to `eviction_results` — VoteResultsPopup (or AnimatedVoteResultsModal) shows votes one at a time
- [ ] After last vote, "EVICTED" label appears on the loser
- [ ] Clicking anywhere skips the countdown

### Vote Results — Tie
- [ ] Seed a game where votes tie (use Debug Panel to force nominees and skip to eviction)
- [ ] TiebreakerModal appears
- [ ] Human HOH: two nominee buttons shown; selecting one evicts them
- [ ] AI HOH: countdown displays; after countdown, AI picks an evictee

### Nomination Animation
- [ ] Instantiate `<NominationAnimator nominees={...} onDone={...} />` in a test page
- [ ] Backdrop dims, avatar scales to centre with ❓ badge
- [ ] After holdMs, avatar returns and onDone fires

### Crown Animation
- [ ] Instantiate `<CrownAnimation winner={...} label="Head of Household" onDone={...} />`
- [ ] Crown scales in, wobbles, shine sweep plays
- [ ] After durationMs, onDone fires

### TV Log — Replacement Nominee
- [ ] Trigger a veto save + AI HOH replacement — verify the replacement-nom entry has a unique ID
- [ ] New events push the replacement-nom entry down the log (no pinning)

### Reduced Motion
- [ ] Set OS/browser to "prefers-reduced-motion: reduce"
- [ ] All animations are suppressed; content is still visible
