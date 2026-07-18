# Incoming Social Interactions: Research and Redesign

## Design goal

Incoming interactions should feel like houseguests pursuing their own goals, not a notification feed that gives the player four differently colored affinity buttons. A strong interaction must answer four questions:

1. Why did this person approach me now?
2. What do they want from me?
3. What am I risking by answering this way?
4. Will the game remember what I said when I act later?

The optimal solution is a deterministic social simulation with authored voice, persistent memory, concrete commitments, and downstream game consequences. An LLM can eventually add surface variation, but it should never own truth, rules, or outcomes.

## What successful systems do

### Prom Week / Comme il Faut

[Prom Week's social exchanges](https://promweek.soe.ucsc.edu/2012/02/22/prom-weeks-social-exchanges/) model an interaction as an initiator's intent plus the responder's reaction. Desires and reactions are ranked from many social considerations, and scenes are selected only after the simulation determines the result.

Its broader [social physics design](https://promweek.soe.ucsc.edu/2011/11/12/gameplay-and-social-physics/) adds the crucial ingredients missing from shallow dialogue systems: characters with particular histories, remembered actions referenced in later dialogue, and repercussions that spread across multiple characters.

Transferable lesson: select an intent from state first, express it through dialogue second, then create durable and sometimes indirect state changes.

### The Sims 4: Neighborhood Stories

[Neighborhood Stories](https://www.ea.com/games/the-sims/the-sims-4/news/introducing-neighborhood-stories) lets autonomous Sims call the player for input, delays the actual life change, and later reports what happened. Traits and relationship levels affect whether changes are considered, while dynamic outcomes account for conflicting traits and existing relationships.

Transferable lesson: requests become engaging when the answer causes a later event and a follow-up, rather than resolving completely on the same card.

### Middle-earth: Shadow of War

The official [Shadow of War overview](https://www.shadowofwar.com/about/) describes the Nemesis System as producing unique personal stories with individual enemies and followers. Its power is not conversational breadth; it is explicit recurrence. A character returns with visible evidence that a previous encounter mattered.

Transferable lesson: prioritize a small number of remembered, resurfaced relationship beats over a large volume of disposable messages.

### Generative Agents research

The [Generative Agents paper](https://arxiv.org/abs/2304.03442) found that observation, planning, and reflection each contributed to believable behavior. Agents stored experiences, synthesized higher-level reflections, retrieved relevant memories, and used them in future plans.

Transferable lesson: raw event memory is not enough. The simulation eventually needs derived beliefs such as “the player makes promises but breaks them under pressure.”

## Diagnosis of the previous module

The existing implementation already had strong foundations:

- phase-aware autonomous intent selection;
- relationship, personality, urgency, and event-pressure scoring;
- gratitude, resentment, neglect, and trust memory;
- authored voice profiles and large scenario variant banks;
- delivery pacing, priority, deduplication, expiration, and save safety.

The artificial feeling came from the final meter of the experience:

- most text described vague “people,” “things,” and “movement” rather than named social objects;
- replies mostly mapped to positive, neutral, negative, or dismiss;
- the player could reassure a nominee and nominate them moments later without the game connecting those actions;
- consequences were immediate affinity deltas, so interactions rarely created anticipation;
- useful information and flavor messages had nearly identical mechanical value;
- hidden memory existed, but the interface did not show the player what the relationship expected next.

## Implemented loop: social contracts

High-stakes affirmative responses can now create one of three promises:

| Conversation | Promise | Verification point |
| --- | --- | --- |
| Nominee or safety request to the human LOH | Keep them off the block | Nominations lock |
| Nominee pitch to the human safety holder | Use safety on them | Safety decision locks |
| Nominee pitch before the human eviction vote | Vote to keep them | Human vote locks |

The loop is:

1. An AI houseguest chooses an intent from game state.
2. The inbox explains why the approach happened and what is at stake.
3. The player can make a clearly labeled promise or stay noncommittal.
4. The promise remains visible in an Active Promises section.
5. The corresponding nomination, safety, or vote action verifies the promise.
6. The beneficiary remembers a kept or broken promise.
7. Affinity, trust/resentment, influence, the TV/Diary feed, and future AI decisions change.
8. The inbox builds a visible credibility record from kept and broken promises.

Current default tuning:

- kept promise: +9 beneficiary affinity, +4 gratitude, +3 trust momentum, +100 influence;
- broken promise: -16 beneficiary affinity, +5 resentment, -4 trust momentum, -150 influence;
- skipped or twist-invalidated decision windows void the promise instead of unfairly punishing the player.

## Concrete information

Gossip and warnings now select and name a living third-party houseguest, using the sender's relationship graph to prefer a plausible target. Engaging with actionable gossip or warnings grants information, so these interactions are strategically distinct from compliments and check-ins.

## Presentation rules

- Show **Why now** and **What it means** on every card.
- Use response descriptions to expose social meaning without revealing exact hidden calculations.
- Mark promise-creating options before the player commits.
- Pin unresolved promises above the inbox.
- Show promise outcomes on the original interaction.
- Preserve authored character voice; simulation metadata must not replace dialogue.

## Recommended next layers

### 1. Belief and rumor propagation

Add claims with subject, source, confidence, truth state, and audience. A player who repeats a rumor should risk discovery; houseguests should accept claims based on trust in the speaker versus trust in the subject. This is the most valuable next step because it creates multi-character repercussions.

### 2. Relationship dimensions

Split the single affinity signal into at least:

- warmth: personal liking;
- trust: belief that the person keeps their word;
- threat: strategic danger;
- obligation: favors owed.

A houseguest should be able to like the player, distrust them, fear them, and still vote with them. That contradiction is where reality and intrigue emerge.

### 3. Recurring arcs

Promote high-intensity memories into named arcs: loyal ally, uneasy deal, betrayed confidant, information broker, public rival. Give each arc escalation and payoff scenes. Limit active arcs so the cast remains memorable rather than noisy.

### 4. Private versus public responses

Track who witnessed or later learned about an exchange. Public reassurance should be more binding than a private vague answer; exposed lies should affect multiple relationships.

### 5. Reflection summaries

At week end, derive one short belief per important pair from recent events, for example: “Lia thinks you protect allies when you have power.” Use that belief in intent ranking and later dialogue. Keep it deterministic and inspectable.

## Metrics for tuning

Measure the system by outcomes, not message count:

- percentage of interactions caused by a legible game-state trigger;
- percentage that resurface in a later event or line;
- promise acceptance, kept, broken, and void rates;
- number of distinct houseguests involved in consequences per week;
- repeated scenario and phrase rate;
- inbox abandonment and automatic-expiry rate;
- difference in later nomination/vote behavior after kept versus broken promises.

The target is fewer disposable contacts and more remembered contacts. If players can recount “I promised Lia safety, broke it, and she turned Nova against me,” the module is working.
