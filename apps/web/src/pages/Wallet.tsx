import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { fetchMyUnlocks } from '@/lib/catalog'
import { getCusdBalance } from '@/lib/celo'
import { countHelperUnlocks } from '@/lib/helpers'
import { formatSpendSummary } from '@/lib/spendCaps'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Wallet.module.css'
import type { Address } from 'viem'

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
    isMiniPay,
    provider,
    identity,
    profile,
    error,
    loginWithEmail,
    logout,
    refresh,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [inventory, setInventory] = useState({
    slowMo: 0,
    shield: 0,
    continues: 0,
  })
  const [inventoryError, setInventoryError] = useState<string | null>(null)

  const walletLabel = useMemo(() => {
    const addr = profile?.wallet_address ?? identity?.walletAddress
    return addr ? truncateAddress(addr) : null
  }, [profile, identity])

  const playerLabel = useMemo(() => {
    if (profile?.display_name) return profile.display_name
    if (identity?.email) return identity.email
    if (provider === 'minipay') return 'MiniPay player'
    return 'Player'
  }, [profile, identity, provider])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    void (async () => {
      try {
        const unlocks = await fetchMyUnlocks()
        if (cancelled) return
        setInventory(countHelperUnlocks(unlocks))
        setInventoryError(null)
      } catch (err) {
        if (!cancelled) {
          setInventoryError(
            err instanceof Error ? err.message : 'Inventory load failed',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    const addr = (profile?.wallet_address ?? identity?.walletAddress) as
      | Address
      | null
      | undefined
    if (!addr) return
    let cancelled = false
    void (async () => {
      try {
        const bal = await getCusdBalance(addr)
        if (!cancelled) setBalance(bal)
      } catch {
        if (!cancelled) setBalance(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, profile, identity])

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

  const onRetryMiniPay = async () => {
    setBusy(true)
    setFormError(null)
    try {
      await refresh()
      navigate(afterAuth, { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>
          {isMiniPay ? 'Connecting wallet…' : 'Checking session…'}
        </p>
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
          <p className={styles.muted}>
            Celo · {provider === 'minipay' ? 'MiniPay' : 'Magic wallet'}
          </p>
          <p className={styles.email}>{playerLabel}</p>
          {walletLabel ? (
            <div className={styles.address} title="Wallet hint">
              {walletLabel}
            </div>
          ) : null}
          {error ? (
            <p className={styles.warn} role="status">
              Profile sync: {error}
            </p>
          ) : null}
        </div>

        <div className={styles.bottom}>
          <div className={styles.balance}>
            <span>USDm (cUSD)</span>
            <span className={styles.balanceVal}>
              {balance != null ? Number(balance).toFixed(2) : '—'}
            </span>
          </div>

          <div className={styles.inventory} aria-label="Purchases inventory">
            <h2 className={styles.inventoryTitle}>Purchases</h2>
            <p className={styles.inventorySub}>
              Continues &amp; helpers — Celo Mainnet receipts
            </p>
            <div className={styles.invRow}>
              <span>Second Chances</span>
              <strong className={styles.invVal}>{inventory.continues}</strong>
            </div>
            <div className={styles.invRow}>
              <span>Slow-mos</span>
              <strong className={styles.invVal}>{inventory.slowMo}</strong>
            </div>
            <div className={styles.invRow}>
              <span>Shields</span>
              <strong className={styles.invVal}>{inventory.shield}</strong>
            </div>
            {inventoryError ? (
              <p className={styles.warn} role="status">
                {inventoryError}
              </p>
            ) : null}
          </div>

          <p className={styles.spendCap} role="status">
            {formatSpendSummary()}
          </p>

          <Link
            to={`/play?mode=${playMode}`}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            Start tapping
          </Link>
          {provider === 'minipay' ? null : (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnLight}`}
              onClick={() => void onLogout()}
              disabled={busy}
            >
              Sign out
            </button>
          )}
          <p className={styles.minipayHint}>
            Pays in USDm (cUSD). Network fee is covered by your stablecoin
            balance — no separate gas token needed.
          </p>
        </div>
      </div>
    )
  }

  // Anonymous inside MiniPay — retry auto-connect (no Magic-email-only door).
  if (isMiniPay) {
    return (
      <div className={styles.page}>
        <div className={styles.hero}>
          <h1 className={styles.brand}>
            BEAT<span className={styles.lane}>LANE</span>
          </h1>
          <p className={styles.tagline}>
            Connecting your wallet automatically…
          </p>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnLight} ${styles.btnWide}`}
          onClick={() => void onRetryMiniPay()}
          disabled={busy}
        >
          {busy ? 'Connecting…' : 'Retry connect'}
        </button>
        {(formError || error) && (
          <p className={styles.warn} role="alert">
            {formError || error}
          </p>
        )}
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
      </div>

      {(formError || error) && (
        <p className={styles.warn} role="alert">
          {formError || error}
        </p>
      )}
    </div>
  )
}
