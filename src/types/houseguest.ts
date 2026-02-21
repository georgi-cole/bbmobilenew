import type { Player } from './index';

// Houseguest static profile type (canonical dataset from houseguests.ts)
export interface Houseguest {
  id: string;
  name: string;
  fullName: string;
  age: number;
  sex: string;
  location: string;
  sexuality?: string;
  education?: string;
  profession: string;
  familyStatus?: string;
  kids?: string;
  pets?: string;
  zodiacSign?: string;
  religion?: string;
  motto: string;
  funFact: string;
  allies: string[];
  enemies: string[];
  story: string;
}

// Static profile fields that enrich a live Player object
interface HouseguestProfileFields {
  fullName?: string;
  age?: number;
  sex?: string;
  location?: string;
  profession?: string;
  motto?: string;
  funFact?: string;
  story?: string;
  allies?: string[];
  enemies?: string[];
}

// Houseguest enriched with live Player state — extends Player directly so
// all Player fields retain their precise types (e.g. status: PlayerStatus)
export type EnrichedPlayer = Player & HouseguestProfileFields;
