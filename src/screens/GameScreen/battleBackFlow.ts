import type { Announcement } from '../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'

export const BATTLE_BACK_ANNOUNCEMENT_SEQUENCE: Announcement[] = [
  {
    key: 'battle_back_shock',
    title: 'Shock Twist',
    subtitle: 'Back 2 the Game has been activated. A return to the game is now on the table.',
    isLive: true,
    autoDismissMs: null,
  },
  {
    key: 'battle_back_rules',
    title: 'Back 2 the Game Rules',
    subtitle: 'Tribunal members will face off. Only one can win the right to return to the house.',
    isLive: true,
    autoDismissMs: null,
  },
  {
    key: 'battle_back_challenge',
    title: 'Back 2 the Game Challenge',
    subtitle: 'The challenge is ready. Press play to begin the Back 2 the Game showdown.',
    isLive: true,
    autoDismissMs: null,
  },
]

export function buildBattleBackFeedMessage(announcement: Announcement): string {
  return `${announcement.title}: ${announcement.subtitle}`
}

export function advanceBattleBackAnnouncementStep(
  currentStep: number | null,
  totalSteps = BATTLE_BACK_ANNOUNCEMENT_SEQUENCE.length,
): { nextStep: number | null; shouldOpenCompetition: boolean } {
  if (currentStep == null) {
    return { nextStep: null, shouldOpenCompetition: false }
  }

  const nextStep = currentStep + 1

  if (nextStep >= totalSteps) {
    return { nextStep: null, shouldOpenCompetition: true }
  }

  return { nextStep, shouldOpenCompetition: false }
}

export function isBattleBackReplayEligible(
  winnerId: string | undefined,
  humanCandidateId: string | null,
  candidateIds: string[],
  retryCount: number,
  retryLimit: number,
): boolean {
  return !!winnerId &&
    !!humanCandidateId &&
    candidateIds.includes(humanCandidateId) &&
    winnerId !== humanCandidateId &&
    retryCount < retryLimit
}

export function shouldUseBattleBackMinigame(
  humanCandidateId: string | null,
  candidateIds: string[],
): boolean {
  return !!humanCandidateId && candidateIds.includes(humanCandidateId)
}
