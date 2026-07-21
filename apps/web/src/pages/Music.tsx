import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  fetchListedCharts,
  fetchMyUnlocks,
  fetchPacks,
  formatCusd,
  groupChartsIntoTracks,
  isTrackUnlocked,
  packSku,
  trackSku,
  type CatalogTrack,
  type PackRow,
  type UnlockRow,
} from '@/lib/catalog'
import { isTreasuryConfigured, transferCusdToTreasury } from '@/lib/celo'
import { recordPurchaseReceipt } from '@/lib/purchases'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { ChartDifficulty } from '@/lib/database.types'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Music.module.css'

type Sheet =
  | { kind: 'difficulty'; track: CatalogTrack }
  | { kind: 'pack'; pack: PackRow }
  | { kind: 'single'; track: CatalogTrack }
  | null

const DIFF_COPY: Record<
  ChartDifficulty,
  { label: string; blurb: string; iconClass: string }
> = {
  easy: {
    label: 'Easy',
    blurb: 'Wider timing · slower ramp',
    iconClass: styles.iconEasy,
  },
  normal: {
    label: 'Normal',
    blurb: 'Standard Piano Tiles pace',
    iconClass: styles.iconNormal,
  },
  hard: {
    label: 'Hard',
    blurb: 'Dense tiles · faster BPM',
    iconClass: styles.iconHard,
  },
}

function defaultDifficulty(track: CatalogTrack): ChartDifficulty {
  if (track.charts.normal) return 'normal'
  if (track.charts.easy) return 'easy'
  return 'hard'
}

function subtitle(track: CatalogTrack, unlocked: boolean): string {
  const d = defaultDifficulty(track)
  const label = DIFF_COPY[d].label
  if (track.isPublic || unlocked) return `${label} · Free`
  if (track.priceCusd != null) return `${label} · Pack`
  return `${label} · Pack`
}

export default function MusicPage() {
  const navigate = useNavigate()
  const playMode = useAppStore((s) => s.playMode)
  const { status, identity } = useAuth()

  const [tracks, setTracks] = useState<CatalogTrack[]>([])
  const [packs, setPacks] = useState<PackRow[]>([])
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [diffPick, setDiffPick] = useState<ChartDifficulty>('normal')
  const [busy, setBusy] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env')
      return
    }
    setError(null)
    const [charts, packRows] = await Promise.all([
      fetchListedCharts(),
      fetchPacks(),
    ])
    setTracks(groupChartsIntoTracks(charts))
    setPacks(packRows)

    if (status === 'authenticated') {
      try {
        const u = await fetchMyUnlocks()
        setUnlocks(u)
      } catch {
        setUnlocks([])
      }
    } else {
      setUnlocks([])
    }
  }, [status])

  useEffect(() => {
    let cancelled = false
    reload()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Catalog fetch failed')
        }
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const packById = useMemo(() => {
    const m = new Map<string, PackRow>()
    for (const p of packs) m.set(p.id, p)
    return m
  }, [packs])

  const afrobeats = packById.get('afrobeats')
  const packUnlocked = unlocks.some(
    (u) => u.unlock_type === 'pack' && u.unlock_key === 'afrobeats',
  )

  const openTrack = (track: CatalogTrack) => {
    const unlocked = isTrackUnlocked(track, unlocks)
    if (track.isPublic || unlocked) {
      setDiffPick(defaultDifficulty(track))
      setSheet({ kind: 'difficulty', track })
      setBuyError(null)
      return
    }
    if (status !== 'authenticated') {
      navigate(`/wallet?next=${encodeURIComponent('/music')}`)
      return
    }
    if (track.priceCusd != null) {
      setSheet({ kind: 'single', track })
      setBuyError(null)
      return
    }
    const pack = track.packId ? packById.get(track.packId) : undefined
    if (pack) {
      setSheet({ kind: 'pack', pack })
      setBuyError(null)
    }
  }

  const startChart = (track: CatalogTrack, difficulty: ChartDifficulty) => {
    const chart = track.charts[difficulty]
    if (!chart) return
    navigate(`/play?mode=${playMode}&chart=${encodeURIComponent(chart.id)}`)
  }

  const purchase = async (sku: string, amountCusd: number, meta: Record<string, unknown>) => {
    if (!isTreasuryConfigured()) {
      setBuyError(
        'Set VITE_TREASURY_ADDRESS in apps/web/.env (Celo Mainnet receiver).',
      )
      return
    }
    if (status !== 'authenticated' || !identity?.issuer) {
      navigate(`/wallet?next=${encodeURIComponent('/music')}`)
      return
    }
    setBusy(true)
    setBuyError(null)
    try {
      const { txHash } = await transferCusdToTreasury(amountCusd)
      await recordPurchaseReceipt({
        sku,
        amountCusd,
        txHash,
        metadata: meta,
      })
      await reload()
      setSheet(null)
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.status}>
        <Link to="/" className={styles.pill}>
          ← Home
        </Link>
        <span className={styles.pill}>Catalog</span>
      </div>

      <div className={styles.head}>
        <h1 className={styles.title}>Choose a track</h1>
      </div>

      {afrobeats && !packUnlocked ? (
        <button
          type="button"
          className={styles.packStrip}
          onClick={() => {
            if (status !== 'authenticated') {
              navigate(`/wallet?next=${encodeURIComponent('/music')}`)
              return
            }
            setSheet({ kind: 'pack', pack: afrobeats })
            setBuyError(null)
          }}
        >
          <div>
            <strong>{afrobeats.title}</strong>
            <small>{afrobeats.description ?? 'Song pack'}</small>
          </div>
          <span className={styles.lock}>{formatCusd(Number(afrobeats.price_cusd))}</span>
        </button>
      ) : null}

      {error ? (
        <p className={styles.warn} role="alert">
          {error}
        </p>
      ) : null}

      {!error && tracks.length === 0 ? (
        <p className={styles.muted}>Loading catalog…</p>
      ) : (
        <div className={styles.list}>
          {tracks.map((track) => {
            const unlocked = isTrackUnlocked(track, unlocks)
            const free = track.isPublic || unlocked
            return (
              <button
                key={track.trackKey}
                type="button"
                className={styles.track}
                onClick={() => openTrack(track)}
              >
                <div
                  className={styles.art}
                  style={{ background: track.artGradient }}
                  aria-hidden
                />
                <div className={styles.trackMeta}>
                  <strong>{track.title}</strong>
                  <small>{subtitle(track, unlocked)}</small>
                </div>
                <span
                  className={`${styles.lock} ${free ? styles.lockFree : ''}`}
                >
                  {free
                    ? '▶'
                    : track.priceCusd != null
                      ? formatCusd(track.priceCusd)
                      : formatCusd(
                          Number(
                            (track.packId && packById.get(track.packId)?.price_cusd) ??
                              1.99,
                          ),
                        )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {sheet?.kind === 'difficulty' ? (
        <div className={styles.sheet} role="dialog" aria-modal>
          <div className={styles.sheetCard}>
            <h2 className={styles.sheetTitle}>{sheet.track.title}</h2>
            <p className={styles.sheetBlurb}>Pick a chart density.</p>
            {(['easy', 'normal', 'hard'] as ChartDifficulty[]).map((d) => {
              const available = Boolean(sheet.track.charts[d])
              const copy = DIFF_COPY[d]
              return (
                <button
                  key={d}
                  type="button"
                  className={`${styles.mode} ${diffPick === d ? styles.modeSelected : ''}`}
                  disabled={!available}
                  onClick={() => setDiffPick(d)}
                >
                  <div className={`${styles.icon} ${copy.iconClass}`}>{copy.label[0]}</div>
                  <div>
                    <strong>{copy.label}</strong>
                    <small>{copy.blurb}</small>
                  </div>
                </button>
              )
            })}
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => startChart(sheet.track, diffPick)}
              >
                Start
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnLight}`}
                onClick={() => setSheet(null)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet?.kind === 'pack' ? (
        <div className={styles.sheet} role="dialog" aria-modal>
          <div className={styles.sheetCard}>
            <div
              className={styles.packArt}
              style={{
                background:
                  sheet.pack.art_gradient ??
                  'linear-gradient(145deg,var(--accent),var(--stage))',
              }}
            />
            <h2 className={styles.sheetTitle}>{sheet.pack.title}</h2>
            <p className={styles.sheetBlurb}>
              {sheet.pack.description ?? 'Royalty-safe pack charts.'}
            </p>
            <div className={styles.price}>
              {formatCusd(Number(sheet.pack.price_cusd))} cUSD
            </div>
            {buyError ? (
              <p className={styles.warn} role="alert">
                {buyError}
              </p>
            ) : null}
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                onClick={() =>
                  void purchase(packSku(sheet.pack.id), Number(sheet.pack.price_cusd), {
                    product: 'pack',
                    packId: sheet.pack.id,
                  })
                }
              >
                {busy ? 'Confirming…' : 'Unlock pack'}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnLight}`}
                disabled={busy}
                onClick={() => setSheet(null)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet?.kind === 'single' ? (
        <div className={styles.sheet} role="dialog" aria-modal>
          <div className={styles.sheetCard}>
            <div
              className={styles.packArt}
              style={{ background: sheet.track.artGradient }}
            />
            <h2 className={styles.sheetTitle}>{sheet.track.title}</h2>
            <p className={styles.sheetBlurb}>
              Unlock all Easy / Normal / Hard charts for this track.
            </p>
            <div className={styles.price}>
              {formatCusd(sheet.track.priceCusd ?? 0)} cUSD
            </div>
            {buyError ? (
              <p className={styles.warn} role="alert">
                {buyError}
              </p>
            ) : null}
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy || sheet.track.priceCusd == null}
                onClick={() =>
                  void purchase(
                    trackSku(sheet.track.trackKey),
                    sheet.track.priceCusd ?? 0,
                    {
                      product: 'track',
                      trackKey: sheet.track.trackKey,
                    },
                  )
                }
              >
                {busy ? 'Confirming…' : 'Unlock track'}
              </button>
              {sheet.track.packId && packById.get(sheet.track.packId) ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnLight}`}
                  disabled={busy}
                  onClick={() => {
                    const pack = packById.get(sheet.track.packId!)!
                    setSheet({ kind: 'pack', pack })
                    setBuyError(null)
                  }}
                >
                  See full pack
                </button>
              ) : null}
              <button
                type="button"
                className={`${styles.btn} ${styles.btnLight}`}
                disabled={busy}
                onClick={() => setSheet(null)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
