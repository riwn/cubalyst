import { useEffect, useRef, type ReactNode } from 'react'

/** モーダルダイアログ（<dialog> 要素）。Esc / 背景クリックで onClose。 */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <h3>{title}</h3>
      {children}
    </dialog>
  )
}

/** 確認ダイアログ。danger なら確定ボタンを赤にする。 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className="dialog-body">{message}</div>
      <div className="row dialog-actions">
        <button onClick={onCancel}>キャンセル</button>
        <button className={danger ? 'danger-solid' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
