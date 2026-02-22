/**
 * tvLogTemplates — utilities for TV log message display and event creation.
 *
 * Provides:
 *   - tease(text, maxLen?)  — truncates text to maxLen chars with an ellipsis
 *   - getTemplate(type)     — returns teaser/full template strings for a given
 *                             event type; intended for use at event-creation time
 *                             (e.g. when building the text passed to addTvEvent),
 *                             not inside the TVLog component itself.
 */

import type { TvEvent } from '../types';
import TEMPLATES from '../data/tv-log-templates.json';

export interface TvLogTemplate {
  teaser: string;
  full: string;
}

/** Truncate `text` to at most `maxLen` characters, appending '…' if cut. */
export function tease(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/**
 * Return the teaser/full template strings for the given event type.
 * Use these templates when constructing the `text` field of a new TvEvent
 * (e.g. via `addTvEvent`), not for display inside the TVLog component.
 */
export function getTemplate(type: TvEvent['type']): TvLogTemplate {
  return (TEMPLATES as Record<string, TvLogTemplate>)[type] ?? TEMPLATES['game'];
}
