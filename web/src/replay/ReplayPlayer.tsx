import type { KPuzzle } from 'cubing/kpuzzle'
import { TwistyPlayer } from 'cubing/twisty'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Solve, SolveMove } from '../api'
import { holdRotation, type Frame } from '../cube/orientation'
import { useHoldFrame, useSettings } from '../settings/hooks'
import { STAGE_LABELS, type Split } from '../solve/cfop'
import { notationTokens, type Holds } from '../solve/holds'
import { formatTime } from '../solve/stats'
import { solveStartPattern } from './start'
import { positionAt, timeAfter, totalDuration } from './timeline'

const SPEEDS = [0.5, 1, 2, 4]

type Indexer = {
  indexToMoveStartTimestamp(i: number): number
  moveDuration(i: number): number
  algDuration(): number
}

/** 再生の1コマ：手か持ち替え。move は回転ログでの位置（持ち替えなら null）。 */
/** 再生の1コマ。moves はこのコマに当たる回転ログの手の数（持ち替えは 0、スライスは L・R の組の数）。 */
type Step = { text: string; t: number; moves: number }

/**
 * ソルブの再生。実際の回転タイミングどおりに3Dキューブを動かす。
 * 3D表示と手の記号は、持ち方（下の色・前の色）に合わせる。持ち替えの記録があれば、その時点の持ち方で書き、
 * 持ち替えもキューブごと回して見せる。
 */
export function ReplayPlayer({ solve, kpuzzle }: { solve: Solve; kpuzzle: KPuzzle }) {
  const { settings } = useSettings()
  const frame = useHoldFrame()
  const rawMoves = useMemo(() => solve.moves ?? [], [solve.moves])
  const steps = useMemo(() => replaySteps(rawMoves, solve.holds, frame), [rawMoves, solve.holds, frame])
  const startHold = solve.holds?.start ?? { bottom: settings.hold_bottom, front: settings.hold_front }
  const rotation = useMemo(
    () => holdRotation(kpuzzle.defaultPattern(), startHold.bottom, startHold.front),
    [kpuzzle, startHold.bottom, startHold.front],
  )
  const times = useMemo(() => steps.map((m) => m.t), [steps])
  const total = totalDuration(times)
  const splits = solve.splits ?? []
  // movesBefore[i]：先頭から i コマまでにある手の数
  const movesBefore = useMemo(() => {
    const out = [0]
    for (const st of steps) out.push(out[out.length - 1] + st.moves)
    return out
  }, [steps])
  /** 回転ログの n 手目（0 始まり）の直前のコマ。その前にある持ち替えも含める。 */
  const stepOfMove = (n: number) => {
    const i = movesBefore.findIndex((c) => c >= n)
    let j = i < 0 ? steps.length : i
    while (j > 0 && steps[j - 1].moves === 0) j--
    return j
  }

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
      alg: steps.map((m) => m.text).join(' '),
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
  }, [kpuzzle, solve, steps, rotation])

  // 実時間 → TwistyPlayer のタイムライン位置
  useEffect(() => {
    const player = playerRef.current
    if (!player || !indexer) return
    const pos = positionAt(times, t)
    const ts =
      pos.done >= steps.length
        ? indexer.algDuration()
        : indexer.indexToMoveStartTimestamp(pos.done) + pos.fraction * indexer.moveDuration(pos.done)
    ;(player as unknown as { timestamp: number }).timestamp = ts
  }, [t, indexer, times, steps.length])

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
    setT(timeAfter(times, Math.max(0, Math.min(steps.length, n))))
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

  const movesDone = movesBefore[pos.done]
  const currentStage = currentSplit(splits, movesDone)

  if (rawMoves.length === 0) return <p className="muted">回転ログがないため再生できません</p>

  return (
    <div className="replay">
      <div className="replay-cube" ref={containerRef} />
      <div className="replay-status">
        <strong>{formatTime(Math.min(t, solve.total_ms), 3)}</strong>
        <span className="muted">
          {movesDone} / {rawMoves.length}手{currentStage && ` ・ ${STAGE_LABELS[currentStage.stage]}`}
        </span>
        <span className="replay-next alg">
          {steps.slice(pos.done, pos.done + 8).map((m, i) => (
            <span key={pos.done + i} className={[i === 0 ? 'current' : '', m.moves === 0 ? 'rot' : ''].join(' ').trim()}>
              {m.text}{' '}
            </span>
          ))}
        </span>
      </div>

      {splits.length > 0 && (
        <div className="replay-stages" aria-label="ステップ">
          {splits.map((s) => {
            const width = total > 0 ? ((s.end_ms - s.start_ms) / total) * 100 : 0
            return (
              <button
                key={s.stage}
                className={`replay-stage ${currentStage?.stage === s.stage ? 'active' : ''}`}
                style={{ flexGrow: width, flexBasis: 0 }}
                onClick={() => stepTo(stepOfMove(s.start_index))}
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
        <button onClick={() => stepTo(steps.length)} title="末尾">⏭</button>
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

/** 再生のコマの列。持ち替えは、始めた時刻に置く（前後の手と順序が入れ替わらないようにする）。 */
function replaySteps(moves: SolveMove[], holds: Holds | null | undefined, frame: Frame): Step[] {
  const out: Step[] = []
  for (const tok of notationTokens(moves, holds, frame)) {
    if (tok.kind === 'move') {
      out.push({ text: tok.text, t: moves[tok.index].t, moves: 1 })
    } else if (tok.kind === 'slice') {
      const idx = tok.change.slice_moves!
      out.push({ text: tok.text, t: Math.max(out[out.length - 1]?.t ?? 0, moves[idx[0]].t), moves: idx.length })
    } else {
      const prev = out[out.length - 1]?.t ?? 0
      const next = moves[tok.change.index]?.t ?? tok.change.start_t
      const t = Math.max(prev, Math.min(tok.change.start_t, next))
      // 「x y」のような2つの持ち替えは、TwistyPlayer では2手なので分ける
      for (const r of tok.text.split(' ')) out.push({ text: r, t, moves: 0 })
    }
  }
  return out
}

/** done 手目の時点で取り組んでいる段階。 */
function currentSplit(splits: Split[], done: number): Split | undefined {
  return splits.find((s) => s.move_count > 0 && done >= s.start_index && done < s.end_index) ??
    (done >= (splits[splits.length - 1]?.end_index ?? Infinity) ? splits[splits.length - 1] : undefined)
}
