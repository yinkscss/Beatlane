/** Persist mute preference (G19 mute defaults). Default: unmuted. */

const KEY = 'beatlane:muted'

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readMutedDefault(
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  try {
    const s = storage ?? defaultStorage()
    if (!s) return false
    const raw = s.getItem(KEY)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return false
}

export function writeMutedPref(
  muted: boolean,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const s = storage ?? defaultStorage()
    if (!s) return
    s.setItem(KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}
