import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
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
import { setNavCollapsed, useNavCollapsed } from './ui/prefs'

/** 左のメニュー。match に当てはまるパスでも選択中にする（解析は統計・履歴・解析の3つのタブをまとめる）。 */
const NAV: { to: string; label: string; icon: ReactNode; end?: boolean; match?: RegExp }[] = [
  {
    to: '/',
    label: 'タイマー',
    end: true,
    icon: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9.5 2h5M12 2v3" />
      </>
    ),
  },
  {
    to: '/practice',
    label: '練習',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.2" />
      </>
    ),
  },
  {
    to: '/stats',
    label: '解析',
    match: /^\/(stats|history|analyses)(\/|$)/,
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
]

/** 左のメニューを重ねて開く（畳めない）画面幅。CSS の @media と合わせる。 */
const NARROW = '(max-width: 800px)'

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
  const collapsed = useNavCollapsed()
  // 狭い画面で、重ねて開いているか
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  const toggleNav = () => {
    if (window.matchMedia(NARROW).matches) setDrawer(!drawer)
    else setNavCollapsed(!collapsed)
  }

  return (
    <SettingsProvider>
      <CubeStoreProvider>
        <div className={`app ${collapsed ? 'app--nav-collapsed' : ''} ${drawer ? 'app--drawer' : ''}`}>
          <header className="app-header" ref={headerRef}>
            <button className="icon-button nav-toggle" onClick={toggleNav} title="メニュー" aria-label="メニュー">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <h1>
              <Link to="/">Cubalyst</Link>
            </h1>
            <div className="header-right">
              <CubeConnectionControl />
              <SystemMenu />
            </div>
          </header>
          <nav className="side-nav" aria-label="メニュー">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={n.label}
                onClick={() => setDrawer(false)}
                className={({ isActive }) => (isActive || n.match?.test(pathname) ? 'active' : '')}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {n.icon}
                </svg>
                <span className="side-nav-label">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          {drawer && <div className="nav-backdrop" onClick={() => setDrawer(false)} />}
          <main className="app-main">
            <CubeNotices />
            <Routes>
              <Route path="/" element={<TimerPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/analyses" element={<AnalysesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
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
