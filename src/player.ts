import { defaultCanvas } from './canvas.ts'
import { setupDrawings } from './drawing-player.ts'
import type { DrawingClientConfig } from './drawings.ts'
import { setupLiveCode } from './live-code.ts'
import type { SlidePosition, SlideRoute } from './navigation.ts'
import { clickBounds, createNavigationContext, nextPosition, previousPosition, readSlideHash, slideHash, slidePosition } from './navigation.ts'
import { setupPresenter } from './presenter.ts'
import { collectReveals, prepareSwitchPrint, showReveals } from './reveals.ts'

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

const defaultClickAnimation = document.documentElement.dataset.clickAnimation
const reveals = articles.map((article, index) => collectReveals(article, routes[index].frontmatter.clickAnimation || defaultClickAnimation))
const bounds = reveals.map((reveal, index) => clickBounds(routes[index].frontmatter, Math.max(reveal.total, noteSteps[index].length - 1)))
articles.forEach((article, index) => {
  article.dataset.clicks = String(bounds[index].end)
  article.dataset.clicksStart = String(bounds[index].start)
  prepareSwitchPrint(reveals[index], bounds[index].end)
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
  showReveals(reveals[current - 1], click, animate, Number(stage.style.getPropertyValue('--slide-scale')) || 1)
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
  drawing?.refresh()
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
  drawing?.refresh()
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
    presentationDrawing?: unknown
    slide?: unknown
    screenshot?: unknown
    disclosure?: unknown
    open?: unknown
  } | null
  if (data?.presentationDrawing) drawing?.receive(data.presentationDrawing)
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

const drawingConfig: DrawingClientConfig = JSON.parse(document.querySelector('#presentation-drawings')?.textContent ?? '{}')
const drawing = !isCapture && drawingConfig.enabled ? setupDrawings(drawingConfig, {
  stage,
  articles,
  canvas: { width: canvasWidth, height: canvasHeight },
  button: control.querySelector<HTMLButtonElement>('#draw-button')!,
  clearButton: control.querySelector<HTMLButtonElement>('#clear-drawing')!,
  status: control.querySelector<HTMLElement>('#drawing-status')!,
  preview: isPreview,
  presenter: () => isPresenter || !notesPanel.hidden,
  currentSlide: () => current,
  sendToPeer: presentationDrawing => syncPeer({ presentationDrawing }),
}) : undefined

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
      if (!drawing?.toggle()) return
      break
    case 'c':
    case 'C':
      if (!drawing?.clear()) return
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
