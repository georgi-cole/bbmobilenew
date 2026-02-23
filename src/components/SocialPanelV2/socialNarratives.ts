/**
 * Fun narrative phrase pools for the Recent Activity feed.
 *
 * Each pool contains template strings with an optional {target} placeholder.
 * Narrative phrases are selected deterministically using a numeric seed so the
 * same log entry always renders the same sentence.
 */

// Preset pool of short, playful TV-zone sentences shown when the Social modal closes.
// One is picked at random so the message stays fresh across sessions.
// Exported so tests can verify messages are drawn from this pool.
export const TV_SOCIAL_CLOSE_MESSAGES = [
  'The house is buzzing after that social session! 🏠',
  'Alliances are shifting like sand in the Big Brother house… 🌊',
  "Smooth operator — you've been working that social game! 💬",
  'The whispers have started. Watch your back! 👀',
  "Social butterfly in action — who's loyal and who isn't? 🦋",
  'Every word counts in this house. Choose wisely. 🎙️',
  'The social web just got a little more tangled. 🕸️',
  'Another week, another batch of social chess moves. ♟️',
];

const NARRATIVES: Record<string, string[]> = {
  compliment: [
    "You told {target} their hair smelled like a summer breeze.",
    "You gushed to {target} that they are playing a genuinely flawless game.",
    "You assured {target} that literally everyone secretly respects them.",
    "You told {target} their energy is carrying the whole house.",
    "You looked {target} in the eyes and said they were your favourite.",
    "You told {target} they had the most trustworthy face in the house.",
    "You whispered to {target} that the cameras follow them because they are magnetic.",
    "You complimented {target}'s impeccable taste in breakfast cereals.",
    "You told {target} they remind you of your favourite childhood TV character.",
    "You convinced {target} they are the secret fan-favourite of this season.",
  ],
  rumor: [
    "You planted a seed in {target}'s ear about a secret trio on the other side.",
    "You told {target} someone has been throwing competitions on purpose.",
    "You hinted to {target} that their closest ally might be playing both sides.",
    "You dropped a bombshell on {target}: someone has a pre-game alliance.",
    "You suggested to {target} the house is closer to turning than they think.",
    "You told {target} you heard their name come up for a backdoor.",
    "You whispered to {target} that a certain houseguest is obsessed with them — and not in a good way.",
    "You informed {target} that someone in the house has been keeping a diary about everyone.",
    "You told {target} that three people voted against them last week and they don't know who.",
    "You insinuated to {target} that someone is tanking the vote to stay under the radar.",
  ],
  whisper: [
    "You pulled {target} into the pantry and shared your full read on the house.",
    "You slipped {target} intel on exactly how the next vote is going.",
    "You quietly confirmed {target}'s darkest suspicions.",
    "You passed {target} information that could completely flip their game.",
    "You told {target} something you swore was strictly between you two.",
    "You shared a piece of information with {target} that you probably should not have.",
    "You gave {target} the inside scoop in exchange for a promise they would keep.",
    "You cornered {target} in the hallway and whispered something that made their eyes go wide.",
    "You and {target} had a five-minute conversation no one else in the house can know about.",
    "You confided in {target} something you have been holding onto all week.",
  ],
  proposeAlliance: [
    "You extended a pinky to {target} and proposed a ride-or-die final two.",
    "You pitched {target} on a secret alliance — and it felt completely real.",
    "You and {target} sealed a pact behind the vending machine.",
    "You laid out a master plan to {target} over hushed conversation in the storage room.",
    "You made {target} a solemn promise: you protect each other no matter what.",
    "You told {target} you would carry them to the end if they carry you.",
    "You swore to {target} on everything you hold dear that the alliance is real.",
    "You and {target} shook hands in the dark and called it official.",
  ],
  ally: [
    "You and {target} agreed to protect each other until the bitter end.",
    "You made {target} a promise in the dark corner of the Have-Not room.",
    "You swore to {target} that the two of you would be the last ones standing.",
    "You shook hands with {target} in the dark and called it a done deal.",
    "You and {target} committed to a secret ride-or-die arrangement.",
  ],
  startFight: [
    "You called out {target} loudly in the kitchen — every head turned.",
    "You confronted {target} about something someone told you they said.",
    "You pushed {target}'s buttons until they had to leave the room to cool down.",
    "You started a heated debate with {target} about dishes. It was never about dishes.",
    "You looked {target} dead in the eyes and said what everyone was already thinking.",
    "You deliberately brought up a sensitive topic in front of {target} and the whole room.",
    "You picked a fight with {target} over the thermostat. The house took sides.",
    "You told {target} in front of everyone that their loyalty is suspect.",
  ],
  protect: [
    "You promised {target} complete safety heading into the next eviction.",
    "You swore to {target} they are not — and never will be — on your radar.",
    "You guaranteed {target} that as long as you hold power, they are untouchable.",
    "You pulled {target} aside and told them to stop worrying: you have their back.",
    "You made a private vow to {target} that you would fall on the sword before letting them go.",
    "You told {target} you would spend every social credit you have to keep them safe.",
    "You assured {target} they are your personal shield for the rest of this game.",
  ],
  betray: [
    "You leaked {target}'s entire game plan to the other side of the house.",
    "You threw {target} under the bus in a conversation you knew would get back to them.",
    "You confirmed everyone's suspicions about {target}'s loyalty — strategically.",
    "You decided {target} was a liability and quietly cut them loose.",
    "You backstabbed {target} before they could do the same to you.",
    "You told the house things about {target} they trusted you to keep secret.",
    "You broke the alliance with {target} at the worst possible moment for them.",
    "You turned on {target} and called it game moves to anyone who would listen.",
  ],
  nominate: [
    "You campaigned quietly to have {target} put on the block this week.",
    "You made it crystal clear to the HOH: {target} is your personal target.",
    "You convinced the HOH that {target} is the single biggest strategic threat in the house.",
    "You planted {target}'s name in every whispered conversation you could find.",
    "You sat down with the decision-makers and methodically argued why {target} should go.",
    "You built the case against {target} with surgical precision and zero emotion.",
  ],
  idle: [
    "You sat back, watched the chaos unfold, and said absolutely nothing.",
    "You decided to do nothing today — and somehow that felt like a power move.",
    "You spent the whole day observing without giving anything away.",
    "You conserved your energy and let the house implode on its own.",
    "You stayed in your lane. The drama found someone else.",
    "You watched everyone make their moves and took careful mental notes.",
    "You kept your mouth shut all day. Some people found that suspicious.",
  ],
};

/**
 * Returns a deterministic fun narrative for a social action log entry.
 *
 * @param actionId  The action id (e.g. 'compliment', 'rumor').
 * @param targetName  The resolved display name of the target player.
 * @param seed  An integer used to select a phrase (typically: entry timestamp).
 */
export function getSocialNarrative(
  actionId: string,
  targetName: string,
  seed: number,
): string {
  const pool = NARRATIVES[actionId];
  if (!pool?.length) return "You performed " + actionId + " targeting " + targetName + ".";
  const phrase = pool[Math.abs(seed) % pool.length];
  return phrase.replace(/\{target\}/g, targetName);
}
