import { useMemo, useState } from 'react'
import type { SolveMode } from '../api'
import { HistogramChart, TrendChart } from '../components/charts'
import { MODE_LABELS } from '../format'
import { bests, histogram, stageStats, trend } from '../solve/aggregate'
import { GROUP_LABELS, STAGE_LABELS, STAGES, type StageGroup } from '../solve/cfop'
import { useSolveList } from '../solve/hooks'
import { effectiveTime, formatTime } from '../solve/stats'

type Period = 'all' | '7' | '30' | '90' | 'custom'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: '全期間' },
  { value: '7', label: '7日' },
  { value: '30', label: '30日' },
  { value: '90', label: '90日' },
  { value: 'custom', label: '指定' },
]

const GROUPS: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']
const GROUP_COLORS: Record<StageGroup, string> = {
  cross: 'var(--series-1)',
  f2l: 'var(--series-2)',
  oll: 'var(--series-3)',
  pll: 'var(--series-4)',
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days + 1)
  return d.toISOString()
}

function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

/** 統計：ベスト記録、推移、分布、段階別統計。 */
export function StatsPage() {
  const [mode, setMode] = useState<SolveMode>('full')
  const [period, setPeriod] = useState<Period>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [caseId, setCaseId] = useState('')
  const [step, setStep] = useState('')
  const [histN, setHistN] = useState(100)

  const range =
    period === 'custom'
      ? { from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? nextDayIso(to) : undefined }
      : period === 'all'
        ? {}
        : { from: daysAgo(Number(period)) }
  const { solves: loaded, error } = useSolveList({ mode, ...range, limit: 0, includeSplits: true, order: 'asc' })

  // ケース・段階は読み込んだ中から選ぶ（選択肢もそこから作る）
  const caseOptions = useMemo(() => [...new Set(loaded.map((s) => s.case_id).filter((c): c is string => !!c))].sort(), [loaded])
  const stepOptions = useMemo(() => [...new Set(loaded.map((s) => s.step).filter((c): c is string => !!c))].sort(), [loaded])
  const solves = useMemo(
    () =>
      loaded.filter(
        (s) => (mode !== 'case' || !caseId || s.case_id === caseId) && (mode !== 'step' || !step || s.step === step),
      ),
    [loaded, mode, caseId, step],
  )

  const points = useMemo(() => trend(solves), [solves])
  const b = useMemo(() => bests(points), [points])
  const hist = useMemo(
    () => histogram(solves.slice(-histN).map((s) => effectiveTime(s.total_ms, s.penalty))),
    [solves, histN],
  )
  const stages = useMemo(() => stageStats(solves), [solves])

  return (
    <div className="stats-page">
      <section className="panel row">
        <label>
          モード{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as SolveMode)}>
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          期間{' '}
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> 〜
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {mode === 'case' && (
          <label>
            ケース{' '}
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">すべて</option>
              {caseOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {mode === 'step' && (
          <label>
            段階{' '}
            <select value={step} onChange={(e) => setStep(e.target.value)}>
              <option value="">すべて</option>
              {stepOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <span className="muted">{solves.length}件</span>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="panel stat-tiles">
        <Tile label="best single" value={formatTime(b.single, 3)} />
        <Tile label="best ao5" value={formatTime(b.ao5)} sub={`現在 ${formatTime(b.currentAo5)}`} />
        <Tile label="best ao12" value={formatTime(b.ao12)} sub={`現在 ${formatTime(b.currentAo12)}`} />
        <Tile label="ソルブ数" value={String(b.count)} sub={b.dnf ? `DNF ${b.dnf}` : undefined} />
      </section>

      {solves.length === 0 ? (
        <p className="muted">この条件の記録がありません</p>
      ) : (
        <>
          <section className="panel">
            <h3>推移</h3>
            <TrendChart points={points} />
          </section>

          <section className="panel">
            <div className="row">
              <h3>分布</h3>
              <label className="small">
                直近{' '}
                <input
                  type="number"
                  min={5}
                  step={10}
                  value={histN}
                  onChange={(e) => setHistN(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: '5em' }}
                />{' '}
                件
              </label>
              <span className="muted small">
                ビン幅 {hist.width / 1000}秒{hist.dnf > 0 && ` ・ DNF ${hist.dnf}件（表示外）`}
              </span>
            </div>
            <HistogramChart bins={hist.bins} />
          </section>

          {stages.count > 0 && (
            <section className="panel">
              <h3>段階別（{stages.count}ソルブの平均）</h3>
              <div className="share-bar" role="img" aria-label="段階ごとの時間の割合">
                {GROUPS.map((g) => (
                  <div
                    key={g}
                    style={{ flex: stages.groups[g]?.share ?? 0, background: GROUP_COLORS[g] }}
                    title={`${GROUP_LABELS[g]} ${Math.round((stages.groups[g]?.share ?? 0) * 100)}%`}
                  />
                ))}
              </div>
              <div className="share-labels">
                {GROUPS.map((g) => (
                  <div key={g} style={{ flex: stages.groups[g]?.share ?? 0 }}>
                    {GROUP_LABELS[g]} {Math.round((stages.groups[g]?.share ?? 0) * 100)}%
                  </div>
                ))}
              </div>
              <table className="splits-table">
                <thead>
                  <tr>
                    <th className="left">段階</th>
                    <th>平均時間</th>
                    <th>割合</th>
                    <th>平均手数</th>
                    <th>TPS</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((g) => {
                    const s = stages.groups[g]
                    if (!s) return null
                    return (
                      <tr key={g}>
                        <th className="left">
                          <span className="legend-key dot" style={{ background: GROUP_COLORS[g] }} />
                          {GROUP_LABELS[g]}
                        </th>
                        <td>{formatTime(s.ms, 3)}</td>
                        <td>{Math.round(s.share * 100)}%</td>
                        <td>{s.moves.toFixed(1)}</td>
                        <td>{s.tps.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                  {STAGES.filter((st) => st.startsWith('f2l')).map((st) => {
                    const s = stages.stages[st]
                    if (!s) return null
                    return (
                      <tr key={st} className="muted">
                        <td className="left">　{STAGE_LABELS[st]}</td>
                        <td>{formatTime(s.ms, 3)}</td>
                        <td>{Math.round(s.share * 100)}%</td>
                        <td>{s.moves.toFixed(1)}</td>
                        <td>{s.tps.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
