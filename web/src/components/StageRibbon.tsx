import { GROUP_LABELS, groupSplits, type Split, type StageGroup } from '../solve/cfop'
import { formatTime } from '../solve/stats'

const GROUPS: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']

/** 直前のソルブの CFOP 各段階の時間を、長さの比で並べた帯。 */
export function StageRibbon({ splits }: { splits: Split[] | undefined }) {
  const groups = groupSplits(splits)
  const items = GROUPS.map((g) => ({ g, ...(groups[g] ?? { ms: 0, moves: 0 }) }))
  const total = items.reduce((a, b) => a + b.ms, 0)
  if (total <= 0) return null
  return (
    <section className="stage-ribbon" aria-label="直前のソルブの段階別時間">
      <div className="stage-ribbon-bar" aria-hidden="true">
        {items.map((it) => (
          <div key={it.g} className="stage-ribbon-seg" style={{ flex: `${it.ms} 1 0` }} />
        ))}
      </div>
      <div className="stage-ribbon-labels">
        {items.map((it) => (
          <div key={it.g} style={{ flex: `${Math.max(it.ms, total * 0.12)} 1 0` }}>
            {GROUP_LABELS[it.g]} <span className="n">{it.moves}手</span>
            <span className="t">{formatTime(it.ms, 2)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
