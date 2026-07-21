import {
  edgeFunctionErrorMessage,
  getSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']

export type MagicIdentity = {
  issuer: string
  email: string | null
  walletAddress: string | null
}

type UpsertResponse = {
  ok: boolean
  profile?: ProfileRow
  error?: string
  didVerified?: boolean
}

/**
 * Magic DID → Edge Function → profiles upsert (service role).
 * See supabase/functions/magic-profile.
 */
export async function upsertMagicProfile(
  identity: MagicIdentity,
  didToken: string,
): Promise<ProfileRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<UpsertResponse>(
    'magic-profile',
    {
      body: {
        issuer: identity.issuer,
        email: identity.email,
        walletAddress: identity.walletAddress,
        displayName: identity.email?.split('@')[0] ?? null,
      },
      headers: {
        Authorization: `Bearer ${didToken}`,
      },
    },
  )

  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, 'Profile upsert failed'))
  }
  if (!data?.ok || !data.profile) {
    throw new Error(data?.error ?? 'Profile upsert failed')
  }
  return data.profile
}
