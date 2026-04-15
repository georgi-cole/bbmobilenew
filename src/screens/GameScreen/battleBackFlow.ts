import type { Announcement } from '../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'

export const BATTLE_BACK_ANNOUNCEMENT_SEQUENCE: Announcement[] = [
  {
    key: 'battle_back_shock',
    title: 'Shock Twist',
    subtitle: 'Battle Back has been activated. A return to the game is now on the table.',
    isLive: true,
    autoDismissMs: null,
  },
  {
    key: 'battle_back_rules',
    title: 'Battle Back Rules',
    subtitle: 'Recently eliminated players will face off. Only one can win the right to return to the house.',
    isLive: true,
    autoDismissMs: null,
  },
  {
    key: 'battle_back_challenge',
    title: 'Battle Back Challenge',
    subtitle: 'The challenge is ready. Press play to begin the Battle Back showdown.',
    isLive: true,
    autoDismissMs: null,
  },
]

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
  candidateCount: number,
  retryCount: number,
  retryLimit: number,
): boolean {
  return !!winnerId && candidateCount > 1 && retryCount < retryLimit
}
