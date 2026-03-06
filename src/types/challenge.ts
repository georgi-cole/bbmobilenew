export type ChallengeResult =
  | {
      challengeId: string;
      kind: 'endurance';
      elapsed_seconds: number;
      metadata?: Record<string, unknown>;
    }
  | {
      challengeId: string;
      kind: 'score';
      normalized_score: number;
      metadata?: Record<string, unknown>;
    };
