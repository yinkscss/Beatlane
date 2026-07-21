import styles from '@/pages/Play.module.css'

/** Play stub — default theme is sky→lavender playfield (not dark stage). */
export default function PlayPage() {
  return (
    <div className={`${styles.page} playfield-theme`}>
      <div className={styles.hud}>
        <span className={styles.pill}>Play stub</span>
        <div className={styles.score}>0</div>
      </div>
      <div className={styles.lanes} aria-hidden>
        <div className={styles.lane} />
        <div className={styles.lane} />
        <div className={styles.lane} />
        <div className={styles.lane} />
      </div>
      <p className={styles.hint}>Sky → lavender playfield · tiles arrive in G2</p>
    </div>
  )
}
