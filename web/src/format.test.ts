import { describe, expect, it } from 'vitest'
import { multiTitle } from './format'

describe('multiTitle', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

  it('adds the count when the title does not have it', () => {
    expect(multiTitle({ title: '10/22 の練習', solve_ids: ids(4) })).toBe('10/22 の練習（4件）')
    expect(multiTitle({ title: '', solve_ids: ids(2) })).toBe('まとめ（2件）')
  })

  it('does not repeat the count already in the title', () => {
    expect(multiTitle({ title: '全フルソルブ（9件）', solve_ids: ids(9) })).toBe('全フルソルブ（9件）')
    expect(multiTitle({ title: '10件（10/21〜10/22）', solve_ids: ids(10) })).toBe('10件（10/21〜10/22）')
  })

  it('shows the current count when some solves were deleted', () => {
    expect(multiTitle({ title: '直近10件', solve_ids: ids(9) })).toBe('直近10件（9件）')
  })
})
