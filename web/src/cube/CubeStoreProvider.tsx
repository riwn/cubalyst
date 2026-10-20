import { useEffect, useState, type ReactNode } from 'react'
import { CubeStoreContext } from './context'
import { getCubeStore, type CubeStore } from './store'

/** キューブストアの読み込みを待ってから子を描画する。 */
export function CubeStoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<CubeStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getCubeStore()
      .then(setStore)
      .catch((err: unknown) => setError(String(err)))
  }, [])
  if (error) return <p className="error">キューブの初期化に失敗しました: {error}</p>
  if (!store) return <p className="muted">読み込み中…</p>
  return <CubeStoreContext.Provider value={store}>{children}</CubeStoreContext.Provider>
}
