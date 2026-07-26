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
  connectMiniPay,
  isMiniPayBrowser,
  minipayIssuerFromAddress,
} from '@/lib/minipay'
import {
  upsertMagicProfile,
  type MagicIdentity,
  type ProfileRow,
} from '@/lib/profile'
import type { AuthProviderKind } from '@/lib/sessionAuth'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

type AuthContextValue = {
  status: AuthStatus
  magicReady: boolean
  /** True when running inside MiniPay (auto-connect path). */
  isMiniPay: boolean
  provider: AuthProviderKind | null
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
  const [isMiniPay, setIsMiniPay] = useState(false)
  const [provider, setProvider] = useState<AuthProviderKind | null>(null)
  const [identity, setIdentity] = useState<MagicIdentity | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const syncSession = useCallback(async () => {
    setError(null)
    const inMiniPay = isMiniPayBrowser()
    setIsMiniPay(inMiniPay)

    // MiniPay: zero-click connect — no Magic email door required.
    if (inMiniPay) {
      try {
        const address = await connectMiniPay()
        if (!address) {
          setIdentity(null)
          setProfile(null)
          setProvider(null)
          setStatus('anonymous')
          setError('Could not connect wallet. Retry.')
          return
        }
        const next: MagicIdentity = {
          issuer: minipayIssuerFromAddress(address),
          email: null,
          walletAddress: address,
        }
        setIdentity(next)
        setProvider('minipay')
        setStatus('authenticated')
        try {
          const row = await upsertMagicProfile(next, `minipay:${address}`)
          setProfile(row)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Profile sync failed')
        }
        return
      } catch (err) {
        setIdentity(null)
        setProfile(null)
        setProvider(null)
        setStatus('anonymous')
        setError(err instanceof Error ? err.message : 'MiniPay connect failed')
        return
      }
    }

    if (!magicReady) {
      setStatus('anonymous')
      setIdentity(null)
      setProfile(null)
      setProvider(null)
      return
    }

    const magic = getMagic()
    const loggedIn = await magic.user.isLoggedIn()
    if (!loggedIn) {
      setIdentity(null)
      setProfile(null)
      setProvider(null)
      setStatus('anonymous')
      return
    }

    const info = await magic.user.getInfo()
    const next = toIdentity(info)
    if (!next) {
      setIdentity(null)
      setProfile(null)
      setProvider(null)
      setStatus('anonymous')
      return
    }

    setIdentity(next)
    setProvider('magic')
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
      if (isMiniPayBrowser()) {
        throw new Error('Already in MiniPay — wallet connects automatically')
      }
      if (!magicReady) throw new Error('Magic is not configured')
      setError(null)
      const magic = getMagic()
      await magic.auth.loginWithEmailOTP({ email: email.trim() })
      await syncSession()
    },
    [magicReady, syncSession],
  )

  const logout = useCallback(async () => {
    setError(null)
    if (isMiniPayBrowser()) {
      // MiniPay has no logout — clear local session view only.
      setIdentity(null)
      setProfile(null)
      setProvider(null)
      setStatus('anonymous')
      return
    }
    if (!magicReady) return
    const magic = getMagic()
    await magic.user.logout()
    setIdentity(null)
    setProfile(null)
    setProvider(null)
    setStatus('anonymous')
  }, [magicReady])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      magicReady,
      isMiniPay,
      provider,
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
      isMiniPay,
      provider,
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
