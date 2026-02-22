import React from 'react'
import { avatarVariants } from '../../utils/avatarCase'
import styles from './HouseguestGrid.module.css'

type Props = {
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
}

export default function AvatarTile({ name, avatarUrl, isEvicted, isYou, onClick }: Props) {
  const attemptRef = React.useRef(0)
  const variantsRef = React.useRef<string[] | null>(null)
  const exhaustedRef = React.useRef(false)

  React.useEffect(() => {
    attemptRef.current = 0
    variantsRef.current = null
    exhaustedRef.current = false
  }, [avatarUrl])

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    if (exhaustedRef.current) return
    const img = e.currentTarget
    if (!variantsRef.current) {
      variantsRef.current = avatarVariants(img.src)
      attemptRef.current = 0
    }

    attemptRef.current += 1
    const variants = variantsRef.current
    if (variants && attemptRef.current < variants.length) {
      img.src = variants[attemptRef.current]
      return
    }

    exhaustedRef.current = true
    img.src = '/avatars/placeholder.png'
  }

  return (
    <div
      className={`${styles.tile} ${isEvicted ? styles.evicted : ''}`}
      aria-label={`${name}${isEvicted ? ' (evicted)' : ''}`}
      title={name}
      role={onClick ? 'button' : 'group'}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className={styles.avatarWrap}>
        <div className={styles.nameOverlay} aria-hidden="true">
          {name}
        </div>

        {isYou && (
          <span className={styles.youBadge} aria-hidden="true">
            YOU
          </span>
        )}

        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className={styles.avatar} onError={handleImgError} />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden="true" />
        )}

        {isEvicted && (
          <svg
            className={styles.cross}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="10"
              y1="10"
              x2="90"
              y2="90"
              stroke="rgba(255, 0, 0, 0.95)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <line
              x1="90"
              y1="10"
              x2="10"
              y2="90"
              stroke="rgba(255, 0, 0, 0.95)"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <div className={styles.nameRow} aria-hidden="true" />
    </div>
  )
}
