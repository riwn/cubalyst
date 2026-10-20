import type { ReactNode } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { HealthStatus } from './HealthStatus'
import { CubeStoreProvider } from './cube/CubeStoreProvider'
import { TimerPage } from './pages/TimerPage'

const pages: { path: string; label: string; end?: boolean; element?: ReactNode }[] = [
  { path: '/', label: 'タイマー', end: true, element: <TimerPage /> },
  { path: '/practice', label: '練習' },
  { path: '/history', label: '履歴' },
  { path: '/stats', label: '統計' },
  { path: '/settings', label: '設定' },
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
        <HealthStatus />
      </header>
      <main>
        <CubeStoreProvider>
          <Routes>
            {pages.map((p) => (
              <Route key={p.path} path={p.path} element={p.element ?? <Placeholder title={p.label} />} />
            ))}
            <Route path="*" element={<Placeholder title="ページが見つかりません" />} />
          </Routes>
        </CubeStoreProvider>
      </main>
    </div>
  )
}
