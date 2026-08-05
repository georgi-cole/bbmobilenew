import {
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from 'react';

interface RecapImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  sources: string[];
}

const decodedImageSources = new Set<string>();
const preloadRequests = new Map<string, Promise<boolean>>();

function preloadSource(source: string, timeoutMs: number): Promise<boolean> {
  if (!source) return Promise.resolve(false);
  if (decodedImageSources.has(source)) return Promise.resolve(true);
  const existing = preloadRequests.get(source);
  if (existing) return existing;

  const request = new Promise<boolean>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(true);
      return;
    }

    const image = new Image();
    let settled = false;
    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (loaded) decodedImageSources.add(source);
      resolve(loaded);
    };
    const timeout = window.setTimeout(() => settle(false), timeoutMs);
    image.onload = () => {
      const decoded = typeof image.decode === 'function'
        ? image.decode().catch(() => undefined)
        : Promise.resolve();
      void decoded.then(() => settle(true));
    };
    image.onerror = () => settle(false);
    image.decoding = 'async';
    image.src = source;
  }).finally(() => {
    preloadRequests.delete(source);
  });

  preloadRequests.set(source, request);
  return request;
}

export async function preloadRecapImageSources(
  sources: string[],
  timeoutMs = 4_500,
): Promise<string | null> {
  const safeSources = [...new Set(sources.filter(Boolean))];
  for (const source of safeSources) {
    if (await preloadSource(source, timeoutMs)) return source;
  }
  return null;
}

export default function RecapImage({ sources, onError, onLoad, style, ...imgProps }: RecapImageProps) {
  const safeSources = useMemo(() => [...new Set(sources.filter(Boolean))], [sources]);
  const cachedSourceIndex = safeSources.findIndex((source) => decodedImageSources.has(source));
  const [sourceIndex, setSourceIndex] = useState(() => Math.max(0, cachedSourceIndex));
  const [status, setStatus] = useState<'pending' | 'loaded' | 'failed'>(
    cachedSourceIndex >= 0 ? 'loaded' : 'pending',
  );

  useEffect(() => {
    const nextCachedIndex = safeSources.findIndex((source) => decodedImageSources.has(source));
    setSourceIndex(Math.max(0, nextCachedIndex));
    setStatus(nextCachedIndex >= 0 ? 'loaded' : 'pending');
  }, [safeSources]);

  const src = safeSources[Math.min(sourceIndex, Math.max(safeSources.length - 1, 0))] ?? '';

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (src) decodedImageSources.add(src);
    setStatus('loaded');
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (sourceIndex < safeSources.length - 1) {
      setStatus('pending');
      setSourceIndex((current) => current + 1);
      return;
    }
    setStatus('failed');
    onError?.(event);
  }

  return (
    <img
      {...imgProps}
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      data-image-state={status}
      style={{
        ...style,
        opacity: status === 'loaded' ? (typeof style?.opacity === 'number' ? style.opacity : 1) : 0,
        visibility: status === 'failed' ? 'hidden' : style?.visibility,
      }}
    />
  );
}
