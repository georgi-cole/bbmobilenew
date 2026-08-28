import { useEffect, useRef } from 'react'

const SURVEYEVAL_TILE_EVICTION_MS = 1800

type Props = {
  evicteeId: string
  onDone: () => void
}

/**
 * Holds the Surveyeval eviction beat on the roster itself. The visible
 * electricity and glass are rendered by the evictee's AvatarTile.
 */
export default function SurveyevalTileEvictionEffect({ evicteeId, onDone }: Props) {
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), SURVEYEVAL_TILE_EVICTION_MS)
    return () => window.clearTimeout(timer)
  }, [evicteeId])

  return null
}
