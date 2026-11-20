import type { SlideCanvas } from '../../../../types/src/canvas.ts'
import type { Rect, SlideIr } from './ir.ts'
import type { OriginalPicture } from './pictures.ts'
import { clipToSlide, normalize } from './normalize.ts'
import { collectSnapshot } from './walker.ts'

const afterPaint = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
type Browser = Pick<Bun.WebView, 'evaluate' | 'cdp'>

function evaluate<T, Options>(browser: Browser, callback: (options: Options) => T, options: Options): Promise<T> {
  return browser.evaluate<T>(`(${callback.toString()})(${JSON.stringify(options)})`)
}

/** Keep the layout intact while capturing the artwork of a single element. */
function isolate({ id, descendants, attribute }: { id: number, descendants: boolean, attribute: string }): boolean {
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
    style(target, 'color', 'transparent')
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

async function picture(browser: Browser, rect: Rect, sourceId: number, hideDescendants: boolean, attribute: string): Promise<string> {
  try {
    if (!await evaluate(browser, isolate, { id: sourceId, descendants: hideDescendants, attribute }))
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
