// 画面ごとの表示設定（この端末のブラウザにだけ保存する）。
import { useSyncExternalStore } from 'react'

const KEY = 'cubalyst.debug'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let debug = read()

export function setDebug(on: boolean) {
  debug = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // 保存できなくても表示は切り替える
  }
  listeners.forEach((l) => l())
}

/** デバッグ表示（回転ログ・facelets・モック接続など）を出すか。 */
export function useDebug(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => debug,
  )
}
