import { NavLink, Route, Routes } from 'react-router-dom'
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

export default function App() {
  const playMode = useAppStore((s) => s.playMode)
  const { status } = useAuth()
  const playTo =
    status === 'authenticated'
      ? `/play?mode=${playMode}`
      : `/wallet?next=${encodeURIComponent(`/play?mode=${playMode}`)}`

  const nav: { to: string; label: string; end?: boolean }[] = [
    { to: '/', label: 'Home', end: true },
    { to: playTo, label: 'Play' },
    { to: '/music', label: 'Music' },
    { to: '/leaderboard?board=daily', label: 'Board' },
    { to: '/wallet', label: 'Wallet' },
    { to: '/results', label: 'Results' },
  ]

  return (
    <div className={styles.shell}>
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
      <nav className={styles.nav} aria-label="Primary">
        {nav.map(({ to, label, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
