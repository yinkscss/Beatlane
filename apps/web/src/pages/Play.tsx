import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { audioRuntime } from '@/audio/runtime'
import { elapsedSongTimeSec } from '@/audio/songClock'
import { SAMPLE_CHARTS, sampleChartById } from '@/charts/catalog'
import { loadChart } from '@/charts/loadChart'
import type { Chart } from '@/charts/schema'
import {
  sanitizeBlitzChart,
} from '@/game/blitzWhitelist'
import {
  ClassicPlayfield,
  type FailReason,
  type HitGrade,
  type ModifierPhase,
  type ObstacleBannerKind,
  type ObstacleBannerPhase,
  type PlayMode,
  type SpeedUpPhase,
  type TapRecord,
} from '@/game/classicPlayfield'
import {
  railFillPct,
  railMarks,
  type JudgeGrade,
} from '@/game/judging'
import { resolveChartAssets } from '@/lib/catalog'
import { isTreasuryConfigured, transferCusdToTreasury } from '@/lib/celo'
import {
  fetchDailyChallenge,
  submitRun,
  type DailyChallenge,
} from '@/lib/daily'
import {
  trackMiss,
  trackPurchaseContinue,
  trackStartRun,
} from '@/lib/analytics'
import { recordPurchaseReceipt } from '@/lib/purchases'
import { assertSpendAllowed, recordSpend } from '@/lib/spendCaps'
import { captureException } from '@/lib/sentry'
import {
  BLITZ_DURATION_MS,
  DEFAULT_CUP_SLUG,
  fetchTournamentLobby,
  fetchTournamentRank,
  submitBlitzRun,
} from '@/lib/tournament'
import {
  SECOND_CHANCE_SHIELD_DEFAULT_ON,
  SECOND_CHANCE_SHIELD_MS,
  formatCusdPrice,
  secondChancePrice,
  secondChanceSku,
} from '@/lib/secondChance'
import { useAppStore } from '@/store/appStore'
import styles from '@/pages/Play.module.css'

const JUDGE_MS = 520

type SpeedUi =
  | { kind: 'banner' }
  | { kind: 'countdown'; n: number }
  | null

/** Pre-run gate: Play button → 3-2-1 → tiles drop. */
type RunPhase = 'loading' | 'ready' | 'countdown' | 'playing'

type ObstacleUi = {
  kind: ObstacleBannerKind
  durationSec: number
} | null

const OBSTACLE_LABEL: Record<ObstacleBannerKind, string> = {
  hold: 'HOLD',
  dont_tap: "DON'T TAP",
  double: 'DOUBLE',
  ice: 'ICE',
  gold: 'GOLD',
  fog: 'FOG',
  reverse: 'REVERSE',
  long_hold: 'HOLD LONG',
  bridge: 'BRIDGE',
  triple: 'TRIPLE',
  l_hook: 'L-HOOK',
  zig: 'ZIG',
  split: 'SPLIT',
  fake_gap: 'GAP',
  slide: 'SLIDE',
  cascade: 'CASCADE',
  trap_double: 'TRAP',
}

function bannerClass(kind: ObstacleBannerKind): string {
  switch (kind) {
    case 'hold':
    case 'long_hold':
    case 'split':
      return styles.bannerHold
    case 'dont_tap':
    case 'fake_gap':
    case 'trap_double':
    case 'reverse':
    case 'triple':
      return styles.bannerDontTap
    case 'ice':
      return styles.bannerIce
    case 'gold':
      return styles.bannerGold
    case 'fog':
    case 'double':
    case 'bridge':
    case 'zig':
    case 'cascade':
      return styles.bannerDouble
    default:
      return styles.bannerNeutral
  }
}

function parseMode(raw: string | null): PlayMode {
  if (raw === 'zen') return 'zen'
  if (raw === 'daily') return 'daily'
  if (raw === 'blitz') return 'blitz'
  return 'classic'
}

/** G5/G6 chart engine + G3 HUD + G4 Web Audio + G7 Classic/Zen modes. */
export default function PlayPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<ClassicPlayfield | null>(null)
  const judgeTimer = useRef<number | null>(null)
  const bedArmedRef = useRef(true)
  const maxComboRef = useRef(0)
  const musicUrlRef = useRef<string | null>(null)
  const tapsRef = useRef<TapRecord[]>([])
  const perfectsRef = useRef(0)
  const goodsRef = useRef(0)
  const runStartedAtRef = useRef(0)
  const dailyRef = useRef<DailyChallenge | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = parseMode(searchParams.get('mode'))
  const chartParam = searchParams.get('chart')
  const cupSlug = searchParams.get('cup')?.trim() || DEFAULT_CUP_SLUG
  const { status } = useAuth()

  const muted = useAppStore((s) => s.muted)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const setPlayMode = useAppStore((s) => s.setPlayMode)
  const setLastRun = useAppStore((s) => s.setLastRun)

  // auth_all (Q14): no guest play — gate before chart/Pixi boot
  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      const qs = new URLSearchParams({ mode })
      if (chartParam) qs.set('chart', chartParam)
      if (mode === 'blitz') qs.set('cup', cupSlug)
      navigate(`/wallet?next=${encodeURIComponent(`/play?${qs}`)}`, {
        replace: true,
      })
    }
  }, [status, mode, chartParam, cupSlug, navigate])

  const [dailyMeta, setDailyMeta] = useState<DailyChallenge | null>(null)
  const [chartId, setChartId] = useState(
    chartParam && sampleChartById(chartParam)
      ? chartParam
      : chartParam || SAMPLE_CHARTS[0].id,
  )
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
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
  /** Successful Second Chance purchases this run (0 → $0.49, 1 → $0.79, …). */
  const [reviveCount, setReviveCount] = useState(0)
  const [reviveBusy, setReviveBusy] = useState(false)
  const [reviveError, setReviveError] = useState<string | null>(null)
  const [reverseUi, setReverseUi] = useState(false)
  const [blitzMsLeft, setBlitzMsLeft] = useState(BLITZ_DURATION_MS)
  const [blitzTimedOut, setBlitzTimedOut] = useState(false)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [runPhase, setRunPhase] = useState<RunPhase>('loading')
  const [startCountdown, setStartCountdown] = useState<number | null>(null)
  const speedAtFailRef = useRef(1)
  const blitzTickRef = useRef<number | null>(null)
  const startCountdownTimerRef = useRef<number | null>(null)
  const startRunRef = useRef<() => Promise<void>>(async () => {})
  const startAudioGestureRef = useRef<() => void>(() => {})
  const blitzEndedRef = useRef(false)

  useEffect(() => {
    if (mode === 'daily') return
    if (chartParam) setChartId(chartParam)
  }, [chartParam, mode])

  useEffect(() => {
    setPlayMode(mode)
  }, [mode, setPlayMode])

  // Daily: resolve server seed → chart before playfield boot
  useEffect(() => {
    if (status !== 'authenticated' || mode !== 'daily') return
    let cancelled = false
    setChartError(null)
    void (async () => {
      try {
        const daily = await fetchDailyChallenge()
        if (cancelled) return
        dailyRef.current = daily
        setDailyMeta(daily)
        setChartId(daily.chartId)
      } catch (err) {
        console.error('Daily challenge failed', err)
        if (!cancelled) {
          setChartError(
            err instanceof Error ? err.message : 'Daily challenge failed',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, mode])

  // Blitz: require cup entry + fair chart from tournament lobby
  useEffect(() => {
    if (status !== 'authenticated' || mode !== 'blitz') return
    let cancelled = false
    setChartError(null)
    void (async () => {
      try {
        const lobby = await fetchTournamentLobby(cupSlug)
        if (cancelled) return
        if (!lobby.myEntry) {
          setTournamentId(null)
          setChartError('Enter the cup from Tournaments before playing Blitz.')
          return
        }
        setTournamentId(lobby.tournament.id)
        setChartId(lobby.tournament.chart_id || 'sample-normal')
      } catch (err) {
        console.error('Tournament lobby failed', err)
        if (!cancelled) {
          setChartError(
            err instanceof Error ? err.message : 'Tournament lobby failed',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, mode, cupSlug])

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
    if (status !== 'authenticated') return
    // Wait for daily seed → chartId
    if (mode === 'daily' && !dailyMeta) return
    // Wait for cup entry + tournament id before Blitz boot
    if (mode === 'blitz' && !tournamentId) return

    let cancelled = false
    bedArmedRef.current = true
    maxComboRef.current = 0
    tapsRef.current = []
    perfectsRef.current = 0
    goodsRef.current = 0
    runStartedAtRef.current = 0
    setRunPhase('loading')
    setStartCountdown(null)
    setFail(null)
    setCleared(false)
    setScore(0)
    setCombo(0)
    setSpeedUi(null)
    setObstacleUi(null)
    setSubmitBusy(false)
    setSubmitError(null)
    setReviveCount(0)
    setReviveBusy(false)
    setReviveError(null)
    setReverseUi(false)
    setBlitzMsLeft(BLITZ_DURATION_MS)
    setBlitzTimedOut(false)
    blitzEndedRef.current = false
    speedAtFailRef.current = 1
    if (blitzTickRef.current) {
      window.clearInterval(blitzTickRef.current)
      blitzTickRef.current = null
    }
    if (startCountdownTimerRef.current) {
      window.clearTimeout(startCountdownTimerRef.current)
      startCountdownTimerRef.current = null
    }

    const game = new ClassicPlayfield({
      onHit: (grade: HitGrade, nextScore, nextCombo) => {
        if (cancelled) return
        audioRuntime.playSfx(grade === 'perfect' ? 'perfect' : 'great')
        setScore(nextScore)
        setCombo(nextCombo)
        if (nextCombo > maxComboRef.current) maxComboRef.current = nextCombo
        if (grade === 'perfect') perfectsRef.current += 1
        else goodsRef.current += 1
        setScorePop(true)
        window.setTimeout(() => setScorePop(false), 160)
        showJudge(grade)
      },
      onTapRecord: (tap: TapRecord) => {
        if (cancelled) return
        tapsRef.current.push(tap)
      },
      onFail: (reason, nextScore, endedCombo) => {
        if (cancelled) return
        if (endedCombo > maxComboRef.current) maxComboRef.current = endedCombo
        audioRuntime.playSfx('miss')
        setScore(nextScore)
        setCombo(0)
        showJudge('miss')
        setMissFlash(true)
        window.setTimeout(() => setMissFlash(false), 450)
        trackMiss({ mode, reason, score: nextScore })

        if (mode === 'zen' || mode === 'blitz') {
          // Miss breaks combo only — run continues (Blitz is timed).
          return
        }

        bedArmedRef.current = false
        audioRuntime.stopBed()
        speedAtFailRef.current = gameRef.current?.getSpeedMult() ?? 1
        setFailCombo(endedCombo)
        setFail(reason)
        setSpeedUi(null)
        setObstacleUi(null)
        setReverseUi(false)
        setCleared(false)
        setReviveError(null)
      },
      onShieldAbsorb: (nextScore, endedCombo) => {
        if (cancelled) return
        if (endedCombo > maxComboRef.current) maxComboRef.current = endedCombo
        audioRuntime.playSfx('miss')
        setScore(nextScore)
        setCombo(0)
        showJudge('miss')
        setMissFlash(true)
        window.setTimeout(() => setMissFlash(false), 450)
        trackMiss({ mode, reason: 'miss', score: nextScore })
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
      onModifier: (ev: ModifierPhase) => {
        if (cancelled) return
        if (ev.phase === 'reverse') setReverseUi(ev.active)
      },
      onChartComplete: (nextScore, nextCombo) => {
        if (cancelled) return
        bedArmedRef.current = false
        audioRuntime.stopBed()
        setScore(nextScore)
        setCombo(nextCombo)
        if (nextCombo > maxComboRef.current) maxComboRef.current = nextCombo
        setCleared(true)
        setSpeedUi(null)
        setObstacleUi(null)
        setLastRun({
          mode,
          score: nextScore,
          combo: nextCombo,
          maxCombo: maxComboRef.current,
          outcome: 'clear',
          chartTitle: game.getChart()?.title ?? null,
          dailyDay: dailyRef.current?.day ?? null,
        })
      },
    })
    game.setMode(mode)
    gameRef.current = game

    const musicUrlBox = { current: null as string | null }

    const startMusic = async () => {
      if (cancelled || !bedArmedRef.current) return
      if (audioRuntime.getMusicStartTime() != null) {
        await audioRuntime.resumeContext()
        return
      }
      if (musicUrlBox.current) {
        await audioRuntime.startMusic(musicUrlBox.current)
      } else {
        await audioRuntime.startBed()
      }
    }

    const startBlitzClock = () => {
      if (mode !== 'blitz' || cancelled) return
      const started = performance.now()
      blitzTickRef.current = window.setInterval(() => {
        if (cancelled || blitzEndedRef.current) return
        const left = Math.max(0, BLITZ_DURATION_MS - (performance.now() - started))
        setBlitzMsLeft(left)
        if (left <= 0) {
          blitzEndedRef.current = true
          if (blitzTickRef.current) {
            window.clearInterval(blitzTickRef.current)
            blitzTickRef.current = null
          }
          bedArmedRef.current = false
          audioRuntime.stopBed()
          setBlitzTimedOut(true)
          setCleared(true)
          setSpeedUi(null)
          setObstacleUi(null)
          const g = gameRef.current
          setLastRun({
            mode: 'blitz',
            score: g?.getScore() ?? 0,
            combo: g?.getCombo() ?? 0,
            maxCombo: maxComboRef.current,
            outcome: 'clear',
            chartTitle: g?.getChart()?.title ?? null,
            tournamentSlug: cupSlug,
            tournamentId,
          })
        }
      }, 100)
    }

    /**
     * Begin tiles immediately — never await audio (mobile can hang after gesture expires).
     * Chart clock anchors at beginRun, not at the Play-tap music arm (3s countdown),
     * otherwise songTime is already ~3s and opening notes never appear.
     */
    startRunRef.current = async () => {
      if (cancelled) return
      bedArmedRef.current = true
      runStartedAtRef.current = performance.now()

      // Keep music that was armed on the Play gesture (Safari). Restarting here
      // (outside the gesture) often fails on iOS and leaves the run silent.
      if (audioRuntime.getMusicStartTime() == null) {
        void startMusic().catch((err) => {
          console.error('Music start failed', err)
        })
      } else {
        void audioRuntime.resumeContext().catch(() => {})
      }

      const perfAnchor = performance.now()
      const audioAnchor = audioRuntime.getContext()?.currentTime ?? null
      game.setSongClock(() =>
        elapsedSongTimeSec({
          perfNow: performance.now(),
          perfAnchor,
          audioNow: audioRuntime.getContext()?.currentTime ?? null,
          audioAnchor,
        }),
      )
      game.beginRun()
      trackStartRun({ mode, chartId })
      startBlitzClock()
      setRunPhase('playing')
    }

    /** User-gesture path: resume + start music while Safari still allows it. */
    const armAudioFromGesture = () => {
      bedArmedRef.current = true
      void audioRuntime.resumeContext().catch(() => {})
      void startMusic().catch((err) => {
        console.error('Music start failed', err)
      })
    }
    startAudioGestureRef.current = armAudioFromGesture

    void (async () => {
      try {
        // Daily always uses catalog Storage charts (never local samples)
        const sample =
          mode === 'daily' ? undefined : sampleChartById(chartId)
        let chart: Chart
        if (sample) {
          chart = await loadChart(sample.url)
          musicUrlBox.current = null
          musicUrlRef.current = null
        } else {
          const assets = await resolveChartAssets(chartId)
          chart = await loadChart(assets.chartUrl)
          musicUrlBox.current = assets.audioUrl
          musicUrlRef.current = assets.audioUrl
        }
        if (cancelled) return
        if (mode === 'blitz') {
          chart = sanitizeBlitzChart(chart)
        }
        game.setChart(chart)
        setChartMeta(chart)

        await game.mount(host)
        if (cancelled) return
        setRunPhase('ready')
      } catch (err) {
        console.error('Playfield / chart failed to start', err)
        captureException(err, { surface: 'play_mount', mode, chartId })
        if (!cancelled) {
          setChartError(err instanceof Error ? err.message : 'Chart load failed')
        }
      }
    })()

    return () => {
      cancelled = true
      bedArmedRef.current = false
      if (judgeTimer.current) window.clearTimeout(judgeTimer.current)
      if (blitzTickRef.current) {
        window.clearInterval(blitzTickRef.current)
        blitzTickRef.current = null
      }
      if (startCountdownTimerRef.current) {
        window.clearTimeout(startCountdownTimerRef.current)
        startCountdownTimerRef.current = null
      }
      audioRuntime.stopBed()
      game.destroy()
      gameRef.current = null
    }
  }, [chartId, mode, setLastRun, status, dailyMeta, cupSlug, tournamentId])

  if (status !== 'authenticated') {
    return (
      <div className={styles.page}>
        <p className={styles.failSub}>Sign in required…</p>
      </div>
    )
  }

  const goResults = async (outcome: 'fail' | 'clear' | 'quit') => {
    const maxCombo = maxComboRef.current
    const runCombo = outcome === 'fail' ? failCombo : combo
    const base = {
      mode,
      score,
      combo: runCombo,
      maxCombo,
      outcome,
      chartTitle: chartMeta?.title ?? dailyMeta?.chart?.title ?? null,
      dailyDay: dailyMeta?.day ?? null,
      tournamentSlug: mode === 'blitz' ? cupSlug : null,
      tournamentId: mode === 'blitz' ? tournamentId : null,
    }

    // Blitz cup: submit tiles → rank → results
    if (mode === 'blitz' && tournamentId) {
      setSubmitBusy(true)
      setSubmitError(null)
      try {
        await submitBlitzRun({
          tournamentId,
          tiles: score,
          score,
          comboMax: maxCombo,
          durationMs: Math.round(performance.now() - runStartedAtRef.current),
          chartId,
          taps: tapsRef.current.map(({ t, lane }) => ({ t, lane })),
        })
        const rank = await fetchTournamentRank(cupSlug)
        setLastRun({
          ...base,
          submitted: true,
          placement: rank.you?.rank ?? null,
          payoutStubCusd: rank.you?.payoutStubCusd ?? null,
        })
        navigate('/tournament?slug=' + encodeURIComponent(cupSlug) + '&view=results')
        return
      } catch (err) {
        console.error('blitz submit failed', err)
        setSubmitError(err instanceof Error ? err.message : 'Submit failed')
        setLastRun({ ...base, submitted: false })
        navigate('/results')
        return
      } finally {
        setSubmitBusy(false)
      }
    }

    // Daily (and optional Classic with taps): server validate + board
    if (mode === 'daily' || (mode === 'classic' && tapsRef.current.length > 0)) {
      setSubmitBusy(true)
      setSubmitError(null)
      try {
        const result = await submitRun({
          mode,
          chartId,
          score,
          comboMax: maxCombo,
          perfects: perfectsRef.current,
          goods: goodsRef.current,
          taps: tapsRef.current.map(({ t, lane }) => ({ t, lane })),
          durationMs: Math.round(performance.now() - runStartedAtRef.current),
          dailyDay: dailyMeta?.day,
          seed: dailyMeta?.seed,
          outcome,
        })
        if (!result.ok) {
          throw new Error(result.error ?? result.reason ?? 'Submit failed')
        }
        setLastRun({
          ...base,
          score: result.run?.score ?? score,
          submitted: true,
          validated: result.validated === true,
          runId: result.run?.id ?? null,
          serverScore: result.run?.score ?? null,
        })
        navigate(mode === 'daily' ? '/leaderboard?board=daily' : '/results')
        return
      } catch (err) {
        console.error('submit-run failed', err)
        setSubmitError(err instanceof Error ? err.message : 'Submit failed')
        setLastRun({ ...base, submitted: false, validated: false })
        // Still allow viewing results / board
        navigate(mode === 'daily' ? '/leaderboard?board=daily' : '/results')
        return
      } finally {
        setSubmitBusy(false)
      }
    }

    setLastRun(base)
    navigate('/results')
  }

  const endRun = () => {
    void goResults(fail ? 'fail' : cleared ? 'clear' : 'quit')
  }

  const onRevive = async () => {
    if (reviveBusy || !fail) return
    const game = gameRef.current
    if (!game) return

    if (!isTreasuryConfigured()) {
      setReviveError(
        'Set VITE_TREASURY_ADDRESS in apps/web/.env (Celo Mainnet receiver).',
      )
      return
    }

    const price = secondChancePrice(reviveCount)
    const sku = secondChanceSku(reviveCount)
    const spendGate = assertSpendAllowed('continue', price)
    if (!spendGate.ok) {
      setReviveError(spendGate.reason)
      return
    }
    const scoreBefore = score
    const speedBefore = speedAtFailRef.current

    setReviveBusy(true)
    setReviveError(null)
    try {
      const { txHash } = await transferCusdToTreasury(price)
      await recordPurchaseReceipt({
        sku,
        amountCusd: price,
        txHash,
        metadata: {
          product: 'second_chance',
          reviveIndex: reviveCount,
          scoreAtFail: scoreBefore,
          speedMultAtFail: speedBefore,
          chartId,
        },
      })
      recordSpend('continue', price)
      trackPurchaseContinue({
        sku,
        amountCusd: price,
        reviveIndex: reviveCount,
      })

      const shieldMs = SECOND_CHANCE_SHIELD_DEFAULT_ON
        ? SECOND_CHANCE_SHIELD_MS
        : 0
      game.revive({ shieldMs })
      const speedAfter = game.getSpeedMult()
      if (speedAfter !== speedBefore) {
        console.error('Second Chance speed mismatch', {
          speedBefore,
          speedAfter,
        })
      }

      setReviveCount((n) => n + 1)
      setFail(null)
      setCombo(0)
      setFailCombo(0)
      setJudge(null)
      setSpeedUi(null)
      setObstacleUi(null)

      bedArmedRef.current = true
      // Ambience only — chart clock stays local from fail time (same speed).
      const restartMusic = musicUrlRef.current
        ? audioRuntime.startMusic(musicUrlRef.current, { restart: true })
        : audioRuntime.startBed({ restart: true })
      void restartMusic.catch((err) => {
        console.error('Music restart failed', err)
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Second Chance payment failed'
      captureException(err, { surface: 'purchase_continue', sku })
      setReviveError(msg)
    } finally {
      setReviveBusy(false)
    }
  }

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
    setReviveCount(0)
    setReviveBusy(false)
    setReviveError(null)
    setStartCountdown(null)
    maxComboRef.current = 0
    bedArmedRef.current = true
    blitzEndedRef.current = false
    setBlitzMsLeft(BLITZ_DURATION_MS)
    setBlitzTimedOut(false)
    if (blitzTickRef.current) {
      window.clearInterval(blitzTickRef.current)
      blitzTickRef.current = null
    }
    if (startCountdownTimerRef.current) {
      window.clearTimeout(startCountdownTimerRef.current)
      startCountdownTimerRef.current = null
    }
    audioRuntime.stopBed()
    gameRef.current?.setMode(mode)
    gameRef.current?.prepareIdle()
    setRunPhase('ready')
  }

  const onPlayClick = () => {
    if (runPhase !== 'ready' || fail || cleared || chartError) return
    // Arm audio inside the click gesture — waiting until after countdown breaks Safari.
    startAudioGestureRef.current()
    setRunPhase('countdown')
    setStartCountdown(3)
    if (startCountdownTimerRef.current) {
      window.clearTimeout(startCountdownTimerRef.current)
    }
    let n = 3
    const step = () => {
      n -= 1
      if (n > 0) {
        setStartCountdown(n)
        startCountdownTimerRef.current = window.setTimeout(step, 1000)
        return
      }
      setStartCountdown(null)
      startCountdownTimerRef.current = null
      void startRunRef.current()
    }
    startCountdownTimerRef.current = window.setTimeout(step, 1000)
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

  const modeLabel =
    mode === 'zen'
      ? 'ZEN'
      : mode === 'daily'
        ? 'DAILY'
        : mode === 'blitz'
          ? 'BLITZ'
          : 'CLASSIC'
  const nextPrice = secondChancePrice(reviveCount)
  const prevPrice =
    reviveCount > 0 ? secondChancePrice(reviveCount - 1) : null
  const escalate = reviveCount > 0

  const sampleDifficultySelectable =
    mode !== 'daily' &&
    mode !== 'blitz' &&
    (!chartParam || Boolean(sampleChartById(chartParam)))

  return (
    <div className={styles.page}>
      <div
        className={styles.progress}
        aria-hidden="true"
        data-mode={mode === 'blitz' ? 'blitz' : 'combo'}
      >
        <div className={styles.railTrack}>
          <div
            className={styles.railFill}
            style={{
              width:
                mode === 'blitz'
                  ? `${(blitzMsLeft / BLITZ_DURATION_MS) * 100}%`
                  : `${fill}%`,
            }}
          />
        </div>
        {mode === 'blitz' ? (
          <div className={styles.marks}>
            <span
              className={`${styles.mark} ${styles.markBlitz} ${styles.markOn}`}
            />
          </div>
        ) : (
          <div className={styles.marks}>
            {marks.map((m, i) => (
              <span
                key={`${m.kind}-${i}`}
                className={`${styles.mark} ${
                  m.kind === 'star'
                    ? styles.markStar
                    : m.kind === 'flag'
                      ? styles.markFlag
                      : styles.markCrown
                } ${m.on ? styles.markOn : styles.markOff}`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={`${styles.scoreHero}${scorePop ? ` ${styles.scorePop}` : ''}`}
        aria-live="polite"
      >
        {score.toLocaleString()}
      </div>
      {mode === 'blitz' ? (
        <p className={styles.failSub} style={{ marginTop: -8 }}>
          TILES
        </p>
      ) : null}

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
        {runPhase === 'ready' && !fail && !cleared && !chartError ? (
          <div className={styles.startOverlay}>
            <div className={styles.readyPanel}>
              <div className={styles.readyMeta} role="group" aria-label="Chart">
                <span className={styles.modePill}>{modeLabel}</span>
                {mode === 'daily' ? (
                  <span className={styles.readyChartInfo}>
                    {dailyMeta?.day ?? '…'} ·{' '}
                    {chartMeta?.title ??
                      dailyMeta?.chart?.title ??
                      'Loading…'}
                  </span>
                ) : mode === 'blitz' ? (
                  <span className={styles.readyChartInfo}>
                    {chartMeta?.title ?? 'Cup chart'}
                  </span>
                ) : sampleDifficultySelectable ? (
                  <>
                    <div
                      className={styles.readyDiffs}
                      role="group"
                      aria-label="Difficulty"
                    >
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
                          {c.difficulty === 'easy'
                            ? 'Easy'
                            : c.difficulty === 'normal'
                              ? 'Normal'
                              : 'Hard'}
                        </button>
                      ))}
                    </div>
                    {chartMeta ? (
                      <span className={styles.readyChartInfo}>
                        {chartMeta.title}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className={styles.readyChartInfo}>
                    {chartMeta?.difficulty?.toUpperCase() ?? '…'}
                    {chartMeta?.title ? ` · ${chartMeta.title}` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                className={styles.readyMute}
                onClick={onMuteClick}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                className={styles.playBtn}
                onClick={onPlayClick}
              >
                Play
              </button>
            </div>
          </div>
        ) : null}
        {runPhase === 'countdown' && startCountdown != null ? (
          <div
            className={styles.speedCountdown}
            role="status"
            aria-live="assertive"
          >
            <div className={styles.speedRing}>
              <span key={startCountdown}>{startCountdown}</span>
            </div>
          </div>
        ) : null}
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
            className={`${styles.obstacleBanner} ${bannerClass(obstacleUi.kind)}`}
            role="status"
            aria-live="polite"
            data-duration={obstacleUi.durationSec}
          >
            {OBSTACLE_LABEL[obstacleUi.kind]}
          </div>
        ) : null}

        {reverseUi ? (
          <div className={styles.reverseHint} aria-hidden="true">
            ← lanes flipped →
          </div>
        ) : null}
      </div>

      {missFlash ? <div className={styles.missFlash} aria-hidden="true" /> : null}

      {chartError ? (
        <div className={styles.failOverlay}>
          <p className={styles.failTitle}>
            {mode === 'blitz' ? 'Blitz cup' : 'Chart error'}
          </p>
          <p className={styles.failSub}>{chartError}</p>
          {mode === 'blitz' ? (
            <button
              type="button"
              className={styles.sheetPrimary}
              style={{ marginTop: 16 }}
              onClick={() =>
                navigate(
                  `/tournament?slug=${encodeURIComponent(cupSlug)}`,
                )
              }
            >
              Open tournament lobby
            </button>
          ) : null}
        </div>
      ) : null}

      {fail && (mode === 'classic' || mode === 'daily') ? (
        <div className={styles.failOverlay}>
          <div className={styles.failSheet} role="dialog" aria-labelledby="fail-title">
            {escalate ? (
              <div className={styles.sheetEscalate}>Revive #{reviveCount + 1}</div>
            ) : null}
            <h2 id="fail-title" className={styles.sheetTitle}>
              {escalate
                ? 'Still in it?'
                : fail === 'miss'
                  ? 'You missed'
                  : 'Wrong tap'}
            </h2>
            <p className={styles.sheetBody}>
              {escalate
                ? 'First continue was cheap. This one steps up.'
                : mode === 'daily'
                  ? `Combo died at ${failCombo}. Submit score or revive?`
                  : `Combo died at ${failCombo}. Keep this run alive?`}
            </p>
            {escalate && prevPrice != null ? (
              <div className={styles.sheetEscalateBox}>
                <span>Was {formatCusdPrice(prevPrice)}</span>
                <span className={styles.sheetPrice}>
                  Now {formatCusdPrice(nextPrice)}
                </span>
              </div>
            ) : (
              <div className={styles.sheetRow}>
                <span className={styles.sheetLabel}>Second Chance</span>
                <span className={styles.sheetPrice}>
                  {formatCusdPrice(nextPrice)}
                </span>
              </div>
            )}
            <p className={styles.sheetPromise}>
              Keep your score · revive this run · same speed
            </p>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.sheetPrimary}
                onClick={() => void onRevive()}
                disabled={reviveBusy || submitBusy}
              >
                {reviveBusy
                  ? 'Confirming cUSD…'
                  : escalate
                    ? `Revive · ${formatCusdPrice(nextPrice)}`
                    : 'Revive run'}
              </button>
              <button
                type="button"
                className={styles.sheetSecondary}
                onClick={endRun}
                disabled={reviveBusy || submitBusy}
              >
                {submitBusy
                  ? 'Submitting…'
                  : mode === 'daily'
                    ? 'Submit to board'
                    : 'End run'}
              </button>
            </div>
            {reviveError || submitError ? (
              <p className={styles.sheetError} role="alert">
                {reviveError ?? submitError}
              </p>
            ) : (
              <p className={styles.sheetHint}>
                Celo Mainnet · fund Magic wallet with cUSD + a little CELO for
                gas
              </p>
            )}
          </div>
        </div>
      ) : null}

      {cleared && !fail ? (
        <div className={styles.failOverlay}>
          <div className={styles.failSheet} role="dialog" aria-labelledby="clear-title">
            <h2 id="clear-title" className={styles.sheetTitleClear}>
              {mode === 'blitz' || blitzTimedOut ? 'Time!' : 'Cleared'}
            </h2>
            <p className={styles.sheetBody}>
              {chartMeta?.title ?? dailyMeta?.chart?.title ?? 'Chart'} ·{' '}
              {score.toLocaleString()}
              {mode === 'blitz' ? ' tiles' : ' pts'} · ×{combo}
              {mode === 'daily' ? ' · Daily' : ''}
            </p>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.sheetPrimary}
                onClick={() => void goResults('clear')}
                disabled={submitBusy}
              >
                {submitBusy
                  ? 'Submitting…'
                  : mode === 'daily'
                    ? 'Submit to board'
                    : mode === 'blitz'
                      ? 'Submit cup score'
                      : 'See results'}
              </button>
              <button
                type="button"
                className={styles.sheetSecondary}
                onClick={
                  mode === 'blitz'
                    ? () =>
                        navigate(
                          `/tournament?slug=${encodeURIComponent(cupSlug)}`,
                        )
                    : retry
                }
                disabled={submitBusy}
              >
                {mode === 'blitz' ? 'Cup lobby' : 'Play again'}
              </button>
            </div>
            {submitError ? (
              <p className={styles.sheetError} role="alert">
                {submitError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className={styles.hint}>
        {mode === 'zen'
          ? 'Zen · miss breaks combo only · DFJK / 1–4'
          : mode === 'daily'
            ? 'Daily · taps validated on submit'
            : mode === 'blitz'
              ? 'Blitz · 60s · most tiles · no Reverse/Fog/Fake Gap'
              : 'Classic · DFJK / 1–4'}
      </p>
    </div>
  )
}
