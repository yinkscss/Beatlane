import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Home.module.css'

const modes = [
  {
    kind: 'play' as const,
    mode: 'classic' as const,
    title: 'Classic',
    blurb: 'Fail on miss · songs or endless',
    icon: '▶',
    iconClass: styles.accent,
  },
  {
    kind: 'play' as const,
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
  const navigate = useNavigate()
  const bestCombo = useAppStore((s) => s.bestCombo)
  const setPlayMode = useAppStore((s) => s.setPlayMode)
  const { status, identity } = useAuth()
  const authed = status === 'authenticated'

  const pill =
    status === 'loading'
      ? '…'
      : authed
        ? identity?.email ?? 'Signed in'
        : 'Sign in to play'

  const enterMode = (mode: 'classic' | 'zen') => {
    setPlayMode(mode)
    const playPath = `/play?mode=${mode}`
    if (!authed) {
      navigate(`/wallet?next=${encodeURIComponent(playPath)}`)
      return
    }
    navigate(playPath)
  }

  return (
    <div className={styles.page}>
      <header className={styles.status}>
        <Link
          to="/wallet"
          className={styles.pill}
          aria-label={authed ? 'Open wallet' : 'Sign in'}
        >
          {pill}
        </Link>
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
            <button
              key={mode.title}
              type="button"
              className={styles.mode}
              role="listitem"
              onClick={() => enterMode(mode.mode)}
            >
              <span className={`${styles.icon} ${mode.iconClass}`} aria-hidden>
                {mode.icon}
              </span>
              <span>
                <strong>{mode.title}</strong>
                <small>{mode.blurb}</small>
              </span>
            </button>
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
          {authed ? 'Wallet' : 'Sign in'}
        </Link>
      </div>
    </div>
  )
}
