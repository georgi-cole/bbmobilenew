const NAMED_INTERACTION_TEMPLATES: Record<string, readonly string[]> = {
  betrayal_warning: [
    'I compared notes, and {subject} may be repeating a private plan that was never theirs to share.',
    '{subject} told two people different versions of the same promise. One of those versions cannot be true.',
    'I heard {subject} offer protection in one room and volunteer the same person as a target in another.',
    '{subject} has been quoting a private conversation to win trust elsewhere. I thought you should know.',
  ],
  generic_gossip: [
    'Two different rooms say {subject} promised them safety. The numbers do not work.',
    'The story going around is that {subject} has a second deal their main allies do not know about.',
    'People compared conversations, and {subject} appears to have given incompatible promises.',
    'Someone overheard {subject} pitching a voting group and leaving one of their closest allies out of it.',
  ],
  generic_warning: [
    '{subject} asked how many votes it would take to send you home. I would not ignore that.',
    'I heard {subject} testing your name as a backup plan in more than one room.',
    '{subject} has been asking whether your allies would still protect you under pressure.',
    'Someone says {subject} is collecting votes against you while acting relaxed to your face.',
  ],
}

function hashNamedInteractionSeed(seed: string): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function getNamedInteractionText(
  scenarioKey: string,
  type: string,
  subjectName: string,
  seed: string
): string {
  const lines =
    NAMED_INTERACTION_TEMPLATES[scenarioKey] ??
    NAMED_INTERACTION_TEMPLATES[type === 'gossip' ? 'generic_gossip' : 'generic_warning']
  const selected = lines[hashNamedInteractionSeed(seed) % lines.length] ?? lines[0]
  return selected.replaceAll('{subject}', subjectName)
}
