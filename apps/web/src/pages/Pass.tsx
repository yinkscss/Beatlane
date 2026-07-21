import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { isTreasuryConfigured } from '@/lib/celo'
import { formatCusdPrice } from '@/lib/secondChance'
import {
  DEFAULT_SEASON_SLUG,
  fetchSeasonPassStatus,
  purchaseSeasonPass,
  SEASON_DURATION_DAYS,
  type PassNode,
  type SeasonPassStatus,
} from '@/lib/seasonPass'
import styles from '@/pages/Pass.module.css'

function nodeClass(node: PassNode): string {
  if (node.state === 'claimed') return `${styles.node} ${styles.nodeClaimed}`
  if (node.state === 'available') return `${styles.node} ${styles.nodeNow}`
  return `${styles.node} ${styles.nodeLocked}`
}

function nodeHint(node: PassNode): string {
  if (node.rewardType === 'continue') {
    return `+${node.continueCount} continue${node.continueCount === 1 ? '' : 's'}`
  }
  return `Track: ${node.trackKey ?? 'unlock'}`
}

export default function PassPage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const [pass, setPass] = useState<SeasonPassStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const next = await fetchSeasonPassStatus(DEFAULT_SEASON_SLUG)
    setPass(next)
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      navigate(`/wallet?next=${encodeURIComponent('/pass')}`, { replace: true })
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        await refresh()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Pass load failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, navigate])

  const onBuy = async () => {
    if (!pass || busy || pass.owned) return
    if (!isTreasuryConfigured()) {
      setError('Set VITE_TREASURY_ADDRESS for Mainnet cUSD Season Pass (Q07).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await purchaseSeasonPass(pass)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading Rhythm Pass…</p>
      </div>
    )
  }

  const daysLeft = pass?.season.daysRemaining ?? SEASON_DURATION_DAYS

  return (
    <div className={styles.page}>
      <header className={styles.status}>
        <Link to="/" className={styles.pill}>
          Season 1
        </Link>
        <div className={styles.ends}>
          <div className={styles.endsLbl}>Ends</div>
          <div className={styles.endsVal}>{daysLeft}d</div>
        </div>
      </header>

      <div className={styles.head}>
        <h1 className={styles.title}>{pass?.season.title ?? 'Rhythm Pass'}</h1>
        <p className={styles.blurb}>
          {pass?.season.blurb ??
            'Bonus continues + track unlocks — no skins.'}
        </p>
      </div>

      <div className={styles.track} role="list" aria-label="Pass rewards">
        {(pass?.nodes ?? []).length === 0 ? (
          <p className={styles.empty} role="status">
            No reward nodes yet — check Season Pass seed or retry later.
          </p>
        ) : (
          (pass?.nodes ?? []).map((node) => (
            <div
              key={node.id}
              className={nodeClass(node)}
              role="listitem"
              title={nodeHint(node)}
              aria-label={`${node.label}: ${nodeHint(node)} (${node.state})`}
            >
              {node.label}
            </div>
          ))
        )}
      </div>

      <div className={styles.card}>
        <div>
          <div className={styles.cardTitle}>
            {pass?.owned ? 'Pass active' : 'Unlock full track'}
          </div>
          <div className={styles.cardSub}>
            {SEASON_DURATION_DAYS / 7} week season · continues + tracks only
          </div>
        </div>
        <strong className={styles.price}>
          {formatCusdPrice(pass?.priceCusd ?? 2.99)}
        </strong>
      </div>

      {pass && (
        <p className={styles.progress}>
          Progress {pass.progress.claimed}/{pass.progress.total} claimed
          {pass.owned
            ? ` · day ${pass.season.dayElapsed + 1} of ${SEASON_DURATION_DAYS}`
            : ''}
        </p>
      )}

      <p className={styles.network}>
        {pass?.networkNote ??
          'Season Pass purchases settle in cUSD on Celo Mainnet (Q07). Staging uses the same Mainnet path.'}
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        {pass?.owned ? (
          <Link to="/music" className={styles.primary}>
            Play unlocked tracks
          </Link>
        ) : (
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !pass}
            onClick={() => void onBuy()}
          >
            {busy
              ? 'Confirming…'
              : `Get Pass · ${formatCusdPrice(pass?.priceCusd ?? 2.99)}`}
          </button>
        )}
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
