import { useState, type ReactNode } from 'react'

/**
 * 計測する画面の配置。スクロールせずに1画面へ収める。
 * main（スクランブル・タイマー・補助）は上（広い画面では左上）、キューブは残りの高さいっぱいに出す。
 * side（直近の記録など）は広い画面ではキューブの左下、狭い画面ではボタンで下から開く。
 */
export function FitLayout({
  className = '',
  main,
  cube,
  side,
  sideLabel = '記録',
}: {
  className?: string
  main: ReactNode
  cube: ReactNode
  side?: ReactNode
  sideLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`fit-screen fit-layout ${open ? 'fit-layout--side-open' : ''} ${className}`}>
      <div className="fit-main">{main}</div>
      <div className="fit-cube">{cube}</div>
      {side && (
        <>
          <button className="fit-side-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {sideLabel} {open ? '▼' : '▲'}
          </button>
          <aside className="fit-side">{side}</aside>
        </>
      )}
    </div>
  )
}
