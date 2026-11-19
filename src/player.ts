import { defaultCanvas } from './canvas.ts'
import type { CodeReveal } from './code-player.ts'
import { codeReveal, showCode } from './code-player.ts'
import type { EquationReveal } from './equation-steps.ts'
import { equationReveal, showEquation } from './equation-steps.ts'
import { setupLiveCode } from './live-code.ts'
import type { SlidePosition, SlideRoute } from './navigation.ts'
import { clickBounds, createNavigationContext, nextPosition, previousPosition, readSlideHash, slideHash, slidePosition } from './navigation.ts'
import { setupPresenter } from './presenter.ts'

const canvasWidth = Number(document.documentElement.dataset.slideWidth) || defaultCanvas.width
const canvasHeight = Number(document.documentElement.dataset.slideHeight) || defaultCanvas.height
const stage = document.querySelector<HTMLElement>('#stage')!
const articles = [...stage.querySelectorAll<HTMLElement>(':scope > article')]
const notesPanel = document.querySelector<HTMLElement>('#presenter-notes')!
const notes = [...notesPanel.querySelectorAll<HTMLElement>(':scope > section')]
const control = document.querySelector<HTMLElement>('#controls')!
const goto = control.querySelector<HTMLSelectElement>('#goto')!
const previous = control.querySelector<HTMLButtonElement>('#previous')!
const next = control.querySelector<HTMLButtonElement>('#next')!
const presenter = control.querySelector<HTMLButtonElement>('#presenter')!
const fullscreen = control.querySelector<HTMLButtonElement>('#fullscreen')!
const overview = document.querySelector<HTMLDialogElement>('#overview')!
const imageView = document.querySelector<HTMLDialogElement>('#image-view')!
const detail = imageView.querySelector('img')!
const drawButton = control.querySelector<HTMLButtonElement>('#draw-button')!
const timer = document.querySelector<HTMLElement>('#presenter-time')!
const routes: SlideRoute[] = JSON.parse(document.querySelector('#presentation-navigation')!.textContent ?? '[]')
const params = new URLSearchParams(location.search)
const isCapture = params.has('capture')
const captureSteps = params.has('steps')
const isPreview = params.has('preview')
const isPresenter = !isPreview && !isCapture && params.has('presenter')
const opener: Window | null = isPresenter ? window.opener : null
const messageOrigin = location.protocol === 'file:' ? '*' : location.origin
const aliases = new Map(routes.flatMap(route => route.alias ? [[route.alias, route.no]] : []))
const disclosures = articles.map(article => [...article.querySelectorAll('details')])
const screenshots = articles.map(article => [...article.querySelectorAll<HTMLImageElement>('img[data-zoom]')])
const noteSteps = notes.map(note => [...note.querySelectorAll<HTMLElement>('[data-note-step]')])

interface Reveal {
  element: HTMLElement
  step: number
  hide: boolean
}

const reveals: (Reveal | EquationReveal | CodeReveal)[][] = articles.map((article) => {
  let cursor = 0
  const groups = article.querySelectorAll('v-clicks')
  for (const group of groups) {
    const childNodes = group.firstElementChild?.matches('ol, ul') ? group.firstElementChild.children : group.children
    for (const child of childNodes) child.setAttribute('v-click', '')
  }
  return [...article.querySelectorAll<HTMLElement>('v-click, v-after, [v-click], [v-after], [data-click], [data-equation-steps], [data-code-block]')].map((element) => {
    if (element.hasAttribute('data-code-block')) {
      const reveal = codeReveal(element, cursor)
      cursor = Math.max(cursor, reveal.step)
      return reveal
    }
    if (element.hasAttribute('data-equation-steps')) {
      const reveal = equationReveal(element, cursor)
      cursor = Math.max(cursor, reveal.step)
      return reveal
    }
    const raw = element.getAttribute('data-click') ?? element.getAttribute('v-click') ?? element.getAttribute('at')
    const explicit = raw && /^\d+$/.test(raw) ? Number(raw) : 0
    const after = element.matches('v-after, [v-after]')
    const step = explicit || (after ? Math.max(cursor, 1) : cursor + 1)
    cursor = Math.max(cursor, step)
    return { element, step, hide: element.hasAttribute('hide') }
  })
})

const bounds = reveals.map((steps, index) => clickBounds(routes[index].frontmatter,
  steps.reduce((end, step) => Math.max(end, step.step), noteSteps[index].length - 1)))
articles.forEach((article, index) => {
  article.dataset.clicks = String(bounds[index].end)
  article.dataset.clicksStart = String(bounds[index].start)
})
let current = 1
let click = 0
let popup: Window | null = null
let startedAt = Date.now()
let timerTick: ReturnType<typeof setInterval> | undefined
document.body.classList.add('playing')
if (isPreview) document.body.classList.add('previewing')
if (isCapture) document.body.classList.add('capturing')

let presenterControls: ReturnType<typeof setupPresenter> | undefined
const position = (): SlidePosition => ({ slide: current, click })

function resize(): void {
  const inset = isCapture || isPreview ? 0 : 24
  const width = Math.max(1, stage.clientWidth - inset)
  const height = Math.max(1, stage.clientHeight - inset)
  stage.style.setProperty('--slide-scale', String(Math.min(width / canvasWidth, height / canvasHeight)))
}

function syncPeer(data: Record<string, unknown>): void {
  (opener ?? popup)?.postMessage(data, messageOrigin)
}

function show(number: number, step?: number, writeHistory = true, sync = true): void {
  const { slide: selected, click: nextStep } = slidePosition(number, step, bounds)
  if (selected === current && nextStep === click && !articles[current - 1].hidden) return
  const slideChanged = selected !== current
  const animate = !isCapture && !isPreview && selected === current && nextStep !== click
  if (writeHistory && (selected !== current || nextStep !== click)) {
    const hash = slideHash(routes[selected - 1], nextStep)
    if (selected === current) history.replaceState(null, '', hash)
    else history.pushState(null, '', hash)
  }

  if (slideChanged) {
    if (imageView.open) imageView.close()
    articles[current - 1].hidden = true
    notes[current - 1].hidden = true
  }
  current = selected
  click = nextStep
  articles[current - 1].hidden = false
  notes[current - 1].hidden = false
  for (const reveal of reveals[current - 1]) {
    if ('frames' in reveal) showCode(reveal, click, animate, Number(stage.style.getPropertyValue('--slide-scale')) || 1)
    else if ('lines' in reveal) showEquation(reveal, click)
    else reveal.element.toggleAttribute('data-reveal-hidden', reveal.hide ? click >= reveal.step : click < reveal.step)
  }
  noteSteps[current - 1].forEach((note, index) => { note.hidden = index > click })
  if (slideChanged) notesPanel.scrollTop = 0
  else if (!notesPanel.hidden && click > 0) {
    const stepNotes = noteSteps[current - 1][click]
    if (stepNotes) {
      const overflow = stepNotes.getBoundingClientRect().bottom - notesPanel.getBoundingClientRect().bottom + 14
      if (overflow > 0) notesPanel.scrollTop += overflow
    }
  }
  const here = position()
  goto.value = String(current)
  previous.disabled = previousPosition(here, bounds) === undefined
  next.disabled = nextPosition(here, bounds) === undefined
  presenterControls?.update(here)
  if (!canvas.hidden) mountDrawing()
  window.dispatchEvent(new CustomEvent('presentation:slide', {
    detail: { ...here, title: routes[current - 1].title, route: routes[current - 1] },
  }))
  if (sync) syncPeer({ presentationSlide: current, presentationClick: click })
}

function nextStep(): void {
  const upcoming = nextPosition(position(), bounds)
  if (upcoming) show(upcoming.slide, upcoming.click)
}

function previousStep(): void {
  const previous = previousPosition(position(), bounds)
  if (previous) show(previous.slide, previous.click)
}

function nextSlide(): void {
  if (current < articles.length) show(current + 1)
}

function previousSlide(): void {
  if (current > 1) show(current - 1)
}

function readLocation(): void {
  const target = readSlideHash(location.hash, aliases)
  const click = isCapture && !captureSteps ? Number.POSITIVE_INFINITY : target.click
  show(target.slide, click, false)
}

window.presentationNavigation = createNavigationContext(routes,
  () => isPreview ? 'preview' : isCapture ? 'export' : isPresenter || !notesPanel.hidden ? 'presenter' : 'slide',
  position, bounds, {
    go(slide, step) {
      const number = typeof slide === 'number' ? slide : aliases.get(slide) ?? Number(slide)
      if (Number.isInteger(number) && (step === undefined || Number.isInteger(step))) show(number, step)
    },
    next: nextStep,
    previous: previousStep,
    nextSlide,
    previousSlide,
  })

function updateTimer(): void {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  timer.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
}

function togglePresenter(): void {
  notesPanel.hidden = !notesPanel.hidden
  document.body.classList.toggle('presenting', !notesPanel.hidden)
  presenter.setAttribute('aria-pressed', String(!notesPanel.hidden))
  if (!notesPanel.hidden) presenterControls ??= setupPresenter(routes, bounds, step => show(current, step))
  presenterControls?.setActive(!notesPanel.hidden)
  presenterControls?.update(position())
  if (timerTick !== undefined) clearInterval(timerTick)
  timerTick = notesPanel.hidden ? undefined : setInterval(updateTimer, 1000)
  resize()
}

function openPresenter(): void {
  if (isPresenter) {
    togglePresenter()
    return
  }
  const url = new URL(location.href)
  url.searchParams.set('presenter', '1')
  url.hash = slideHash(routes[current - 1], click)
  popup = window.open(url, 'ts-presentation-presenter', 'popup,width=1130,height=750')
  if (!popup) togglePresenter()
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) || !event.source) return
  if (isPreview) {
    if (event.source !== window.parent || window.parent === window) return
    const position = event.data?.presentationPreview as Partial<SlidePosition> | undefined
    if (Number.isInteger(position?.slide) && Number.isInteger(position?.click)) show(position!.slide!, position!.click!, false, false)
    return
  }
  if (event.source !== (opener ?? popup)) return
  const data = event.data as {
    presentationSlide?: unknown
    presentationClick?: unknown
    presenterReady?: unknown
    slide?: unknown
    screenshot?: unknown
    disclosure?: unknown
    open?: unknown
  } | null
  if (data?.presenterReady === true && popup) {
    popup.postMessage({ presentationSlide: current, presentationClick: click }, messageOrigin)
  }
  if (typeof data?.presentationSlide === 'number' && Number.isInteger(data.presentationSlide)) {
    const step = typeof data.presentationClick === 'number' && Number.isInteger(data.presentationClick) ? data.presentationClick : 0
    show(data.presentationSlide, step, true, false)
  }
  if (data?.slide !== current) return

  if (typeof data.screenshot === 'number' && Number.isInteger(data.screenshot)) {
    const screenshot = screenshots[current - 1][data.screenshot]
    if (screenshot) showImage(screenshot)
    else if (data.screenshot === -1 && imageView.open) imageView.close()
  }
  if (typeof data.disclosure === 'number' && Number.isInteger(data.disclosure) && typeof data.open === 'boolean') {
    const disclosure = disclosures[current - 1][data.disclosure]
    if (disclosure && disclosure.open !== data.open) disclosure.open = data.open
  }
})

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen()
  else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen()
}

const canvas = document.createElement('canvas')
canvas.className = 'slide-ink'
canvas.width = canvasWidth
canvas.height = canvasHeight
canvas.hidden = true
canvas.setAttribute('aria-hidden', 'true')
const ink = canvas.getContext('2d')
const drawings = new Map<number, Path2D[]>()
let stroke: Path2D | undefined

function mountDrawing(): void {
  if (canvas.parentElement !== articles[current - 1]) articles[current - 1].append(canvas)
  ink?.clearRect(0, 0, canvas.width, canvas.height)
  if (!ink) return
  ink.lineWidth = 3
  ink.strokeStyle = '#ff7b70'
  ink.lineCap = 'round'
  ink.lineJoin = 'round'
  for (const path of drawings.get(current) ?? []) ink.stroke(path)
}

function toggleDrawing(): void {
  canvas.hidden = !canvas.hidden
  drawButton.setAttribute('aria-pressed', String(!canvas.hidden))
  if (!canvas.hidden) mountDrawing()
}

function point(event: PointerEvent): [number, number] {
  const rect = canvas.getBoundingClientRect()
  return [(event.clientX - rect.x) * canvas.width / rect.width, (event.clientY - rect.y) * canvas.height / rect.height]
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  stroke = new Path2D()
  stroke.moveTo(...point(event))
  const lines = drawings.get(current) ?? []
  lines.push(stroke)
  drawings.set(current, lines)
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (!stroke || !canvas.hasPointerCapture(event.pointerId)) return
  stroke.lineTo(...point(event))
  mountDrawing()
})
canvas.addEventListener('lostpointercapture', () => { stroke = undefined })

function showImage(image: HTMLImageElement): void {
  detail.src = image.currentSrc || image.src
  detail.alt = image.alt
  if (!imageView.open) imageView.showModal()
}

function zoom(target: EventTarget | null): void {
  if (!(target instanceof HTMLImageElement)) return
  const screenshot = screenshots[current - 1].indexOf(target)
  if (screenshot < 0) return
  showImage(target)
  syncPeer({ slide: current, screenshot })
}

for (const image of screenshots.flat()) {
  image.tabIndex = 0
  image.setAttribute('role', 'button')
  image.setAttribute('aria-label', `Enlarge ${image.alt || 'image'}`)
}
stage.addEventListener('toggle', (event) => {
  if (!(event.target instanceof HTMLDetailsElement)) return
  const disclosure = disclosures[current - 1].indexOf(event.target)
  if (disclosure >= 0) syncPeer({ slide: current, disclosure, open: event.target.open })
}, true)
imageView.addEventListener('close', () => syncPeer({ slide: current, screenshot: -1 }))
stage.addEventListener('click', event => zoom(event.target))
stage.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-zoom')) {
    event.preventDefault()
    zoom(event.target)
  }
})
imageView.addEventListener('click', (event) => { if (event.target === imageView) imageView.close() })
overview.addEventListener('click', (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest('li button') : null
  if (button instanceof HTMLButtonElement) {
    show(Number(button.value))
    overview.close()
  }
})

previous.addEventListener('click', previousStep)
next.addEventListener('click', nextStep)
goto.addEventListener('change', () => show(Number(goto.value)))
presenter.addEventListener('click', openPresenter)
fullscreen.addEventListener('click', () => { void toggleFullscreen() })
drawButton.addEventListener('click', toggleDrawing)
control.querySelector('#overview-button')!.addEventListener('click', () => overview.showModal())
document.querySelector('#presenter-reset')!.addEventListener('click', () => {
  startedAt = Date.now()
  updateTimer()
})
window.addEventListener('hashchange', readLocation)
window.addEventListener('popstate', readLocation)
new ResizeObserver(resize).observe(stage)

window.addEventListener('keydown', (event) => {
  if (isCapture || isPreview || event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented || overview.open || imageView.open) return
  const field = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]')
  const activated = (event.key === ' ' || event.key === 'Enter') && event.target instanceof HTMLElement && event.target.closest('button, a, summary, [role=button]')
  if (field || activated) return

  switch (event.key) {
    case 'ArrowLeft':
    case 'PageUp':
      previousStep()
      break
    case ' ':
    case 'ArrowRight':
    case 'PageDown':
      nextStep()
      break
    case 'ArrowUp':
      previousSlide()
      break
    case 'ArrowDown':
      nextSlide()
      break
    case 'Home':
      show(1)
      break
    case 'End':
      show(articles.length)
      break
    case 'p':
    case 'P':
      openPresenter()
      break
    case 'f':
    case 'F':
      void toggleFullscreen()
      break
    case 'o':
    case 'O':
      overview.showModal()
      break
    case 'd':
    case 'D':
      toggleDrawing()
      break
    case 'c':
    case 'C':
      if (canvas.hidden) return
      drawings.delete(current)
      mountDrawing()
      break
    default:
      return
  }
  event.preventDefault()
})

for (const article of articles) article.hidden = true
readLocation()
if (isPresenter) {
  togglePresenter()
  opener?.postMessage({ presenterReady: true }, messageOrigin)
}
resize()

if (!isCapture && !isPreview) setupLiveCode()

const recordButton = control.querySelector<HTMLButtonElement>('#record-button')!
let recorder: MediaRecorder | undefined
if (!isCapture && !isPreview && navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined') {
  recordButton.hidden = false
  recordButton.addEventListener('click', async () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }

    recordButton.disabled = true
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const chunks: BlobPart[] = []
      const session = new MediaRecorder(stream)
      recorder = session
      const selected = stream
      session.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })
      session.addEventListener('stop', () => {
        for (const track of selected.getTracks()) track.stop()
        recordButton.textContent = 'Record'
        if (!chunks.length) return
        const blob = new Blob(chunks, { type: session.mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = session.mimeType.includes('mp4') ? 'presentation.mp4' : 'presentation.webm'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }, { once: true })
      session.start()
      recordButton.textContent = 'Stop recording'
    }
    catch {
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
    finally {
      recordButton.disabled = false
    }
  })
}
