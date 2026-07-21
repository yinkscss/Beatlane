import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import styles from '@/pages/Boast.module.css'

type BoastRow = Database['public']['Tables']['boasts']['Row']

export default function BoastPage() {
  const { slug } = useParams<{ slug: string }>()
  const [boast, setBoast] = useState<BoastRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!slug) {
        setError('Missing share id')
        setLoading(false)
        return
      }
      if (!isSupabaseConfigured()) {
        setError('Supabase is not configured')
        setLoading(false)
        return
      }
      try {
        const { data, error: qErr } = await getSupabase()
          .from('boasts')
          .select('*')
          .eq('share_slug', slug.toLowerCase())
          .maybeSingle()
        if (cancelled) return
        if (qErr) throw qErr
        if (!data) {
          setError('Boast not found')
          setBoast(null)
        } else {
          setBoast(data as BoastRow)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Boast')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  const dateLabel = useMemo(() => {
    if (!boast?.created_at) return null
    try {
      return new Date(boast.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return null
    }
  }, [boast?.created_at])

  const shareUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/b/${slug}`
      : `/b/${slug ?? ''}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // ignore
    }
  }

  const shareNative = async () => {
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: 'Beatlane Boast',
        text: `I tapped ×${boast?.combo ?? '?'} on Beatlane`,
        url: shareUrl,
      })
    } catch {
      // user cancelled
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Boast</p>
        <p className={styles.blurb}>Loading attestation…</p>
      </div>
    )
  }

  if (error || !boast) {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Boast</p>
        <h1 className={styles.title}>Not found</h1>
        <p className={styles.blurb}>{error ?? 'Unknown share link'}</p>
        <div className={styles.actions}>
          <Link to="/" className={styles.secondary}>
            Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} role="img" aria-label="Boast share card">
        <div className={styles.cardEyebrow}>I TAPPED</div>
        <div className={styles.brand}>
          BEAT<span className={styles.lane}>LANE</span>
        </div>
        <div className={styles.combo}>×{boast.combo}</div>
        <p className={styles.meta}>
          {boast.chart_title ?? 'Beatlane'}
          {dateLabel ? ` · ${dateLabel}` : ''}
        </p>
        <p className={styles.proof}>
          Prove it → /b/{boast.share_slug}
          {boast.tx_hash ? (
            <>
              <br />
              <span className={styles.hash}>
                {boast.tx_hash.slice(0, 10)}…{boast.tx_hash.slice(-6)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void copyLink()}>
          Copy link
        </button>
        <button type="button" className={styles.secondary} onClick={() => void shareNative()}>
          Share
        </button>
        <Link to="/play?mode=classic" className={styles.ghost}>
          Play Beatlane
        </Link>
      </div>
    </div>
  )
}
