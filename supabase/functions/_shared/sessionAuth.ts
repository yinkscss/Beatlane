/**
 * Resolve Magic DID or MiniPay wallet bearer for Edge Functions.
 * MiniPay does not support personal_sign — wallet address is the session key.
 */

import {
  assertDidClaim,
  parseDidClaim,
} from './magicProfile.ts'

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/

export type SessionMode = 'magic' | 'minipay'

export type ResolvedSession = {
  issuer: string
  mode: SessionMode
  walletAddress: string | null
}

export function minipayIssuerFromAddress(address: string): string {
  return `did:minipay:${address.toLowerCase()}`
}

/**
 * Parse `Authorization: Bearer <Magic DID | minipay:0x…>`.
 * When `bodyIssuer` is provided it must match the resolved issuer.
 */
export async function resolveSessionAuth(
  req: Request,
  bodyIssuer?: string | null,
): Promise<ResolvedSession> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing DID token')
  }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) throw new Error('Missing DID token')

  if (token.toLowerCase().startsWith('minipay:')) {
    const addr = token.slice('minipay:'.length).trim()
    if (!ADDR_RE.test(addr)) throw new Error('Invalid MiniPay wallet')
    const issuer = minipayIssuerFromAddress(addr)
    if (bodyIssuer?.trim() && bodyIssuer.trim() !== issuer) {
      throw new Error('Issuer mismatch')
    }
    return {
      issuer,
      mode: 'minipay',
      walletAddress: addr,
    }
  }

  const issuer = bodyIssuer?.trim()
  if (!issuer) throw new Error('Missing issuer')

  const claim = parseDidClaim(token)
  assertDidClaim(claim, issuer)

  const magicSecret = Deno.env.get('MAGIC_SECRET_KEY')
  if (magicSecret) {
    const { Magic } = await import('npm:@magic-sdk/admin@2')
    const magic = new Magic(magicSecret)
    magic.token.validate(token)
    const meta = await magic.users.getMetadataByToken(token)
    if (meta.issuer && meta.issuer !== issuer) {
      throw new Error('Issuer mismatch')
    }
  }

  return {
    issuer,
    mode: 'magic',
    walletAddress: null,
  }
}
