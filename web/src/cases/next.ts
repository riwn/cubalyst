// 次に覚えるケース：2-look で揃えていることが多い OLL・PLL のケースを、覚えたときに縮む時間の見込みが大きい順に出す。

export type LastLayerRow = {
  id: string
  count: number
  /** 平均時間（ms）。 */
  avg: number
  /** 揃えるのに使った手順の数の平均（1 なら 1-look）。 */
  steps: number
}

export type NextCase = {
  id: string
  count: number
  avg: number
  /** (このケースの平均 − 1つの手順で揃えたケースの平均) × 回数（ms）。 */
  loss: number
}

/** これ以上なら、ふだん 2-look で揃えているケースとみなす。 */
const TWO_LOOK = 1.5

export type NextToLearn = {
  /** 1つの手順で揃えているケースの平均時間（ms）。 */
  oneLookAvg: number
  cases: NextCase[]
}

/**
 * 1つの手順で揃えているケースの平均を基準に、2-look のケースで失っている時間を見積もる。
 * 基準にできる（1つの手順で揃えた）ケースが無ければ null。
 * skip のケース（覚えた印を付けたケース）は、基準には入れるが、挙げない。
 */
export function nextToLearn(rows: LastLayerRow[], skip: ReadonlySet<string> = new Set(), limit = 5): NextToLearn | null {
  const known = rows.filter((r) => r.id && r.count > 0)
  const one = known.filter((r) => r.steps < TWO_LOOK)
  const n = one.reduce((s, r) => s + r.count, 0)
  if (n === 0) return null
  const oneLookAvg = one.reduce((s, r) => s + r.avg * r.count, 0) / n
  const cases = known
    .filter((r) => r.steps >= TWO_LOOK && !skip.has(r.id))
    .map((r) => ({ id: r.id, count: r.count, avg: r.avg, loss: Math.max(0, r.avg - oneLookAvg) * r.count }))
    .filter((c) => c.loss > 0)
    .sort((a, b) => b.loss - a.loss || b.count - a.count)
    .slice(0, limit)
  return { oneLookAvg, cases }
}
