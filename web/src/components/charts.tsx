import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { Bin, Fences, TrendPoint } from '../solve/aggregate'
import { GROUP_LABELS, groupSplits, type Split, type StageGroup } from '../solve/cfop'
import { formatTime } from '../solve/stats'
import { formatDate } from '../format'

const AXIS = { stroke: 'var(--viz-axis)', tick: { fill: 'var(--viz-muted)', fontSize: 12 } }
const secTick = (ms: number) => (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)

const SERIES = [
  { key: 'single', label: 'single', color: 'var(--series-1)' },
  { key: 'ao5', label: 'ao5', color: 'var(--series-2)' },
  { key: 'ao12', label: 'ao12', color: 'var(--series-3)' },
  { key: 'ao50', label: 'ao50', color: 'var(--series-4)' },
  { key: 'ao100', label: 'ao100', color: 'var(--series-5)' },
] as const
type SeriesKey = (typeof SERIES)[number]['key']

// 推移で描く系列。線が多いと見づらいので、既定は single・ao12・ao100。凡例を押して切り替え、ブラウザに覚える
const SHOWN_KEY = 'cubalyst.trend.series'
const DEFAULT_SHOWN: SeriesKey[] = ['single', 'ao12', 'ao100']

function loadShown(): Set<SeriesKey> {
  try {
    const v = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? 'null')
    if (Array.isArray(v)) return new Set(v.filter((k): k is SeriesKey => SERIES.some((s) => s.key === k)))
  } catch {
    // 読めなければ既定
  }
  return new Set(DEFAULT_SHOWN)
}

function saveShown(shown: Set<SeriesKey>) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown]))
  } catch {
    // 保存できなくても表示は変わる
  }
}

function TrendTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as TrendPoint
  return (
    <div className="viz-tooltip">
      <div className="muted">
        #{p.n} ・ {formatDate(p.solvedAt)}
      </div>
      {SERIES.map((s) => (
        <div key={s.key} className="row-item">
          <span className={`legend-key ${s.key === 'single' ? 'dot' : ''}`} style={{ background: s.color }} />
          <strong>{formatTime(p[s.key], 2)}</strong>
          <span className="muted">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

type TrendDatum = TrendPoint & {
  singleV?: number
  ao5V?: number
  ao12V?: number
  ao50V?: number
  ao100V?: number
  clipped?: 'under' | 'over'
}

/** single の点。軸の外にはみ出したものは、端に三角（▲／▼）で置く。 */
function SingleDot(props: { cx?: number; cy?: number; index?: number; payload?: TrendDatum }) {
  const { cx, cy, index, payload } = props
  if (cx == null || cy == null || payload?.singleV == null) return <g key={index} />
  if (payload.clipped) {
    const d = payload.clipped === 'over' ? `M${cx},${cy - 1} l-4,7 h8 z` : `M${cx},${cy + 1} l-4,-7 h8 z`
    return <path key={index} d={d} fill="none" stroke="var(--series-1)" strokeWidth={1.5} />
  }
  return <circle key={index} cx={cx} cy={cy} r={2.5} fill="var(--series-1)" />
}

/**
 * 推移：single（点）と ao5 / ao12 / ao50 / ao100（線）。DNFは描かない。凡例を押すと系列を出し入れできる。
 * fences を渡すと縦軸をその範囲に絞り、はみ出した single は端に三角で置く（値はツールチップで見られる）。
 */
export function TrendChart({ points, fences }: { points: TrendPoint[]; fences?: Fences | null }) {
  const lo = fences ? Math.floor(fences.lo / 1000) * 1000 : undefined
  const hi = fences ? Math.ceil(fences.hi / 1000) * 1000 : undefined
  // DNF(null)・未定義は描画から外す
  const data: TrendDatum[] = points.map((p) => {
    const clipped = p.single == null ? undefined : hi != null && p.single > hi ? 'over' : lo != null && p.single < lo ? 'under' : undefined
    return {
      ...p,
      singleV: clipped === 'over' ? hi : clipped === 'under' ? lo : (p.single ?? undefined),
      ao5V: p.ao5 ?? undefined,
      ao12V: p.ao12 ?? undefined,
      ao50V: p.ao50 ?? undefined,
      ao100V: p.ao100 ?? undefined,
      clipped,
    }
  })
  const [shown, setShown] = useState(loadShown)
  const toggle = (key: SeriesKey) => {
    const next = new Set(shown)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setShown(next)
    saveShown(next)
  }
  const clippedCount = shown.has('single') ? data.filter((d) => d.clipped).length : 0
  const last = points[points.length - 1]
  return (
    <>
      <div className="legend">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            className="legend-toggle"
            aria-pressed={shown.has(s.key)}
            title={shown.has(s.key) ? `${s.label} を隠す` : `${s.label} を出す`}
            onClick={() => toggle(s.key)}
          >
            <span className={`legend-key ${s.key === 'single' ? 'dot' : ''}`} style={{ background: s.color }} />
            {s.label}
            {last && <strong>&nbsp;{formatTime(last[s.key], 2)}</strong>}
          </button>
        ))}
        {clippedCount > 0 && <span className="muted">外れ値 {clippedCount}件は端に ▲▼</span>}
      </div>
      <div className="chart">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="n" {...AXIS} type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} />
            <YAxis
              {...AXIS}
              tickFormatter={secTick}
              width={40}
              domain={lo != null && hi != null ? [lo, hi] : ['auto', 'auto']}
              allowDataOverflow={fences != null}
            />
            <Tooltip content={TrendTooltip} cursor={{ stroke: 'var(--viz-muted)', strokeWidth: 1 }} />
            {shown.has('single') && (
              <Line
                dataKey="singleV"
                stroke="none"
                dot={SingleDot}
                activeDot={{ r: 5, fill: 'var(--series-1)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
            {SERIES.filter((s) => s.key !== 'single' && shown.has(s.key)).map((s) => (
              <Line
                key={s.key}
                dataKey={`${s.key}V`}
                stroke={s.color}
                strokeWidth={s.key === 'ao100' ? 2.5 : 2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function binLabel(b: Bin) {
  if (b.edge === 'over') return `${(b.to / 1000).toFixed(2)}s まで（${(b.from / 1000).toFixed(2)}s 以上の外れ値）`
  if (b.edge === 'under') return `${(b.from / 1000).toFixed(2)}s から（${(b.to / 1000).toFixed(2)}s 未満の外れ値）`
  return `${(b.from / 1000).toFixed(2)}–${(b.to / 1000).toFixed(2)}s`
}

function HistogramTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload as Bin
  return (
    <div className="viz-tooltip">
      <strong>{b.count}件</strong> <span className="muted">{binLabel(b)}</span>
    </div>
  )
}

const binTick = (b: Bin) => (b.edge === 'over' ? `${secTick(b.from)}〜` : b.edge === 'under' ? `〜${secTick(b.to)}` : secTick(b.from))

/** 分布：タイムのヒストグラム。外れ値をまとめた端のビン（edge）は薄い色で描く。 */
export function HistogramChart({ bins }: { bins: Bin[] }) {
  const data = bins.map((b) => ({ ...b, tick: binTick(b) }))
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="tick" {...AXIS} />
          <YAxis {...AXIS} allowDecimals={false} width={32} />
          <Tooltip content={HistogramTooltip} cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }} />
          <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((b, i) => (
              <Cell key={i} fill="var(--series-1)" fillOpacity={b.edge ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const GROUP_ORDER: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']
const GROUP_COLOR: Record<StageGroup, string> = {
  cross: 'var(--series-1)',
  f2l: 'var(--series-2)',
  oll: 'var(--series-3)',
  pll: 'var(--series-4)',
}

function ShareTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { label: string; ms: number; share: number; moves: number }
  return (
    <div className="viz-tooltip">
      <strong>{Math.round(d.share * 100)}%</strong> <span className="muted">{d.label}</span>
      <div className="muted">
        {formatTime(d.ms, 3)}秒 ・ {d.moves}手
      </div>
    </div>
  )
}

/** ステップごとの時間の割合（ドーナツ）。凡例に数値も並べる。 */
export function StepShareDonut({ splits, totalMs }: { splits: Split[]; totalMs: number }) {
  const groups = groupSplits(splits)
  const sum = GROUP_ORDER.reduce((a, g) => a + (groups[g]?.ms ?? 0), 0)
  if (sum <= 0) return null
  const data = GROUP_ORDER.filter((g) => groups[g]).map((g) => ({
    key: g,
    label: GROUP_LABELS[g],
    ms: groups[g]!.ms,
    moves: groups[g]!.moves,
    share: groups[g]!.ms / sum,
  }))
  return (
    <div className="share-donut">
      <div className="share-donut-chart">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="ms"
              nameKey="label"
              innerRadius="58%"
              outerRadius="95%"
              paddingAngle={1.5}
              stroke="var(--viz-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={GROUP_COLOR[d.key]} />
              ))}
            </Pie>
            <Tooltip content={ShareTooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="share-donut-center">
          <strong>{formatTime(totalMs, 2)}</strong>
        </div>
      </div>
      <ul className="share-legend">
        {data.map((d) => (
          <li key={d.key}>
            <span className="legend-key dot" style={{ background: GROUP_COLOR[d.key] }} />
            <span className="share-legend-label">{d.label}</span>
            <strong>{Math.round(d.share * 100)}%</strong>
            <span className="muted">
              {formatTime(d.ms, 2)}秒 ・ {d.moves}手
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
