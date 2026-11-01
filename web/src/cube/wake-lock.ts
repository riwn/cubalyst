import { useEffect } from 'react'

/**
 * on の間、画面が自動で消えないようにする（Screen Wake Lock）。
 * タブを裏に回すとブラウザが解除するので、表に戻ったときに取り直す。対応していないブラウザでは何もしない。
 */
export function useScreenWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const l = await navigator.wakeLock.request('screen')
        if (stopped) void l.release()
        else lock = l
      } catch {
        // 省電力モードなどで断られても、画面が消えるだけなので気にしない
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [on])
}
