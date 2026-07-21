import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  fetchLeaderboard,
  LEADERBOARD_POLL_MS,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '@/lib/daily'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Leaderboard.module.css'

type BoardKind = 'daily' | 'classic'

function parseBoard(raw: string | null): BoardKind {
  return raw === 'classic' ? 'classic' : 'daily'
}

export default function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const board = parseBoard(searchParams.get('board'))
  const { status } = useAuth()
  const lastRun = useAppStore((s) => s.lastRun)

  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polledAt, setPolledAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      try {
        const next = await fetchLeaderboard({
          board,
          day: lastRun?.dailyDay ?? undefined,
          limit: 40,
        })
        if (cancelled) return
        setData(next)
        setPolledAt(next.polledAt)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Leaderboard failed')
      }
    }

    void poll()
    timer = window.setInterval(() => void poll(), LEADERBOARD_POLL_MS)

    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
    }
  }, [board, lastRun?.dailyDay, status])

  const setBoard = (next: BoardKind) => {
    setSearchParams({ board: next })
  }

  const entries: LeaderboardEntry[] = data?.entries ?? []
  const you = data?.you ?? null

  return (
    <div className={styles.page}>
      <header className={styles.status}>
        <div className={styles.pill}>LEADERBOARD</div>
        <div className={styles.tabs} role="tablist" aria-label="Board">
          <button
            type="button"
            role="tab"
            aria-selected={board === 'daily'}
            className={
              board === 'daily' ? `${styles.tab} ${styles.tabOn}` : styles.tab
            }
            onClick={() => setBoard('daily')}
          >
            Daily
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={board === 'classic'}
            className={
              board === 'classic' ? `${styles.tab} ${styles.tabOn}` : styles.tab
            }
            onClick={() => setBoard('classic')}
          >
            Classic
          </button>
        </div>
      </header>

      <p className={styles.meta}>
        {board === 'daily' && data?.day ? (
          <span>UTC {data.day}</span>
        ) : (
          <span>All-time Classic</span>
        )}
        {polledAt ? (
          <span className={styles.poll}>
            · polled {new Date(polledAt).toLocaleTimeString()}
          </span>
        ) : null}
      </p>

      {lastRun?.submitted && lastRun.mode === 'daily' && board === 'daily' ? (
        <p className={styles.banner} role="status">
          Submitted {lastRun.validated ? 'validated' : 'unvalidated'} score{' '}
          {(lastRun.serverScore ?? lastRun.score).toLocaleString()}
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.list} role="list">
        {entries.length === 0 && !error ? (
          <p className={styles.empty}>No scores yet — be first on the board.</p>
        ) : (
          entries.map((row) => (
            <div
              key={row.runId}
              className={row.isYou ? `${styles.row} ${styles.rowYou}` : styles.row}
              role="listitem"
            >
              <span className={styles.rank}>{row.rank}</span>
              <span className={styles.name}>
                {row.isYou ? 'you' : row.displayName}
              </span>
              <span className={styles.pts}>{row.score.toLocaleString()}</span>
            </div>
          ))
        )}
      </div>

      {you && !entries.some((e) => e.isYou) ? (
        <div className={`${styles.row} ${styles.rowYou} ${styles.rowFoot}`}>
          <span className={styles.rank}>{you.rank}</span>
          <span className={styles.name}>you</span>
          <span className={styles.pts}>{you.score.toLocaleString()}</span>
        </div>
      ) : null}

      <div className={styles.actions}>
        <Link to="/play?mode=daily" className={styles.primary}>
          Play Daily
        </Link>
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
