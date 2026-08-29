/**
 * tvLogTemplates — utilities for TV log message display and event creation.
 *
 * Provides:
 *   - normalizeGameCopy(text) — updates legacy BB terminology for display
 *   - tease(text, maxLen?)    — truncates normalized text with an ellipsis
 *   - getTemplate(type)       — returns teaser/full template strings
 */

import type { TvEvent } from '../types'
import TEMPLATES from '../data/tv-log-templates.json'

export interface TvLogTemplate {
  teaser: string
  full: string
}

function preserveCase(match: string, replacement: string): string {
  if (match === match.toUpperCase()) return replacement.toUpperCase()
  if (match[0] === match[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * Normalize legacy Big Brother terminology at display time. This intentionally
 * does not mutate saved events, so old runs also pick up the corrected copy.
 */
export function normalizeGameCopy(text: string): string {
  return text
    .replace(/\bhousemates\b/gi, (match) => preserveCase(match, 'players'))
    .replace(/\bhouseguests\b/gi, (match) => preserveCase(match, 'players'))
    .replace(/\bhousemate\b/gi, (match) => preserveCase(match, 'player'))
    .replace(/\bhouseguest\b/gi, (match) => preserveCase(match, 'player'))
    .replace(/\bBig Brother\b/gi, 'The Big Eye')
    .replace(/\bPower of Veto\b/gi, 'Power of Safety')
    .replace(/\bveto\b/gi, (match) => preserveCase(match, 'safety'))
    .replace(/\bjurors\b/gi, (match) => preserveCase(match, 'Tribunal members'))
    .replace(/\bjuror\b/gi, (match) => preserveCase(match, 'Tribunal member'))
    .replace(/\bjury\b/gi, (match) => preserveCase(match, 'Tribunal'))
    .replace(/\btwist\b/gi, (match) => preserveCase(match, 'shock'))
    .replace(/\bhouse\b/gi, (match) => preserveCase(match, 'hub'))
}

/** Truncate `text` to at most `maxLen` characters, appending '…' if cut. */
export function tease(text: string, maxLen = 60): string {
  const normalized = normalizeGameCopy(text)
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen).trimEnd() + '…'
}

/**
 * Return the teaser/full template strings for the given event type.
 * Use these templates when constructing the `text` field of a new TvEvent.
 */
export function getTemplate(type: TvEvent['type']): TvLogTemplate {
  return (TEMPLATES as Record<string, TvLogTemplate>)[type] ?? TEMPLATES['game']
}
