import type { KPuzzle } from 'cubing/kpuzzle'
import { TwistyPlayer } from 'cubing/twisty'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Solve } from '../api'
import { convertMove, holdRotation } from '../cube/orientation'
import { useHoldFrame, useSettings } from '../settings/hooks'
import { STAGE_LABELS, type Split } from '../solve/cfop'
import { formatTime } from '../solve/stats'
import { solveStartPattern } from './start'
import { positionAt, timeAfter, totalDuration } from './timeline'

const SPEEDS = [0.5, 1, 2, 4]

type Indexer = {
  indexToMoveStartTimestamp(i: number): number
  moveDuration(i: number): number
  algDuration(): number
}

/**
 * ソルブの再生。実際の回転タイミングどおりに3Dキューブを動かす。
 * 3D表示と手の記号は、設定の持ち方（下の色・前の色）に合わせる。
 */
export function ReplayPlayer({ solve, kpuzzle }: { solve: Solve; kpuzzle: KPuzzle }) {
  const { settings } = useSettings()
  const frame = useHoldFrame()
  const rawMoves = useMemo(() => solve.moves ?? [], [solve.moves])
  const moves = useMemo(() => rawMoves.map((m) => ({ ...m, move: convertMove(frame, m.move) })), [rawMoves, frame])
  const rotation = useMemo(
    () => holdRotation(kpuzzle.defaultPattern(), settings.hold_bottom, settings.hold_front),
    [kpuzzle, settings.hold_bottom, settings.hold_front],
  )
  const times = useMemo(() => moves.map((m) => m.t), [moves])
  const total = totalDuration(times)
  const splits = solve.splits ?? []

  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<TwistyPlayer | null>(null)
  const [indexer, setIndexer] = useState<Indexer | null>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  // プレイヤーの生成（ソルブごと）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const player = new TwistyPlayer({
      puzzle: '3x3x3',
      alg: moves.map((m) => m.move).join(' '),
      background: 'none',
      controlPanel: 'none',
      hintFacelets: 'none',
    })
    // 手ごとの開始時刻・長さを素直に取れる単純なインデクサを使う
    player.indexer = 'simple'
    player.style.width = '100%'
    player.style.height = '100%'
    // 開始状態を持ち方の向きに持ち替えてから、持ち方の記号で回す
    const start = solveStartPattern(kpuzzle, solve)
    player.experimentalModel.setupTransformation.set(
      (rotation ? start.applyAlg(rotation) : start).experimentalToTransformation(),
    )
    container.appendChild(player)
    playerRef.current = player
    let cancelled = false
    player.experimentalModel.indexer.get().then((ix) => {
      if (!cancelled) setIndexer(ix as unknown as Indexer)
    })
    return () => {
      cancelled = true
      player.remove()
      playerRef.current = null
      setIndexer(null)
    }
  }, [kpuzzle, solve, moves, rotation])

  // 実時間 → TwistyPlayer のタイムライン位置
  useEffect(() => {
    const player = playerRef.current
    if (!player || !indexer) return
    const pos = positionAt(times, t)
    const ts =
      pos.done >= moves.length
        ? indexer.algDuration()
        : indexer.indexToMoveStartTimestamp(pos.done) + pos.fraction * indexer.moveDuration(pos.done)
    ;(player as unknown as { timestamp: number }).timestamp = ts
  }, [t, indexer, times, moves.length])

  // 再生ループ
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) * speed
      last = now
      let ended = false
      setT((prev) => {
        const next = prev + dt
        if (next >= total) {
          ended = true
          return total
        }
        return next
      })
      if (ended) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, total])

  const pos = positionAt(times, t)
  const stepTo = (n: number) => {
    setPlaying(false)
    setT(timeAfter(times, Math.max(0, Math.min(moves.length, n))))
  }
  const togglePlay = () => {
    if (!playing && t >= total) setT(0)
    setPlaying(!playing)
  }

  // キーボード：Space 再生/停止、←/→ コマ送り
  const keyRef = useRef({ togglePlay, stepTo, done: pos.done })
  useEffect(() => {
    keyRef.current = { togglePlay, stepTo, done: pos.done }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
      const k = keyRef.current
      if (e.key === ' ') {
        e.preventDefault()
        k.togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        k.stepTo(k.done + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        k.stepTo(k.done - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const currentStage = currentSplit(splits, pos.done)

  if (moves.length === 0) return <p className="muted">回転ログがないため再生できません</p>

  return (
    <div className="replay">
      <div className="replay-cube" ref={containerRef} />
      <div className="replay-status">
        <strong>{formatTime(Math.min(t, solve.total_ms), 3)}</strong>
        <span className="muted">
          {pos.done} / {moves.length}手{currentStage && ` ・ ${STAGE_LABELS[currentStage.stage]}`}
        </span>
        <span className="replay-next alg">
          {moves.slice(pos.done, pos.done + 8).map((m, i) => (
            <span key={pos.done + i} className={i === 0 ? 'current' : ''}>
              {m.move}{' '}
            </span>
          ))}
        </span>
      </div>

      {splits.length > 0 && (
        <div className="replay-stages" aria-label="段階">
          {splits.map((s) => {
            const width = total > 0 ? ((s.end_ms - s.start_ms) / total) * 100 : 0
            return (
              <button
                key={s.stage}
                className={`replay-stage ${currentStage?.stage === s.stage ? 'active' : ''}`}
                style={{ flexGrow: width, flexBasis: 0 }}
                onClick={() => stepTo(s.start_index)}
                title={`${STAGE_LABELS[s.stage]}（${formatTime(s.end_ms - s.start_ms, 3)}）へジャンプ`}
              >
                {width > 6 ? STAGE_LABELS[s.stage] : ''}
              </button>
            )
          })}
        </div>
      )}
      <input
        className="replay-seek"
        type="range"
        min={0}
        max={total}
        step={1}
        value={t}
        onChange={(e) => {
          setPlaying(false)
          setT(Number(e.target.value))
        }}
        aria-label="シーク"
      />

      <div className="row replay-controls">
        <button onClick={() => stepTo(0)} title="先頭">⏮</button>
        <button onClick={() => stepTo(pos.done - 1)} title="1手戻る（←）">◀</button>
        <button className="primary" onClick={togglePlay} title="再生 / 一時停止（Space）">
          {playing ? '一時停止' : '再生'}
        </button>
        <button onClick={() => stepTo(pos.done + 1)} title="1手進む（→）">▶</button>
        <button onClick={() => stepTo(moves.length)} title="末尾">⏭</button>
        <span className="spacer" />
        {SPEEDS.map((s) => (
          <button key={s} className={speed === s ? 'on-accent' : ''} onClick={() => setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

/** done 手目の時点で取り組んでいる段階。 */
function currentSplit(splits: Split[], done: number): Split | undefined {
  return splits.find((s) => s.move_count > 0 && done >= s.start_index && done < s.end_index) ??
    (done >= (splits[splits.length - 1]?.end_index ?? Infinity) ? splits[splits.length - 1] : undefined)
}
