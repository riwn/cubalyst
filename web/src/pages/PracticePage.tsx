import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlgDrillPage } from './AlgDrillPage'
import { AssistPractice } from './AssistPractice'
import { StepPractice } from './StepPractice'

type Mode = 'assist' | 'case' | 'step'

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'assist', label: '補助付きフルソルブ' },
  { mode: 'case', label: '手順練習' },
  { mode: 'step', label: 'ステップ練習' },
]

/**
 * 練習：モード選択（補助付きフルソルブ / 手順 / ステップ）。補助なしのフルソルブは上の「タイマー」。
 * ?case=ケースID なら、手順練習でそのケースを選んだ状態で開く（統計のケース別から来る）。
 */
export function PracticePage() {
  const [params] = useSearchParams()
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
      {mode === 'case' && <AlgDrillPage initialCaseId={params.get('case')} />}
      {mode === 'step' && <StepPractice />}
    </div>
  )
}
