import { useEffect, useRef } from 'react'
import type { CastleRescueGameProps } from './CastleRescueGame'

type RemasteredProps = Omit<CastleRescueGameProps, 'variant' | 'remastered'>

function RemasteredTwin({ part, onFinish, autoStart = true }: RemasteredProps & { part: 1 | 2 }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin)
        return
      if (event.data?.type !== 'twin:complete' || finished.current) return
      const score = event.data.score
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return
      finished.current = true
      onFinish?.(score)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onFinish])
  return (
    <iframe
      ref={frame}
      title={`Find Your Twin ${part} — Remastered`}
      src={`${import.meta.env.BASE_URL}minigames/twin-remastered/part${part}/index.html?autostart=${autoStart ? '1' : '0'}`}
      style={{ width: '100%', height: '100dvh', border: 0, display: 'block' }}
    />
  )
}

/** Production Part 1 remaster. Gameplay/scoring stay shared; the premium renderer is explicit. */
export function RemasteredCastleRescueGame(props: RemasteredProps) {
  return <RemasteredTwin {...props} part={1} />
}

/** Production Lost Again remaster, including its castle-specific premium renderer. */
export function RemasteredBennyLennyCastleRescueGame(props: RemasteredProps) {
  return <RemasteredTwin {...props} part={2} />
}
