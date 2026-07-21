import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { isTreasuryConfigured } from '@/lib/celo'
import { formatCusdPrice } from '@/lib/secondChance'
import {
  DEFAULT_CUP_SLUG,
  enterTournament,
  fetchTournamentLobby,
  fetchTournamentRank,
  getTournamentContractAddress,
  runPayoutStub,
  TOURNAMENT_RAKE_BPS,
  type TournamentBoardEntry,
  type TournamentLobby,
} from '@/lib/tournament'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Tournament.module.css'

export default function TournamentPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const slug = params.get('slug')?.trim() || DEFAULT_CUP_SLUG
  const view = params.get('view')
  const { status } = useAuth()
  const lastRun = useAppStore((s) => s.lastRun)

  const [lobby, setLobby] = useState<TournamentLobby | null>(null)
  const [board, setBoard] = useState<TournamentBoardEntry[]>([])
  const [you, setYou] = useState<TournamentBoardEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(view === 'results')

  const refresh = async () => {
    const next = await fetchTournamentLobby(slug)
    setLobby(next)
    const rank = await fetchTournamentRank(slug)
    setBoard(rank.board)
    setYou(rank.you)
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      navigate(
        `/wallet?next=${encodeURIComponent(`/tournament?slug=${slug}`)}`,
        { replace: true },
      )
      return
    }
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        await refresh()
        if (cancelled) return
        if (view === 'results') setShowResults(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Lobby failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, slug, view, navigate])

  const onEnter = async () => {
    if (!lobby || busy) return
    if (!isTreasuryConfigured()) {
      setError(
        'Set VITE_TREASURY_ADDRESS for Mainnet cUSD entry (Q07).',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await enterTournament(lobby)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entry failed')
    } finally {
      setBusy(false)
    }
  }

  const onPlay = () => {
    navigate(`/play?mode=blitz&cup=${encodeURIComponent(slug)}`)
  }

  const onPayoutStub = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await runPayoutStub(slug)
      await refresh()
      setShowResults(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payout stub failed')
    } finally {
      setBusy(false)
    }
  }

  if (status !== 'authenticated') {
    return (
      <div className={styles.page}>
        <p className={styles.meta}>Sign in required…</p>
      </div>
    )
  }

  if (!lobby && !error) {
    return (
      <div className={styles.page}>
        <p className={styles.meta}>Loading cup…</p>
      </div>
    )
  }

  const t = lobby?.tournament
  const entered = Boolean(lobby?.myEntry)
  const contract = getTournamentContractAddress()
  const placement =
    you?.rank ?? lastRun?.placement ?? null
  const payout =
    you?.payoutStubCusd ?? lastRun?.payoutStubCusd ?? null

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Blitz tournament</p>
      <h1 className={styles.title}>{t?.title ?? 'Cup'}</h1>
      <p className={styles.blurb}>
        {typeof t?.metadata?.blurb === 'string'
          ? t.metadata.blurb
          : '60s Blitz · most tiles · top 10 paid'}
      </p>

      {lobby ? (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statLbl}>Prize pool</div>
            <div className={styles.statVal}>
              {formatCusdPrice(lobby.prizePoolCusd)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLbl}>Entry</div>
            <div className={styles.statVal}>
              {formatCusdPrice(Number(t?.entry_fee_cusd ?? 0))}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLbl}>Players</div>
            <div className={styles.statVal}>
              {lobby.entrants}/{lobby.capacity}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLbl}>Rake</div>
            <div className={styles.statVal}>
              {(TOURNAMENT_RAKE_BPS / 100).toFixed(0)}%
            </div>
          </div>
        </div>
      ) : null}

      <p className={styles.fair}>
        No slow-mo · no shield · no Reverse / Fog / Fake Gap · skill only
      </p>

      <div className={styles.actions}>
        {!entered ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => void onEnter()}
            disabled={busy || !lobby}
          >
            {busy
              ? 'Confirming cUSD…'
              : `Enter · ${formatCusdPrice(Number(t?.entry_fee_cusd ?? 3))}`}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={onPlay}
            disabled={busy}
          >
            Play Blitz · 60s
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setShowResults((v) => !v)}
        >
          {showResults ? 'Hide ranking' : 'View ranking'}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void onPayoutStub()}
          disabled={busy}
        >
          Run payout stub
        </button>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.meta}>
          Entry fees: Celo Mainnet cUSD (Q07). Rake {TOURNAMENT_RAKE_BPS / 100}%
          held in pool math. Optional vault:{' '}
          {contract
            ? `${contract.slice(0, 6)}…${contract.slice(-4)} (Sepolia stub)`
            : 'not configured — app+edge payout stub'}
        </p>
      )}

      {showResults ? (
        <section className={styles.board} aria-label="Cup ranking">
          <h2 className={styles.boardTitle}>Cup board</h2>
          {placement != null ? (
            <p className={styles.youBanner}>
              You · #{placement}
              {payout != null && payout > 0
                ? ` · stub +${formatCusdPrice(payout)}`
                : ''}
              {lastRun?.mode === 'blitz'
                ? ` · ${lastRun.score} tiles`
                : ''}
            </p>
          ) : null}
          <ol className={styles.list}>
            {board.map((row) => (
              <li
                key={row.userId}
                className={row.isYou ? styles.rowYou : styles.row}
              >
                <span className={styles.rank}>#{row.rank}</span>
                <span className={styles.name}>{row.displayName}</span>
                <span className={styles.tiles}>{row.tiles} tiles</span>
                <span className={styles.prize}>
                  {row.payoutStubCusd > 0
                    ? formatCusdPrice(row.payoutStubCusd)
                    : '—'}
                </span>
              </li>
            ))}
          </ol>
          {board.length === 0 ? (
            <p className={styles.meta}>No runs yet — be the first.</p>
          ) : null}
        </section>
      ) : null}

      <div className={styles.footer}>
        <Link to="/" className={styles.link}>
          Home
        </Link>
        <Link to="/results" className={styles.link}>
          Results
        </Link>
      </div>
    </div>
  )
}
