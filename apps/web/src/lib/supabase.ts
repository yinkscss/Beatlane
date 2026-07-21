import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

/** Browser client for project blockblast. Uses anon/publishable key only. */
export function createSupabaseClient(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env.example)',
    )
  }
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

let cached: SupabaseClient<Database> | null = null

/** Shared singleton for app code. */
export function getSupabase(): SupabaseClient<Database> {
  if (!cached) cached = createSupabaseClient()
  return cached
}
