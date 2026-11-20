import type { SlideCanvas } from '../../types/src/canvas.ts'
import { drawingPath, drawingStyle, emptySketch, maxStrokePoints, mergeSketches, validateSketch } from '../../types/src/drawings.ts'
import type { DrawingClientConfig, DrawingPoint, DrawingSketch, DrawingStroke } from '../../types/src/drawings.ts'

interface DrawingPlayerOptions {
  stage: HTMLElement
  articles: HTMLElement[]
  canvas: SlideCanvas
  button: HTMLButtonElement
  clearButton: HTMLButtonElement
  status: HTMLElement
  preview: boolean
  presenter: () => boolean
  currentSlide: () => number
  sendToPeer: (message: unknown) => void
}

interface DrawingController {
  toggle: () => boolean
  clear: () => boolean
  refresh: () => void
  receive: (message: unknown) => void
}

const ns = 'http://www.w3.org/2000/svg'

export function setupDrawings(config: DrawingClientConfig, options: DrawingPlayerOptions): DrawingController {
  const { articles, stage, canvas, button, clearButton, status } = options
  const shared = new Map(Object.entries(config.saved).map(([number, sketch]) => [Number(number), sketch]))
  const privateInk = new Map<number, DrawingSketch>()
  const layers = articles.map(article => article.querySelector<SVGSVGElement>(':scope > svg[data-presentation-drawing]'))
  const painted = new Map<number, { shared: DrawingSketch, privateInk: DrawingSketch }>()
  let armed = false
  let activeSlide = options.currentSlide()
  let clock = 0
  let frame: number | undefined
  let stroke: (DrawingStroke & { slide: number, pointer: number }) | undefined
  const nonce = [...crypto.getRandomValues(new Uint32Array(2))].map(value => value.toString(16).padStart(8, '0')).join('')
  const canEdit = () => config.enabled && !options.preview && (!config.presenterOnly || options.presenter())
  const canShare = () => config.syncAll || options.presenter()

  function noteClock(sketch: DrawingSketch): void {
    const last = sketch.strokes.at(-1)?.id ?? ''
    const latest = last > (sketch.clear ?? '') ? last : sketch.clear
    if (latest) clock = Math.max(clock, Number(latest.slice(0, 16)))
  }
  for (const sketch of shared.values()) noteClock(sketch)

  function stamp(): string {
    clock = Math.max(clock + 1, Date.now())
    return `${String(clock).padStart(16, '0')}-${nonce}`
  }

  function layer(slide: number): SVGSVGElement {
    const article = articles[slide - 1]
    const previous = layers[slide - 1]
    if (previous?.parentElement === article) return previous
    const existing = article.querySelector<SVGSVGElement>(':scope > svg[data-presentation-drawing]')
    if (existing) return layers[slide - 1] = existing
    const element = document.createElementNS(ns, 'svg')
    element.setAttribute('class', 'slide-ink')
    element.setAttribute('aria-hidden', 'true')
    element.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`)
    element.setAttribute('data-presentation-drawing', '')
    article.append(element)
    layers[slide - 1] = element
    return element
  }

  function paint(): void {
    frame = undefined
    const saved = shared.get(activeSlide) ?? emptySketch
    const local = privateInk.get(activeSlide) ?? emptySketch
    const last = painted.get(activeSlide)
    const previous = layers[activeSlide - 1]
    const pending = stroke?.slide === activeSlide ? stroke : undefined
    if (!previous && !armed && !saved.strokes.length && !local.strokes.length && !pending) return
    const overlay = layer(activeSlide)
    const legacy = overlay.querySelector('image[data-presentation-legacy]')
    overlay.toggleAttribute('data-drawing-active', armed)
    const group = overlay.querySelector('g') ?? document.createElementNS(ns, 'g')
    if (!group.parentNode) {
      group.setAttribute('fill', 'none')
      group.setAttribute('stroke', drawingStyle.color)
      group.setAttribute('stroke-width', String(drawingStyle.width))
      group.setAttribute('stroke-linejoin', 'round')
      group.setAttribute('stroke-linecap', 'round')
      overlay.append(group)
    }
    if (last?.shared !== saved || last.privateInk !== local) {
      const sketch = mergeSketches(saved, local)
      if (sketch.clear) legacy?.setAttribute('display', 'none')
      else legacy?.removeAttribute('display')
      const paths = sketch.strokes.map(({ points }) => {
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', drawingPath(points))
        return path
      })
      group.replaceChildren(...paths)
      painted.set(activeSlide, { shared: saved, privateInk: local })
    }
    let draft = group.querySelector('path[data-drawing-draft]')
    if (pending) {
      if (!draft) {
        draft = document.createElementNS(ns, 'path')
        draft.setAttribute('data-drawing-draft', '')
        group.append(draft)
      }
      draft.setAttribute('d', drawingPath(pending.points))
    }
    else draft?.remove()
    clearButton.disabled = !group.children.length && (!legacy || legacy.getAttribute('display') === 'none')
  }

  function queuePaint(): void {
    if (frame === undefined) frame = requestAnimationFrame(paint)
  }

  function send(message: unknown): void {
    if (channel) channel.postMessage(message)
    else options.sendToPeer(message)
  }

  function accept(slide: number, sketch: DrawingSketch): void {
    const merged = mergeSketches(shared.get(slide) ?? emptySketch, sketch)
    noteClock(merged)
    shared.set(slide, merged)
    if (slide === activeSlide) queuePaint()
  }

  function receive(message: unknown): void {
    if (!message || typeof message !== 'object') return
    if ('request' in message && message.request === true) {
      if (!options.preview)
        for (const [slide, patch] of shared) send({ slide, patch })
      return
    }
    if (!('slide' in message) || !('patch' in message) || typeof message.slide !== 'number') return
    const { slide } = message
    if (!Number.isInteger(slide) || slide < 1 || slide > articles.length) return
    const sketch = validateSketch(message.patch)
    if (sketch) accept(slide, sketch)
  }

  let channel: BroadcastChannel | undefined
  if (location.protocol !== 'file:' && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(`ts-presentation-drawings:${new URL('.', document.baseURI).href}`)
      channel.addEventListener('message', event => receive(event.data))
    }
    catch {
      // A local file may need the existing opener and presenter connection.
    }
  }
  send({ request: true })

  async function persist(slide: number, patch: DrawingSketch): Promise<void> {
    try {
      const response = await fetch('./__presentation/drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide, patch }),
      })
      if (!response.ok) throw new Error('Could not save drawing')
      const stored = validateSketch(await response.json())
      if (stored) {
        accept(slide, stored)
        send({ slide, patch: stored })
      }
      status.hidden = true
    }
    catch {
      status.textContent = 'Could not save the drawing'
      status.hidden = false
    }
  }

  function update(slide: number, patch: DrawingSketch): void {
    if (!canShare()) {
      privateInk.set(slide, mergeSketches(privateInk.get(slide) ?? emptySketch, patch))
      queuePaint()
      return
    }
    accept(slide, patch)
    send({ slide, patch })
    if (config.persist) void persist(slide, shared.get(slide)!)
  }

  function finish(): void {
    if (!stroke) return
    const { slide, id, points } = stroke
    stroke = undefined
    update(slide, { strokes: [{ id, points }] })
  }

  function refresh(): void {
    const next = options.currentSlide()
    if (activeSlide !== next || !canEdit()) {
      finish()
      layers[activeSlide - 1]?.removeAttribute('data-drawing-active')
    }
    activeSlide = next
    if (!canEdit()) armed = false
    button.hidden = !canEdit()
    button.setAttribute('aria-pressed', String(armed))
    clearButton.hidden = !armed
    queuePaint()
  }

  function toggle(): boolean {
    if (!canEdit()) return false
    if (armed) finish()
    armed = !armed
    refresh()
    return true
  }

  function clear(): boolean {
    if (!canEdit() || !armed) return false
    stroke = undefined
    update(activeSlide, { clear: stamp(), strokes: [] })
    return true
  }

  function point(event: PointerEvent, rect: DOMRect): DrawingPoint {
    const coordinate = (value: number, start: number, size: number, limit: number) =>
      Math.min(limit, Math.max(0, Math.round((value - start) * limit / size * 10) / 10))
    return [coordinate(event.clientX, rect.x, rect.width, canvas.width), coordinate(event.clientY, rect.y, rect.height, canvas.height)]
  }

  stage.addEventListener('pointerdown', (event) => {
    if (!canEdit() || (!armed && event.pointerType !== 'pen') || event.button !== 0 || stroke) return
    const article = articles[activeSlide - 1]
    if (!(event.target instanceof Node) || !article.contains(event.target)) return
    const rect = article.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    stroke = { id: stamp(), slide: activeSlide, pointer: event.pointerId, points: [point(event, rect)] }
    article.setPointerCapture(event.pointerId)
    event.preventDefault()
    queuePaint()
  })
  stage.addEventListener('pointermove', (event) => {
    if (!stroke || stroke.pointer !== event.pointerId || stroke.points.length >= maxStrokePoints) return
    const rect = articles[stroke.slide - 1].getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const events = event.getCoalescedEvents?.() ?? []
    for (const move of events.length ? events : [event]) {
      const next = point(move, rect)
      const previous = stroke.points.at(-1)!
      if (Math.abs(next[0] - previous[0]) + Math.abs(next[1] - previous[1]) >= 0.5) stroke.points.push(next)
      if (stroke.points.length >= maxStrokePoints) break
    }
    queuePaint()
  })
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stage.addEventListener(event, (event) => { if (stroke?.pointer === event.pointerId) finish() })
  }

  button.addEventListener('click', toggle)
  clearButton.addEventListener('click', clear)
  refresh()
  return { toggle, clear, refresh, receive }
}
