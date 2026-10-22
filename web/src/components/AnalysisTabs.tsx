import { NavLink } from 'react-router'

const TABS = [
  { to: '/stats', label: '統計' },
  { to: '/history', label: '履歴' },
  { to: '/analyses', label: 'Claude の解析' },
]

/** 「解析」の中のタブ（統計・履歴・Claude の解析）。 */
export function AnalysisTabs() {
  return (
    <nav className="row mode-tabs" aria-label="解析の表示">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => `button-link ${isActive ? 'on-accent' : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
