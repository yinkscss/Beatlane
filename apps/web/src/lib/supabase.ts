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

/**
 * Prefer the Edge Function JSON `{ error }` body over the generic
 * "Edge Function returned a non-2xx status code" message from supabase-js.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback = 'Edge Function failed',
): Promise<string> {
  if (
    error &&
    typeof error === 'object' &&
    'context' in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.clone().json()) as {
        error?: string
      }
      if (typeof body?.error === 'string' && body.error.trim()) {
        return body.error
      }
    } catch {
      /* ignore parse failures */
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
