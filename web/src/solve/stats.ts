// タイムの計算（WCA方式）。時間はすべてミリ秒、DNFは null で表す。

export type Penalty = '' | '+2' | 'DNF'

/** ペナルティ込みのタイム。DNFは null。 */
export function effectiveTime(totalMs: number, penalty: Penalty): number | null {
  if (penalty === 'DNF') return null
  return penalty === '+2' ? totalMs + 2000 : totalMs
}

/**
 * WCA方式の平均（aoN）。最良と最悪を1つずつ除いて平均する。
 * DNFは最悪として扱い、2つ以上含まれる場合はDNF（null）。件数が足りなければ undefined。
 * 平均はWCAに合わせて10ms単位に丸める。
 */
export function averageOf(times: (number | null)[]): number | null | undefined {
  const n = times.length
  if (n < 3) return undefined
  const dnfs = times.filter((t) => t == null).length
  if (dnfs >= 2) return null
  const sorted = times
    .map((t) => (t == null ? Infinity : t))
    .sort((a, b) => a - b)
    .slice(1, n - 1)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return Math.round(mean / 10) * 10
}

/**
 * 時系列（古い順）の各時点での直近N件の平均。N件たまるまでは undefined。
 */
export function rollingAverages(times: (number | null)[], n: number): (number | null | undefined)[] {
  return times.map((_, i) => (i + 1 < n ? undefined : averageOf(times.slice(i + 1 - n, i + 1))))
}

/** 最良の値（DNF・未定義を除く）。なければ undefined。 */
export function best(values: (number | null | undefined)[]): number | undefined {
  let b: number | undefined
  for (const v of values) {
    if (v != null && (b === undefined || v < b)) b = v
  }
  return b
}

/** 表示用の文字列。12.345 / 1:02.345 / DNF / -- */
export function formatTime(ms: number | null | undefined, digits: 2 | 3 = 2): string {
  if (ms === undefined) return '--'
  if (ms === null) return 'DNF'
  const totalSec = ms / 1000
  const min = Math.floor(totalSec / 60)
  const sec = totalSec - min * 60
  const scale = 10 ** digits
  // 切り捨て（タイマー表示の慣例）
  const secStr = (Math.floor(sec * scale) / scale).toFixed(digits)
  return min > 0 ? `${min}:${secStr.padStart(digits + 3, '0')}` : secStr
}
