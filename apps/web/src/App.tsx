import { NavLink, Route, Routes } from 'react-router-dom'
import styles from '@/App.module.css'
import HomePage from '@/pages/Home'
import MusicPage from '@/pages/Music'
import PlayPage from '@/pages/Play'
import ResultsPage from '@/pages/Results'
import WalletPage from '@/pages/Wallet'

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/play', label: 'Play' },
  { to: '/music', label: 'Music' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/results', label: 'Results' },
]

export default function App() {
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
            key={to}
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
