export type EvictionLadderStatus = 'evicted' | 'finalist' | 'winner' | 'lastHouseguest';

export type EvictionLadderEntry = {
  id: string;
  name: string;
  rank: number;
  avatarUrl?: string;
  status?: EvictionLadderStatus;
  subtitle?: string;
};

export type EvictionLadderProps = {
  entries: EvictionLadderEntry[];
  currentUserId?: string;
  className?: string;
  autoPlay?: boolean;
  compact?: boolean;
  animationDelayMs?: number;
  stepDelayMs?: number;
  revealCount?: number;
  highlightedEntryIds?: string[];
  caption?: string;
};

export function formatEvictionRank(rank: number): string {
  const mod100 = rank % 100;
  const mod10 = rank % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}TH`;
  if (mod10 === 1) return `${rank}ST`;
  if (mod10 === 2) return `${rank}ND`;
  if (mod10 === 3) return `${rank}RD`;
  return `${rank}TH`;
}

export function deriveEvictionLadderStatus(entry: EvictionLadderEntry): EvictionLadderStatus {
  if (entry.status) return entry.status;
  if (entry.rank === 1) return 'lastHouseguest';
  if (entry.rank <= 3) return 'finalist';
  return 'evicted';
}

export function getEvictionLadderStatusLabel(entry: EvictionLadderEntry): string {
  if (entry.subtitle) return entry.subtitle.toUpperCase();

  switch (deriveEvictionLadderStatus(entry)) {
    case 'winner':
      return 'WINNER';
    case 'lastHouseguest':
      return 'LAST HOUSEGUEST';
    case 'finalist':
      return 'FINALIST';
    case 'evicted':
    default:
      return 'EVICTED';
  }
}

export function getEvictionLadderStatusIcon(entry: EvictionLadderEntry): string {
  switch (deriveEvictionLadderStatus(entry)) {
    case 'winner':
      return '✶';
    case 'lastHouseguest':
      return '✦';
    case 'finalist':
      return '♛';
    case 'evicted':
    default:
      return '◌';
  }
}

// Removes duplicate ids before sorting earlier evictions above later placements.
export function sortEvictionLadderEntries(entries: EvictionLadderEntry[]): EvictionLadderEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank;
      return a.name.localeCompare(b.name);
    });
}
