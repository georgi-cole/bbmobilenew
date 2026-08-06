import { useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import { isRecapImageSourceDecoded, markRecapImageSourceDecoded } from './recapImagePreload'

interface RecapImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  sources: string[]
}

interface RecapImageInstanceProps extends Omit<RecapImageProps, 'sources'> {
  safeSources: string[]
}

function RecapImageInstance({
  safeSources,
  onError,
  onLoad,
  style,
  ...imgProps
}: RecapImageInstanceProps) {
  const cachedSourceIndex = safeSources.findIndex(isRecapImageSourceDecoded)
  const [sourceIndex, setSourceIndex] = useState(() => Math.max(0, cachedSourceIndex))
  const [status, setStatus] = useState<'pending' | 'loaded' | 'failed'>(
    cachedSourceIndex >= 0 ? 'loaded' : 'pending'
  )
  const src = safeSources[Math.min(sourceIndex, Math.max(safeSources.length - 1, 0))] ?? ''

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    markRecapImageSourceDecoded(src)
    setStatus('loaded')
    onLoad?.(event)
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (sourceIndex < safeSources.length - 1) {
      setStatus('pending')
      setSourceIndex((current) => current + 1)
      return
    }
    setStatus('failed')
    onError?.(event)
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
  )
}

export default function RecapImage({ sources, ...imgProps }: RecapImageProps) {
  const safeSources = useMemo(() => [...new Set(sources.filter(Boolean))], [sources])
  const sourceKey = safeSources.join('\u0000')

  return <RecapImageInstance key={sourceKey} safeSources={safeSources} {...imgProps} />
}
