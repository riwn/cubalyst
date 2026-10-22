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

const NAV_KEY = 'cubalyst.navCollapsed'
const navListeners = new Set<() => void>()
let navCollapsed = (() => {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
})()

export function setNavCollapsed(on: boolean) {
  navCollapsed = on
  try {
    localStorage.setItem(NAV_KEY, on ? '1' : '0')
  } catch {
    // 保存できなくても表示は切り替える
  }
  navListeners.forEach((l) => l())
}

/** 左のメニューをアイコンだけに畳むか（広い画面のとき）。 */
export function useNavCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      navListeners.add(l)
      return () => navListeners.delete(l)
    },
    () => navCollapsed,
  )
}
