import { useEffect, useState, type RefObject } from 'react'
import { copyScreenshot, SKIP_ATTR } from '../ui/screenshot'

type Status = 'idle' | 'busy' | 'copied' | 'downloaded' | 'error'

const LABEL: Record<Status, string> = {
  idle: '画面をクリップボードにコピー',
  busy: '画像にしています…',
  copied: 'コピーしました',
  downloaded: 'クリップボードに入れられないので、ダウンロードしました',
  error: '画像にできませんでした',
}

/** target の画面を画像にしてクリップボードへ入れるボタン。ボタン自身は画像に入らない。 */
export function ScreenshotButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (status === 'idle' || status === 'busy') return
    const t = setTimeout(() => setStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [status])

  return (
    <button
      {...{ [SKIP_ATTR]: '' }}
      className="icon-button screenshot-button"
      title={LABEL[status]}
      aria-label={LABEL[status]}
      disabled={status === 'busy'}
      onClick={(e) => {
        // Space の手動タイマーがボタンを押し直さないよう、フォーカスを外す
        e.currentTarget.blur()
        const el = target.current
        if (!el) return
        setStatus('busy')
        copyScreenshot(el).then(setStatus, () => setStatus('error'))
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {status === 'copied' || status === 'downloaded' ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </>
        )}
      </svg>
    </button>
  )
}
