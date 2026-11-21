import type { SlideCanvas } from '../../../../types/src/canvas.ts'
import type { IrBox, Rect, SlideIr } from './ir.ts'
import type { OriginalPicture } from './pictures.ts'
import { clipToSlide, normalize } from './normalize.ts'
import { collectSnapshot } from './walker.ts'

const afterPaint = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
type Browser = Pick<Bun.WebView, 'evaluate' | 'cdp'>

function evaluate<T, Options>(browser: Browser, callback: (options: Options) => T, options: Options): Promise<T> {
  return browser.evaluate<T>(`(${callback.toString()})(${JSON.stringify(options)})`)
}

/** Keep the layout intact while capturing the artwork of a single element. */
function isolate({ id, descendants, attribute, keepColor }: { id: number, descendants: boolean, attribute: string, keepColor: boolean }): boolean {
  let restore: (() => void)[] = []
  const state = window as typeof window & { restorePresentationExport?: () => void }
  state.restorePresentationExport = () => {
    for (const undo of restore.reverse()) undo()
    restore = []
    delete state.restorePresentationExport
  }
  const selector = `[${attribute}="${id}"]`
  function find(root: Element | ShadowRoot): Element | undefined {
    if (root instanceof Element && root.matches(selector)) return root
    const match = root.querySelector(selector)
    if (match) return match
    for (const element of root.querySelectorAll('*')) {
      const nested = element.shadowRoot && find(element.shadowRoot)
      if (nested) return nested
    }
  }

  const active = document.querySelector('#stage > article:not([hidden])')
  const target = active && find(active)
  if (!target) return false
  function style(element: Element, property: string, value: string): void {
    const css = (element as HTMLElement).style
    if (!css) return
    const before = css.getPropertyValue(property)
    const priority = css.getPropertyPriority(property)
    restore.push(() => { css.setProperty(property, before, priority) })
    css.setProperty(property, value, 'important')
  }
  const hide = (element: Element) => style(element, 'opacity', '0')
  if (descendants) {
    for (const child of target.children) hide(child)
    if (!keepColor) style(target, 'color', 'transparent')
  }

  let current: Element = target
  for (;;) {
    const parent = current.parentElement
    const root = current.getRootNode()
    if (parent) {
      for (const sibling of parent.children) {
        if (sibling !== current) hide(sibling)
      }
      style(parent, 'background-color', 'transparent')
      style(parent, 'background-image', 'none')
      current = parent
    }
    else if (root instanceof ShadowRoot) {
      for (const sibling of root.children) {
        if (sibling !== current) hide(sibling)
      }
      current = root.host
    }
    else break
  }
  return true
}

async function picture(browser: Browser, rect: Rect, sourceId: number, hideDescendants: boolean, attribute: string, keepColor = false): Promise<string> {
  try {
    if (!await evaluate(browser, isolate, { id: sourceId, descendants: hideDescendants, attribute, keepColor }))
      throw new Error('Picture element could not be isolated')
    await browser.cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
    await browser.evaluate(afterPaint)
    const raster = await browser.cdp('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
      captureBeyondViewport: false,
    }) as { data: string }
    if (!raster.data) throw new Error('The browser returned no artwork')
    return raster.data
  }
  finally {
    await browser.evaluate('window.restorePresentationExport?.()')
    await browser.cdp('Emulation.setDefaultBackgroundColorOverride', {})
    await browser.evaluate(afterPaint)
  }
}

/** MathML paints the fraction bar in the layout engine, with no DOM box of its own. */
async function fractionRule({ data, rect, sourceId }: { data: string, rect: Rect, sourceId: number }): Promise<IrBox> {
  const response = await fetch(`data:image/png;base64,${data}`)
  const bitmap = await createImageBitmap(await response.blob())
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = context.getImageData(0, 0, width, height).data
  let left = width
  let right = 0
  let top = height
  let bottom = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[4 * (y * width + x) + 3]) continue
      left = Math.min(left, x)
      right = Math.max(right, x + 1)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y + 1)
    }
  }
  if (right - left < Math.max(2, width * 0.75) || bottom - top > height / 3)
    throw new Error('The fraction did not produce a horizontal rule')
  // Use each row's center alpha to retain the thickness of antialiased hairlines.
  const center = Math.floor((left + right) / 2)
  let ink = 0
  let middle = 0
  let strongest = 0
  let color = 0
  for (let y = top; y < bottom; y++) {
    const offset = 4 * (y * width + center)
    const alpha = pixels[offset + 3]
    if (!alpha) throw new Error('The fraction rule was interrupted')
    for (let x = left + 1; x < right - 1; x++) {
      if (Math.abs(pixels[4 * (y * width + x) + 3] - alpha) > 8)
        throw new Error('The fraction rule was not rectangular')
    }
    ink += alpha
    middle += (y + 0.5) * alpha
    if (alpha > strongest) {
      strongest = alpha
      color = offset
    }
  }
  const sx = rect.w / width
  const sy = rect.h / height
  const opacity = strongest > 224 ? 1 : strongest / 255
  const thickness = ink / (255 * opacity)
  return {
    kind: 'box', sourceId,
    rect: { x: rect.x + left * sx, y: rect.y + (middle / ink - thickness / 2) * sy, w: (right - left) * sx, h: thickness * sy },
    fill: { r: pixels[color], g: pixels[color + 1], b: pixels[color + 2], a: opacity },
  }
}

export interface EditableFrame {
  content?: SlideIr
  warnings: string[]
}

export async function captureEditable(browser: Browser, canvas: SlideCanvas, slide: number, click: number, notes: string,
  readOriginal?: (url: string) => Promise<OriginalPicture | undefined>): Promise<EditableFrame> {
  // IDs restart at each frame, including successive reveals of the same slide.
  const attribute = `data-presentation-export-${slide}-${click}`
  const snapshot = await evaluate(browser, collectSnapshot, {
    containerSelector: '#stage > article:not([hidden])',
    idAttribute: attribute,
    slide,
    click,
  })
  const { slides: [content], rasterRequests, unparsedColors } = normalize(snapshot, { notes: new Map([[slide, notes]]) })
  const warnings: string[] = []
  if (!content || content.fallbackReason)
    return { warnings: [content?.fallbackReason ?? 'could not measure slide geometry'] }
  if (unparsedColors.length) warnings.push(`some colors could not be converted (${unparsedColors.slice(0, 4).join(', ')})`)
  if (snapshot.unplaceablePseudos.length) warnings.push('some CSS pseudo-elements could not be placed')

  const requests = new Map(rasterRequests.map(request => [request.sourceId, request]))
  const originalSources = new Set(snapshot.slides[0]?.nodes.filter(node => node.preserveImageSource).map(node => node.id))
  try {
    for (const node of content.nodes) {
      if (node.kind !== 'raster' && node.kind !== 'image') continue
      if (node.kind === 'image' && originalSources.has(node.sourceId)) {
        const original = await readOriginal?.(node.data)
        if (original) {
          node.data = original.data
          node.format = original.format
          continue
        }
      }
      const request = requests.get(node.sourceId)
      const rect = clipToSlide(request?.clip ?? node.rect, { w: canvas.width, h: canvas.height })
      if (!rect) throw new Error('Artwork fell outside the canvas')
      node.data = await picture(browser, rect, request?.isolateId ?? node.sourceId, request?.hideDescendants ?? false, attribute)
      if (node.kind === 'raster' && node.equation?.pictures) {
        try {
          const artwork = []
          for (const decoration of node.equation.pictures) {
            const clip = requests.get(decoration.sourceId)?.clip
            if (!clip) throw new Error('Missing equation decoration bounds')
            const isRule = decoration.fractionRule === true
            decoration.data = await picture(browser, clip, decoration.sourceId, isRule, attribute, isRule)
            if (isRule) {
              const rule = await evaluate(browser, fractionRule, decoration)
              const rules = node.equation.rules ??= []
              rules.push(rule)
            }
            else artwork.push(decoration)
          }
          node.equation.pictures = artwork
        }
        catch {
          node.equation = undefined
          warnings.push('could not isolate an equation decoration')
        }
      }
      // The browser already cropped the picture to its visible geometry.
      if (node.kind === 'image') node.crop = undefined
    }
  }
  catch (error) {
    warnings.push(error instanceof Error ? error.message : 'could not capture slide artwork')
    return { warnings }
  }
  return { content, warnings }
}
