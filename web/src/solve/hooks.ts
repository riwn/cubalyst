import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createSolve, listSolves, type NewSolve, type Solve, type SolveFilter } from '../api'
import { useCubeStore } from '../cube/hooks'
import { SolveSession, type ExerciseSource, type SessionState } from './session'

/**
 * 計測セッションを作って開始する。source が変わるとセッションを作り直す。
 * onSolved は最新の関数が呼ばれる。
 */
export function useSolveSession(
  source: ExerciseSource,
  onSolved: (solve: NewSolve) => void,
  opts: { inspection?: boolean } = {},
) {
  const store = useCubeStore()
  const onSolvedRef = useRef(onSolved)
  useEffect(() => {
    onSolvedRef.current = onSolved
  })
  const [session, setSession] = useState<SolveSession | null>(null)
  useEffect(() => {
    const s = new SolveSession(store, source, (solve) => onSolvedRef.current(solve))
    setSession(s)
    void s.next()
    return () => s.dispose()
  }, [store, source])
  const inspection = opts.inspection ?? false
  useEffect(() => {
    session?.setInspection(inspection)
  }, [session, inspection])
  return session
}

const emptySubscribe = () => () => {}

export function useSessionState(session: SolveSession | null): SessionState | null {
  return useSyncExternalStore(
    session ? session.subscribe : emptySubscribe,
    session ? session.getSnapshot : () => null,
  )
}

/** 直近のソルブ一覧。reload で取り直す。 */
export function useSolveList(filter: SolveFilter) {
  const [solves, setSolves] = useState<Solve[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const key = JSON.stringify(filter)

  useEffect(() => {
    let cancelled = false
    listSolves(JSON.parse(key) as SolveFilter)
      .then((res) => {
        if (cancelled) return
        setSolves(res.solves)
        setTotal(res.total)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { solves, total, error, reload }
}

/** ソルブを保存し、保存後に onSaved を呼ぶ関数を返す。 */
export function useSaveSolve(onSaved: (solve: Solve) => void) {
  const [error, setError] = useState<string | null>(null)
  const save = useCallback(
    async (s: NewSolve) => {
      try {
        const created = await createSolve(s)
        setError(null)
        onSaved(created)
      } catch (err) {
        setError(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [onSaved],
  )
  return { save, error }
}
