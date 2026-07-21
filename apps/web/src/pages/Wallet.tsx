import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Wallet.module.css'

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export default function WalletPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const nextRaw = params.get('next')
  const playMode = useAppStore((s) => s.playMode)
  const afterAuth = nextRaw || `/play?mode=${playMode}`
  const {
    status,
    magicReady,
    identity,
    profile,
    error,
    loginWithEmail,
    logout,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const walletLabel = useMemo(() => {
    const addr = profile?.wallet_address ?? identity?.walletAddress
    return addr ? truncateAddress(addr) : null
  }, [profile, identity])

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setFormError(null)
    try {
      await loginWithEmail(email.trim())
      navigate(afterAuth, { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const onLogout = async () => {
    setBusy(true)
    try {
      await logout()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>Checking session…</p>
      </div>
    )
  }

  if (status === 'authenticated') {
    return (
      <div className={styles.page}>
        <div className={styles.ready}>
          <div className={styles.check} aria-hidden>
            ✓
          </div>
          <h1 className={styles.readyTitle}>You’re in</h1>
          <p className={styles.muted}>Celo · Magic wallet</p>
          {walletLabel ? (
            <div className={styles.address}>{walletLabel}</div>
          ) : null}
          {identity?.email ? (
            <p className={styles.email}>{identity.email}</p>
          ) : null}
          {profile?.display_name ? (
            <p className={styles.profileHint}>
              Profile · {profile.display_name}
            </p>
          ) : null}
          {error ? (
            <p className={styles.warn} role="status">
              Profile sync: {error}
            </p>
          ) : null}
        </div>

        <div className={styles.bottom}>
          <div className={styles.balance}>
            <span>cUSD</span>
            <span className={styles.balanceVal}>—</span>
          </div>
          <Link
            to={`/play?mode=${playMode}`}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            Start tapping
          </Link>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnLight}`}
            onClick={() => void onLogout()}
            disabled={busy}
          >
            Sign out
          </button>
          <p className={styles.minipayHint}>
            MiniPay path stubs in G17 — use Magic for now.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.brand}>
          BEAT<span className={styles.lane}>LANE</span>
        </h1>
        <p className={styles.tagline}>
          Sign in to play, save scores &amp; pay continues. Wallet created for
          you.
        </p>
      </div>

      {!magicReady ? (
        <p className={styles.warn} role="alert">
          Set <code>VITE_MAGIC_PUBLISHABLE_KEY</code> in apps/web/.env
        </p>
      ) : (
        <form className={styles.form} onSubmit={(e) => void onLogin(e)}>
          <label className={styles.label} htmlFor="magic-email">
            Email
          </label>
          <input
            id="magic-email"
            className={styles.input}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnLight} ${styles.btnWide}`}
            disabled={busy || !email.trim()}
          >
            {busy ? 'Sending code…' : '✉️ Continue with email'}
          </button>
        </form>
      )}

      <div className={styles.stack}>
        <button type="button" className={`${styles.btn} ${styles.btnLight}`} disabled>
          📱 Continue with phone
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnLight}`} disabled>
          G Continue with Google
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnDark}`} disabled>
          Open MiniPay
        </button>
      </div>

      {(formError || error) && (
        <p className={styles.warn} role="alert">
          {formError || error}
        </p>
      )}
    </div>
  )
}
