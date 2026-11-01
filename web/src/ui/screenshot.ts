// 画面の一部を画像にして、クリップボードへ入れる（入れられないブラウザではダウンロードする）。
import type { TwistyPlayer } from 'cubing/twisty'
import { domToCanvas } from 'modern-screenshot'

/** この属性を付けた要素（撮るボタンなど）は画像に入れない。 */
export const SKIP_ATTR = 'data-screenshot-skip'

/** el を見えている通りに PNG にする。3D キューブ（WebGL）は DOM からは写らないので、cubing に描かせて同じ位置に重ねる。 */
export async function captureElement(el: HTMLElement): Promise<Blob> {
  const scale = window.devicePixelRatio || 1
  const players = [...el.querySelectorAll<TwistyPlayer>('twisty-player')]
  const canvas = await domToCanvas(el, {
    scale,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (node) => !(node instanceof Element && (node.hasAttribute(SKIP_ATTR) || node.localName === 'twisty-player')),
  })
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const origin = el.getBoundingClientRect()
    for (const player of players) {
      const r = player.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // cubing の screenshot は縦の画角が固定で、縦長の枠だと左右が切れる。短い辺の正方形で描いて真ん中に置く
      const side = Math.min(r.width, r.height)
      const url = await player.experimentalScreenshot({ width: Math.round(side * scale), height: Math.round(side * scale) })
      const img = new Image()
      img.src = url
      await img.decode()
      const x = r.left - origin.left + (r.width - side) / 2
      const y = r.top - origin.top + (r.height - side) / 2
      ctx.drawImage(img, x * scale, y * scale, side * scale, side * scale)
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像にできませんでした'))), 'image/png'),
  )
}

/**
 * el の画像をクリップボードへ入れる。copied＝クリップボードへ入れた、downloaded＝入れられないのでファイルにした。
 * Safari はクリック中に clipboard.write を呼ぶ必要があるので、画像の Promise のまま渡す。
 */
export async function copyScreenshot(el: HTMLElement): Promise<'copied' | 'downloaded'> {
  const blob = captureElement(el)
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return 'copied'
    } catch {
      // 権限がないなど。下でダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(await blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cubalyst-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
