# Social Module – Migration Notes

Scaffold for the social subsystem has been added under `src/social/`:

- **`src/social/types.ts`** – TypeScript interfaces: `SocialEnergyBank`, `RelationshipEntry`, `RelationshipsMap`, `SocialPhaseReport`, and `SocialState`.
- **`src/social/constants.ts`** – `DEFAULT_ENERGY` (= 5) and `SOCIAL_INITIAL_STATE` (the empty starting state).
- **`src/social/index.ts`** – Public re-export barrel; import social types and constants from `'../social'` (or `'@/social'` if path aliases are configured).

`GameState` in `src/types/index.ts` now includes an optional `social?: SocialState` field, and `INITIAL_STATE` in `src/store/GameContext.tsx` is pre-populated with `SOCIAL_INITIAL_STATE` so the social subtree is present from the first render.

Next PRs will add the social engine (action resolution), policy rules, maneuver definitions, and UI components on top of this scaffold.
