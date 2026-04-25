export function calculateRequiredDoubleEvictionSlots(
  tiedCount: number,
  hasPendingEviction: boolean,
): number {
  if (hasPendingEviction) return 1;
  return Math.min(2, Math.max(1, tiedCount - 1));
}

export function formatDoubleEvictionNameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

interface DoubleEvictionTieResolutionMessageOptions {
  deciderName: string;
  tiedNames: string[];
  selectedNames: string[];
  publicModeEnabled?: boolean;
  secondEvictionOnly?: boolean;
  includeEliminationClause?: boolean;
}

export function buildDoubleEvictionTieResolutionMessage({
  deciderName,
  tiedNames,
  selectedNames,
  publicModeEnabled = false,
  secondEvictionOnly = false,
  includeEliminationClause = false,
}: DoubleEvictionTieResolutionMessageOptions): string {
  const tiedList = formatDoubleEvictionNameList(tiedNames);
  const selectedList = formatDoubleEvictionNameList(selectedNames);
  const actor = publicModeEnabled ? 'Public approval' : deciderName;
  const action = publicModeEnabled ? 'chose to eliminate' : 'chose to evict';
  const tieIntro = `There was a tie between ${tiedList}${secondEvictionOnly ? ' for the second eviction' : ''}.`;
  const decision = `${actor} had to decide between ${tiedList} and ${action} ${selectedList}.`;

  if (!includeEliminationClause) {
    return `${tieIntro} ${decision}`;
  }

  const emoji = publicModeEnabled ? '📉' : '🗳️';
  const elimination = `${selectedList} ${selectedNames.length === 1 ? 'has' : 'have'} been eliminated from The Big Eye house. ${emoji}`;
  return `${tieIntro} ${decision} ${elimination}`;
}
