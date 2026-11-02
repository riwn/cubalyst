import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { NewSolve } from '../api'
import { useCubeStore } from '../cube/hooks'
import type { CubeStore } from '../cube/store'
import { useSettings } from '../settings/hooks'
import { withSplits, type Split } from '../solve/cfop'
import type { SolveSession } from '../solve/session'
import { LiveFeed, type LiveView } from './feed'
import { startLivePublish } from './publisher'

/** on の間、タイマー画面の状態を中継のサーバーへ送る（キューブがつながっている間だけ送る）。 */
export function useLivePublish(session: SolveSession | null, on: boolean) {
  const store = useCubeStore()
  const { settings } = useSettings()
  const crossColor = useRef(settings.cross_color)
  useEffect(() => {
    crossColor.current = settings.cross_color
  })
  useEffect(() => {
    if (!session || !on) return
    const cache = new WeakMap<NewSolve, Split[] | undefined>()
    return startLivePublish(store, session, (last) => {
      if (!cache.has(last)) cache.set(last, withSplits(store.kpuzzle, last, crossColor.current).splits)
      return cache.get(last)
    })
  }, [store, session, on])
}

/** 中継を受け取り、store（見る側だけのキューブのストア）に映す。 */
export function useLiveFeed(store: CubeStore): LiveView {
  const [feed] = useState(() => new LiveFeed(store))
  useEffect(() => {
    feed.start()
    return () => feed.stop()
  }, [feed])
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot)
}
