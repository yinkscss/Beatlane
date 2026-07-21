/**
 * Celo Mainnet helpers for cUSD transfers via Magic EIP-1193 provider.
 * Network locked to Mainnet (Q07) — not Alfajores/testnet.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { celo } from 'viem/chains'
import { getMagic } from '@/lib/magic'

/** Official cUSD on Celo Mainnet. */
export const CUSD_MAINNET =
  (import.meta.env.VITE_CUSD_TOKEN_ADDRESS as Address | undefined) ??
  ('0x765DE816845861e75A25fCA122bb6898B8B1282a' as Address)

export const CUSD_DECIMALS = 18

const CELO_RPC =
  (import.meta.env.VITE_CELO_RPC_URL as string | undefined) ??
  'https://forno.celo.org'

const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function getTreasuryAddress(): Address {
  const raw = (
    import.meta.env.VITE_TREASURY_ADDRESS as string | undefined
  )?.trim()
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error(
      'Set VITE_TREASURY_ADDRESS to a Celo Mainnet 0x… address (apps/web/.env)',
    )
  }
  return raw as Address
}

export function isTreasuryConfigured(): boolean {
  const raw = (
    import.meta.env.VITE_TREASURY_ADDRESS as string | undefined
  )?.trim()
  return Boolean(raw && /^0x[a-fA-F0-9]{40}$/.test(raw))
}

function publicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(CELO_RPC),
  })
}

function walletClient() {
  const magic = getMagic()
  return createWalletClient({
    chain: celo,
    transport: custom(magic.rpcProvider),
  })
}

export async function getCusdBalance(address: Address): Promise<string> {
  const client = publicClient()
  const bal = await client.readContract({
    address: CUSD_MAINNET,
    abi: erc20TransferAbi,
    functionName: 'balanceOf',
    args: [address],
  })
  return formatUnits(bal, CUSD_DECIMALS)
}

/**
 * Transfer `amountCusd` (human dollars, e.g. 0.49) to the treasury.
 * Requires Magic session + cUSD balance + CELO for gas.
 * Returns mainnet tx hash.
 */
export async function transferCusdToTreasury(
  amountCusd: number,
): Promise<{ txHash: Hex; from: Address; to: Address }> {
  const to = getTreasuryAddress()
  const wallet = walletClient()
  const accounts = await wallet.getAddresses()
  let sender = accounts[0]
  if (!sender) {
    const info = await getMagic().user.getInfo()
    const addr = (info as { publicAddress?: string | null }).publicAddress
    if (!addr) throw new Error('Magic wallet address missing — sign in again')
    sender = addr as Address
  }

  const value = parseUnits(amountCusd.toFixed(2), CUSD_DECIMALS)
  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: 'transfer',
    args: [to, value],
  })

  const pub = publicClient()
  const bal = await pub.readContract({
    address: CUSD_MAINNET,
    abi: erc20TransferAbi,
    functionName: 'balanceOf',
    args: [sender],
  })
  if (bal < value) {
    throw new Error(
      `Insufficient cUSD: need ${amountCusd.toFixed(2)}, have ${formatUnits(bal, CUSD_DECIMALS)}. Fund your Magic wallet on Celo Mainnet, then retry.`,
    )
  }

  const txHash = await wallet.sendTransaction({
    account: sender,
    to: CUSD_MAINNET,
    data,
    chain: celo,
  })

  const receipt = await pub.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  })
  if (receipt.status !== 'success') {
    throw new Error('cUSD transfer reverted on-chain')
  }

  return { txHash, from: sender, to }
}
