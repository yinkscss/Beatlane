/**
 * G15 Boast — $0.29 cUSD attestation on Celo Sepolia (testnet).
 * Alfajores (44787) sunset Sep 2025; Sepolia chain id 11142220.
 * Payments for Second Chance / helpers stay Celo Mainnet (Q07).
 * Player-facing copy always says "cUSD".
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { celoSepolia } from 'viem/chains'
import { getMagic } from '@/lib/magic'

export const BOAST_PRICE_CUSD = 0.29
export const BOAST_SKU = 'boast'

/** Official Celo Sepolia USDm (Mento Dollar — player label "cUSD"). */
export const BOAST_CUSD_DEFAULT =
  '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b' as Address

export const boastAttestationAbi = [
  {
    type: 'function',
    name: 'MINT_PRICE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mintBoast',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'combo', type: 'uint64' },
      { name: 'score', type: 'uint64' },
      { name: 'chartId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'boastId', type: 'uint256' },
      { name: 'receiptHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'BoastMinted',
    inputs: [
      { name: 'boastId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'combo', type: 'uint64', indexed: false },
      { name: 'score', type: 'uint64', indexed: false },
      { name: 'chartId', type: 'bytes32', indexed: false },
      { name: 'receiptHash', type: 'bytes32', indexed: false },
    ],
  },
] as const

const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function getBoastContractAddress(): Address | null {
  const raw = (
    import.meta.env.VITE_BOAST_CONTRACT_ADDRESS as string | undefined
  )?.trim()
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return null
  return raw as Address
}

export function isBoastConfigured(): boolean {
  return getBoastContractAddress() != null
}

function boastRpc(): string {
  return (
    (import.meta.env.VITE_BOAST_RPC_URL as string | undefined)?.trim() ||
    'https://forno.celo-sepolia.celo-testnet.org'
  )
}

function boastCusd(): Address {
  const raw = (
    import.meta.env.VITE_BOAST_CUSD_ADDRESS as string | undefined
  )?.trim()
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return raw as Address
  return BOAST_CUSD_DEFAULT
}

function publicClient() {
  return createPublicClient({
    chain: celoSepolia,
    transport: http(boastRpc()),
  })
}

function walletClient() {
  const magic = getMagic()
  return createWalletClient({
    chain: celoSepolia,
    transport: custom(magic.rpcProvider),
  })
}

export function chartIdFromTitle(title: string | null | undefined): Hex {
  const enc = new TextEncoder().encode(title?.trim() || 'beatlane')
  // Lightweight keccak via viem would need import — use pad of first 32 bytes of digest.
  // Prefer real keccak: dynamic import avoided; use Web Crypto SHA-256 truncated to 32 bytes as chart key.
  // Contract treats chartId as opaque bytes32.
  return sha256Bytes32(enc)
}

function sha256Bytes32(data: Uint8Array): Hex {
  // Sync fallback for environments without crypto.subtle sync — use a tiny FNV-style mix
  // then pad. Prefer subtle when available (async path in mint).
  let h = 2166136261
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!
    h = Math.imul(h, 16777619)
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return (`0x${hex.padEnd(64, '0')}`) as Hex
}

export async function chartIdFromTitleAsync(
  title: string | null | undefined,
): Promise<Hex> {
  const enc = new TextEncoder().encode(title?.trim() || 'beatlane')
  if (globalThis.crypto?.subtle) {
    const dig = await crypto.subtle.digest('SHA-256', enc)
    const bytes = new Uint8Array(dig)
    let out = '0x'
    for (const b of bytes) out += b.toString(16).padStart(2, '0')
    return out as Hex
  }
  return chartIdFromTitle(title)
}

export type MintBoastResult = {
  txHash: Hex
  boastId: bigint
  receiptHash: Hex
  from: Address
}

/**
 * Approve cUSD + mintBoast on Celo Sepolia via Magic EIP-1193 provider.
 * Requires VITE_BOAST_CONTRACT_ADDRESS and Sepolia cUSD (+ CELO gas) in the wallet.
 */
export async function mintBoastAttestation(input: {
  combo: number
  score: number
  chartTitle?: string | null
}): Promise<MintBoastResult> {
  const contract = getBoastContractAddress()
  if (!contract) {
    throw new Error(
      'Set VITE_BOAST_CONTRACT_ADDRESS (Celo Sepolia deploy). See contracts/README.md',
    )
  }

  const wallet = walletClient()
  const accounts = await wallet.getAddresses()
  let sender = accounts[0]
  if (!sender) {
    const info = await getMagic().user.getInfo()
    const addr = (info as { publicAddress?: string | null }).publicAddress
    if (!addr) throw new Error('Magic wallet address missing — sign in again')
    sender = addr as Address
  }

  const pub = publicClient()
  const cusd = boastCusd()
  const price = parseUnits(BOAST_PRICE_CUSD.toFixed(2), 18)
  const chartId = await chartIdFromTitleAsync(input.chartTitle)

  const bal = await pub.readContract({
    address: cusd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [sender],
  })
  if (bal < price) {
    throw new Error(
      `Insufficient Sepolia cUSD: need ${BOAST_PRICE_CUSD.toFixed(2)}. Fund Magic wallet on Celo Sepolia (faucet), then retry.`,
    )
  }

  const allowance = await pub.readContract({
    address: cusd,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [sender, contract],
  })
  if (allowance < price) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [contract, price],
    })
    const approveHash = await wallet.sendTransaction({
      account: sender,
      to: cusd,
      data: approveData,
      chain: celoSepolia,
    })
    const approveReceipt = await pub.waitForTransactionReceipt({
      hash: approveHash,
      confirmations: 1,
    })
    if (approveReceipt.status !== 'success') {
      throw new Error('cUSD approve reverted on Celo Sepolia')
    }
  }

  const mintData = encodeFunctionData({
    abi: boastAttestationAbi,
    functionName: 'mintBoast',
    args: [BigInt(input.combo), BigInt(input.score), chartId],
  })
  const txHash = await wallet.sendTransaction({
    account: sender,
    to: contract,
    data: mintData,
    chain: celoSepolia,
  })
  const receipt = await pub.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  })
  if (receipt.status !== 'success') {
    throw new Error('Boast mint reverted on Celo Sepolia')
  }

  let boastId = 0n
  let receiptHash = ('0x' + '0'.repeat(64)) as Hex
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: boastAttestationAbi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== 'BoastMinted') continue
      boastId = decoded.args.boastId
      receiptHash = decoded.args.receiptHash
      break
    } catch {
      // not our event
    }
  }

  return { txHash, boastId, receiptHash, from: sender }
}
