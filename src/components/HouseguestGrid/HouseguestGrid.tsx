import AvatarTile from './AvatarTile'
import styles from './HouseguestGrid.module.css'

export type Houseguest = {
  id: string | number
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
}

type Props = {
  houseguests: Houseguest[]
  showCountInHeader?: boolean
}

export default function HouseguestGrid({ houseguests, showCountInHeader = false }: Props) {
  return (
    <section className={styles.container} aria-labelledby="houseguests-heading">
      <div className={styles.headerRow}>
        <h3 id="houseguests-heading" className={styles.header}>
          HOUSEGUESTS
          {showCountInHeader && <span className={styles.count}> ({houseguests.length})</span>}
          {!showCountInHeader && <span className="visually-hidden"> ({houseguests.length})</span>}
        </h3>
      </div>

      <ul className={styles.grid} role="list">
        {houseguests.map((hg) => (
          <li key={hg.id} className={styles.gridItem}>
            <AvatarTile
              name={hg.name}
              avatarUrl={hg.avatarUrl}
              isEvicted={hg.isEvicted}
              isYou={hg.isYou}
              onClick={hg.onClick}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
