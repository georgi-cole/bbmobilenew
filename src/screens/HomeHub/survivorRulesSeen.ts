const SURVIVOR_RULES_KEY = 'bb:homeHubSurvivorRulesSeen';

function storageKey(profileId: string | null | undefined): string {
  return `${SURVIVOR_RULES_KEY}:${profileId ?? 'guest'}`;
}

export function hasSeenSurvivorRules(profileId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(storageKey(profileId)) === '1';
  } catch {
    return false;
  }
}

export function markSurvivorRulesSeen(profileId: string | null | undefined): void {
  try {
    localStorage.setItem(storageKey(profileId), '1');
  } catch {
    // Ignore storage failures; the modal will reappear next session.
  }
}
