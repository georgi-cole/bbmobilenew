export function calculateRequiredDoubleEvictionSlots(
  tiedCount: number,
  hasPendingEviction: boolean,
): number {
  if (hasPendingEviction) return 1;
  return Math.min(2, Math.max(1, tiedCount - 1));
}
