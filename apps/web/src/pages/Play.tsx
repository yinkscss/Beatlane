import { useEffect, useRef, useState } from 'react'
import { audioRuntime } from '@/audio/runtime'
import { SAMPLE_CHARTS } from '@/charts/catalog'
import { loadChart } from '@/charts/loadChart'
import type { Chart } from '@/charts/schema'
import {
  ClassicPlayfield,
  type FailReason,
  type HitGrade,
  type ObstacleBannerKind,
  type ObstacleBannerPhase,
  type SpeedUpPhase,
} from '@/game/classicPlayfield'
import {
  railFillPct,
  railMarks,
  type JudgeGrade,
} from '@/game/judging'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Play.module.css'

const JUDGE_MS = 520

const MARK_GLYPH: Record<'star' | 'flag' | 'crown', string> = {
  star: '⭐',
  flag: '⚑',
  crown: '👑',
}

type SpeedUi =
  | { kind: 'banner' }
  | { kind: 'countdown'; n: number }
  | null

type ObstacleUi = {
  kind: ObstacleBannerKind
  durationSec: number
} | null

const OBSTACLE_LABEL: Record<ObstacleBannerKind, string> = {
  hold: 'HOLD',
  dont_tap: "DON'T TAP",
  double: 'DOUBLE',
}

/** G5/G6 chart engine + G3 HUD + G4 Web Audio over Classic playfield. */
export default function PlayPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ClassicPlayfield | null>(null)
  const judgeTimer = useRef<number | null>(null)
  const bedArmedRef = useRef(true)

  const muted = useAppStore((s) => s.muted)
  const toggleMute = useAppStore((s) => s.toggleMute)

  const [chartId, setChartId] = useState(SAMPLE_CHARTS[0].id)
  const [chartMeta, setChartMeta] = useState<Chart | null>(null)
  const [chartError, setChartError] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [judge, setJudge] = useState<JudgeGrade | null>(null)
  const [judgeKey, setJudgeKey] = useState(0)
  const [scorePop, setScorePop] = useState(false)
  const [missFlash, setMissFlash] = useState(false)
  const [fail, setFail] = useState<FailReason | null>(null)
  const [failCombo, setFailCombo] = useState(0)
  const [cleared, setCleared] = useState(false)
  const [speedUi, setSpeedUi] = useState<SpeedUi>(null)
  const [obstacleUi, setObstacleUi] = useState<ObstacleUi>(null)

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
    bedArmedRef.current = true
    setFail(null)
    setCleared(false)
    setScore(0)
    setCombo(0)
    setSpeedUi(null)
    setObstacleUi(null)
    setChartError(null)

    const songClock = () => {
      const ctx = audioRuntime.getContext()
      const start = audioRuntime.getMusicStartTime()
      if (!ctx || start == null) return null
      return ctx.currentTime - start
    }

    const game = new ClassicPlayfield({
      onHit: (grade: HitGrade, nextScore, nextCombo) => {
        if (cancelled) return
        audioRuntime.playSfx(grade === 'perfect' ? 'perfect' : 'great')
        setScore(nextScore)
        setCombo(nextCombo)
        setScorePop(true)
        window.setTimeout(() => setScorePop(false), 160)
        showJudge(grade)
      },
      onFail: (reason, nextScore, endedCombo) => {
        if (cancelled) return
        bedArmedRef.current = false
        audioRuntime.playSfx('miss')
        audioRuntime.stopBed()
        setScore(nextScore)
        setCombo(0)
        setFailCombo(endedCombo)
        setFail(reason)
        setSpeedUi(null)
        setObstacleUi(null)
        setCleared(false)
        showJudge('miss')
        setMissFlash(true)
        window.setTimeout(() => setMissFlash(false), 450)
      },
      onSpeedUp: (ev: SpeedUpPhase) => {
        if (cancelled) return
        if (ev.phase === 'banner') setSpeedUi({ kind: 'banner' })
        else if (ev.phase === 'countdown')
          setSpeedUi({ kind: 'countdown', n: ev.n })
        else setSpeedUi(null)
      },
      onObstacleBanner: (ev: ObstacleBannerPhase) => {
        if (cancelled) return
        if (ev.phase === 'show') {
          setObstacleUi({ kind: ev.kind, durationSec: ev.durationSec })
        } else {
          setObstacleUi(null)
        }
      },
      onChartComplete: (nextScore, nextCombo) => {
        if (cancelled) return
        bedArmedRef.current = false
        audioRuntime.stopBed()
        setScore(nextScore)
        setCombo(nextCombo)
        setCleared(true)
        setSpeedUi(null)
        setObstacleUi(null)
      },
    })
    gameRef.current = game
    game.setSongClock(songClock)

    const kickBed = () => {
      if (cancelled || !bedArmedRef.current) return
      void audioRuntime.startBed().catch((err) => {
        console.error('Bed start failed', err)
      })
    }

    const onGesture = () => {
      kickBed()
    }
    host.addEventListener('pointerdown', onGesture, { capture: true })
    window.addEventListener('keydown', onGesture, { capture: true })

    void (async () => {
      try {
        const meta = SAMPLE_CHARTS.find((c) => c.id === chartId)
        if (!meta) throw new Error(`Unknown chart: ${chartId}`)
        const chart = await loadChart(meta.url)
        if (cancelled) return
        game.setChart(chart)
        setChartMeta(chart)

        await game.mount(host)
        if (cancelled) return
        kickBed()
      } catch (err) {
        console.error('Playfield / chart failed to start', err)
        if (!cancelled) {
          setChartError(err instanceof Error ? err.message : 'Chart load failed')
        }
      }
    })()

    return () => {
      cancelled = true
      bedArmedRef.current = false
      host.removeEventListener('pointerdown', onGesture, { capture: true })
      window.removeEventListener('keydown', onGesture, { capture: true })
      if (judgeTimer.current) window.clearTimeout(judgeTimer.current)
      audioRuntime.stopBed()
      game.destroy()
      gameRef.current = null
    }
  }, [chartId])

  const retry = () => {
    setFail(null)
    setCleared(false)
    setScore(0)
    setCombo(0)
    setFailCombo(0)
    setJudge(null)
    setMissFlash(false)
    setSpeedUi(null)
    setObstacleUi(null)
    bedArmedRef.current = true
    gameRef.current?.restart()
    void audioRuntime.startBed({ restart: true }).catch((err) => {
      console.error('Bed restart failed', err)
    })
  }

  const onMuteClick = () => {
    toggleMute()
    void audioRuntime.unlock()
  }

  const fill = railFillPct(combo)
  const marks = railMarks(combo)
  const judgeLabel =
    judge === 'perfect'
      ? 'PERFECT'
      : judge === 'great'
        ? 'GREAT'
        : judge === 'miss'
          ? 'MISS'
          : null

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.mute}
        onClick={onMuteClick}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>

      <div className={styles.chartBar} role="group" aria-label="Chart">
        {SAMPLE_CHARTS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={
              chartId === c.id
                ? `${styles.chartBtn} ${styles.chartBtnOn}`
                : styles.chartBtn
            }
            onClick={() => setChartId(c.id)}
            aria-pressed={chartId === c.id}
          >
            {c.difficulty === 'easy' ? 'Easy' : 'Normal'}
          </button>
        ))}
        {chartMeta ? (
          <span className={styles.chartTitle}>{chartMeta.title}</span>
        ) : null}
      </div>

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
        {combo > 0 && !fail && !cleared ? (
          <div key={combo} className={styles.comboBadge} aria-live="polite">
            ×{combo}
          </div>
        ) : null}

        {speedUi?.kind === 'banner' ? (
          <div className={styles.speedBanner} role="status">
            SPEED UP
          </div>
        ) : null}
        {speedUi?.kind === 'countdown' ? (
          <div
            className={styles.speedCountdown}
            role="status"
            aria-live="assertive"
          >
            <div className={styles.speedRing}>
              <span>{speedUi.n}</span>
            </div>
          </div>
        ) : null}

        {obstacleUi ? (
          <div
            className={`${styles.obstacleBanner} ${
              obstacleUi.kind === 'hold'
                ? styles.bannerHold
                : obstacleUi.kind === 'dont_tap'
                  ? styles.bannerDontTap
                  : styles.bannerDouble
            }`}
            role="status"
            aria-live="polite"
            data-duration={obstacleUi.durationSec}
          >
            {OBSTACLE_LABEL[obstacleUi.kind]}
          </div>
        ) : null}
      </div>

      {missFlash ? <div className={styles.missFlash} aria-hidden="true" /> : null}

      {chartError ? (
        <div className={styles.failOverlay}>
          <p className={styles.failTitle}>Chart error</p>
          <p className={styles.failSub}>{chartError}</p>
        </div>
      ) : null}

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

      {cleared && !fail ? (
        <div className={styles.failOverlay}>
          <p className={styles.clearTitle}>Cleared</p>
          <p className={styles.failSub}>
            {chartMeta?.title ?? 'Chart'} · {score.toLocaleString()} pts
          </p>
          <button type="button" className={styles.retry} onClick={retry}>
            Play again
          </button>
        </div>
      ) : null}

      <p className={styles.hint}>
        Chart clock · DFJK / 1–4 · hold · Easy / Normal samples
      </p>
    </div>
  )
}
