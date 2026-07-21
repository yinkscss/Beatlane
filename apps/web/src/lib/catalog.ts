import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { ChartRow } from '@/lib/database.types'

/** Fetch public chart catalog stubs from Supabase (G8). */
export async function fetchPublicCatalog(): Promise<ChartRow[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await getSupabase()
    .from('charts')
    .select(
      'id, title, difficulty, bpm, duration_ms, is_public, audio_path, chart_path, created_at, updated_at',
    )
    .eq('is_public', true)
    .order('title', { ascending: true })

  if (error) throw error
  return data ?? []
}
