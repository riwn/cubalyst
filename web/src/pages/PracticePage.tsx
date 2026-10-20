import { useState } from 'react'
import { Link } from 'react-router'
import { CasePractice } from './CasePractice'

type Mode = 'case' | 'step'

/** 練習：モード選択（フル / ケース / ステップ）。 */
export function PracticePage() {
  const [mode, setMode] = useState<Mode>('case')
  return (
    <div className="practice-page">
      <div className="row mode-tabs">
        <Link className="button" to="/">
          フルソルブ（タイマー）
        </Link>
        <button className={mode === 'case' ? 'on-accent' : ''} onClick={() => setMode('case')}>
          ケース練習
        </button>
        <button className={mode === 'step' ? 'on-accent' : ''} onClick={() => setMode('step')}>
          ステップ練習
        </button>
      </div>
      {mode === 'case' && <CasePractice />}
      {mode === 'step' && <p className="muted">ステップ練習は次のフェーズで実装します。</p>}
    </div>
  )
}
