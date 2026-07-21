import { useEffect, useState } from 'react'
import { fetchPublicCatalog } from '@/lib/catalog'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { ChartRow } from '@/lib/database.types'
import styles from '@/pages/Stub.module.css'

/** G8: read public chart catalog from Supabase. Packs/unlocks arrive G12. */
export default function MusicPage() {
  const [rows, setRows] = useState<ChartRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env')
      return
    }
    let cancelled = false
    fetchPublicCatalog()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Catalog fetch failed')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Music</h1>
      <p className={styles.blurb}>Public catalog (Supabase) — packs in G12</p>
      {error ? <p className={styles.blurb}>{error}</p> : null}
      {rows ? (
        <ul className={styles.blurb}>
          {rows.map((c) => (
            <li key={c.id}>
              {c.title} · {c.difficulty} · {c.bpm} BPM
            </li>
          ))}
        </ul>
      ) : !error ? (
        <p className={styles.blurb}>Loading catalog…</p>
      ) : null}
    </div>
  )
}
