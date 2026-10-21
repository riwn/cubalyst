import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSolve, listCases, type CaseInfo } from '../api'
import { algsFor } from '../cases/algs'
import type { DrillAttempt } from '../cases/drill'
import { useAlgDrill, useDrillState } from '../cases/hooks'
import { scrambleFor } from '../cases/exercise'
import { invertRotation, normalizeOrientation } from '../cases/geometry'
import { caseStats } from '../cases/stats'
import { CaseDiagram } from '../components/CaseDiagram'
import { CubeView } from '../components/CubeView'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { MockConnection, parseMoveLog } from '../cube/mock'
import { holdRotation } from '../cube/orientation'
import { useHoldFrame, useSettings } from '../settings/hooks'
import { useSolveList } from '../solve/hooks'
import { averageOf, best, effectiveTime, formatTime } from '../solve/stats'
import { useDebug } from '../ui/prefs'

const SETS = ['OLL', 'PLL', 'F2L'] as const
type SetName = (typeof SETS)[number]

const targetKey = (id: string) => `cubalyst.drillTarget.${id}`

function loadTarget(id: string): number {
  try {
    const v = Number(localStorage.getItem(targetKey(id)))
    return v > 0 ? v : 3
  } catch {
    return 3
  }
}

const algKey = (id: string) => `cubalyst.drillAlg.${id}`

/** 前回選んだ手順（選べる手順に無ければ標準手順）。 */
function loadAlg(c: CaseInfo): string {
  try {
    const v = localStorage.getItem(algKey(c.id))
    if (v && algsFor(c).includes(v)) return v
  } catch {
    // 読めなければ標準手順
  }
  return c.alg
}

function saveAlg(id: string, alg: string) {
  try {
    localStorage.setItem(algKey(id), alg)
  } catch {
    // 保存できなくても練習はできる
  }
}

function saveTarget(id: string, sec: number) {
  try {
    localStorage.setItem(targetKey(id), String(sec))
  } catch {
    // 保存できなくても練習はできる
  }
}

/** 手順練習：ケースと手順を1つ選び、その手順を何度も回して1回ごとの時間を測る。 */
export function AlgDrillPage() {
  const [cases, setCases] = useState<CaseInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<SetName>('OLL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [chosenAlg, setChosenAlg] = useState<Record<string, string>>({})
  const history = useSolveList({ mode: 'case', limit: 0 })
  const stats = useMemo(() => caseStats(history.solves), [history.solves])

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  const selected = cases.find((c) => c.id === selectedId) ?? null
  const alg = selected ? (chosenAlg[selected.id] ?? loadAlg(selected)) : ''
  const chooseAlg = (id: string, a: string) => {
    setChosenAlg((prev) => ({ ...prev, [id]: a }))
    saveAlg(id, a)
  }
  if (error) return <p className="error">{error}</p>

  if (running && selected) {
    return <DrillView c={selected} alg={alg} onBack={() => setRunning(false)} onSaved={history.reload} />
  }

  const inTab = cases.filter((c) => c.set === tab)
  const groups = [...new Set(inTab.map((c) => c.group))]

  return (
    <div className="alg-drill">
      <section className="panel row">
        {SETS.map((s) => (
          <button key={s} className={tab === s ? 'on-accent' : ''} onClick={() => setTab(s)}>
            {s}
          </button>
        ))}
        <span className="muted small">練習したいケースを1つ選んでください（手順が複数あるケースは回す手順も選べます）</span>
      </section>

      {selected && (
        <section className="panel drill-selected">
          <div className="row">
            <CaseDiagram c={selected} size={96} />
            <div className="drill-selected-info">
              <strong>{selected.name}</strong>
              {algsFor(selected).length > 1 ? (
                <div className="drill-alg-choices" role="radiogroup" aria-label="回す手順">
                  {algsFor(selected).map((a, i) => (
                    <label key={a} className={`drill-alg-choice ${a === alg ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="drill-alg"
                        checked={a === alg}
                        onChange={() => chooseAlg(selected.id, a)}
                      />
                      <span className="alg">{a}</span>
                      {i === 0 && <span className="muted small">標準</span>}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="alg drill-alg">{selected.alg}</div>
              )}
              <div className="muted small">
                全期間：{stats.get(selected.id)?.count ?? 0}回 ・ 平均 {formatTime(stats.get(selected.id)?.mean)} ・ ベスト{' '}
                {formatTime(stats.get(selected.id)?.best)}
              </div>
            </div>
            <span className="spacer" />
            <button className="primary" onClick={() => setRunning(true)}>
              この手順を練習
            </button>
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g} className="case-group">
          <h3>{g}</h3>
          <div className="case-grid">
            {inTab
              .filter((c) => c.group === g)
              .map((c) => {
                const st = stats.get(c.id)
                return (
                  <button
                    key={c.id}
                    className={`case-card ${selectedId === c.id ? 'selected' : 'selectable'}`}
                    onClick={() => setSelectedId(c.id)}
                    title={c.alg}
                  >
                    <CaseDiagram c={c} />
                    <div className="case-name">{c.name}</div>
                    <div className="case-stat">{st ? `${formatTime(st.best, 2)}（${st.count}）` : '—'}</div>
                  </button>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 練習中の画面。 */
function DrillView({ c, alg, onBack, onSaved }: { c: CaseInfo; alg: string; onBack: () => void; onSaved: () => void }) {
  const store = useCubeStore()
  const { settings } = useSettings()
  const { status, connection } = useCubeState()
  const debug = useDebug()
  const [target, setTarget] = useState(() => loadTarget(c.id))
  const [attempts, setAttempts] = useState<number[]>([]) // 新しい順
  const [saveError, setSaveError] = useState<string | null>(null)
  const allTime = useSolveList({ mode: 'case', case_id: c.id, limit: 0 })
  const { reload: reloadAllTime } = allTime

  const rotation = useMemo(
    () => holdRotation(store.kpuzzle.defaultPattern(), settings.hold_bottom, settings.hold_front),
    [store.kpuzzle, settings.hold_bottom, settings.hold_front],
  )
  const drill = useAlgDrill(store, alg, rotation)
  const frame = useHoldFrame()
  const hold = useMemo(() => ({ rotation, frame }), [rotation, frame])

  const save = useCallback(
    async (a: DrillAttempt) => {
      try {
        await createSolve({
          mode: 'case',
          solved_at: new Date().toISOString(),
          total_ms: a.ms,
          penalty: '',
          scramble: '',
          moves: a.moves,
          case_id: c.id,
          step: null,
          note: '',
        })
        setSaveError(null)
        reloadAllTime()
        onSaved()
      } catch (err) {
        setSaveError(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [c.id, reloadAllTime, onSaved],
  )

  useEffect(() => {
    if (!drill) return
    return drill.events.subscribe((e) => {
      setAttempts((prev) => [e.attempt.ms, ...prev])
      void save(e.attempt)
    })
  }, [drill, save])

  const state = useDrillState(drill)

  // 回している最中の経過時間
  const [now, setNow] = useState(() => performance.now())
  const moving = state.moveCount > 0 && state.startedAt != null
  useEffect(() => {
    if (!moving) return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [moving])

  const targetMs = target * 1000
  const last = attempts[0]
  const underTarget = attempts.filter((t) => t <= targetMs).length
  const allTimes = allTime.solves.map((s) => effectiveTime(s.total_ms, s.penalty))

  const changeTarget = (v: number) => {
    const sec = Math.max(0.1, Math.round(v * 10) / 10)
    setTarget(sec)
    saveTarget(c.id, sec)
  }

  return (
    <div className="drill-view">
      <div className="row">
        <button onClick={onBack}>← ケースを選び直す</button>
        <span className="spacer" />
        <label className="small">
          目標{' '}
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={target}
            onChange={(e) => changeTarget(Number(e.target.value))}
            style={{ width: '5em' }}
          />{' '}
          秒
        </label>
        <button onClick={() => drill?.reset()} title="回しかけを捨てて、今の状態から数え直す">
          数え直す
        </button>
      </div>

      <section className="panel drill-head">
        <CaseDiagram c={c} size={88} />
        <div>
          <strong>{c.name}</strong>
          <div className="alg drill-alg">{alg}</div>
          <div className="muted small">
            揃っていなくても大丈夫です。手順を回し終えるたびに自動で記録します（前後のAUF・別の面での実行もOK）。
          </div>
        </div>
      </section>

      {status === 'disconnected' && <p className="muted center">右上の「Connect」でキューブを接続すると練習できます</p>}

      <section className={`timer ${moving ? 'timer--running' : last != null && last <= targetMs ? 'drill--good' : ''}`}>
        <div className="timer-time">
          {moving ? formatTime(Math.max(0, now - state.startedAt!), 2) : last != null ? formatTime(last, 3) : '0.000'}
        </div>
        <div className="timer-hint">
          {moving
            ? `${state.moveCount}手`
            : last != null
              ? last <= targetMs
                ? `目標（${target}秒）以内！`
                : `目標まで ${((last - targetMs) / 1000).toFixed(2)}秒`
              : '手順を回すと計測します'}
        </div>
      </section>

      <div className="timer-grid">
        <div>
          <CubeView hold={hold} />
        </div>
        <div>
          <section className="panel">
            <div className="averages">
              <div>
                <span className="muted">回数</span> <strong>{attempts.length}</strong>
              </div>
              <div>
                <span className="muted">目標以内</span>{' '}
                <strong>
                  {underTarget}
                  {attempts.length > 0 && `（${Math.round((underTarget / attempts.length) * 100)}%）`}
                </strong>
              </div>
              <div>
                <span className="muted">best</span> <strong>{formatTime(best(attempts))}</strong>
              </div>
              <div>
                <span className="muted">ao5</span>{' '}
                <strong>{formatTime(attempts.length >= 5 ? averageOf(attempts.slice(0, 5)) : undefined)}</strong>
              </div>
              <div>
                <span className="muted">ao12</span>{' '}
                <strong>{formatTime(attempts.length >= 12 ? averageOf(attempts.slice(0, 12)) : undefined)}</strong>
              </div>
            </div>
            <p className="muted small">
              全期間：{allTime.total}回 ・ ベスト {formatTime(best(allTimes))}
            </p>
            {attempts.length > 0 && (
              <ol className="drill-attempts" reversed>
                {attempts.slice(0, 20).map((t, i) => (
                  <li key={attempts.length - i} className={t <= targetMs ? 'good' : ''}>
                    {formatTime(t, 3)}
                  </li>
                ))}
              </ol>
            )}
          </section>
          {saveError && <p className="error">{saveError}</p>}
          {debug && connection instanceof MockConnection && <MockDrillButton mock={connection} alg={alg} rotation={rotation} />}
        </div>
      </div>
    </div>
  )
}

/** デバッグ用：モックで手順を1回実行する（同じ効果の外層回転に直して回す）。 */
function MockDrillButton({ mock, alg, rotation }: { mock: MockConnection; alg: string; rotation: string }) {
  const store = useCubeStore()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const start = store.getSnapshot().pattern
    const target = normalizeOrientation(store.kpuzzle, start.applyAlg(`${rotation} ${alg} ${invertRotation(rotation)}`))
    // start → target の変換 D を「完成状態から D を当てた状態」にしてソルバーに渡すと、
    // 返ってくる手順 S は完成状態から D への手順＝ start から target への手順になる（状態は変換として合成されるため）
    const d = start.experimentalToTransformation()!.invert().applyTransformation(target.experimentalToTransformation()!)
    const moves = await scrambleFor(store.kpuzzle.defaultPattern().applyTransformation(d))
    mock.replay(parseMoveLog(moves), 2, () => setBusy(false))
  }
  return (
    <section className="panel">
      <h3>モック操作</h3>
      <button onClick={run} disabled={busy}>
        手順を1回実行
      </button>
    </section>
  )
}
