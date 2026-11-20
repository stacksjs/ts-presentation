import type { ClickBounds, SlidePosition, SlideRoute } from './navigation.ts'
import { nextPosition } from './navigation.ts'

type Layout = '1' | '2' | '3'
type PanelAxis = 'width' | 'height'

const storagePrefix = 'ts-presentation-presenter-'
const wideScreen = () => matchMedia('(min-aspect-ratio: 1/1)').matches

function readSetting(key: string): string | null {
  try { return localStorage.getItem(storagePrefix + key) }
  catch { return null }
}

function saveSetting(key: string, value: string): void {
  try { localStorage.setItem(storagePrefix + key, value) }
  catch {}
}

function isLayout(value: string | null): value is Layout {
  return value === '1' || value === '2' || value === '3'
}

interface PresenterControls {
  setActive(active: boolean): void
  update(position: SlidePosition): void
}

export function setupPresenter(
  routes: SlideRoute[],
  bounds: ClickBounds[],
  seekTo: (click: number) => void,
  previewUrl: (route: SlideRoute, click: number) => URL,
): PresenterControls {
  const body = document.body
  const panels = {
    width: document.querySelector<HTMLElement>('#presenter-width')!,
    height: document.querySelector<HTMLElement>('#presenter-height')!,
  }
  const chooser = document.querySelector<HTMLSelectElement>('#presenter-layout')!
  const preview = document.querySelector<HTMLElement>('#presenter-preview')!
  const label = preview.querySelector<HTMLElement>('#presenter-next')!
  const frame = preview.querySelector<HTMLIFrameElement>('iframe')!
  const steps = document.querySelector<HTMLElement>('#presenter-steps')!
  const seek = steps.querySelector<HTMLInputElement>('input')!
  const output = steps.querySelector<HTMLOutputElement>('output')!
  const storedLayout = readSetting('layout')
  let layout: Layout = isLayout(storedLayout) ? storedLayout : '1'
  const dimensions = { width: Number(readSetting('width')) || 360, height: Number(readSetting('height')) || 280 }
  const actual = { ...dimensions }
  const origin = location.protocol === 'file:' ? '*' : location.origin
  let upcoming: SlidePosition | undefined
  let active = false

  function boundsFor(axis: PanelAxis): [number, number] {
    return axis === 'width'
      ? [220, Math.max(220, Math.floor(body.clientWidth * 0.65))]
      : [140, Math.max(140, Math.floor(body.clientHeight * 0.65))]
  }

  function positionPanels(): void {
    if (!active) return
    for (const axis of ['width', 'height'] as const) {
      const [min, max] = boundsFor(axis)
      const value = Math.max(min, Math.min(max, dimensions[axis]))
      actual[axis] = value
      body.style.setProperty(`--presenter-${axis}`, `${value}px`)
      panels[axis].setAttribute('aria-valuemin', String(min))
      panels[axis].setAttribute('aria-valuemax', String(max))
      panels[axis].setAttribute('aria-valuenow', String(value))
    }
  }

  function resize(axis: PanelAxis, value: number): void {
    const [min, max] = boundsFor(axis)
    dimensions[axis] = Math.round(Math.max(min, Math.min(max, value)))
    saveSetting(axis, String(dimensions[axis]))
    positionPanels()
  }

  function direction(axis: PanelAxis): number {
    if (axis === 'width') return (layout === '1' && wideScreen()) ? -1 : 1
    return layout === '1' ? -1 : 1
  }

  for (const axis of ['width', 'height'] as const) {
    const handle = panels[axis]
    const axisPosition = (event: PointerEvent) => axis === 'width' ? event.clientX : event.clientY
    let drag: { pointer: number, position: number, size: number, direction: number } | undefined
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return
      event.preventDefault()
      handle.focus()
      handle.setPointerCapture(event.pointerId)
      drag = { pointer: event.pointerId, position: axisPosition(event), size: actual[axis], direction: direction(axis) }
    })
    handle.addEventListener('pointermove', (event) => {
      if (drag?.pointer === event.pointerId) resize(axis, drag.size + drag.direction * (axisPosition(event) - drag.position))
    })
    handle.addEventListener('lostpointercapture', () => { drag = undefined })
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'Home' || event.key === 'End') resize(axis, boundsFor(axis)[event.key === 'Home' ? 0 : 1])
      else {
        const [back, forward] = axis === 'width' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
        if (event.key !== back && event.key !== forward) return
        resize(axis, actual[axis] + direction(axis) * (event.key === back ? -16 : 16))
      }
      event.preventDefault()
    })
  }

  function sendPreview(): void {
    if (active && upcoming) frame.contentWindow?.postMessage({ presentationPreview: upcoming }, origin)
  }

  function showUpcoming(position: SlidePosition): void {
    const next = nextPosition(position, bounds)
    const text = next ? `${next.slide === position.slide ? 'Next reveal' : 'Next slide'} · ${routes[next.slide - 1].title}` : 'End of presentation'
    if (upcoming?.slide === next?.slide && upcoming?.click === next?.click && label.textContent === text) return
    upcoming = next
    frame.hidden = !next
    label.textContent = text
    if (!next) return
    const route = routes[next.slide - 1]
    if (!frame.hasAttribute('src')) {
      const url = previewUrl(route, next.click)
      url.searchParams.delete('embedded')
      frame.src = url.href
    }
    else sendPreview()
  }

  function update(position: SlidePosition): void {
    if (!active) return
    const { start, end } = bounds[position.slide - 1]
    steps.hidden = start === end
    seek.min = String(start)
    seek.max = String(end)
    seek.value = String(position.click)
    output.textContent = `${position.click} / ${end}`
    showUpcoming(position)
  }

  chooser.value = layout
  chooser.addEventListener('change', () => {
    if (!isLayout(chooser.value)) return
    layout = chooser.value
    body.dataset.presenterLayout = layout
    saveSetting('layout', layout)
    positionPanels()
  })
  seek.addEventListener('input', () => { seekTo(Number(seek.value)) })
  frame.addEventListener('load', sendPreview)
  window.addEventListener('resize', positionPanels)
  return {
    setActive(enabled) {
      active = enabled
      chooser.hidden = preview.hidden = panels.width.hidden = panels.height.hidden = !active
      if (!active) {
        steps.hidden = true
        return
      }
      body.dataset.presenterLayout = layout
      positionPanels()
    },
    update,
  }
}
