/**
 * Fun narrative phrase pools for the Recent Activity feed.
 *
 * Each pool contains template strings with an optional {target} placeholder.
 * Narrative phrases are selected deterministically using a numeric seed so the
 * same log entry always renders the same sentence.
 */

import { getActionById } from '../../social/SocialManeuvers';

// Preset pool of short, playful TV-zone sentences shown when the Social modal closes.
// One is picked at random so the message stays fresh across sessions.
// Exported so tests can verify messages are drawn from this pool.
export const TV_SOCIAL_CLOSE_MESSAGES = [
  'The house is buzzing after that social session! 🏠',
  'Alliances are shifting like sand in The Big Eye house… 🌊',
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
  apologize: [
    'You gave {target} a sincere apology and cleared the air.',
    'You owned your mistake with {target}. The tension finally eased.',
    'You and {target} talked it through without excuses.',
  ],
  rumor: [
    "You planted a seed in {target}'s ear about a secret trio on the other side.",
    "You told {target} someone has been throwing competitions on purpose.",
    "You hinted to {target} that their closest ally might be playing both sides.",
    "You dropped a bombshell on {target}: someone has a pre-game alliance.",
    "You suggested to {target} the house is closer to turning than they think.",
    "You told {target} you heard their name come up for a backdoor.",
    "You whispered to {target} that a certain player is obsessed with them — and not in a good way.",
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
    "You promised {target} complete safety heading into the next elimination.",
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
    "You campaigned quietly to have {target} nominated this week.",
    "You made it crystal clear to the LOH: {target} is your personal target.",
    "You convinced the LOH that {target} is the single biggest strategic threat in the house.",
    "You planted {target}'s name in every whispered conversation you could find.",
    "You sat down with the decision-makers and methodically argued why {target} should go.",
    "You built the case against {target} with surgical precision and zero emotion.",
  ],
  observe: [
    "You sat quietly and watched the room, picking up on every micro-expression.",
    "You observed the house dynamics without saying a single word.",
    "You studied the room like a chess board, cataloguing every conversation.",
    "You leaned against the wall and just listened — nobody noticed, but you noticed everything.",
    "You spent the hour gathering intel with your eyes and ears only.",
  ],
  group_chat: [
    "You held court in the living room and got everyone laughing.",
    "You chatted with the group and built some broad goodwill around the house.",
    "You mingled with the house and made sure everyone felt seen.",
    "You joined a big group conversation and steered it toward lighter topics.",
    "You made the rounds and dropped compliments like confetti.",
  ],
  reassure: [
    "You pulled {target} aside and told them everything is going to be okay.",
    "You offered {target} a shoulder to lean on when they needed it most.",
    "You reminded {target} that they have people in this house who care.",
    "You reassured {target} that their game is stronger than they think.",
    "You checked in on {target} and made sure they felt safe this week.",
  ],
  confront: [
    "You looked {target} in the eye and demanded answers.",
    "You confronted {target} about what you heard — and you were not gentle about it.",
    "You called out {target} directly on their behaviour this week.",
    "You walked up to {target} and laid it all on the table.",
    "You told {target} exactly what you think of their game — to their face.",
  ],
  share_intel: [
    "You shared a key piece of intel with {target} to build mutual trust.",
    "You gave {target} information that could change how they see the house.",
    "You opened up to {target} about what you know — a calculated risk.",
    "You traded intel with {target} and both of you walked away sharper.",
    "You slipped {target} inside knowledge that nobody else has shared.",
  ],
  favor_request: [
    "You called in a favour with {target} — time to see if loyalty is real.",
    "You reminded {target} of what you did for them and asked for something in return.",
    "You made a direct ask to {target} and used every ounce of influence you had.",
    "You asked {target} for a favour and held your breath waiting for the answer.",
    "You leveraged your relationship with {target} to get what you needed.",
  ],
  pitch_target: [
    "You pitched a nomination target to {target} and laid out your reasoning.",
    "You sat down with {target} and made the case for who should go on the block.",
    "You whispered a name into {target}'s ear and explained why it makes sense.",
    "You suggested a target to {target} and they seemed to be listening.",
    "You made a strategic pitch to {target} about who deserves to be nominated.",
  ],
  suggest_replacement: [
    "You suggested a replacement nominee to {target} with conviction.",
    "You pitched {target} on who should go up as a replacement.",
    "You made a compelling case to {target} for a new name on the block.",
    "You offered {target} a strategic alternative for the replacement nomination.",
    "You lobbied {target} about who should replace the saved player.",
  ],
  warn_about_player: [
    "You warned {target} about someone you think is playing both sides.",
    "You tipped off {target} about a player you find suspicious.",
    "You gave {target} a heads-up about a potential threat in the house.",
    "You shared your concerns with {target} about someone's loyalty.",
    "You flagged a player to {target} who you believe cannot be trusted.",
  ],
  rally_votes_against: [
    "You rallied {target} to vote against a specific nominee this week.",
    "You made an aggressive pitch to {target} about who should be evicted.",
    "You worked on {target} to lock in their vote where you need it.",
    "You campaigned hard with {target} to build a voting bloc.",
    "You convinced {target} that the right move is to vote your way.",
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
  if (!pool?.length) {
    const actionDef = getActionById(actionId);
    const displayName = actionDef?.title ?? actionId.replace(/_/g, ' ');
    return "You performed " + displayName + " targeting " + targetName + ".";
  }
  const phrase = pool[Math.abs(seed) % pool.length];
  return phrase.replace(/\{target\}/g, targetName);
}
