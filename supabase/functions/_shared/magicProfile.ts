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

function decodeBase64Json(b64: string): unknown {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return JSON.parse(atob(padded))
}

/**
 * Decode Magic DID claim payload.
 *
 * Real Magic DID tokens from `magic.user.getIdToken()` are:
 *   base64(JSON.stringify([proof, claimJwt]))
 * where claimJwt is a JWT (`header.payload.sig`).
 *
 * Verify scripts also forge a lightweight `hdr.payload.sig` shape when
 * MAGIC_SECRET_KEY is unset — keep that path working.
 */
export function parseDidClaim(didToken: string): DidClaim {
  const trimmed = didToken.trim()
  if (!trimmed) throw new Error('Malformed DID token')

  // Real Magic DID: base64([proof, claimJwt])
  try {
    const decoded = decodeBase64Json(trimmed)
    if (Array.isArray(decoded) && typeof decoded[1] === 'string') {
      const claimParts = decoded[1].split('.')
      if (claimParts.length < 2) throw new Error('Malformed DID token')
      return decodeBase64Json(claimParts[1]) as DidClaim
    }
  } catch {
    // Fall through to forged JWT-shaped tokens.
  }

  // Lightweight forge / JWT-shaped: hdr.payload.sig
  const parts = trimmed.split('.')
  if (parts.length < 2) throw new Error('Malformed DID token')
  try {
    return decodeBase64Json(parts[1]) as DidClaim
  } catch {
    throw new Error('Malformed DID token')
  }
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
