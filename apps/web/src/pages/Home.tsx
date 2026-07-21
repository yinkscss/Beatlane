import { Link } from 'react-router-dom'
import styles from '@/pages/Home.module.css'

const modes = [
  {
    to: '/play',
    title: 'Classic',
    blurb: 'Fail on miss · songs or endless',
    icon: '▶',
    iconClass: styles.accent,
  },
  {
    to: '/play',
    title: 'Zen',
    blurb: 'No fail · practice mode',
    icon: '☁',
    iconClass: styles.zen,
  },
  {
    to: '/play',
    title: 'Blitz',
    blurb: '60s · tournament scoring',
    icon: '⚡',
    iconClass: styles.blitz,
  },
  {
    to: '/play',
    title: 'Daily Track',
    blurb: 'Same chart worldwide',
    icon: '☀',
    iconClass: styles.daily,
  },
]

export default function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.status}>
        <span className={styles.pill}>Guest · auth G9</span>
        <div className={styles.score}>
          <div className={styles.scoreLbl}>Best combo</div>
          <div className={styles.scoreVal}>—</div>
        </div>
      </header>

      <div className={styles.hero}>
        <h1 className={styles.brand}>
          BEAT<span className={styles.lane}>LANE</span>
        </h1>
        <p className={styles.tagline}>Four lanes. One thumb. Keep the streak.</p>
      </div>

      <div className={styles.modes} role="list">
        {modes.map((mode) => (
          <Link key={mode.title} to={mode.to} className={styles.mode} role="listitem">
            <span className={`${styles.icon} ${mode.iconClass}`} aria-hidden>
              {mode.icon}
            </span>
            <span>
              <strong>{mode.title}</strong>
              <small>{mode.blurb}</small>
            </span>
          </Link>
        ))}
      </div>

      <div className={styles.actions}>
        <Link to="/music" className={`${styles.btn} ${styles.btnLight}`}>
          Music
        </Link>
        <Link to="/wallet" className={`${styles.btn} ${styles.btnDark}`}>
          MiniPay
        </Link>
      </div>
    </div>
  )
}
