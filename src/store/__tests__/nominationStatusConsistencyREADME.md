# Nomination status consistency regression

The strategic AI LOH planner can replace the provisional nominees selected by the base game reducer. The final `game.nomineeIds` array is the canonical nomination block used by Faux TV.

`nominationStatusConsistency.test.ts` covers the two failure shapes seen in the mobile UI:

- one provisional nominee overlaps the final strategic block;
- none of the provisional nominees overlap the final strategic block.

The guard also verifies that an uncommitted human nomination draft is not rewritten.
