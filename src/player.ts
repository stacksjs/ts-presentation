import { defaultCanvas } from './canvas.ts'
import { setupCodeCopy, setupCodeTabs } from './code-controls.ts'
import type { LiveDeck } from './dev-protocol.ts'
import type { LiveManifest } from './dev-updates.ts'
import { watchLiveDeck } from './dev-updates.ts'
import { setupDrags } from './drag-player.ts'
import { setupDrawings } from './drawing-player.ts'
import type { DrawingClientConfig } from './drawings.ts'
import { setupLiveCode } from './live-code.ts'
import type { ClickBounds, SlidePosition, SlideRoute } from './navigation.ts'
import { clickBounds, createNavigationContext, nextPosition, previousPosition, readSlideHash, slideHash, slidePosition } from './navigation.ts'
import { setupPresenter } from './presenter.ts'
import { collectReveals, prepareSwitchPrint, showReveals } from './reveals.ts'
import { setupSideEditor } from './side-editor.ts'

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
const disclosures: HTMLDetailsElement[][] = []
const screenshots: HTMLImageElement[][] = []
const noteSteps: HTMLElement[][] = []

const defaultClickAnimation = document.documentElement.dataset.clickAnimation
const reveals: ReturnType<typeof collectReveals>[] = []
const bounds: ClickBounds[] = []
const isLive = !isCapture && document.documentElement.dataset.liveCompile === 'true'

function mountSlide(article: HTMLElement, index: number): void {
  disclosures[index] = [...article.querySelectorAll('details')]
  screenshots[index] = [...article.querySelectorAll<HTMLImageElement>('img[data-zoom]')]
  for (const image of screenshots[index]) {
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `Enlarge ${image.alt || 'image'}`)
  }
  noteSteps[index] = [...notes[index].querySelectorAll<HTMLElement>('[data-note-step]')]
  reveals[index] = collectReveals(article, routes[index].frontmatter.clickAnimation || defaultClickAnimation)
  bounds[index] = clickBounds(routes[index].frontmatter, Math.max(reveals[index].total, noteSteps[index].length - 1))
  article.dataset.clicks = String(bounds[index].end)
  article.dataset.clicksStart = String(bounds[index].start)
  prepareSwitchPrint(reveals[index], bounds[index].end)
}
articles.forEach(mountSlide)
let current = 1
let click = 0
let popup: Window | null = null
let startedAt = Date.now()
let timerTick: ReturnType<typeof setInterval> | undefined
document.body.classList.add('playing')
if (isPreview) document.body.classList.add('previewing')
if (isCapture) document.body.classList.add('capturing')

let presenterControls: ReturnType<typeof setupPresenter> | undefined
let sideEditor: ReturnType<typeof setupSideEditor> | undefined
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

const refreshCode = () => showReveals(reveals[current - 1], click, false, Number(stage.style.getPropertyValue('--slide-scale')) || 1)
const codeTabs = !isCapture && !isPreview ? setupCodeTabs(stage, (codeTab) => {
  refreshCode()
  syncPeer({ slide: current, codeTab })
}) : undefined
const drags = !isCapture && !isPreview ? setupDrags(stage, (slide, presentationDrag) => {
  syncPeer({ dragSlide: articles.indexOf(slide) + 1, presentationDrag })
}, isLive) : undefined

function show(number: number, step?: number, writeHistory = true, sync = true, refresh = false): void {
  const { slide: selected, click: nextStep } = slidePosition(number, step, bounds)
  if (!refresh && selected === current && nextStep === click && !articles[current - 1].hidden) return
  const slideChanged = selected !== current
  const animate = !isCapture && !isPreview && selected === current && nextStep !== click
  if (writeHistory && (selected !== current || nextStep !== click)) {
    const hash = slideHash(routes[selected - 1], nextStep)
    if (selected === current) history.replaceState(null, '', hash)
    else history.pushState(null, '', hash)
  }

  drags?.clear()
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
  if (!refresh) sideEditor?.follow()
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
  const id = location.hash.slice(1)
  const key = id.replace(/^\//, '').split('/')[0]
  if (id && !aliases.has(key) && !/^(?:slide-)?\d+$/.test(key) && document.getElementById(id) && !articles[current - 1].hidden) return
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
  url.searchParams.delete('editor')
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
    presentationDrag?: unknown
    dragSlide?: number
    codeTab?: { group?: unknown, tab?: unknown }
    codeTabs?: { group?: unknown, tab?: unknown }[]
    slide?: unknown
    screenshot?: unknown
    disclosure?: unknown
    open?: unknown
  } | null
  if (data?.presentationDrawing) drawing?.receive(data.presentationDrawing)
  if (data?.presentationDrag && Number.isInteger(data.dragSlide) && articles[data.dragSlide! - 1])
    drags?.receive(articles[data.dragSlide! - 1], data.presentationDrag)
  if (data?.presenterReady === true && popup) {
    popup.postMessage({ presentationSlide: current, presentationClick: click, codeTabs: codeTabs?.selections() }, messageOrigin)
  }
  if (typeof data?.presentationSlide === 'number' && Number.isInteger(data.presentationSlide)) {
    const step = typeof data.presentationClick === 'number' && Number.isInteger(data.presentationClick) ? data.presentationClick : 0
    show(data.presentationSlide, step, true, false)
  }
  if (isPresenter && Array.isArray(data?.codeTabs)) {
    let changed = false
    for (const selection of data.codeTabs) {
      if (typeof selection?.group === 'string' && typeof selection.tab === 'number')
        changed = codeTabs?.select(selection.group, selection.tab) || changed
    }
    if (changed) refreshCode()
  }
  if (data?.slide !== current) return
  if (typeof data.codeTab?.group === 'string' && typeof data.codeTab.tab === 'number' && codeTabs?.select(data.codeTab.group, data.codeTab.tab))
    refreshCode()

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

stage.addEventListener('toggle', (event) => {
  if (!(event.target instanceof HTMLDetailsElement)) return
  const disclosure = disclosures[current - 1].indexOf(event.target)
  if (disclosure >= 0) syncPeer({ slide: current, disclosure, open: event.target.open })
}, true)
imageView.addEventListener('close', () => syncPeer({ slide: current, screenshot: -1 }))
stage.addEventListener('click', event => zoom(event.target))
stage.addEventListener('click', (event) => {
  if (isCapture || isPreview || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-slide-link]') : null
  if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
  const slide = Number(link.dataset.slideLink)
  const click = link.dataset.slideClick === undefined ? undefined : Number(link.dataset.slideClick)
  if (!Number.isInteger(slide) || slide < 1 || slide > articles.length || (click !== undefined && !Number.isSafeInteger(click))) return
  event.preventDefault()
  show(slide, click)
})
stage.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return
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
    case 'e':
    case 'E':
      if (!sideEditor || document.body.classList.contains('presenting')) return
      sideEditor.toggle()
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

const mountCopy = !isCapture && !isPreview ? setupCodeCopy(stage) : undefined
if (mountCopy) setupLiveCode()

function template(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

function updateSlideTitles(): void {
  const choices = document.createDocumentFragment()
  const items = document.createDocumentFragment()
  for (const { no, title } of routes) {
    const option = document.createElement('option')
    option.value = String(no)
    option.textContent = `${no}. ${title}`
    choices.append(option)
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.value = String(no)
    const digit = document.createElement('span')
    digit.textContent = String(no)
    button.append(digit, ` ${title}`)
    item.append(button)
    items.append(item)
  }
  goto.replaceChildren(choices)
  overview.querySelector('ol')!.replaceChildren(items)
}

function applyLiveDeck(deck: LiveDeck, before: LiveManifest): boolean {
  if (deck.frame !== before.frame) {
    if (!sideEditor?.dirty()) location.reload()
    return false
  }
  if (drags?.active() || document.activeElement?.matches('.live-code textarea')) return false
  const previous = routes[current - 1]
  const previousClick = click
  const titlesChanged = routes.length !== deck.slides.length
    || deck.slides.some(({ route }, index) => route.title !== routes[index]?.title)
  routes.splice(0, routes.length, ...deck.slides.map(slide => slide.route))
  aliases.clear()
  for (const route of routes) if (route.alias) aliases.set(route.alias, route.no)
  if (titlesChanged) updateSlideTitles()
  if (document.title !== deck.title) document.title = deck.title
  if (deck.deckCss !== before.deckCss) {
    document.querySelector<HTMLLinkElement>('#deck-styles')!.href = `./deck.css?revision=${encodeURIComponent(deck.deckCss)}`
  }
  const replaced: HTMLElement[] = []
  for (const [index, slide] of deck.slides.entries()) {
    if (before.revisions[index] === slide.revision) continue
    const article = template(slide.html).firstElementChild as HTMLElement
    const note = template(slide.notes).firstElementChild as HTMLElement
    article.hidden = true
    const oldArticle = articles[index]
    const oldInk = oldArticle?.querySelector(':scope > svg[data-presentation-drawing]')
    if (oldInk) {
      article.querySelector(':scope > svg[data-presentation-drawing]')?.remove()
      article.append(oldInk)
    }
    if (oldArticle) oldArticle.replaceWith(article)
    else stage.append(article)
    if (notes[index]) notes[index].replaceWith(note)
    else notesPanel.append(note)
    articles[index] = article
    notes[index] = note
    document.querySelectorAll(`style[data-slide-style="${index + 1}"]`).forEach((style) => { style.remove() })
    if (slide.css) document.head.append(template(slide.css))
    mountSlide(article, index)
    replaced.push(article)
  }
  const length = deck.slides.length
  for (const element of [...articles.slice(length), ...notes.slice(length)]) element.remove()
  for (const list of [articles, notes, bounds, reveals, disclosures, screenshots, noteSteps]) list.length = length
  for (const style of document.querySelectorAll<HTMLElement>('style[data-slide-style]'))
    if (Number(style.dataset.slideStyle) > length) style.remove()
  if (replaced.length) {
    if (imageView.open) imageView.close()
    codeTabs?.refresh()
    drags?.updateElements()
    if (mountCopy) for (const article of replaced) { mountCopy(article); setupLiveCode(article) }
  }
  current = Math.min(current, length)
  const selected = previous.alias ? aliases.get(previous.alias) ?? current : current
  show(selected, previousClick, false, false, true)
  if (location.hash && (selected !== previous.no || click !== previousClick || previous.alias !== routes[selected - 1].alias))
    history.replaceState(null, '', slideHash(routes[selected - 1], click))
  return true
}

if (isLive) {
  const notice = control.querySelector<HTMLElement>('#live-update-status')!
  const updates = watchLiveDeck(applyLiveDeck, () => sideEditor?.follow(true), (issue) => {
    notice.textContent = issue
    notice.hidden = !issue
  })
  if (updates && !isPreview && !isPresenter) sideEditor = setupSideEditor({ slide: () => current, ...updates })
}

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
