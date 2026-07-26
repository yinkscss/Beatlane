import { describe, expect, it } from 'vitest'
import {
  MINIPAY_ADD_CASH_URL,
  minipayIssuerFromAddress,
} from '@/lib/minipay'
import { CUSD_MAINNET } from '@/lib/celo'

describe('minipay', () => {
  it('builds deterministic did:minipay issuer (lowercase)', () => {
    expect(
      minipayIssuerFromAddress('0xAbCdEf0123456789AbCdEf0123456789aBcDeF01'),
    ).toBe('did:minipay:0xabcdef0123456789abcdef0123456789abcdef01')
  })

  it('points Deposit deeplink at MiniPay Add Cash (USDm)', () => {
    expect(MINIPAY_ADD_CASH_URL).toContain('link.minipay.xyz/add_cash')
    expect(MINIPAY_ADD_CASH_URL).toContain('USDm')
  })

  it('uses USDm/cUSD token as feeCurrency (fee abstraction)', () => {
    // Canonical Mainnet USDm — same address for token + feeCurrency.
    expect(CUSD_MAINNET.toLowerCase()).toBe(
      '0x765de816845861e75a25fca122bb6898b8b1282a',
    )
  })
})
