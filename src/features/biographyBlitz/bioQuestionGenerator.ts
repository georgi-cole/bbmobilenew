/**
 * Dynamic biography question generator for the Biography Blitz competition.
 *
 * Generates questions about the actual contestants in the current game by
 * reading their canonical houseguest profile fields from the HOUSEGUESTS
 * dataset. Each generated question has the format:
 *
 *   "Which houseguest is a [value]?"
 *   Answers: all active contestant IDs (rendered as avatars in the UI)
 *   Correct answer: the contestant who matches the bio field
 *
 * If insufficient bio data exists for the active contestants the function
 * returns an empty array and callers must fall back to the static question bank.
 */

import HOUSEGUESTS from '../../data/houseguests';
import type { BiographyBlitzQuestion } from './biographyBlitzQuestions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BioField {
  /** Field key in the Houseguest type. */
  key: string;
  /** Template string for the question prompt; {value} is replaced. */
  prompt: string;
}

// Fields and their question templates.
const BIO_FIELDS: BioField[] = [
  { key: 'profession', prompt: 'Which houseguest works as a {value}?' },
  { key: 'location', prompt: 'Which houseguest is from {value}?' },
  { key: 'zodiacSign', prompt: 'Which houseguest is a {value}?' },
  { key: 'education', prompt: 'Which houseguest holds a {value} degree?' },
  { key: 'familyStatus', prompt: 'Which houseguest is {value}?' },
  { key: 'funFact', prompt: 'Which houseguest can claim: "{value}"?' },
  { key: 'pets', prompt: 'Which houseguest has the following pets: {value}?' },
  { key: 'religion', prompt: 'Which houseguest identifies as {value}?' },
  { key: 'motto', prompt: 'Which houseguest\'s motto is: "{value}"?' },
];

const PLACEHOLDER_VALUES = new Set(['none', 'None', 'n/a', 'N/A', '']);

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate biography questions about the given contestant IDs.
 *
 * @param activeIds  IDs of contestants currently in the competition.
 * @returns Array of generated questions (may be empty on failure).
 */
export function generateBioQuestions(
  activeIds: string[],
): BiographyBlitzQuestion[] {
  if (activeIds.length < 2) return [];

  const questions: BiographyBlitzQuestion[] = [];
  // Map from contestant ID → houseguest profile (if available).
  const profiles = new Map(
    activeIds
      .map((id) => {
        const hg = HOUSEGUESTS.find((h) => h.id === id);
        return hg ? ([id, hg] as const) : null;
      })
      .filter((entry): entry is [string, (typeof HOUSEGUESTS)[number]] => entry !== null),
  );

  // Build the answer list: all active contestants as answer options.
  const answers = activeIds.map((id) => ({
    id,
    text: HOUSEGUESTS.find((h) => h.id === id)?.name ?? id,
  }));

  for (const field of BIO_FIELDS) {
    for (const [id, profile] of profiles) {
      const rawValue = (profile as Record<string, unknown>)[field.key];
      if (typeof rawValue !== 'string') continue;
      const value = rawValue.trim();
      if (!value || PLACEHOLDER_VALUES.has(value)) continue;

      // Reject ambiguous questions: multiple contestants share the same value.
      const sameValue = [...profiles.values()].filter(
        (p) =>
          typeof (p as Record<string, unknown>)[field.key] === 'string' &&
          ((p as Record<string, unknown>)[field.key] as string).trim() === value,
      );
      if (sameValue.length !== 1) continue;

      const prompt = field.prompt.replace('{value}', value);
      const qId = `bio_${id}_${field.key}`;

      // Avoid duplicate question IDs (same field about same person).
      if (questions.some((q) => q.id === qId)) continue;

      questions.push({
        id: qId,
        prompt,
        answers,
        correctAnswerId: id,
      });
    }
  }

  return questions;
}
