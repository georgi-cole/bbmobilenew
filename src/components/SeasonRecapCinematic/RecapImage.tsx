import { useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';

interface RecapImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  sources: string[];
}

export default function RecapImage({ sources, onError, onLoad, style, ...imgProps }: RecapImageProps) {
  const safeSources = useMemo(() => sources.filter(Boolean), [sources]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [resolved, setResolved] = useState(false);

  const src = safeSources[Math.min(sourceIndex, Math.max(safeSources.length - 1, 0))] ?? '';

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    setResolved(true);
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (sourceIndex < safeSources.length - 1) {
      setResolved(false);
      setSourceIndex((current) => current + 1);
      return;
    }
    setResolved(true);
    onError?.(event);
  }

  return (
    <img
      {...imgProps}
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      data-image-state={resolved ? 'resolved' : 'pending'}
      style={{
        ...style,
        opacity: resolved ? (typeof style?.opacity === 'number' ? style.opacity : 1) : 0,
      }}
    />
  );
}
