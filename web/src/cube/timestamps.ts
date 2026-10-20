// キューブ時計のズレ補正。
//
// キューブ内部時計は精度が低くPC時計とズレるため、両方の時刻で記録しておき、
// 線形回帰でキューブ時刻をPC時刻のスケールに合わせる（csTimer由来の手法）。

import { cubeTimestampLinearFit } from 'smartcube-web-bluetooth'
import type { CubeMove } from './connection'

export type FittedMove = CubeMove & {
  /** 補正後のタイムスタンプ（最初の手を0とした相対ms）。 */
  fittedTimestamp: number
}

/**
 * 回転ログに補正後タイムスタンプを付ける。
 * キューブ時刻があればライブラリの線形回帰を使い（欠けた手は前後から補間される）、なければPC時刻で代用する。
 */
export function fitTimestamps(moves: CubeMove[]): FittedMove[] {
  if (moves.length === 0) return []
  const hasCube = moves.some((m) => m.cubeTimestamp != null)
  if (hasCube && moves.length >= 2) {
    const fitted = cubeTimestampLinearFit(
      moves.map((m) => ({
        face: 0,
        direction: 0,
        move: m.move,
        localTimestamp: m.localTimestamp,
        cubeTimestamp: m.cubeTimestamp,
      })),
    )
    return moves.map((m, i) => ({ ...m, fittedTimestamp: fitted[i].cubeTimestamp ?? 0 }))
  }
  const base = moves[0].localTimestamp ?? 0
  return moves.map((m) => ({ ...m, fittedTimestamp: (m.localTimestamp ?? base) - base }))
}
