/**
 * MiniPay detection + zero-click connect (Celopedia / docs.minipay.xyz).
 * No CTA — when `window.ethereum.isMiniPay`, auto-retrieve the address.
 */

import { createWalletClient, custom, type Address } from 'viem'
import { celo } from 'viem/chains'

export type MiniPayEthereum = {
  isMiniPay?: boolean
  request: (args: {
    method: string
    params?: unknown[]
  }) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: MiniPayEthereum
  }
}

/** True when the page is running inside MiniPay's injected browser. */
export function isMiniPayBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.ethereum !== undefined &&
    window.ethereum.isMiniPay === true
  )
}

export function getMiniPayEthereum(): MiniPayEthereum | null {
  if (!isMiniPayBrowser() || !window.ethereum) return null
  return window.ethereum
}

/**
 * Zero-click connect — `eth_accounts` / getAddresses, no Connect Wallet button.
 * Returns null when not in MiniPay or no account is available.
 */
export async function connectMiniPay(): Promise<Address | null> {
  const eth = getMiniPayEthereum()
  if (!eth) return null

  const client = createWalletClient({
    chain: celo,
    transport: custom(eth),
  })
  const accounts = await client.getAddresses()
  return accounts[0] ?? null
}

/** Deterministic issuer for MiniPay wallet sessions (Edge + profiles). */
export function minipayIssuerFromAddress(address: string): string {
  return `did:minipay:${address.toLowerCase()}`
}

/** MiniPay Add Cash deeplink (listing: low-balance → Deposit, not error). */
export const MINIPAY_ADD_CASH_URL = 'https://link.minipay.xyz/add_cash?tokens=USDm'

export function openMiniPayDeposit(): void {
  if (typeof window === 'undefined') return
  window.location.href = MINIPAY_ADD_CASH_URL
}
