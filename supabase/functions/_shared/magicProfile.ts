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
 *   base64(JSON.stringify([proof, claimJsonString]))
 * where claimJsonString is JSON.stringify({ iat, ext, iss, sub, aud, nbf, tid }).
 * See https://docs.magic.link/embedded-wallets/authentication/features/decentralized-id
 *
 * Verify scripts also forge:
 *   - base64([proof, "hdr.payload.sig"]) JWT-shaped claim
 *   - bare `hdr.payload.sig` tokens when MAGIC_SECRET_KEY is unset
 */
export function parseDidClaim(didToken: string): DidClaim {
  const trimmed = didToken.trim()
  if (!trimmed) throw new Error('Malformed DID token')

  // Real Magic DID: base64([proof, claimJsonString])
  try {
    const decoded = decodeBase64Json(trimmed)
    if (Array.isArray(decoded) && decoded.length >= 2) {
      const claimRaw = decoded[1]
      if (claimRaw && typeof claimRaw === 'object') {
        return claimRaw as DidClaim
      }
      if (typeof claimRaw === 'string') {
        // Official format: claim is a JSON object string
        try {
          const asJson = JSON.parse(claimRaw) as DidClaim
          if (asJson && typeof asJson === 'object' && typeof asJson.iss === 'string') {
            return asJson
          }
        } catch {
          // Fall through to JWT-shaped claim
        }
        // Forged JWT claim: header.payload.sig
        const claimParts = claimRaw.split('.')
        if (claimParts.length >= 2) {
          return decodeBase64Json(claimParts[1]) as DidClaim
        }
      }
    }
  } catch {
    // Fall through to forged whole-token JWT
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
