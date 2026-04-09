export const DISLIKED_MAX_APPROVAL = 39

export const DISLIKED_BOOST_PROMPT_DESCRIPTION = 'Watch a short ad to boost your public approval.'

export function shouldShowDislikedBoostPrompt(
  userApproval: number,
  lastPromptDate: string | null,
  todayIsoDate: string,
): boolean {
  return userApproval <= DISLIKED_MAX_APPROVAL && lastPromptDate !== todayIsoDate
}
