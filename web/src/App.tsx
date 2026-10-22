import { useCallback, useRef, type ReactNode } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { SystemMenu } from './HealthStatus'
import { CubeConnectionControl, CubeNotices } from './components/ConnectionPanel'
import { CubeStoreProvider } from './cube/CubeStoreProvider'
import { AnalysesPage, AnalysisDetailPage } from './pages/AnalysesPage'
import { HistoryPage } from './pages/HistoryPage'
import { PracticePage } from './pages/PracticePage'
import { SettingsPage } from './pages/SettingsPage'
import { SolveDetailPage } from './pages/SolveDetailPage'
import { StatsPage } from './pages/StatsPage'
import { TimerPage } from './pages/TimerPage'
import { SettingsProvider } from './settings/SettingsProvider'

const pages: { path: string; label: string; end?: boolean; element?: ReactNode }[] = [
  { path: '/', label: 'タイマー', end: true, element: <TimerPage /> },
  { path: '/practice', label: '練習', element: <PracticePage /> },
  { path: '/history', label: '履歴', element: <HistoryPage /> },
  { path: '/stats', label: '統計', element: <StatsPage /> },
  { path: '/analyses', label: '解析', element: <AnalysesPage /> },
  { path: '/settings', label: '設定', element: <SettingsPage /> },
]

function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="muted">この画面は今後のフェーズで実装します。</p>
    </section>
  )
}

/**
 * ヘッダーの高さを CSS 変数 --header-h に入れる（固定ヘッダーの下に貼り付く要素の位置に使う）。
 * 設定の読み込みが終わるまでヘッダーは描かれないので、要素が付いたときに監視を始める。
 */
function useHeaderHeight() {
  const observer = useRef<ResizeObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const update = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    update()
    observer.current = new ResizeObserver(update)
    observer.current.observe(el)
  }, [])
}

export default function App() {
  const headerRef = useHeaderHeight()
  return (
    <SettingsProvider>
      <CubeStoreProvider>
        <div className="app">
          <header className="app-header" ref={headerRef}>
            <h1>Cubalyst</h1>
            <nav>
              {pages.map((p) => (
                <NavLink key={p.path} to={p.path} end={p.end}>
                  {p.label}
                </NavLink>
              ))}
            </nav>
            <div className="header-right">
              <CubeConnectionControl />
              <SystemMenu />
            </div>
          </header>
          <CubeNotices />
          <main>
            <Routes>
              {pages.map((p) => (
                <Route key={p.path} path={p.path} element={p.element ?? <Placeholder title={p.label} />} />
              ))}
              <Route path="/history/:id" element={<SolveDetailPage />} />
              <Route path="/analyses/:id" element={<AnalysisDetailPage />} />
              <Route path="*" element={<Placeholder title="ページが見つかりません" />} />
            </Routes>
          </main>
        </div>
      </CubeStoreProvider>
    </SettingsProvider>
  )
}
