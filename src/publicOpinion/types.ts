export type DirectionStatus = 'active' | 'completed' | 'failed' | 'expired';
export type DirectionType =
  | 'get_closer'
  | 'target_player'
  | 'protect_player'
  | 'win_competition'
  | 'make_bold_move'
  | 'apologize'
  | 'expose_player'
  | 'align_with'
  | 'confront_player'
  | 'show_loyalty'
  | 'start_drama'
  | 'win_veto';

export interface PublicDirection {
  id: string;
  type: DirectionType;
  playerId: string;
  relatedPlayerId?: string;
  description: string;
  status: DirectionStatus;
  createdWeek: number;
  expiresAtWeek: number;
  completedWeek?: number;
  approvalDelta: number;
}

export interface PlayerPublicProfile {
  playerId: string;
  approval: number;
  previousApproval: number;
  seasonApprovals: number[];
  completedDirectionCount: number;
  cumulativePositiveDelta: number;
}

export interface PublicFeedEntry {
  id: string;
  playerId: string;
  text: string;
  delta: number;
  week: number;
  timestamp: number;
}

export interface PublicOpinionState {
  profiles: Record<string, PlayerPublicProfile>;
  directions: PublicDirection[];
  feed: PublicFeedEntry[];
  lastUpdatedWeek: number;
}
