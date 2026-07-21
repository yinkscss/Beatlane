import { useEffect, useRef, useState } from 'react'
import {
  ClassicPlayfield,
  type FailReason,
  type HitGrade,
} from '@/game/classicPlayfield'
import styles from '@/pages/Play.module.css'

/** G2 — Pixi Classic stub playfield (shatter VFX, miss/wrong ends run). */
export default function PlayPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ClassicPlayfield | null>(null)
  const [score, setScore] = useState(0)
  const [lastGrade, setLastGrade] = useState<HitGrade | null>(null)
  const [fail, setFail] = useState<FailReason | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    const game = new ClassicPlayfield({
      onHit: (grade, nextScore) => {
        if (cancelled) return
        setScore(nextScore)
        setLastGrade(grade)
      },
      onFail: (reason) => {
        if (cancelled) return
        setFail(reason)
      },
    })
    gameRef.current = game

    void game.mount(host).catch((err) => {
      console.error('Playfield failed to mount', err)
    })

    return () => {
      cancelled = true
      game.destroy()
      gameRef.current = null
    }
  }, [])

  const retry = () => {
    setFail(null)
    setScore(0)
    setLastGrade(null)
    gameRef.current?.restart()
  }

  return (
    <div className={styles.page}>
      <div className={styles.hud} aria-live="polite">
        <span className={styles.pill}>Classic stub</span>
        <div className={styles.scoreBlock}>
          {lastGrade ? (
            <span
              className={
                lastGrade === 'perfect' ? styles.gradePerfect : styles.gradeGreat
              }
            >
              {lastGrade === 'perfect' ? 'PERFECT' : 'GREAT'}
            </span>
          ) : (
            <span className={styles.gradeIdle}>Tap lanes</span>
          )}
          <div className={styles.score}>{score}</div>
        </div>
      </div>

      <div
        ref={hostRef}
        className={styles.canvasHost}
        role="application"
        aria-label="Beatlane playfield"
      />

      {fail ? (
        <div className={styles.failOverlay}>
          <p className={styles.failTitle}>
            {fail === 'miss' ? 'Miss' : 'Wrong tap'}
          </p>
          <p className={styles.failSub}>Classic stub ended</p>
          <button type="button" className={styles.retry} onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}

      <p className={styles.hint}>
        Tap a lane · DFJK / 1–4 · glass shatter on hit
      </p>
    </div>
  )
}
