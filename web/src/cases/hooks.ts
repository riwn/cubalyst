import { useEffect, useState, useSyncExternalStore } from 'react'
import type { CubeStore } from '../cube/store'
import { AlgDrill, type DrillState } from './drill'
import { CaseSetup, type CaseSetupState } from './setup'

/** 手順練習の判定を作る。手順や持ち方が変わると作り直す。 */
export function useAlgDrill(store: CubeStore, alg: string, rotation: string): AlgDrill | null {
  const [drill, setDrill] = useState<AlgDrill | null>(null)
  useEffect(() => {
    // ストアを購読する外部オブジェクトなので、作成と破棄をエフェクトで行い、できたものを state に置く
    const d = new AlgDrill(store, alg, rotation)
    // eslint-disable-next-line react/set-state-in-effect
    setDrill(d)
    return () => d.dispose()
  }, [store, alg, rotation])
  return drill
}

const IDLE: DrillState = { moveCount: 0, startedAt: null }
const noop = () => () => {}

export function useDrillState(drill: AlgDrill | null): DrillState {
  return useSyncExternalStore(drill ? drill.subscribe : noop, drill ? drill.getSnapshot : () => IDLE)
}

/** 「この形にする」の追跡。active の間だけ作る。 */
export function useCaseSetup(store: CubeStore, alg: string, rotation: string, active: boolean): CaseSetup | null {
  const [setup, setSetup] = useState<CaseSetup | null>(null)
  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react/set-state-in-effect
      setSetup(null)
      return
    }
    const s = new CaseSetup(store, alg, rotation)
    setSetup(s)
    return () => s.dispose()
  }, [store, alg, rotation, active])
  return setup
}

const none = () => null

export function useCaseSetupState(setup: CaseSetup | null): CaseSetupState | null {
  return useSyncExternalStore(setup ? setup.subscribe : noop, setup ? setup.getSnapshot : none)
}
