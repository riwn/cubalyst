import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { Bin, TrendPoint } from '../solve/aggregate'
import { formatTime } from '../solve/stats'
import { formatDate } from '../format'

const AXIS = { stroke: 'var(--viz-axis)', tick: { fill: 'var(--viz-muted)', fontSize: 12 } }
const secTick = (ms: number) => (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)

const SERIES = [
  { key: 'single', label: 'single', color: 'var(--series-1)' },
  { key: 'ao5', label: 'ao5', color: 'var(--series-2)' },
  { key: 'ao12', label: 'ao12', color: 'var(--series-3)' },
] as const

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

/** 推移：single（点）と ao5 / ao12（線）。DNFは描かない。 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  // DNF(null)・未定義は描画から外す
  const data = points.map((p) => ({
    ...p,
    singleV: p.single ?? undefined,
    ao5V: p.ao5 ?? undefined,
    ao12V: p.ao12 ?? undefined,
  }))
  const last = points[points.length - 1]
  return (
    <>
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <span className={`legend-key ${s.key === 'single' ? 'dot' : ''}`} style={{ background: s.color }} />
            {s.label}
            {last && <strong> {formatTime(last[s.key], 2)}</strong>}
          </span>
        ))}
      </div>
      <div className="chart">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="n" {...AXIS} type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} />
            <YAxis {...AXIS} tickFormatter={secTick} width={40} domain={['auto', 'auto']} />
            <Tooltip content={TrendTooltip} cursor={{ stroke: 'var(--viz-muted)', strokeWidth: 1 }} />
            <Line
              dataKey="singleV"
              stroke="none"
              dot={{ r: 2.5, fill: 'var(--series-1)', stroke: 'none' }}
              activeDot={{ r: 5, fill: 'var(--series-1)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line dataKey="ao5V" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="ao12V" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function binLabel(b: Bin) {
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

/** 分布：タイムのヒストグラム。 */
export function HistogramChart({ bins }: { bins: Bin[] }) {
  const data = bins.map((b) => ({ ...b, mid: (b.from + b.to) / 2 }))
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="from" {...AXIS} tickFormatter={secTick} />
          <YAxis {...AXIS} allowDecimals={false} width={32} />
          <Tooltip content={HistogramTooltip} cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }} />
          <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
