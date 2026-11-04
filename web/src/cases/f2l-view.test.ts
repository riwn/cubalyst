import { describe, expect, it } from 'vitest'
import { f2lGrayStickers } from './f2l-view'

describe('f2lGrayStickers', () => {
  it('FR のペアだけ色を残し、上段と FR スロットのほかのパーツを灰色にする', () => {
    // F2L 1（F' U' F）：角は URF、エッジは UL にある
    const gray = f2lGrayStickers('RUURUUUUFRBBURRURRFFDFFRFFRDDBDDDDDDFFLLLLLLLLLUBBBBBB')
    for (const i of [8, 9, 20, 3, 37]) expect(gray.has(i)).toBe(false)
    for (const i of [6, 18, 38, 0, 36, 47, 7, 19, 29, 26, 15, 23, 12]) expect(gray.has(i)).toBe(true)
    // 下の2段のほかの場所（センターや FL スロット）は色のまま
    for (const i of [4, 22, 13, 21, 24]) expect(gray.has(i)).toBe(false)
  })
})
