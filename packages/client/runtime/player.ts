import { defaultCanvas } from '../../types/src/canvas.ts'
import { setupCodeCopy, setupCodeTabs } from './code-controls.ts'
import { createSlideConditions } from './conditions.ts'
import { setupDiagramActions } from './diagram-actions.ts'
import type { LiveDeck } from '../../types/src/dev-protocol.ts'
import type { LiveManifest } from './dev-updates.ts'
import { watchLiveDeck } from './dev-updates.ts'
import { setupDrags } from './drag-player.ts'
import { setupDrawings } from './drawing-player.ts'
import type { DrawingClientConfig } from '../../types/src/drawings.ts'
import { setupLiveCode } from './live-code.ts'
import { createSlideMedia } from './media.ts'
import type { ClickBounds, SlideMode, SlidePosition, SlideRoute } from './navigation.ts'
import { clickBounds, createNavigationContext, nextPosition, previousPosition, readSlideHash, slideHash, slidePosition } from './navigation.ts'
import { setupOverviewGrid } from './overview.ts'
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
const overviewFrame = overview.querySelector('iframe')!
const overviewLink = overview.querySelector<HTMLAnchorElement>('#overview-page-link')!
const imageView = document.querySelector<HTMLDialogElement>('#image-view')!
const detail = imageView.querySelector('img')!
const timer = document.querySelector<HTMLElement>('#presenter-time')!
const routes: SlideRoute[] = JSON.parse(document.querySelector('#presentation-navigation')!.textContent ?? '[]')
const params = new URLSearchParams(location.search)
const isCapture = params.has('capture')
const captureSteps = params.has('steps')
const isOverview = !isCapture && params.has('overview')
const isPreview = params.has('preview') || isOverview
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
const slideMode = (): SlideMode => isOverview ? 'overview' : isPreview ? 'preview' : isCapture ? 'export' : isPresenter || !notesPanel.hidden ? 'presenter' : 'slide'
const conditions = createSlideConditions(slideMode, refreshConditions)

function mountSlide(article: HTMLElement, index: number): void {
  conditions.update(article)
  reveals[index] = collectReveals(article, routes[index].frontmatter.clickAnimation || defaultClickAnimation, conditions.update)
  disclosures[index] = [...article.querySelectorAll('details')]
  screenshots[index] = [...article.querySelectorAll<HTMLImageElement>('img[data-zoom]')]
  for (const image of screenshots[index]) {
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `Enlarge ${image.alt || 'image'}`)
  }
  noteSteps[index] = [...notes[index].querySelectorAll<HTMLElement>('[data-note-step]')]
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
if (isOverview) document.body.classList.add('overview-page')

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
const media = createSlideMedia(!isCapture && !isPreview)
if (isCapture) window.presentationMediaReady = media.ready
const overviewGrid = isOverview ? setupOverviewGrid(stage, {
  routes, articles, notes, bounds, width: canvasWidth, height: canvasHeight, origin: messageOrigin,
  render(index, step, nearViewport) {
    showReveals(reveals[index], step, false, 1)
    if (nearViewport) media.show(articles[index])
  },
}) : undefined

function show(number: number, step?: number, writeHistory = true, sync = true, refresh = false): void {
  const { slide: selected, click: nextStep } = slidePosition(number, step, bounds)
  if (!overviewGrid && !refresh && selected === current && nextStep === click && !articles[current - 1].hidden) return
  const slideChanged = selected !== current
  const animate = !isCapture && !isPreview && selected === current && nextStep !== click
  if (writeHistory && (selected !== current || nextStep !== click)) {
    const hash = slideHash(routes[selected - 1], nextStep)
    if (selected === current) history.replaceState(null, '', hash)
    else history.pushState(null, '', hash)
  }
  if (overviewGrid) {
    current = selected
    click = nextStep
    overviewGrid.select(current)
    return
  }

  drags?.clear()
  if (slideChanged) {
    if (imageView.open) imageView.close()
    articles[current - 1].hidden = true
    notes[current - 1].hidden = true
  }
  current = selected
  click = nextStep
  const active = articles[current - 1]
  active.hidden = false
  for (const frame of active.querySelectorAll<HTMLIFrameElement>('iframe[data-presentation-tweet]:not([src])')) {
    if (frame.dataset.src) frame.src = frame.dataset.src
  }
  notes[current - 1].hidden = false
  showReveals(reveals[current - 1], click, animate, Number(stage.style.getPropertyValue('--slide-scale')) || 1)
  media.show(active)
  conditions.observe(active)
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

window.presentationNavigation = createNavigationContext(routes, slideMode,
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
  refreshConditions()
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

function sendOverviewPosition(): void {
  if (overview.open) overviewFrame.contentWindow?.postMessage({ presentationPreview: position() }, messageOrigin)
}

function openOverview(): void {
  const url = new URL(location.href)
  for (const name of ['editor', 'presenter', 'resume']) url.searchParams.delete(name)
  url.searchParams.set('overview', '1')
  url.hash = slideHash(routes[current - 1])
  overviewLink.href = url.href
  if (!overviewFrame.hasAttribute('src')) overviewFrame.src = url.href
  overview.showModal()
  sendOverviewPosition()
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) || !event.source) return
  if (isPreview) {
    if (event.source !== window.parent || window.parent === window) return
    const position = event.data?.presentationPreview as Partial<SlidePosition> | undefined
    if (Number.isInteger(position?.slide) && Number.isInteger(position?.click)) {
      show(position!.slide!, position!.click!, false, false)
      overviewGrid?.select(current, true)
    }
    return
  }
  if (overview.open && event.source === overviewFrame.contentWindow) {
    const target = event.data?.presentationOverviewSelect
    if (event.data?.presentationOverviewClose === true) overview.close()
    else if (Number.isInteger(target) && target > 0 && target <= routes.length) {
      overview.close()
      if (target !== current) show(target)
    }
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
const drawing = !isCapture && !isOverview && drawingConfig.enabled ? setupDrawings(drawingConfig, {
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
if (!isCapture && !isPreview) setupDiagramActions(stage)
stage.addEventListener('click', (event) => {
  if (isCapture || isPreview || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement | SVGAElement>('a[data-slide-link]') : null
  const target = link?.getAttribute('target')
  if (!link || (target && target !== '_self') || link.hasAttribute('download')) return
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
overviewFrame.addEventListener('load', sendOverviewPosition)
overview.addEventListener('close', () => { if (!overview.open) overviewFrame.removeAttribute('src') })

previous.addEventListener('click', previousStep)
next.addEventListener('click', nextStep)
goto.addEventListener('change', () => show(Number(goto.value)))
presenter.addEventListener('click', openPresenter)
fullscreen.addEventListener('click', () => { void toggleFullscreen() })
control.querySelector('#overview-button')!.addEventListener('click', openOverview)
document.querySelector('#presenter-reset')!.addEventListener('click', () => {
  startedAt = Date.now()
  updateTimer()
})
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://platform.twitter.com') return
  const message = event.data?.['twttr.embed']
  if (message?.method !== 'twttr.private.resize') return
  const size = message.params?.[0]
  const height = size?.height
  if (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1 || height > 1800) return
  for (const frame of stage.querySelectorAll<HTMLIFrameElement>('iframe[data-presentation-tweet]')) {
    if (event.source === frame.contentWindow && size.data?.tweet_id === frame.dataset.presentationTweet) {
      frame.height = String(height)
      frame.closest('.slidev-tweet')?.setAttribute('data-embed-ready', '')
      break
    }
  }
})
window.addEventListener('hashchange', readLocation)
window.addEventListener('popstate', readLocation)
if (!overviewGrid) new ResizeObserver(resize).observe(stage)

window.addEventListener('keydown', (event) => {
  if (isOverview && window.parent !== window && event.key === 'Escape') {
    window.parent.postMessage({ presentationOverviewClose: true }, messageOrigin)
    event.preventDefault()
    return
  }
  if (isCapture || isPreview || event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented || overview.open || imageView.open) return
  const field = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]')
  const activated = (event.key === ' ' || event.key === 'Enter') && event.target instanceof Element && event.target.closest('button, a, summary, [role=button]')
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
      openOverview()
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

const mountCopy = !isCapture && !isPreview ? setupCodeCopy(stage) : undefined
if (mountCopy) setupLiveCode()

function refreshConditions(): void {
  let changed = false
  for (const [index, article] of articles.entries()) {
    if (!conditions.update(article)) continue
    mountSlide(article, index)
    if (mountCopy) { mountCopy(article); setupLiveCode(article) }
    changed = true
  }
  if (!changed) return
  if (overviewGrid) {
    overviewGrid.refreshReveals()
    conditions.observe(stage)
    return
  }
  codeTabs?.refresh()
  drags?.updateElements()
  const previousClick = click
  show(current, click, false, false, true)
  if (click !== previousClick) history.replaceState(null, '', slideHash(routes[current - 1], click))
}

if (overviewGrid) {
  overviewGrid.updateSlides()
  conditions.observe(stage)
}
else for (const article of articles) article.hidden = true
readLocation()
if (isPresenter) {
  togglePresenter()
  opener?.postMessage({ presenterReady: true }, messageOrigin)
}
resize()

function template(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

function updateSlideTitles(): void {
  const choices = document.createDocumentFragment()
  for (const { no, title } of routes) {
    const option = document.createElement('option')
    option.value = String(no)
    option.textContent = `${no}. ${title}`
    choices.append(option)
  }
  goto.replaceChildren(choices)
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
  if (overviewGrid && (replaced.length || titlesChanged)) {
    overviewGrid.updateSlides()
    conditions.observe(stage)
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
  }, document.documentElement.dataset.mcpNavigation === 'true' && !isPreview ? {
    getPosition: position,
    go: (page, clicks) => show(page, clicks, true, false),
  } : undefined)
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
