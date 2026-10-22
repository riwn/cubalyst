import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { listCases, type CaseInfo, type NewSolve, type Solve } from '../api'
import { PracticeRunner } from '../components/PracticeRunner'
import { useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { STAGE_LABELS } from '../solve/cfop'
import { useSolveList } from '../solve/hooks'
import { averageOf, best, effectiveTime, formatTime } from '../solve/stats'
import {
  learnedExerciseSource,
  SET_STEP,
  STEP_LABELS,
  STEPS,
  stepExerciseSource,
  stepSplits,
  type Step,
} from '../steps/exercise'

const LEARNED_ONLY_KEY = 'cubalyst.stepLearnedOnly'

function loadLearnedOnly(): boolean {
  try {
    return localStorage.getItem(LEARNED_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * ステップ練習：段階の直前状態から、その段階だけを計測する。
 * 「覚えた手順だけ」にすると、手順練習で覚えたと印を付けたケースの状態だけを出す（Cross は対象外）。
 */
export function StepPractice() {
  const store = useCubeStore()
  const { settings } = useSettings()
  const [step, setStep] = useState<Step | 'random'>('random')
  const [learnedOnly, setLearnedOnly] = useState(loadLearnedOnly)
  const [cases, setCases] = useState<CaseInfo[] | null>(null)
  const [last, setLast] = useState<Solve | null>(null)
  const history = useSolveList({ mode: 'step', limit: 0, includeSplits: true })
  const { reload } = history

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch(() => setCases([]))
  }, [])
  const learned = useMemo(() => (cases ?? []).filter((c) => c.learned), [cases])
  const learnedCount = (s: Step) => learned.filter((c) => SET_STEP[c.set] === s).length
  const caseName = (id: string | null) => cases?.find((c) => c.id === id)?.name

  const changeLearnedOnly = (on: boolean) => {
    setLearnedOnly(on)
    if (on && step === 'cross') setStep('random')
    try {
      localStorage.setItem(LEARNED_ONLY_KEY, on ? '1' : '0')
    } catch {
      // 保存できなくても練習はできる
    }
  }

  const target = step === 'random' ? undefined : step
  const noLearned = learnedOnly && cases != null && (target ? learnedCount(target) : learned.length) === 0
  const source = useMemo(
    () =>
      learnedOnly && target !== 'cross'
        ? learnedExerciseSource(store.kpuzzle, target, settings.cross_color, learned)
        : stepExerciseSource(store.kpuzzle, target, settings.cross_color),
    [store.kpuzzle, target, settings.cross_color, learnedOnly, learned],
  )
  const prepare = useCallback(
    (s: NewSolve): NewSolve =>
      s.moves?.length && s.step
        ? { ...s, splits: stepSplits(store.kpuzzle, s.step as Step, s.scramble, s.moves, settings.cross_color) }
        : s,
    [store.kpuzzle, settings.cross_color],
  )
  const onSaved = useCallback(
    (s: Solve) => {
      setLast(s)
      reload()
    },
    [reload],
  )

  const stats = useMemo(() => {
    const out = new Map<string, { count: number; times: (number | null)[] }>()
    for (const s of history.solves) {
      if (!s.step) continue
      const cur = out.get(s.step) ?? { count: 0, times: [] }
      cur.count++
      cur.times.push(effectiveTime(s.total_ms, s.penalty))
      out.set(s.step, cur)
    }
    return out
  }, [history.solves])

  return (
    <div className="step-practice">
      <section className="panel row">
        <span>ステップ</span>
        {(['random', ...STEPS] as const).map((s) => (
          <button
            key={s}
            className={step === s ? 'on-accent' : ''}
            onClick={() => setStep(s)}
            disabled={learnedOnly && s === 'cross'}
            title={learnedOnly && s === 'cross' ? 'Cross には覚えた手順がありません' : undefined}
          >
            {s === 'random' ? 'ランダム' : STEP_LABELS[s]}
            {learnedOnly && s !== 'random' && s !== 'cross' && <span className="muted small">（{learnedCount(s)}）</span>}
          </button>
        ))}
        <span className="spacer" />
        <label className="learned-toggle">
          <input type="checkbox" checked={learnedOnly} onChange={(e) => changeLearnedOnly(e.target.checked)} /> 覚えた手順だけ
        </label>
      </section>
      {learnedOnly && cases == null ? (
        <p className="muted">読み込み中…</p>
      ) : noLearned ? (
        <section className="panel">
          <p>
            {target ? `${STEP_LABELS[target]}の` : ''}覚えた手順がまだありません。<Link to="/practice">手順練習</Link>
            でケースを選び、「覚えた」に印を付けてください。
          </p>
        </section>
      ) : (
        <PracticeRunner
          source={source}
          prepare={prepare}
          onSaved={onSaved}
          side={
            <>
              {last && (
                <section className="panel">
                  <div className="muted small">直前の記録</div>
                  <strong>
                    {STEP_LABELS[last.step as Step]}
                    {last.case_id && `（${caseName(last.case_id) ?? last.case_id}）`}{' '}
                    {formatTime(effectiveTime(last.total_ms, last.penalty), 3)}
                  </strong>{' '}
                  <Link to={`/history/${last.id}`} className="small">
                    詳細
                  </Link>
                  {last.splits && last.splits.length > 1 && (
                    <div className="small muted">
                      {last.splits.map((sp) => `${STAGE_LABELS[sp.stage]} ${formatTime(sp.end_ms - sp.start_ms, 2)}`).join(' / ')}
                    </div>
                  )}
                </section>
              )}
              <section className="panel">
                <table className="splits-table">
                  <thead>
                    <tr>
                      <th className="left">ステップ</th>
                      <th>回数</th>
                      <th>平均</th>
                      <th>ao5</th>
                      <th>ベスト</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STEPS.map((s) => {
                      const st = stats.get(s)
                      const valid = st?.times.filter((t): t is number => t != null) ?? []
                      const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined
                      return (
                        <tr key={s}>
                          <th className="left">{STEP_LABELS[s]}</th>
                          <td>{st?.count ?? 0}</td>
                          <td>{formatTime(mean)}</td>
                          <td>{formatTime(st && st.times.length >= 5 ? averageOf(st.times.slice(0, 5)) : undefined)}</td>
                          <td>{formatTime(best(st?.times ?? []))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            </>
          }
        />
      )}
    </div>
  )
}
