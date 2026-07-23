export type SocialOutcomeKind = 'success' | 'failure' | 'backfire' | 'betrayal' | 'gaslight';

const OUTCOME_COPY: Record<SocialOutcomeKind, readonly string[]> = {
  success: [
    '{action} landed exactly as intended. Relationship {delta}.',
    '{action} struck the right chord. Relationship {delta}.',
    '{action} brought you noticeably closer. Relationship {delta}.',
    '{action} paid off socially. Relationship {delta}.',
    '{action} changed the temperature between you. Relationship {delta}.',
    '{action} became a small win with real social value. Relationship {delta}.',
  ],
  failure: [
    '{action} fell flat and the silence said everything. Relationship {delta}.',
    '{action} did not land the way you hoped. Relationship {delta}.',
    '{action} created distance instead of momentum. Relationship {delta}.',
    '{action} met a cold reception. Relationship {delta}.',
    '{action} left the conversation worse than it found it. Relationship {delta}.',
  ],
  backfire: [
    '{action} felt rehearsed and backfired. Relationship {delta}.',
    '{action} was one move too many; they noticed. Relationship {delta}.',
    '{action} crossed from charming into suspicious. Relationship {delta}.',
    '{action} triggered the exact opposite reaction. Relationship {delta}.',
    '{action} reopened an irritation you should have left alone. Relationship {delta}.',
  ],
  betrayal: [
    '{action} was accepted, but their smile looked strategically convenient. Relationship {delta}.',
    '{action} created a pact with a possible knife hidden behind it. Relationship {delta}.',
    '{action} became official, though their private plan may say otherwise. Relationship {delta}.',
    '{action} earned agreement, not necessarily loyalty. Relationship {delta}.',
  ],
  gaslight: [
    '{action} made them question your sincerity. Relationship {delta}.',
    '{action} sounded less convincing the longer it continued. Relationship {delta}.',
    '{action} exposed a gap between your words and your game. Relationship {delta}.',
    '{action} damaged trust before the conversation even ended. Relationship {delta}.',
  ],
};

const rotations = new Map<string, number>();

export function getSocialOutcomeCopy({
  actionId,
  actionTitle,
  kind,
  delta,
}: {
  actionId: string;
  actionTitle: string;
  kind: SocialOutcomeKind;
  delta: number;
}): string {
  const pool = OUTCOME_COPY[kind];
  const key = `${actionId}:${kind}`;
  const nextIndex = rotations.get(key) ?? 0;
  rotations.set(key, (nextIndex + 1) % pool.length);
  const signedDelta = delta > 0 ? `+${delta}` : `${delta}`;
  return (pool[nextIndex] ?? pool[0])
    .replace('{action}', actionTitle)
    .replace('{delta}', signedDelta);
}
