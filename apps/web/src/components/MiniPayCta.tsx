/**
 * MiniPay acquisition CTA — stub until Q21 tester device/docs.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from '@/components/MiniPayCta.module.css'

type Props = {
  /** Compact action button (Home) vs full-width (Wallet). */
  variant?: 'home' | 'wallet'
  className?: string
}

export default function MiniPayCta({ variant = 'home', className }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={
          className ??
          (variant === 'wallet'
            ? `${styles.btn} ${styles.btnDark}`
            : `${styles.btn} ${styles.btnDark}`)
        }
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {variant === 'wallet' ? 'Play with MiniPay' : 'MiniPay'}
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="minipay-stub-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.mark} aria-hidden>
              M
            </div>
            <h2 id="minipay-stub-title" className={styles.title}>
              Play with MiniPay
            </h2>
            <p className={styles.blurb}>
              Use cUSD you already hold. Tiny fees on Celo. Deep-link opens when
              MiniPay tester docs arrive — stub for now (Q21).
            </p>
            <p className={styles.stubNote} role="status">
              MiniPay path stubbed until a tester device is available.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled
              title="Deep-link pending MiniPay docs (Q21)"
            >
              Open in MiniPay
            </button>
            <Link
              to="/wallet"
              className={`${styles.btn} ${styles.btnLight}`}
              onClick={() => setOpen(false)}
            >
              Continue with Magic
            </Link>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => setOpen(false)}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
