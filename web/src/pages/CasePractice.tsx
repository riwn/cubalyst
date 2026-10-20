import { useCallback, useEffect, useMemo, useState } from 'react'
import { listCases, type CaseInfo, type Solve } from '../api'
import { caseExerciseSource } from '../cases/exercise'
import { CaseDiagram } from '../components/CaseDiagram'
import { PracticeRunner } from '../components/PracticeRunner'
import { useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { useSolveList } from '../solve/hooks'
import { caseStats } from '../cases/stats'
import { effectiveTime, formatTime } from '../solve/stats'

const SETS = ['OLL', 'PLL', 'F2L'] as const
type SetName = (typeof SETS)[number]
const STORAGE_KEY = 'cubalyst.caseSelection'

function loadSelection(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveSelection(s: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch {
    // 保存できなくても練習はできる
  }
}

/** ケース単発練習：ケースを選んでランダム出題、ケース別の成績。 */
export function CasePractice() {
  const store = useCubeStore()
  const { settings } = useSettings()
  const [cases, setCases] = useState<CaseInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<SetName>('PLL')
  const [selected, setSelected] = useState<Set<string>>(loadSelection)
  const [running, setRunning] = useState(false)
  const history = useSolveList({ mode: 'case', limit: 0 })
  const { reload } = history
  const [lastSolved, setLastSolved] = useState<Solve | null>(null)

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])
  const stats = useMemo(() => caseStats(history.solves), [history.solves])
  const selectedCases = useMemo(() => cases.filter((c) => selected.has(c.id)), [cases, selected])
  const selectionKey = selectedCases.map((c) => c.id).join(',')

  // 選択が変わったら出題元を作り直す
  const source = useMemo(
    () => caseExerciseSource(store.kpuzzle, selectedCases, settings.cross_color),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.kpuzzle, selectionKey, settings.cross_color],
  )

  const update = (next: Set<string>) => {
    setSelected(next)
    saveSelection(next)
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }
  const setAll = (ids: string[], on: boolean) => {
    const next = new Set(selected)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    update(next)
  }

  const onSaved = useCallback(
    (s: Solve) => {
      setLastSolved(s)
      reload()
    },
    [reload],
  )

  const inTab = cases.filter((c) => c.set === tab)
  const groups = [...new Set(inTab.map((c) => c.group))]
  const ranking = [...stats.entries()]
    .filter(([id, s]) => s.mean != null && byId.has(id))
    .sort((a, b) => b[1].mean! - a[1].mean!)
    .slice(0, 10)

  if (error) return <p className="error">{error}</p>

  if (running) {
    const lastCase = lastSolved?.case_id ? byId.get(lastSolved.case_id) : undefined
    return (
      <div>
        <div className="row">
          <button onClick={() => setRunning(false)}>← ケースを選び直す</button>
          <span className="muted">{selectedCases.length}ケースからランダムに出題</span>
        </div>
        <PracticeRunner
          source={source}
          onSaved={onSaved}
          side={
            lastSolved &&
            lastCase && (
              <section className="panel last-case">
                <div className="row">
                  <CaseDiagram c={lastCase} size={80} />
                  <div>
                    <div className="muted small">直前のケース</div>
                    <strong>{lastCase.name}</strong>{' '}
                    <span className="muted">
                      {formatTime(effectiveTime(lastSolved.total_ms, lastSolved.penalty), 3)}
                    </span>
                    <div className="alg small">{lastCase.alg}</div>
                    <div className="muted small">
                      このケースの平均 {formatTime(stats.get(lastCase.id)?.mean, 2)}（{stats.get(lastCase.id)?.count ?? 0}回）
                    </div>
                  </div>
                </div>
              </section>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="case-practice">
      <section className="panel row">
        {SETS.map((s) => (
          <button key={s} className={tab === s ? 'on-accent' : ''} onClick={() => setTab(s)}>
            {s}（{cases.filter((c) => c.set === s && selected.has(c.id)).length}/{cases.filter((c) => c.set === s).length}）
          </button>
        ))}
        <span className="spacer" />
        <button onClick={() => setAll(inTab.map((c) => c.id), true)}>{tab}を全選択</button>
        <button onClick={() => setAll(inTab.map((c) => c.id), false)}>{tab}を解除</button>
        <button className="primary" disabled={selectedCases.length === 0} onClick={() => setRunning(true)}>
          {selectedCases.length}ケースで練習開始
        </button>
      </section>

      {groups.map((g) => {
        const items = inTab.filter((c) => c.group === g)
        const allOn = items.every((c) => selected.has(c.id))
        return (
          <section key={g} className="case-group">
            <h3>
              <label className="radio">
                <input type="checkbox" checked={allOn} onChange={() => setAll(items.map((c) => c.id), !allOn)} />
                {g}
              </label>
            </h3>
            <div className="case-grid">
              {items.map((c) => {
                const st = stats.get(c.id)
                return (
                  <button
                    key={c.id}
                    className={`case-card ${selected.has(c.id) ? 'selected' : ''}`}
                    onClick={() => toggle(c.id)}
                    title={c.alg}
                  >
                    <CaseDiagram c={c} />
                    <div className="case-name">{c.name}</div>
                    <div className="case-stat">{st ? `${formatTime(st.mean, 2)}（${st.count}）` : '—'}</div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="panel">
        <h3>苦手ケース（平均が遅い順）</h3>
        {ranking.length === 0 ? (
          <p className="muted">まだ記録がありません</p>
        ) : (
          <table className="splits-table">
            <thead>
              <tr>
                <th className="left">ケース</th>
                <th>平均</th>
                <th>ベスト</th>
                <th>回数</th>
                <th className="left">手順</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(([id, s], i) => {
                const c = byId.get(id)!
                return (
                  <tr key={id}>
                    <td className="left">
                      {i + 1}. {c.name}
                    </td>
                    <td>{formatTime(s.mean, 2)}</td>
                    <td>{formatTime(s.best, 2)}</td>
                    <td>{s.count}</td>
                    <td className="alg">{c.alg}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
