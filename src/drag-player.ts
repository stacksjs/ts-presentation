import type { DragKind, DragPosition } from './drag.ts'
import { arrowGeometry, parseDragPosition } from './drag.ts'

const elementSelector = '[data-presentation-drag]'
type Draggable = HTMLElement | SVGElement
type Handle = 'move' | 'resize' | 'rotate' | 'arrow-start' | 'arrow-end'
interface Selection { element: Draggable, slide: HTMLElement, kind: DragKind, index: number }
interface ScreenPoint { x: number, y: number }
interface Gesture {
  selection: Selection
  pointer: number
  handle: Handle
  start: ScreenPoint
  center: ScreenPoint
  position: DragPosition
  height: number
  capture: Element
}
interface DragChange { index: number, position: DragPosition, file?: string, revision?: string }

function applyPosition(element: Draggable, kind: DragKind, position: DragPosition): void {
  const [left, top, width, height, angle] = position
  if (kind === 'box') {
    element.style.left = `${left}px`
    element.style.top = `${top}px`
    element.style.width = `${width}px`
    element.style.height = height === null ? 'auto' : `${height}px`
    if (angle || element.style.rotate) element.style.rotate = `${angle}deg`
  }
  else {
    const geometry = arrowGeometry(position, Number(element.dataset.dragPadding) || 0)
    element.style.left = `${geometry.left}px`
    element.style.top = `${geometry.top}px`
    element.style.width = `${geometry.width}px`
    element.style.height = `${geometry.height}px`
    element.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`)
    const line = element.querySelector('[data-drag-line]')
    for (const key of ['x1', 'x2', 'y1', 'y2'] as const) {
      line?.setAttribute(key, String(geometry[key]))
      element.querySelector('[data-drag-hit]')?.setAttribute(key, String(geometry[key]))
    }
  }
  element.dataset.dragPosition = JSON.stringify(position)
}

function currentPosition(element: Draggable, kind: DragKind): DragPosition | undefined {
  const value = element.dataset.dragPosition
  return value ? parseDragPosition(value, kind) : undefined
}

function resize(position: DragPosition, height: number, dx: number, dy: number, proportionate: boolean): DragPosition {
  const angle = position[4] * Math.PI / 180
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const width = position[2]
  let nextWidth = Math.max(12, width + dx * cos + dy * sin)
  let nextHeight = Math.max(12, height - dx * sin + dy * cos)
  if (proportionate && position[3] !== null) {
    const ratio = Math.abs(nextWidth / width - 1) >= Math.abs(nextHeight / height - 1) ? nextWidth / width : nextHeight / height
    const factor = Math.max(ratio, 12 / width, 12 / height)
    nextWidth = width * factor
    nextHeight = height * factor
  }
  const deltaW = nextWidth - width
  const deltaH = position[3] === null ? 0 : nextHeight - height
  return [
    position[0] + (cos * deltaW - sin * deltaH - deltaW) / 2,
    position[1] + (sin * deltaW + cos * deltaH - deltaH) / 2,
    nextWidth, position[3] === null ? null : nextHeight, position[4],
  ]
}

function nextPosition(gesture: Gesture, point: ScreenPoint, scale: number, snap: boolean): DragPosition {
  const { start, position, handle } = gesture
  let dx = (point.x - start.x) / scale
  let dy = (point.y - start.y) / scale
  const [left, top, width, height, angle] = position
  if (handle === 'move') return [left + dx, top + dy, width, height, angle]
  if (handle === 'resize') return resize(position, gesture.height, dx, dy, snap)
  if (handle === 'rotate') {
    const bearing = (cursor: ScreenPoint) => Math.atan2(cursor.y - gesture.center.y, cursor.x - gesture.center.x)
    const rotation = angle + (bearing(point) - bearing(start)) * 180 / Math.PI
    const normalized = Math.atan2(Math.sin(rotation * Math.PI / 180), Math.cos(rotation * Math.PI / 180)) * 180 / Math.PI
    return [left, top, width, height, snap ? Math.round(normalized / 15) * 15 : normalized]
  }
  const h = height ?? 0
  if (snap && (width || h)) {
    const projection = (dx * width + dy * h) / (width * width + h * h)
    dx = width * projection
    dy = h * projection
  }
  return handle === 'arrow-start' ? [left + dx, top + dy, width - dx, h - dy, 0] : [left, top, width + dx, h + dy, 0]
}

export function setupDrags(stage: HTMLElement, onChange: (slide: HTMLElement, edit: DragChange) => void): {
  clear: () => void
  receive: (slide: HTMLElement, input: unknown) => void
} | undefined {
  const items = [...stage.querySelectorAll<Draggable>(elementSelector)]
  if (!items.length) return
  const editors = new Map<HTMLElement, Draggable[]>()
  const copies = new Map<string, Draggable[]>()
  for (const element of items) {
    const slide = element.closest<HTMLElement>('article.slide')
    if (!slide) continue
    const list = editors.get(slide) ?? []
    list.push(element)
    editors.set(slide, list)
    const token = element.dataset.dragToken
    if (token) {
      const mirrored = copies.get(token) ?? []
      mirrored.push(element)
      copies.set(token, mirrored)
    }
    if (!element.hasAttribute('tabindex') && !element.matches('a[href], button, input, select, textarea, summary'))
      element.setAttribute('tabindex', '0')
  }

  const frame = document.createElement('div')
  frame.className = 'drag-controls'
  const outline = document.createElement('div')
  outline.className = 'drag-outline'
  const toolbar = document.createElement('div')
  toolbar.className = 'drag-toolbar'
  const status = document.createElement('span')
  status.role = 'status'
  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = 'Save position'
  const done = document.createElement('button')
  done.type = 'button'
  done.textContent = 'Done'
  toolbar.append(save, done, status)
  const labels: Record<Handle, string> = { move: 'Move', resize: 'Resize', rotate: 'Rotate', 'arrow-start': 'Move arrow start', 'arrow-end': 'Move arrow end' }
  const handles = Object.entries(labels).map(([handle, label]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'drag-handle'
    button.dataset.dragHandle = handle
    button.setAttribute('aria-label', label)
    button.title = label
    button.textContent = handle === 'move' ? '✥' : handle === 'rotate' ? '↻' : handle === 'resize' ? '⤡' : '●'
    return [handle as Handle, button] as const
  })
  frame.append(outline, toolbar, ...handles.map(([, button]) => button))

  let selected: Selection | undefined
  let gesture: Gesture | undefined
  let pending = Promise.resolve()
  const timers = new Map<Draggable, ReturnType<typeof setTimeout>>()
  const scaleFor = (slide: HTMLElement) => slide.getBoundingClientRect().width / slide.offsetWidth || 1

  function refresh(): void {
    if (!selected) return
    const { slide, element, kind } = selected
    const ratio = scaleFor(slide)
    const parent = slide.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const x = (box.left - parent.left) / ratio
    const y = (box.top - parent.top) / ratio
    const w = box.width / ratio
    const h = box.height / ratio
    const position = currentPosition(element, kind)
    if (!position) return
    const arrow = kind === 'arrow' ? arrowGeometry(position, Number(element.dataset.dragPadding) || 0) : undefined
    function place(target: HTMLElement, x: number, y: number): void {
      target.style.left = `${x}px`
      target.style.top = `${y}px`
    }
    function clamp(value: number, size: number, inset: number): number {
      return Math.max(inset, Math.min(size - inset, value))
    }
    place(outline, x, y)
    outline.style.width = `${w}px`
    outline.style.height = `${h}px`
    outline.hidden = kind === 'arrow'
    for (const [name, button] of handles) {
      button.hidden = arrow ? name === 'rotate' || name === 'resize' : name.startsWith('arrow-')
      if (button.hidden) continue
      let point = { x, y }
      if (name === 'rotate') point = { x: x + w / 2, y: y - 19 }
      if (name === 'resize') point = { x: x + w, y: y + h }
      if (arrow && name === 'move') point = { x: x + w / 2, y: y + h / 2 - 17 }
      if (arrow && name === 'arrow-start') point = { x: x + arrow.x1, y: y + arrow.y1 }
      if (arrow && name === 'arrow-end') point = { x: x + arrow.x2, y: y + arrow.y2 }
      place(button, clamp(point.x, slide.offsetWidth, 14), clamp(point.y, slide.offsetHeight, 14))
    }
    place(toolbar, clamp(x + w / 2, slide.offsetWidth, Math.min(144, slide.offsetWidth / 2)),
      clamp(y + h + 35, slide.offsetHeight, 20))
  }

  function select(element: Draggable): void {
    const slide = element.closest<HTMLElement>('article.slide')
    if (!slide || slide.hidden) return
    const kind = element.dataset.presentationDrag
    const index = editors.get(slide)?.indexOf(element) ?? -1
    if ((kind !== 'arrow' && kind !== 'box') || index < 0 || !currentPosition(element, kind)) return
    clear()
    selected = { element, slide, kind, index }
    save.hidden = !element.dataset.dragToken
    status.textContent = ''
    slide.append(frame)
    refresh()
    element.focus({ preventScroll: true })
    element.setAttribute('data-drag-selected', '')
  }

  function apply(selection: Selection, value: DragPosition, broadcast = true): void {
    const { element, kind } = selection
    const position = parseDragPosition(value, kind)
    if (!position) return
    const token = element.dataset.dragToken
    for (const item of (token && copies.get(token)) || [element]) applyPosition(item, kind, position)
    if (broadcast) onChange(selection.slide, { index: selection.index, position })
    refresh()
  }

  function updateRevision(file: string, revision: string): void {
    for (const item of items) {
      if (item.dataset.dragFile === file) item.dataset.dragRevision = revision
    }
  }

  function persist(selection: Selection): void {
    const { element, kind, slide, index } = selection
    clearTimeout(timers.get(element))
    timers.delete(element)
    const { dragToken: token, dragFile: file } = element.dataset
    if (!token || !file) return
    pending = pending.then(async () => {
      const revision = element.dataset.dragRevision
      const position = currentPosition(element, kind)
      if (!position || !revision) return
      if (selected?.element === element) status.textContent = 'Saving…'
      try {
        const response = await fetch('/__presentation/drag', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, revision, position }),
        })
        const result = await response.text()
        if (!response.ok || !/^[a-f0-9]{64}$/.test(result)) throw new Error(result || 'Position could not be saved')
        updateRevision(file, result)
        onChange(slide, { index, position, file, revision: result })
        if (selected?.element === element) status.textContent = 'Saved'
      }
      catch (error) {
        if (selected?.element === element) status.textContent = error instanceof Error ? error.message : 'Position could not be saved'
      }
    })
  }

  function queueSave(selection: Selection): void {
    if (!selection.element.dataset.dragToken) return
    clearTimeout(timers.get(selection.element))
    timers.set(selection.element, setTimeout(() => persist(selection), 350))
  }

  function endGesture(event?: PointerEvent): void {
    if (!gesture || (event && gesture.pointer !== event.pointerId)) return
    const before = gesture
    gesture = undefined
    if (before.capture.hasPointerCapture(before.pointer)) before.capture.releasePointerCapture(before.pointer)
    const position = currentPosition(before.selection.element, before.selection.kind)
    if (position?.some((value, index) => value !== before.position[index])) queueSave(before.selection)
  }

  function clear(): void {
    endGesture()
    selected?.element.removeAttribute('data-drag-selected')
    selected = undefined
    frame.remove()
  }

  save.addEventListener('click', () => { if (selected) persist(selected) })
  done.addEventListener('click', () => {
    const element = selected?.element
    clear()
    element?.focus({ preventScroll: true })
  })
  stage.addEventListener('dblclick', (event) => {
    const target = event.target instanceof Element ? event.target.closest<Draggable>(elementSelector) : null
    if (!target || target === selected?.element) return
    event.preventDefault()
    select(target)
  })
  stage.addEventListener('pointerdown', (event) => {
    if (!selected || !(event.target instanceof Element) || event.button !== 0 || gesture) return
    const target = event.target
    if (!frame.contains(target) && !selected.element.contains(target)) return
    const action = target.closest<HTMLElement>('[data-drag-handle]')?.dataset.dragHandle as Handle | undefined
    if (!action && frame.contains(target)) return
    const position = currentPosition(selected.element, selected.kind)
    if (!position) return
    event.preventDefault()
    const rect = selected.element.getBoundingClientRect()
    const height = selected.element instanceof HTMLElement ? selected.element.offsetHeight : rect.height / scaleFor(selected.slide)
    const capture = target.closest('[data-drag-handle]') ?? selected.element
    capture.setPointerCapture(event.pointerId)
    gesture = {
      selection: selected, pointer: event.pointerId, handle: action ?? 'move', start: { x: event.clientX, y: event.clientY },
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, position, height, capture,
    }
  })
  stage.addEventListener('pointermove', (event) => {
    if (gesture?.pointer !== event.pointerId) return
    apply(gesture.selection, nextPosition(gesture, { x: event.clientX, y: event.clientY }, scaleFor(gesture.selection.slide), event.shiftKey))
  })
  stage.addEventListener('pointerup', endGesture)
  stage.addEventListener('pointercancel', endGesture)
  stage.addEventListener('lostpointercapture', endGesture)
  stage.addEventListener('click', (event) => {
    if (selected && event.target instanceof Node && selected.element.contains(event.target)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, true)
  document.addEventListener('pointerdown', (event) => {
    if (!selected || !(event.target instanceof Node)) return
    if (!frame.contains(event.target) && !selected.element.contains(event.target)) clear()
  }, true)
  stage.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element) || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
    const target = event.target.closest<Draggable>(elementSelector)
    if (target && (event.key === 'F2' || (event.key === 'Enter' && target === event.target && !target.matches('a, button, input, select, textarea, summary, [data-zoom]')))) {
      event.preventDefault()
      if (selected?.element === target) clear()
      else select(target)
      return
    }
    if (!selected || (!frame.contains(event.target) && !selected.element.contains(event.target))) return
    if (event.key === 'Escape') {
      event.preventDefault()
      const element = selected.element
      clear()
      element.focus({ preventScroll: true })
      return
    }
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (!Object.hasOwn(movement, event.key)) return
    const position = currentPosition(selected.element, selected.kind)
    if (!position) return
    const [x, y] = movement[event.key as keyof typeof movement]
    const step = event.shiftKey ? 10 : 1
    const dx = x * step
    const dy = y * step
    const action = event.target.closest<HTMLElement>('[data-drag-handle]')?.dataset.dragHandle
    const [left, top, width, height, angle] = position
    event.preventDefault()
    if (action === 'resize') apply(selected, resize(position, height ?? (selected.element as HTMLElement).offsetHeight, dx, dy, false))
    else if (action === 'rotate') apply(selected, [left, top, width, height, angle + dx + dy])
    else if (action === 'arrow-start') apply(selected, [left + dx, top + dy, width - dx, (height ?? 0) - dy, 0])
    else if (action === 'arrow-end') apply(selected, [left, top, width + dx, (height ?? 0) + dy, 0])
    else apply(selected, [left + dx, top + dy, width, height, angle])
    queueSave(selected)
  })
  const monitor = new ResizeObserver(refresh)
  monitor.observe(stage)
  return {
    clear,
    receive(slide, input) {
      if (!input || typeof input !== 'object') return
      const { index, position, file, revision } = input as Partial<DragChange>
      const element = Number.isSafeInteger(index) ? editors.get(slide)?.[index!] : undefined
      const kind = element?.dataset.presentationDrag
      if (!element || index === undefined || (kind !== 'arrow' && kind !== 'box') || !Array.isArray(position)) return
      if (file && file === element.dataset.dragFile && revision && /^[a-f0-9]{64}$/.test(revision)) {
        updateRevision(file, revision)
        return
      }
      apply({ element, slide, kind, index }, position, false)
    },
  }
}
