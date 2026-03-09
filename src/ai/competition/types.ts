export type CompetitionCategory =
  | 'physical'
  | 'mental'
  | 'precision'
  | 'endurance'
  | 'luck'
  | 'hybrid';

export type ScoreDirection = 'higher-is-better' | 'lower-is-better';

export interface CompetitionSkillProfile {
  /** Optional aggregate rating; may be computed from the other skill fields. */
  overall?: number;
  physical: number;
  mental: number;
  precision: number;
  nerve: number;
  consistency: number;
  clutch: number;
  chokeRisk: number;
  luck: number;
}

export interface CompetitionSkillWeights {
  physical: number;
  mental: number;
  precision: number;
  nerve: number;
  luck?: number;
}

export interface MinigameAiModel {
  key: string;
  category: CompetitionCategory;
  scoreDirection: ScoreDirection;
  volatility: number;
  weights: CompetitionSkillWeights;
  minScore?: number;
  maxScore?: number;
  notes?: string;
}

export interface AiSimulationContext {
  minigameKey: string;
  seed: number;
  participants: string[];
  timeLimitSeconds?: number;
}

export interface AiParticipantSnapshot {
  playerId: string;
  isUser: boolean;
  profile?: CompetitionSkillProfile;
}
