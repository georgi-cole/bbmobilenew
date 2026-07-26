export type BundledAftermathTone = 'excellent' | 'good' | 'neutral' | 'bad' | 'tragic';

export interface ScenarioSpec {
  id: string;
  category: string;
  tone: BundledAftermathTone;
  weight: number;
  cooldownGroup: string;
  badge: string;
  eligibility: Record<string, unknown>;
  headlines: string[];
  beats: [string, string, string];
  twists: string[];
}

export interface LinkedScenarioSpec {
  id: string;
  relation: 'ally' | 'rival' | 'romantic' | 'betrayal';
  category: string;
  tone: BundledAftermathTone;
  weight: number;
  badge: string;
  headlines: string[];
  beats: [string, string, string];
  twists: string[];
}
