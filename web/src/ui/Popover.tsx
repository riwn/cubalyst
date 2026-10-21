import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * ボタンで開閉するポップオーバー。外側のクリックと Esc で閉じる。
 * trigger は開閉ボタンの中身、children は開いたときの中身（閉じる関数を受け取れる）。
 */
export function Popover({
  trigger,
  title,
  className = '',
  buttonClassName = '',
  align = 'right',
  children,
}: {
  trigger: ReactNode
  title?: string
  className?: string
  buttonClassName?: string
  align?: 'left' | 'right'
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`popover ${className}`} ref={ref}>
      <button
        className={buttonClassName}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        title={title}
      >
        {trigger}
      </button>
      {open && <div className={`popover-panel popover-panel--${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'separator'

/** 「⋯」メニュー。危険な操作は danger で赤字にする。 */
export function KebabMenu({ items, title = 'その他の操作' }: { items: MenuItem[]; title?: string }) {
  return (
    <Popover trigger="⋯" title={title} buttonClassName="kebab" className="kebab-menu">
      {(close) => (
        <ul className="menu" role="menu">
          {items.map((item, i) =>
            item === 'separator' ? (
              <li key={i} className="menu-separator" role="separator" />
            ) : (
              <li key={i}>
                <button
                  role="menuitem"
                  className={item.danger ? 'menu-item danger' : 'menu-item'}
                  disabled={item.disabled}
                  onClick={() => {
                    close()
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Popover>
  )
}
