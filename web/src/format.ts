import type { AnalysisKind, SolveMode } from './api'

export const MODE_LABELS: Record<SolveMode, string> = { full: 'フル', case: '手順', step: 'ステップ', assist: '補助付き' }

/** 完成状態まで解くソルブ（段階の区切りを付け、再生は完成状態から逆算する）。 */
export const isFullSolve = (mode: string) => mode === 'full' || mode === 'assist'

export const KIND_LABELS: Record<AnalysisKind, string> = { solve: '単体', multi: 'まとめ' }

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
