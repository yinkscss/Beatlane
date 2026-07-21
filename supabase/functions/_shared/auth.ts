import { createClient } from 'jsr:@supabase/supabase-js@2'

export type AuthUser = {
  id: string
  email?: string
}

/** Require a valid user JWT from the Authorization header. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new Error('Invalid JWT')
  }

  return { id: data.user.id, email: data.user.email }
}
