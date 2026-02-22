/**
 * tvLogTemplates — utilities for TV log message display.
 *
 * Provides:
 *   - tease(text, maxLen?)  — truncates text to maxLen chars with an ellipsis
 *   - getTemplate(type)     — returns the teaser/full template strings for a given event type
 */

import TEMPLATES from '../data/tv-log-templates.json';

type EventType = 'game' | 'social' | 'vote' | 'twist' | 'diary';

export interface TvLogTemplate {
  teaser: string;
  full: string;
}

/** Truncate `text` to at most `maxLen` characters, appending '…' if cut. */
export function tease(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/** Return the template strings for the given event type. */
export function getTemplate(type: EventType): TvLogTemplate {
  return TEMPLATES[type] ?? TEMPLATES['game'];
}
