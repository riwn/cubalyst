import { useEffect, useState } from 'react'
import { useCubeState } from '../cube/hooks'
import { MockConnection, parseMoveLog } from '../cube/mock'
import { useSettings } from '../settings/hooks'

const FACES = ['U', 'R', 'F', 'D', 'L', 'B']
const ROTATIONS = ['y', 'x', 'z']

type Shortcuts = {
  /** 「スクランブルを回す」で流す手順（残りのスクランブル）。 */
  scramble?: string[]
  /** 「解く」で流す手順。 */
  solution?: string[]
}

/** モック接続時の操作パネル。ボタン／キーボードで回す、回転ログを再生する。 */
export function MockControls(props: Shortcuts) {
  const { connection } = useCubeState()
  if (!(connection instanceof MockConnection)) return null
  return <MockControlsInner mock={connection} {...props} />
}

function MockControlsInner({ mock, scramble, solution }: { mock: MockConnection } & Shortcuts) {
  const [log, setLog] = useState('')
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gyro, setGyro] = useState(mock.gyroHold !== null)
  const { settings } = useSettings()
  const toggleGyro = (on: boolean) => {
    mock.setGyro(on ? { bottom: settings.hold_bottom, front: settings.hold_front } : null)
    setGyro(on)
  }

  // キーボード: U/R/F/D/L/B（Shiftで逆回転）。入力欄にフォーカスがあるときは無視する。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const face = e.key.toUpperCase()
      if (!FACES.includes(face)) return
      e.preventDefault()
      mock.turn(e.shiftKey ? `${face}'` : face)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mock])

  useEffect(() => () => mock.stopReplay(), [mock])

  const play = () => {
    setError(null)
    try {
      const moves = parseMoveLog(log)
      setPlaying(true)
      mock.replay(moves, speed, () => setPlaying(false))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const stop = () => {
    mock.stopReplay()
    setPlaying(false)
  }

  const playMoves = (moves: string[], playSpeed: number) => {
    setError(null)
    setPlaying(true)
    mock.replay(parseMoveLog(moves.join(' ')), playSpeed, () => setPlaying(false))
  }

  return (
    <section className="panel mock-controls">
      <h3>モック操作</h3>
      {(scramble || solution) && (
        <div className="row">
          {scramble && (
            <button onClick={() => playMoves(scramble, 4)} disabled={playing || scramble.length === 0}>
              スクランブルを回す
            </button>
          )}
          {solution && (
            <button onClick={() => playMoves(solution, 1)} disabled={playing || solution.length === 0}>
              逆手順で解く
            </button>
          )}
        </div>
      )}
      <div className="move-buttons">
        {FACES.map((f) => (
          <div key={f} className="move-pair">
            <button onClick={() => mock.turn(f)}>{f}</button>
            <button onClick={() => mock.turn(`${f}'`)}>{f}'</button>
          </div>
        ))}
      </div>
      <p className="muted small">キーボード: U R F D L B（Shiftで逆回転）</p>
      <label className="radio">
        <input type="checkbox" checked={gyro} onChange={(e) => toggleGyro(e.target.checked)} />
        ジャイロを流す（設定の持ち方から）
      </label>
      {gyro && (
        <div className="move-buttons">
          {ROTATIONS.map((r) => (
            <div key={r} className="move-pair">
              <button onClick={() => mock.rotateHold(r)}>{r}</button>
              <button onClick={() => mock.rotateHold(`${r}'`)}>{r}'</button>
            </div>
          ))}
        </div>
      )}
      <label className="block">
        回転ログを再生（JSON配列 または "R U R' U'"）
        <textarea
          rows={4}
          value={log}
          onChange={(e) => setLog(e.target.value)}
          placeholder={'[{"move":"R","cubeTimestamp":0},{"move":"U","cubeTimestamp":180}]'}
        />
      </label>
      <div className="row">
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        {playing ? (
          <button onClick={stop}>停止</button>
        ) : (
          <button onClick={play} disabled={log.trim() === ''}>
            再生
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
