import { CONFLICT_OUTCOME_MATRIX } from './incomingOutcomeMatrixConflict'
import { EARLY_OUTCOME_MATRIX } from './incomingOutcomeMatrixEarly'
import { POWER_OUTCOME_MATRIX } from './incomingOutcomeMatrixPower'
import { RELATIONSHIP_OUTCOME_MATRIX } from './incomingOutcomeMatrixRelationship'
import { VOTE_OUTCOME_MATRIX } from './incomingOutcomeMatrixVote'
import type { ScenarioOutcomeMatrix } from './incomingOutcomeMatrixUtils'

export const INCOMING_ACTION_OUTCOME_MATRIX: ScenarioOutcomeMatrix = {
  ...EARLY_OUTCOME_MATRIX,
  ...POWER_OUTCOME_MATRIX,
  ...VOTE_OUTCOME_MATRIX,
  ...CONFLICT_OUTCOME_MATRIX,
  ...RELATIONSHIP_OUTCOME_MATRIX,
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

export function getIncomingActionOutcome({
  scenarioKey,
  responseLabel,
  fromName,
  subjectName,
  phase,
  senderIsNominated,
}: {
  scenarioKey?: string
  responseLabel?: string
  fromName: string
  subjectName?: string
  phase: string
  senderIsNominated: boolean
}): string | null {
  if (!scenarioKey || !responseLabel) return null
  const writer = INCOMING_ACTION_OUTCOME_MATRIX[scenarioKey]?.[normalizeLabel(responseLabel)]
  if (!writer) return null
  return writer({ fromName, subjectName, phase, senderIsNominated })
}
