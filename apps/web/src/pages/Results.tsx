import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  BOAST_PRICE_CUSD,
  BOAST_SKU,
  isBoastConfigured,
  mintBoastAttestation,
} from '@/lib/boast'
import { recordPurchaseReceipt } from '@/lib/purchases'
import { formatCusdPrice } from '@/lib/secondChance'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Results.module.css'

type Sheet = 'idle' | 'mint' | 'share'

export default function ResultsPage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const lastRun = useAppStore((s) => s.lastRun)
  const playMode = useAppStore((s) => s.playMode)

  const [sheet, setSheet] = useState<Sheet>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareSlug, setShareSlug] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const mode = lastRun?.mode ?? playMode
  const retryTo = `/play?mode=${mode}`
  const modeLabel =
    mode === 'zen'
      ? 'Zen'
      : mode === 'daily'
        ? 'Daily'
        : mode === 'blitz'
          ? 'Blitz'
          : 'Classic'

  const onMint = async () => {
    if (!lastRun || busy) return
    if (status !== 'authenticated') {
      navigate(`/wallet?next=${encodeURIComponent('/results')}`)
      return
    }
    if (!isBoastConfigured()) {
      setError(
        'Boast contract not configured — set VITE_BOAST_CONTRACT_ADDRESS after Celo Sepolia deploy (contracts/README.md).',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const minted = await mintBoastAttestation({
        combo: lastRun.maxCombo,
        score: lastRun.score,
        chartTitle: lastRun.chartTitle,
      })
      const recorded = await recordPurchaseReceipt({
        sku: BOAST_SKU,
        amountCusd: BOAST_PRICE_CUSD,
        txHash: minted.txHash,
        metadata: {
          combo: lastRun.maxCombo,
          score: lastRun.score,
          chartTitle: lastRun.chartTitle,
          mode: lastRun.mode,
          onChainId: minted.boastId.toString(),
          receiptHash: minted.receiptHash,
        },
      })
      setTxHash(minted.txHash)
      setShareSlug(recorded.shareSlug ?? null)
      setSheet('share')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Boast mint failed')
    } finally {
      setBusy(false)
    }
  }

  const shareUrl =
    typeof window !== 'undefined' && shareSlug
      ? `${window.location.origin}/b/${shareSlug}`
      : shareSlug
        ? `/b/${shareSlug}`
        : null

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // ignore
    }
  }

  if (!lastRun) {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Results</p>
        <h1 className={styles.title}>No run yet</h1>
        <p className={styles.blurb}>
          Finish a Classic, Zen, Daily, or Blitz run to see score and combo here.
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

  const dateLabel = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

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
          <div className={styles.statLbl}>
            {mode === 'blitz' ? 'Tiles' : 'Score'}
          </div>
          <div className={styles.statVal}>{lastRun.score.toLocaleString()}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLbl}>Combo</div>
          <div className={styles.statVal}>×{lastRun.maxCombo}</div>
        </div>
      </div>

      {mode === 'blitz' && lastRun.placement != null ? (
        <p className={styles.blurb}>
          Cup place #{lastRun.placement}
          {lastRun.payoutStubCusd != null && lastRun.payoutStubCusd > 0
            ? ` · stub +${formatCusdPrice(lastRun.payoutStubCusd)}`
            : ''}
        </p>
      ) : null}

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
        ) : mode === 'blitz' ? (
          <Link
            to={`/tournament?slug=${encodeURIComponent(lastRun.tournamentSlug ?? 'friday-finger')}&view=results`}
            className={styles.primary}
          >
            Cup ranking
          </Link>
        ) : (
          <Link to={retryTo} className={styles.primary}>
            Play again
          </Link>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setError(null)
            setSheet('mint')
          }}
        >
          Boast streak · {formatCusdPrice(BOAST_PRICE_CUSD)}
        </button>
        {mode === 'daily' ? (
          <Link to={retryTo} className={styles.secondary}>
            Retry Daily
          </Link>
        ) : null}
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>

      {sheet === 'mint' ? (
        <div className={styles.overlay}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-labelledby="boast-mint-title"
          >
            <h2 id="boast-mint-title" className={styles.sheetTitle}>
              Boast this streak
            </h2>
            <div className={styles.attestCard}>
              <div className={styles.attestEyebrow}>BEATLANE · ATTESTATION</div>
              <div className={styles.attestCombo}>×{lastRun.maxCombo}</div>
              <div className={styles.attestMeta}>
                {modeLabel}
                {lastRun.chartTitle ? ` · ${lastRun.chartTitle}` : ''} ·{' '}
                {dateLabel}
              </div>
              <div className={styles.attestChain}>on Celo · verifiable</div>
            </div>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void onMint()}
              >
                {busy
                  ? 'Minting on Celo Sepolia…'
                  : `Mint Boast · ${formatCusdPrice(BOAST_PRICE_CUSD)}`}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setSheet('idle')}
              >
                Not now
              </button>
            </div>
            {error ? <p className={styles.err}>{error}</p> : null}
            <p className={styles.hint}>
              G15: Boast attestation on Celo Sepolia (testnet; Alfajores sunset). Continues stay
              Mainnet. Needs Sepolia cUSD + CELO gas.
            </p>
          </div>
        </div>
      ) : null}

      {sheet === 'share' && shareSlug ? (
        <div className={styles.overlayShare}>
          <div
            className={styles.shareCard}
            role="dialog"
            aria-labelledby="boast-share-title"
          >
            <p id="boast-share-title" className={styles.shareEyebrow}>
              I TAPPED
            </p>
            <div className={styles.shareBrand}>
              BEAT<span className={styles.shareLane}>LANE</span>
            </div>
            <div className={styles.shareCombo}>×{lastRun.maxCombo}</div>
            <p className={styles.shareProof}>
              Prove it → /b/{shareSlug}
              {txHash ? (
                <>
                  <br />
                  <span className={styles.shareHash}>
                    {txHash.slice(0, 10)}…{txHash.slice(-6)}
                  </span>
                </>
              ) : null}
            </p>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.shareCopy}
                onClick={() => void copyLink()}
              >
                Copy link
              </button>
              <Link to={`/b/${shareSlug}`} className={styles.shareOpen}>
                Open card
              </Link>
              <button
                type="button"
                className={styles.shareOpen}
                onClick={() => setSheet('idle')}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
