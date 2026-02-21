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

// Houseguest enriched with live Player state
export interface EnrichedPlayer {
  id: string;
  name: string;
  avatar: string;
  status: string;
  isUser?: boolean;
  stats?: {
    hohWins: number;
    povWins: number;
    timesNominated: number;
  };
  // Static profile fields (undefined if not in dataset)
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
