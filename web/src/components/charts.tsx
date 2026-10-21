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
import type { Bin, TrendPoint } from '../solve/aggregate'
import { GROUP_LABELS, groupSplits, type Split, type StageGroup } from '../solve/cfop'
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
