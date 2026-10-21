import type { KPattern } from 'cubing/kpuzzle'
import { TwistyPlayer } from 'cubing/twisty'
import { useEffect, useRef } from 'react'
import { useCubeStore } from '../cube/hooks'
import { convertMove, type Frame } from '../cube/orientation'

/** アニメーション用に積み上げる手数の上限。超えたら現在状態で置き換えてリセットする。 */
const MAX_QUEUED_MOVES = 100

/**
 * 実機（またはモック）の状態に同期する3Dキューブ。
 * hold を渡すと、持ち方の向き（下の色が下・前の色が前）で表示する。省略時はキューブ自身の向き（白上・緑前）。
 */
export function CubeView({ hold }: { hold?: { rotation: string; frame: Frame } } = {}) {
  const store = useCubeStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const player = new TwistyPlayer({
      puzzle: '3x3x3',
      alg: '',
      background: 'none',
      controlPanel: 'none',
      hintFacelets: 'none',
      tempoScale: 4,
    })
    player.style.width = '100%'
    player.style.height = '100%'
    container.appendChild(player)

    let queued = 0
    const replace = (pattern: KPattern) => {
      player.alg = ''
      const shown = hold?.rotation ? pattern.applyAlg(hold.rotation) : pattern
      player.experimentalModel.setupTransformation.set(shown.experimentalToTransformation())
      queued = 0
    }
    replace(store.getSnapshot().pattern)

    const unsubscribe = store.view.subscribe((update) => {
      if (update.type === 'replace') {
        replace(update.pattern)
      } else if (queued >= MAX_QUEUED_MOVES) {
        // ストアの状態はこの手を適用済み
        replace(store.getSnapshot().pattern)
      } else {
        player.experimentalAddMove(hold ? convertMove(hold.frame, update.move) : update.move)
        queued++
      }
    })
    return () => {
      unsubscribe()
      player.remove()
    }
  }, [store, hold])

  return <div className="cube-view" ref={ref} />
}
