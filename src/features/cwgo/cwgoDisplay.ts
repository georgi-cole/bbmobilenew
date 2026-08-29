import type { CwgoQuestion } from './cwgoQuestions'

type ScaleMeta = {
  value: number
  singular: string
  plural: string
}

const KNOWN_SCALES: ScaleMeta[] = [
  { value: 1_000, singular: 'thousand', plural: 'thousands' },
  { value: 1_000_000, singular: 'million', plural: 'millions' },
  { value: 1_000_000_000, singular: 'billion', plural: 'billions' },
  { value: 1_000_000_000_000, singular: 'trillion', plural: 'trillions' },
]

function scaleMeta(question?: CwgoQuestion): ScaleMeta | null {
  if (!question?.scale) return null
  return KNOWN_SCALES.find((entry) => entry.value === question.scale) ?? null
}

/**
 * Parse the number exactly in the natural scale declared by the question.
 * Example: q53 has scale=1e12, so entering "12" means 12 trillion cells.
 */
export function parseCwgoGuess(raw: string, question?: CwgoQuestion): number | null {
  const numericValue = Number(raw)
  if (!Number.isFinite(numericValue) || numericValue < 0) return null

  const multiplier = question?.scale ?? 1
  const scaledValue = Math.round(numericValue * multiplier)
  if (!Number.isFinite(scaledValue) || scaledValue > Number.MAX_SAFE_INTEGER) return null
  return scaledValue
}

/** Player-facing unit label for the input field. */
export function cwgoInputUnit(question?: CwgoQuestion): string | null {
  if (!question) return null
  const meta = scaleMeta(question)
  if (!meta) return question.unit ?? null
  return question.unit ? `${meta.plural} of ${question.unit}` : meta.plural
}

export function cwgoInputPlaceholder(question?: CwgoQuestion): string {
  const meta = scaleMeta(question)
  return meta ? `Enter in ${meta.plural}…` : 'Enter number…'
}

/**
 * Format a stored full-value guess/answer in the same natural scale used for
 * input, avoiding unreadable 12-15 digit numbers in result and duel cards.
 */
export function formatCwgoValue(
  value: number,
  question?: CwgoQuestion,
  options: { includeUnit?: boolean; maxFractionDigits?: number } = {}
): string {
  const { includeUnit = false, maxFractionDigits = 2 } = options
  if (!question?.scale) {
    const formatted = value.toLocaleString()
    return includeUnit && question?.unit ? `${formatted} ${question.unit}` : formatted
  }

  const meta = scaleMeta(question)
  if (!meta) {
    const formatted = value.toLocaleString()
    return includeUnit && question.unit ? `${formatted} ${question.unit}` : formatted
  }

  const scaled = value / question.scale
  const formatted = scaled.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  })
  const withScale = `${formatted} ${meta.singular}`
  return includeUnit && question.unit ? `${withScale} ${question.unit}` : withScale
}
