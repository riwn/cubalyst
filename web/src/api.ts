// Goサーバー（/api）へのクライアント。

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

export type SolveMode = 'full' | 'case' | 'step'

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
}

export type NewSolve = Omit<Solve, 'id'>

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
  order?: 'asc' | 'desc'
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
  if (f.includeMoves) q.set('include', 'moves')
  if (f.order) q.set('order', f.order)
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
