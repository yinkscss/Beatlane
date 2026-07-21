import type { ReactNode } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import styles from '@/App.module.css'
import BoastPage from '@/pages/Boast'
import HomePage from '@/pages/Home'
import LeaderboardPage from '@/pages/Leaderboard'
import MusicPage from '@/pages/Music'
import PassPage from '@/pages/Pass'
import PlayPage from '@/pages/Play'
import ResultsPage from '@/pages/Results'
import TournamentPage from '@/pages/Tournament'
import WalletPage from '@/pages/Wallet'
import { useAppStore } from '@/store/appStore'

type NavItem = {
  to: string
  label: string
  end?: boolean
  primary?: boolean
  match?: (pathname: string) => boolean
  icon: ReactNode
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M4.5 10.5 12 4l7.5 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-4V21H5.5a1 1 0 0 1-1-1v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M8.5 6.8v10.4c0 .9 1 1.4 1.7.9l8-5.2a1 1 0 0 0 0-1.7l-8-5.2a1 1 0 0 0-1.7.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

function IconMusic() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M9 18a2.5 2.5 0 1 1-2-2.45V7.6c0-.7.5-1.3 1.2-1.45l8-1.7c.9-.2 1.8.5 1.8 1.45v8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="16.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function IconBoard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M5 19V11M12 19V5M19 19v-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a1 1 0 0 1 1 1v1.5M4 8.5v9A2.5 2.5 0 0 0 6.5 20H19a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-4.2a2 2 0 1 0 0 4H20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconResults() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M8 14.5 10.2 12l2.3 2.3L16.5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 4.5h11A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V7a2.5 2.5 0 0 1 2.5-2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export default function App() {
  const playMode = useAppStore((s) => s.playMode)
  const { status } = useAuth()
  const { pathname } = useLocation()
  const playFullscreen = pathname === '/play'
  const playTo =
    status === 'authenticated'
      ? `/play?mode=${playMode}`
      : `/wallet?next=${encodeURIComponent(`/play?mode=${playMode}`)}`

  const nav: NavItem[] = [
    { to: '/', label: 'Home', end: true, icon: <IconHome /> },
    { to: playTo, label: 'Play', primary: true, icon: <IconPlay />, match: (p) => p === '/play' },
    { to: '/music', label: 'Music', icon: <IconMusic /> },
    {
      to: '/leaderboard?board=daily',
      label: 'Board',
      icon: <IconBoard />,
      match: (p) => p === '/leaderboard',
    },
    { to: '/wallet', label: 'Wallet', icon: <IconWallet /> },
    { to: '/results', label: 'Results', icon: <IconResults /> },
  ]

  return (
    <div
      className={
        playFullscreen ? `${styles.shell} ${styles.shellPlay}` : styles.shell
      }
    >
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/tournament" element={<TournamentPage />} />
          <Route path="/pass" element={<PassPage />} />
          <Route path="/b/:slug" element={<BoastPage />} />
        </Routes>
      </main>
      {playFullscreen ? null : (
        <nav className={styles.nav} aria-label="Primary">
          {nav.map(({ to, label, end, primary, match, icon }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) => {
                const active = match ? match(pathname) : isActive
                return [
                  styles.navLink,
                  primary ? styles.navLinkPrimary : '',
                  active ? styles.navLinkActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }}
            >
              <span className={styles.iconWrap}>{icon}</span>
              <span className={styles.label}>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
