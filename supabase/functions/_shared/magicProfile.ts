/** Deterministic profile id from Magic issuer (UUID v5-style from SHA-256). */

export async function profileIdFromIssuer(issuer: string): Promise<string> {
  const data = new TextEncoder().encode(`beatlane:magic:${issuer}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type DidClaim = {
  iss?: string
  ext?: number
  nbf?: number
}

/** Lightweight DID claim decode + expiry/issuer checks (Admin SDK optional). */
export function parseDidClaim(didToken: string): DidClaim {
  const parts = didToken.split('.')
  if (parts.length < 2) throw new Error('Malformed DID token')
  const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(json) as DidClaim
}

export function assertDidClaim(claim: DidClaim, issuer: string): void {
  if (!claim.iss || claim.iss !== issuer) {
    throw new Error('DID issuer mismatch')
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof claim.ext === 'number' && claim.ext < now) {
    throw new Error('DID token expired')
  }
  if (typeof claim.nbf === 'number' && claim.nbf > now + 60) {
    throw new Error('DID token not yet valid')
  }
}
