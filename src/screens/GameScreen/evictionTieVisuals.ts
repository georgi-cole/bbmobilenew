export function hasUnresolvedTopVoteTie(
  voteResults: Record<string, number> | null | undefined
): boolean {
  const counts = Object.values(voteResults ?? {})
  if (counts.length < 2) return false
  const topCount = Math.max(...counts)
  return counts.filter((count) => count === topCount).length > 1
}

export function getOutcomeVisibleEvicteeIds(options: {
  voteResults: Record<string, number> | null | undefined
  pendingEvictionId?: string | null
  pendingSecondEvictionId?: string | null
}): string[] {
  if (hasUnresolvedTopVoteTie(options.voteResults)) return []

  return [options.pendingEvictionId ?? null, options.pendingSecondEvictionId ?? null].filter(
    (id): id is string => Boolean(id)
  )
}
