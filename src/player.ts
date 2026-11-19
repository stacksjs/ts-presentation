import { defaultCanvas } from './canvas.ts'
import { setupLiveCode } from './live-code.ts'

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
const nextTitle = document.querySelector<HTMLElement>('#presenter-next')!
const params = new URLSearchParams(location.search)
const isCapture = params.has('capture')
const captureSteps = params.has('steps')
const isPresenter = params.has('presenter')
const opener: Window | null = isPresenter ? window.opener : null
const messageOrigin = location.protocol === 'file:' ? '*' : location.origin
const aliases = new Map(articles.flatMap((article, index) => article.dataset.route ? [[article.dataset.route, index + 1]] : []))
const disclosures = articles.map(article => [...article.querySelectorAll('details')])
const screenshots = articles.map(article => [...article.querySelectorAll<HTMLImageElement>('img[data-zoom]')])
const noteSteps = notes.map(note => [...note.querySelectorAll<HTMLElement>('[data-note-step]')])

interface Reveal {
  element: HTMLElement
  step: number
  hide: boolean
}

const reveals = articles.map((article) => {
  let cursor = 0
  const groups = article.querySelectorAll('v-clicks')
  for (const group of groups) {
    const childNodes = group.firstElementChild?.matches('ol, ul') ? group.firstElementChild.children : group.children
    for (const child of childNodes) child.setAttribute('v-click', '')
  }
  return [...article.querySelectorAll<HTMLElement>('v-click, v-after, [v-click], [v-after], [data-click]')].map((element): Reveal => {
    const raw = element.getAttribute('data-click') ?? element.getAttribute('v-click') ?? element.getAttribute('at')
    const explicit = raw && /^\d+$/.test(raw) ? Number(raw) : 0
    const after = element.matches('v-after, [v-after]')
    const step = explicit || (after ? Math.max(cursor, 1) : cursor + 1)
    cursor = Math.max(cursor, step)
    return { element, step, hide: element.hasAttribute('hide') }
  })
})

const clickTotals = reveals.map((steps, index) => Math.max(0, ...steps.map(item => item.step), noteSteps[index].length - 1))
articles.forEach((article, index) => { article.dataset.clicks = String(clickTotals[index]) })
let current = 1
let click = 0
let popup: Window | null = null
let startedAt = Date.now()
let timerTick: ReturnType<typeof setInterval> | undefined
document.body.classList.add('playing')
if (isCapture) document.body.classList.add('capturing')

function resize(): void {
  const inset = isCapture ? 0 : 24
  const width = Math.max(1, stage.clientWidth - inset)
  const height = Math.max(1, stage.clientHeight - inset)
  stage.style.setProperty('--slide-scale', String(Math.min(width / canvasWidth, height / canvasHeight)))
}

function syncPeer(data: Record<string, unknown>): void {
  (opener ?? popup)?.postMessage(data, messageOrigin)
}

function show(number: number, step = 0, writeHistory = true, sync = true): void {
  const selected = Math.max(1, Math.min(articles.length, number))
  const nextStep = Math.max(0, Math.min(clickTotals[selected - 1], step))
  if (writeHistory && (selected !== current || nextStep !== click)) {
    const hash = articles[selected - 1].dataset.route || `slide-${selected}`
    const locationHash = `#${hash}${nextStep ? `/${nextStep}` : ''}`
    if (selected === current) history.replaceState(null, '', locationHash)
    else history.pushState(null, '', locationHash)
  }

  if (selected !== current) {
    if (imageView.open) imageView.close()
    articles[current - 1].hidden = true
    notes[current - 1].hidden = true
  }
  current = selected
  click = nextStep
  articles[current - 1].hidden = false
  notes[current - 1].hidden = false
  for (const reveal of reveals[current - 1]) {
    reveal.element.toggleAttribute('data-reveal-hidden', reveal.hide ? click >= reveal.step : click < reveal.step)
  }
  noteSteps[current - 1].forEach((note, index) => { note.hidden = index > click })
  nextTitle.textContent = articles[current]?.getAttribute('aria-label') ? `Next: ${articles[current].getAttribute('aria-label')}` : 'Last slide'
  goto.value = String(current)
  previous.disabled = current === 1 && click === 0
  next.disabled = current === articles.length && click === clickTotals[current - 1]
  if (!canvas.hidden) mountDrawing()
  window.dispatchEvent(new CustomEvent('presentation:slide', { detail: { slide: current, click, title: articles[current - 1].getAttribute('aria-label') } }))
  if (sync) syncPeer({ presentationSlide: current, presentationClick: click })
}

function nextStep(): void {
  if (click < clickTotals[current - 1]) show(current, click + 1)
  else if (current < articles.length) show(current + 1)
}

function previousStep(): void {
  if (click > 0) show(current, click - 1)
  else if (current > 1) show(current - 1, clickTotals[current - 2])
}

function readLocation(): void {
  const hash = location.hash.replace(/^#\/?/, '')
  const [key, step] = hash.split('/')
  const numeric = /^(?:slide-)?(\d+)$/.exec(key)
  const number = numeric ? Number(numeric[1]) : (aliases.get(key) ?? 1)
  show(number, isCapture && !captureSteps ? Number.MAX_SAFE_INTEGER : (/^\d+$/.test(step ?? '') ? Number(step) : 0), false)
}

function updateTimer(): void {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  timer.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
}

function togglePresenter(): void {
  notesPanel.hidden = !notesPanel.hidden
  document.body.classList.toggle('presenting', !notesPanel.hidden)
  presenter.setAttribute('aria-pressed', String(!notesPanel.hidden))
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
  url.hash = location.hash || `slide-${current}`
  popup = window.open(url, 'ts-presentation-presenter', 'popup,width=1130,height=750')
  if (!popup) togglePresenter()
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) || !event.source || event.source !== (opener ?? popup)) return
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
  if (event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented || overview.open || imageView.open) return
  const field = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]')
  const activated = (event.key === ' ' || event.key === 'Enter') && event.target instanceof HTMLElement && event.target.closest('button, a, summary, [role=button]')
  if (field || activated) return

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      previousStep()
      break
    case ' ':
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      nextStep()
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

if (!isCapture) setupLiveCode()

const recordButton = control.querySelector<HTMLButtonElement>('#record-button')!
let recorder: MediaRecorder | undefined
if (!isCapture && navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined') {
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
