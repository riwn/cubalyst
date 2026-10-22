import { useState } from 'react'
import { AlgDrillPage } from './AlgDrillPage'
import { AssistPractice } from './AssistPractice'
import { StepPractice } from './StepPractice'

type Mode = 'assist' | 'case' | 'step'

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'assist', label: '補助付きフルソルブ' },
  { mode: 'case', label: '手順練習' },
  { mode: 'step', label: 'ステップ練習' },
]

/** 練習：モード選択（補助付きフルソルブ / 手順 / ステップ）。補助なしのフルソルブは上の「タイマー」。 */
export function PracticePage() {
  const [mode, setMode] = useState<Mode>('case')
  return (
    <div className="practice-page">
      <div className="row mode-tabs">
        {MODES.map((m) => (
          <button key={m.mode} className={mode === m.mode ? 'on-accent' : ''} onClick={() => setMode(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'assist' && <AssistPractice />}
      {mode === 'case' && <AlgDrillPage />}
      {mode === 'step' && <StepPractice />}
    </div>
  )
}
