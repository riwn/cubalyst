import type { ReactNode } from 'react'
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

export default function App() {
  return (
    <SettingsProvider>
      <CubeStoreProvider>
        <div className="app">
          <header className="app-header">
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
