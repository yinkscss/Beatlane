import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Home.module.css'

const modes = [
  {
    kind: 'play' as const,
    to: '/play?mode=classic',
    mode: 'classic' as const,
    title: 'Classic',
    blurb: 'Fail on miss · songs or endless',
    icon: '▶',
    iconClass: styles.accent,
  },
  {
    kind: 'play' as const,
    to: '/play?mode=zen',
    mode: 'zen' as const,
    title: 'Zen',
    blurb: 'No fail · practice mode',
    icon: '☁',
    iconClass: styles.zen,
  },
  {
    kind: 'soon' as const,
    title: 'Blitz',
    blurb: '60s · tournament scoring',
    icon: '⚡',
    iconClass: styles.blitz,
  },
  {
    kind: 'soon' as const,
    title: 'Daily Track',
    blurb: 'Same chart worldwide',
    icon: '☀',
    iconClass: styles.daily,
  },
]

export default function HomePage() {
  const bestCombo = useAppStore((s) => s.bestCombo)
  const setPlayMode = useAppStore((s) => s.setPlayMode)

  return (
    <div className={styles.page}>
      <header className={styles.status}>
        <span className={styles.pill}>Guest · auth G9</span>
        <div className={styles.score}>
          <div className={styles.scoreLbl}>Best combo</div>
          <div className={styles.scoreVal}>
            {bestCombo > 0 ? bestCombo : '—'}
          </div>
        </div>
      </header>

      <div className={styles.hero}>
        <h1 className={styles.brand}>
          BEAT<span className={styles.lane}>LANE</span>
        </h1>
        <p className={styles.tagline}>Four lanes. One thumb. Keep the streak.</p>
      </div>

      <div className={styles.modes} role="list">
        {modes.map((mode) =>
          mode.kind === 'play' ? (
            <Link
              key={mode.title}
              to={mode.to}
              className={styles.mode}
              role="listitem"
              onClick={() => setPlayMode(mode.mode)}
            >
              <span className={`${styles.icon} ${mode.iconClass}`} aria-hidden>
                {mode.icon}
              </span>
              <span>
                <strong>{mode.title}</strong>
                <small>{mode.blurb}</small>
              </span>
            </Link>
          ) : (
            <div
              key={mode.title}
              className={`${styles.mode} ${styles.modeSoon}`}
              role="listitem"
              aria-disabled="true"
            >
              <span className={`${styles.icon} ${mode.iconClass}`} aria-hidden>
                {mode.icon}
              </span>
              <span>
                <strong>{mode.title}</strong>
                <small>{mode.blurb}</small>
              </span>
            </div>
          ),
        )}
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
