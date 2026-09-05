# Public Mode reference

This document is the durable reference for the audience/public-request system used by Classic and Cupid, with Vox Populi-specific adaptations. Surveyeval intentionally does not use this system.

## Core contract

Public Mode is controlled by `game.publicModeEnabled`. When it is off, public approval may still exist as stored game data, but the game must not generate public requests or advance request progress. When it is on, requests are generated at the weekly boundary and are actionable through the Social module and relevant game events.

The canonical relationship check is `src/publicOpinion/publicDirectionContracts.ts`. It combines the relationship sources that exist in saved games:

- the legacy `RelationshipsMap` alliance/bond data;
- Reality Mode alliances;
- Drama/social alliances;
- Cupid pair data.

An alliance-breaking request is eligible only when a real active alliance exists. A merely neutral or positive relationship is not enough. Cupid-linked pairs are protected from contradictory break-alliance requests. If an active request becomes impossible because the relationship changes, it is expired neutrally instead of remaining misleading or being marked as a player failure.

## Request generation

`PublicDirectionService` chooses only from currently eligible directions. The default cycle creates two requests, with the human player prioritized when Public Mode is active. Each request carries a rationale, an action hint, a completion label, and (when needed) an invalidation reason so the UI can explain what the audience wants and how to respond.

Classic and Cupid can receive relationship, loyalty, betrayal, confrontation, competition, veto, and influence requests, subject to the current game state. Vox Populi uses audience-facing wording and avoids requests that do not fit its rules, such as asking the player to influence the Head of Household. Its practical request set emphasizes public approval, visible loyalty, repairing or changing relationships, competition performance, and veto use while also avoiding nomination risk.

## Action-to-request wiring

The mapping is intentionally explicit in `publicOpinionMiddleware.ts` and `MissionActionMapper.ts`:

| Player/game action               | Public request progress |
| -------------------------------- | ----------------------- |
| Repair, apologize, clear the air | `apologized_to`         |
| Break an alliance or bromance    | `broke_alliance`        |
| Propose an alliance              | `formed_alliance`       |
| Betray                           | `betrayal`              |
| Spread a rumor                   | `spread_rumor`          |
| Confront or publicly call out    | `confronted_player`     |
| Pitch/ask for a target           | `influenced_hoh`        |
| Ally/protect                     | `showed_loyalty`        |

Direct actions are weighted as exact matches. Indirect social actions may contribute partial progress where the request supports it. The configured completion threshold is 100; completion rewards, failure penalties, and approval-band behavior live in `src/publicOpinion/publicOpinionConfig.ts`.

## Lifecycle and UI

1. At the week boundary, eligible requests are generated only when Public Mode is enabled.
2. The Public Meter shows the audience rationale, suggested action, reward, and human-player progress.
3. The Social module shows an Audience Directive banner and can focus the relevant action for the selected relationship.
4. Matching actions or game events advance the request and can emit a TV/public-feed cue for the human player.
5. Phase changes and mission events revalidate active relationship-bound requests. Impossible requests expire neutrally.

## Audience profile ratings

Every public profile has three live ratings. The visible overall approval is their arithmetic mean, rounded to a whole number. This keeps the headline score understandable while making the audience reaction explainable rather than a single opaque number.

| Rating        | What informs it                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Charisma**  | Social warmth, conflicts, apologies, visible rapport, and how naturally a moment plays on-screen.       |
| **Game**      | Competition results, veto/safety moves, nominations, strategic influence, and decisive gameplay.        |
| **Integrity** | Promises kept or broken, loyalty, alliance conduct, betrayals, and whether a vote matches a commitment. |

Opening profiles receive a small, balanced lean from the AI contestant identity (for example, social butterflies begin with more Charisma texture and loyal anchors with more Integrity texture), without changing their starting overall approval. The human player starts neutral and earns their profile through play.

The Public Meter's **Audience Dossier** opens by tapping any cast card. It shows the three ratings, a dynamic audience archetype, and any active public request. The player-facing **What changed** area tells the selected player's recent audience story, while the main Public Feed tells the rest of the house's story so the same event is not repeated across the screen. Those moments use the houseguest's name and a reality-show voice; approval values remain internal and the UI shows only directional signals. Legacy saves without a breakdown gracefully render as an even split until the next public event writes their first receipt.

Ordinary public reactions also receive a small seeded audience-mood adjustment. It may soften or amplify a result but cannot reverse the direction of the underlying action. It is deterministic for the saved season, so reloads remain stable. Explicit Public Request rewards and penalties stay exact: completing an advertised request is never a hidden gamble.

Primary UI references:

- `src/screens/PublicMeter/PublicMeter.tsx`
- `src/components/SocialPanelV2/SocialPanelV2.tsx`
- `src/publicOpinion/publicOpinionMiddleware.ts`
- `src/publicOpinion/audienceBreakdown.ts`

## Configuration and maintenance rules

When adding a new public request type:

1. Add its type and copy to `src/publicOpinion/types.ts` and `PublicDirectionService.ts`.
2. Define its eligibility in `publicDirectionContracts.ts` if it depends on relationships, alliances, Cupid, or Vox rules.
3. Add its direct and indirect action mappings in `MissionActionMapper.ts`.
4. Add the corresponding event handling in `publicOpinionMiddleware.ts`.
5. Add the UI hint/rationale if the action is not self-explanatory.
6. Add tests for both the valid and invalid state, especially “no alliance means no break request.”

Do not infer an alliance from affinity alone. Do not make Public Mode behavior unconditional: callers and tests should set `publicModeEnabled: true` explicitly when testing it.

When adding a new public-opinion reason, classify it in `getWeights` in `audienceBreakdown.ts`. The reason must move the rating that viewers would reasonably judge first, with only secondary spillover into the other ratings. Add a focused test whenever the action has a strong promise/loyalty or competition implication.

## Verification

Focused Public Mode tests:

```bash
npx vitest run tests/unit/publicOpinion/publicOpinionMiddleware.test.ts tests/unit/publicOpinion/missionActionMapper.test.ts src/publicOpinion/__tests__/PublicDirectionService.test.ts --reporter=dot
```

The broader project checks remain the source of truth for release validation:

```bash
npm run typecheck
npm run lint:ci
npm test
```

The focused coverage currently includes request eligibility, alliance-aware generation, exact action mapping, Public Mode gating, request progress, and invalidation behavior.
