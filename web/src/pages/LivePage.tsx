import { useState } from 'react'
import { CubeView } from '../components/CubeView'
import { FitLayout } from '../components/FitLayout'
import { ScrambleDisplay } from '../components/ScrambleDisplay'
import { StageRibbon } from '../components/StageRibbon'
import { TimerDisplay } from '../components/TimerDisplay'
import { CubeStoreContext } from '../cube/context'
import { useCubeStore } from '../cube/hooks'
import { CubeStore } from '../cube/store'
import { useScreenWakeLock } from '../cube/wake-lock'
import { useLiveFeed } from '../live/hooks'

/**
 * 中継：キューブをつないだブラウザ（メイン）のタイマー画面を映す。見るだけで、記録も操作もしない。
 * この端末のキューブ（右上の「接続」）とは別のストアに映すので、ここでキューブをつないでも混ざらない。
 */
export function LivePage() {
  const { kpuzzle } = useCubeStore()
  const [store] = useState(() => new CubeStore(kpuzzle))
  const view = useLiveFeed(store)
  const { session } = view
  const watching = view.online && view.cube === 'connected'
  useScreenWakeLock(watching)

  let notice: string | null = null
  if (view.stream !== 'open')
    notice =
      view.stream === 'connecting' ? 'サーバーにつないでいます…' : 'サーバーとの接続が切れました。つなぎ直しています…'
  else if (!view.online) notice = 'メインがいません。キューブをつないだブラウザでタイマー画面を開くと、ここに映ります'
  else if (view.cube !== 'connected') notice = 'メインのキューブがつながっていません'

  return (
    <CubeStoreContext.Provider value={store}>
      <FitLayout
        className="timer-page live-page"
        main={
          <>
            <p className={`live-status small ${watching ? 'live-status--on' : 'muted'}`} aria-live="polite">
              {notice ?? 'メインのタイマー画面を映しています'}
            </p>
            {session && (
              <>
                <ScrambleDisplay state={session} />
                <TimerDisplay state={session} lastMoveCount={view.lastMoveCount} />
                {session.phase !== 'running' && session.last && (
                  <StageRibbon key={session.last.solved_at} splits={session.last.splits} />
                )}
              </>
            )}
          </>
        }
        cube={<CubeView />}
      />
    </CubeStoreContext.Provider>
  )
}
