export function isBattleBackReplayEligible(
  winnerId: string | undefined,
  humanCandidateId: string | null,
  candidateIds: string[],
  retryCount: number,
  retryLimit: number
): boolean {
  const humanParticipated = humanCandidateId != null && candidateIds.includes(humanCandidateId)
  const winnerParticipated = winnerId != null && candidateIds.includes(winnerId)

  return (
    humanParticipated &&
    winnerParticipated &&
    winnerId !== humanCandidateId &&
    retryCount < retryLimit
  )
}

export function shouldUseBattleBackMinigame(
  humanCandidateId: string | null,
  candidateIds: string[]
): boolean {
  return !!humanCandidateId && candidateIds.includes(humanCandidateId)
}
