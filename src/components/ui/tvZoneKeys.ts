import type { TvEvent } from '../../types';

export function getViewportMessageKey(ev: TvEvent | undefined): string {
  if (!ev) return 'tv-zone-default';
  if (ev.id) return ev.id;

  const textHash = Array.from(ev.text).reduce(
    (hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0,
    0,
  );

  return `tv-zone-${ev.type}-${ev.timestamp ?? 'na'}-${textHash}`;
}
