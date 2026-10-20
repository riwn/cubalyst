import { describe, expect, it } from 'vitest'
import { animDuration, positionAt, timeAfter, totalDuration } from './timeline'

const times = [0, 50, 400, 1000]

describe('replay timeline', () => {
  it('animDuration is capped by the gap to the next move', () => {
    expect(animDuration(times, 0)).toBe(50)
    expect(animDuration(times, 1)).toBe(100)
    expect(animDuration(times, 3)).toBe(100)
  })

  it('positionAt maps real time to moves and in-move fraction', () => {
    expect(positionAt(times, -10)).toEqual({ done: 0, fraction: 0 })
    expect(positionAt(times, 0)).toEqual({ done: 0, fraction: 0 })
    expect(positionAt(times, 25)).toEqual({ done: 0, fraction: 0.5 })
    expect(positionAt(times, 50)).toEqual({ done: 1, fraction: 0 })
    expect(positionAt(times, 100)).toEqual({ done: 1, fraction: 0.5 })
    // 2手目が終わってから3手目が始まるまでの「間」
    expect(positionAt(times, 300)).toEqual({ done: 2, fraction: 0 })
    expect(positionAt(times, 1100)).toEqual({ done: 4, fraction: 0 })
    expect(positionAt(times, 99999)).toEqual({ done: 4, fraction: 0 })
  })

  it('timeAfter and totalDuration', () => {
    expect(timeAfter(times, 0)).toBe(0)
    expect(timeAfter(times, 1)).toBe(50)
    expect(timeAfter(times, 3)).toBe(500)
    expect(totalDuration(times)).toBe(1100)
    expect(totalDuration([])).toBe(0)
    // timeAfter の時刻ではちょうど n 手完了
    for (let n = 1; n <= times.length; n++) expect(positionAt(times, timeAfter(times, n)).done).toBe(n)
  })
})
