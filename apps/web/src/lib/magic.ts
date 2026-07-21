import { Magic } from 'magic-sdk'

const key = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY as string | undefined

const chainId = Number(import.meta.env.VITE_CELO_CHAIN_ID ?? 42220)
const rpcUrl =
  (import.meta.env.VITE_CELO_RPC_URL as string | undefined) ??
  'https://forno.celo.org'

export function isMagicConfigured(): boolean {
  return Boolean(key)
}

let cached: Magic | null = null

/** Singleton Magic client — Celo Mainnet network for embedded wallet. */
export function getMagic(): Magic {
  if (!key) {
    throw new Error(
      'Missing VITE_MAGIC_PUBLISHABLE_KEY (see apps/web/.env.example)',
    )
  }
  if (!cached) {
    cached = new Magic(key, {
      network: {
        rpcUrl,
        chainId,
      },
    })
  }
  return cached
}
