import { useContext, useSyncExternalStore } from 'react'
import { CubeStoreContext } from './context'
import type { CubeState, CubeStore } from './store'

export function useCubeStore(): CubeStore {
  const store = useContext(CubeStoreContext)
  if (!store) throw new Error('useCubeStore must be used inside CubeStoreProvider')
  return store
}

export function useCubeState(): CubeState {
  const store = useCubeStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
