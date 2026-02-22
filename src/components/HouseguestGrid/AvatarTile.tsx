import styles from "./HouseguestGrid.module.css";

type Props = {
  name: string;
  avatarUrl?: string;
  isEvicted?: boolean;
  isYou?: boolean;
  onClick?: () => void;
};

export default function AvatarTile({ name, avatarUrl, isEvicted, isYou, onClick }: Props) {
  return (
    <div
      className={`${styles.tile} ${isEvicted ? styles.evicted : ""} ${isYou ? styles.you : ""}`}
      aria-label={`${name}${isEvicted ? " (evicted)" : ""}`}
      title={name}
      role={onClick ? "button" : "group"}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className={styles.avatarWrap}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden="true" />
        )}

        {isEvicted && (
          <svg className={styles.cross} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="10" y1="10" x2="90" y2="90" stroke="rgba(255, 0, 0, 0.95)" strokeWidth="10" strokeLinecap="round"/>
            <line x1="90" y1="10" x2="10" y2="90" stroke="rgba(255, 0, 0, 0.95)" strokeWidth="10" strokeLinecap="round"/>
          </svg>
        )}
      </div>

      <div className={styles.nameRow}>
        {isYou && <span className={styles.youBadge}>YOU</span>}
        <span className={styles.name}>{name}</span>
      </div>
    </div>
  );
}
