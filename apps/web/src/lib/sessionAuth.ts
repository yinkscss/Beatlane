/**
 * Unified session credentials for Edge Functions.
 * Magic DID token, or MiniPay wallet bearer (no personal_sign).
 */

import { getMagic, isMagicConfigured } from '@/lib/magic'
import {
  isMiniPayBrowser,
  minipayIssuerFromAddress,
} from '@/lib/minipay'

export type AuthProviderKind = 'magic' | 'minipay'

export type SessionAuth = {
  provider: AuthProviderKind
  issuer: string
  walletAddress: string | null
  email: string | null
  /** Authorization header value (includes `Bearer …`). */
  authorization: string
}

/**
 * Resolve the active session for Edge calls.
 * Prefers MiniPay when inside MiniPay; otherwise Magic email wallet.
 */
export async function getSessionAuth(): Promise<SessionAuth> {
  if (isMiniPayBrowser() && typeof window !== 'undefined' && window.ethereum) {
    const accounts = (await window.ethereum.request({
      method: 'eth_accounts',
    })) as string[]
    const address = accounts[0]
    if (address) {
      const issuer = minipayIssuerFromAddress(address)
      return {
        provider: 'minipay',
        issuer,
        walletAddress: address,
        email: null,
        authorization: `Bearer minipay:${address}`,
      }
    }
  }

  if (!isMagicConfigured()) {
    throw new Error('Sign in required')
  }

  const magic = getMagic()
  const loggedIn = await magic.user.isLoggedIn()
  if (!loggedIn) throw new Error('Sign in required')

  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()

  const walletAddress =
    (info as { publicAddress?: string | null }).publicAddress ?? null

  return {
    provider: 'magic',
    issuer: info.issuer,
    walletAddress,
    email: info.email ?? null,
    authorization: `Bearer ${did}`,
  }
}

/** Optional auth — returns null when anonymous (e.g. public catalog). */
export async function trySessionAuth(): Promise<SessionAuth | null> {
  try {
    return await getSessionAuth()
  } catch {
    return null
  }
}
