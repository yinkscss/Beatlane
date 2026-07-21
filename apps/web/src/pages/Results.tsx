import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Results.module.css'

export default function ResultsPage() {
  const lastRun = useAppStore((s) => s.lastRun)
  const playMode = useAppStore((s) => s.playMode)

  const mode = lastRun?.mode ?? playMode
  const retryTo = `/play?mode=${mode}`
  const modeLabel = mode === 'zen' ? 'Zen' : 'Classic'

  if (!lastRun) {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Results</p>
        <h1 className={styles.title}>No run yet</h1>
        <p className={styles.blurb}>
          Finish a Classic or Zen run to see score and combo here.
        </p>
        <div className={styles.actions}>
          <Link to="/play?mode=classic" className={styles.primary}>
            Play Classic
          </Link>
          <Link to="/" className={styles.secondary}>
            Home
          </Link>
        </div>
      </div>
    )
  }

  const outcomeLabel =
    lastRun.outcome === 'clear'
      ? 'Cleared'
      : lastRun.outcome === 'fail'
        ? 'Run over'
        : 'Ended'

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>
        {modeLabel} · {outcomeLabel}
      </p>
      <h1 className={styles.title}>Results</h1>
      {lastRun.chartTitle ? (
        <p className={styles.blurb}>{lastRun.chartTitle}</p>
      ) : null}

      <div className={styles.stats} role="group" aria-label="Run stats">
        <div className={styles.stat}>
          <div className={styles.statLbl}>Score</div>
          <div className={styles.statVal}>{lastRun.score.toLocaleString()}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLbl}>Combo</div>
          <div className={styles.statVal}>×{lastRun.maxCombo}</div>
        </div>
      </div>

      <div className={styles.actions}>
        <Link to={retryTo} className={styles.primary}>
          Retry
        </Link>
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
