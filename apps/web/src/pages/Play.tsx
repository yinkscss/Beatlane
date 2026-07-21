import { useEffect, useRef, useState } from 'react'
import {
  ClassicPlayfield,
  type FailReason,
  type HitGrade,
} from '@/game/classicPlayfield'
import {
  railFillPct,
  railMarks,
  type JudgeGrade,
} from '@/game/judging'
import styles from '@/pages/Play.module.css'

const JUDGE_MS = 520

const MARK_GLYPH: Record<'star' | 'flag' | 'crown', string> = {
  star: '⭐',
  flag: '⚑',
  crown: '👑',
}

/** G3 — Judging & HUD over G2 Pixi Classic playfield. */
export default function PlayPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ClassicPlayfield | null>(null)
  const judgeTimer = useRef<number | null>(null)

  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [judge, setJudge] = useState<JudgeGrade | null>(null)
  const [judgeKey, setJudgeKey] = useState(0)
  const [scorePop, setScorePop] = useState(false)
  const [missFlash, setMissFlash] = useState(false)
  const [fail, setFail] = useState<FailReason | null>(null)
  const [failCombo, setFailCombo] = useState(0)

  const showJudge = (grade: JudgeGrade) => {
    if (judgeTimer.current) window.clearTimeout(judgeTimer.current)
    setJudge(grade)
    setJudgeKey((k) => k + 1)
    judgeTimer.current = window.setTimeout(() => {
      setJudge(null)
      judgeTimer.current = null
    }, JUDGE_MS)
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    const game = new ClassicPlayfield({
      onHit: (grade: HitGrade, nextScore, nextCombo) => {
        if (cancelled) return
        setScore(nextScore)
        setCombo(nextCombo)
        setScorePop(true)
        window.setTimeout(() => setScorePop(false), 160)
        showJudge(grade)
      },
      onFail: (reason, nextScore, endedCombo) => {
        if (cancelled) return
        setScore(nextScore)
        setCombo(0)
        setFailCombo(endedCombo)
        setFail(reason)
        showJudge('miss')
        setMissFlash(true)
        window.setTimeout(() => setMissFlash(false), 450)
      },
    })
    gameRef.current = game

    void game.mount(host).catch((err) => {
      console.error('Playfield failed to mount', err)
    })

    return () => {
      cancelled = true
      if (judgeTimer.current) window.clearTimeout(judgeTimer.current)
      game.destroy()
      gameRef.current = null
    }
  }, [])

  const retry = () => {
    setFail(null)
    setScore(0)
    setCombo(0)
    setFailCombo(0)
    setJudge(null)
    setMissFlash(false)
    gameRef.current?.restart()
  }

  const fill = railFillPct(combo)
  const marks = railMarks(combo)
  const judgeLabel =
    judge === 'perfect' ? 'PERFECT' : judge === 'great' ? 'GREAT' : judge === 'miss' ? 'MISS' : null

  return (
    <div className={styles.page}>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.rail} />
        <div className={styles.fill} style={{ width: `${fill}%` }} />
        <div className={styles.marks}>
          {marks.map((m, i) => (
            <span
              key={`${m.kind}-${i}`}
              className={m.on ? styles.markOn : styles.markOff}
            >
              {MARK_GLYPH[m.kind]}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`${styles.scoreHero}${scorePop ? ` ${styles.scorePop}` : ''}`}
        aria-live="polite"
      >
        {score.toLocaleString()}
      </div>

      {judgeLabel ? (
        <div
          key={judgeKey}
          className={`${styles.judge} ${
            judge === 'perfect'
              ? styles.judgePerfect
              : judge === 'great'
                ? styles.judgeGreat
                : styles.judgeMiss
          }`}
        >
          {judgeLabel}
        </div>
      ) : (
        <div className={styles.judgeSpacer} aria-hidden="true" />
      )}

      <div className={styles.playArea}>
        <div
          ref={hostRef}
          className={styles.canvasHost}
          role="application"
          aria-label="Beatlane playfield"
        />
        {combo > 0 && !fail ? (
          <div
            key={combo}
            className={styles.comboBadge}
            aria-live="polite"
          >
            ×{combo}
          </div>
        ) : null}
      </div>

      {missFlash ? <div className={styles.missFlash} aria-hidden="true" /> : null}

      {fail ? (
        <div className={styles.failOverlay}>
          <p className={styles.failTitle}>
            {fail === 'miss' ? 'You missed' : 'Wrong tap'}
          </p>
          <p className={styles.failSub}>
            Combo died at {failCombo}. Score {score.toLocaleString()}.
          </p>
          <button type="button" className={styles.retry} onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}

      <p className={styles.hint}>
        Tap a lane · DFJK / 1–4 · PERFECT / GREAT / MISS
      </p>
    </div>
  )
}
