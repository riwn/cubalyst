// Goサーバー（/api）へのクライアント。

import type { GyroSample } from './cube/gyro'
import type { CrossColor, Split } from './solve/cfop'
import type { Holds } from './solve/holds'
import type { Penalty } from './solve/stats'

export type Health = {
  status: 'ok' | 'error'
  db: 'ok' | 'error'
  schema_version: number
  error?: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/api/health', { signal })
  const body = (await res.json().catch(() => null)) as Health | null
  if (!body) {
    throw new Error(`HTTP ${res.status}`)
  }
  return body
}

/** full：タイマー、case：手順練習、step：ステップ練習、assist：補助付きフルソルブ（練習。タイマーの記録とは分ける）。 */
export type SolveMode = 'full' | 'case' | 'step' | 'assist'

/** 保存する回転ログの1手。t は補正後の、ソルブ開始からの相対ms。 */
export type SolveMove = {
  move: string
  cube_ts: number | null
  local_ts: number | null
  t: number
}

export type Solve = {
  id: number
  mode: SolveMode
  solved_at: string
  total_ms: number
  penalty: Penalty
  scramble: string
  moves?: SolveMove[]
  case_id: string | null
  step: string | null
  note: string
  splits?: Split[]
  /** ジャイロの生データ（include=moves のときだけ。ジャイロの無いソルブには無い）。 */
  gyro?: GyroSample[]
  /** 持ち替え（ジャイロから計算した派生データ）。記録が無ければ null か無し。 */
  holds?: Holds | null
  /** このソルブを対象にした解析の数（includeAnalyses のときだけ）。 */
  analyses?: { solve: number; multi: number }
}

export type NewSolve = Omit<Solve, 'id'>

/** 一覧の並べ替えの基準。time は +2 込み、DNF と値の無いソルブ（段階が無いなど）はいつも最後。 */
export type SolveSort = 'date' | 'time' | 'moves' | 'cross' | 'f2l' | 'oll' | 'pll'

export type SolveFilter = {
  mode?: SolveMode
  from?: string
  to?: string
  case_id?: string
  step?: string
  ids?: number[]
  limit?: number
  offset?: number
  includeMoves?: boolean
  includeSplits?: boolean
  includeAnalyses?: boolean
  order?: 'asc' | 'desc'
  sort?: SolveSort
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

export function filterToQuery(f: SolveFilter): string {
  const q = new URLSearchParams()
  if (f.mode) q.set('mode', f.mode)
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  if (f.case_id) q.set('case_id', f.case_id)
  if (f.step) q.set('step', f.step)
  if (f.ids?.length) q.set('ids', f.ids.join(','))
  if (f.limit !== undefined) q.set('limit', String(f.limit))
  if (f.offset) q.set('offset', String(f.offset))
  const include = [f.includeMoves && 'moves', f.includeSplits && 'splits', f.includeAnalyses && 'analyses'].filter(Boolean)
  if (include.length) q.set('include', include.join(','))
  if (f.order) q.set('order', f.order)
  if (f.sort) q.set('sort', f.sort)
  return q.toString()
}

export function listSolves(f: SolveFilter = {}): Promise<{ solves: Solve[]; total: number }> {
  return request(`/api/solves?${filterToQuery(f)}`)
}

export function getSolve(id: number): Promise<Solve> {
  return request(`/api/solves/${id}`)
}

export function createSolve(s: NewSolve): Promise<Solve> {
  return request('/api/solves', { method: 'POST', body: JSON.stringify(s) })
}

export function updateSolve(id: number, patch: { penalty?: Penalty; note?: string }): Promise<Solve> {
  return request(`/api/solves/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function deleteSolve(id: number): Promise<void> {
  return request(`/api/solves/${id}`, { method: 'DELETE' })
}

export function replaceSplits(id: number, splits: Split[]): Promise<Solve> {
  return request(`/api/solves/${id}/splits`, { method: 'PUT', body: JSON.stringify(splits) })
}

export function replaceHolds(id: number, holds: Holds | null): Promise<Solve> {
  return request(`/api/solves/${id}/holds`, { method: 'PUT', body: JSON.stringify(holds) })
}

export type Settings = {
  cross_color: CrossColor
  /** 解くときの持ち方（下の色・前の色）。解法の表記をこの向きに合わせる。 */
  hold_bottom: CrossColor
  hold_front: CrossColor
  /** フルソルブでWCA方式の15秒インスペクションを使うか。 */
  inspection: boolean
  /** ジャイロで持ち替えを記録するか（ジャイロのデータはキューブ側で切る）。 */
  use_gyro: boolean
}

export function getSettings(): Promise<Settings> {
  return request('/api/settings')
}

export function putSettings(s: Settings): Promise<Settings> {
  return request('/api/settings', { method: 'PUT', body: JSON.stringify(s) })
}

export type ExportFormat = 'json' | 'csv' | 'txt'

/** export のダウンロードURL（limit は既定で無制限）。 */
export function exportUrl(format: ExportFormat, f: SolveFilter = {}): string {
  const q = filterToQuery({ ...f, includeMoves: false, includeSplits: false })
  return `/api/export?format=${format}${q ? `&${q}` : ''}`
}

export type ImportResult = { imported: number; skipped: number; errors: string[] }

export async function importSolves(json: string): Promise<ImportResult> {
  return request('/api/import', { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' } })
}

export type CaseInfo = {
  id: string
  set: 'OLL' | 'PLL' | 'F2L'
  name: string
  group: string
  alg: string
  /** ケースの状態（標準の向き）の54文字facelets。 */
  pattern: string
  /** 手順練習で「覚えた」と印を付けたか。 */
  learned: boolean
}

export function listCases(): Promise<CaseInfo[]> {
  return request('/api/cases')
}

export function setCaseLearned(id: string, learned: boolean): Promise<void> {
  return request(`/api/cases/${id}/learned`, { method: 'PUT', body: JSON.stringify({ learned }) })
}

export type AnalysisKind = 'solve' | 'multi'

/** 解析結果。単体（solve）は1回のソルブ、まとめ（multi）は複数のソルブを対象にする。解析は MCP でつないだ AI が書く。 */
export type Analysis = {
  id: number
  kind: AnalysisKind
  /** まとめの見出し（単体は空）。 */
  title: string
  params: Record<string, unknown>
  /** 対象のソルブ（古い順。消されたソルブは含まない）。 */
  solve_ids: number[]
  input: string
  result: string
  model: string
  created_at: string
}

export function listAnalyses(f: { kind?: AnalysisKind; solve_id?: number; limit?: number } = {}): Promise<Analysis[]> {
  const q = new URLSearchParams()
  if (f.kind) q.set('kind', f.kind)
  if (f.solve_id) q.set('solve_id', String(f.solve_id))
  q.set('limit', String(f.limit ?? 0))
  return request(`/api/analyses?${q}`)
}

export function getAnalysis(id: number): Promise<Analysis> {
  return request(`/api/analyses/${id}`)
}

export function deleteAnalysis(id: number): Promise<void> {
  return request(`/api/analyses/${id}`, { method: 'DELETE' })
}

export type StageCaseRef = { id: string; name: string; moves?: number }

/** F2L ケースごとの集計（フルソルブの各ペアを始めたときのケース）。 */
export type StageF2LCaseStat = StageCaseRef & {
  shape: string
  cross_facing?: string
  count: number
  avg_ms: number
  avg_recognition_ms: number
  avg_moves: number
  /** 標準手順より多く回した手数の平均。 */
  avg_extra: number
  /** 色が合わないまま、またくっついた回数。 */
  rewrong: number
}

/** OLL・PLL の、始めたときのケースごとの集計。 */
export type StageLastLayerStat = StageCaseRef & {
  count: number
  avg_ms: number
  avg_recognition_ms: number
  avg_moves: number
  /** 1つの手順で揃えた回の、標準手順より多く回した手数の平均（AUF 込み）。 */
  avg_extra: number | null
  /** 手順の数の平均（1 なら毎回 1-look）。 */
  avg_steps: number
  /** やり直した回数。 */
  repeated: number
}

export type StageCaseSummary = {
  cross_color: string
  solve_ids: number[]
  summary: {
    pairs: number
    f2l_cases: StageF2LCaseStat[]
    oll: StageLastLayerStat[]
    pll: StageLastLayerStat[]
  }
}

/** フルソルブを再生して求めた、段階ごとのケースの集計（ソルブごとの判定は省く）。 */
export function getStageCaseSummary(f: { mode?: SolveMode; from?: string; to?: string; limit?: number }): Promise<StageCaseSummary> {
  const q = new URLSearchParams({ view: 'summary' })
  if (f.mode) q.set('mode', f.mode)
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  if (f.limit !== undefined) q.set('limit', String(f.limit))
  return request(`/api/stage-cases?${q}`)
}

/** F2L の1ペア（1段階）の判定。 */
export type StagePair = {
  stage: string
  /** スロットの2色（例 緑・赤）。 */
  slot: string
  case: StageCaseRef | null
  shape: string
  ms: number
  recognition_ms: number
  moves: number
  rewrong: boolean
}

/** OLL か PLL の段階の判定。steps は手順の切れ目ごとのケース（最初が始めたとき）。 */
export type StageLastLayer = {
  stage: string
  ms: number
  recognition_ms: number
  moves: number
  steps: StageCaseRef[]
  repeated: boolean
}

export type StageSolve = {
  id: number
  pairs: StagePair[]
  oll?: StageLastLayer
  pll?: StageLastLayer
}

/** 1回のソルブの、段階ごとのケースの判定。 */
export async function getSolveStageCases(id: number): Promise<StageSolve | undefined> {
  const r: { solves: StageSolve[] } = await request(`/api/stage-cases?ids=${id}`)
  return r.solves[0]
}
