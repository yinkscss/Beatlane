import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Results.module.css'

export default function ResultsPage() {
  const lastRun = useAppStore((s) => s.lastRun)
  const playMode = useAppStore((s) => s.playMode)

  const mode = lastRun?.mode ?? playMode
  const retryTo = `/play?mode=${mode}`
  const modeLabel =
    mode === 'zen' ? 'Zen' : mode === 'daily' ? 'Daily' : 'Classic'

  if (!lastRun) {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Results</p>
        <h1 className={styles.title}>No run yet</h1>
        <p className={styles.blurb}>
          Finish a Classic, Zen, or Daily run to see score and combo here.
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

      {lastRun.submitted != null ? (
        <p className={styles.blurb}>
          {lastRun.validated
            ? `Board score ${lastRun.serverScore?.toLocaleString() ?? lastRun.score} · validated`
            : lastRun.submitted
              ? 'Submitted (not validated)'
              : 'Not submitted'}
        </p>
      ) : null}

      <div className={styles.actions}>
        {mode === 'daily' ? (
          <Link to="/leaderboard?board=daily" className={styles.primary}>
            Leaderboard
          </Link>
        ) : (
          <Link to={retryTo} className={styles.primary}>
            Retry
          </Link>
        )}
        {mode === 'daily' ? (
          <Link to={retryTo} className={styles.secondary}>
            Retry Daily
          </Link>
        ) : null}
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
