import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getMagic, isMagicConfigured } from '@/lib/magic'
import {
  upsertMagicProfile,
  type MagicIdentity,
  type ProfileRow,
} from '@/lib/profile'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

type AuthContextValue = {
  status: AuthStatus
  magicReady: boolean
  identity: MagicIdentity | null
  profile: ProfileRow | null
  error: string | null
  loginWithEmail: (email: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toIdentity(info: {
  issuer: string | null
  email?: string | null
  publicAddress?: string | null
}): MagicIdentity | null {
  if (!info.issuer) return null
  return {
    issuer: info.issuer,
    email: info.email ?? null,
    walletAddress: info.publicAddress ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const magicReady = isMagicConfigured()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [identity, setIdentity] = useState<MagicIdentity | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const syncSession = useCallback(async () => {
    if (!magicReady) {
      setStatus('anonymous')
      setIdentity(null)
      setProfile(null)
      return
    }

    setError(null)
    const magic = getMagic()
    const loggedIn = await magic.user.isLoggedIn()
    if (!loggedIn) {
      setIdentity(null)
      setProfile(null)
      setStatus('anonymous')
      return
    }

    const info = await magic.user.getInfo()
    const next = toIdentity(info)
    if (!next) {
      setIdentity(null)
      setProfile(null)
      setStatus('anonymous')
      return
    }

    setIdentity(next)
    setStatus('authenticated')

    try {
      const did = await magic.user.getIdToken()
      const row = await upsertMagicProfile(next, did)
      setProfile(row)
    } catch (err) {
      // Session is still valid even if profile upsert fails (offline / edge cold).
      setError(err instanceof Error ? err.message : 'Profile sync failed')
    }
  }, [magicReady])

  useEffect(() => {
    void syncSession()
  }, [syncSession])

  const loginWithEmail = useCallback(
    async (email: string) => {
      if (!magicReady) throw new Error('Magic is not configured')
      setError(null)
      const magic = getMagic()
      await magic.auth.loginWithEmailOTP({ email: email.trim() })
      await syncSession()
    },
    [magicReady, syncSession],
  )

  const logout = useCallback(async () => {
    if (!magicReady) return
    setError(null)
    const magic = getMagic()
    await magic.user.logout()
    setIdentity(null)
    setProfile(null)
    setStatus('anonymous')
  }, [magicReady])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      magicReady,
      identity,
      profile,
      error,
      loginWithEmail,
      logout,
      refresh: syncSession,
    }),
    [
      status,
      magicReady,
      identity,
      profile,
      error,
      loginWithEmail,
      logout,
      syncSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
