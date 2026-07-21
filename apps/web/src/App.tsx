import { NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import styles from '@/App.module.css'
import HomePage from '@/pages/Home'
import MusicPage from '@/pages/Music'
import PlayPage from '@/pages/Play'
import ResultsPage from '@/pages/Results'
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
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/results" element={<ResultsPage />} />
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
