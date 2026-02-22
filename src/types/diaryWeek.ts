/**
 * DiaryWeek — TypeScript interfaces for the Weekly Diary Room Log feature.
 *
 * These types are shared between the frontend components (DiaryWeekView,
 * DiaryWeekEditor) and act as the canonical shape of the API payloads.
 *
 * Nullable fields are optional on write; the server always returns them
 * (possibly null) on read.
 */

/** A single eviction vote cast during a live-vote ceremony. */
export interface EvictionVote {
  /** Name of the houseguest casting the vote. */
  voter: string;
  /** Name of the houseguest being voted against. */
  votedFor: string;
}

/** Full diary-week record as returned by the API. */
export interface DiaryWeek {
  id: string;
  seasonId: string;
  weekNumber: number;
  startAt: string | null;
  endAt: string | null;
  hohWinner: string | null;
  povWinner: string | null;
  nominees: string[];
  replacementNominee: string | null;
  evictionVotes: EvictionVote[];
  socialEvents: string[];
  misc: string[];
  notes: string | null;
  /** Default false — set true only once the admin is ready to publish. */
  published: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** Shape expected by POST /api/seasons/:seasonId/weeks */
export interface CreateDiaryWeekPayload {
  seasonId: string;
  weekNumber: number;
  startAt?: string | null;
  endAt?: string | null;
  hohWinner?: string | null;
  povWinner?: string | null;
  nominees?: string[];
  replacementNominee?: string | null;
  evictionVotes?: EvictionVote[];
  socialEvents?: string[];
  misc?: string[];
  notes?: string | null;
  /** Defaults to false on the server when omitted. */
  published?: boolean;
}

/** Shape expected by PATCH /api/seasons/:seasonId/weeks/:weekNumber */
export type UpdateDiaryWeekPayload = Partial<Omit<CreateDiaryWeekPayload, 'seasonId' | 'weekNumber'>>;
