import { defaultCanvas } from '../../types/src/canvas.ts'
import { createAutoFitText } from './auto-fit-text.ts'
import { setupCodeCopy, setupCodeTabs } from './code-controls.ts'
import { setupCodeDiffs } from './code-diff.ts'
import { createSlideConditions } from './conditions.ts'
import { mountContextMenu } from './context-menu.ts'
import { setupDiagramActions } from './diagram-actions.ts'
import type { LiveDeck } from '../../types/src/dev-protocol.ts'
import type { LiveManifest } from './dev-updates.ts'
import { watchLiveDeck } from './dev-updates.ts'
import { setupDrags } from './drag-player.ts'
import { carryGlobalLayers } from './global-layers.ts'
import { setupGotoDialog } from './goto.ts'
import { setupDrawings } from './drawing-player.ts'
import type { DrawingClientConfig } from '../../types/src/drawings.ts'
import { setupLiveCode, syncLiveAutorun } from './live-code.ts'
import { mountInlineMath } from './inline-math.ts'
import { createSlideMedia } from './media.ts'
import { mountNotesPage, mountViewLinks, notesSync } from './notes-page.ts'
import type { ClickBounds, SlideMode, SlidePosition, SlideRoute } from './navigation.ts'
import { clickBounds, createNavigationContext, nextPosition, previousPosition, slidePosition } from './navigation.ts'
import type { DeckPage } from './routing.ts'
import { deckLocation, readDeckLocation, resolveRouterMode } from './routing.ts'
import { setupOverviewGrid } from './overview.ts'
import { setupPresenter } from './presenter.ts'
import { setupPresenterTimer } from './presenter-timer.ts'
import { collectReveals, prepareSwitchPrint, showReveals } from './reveals.ts'
import { setupSideEditor } from './side-editor.ts'
import type { NavOperations, ShortcutOptions } from '../../types/src/shortcuts.ts'
import { registerShortcuts } from './shortcuts.ts'
import { createSlideTransitions } from './slide-transitions.ts'

const canvasWidth = Number(document.documentElement.dataset.slideWidth) || defaultCanvas.width
const canvasHeight = Number(document.documentElement.dataset.slideHeight) || defaultCanvas.height
const stage = document.querySelector<HTMLElement>('#stage')!
const fittedText = createAutoFitText(stage)
const articles = [...stage.querySelectorAll<HTMLElement>(':scope > article')]
const notesPanel = document.querySelector<HTMLElement>('#presenter-notes')!
const notes = [...notesPanel.querySelectorAll<HTMLElement>(':scope > section')]
const control = document.querySelector<HTMLElement>('#controls')!
const goto = control.querySelector<HTMLSelectElement>('#goto')!
const previous = control.querySelector<HTMLButtonElement>('#previous')!
const next = control.querySelector<HTMLButtonElement>('#next')!
const presenter = control.querySelector<HTMLButtonElement>('#presenter')!
const fullscreen = control.querySelector<HTMLButtonElement>('#fullscreen')!
const drawButton = control.querySelector<HTMLButtonElement>('#draw-button')!
const overview = document.querySelector<HTMLDialogElement>('#overview')!
const overviewFrame = overview.querySelector('iframe')!
const overviewLink = overview.querySelector<HTMLAnchorElement>('#overview-page-link')!
const imageView = document.querySelector<HTMLDialogElement>('#image-view')!
const detail = imageView.querySelector('img')!
const routes: SlideRoute[] = JSON.parse(document.querySelector('#presentation-navigation')!.textContent ?? '[]')
const aliases = new Map(routes.flatMap(route => route.alias ? [[route.alias, route.no]] : []))
const routing = { base: document.documentElement.dataset.presentationBase ?? '/', mode: resolveRouterMode(document.documentElement.dataset.routerMode) }
const params = new URLSearchParams(location.search)
const initialLocation = readDeckLocation(new URL(location.href), routing, aliases)
const isCapture = initialLocation.page === 'export'
const captureSteps = params.has('steps') || (isCapture && !params.has('capture') && initialLocation.click !== undefined)
const isOverview = initialLocation.page === 'overview'
const isEntry = initialLocation.page === 'entry'
const isNotes = initialLocation.page === 'notes' && !document.documentElement.hasAttribute('data-without-notes')
const isPreview = initialLocation.page === 'preview' || isOverview || isEntry || isNotes
const isPresenter = initialLocation.page === 'presenter'
const slideTransitions = createSlideTransitions(stage, !isCapture && !isPreview)
const opener: Window | null = isPresenter ? window.opener : null
const messageOrigin = location.protocol === 'file:' ? '*' : location.origin
const disclosures: HTMLDetailsElement[][] = []
const screenshots: HTMLImageElement[][] = []
const noteSteps: HTMLElement[][] = []

const defaultClickAnimation = document.documentElement.dataset.clickAnimation
const reveals: ReturnType<typeof collectReveals>[] = []
const bounds: ClickBounds[] = []
const isLive = !isCapture && !isEntry && document.documentElement.dataset.liveCompile === 'true'
const slideMode = (): SlideMode => isNotes ? 'notes' : isOverview ? 'overview' : isPreview ? 'preview' : isCapture ? 'export' : isPresenter || !notesPanel.hidden ? 'presenter' : 'slide'
const conditions = createSlideConditions(slideMode, refreshConditions, isCapture ? params.get('capture-color') : undefined)
const currentUrl = () => new URL(location.href)
const audienceUrl = (route: SlideRoute, click?: number) => deckLocation(currentUrl(), routing, 'slide', route, click)

function writePosition(slide: number, click: number, replace: boolean): void {
  if (routing.mode === 'memory') return
  const page = isCapture ? 'export' : isNotes ? 'notes' : isOverview ? 'overview' : isPreview ? 'preview' : isPresenter ? 'presenter' : 'slide'
  const url = deckLocation(currentUrl(), routing, page, routes[slide - 1], click)
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
}

function mountSlide(article: HTMLElement, index: number): void {
  if (!isCapture && (routing.mode === 'hash' || routing.mode === 'history')) {
    for (const link of article.querySelectorAll<HTMLElement>('a[data-slide-link]')) {
      const target = routes[Number(link.dataset.slideLink) - 1]
      if (target) link.setAttribute('href', audienceUrl(target, Number(link.dataset.slideClick) || undefined).href)
    }
  }
  updateSlideContent(article)
  mountInlineMath(notes[index])
  reveals[index] = collectReveals(article, routes[index].frontmatter.clickAnimation || defaultClickAnimation, updateSlideContent)
  disclosures[index] = [...article.querySelectorAll('details')]
  screenshots[index] = [...article.querySelectorAll<HTMLImageElement>('img[data-zoom]')]
  for (const image of screenshots[index]) {
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `Enlarge ${image.alt || 'image'}`)
  }
  noteSteps[index] = [...notes[index].querySelectorAll<HTMLElement>('[data-note-step]')]
  const noteClicks = Number(notes[index].dataset.noteClicks ?? 0)
  bounds[index] = clickBounds(routes[index].frontmatter, Math.max(reveals[index].total, noteSteps[index].length - 1, noteClicks))
  article.dataset.clicks = String(bounds[index].end)
  article.dataset.clicksStart = String(bounds[index].start)
  prepareSwitchPrint(reveals[index], bounds[index].end)
}

function updateSlideContent(container: HTMLElement): void {
  conditions.update(container)
  mountInlineMath(container)
  if (!isCapture && !isPreview) mountCodeEditors(container)
}

articles.forEach(mountSlide)
let current = 1
let click = 0
let popup: Window | null = null
document.body.classList.add('playing')
if (isPreview) document.body.classList.add('previewing')
if (isCapture) document.body.classList.add('capturing')
if (isOverview) document.body.classList.add('overview-page')

let presenterControls: ReturnType<typeof setupPresenter> | undefined
let sideEditor: ReturnType<typeof setupSideEditor> | undefined
const position = (): SlidePosition => ({ slide: current, click })

function viewUrl(page: DeckPage): URL {
  const url = new URL(document.baseURI)
  url.search = ''
  url.hash = ''
  const ambiguous = (page === 'entry' || page === 'notes' || page === 'overview') && aliases.has(page)
  return deckLocation(url, ambiguous ? { ...routing, mode: 'legacy' } : routing, page, routes[0])
}

if (isEntry) {
  document.body.classList.add('entry-page')
  const entry = document.querySelector<HTMLElement>('#deck-entry')!
  mountViewLinks(entry, viewUrl)
  entry.hidden = false
}
if (isNotes) {
  document.body.classList.add('notes-page')
  document.title = `Notes - ${document.title}`
}
else if (!isPreview && !isCapture) mountViewLinks(notesPanel, viewUrl)
const noteView = isNotes ? mountNotesPage(notesPanel, stage, viewUrl, toggleFullscreen) : undefined
const sharesNotes = !isCapture && (!isPreview || isNotes)
const notesFeed = sharesNotes ? notesSync(isNotes ? state => show(state.slide, state.click, false, false) : undefined) : undefined
const timer = sharesNotes ? setupPresenterTimer(notesPanel) : undefined


function resize(): void {
  const inset = isCapture || isPreview ? 0 : 24
  const width = Math.max(1, stage.clientWidth - inset)
  const height = Math.max(1, stage.clientHeight - inset)
  stage.style.setProperty('--slide-scale', String(Math.min(width / canvasWidth, height / canvasHeight)))
}

function syncPeer(data: Record<string, unknown>): void {
  (opener ?? popup)?.postMessage(data, messageOrigin)
}

function showCurrentReveals(animate: boolean): void {
  showReveals(reveals[current - 1], click, animate, Number(stage.style.getPropertyValue('--slide-scale')) || 1)
  fittedText(articles[current - 1])
  if (!isCapture && !isPreview) syncLiveAutorun(articles[current - 1])
}

const refreshCode = () => showCurrentReveals(false)
const codeTabs = !isCapture && !isPreview ? setupCodeTabs(stage, (codeTab) => {
  refreshCode()
  syncPeer({ slide: current, codeTab })
}) : undefined
const drags = !isCapture && !isPreview ? setupDrags(stage, (slide, presentationDrag) => {
  syncPeer({ dragSlide: articles.indexOf(slide) + 1, presentationDrag })
}, isLive) : undefined
const media = createSlideMedia(!isCapture && !isPreview)
if (isCapture) {
  window.presentationMediaReady = media.ready
  window.presentationFitText = root => fittedText(root, true)
}
const overviewGrid = isOverview ? setupOverviewGrid(stage, {
  routes, articles, notes, bounds, width: canvasWidth, height: canvasHeight, origin: messageOrigin, audienceUrl,
  render(index, step, nearViewport) {
    showReveals(reveals[index], step, false, 1)
    if (nearViewport) media.show(articles[index])
  },
}) : undefined

function displayNotes(selected: number, step: number, changed: boolean): void {
  notes[selected - 1].hidden = false
  noteSteps[selected - 1].forEach((note, index) => { note.hidden = index > step })
  if (changed) notesPanel.scrollTop = 0
  else if (!notesPanel.hidden && step > 0) {
    const stepNotes = noteSteps[selected - 1][step]
    if (stepNotes) {
      const overflow = stepNotes.getBoundingClientRect().bottom - notesPanel.getBoundingClientRect().bottom + 14
      if (overflow > 0) notesPanel.scrollTop += overflow
    }
  }
}

function show(number: number, step?: number, writeHistory = true, sync = true, refresh = false): void {
  if (isEntry) return
  slideTransitions.flush()
  const { slide: selected, click: nextStep } = slidePosition(number, step, bounds)
  if (!overviewGrid && !refresh && selected === current && nextStep === click && !articles[current - 1].hidden) return
  const slideChanged = selected !== current
  const animate = !isCapture && !isPreview && selected === current && nextStep !== click
  if (overviewGrid) {
    if (writeHistory && (slideChanged || nextStep !== click)) writePosition(selected, nextStep, !slideChanged)
    current = selected
    click = nextStep
    overviewGrid.select(current)
    return
  }

  if (noteView) {
    if (slideChanged && notes[current - 1]) notes[current - 1].hidden = true
    current = selected
    click = nextStep
    displayNotes(current, click, slideChanged)
    noteView.update(routes[current - 1], position(), bounds[current - 1], routes.length)
    return
  }

  function commit(retainOutgoing: boolean): void {
    if (writeHistory && (slideChanged || nextStep !== click)) writePosition(selected, nextStep, !slideChanged)
    drags?.clear()
    if (slideChanged) {
      if (imageView.open) imageView.close()
      if (!isCapture && !isPreview) carryGlobalLayers(articles[current - 1], articles[selected - 1])
      if (!retainOutgoing) articles[current - 1].hidden = true
      notes[current - 1].hidden = true
    }
    current = selected
    click = nextStep
    const active = articles[current - 1]
    active.hidden = false
    for (const frame of active.querySelectorAll<HTMLIFrameElement>('iframe[data-presentation-tweet]:not([src])')) {
      if (frame.dataset.src) frame.src = frame.dataset.src
    }
    showCurrentReveals(animate)
    media.show(active)
    conditions.observe(active)
    displayNotes(current, click, slideChanged)
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
    if (!refresh) notesFeed?.publish(here)
    if (sync) syncPeer({ presentationSlide: current, presentationClick: click })
  }

  const previousSlide = articles[current - 1]
  const initial = previousSlide.hidden
  if (refresh) slideTransitions.stop()
  if (refresh || (!initial && !slideChanged)) return commit(false)
  const transition = routes[(initial ? selected : Math.min(current, selected)) - 1].transition
  slideTransitions.play(transition, !initial && selected < current, initial ? undefined : previousSlide, articles[selected - 1], commit)
}

function nextStep(): void {
  slideTransitions.flush()
  const upcoming = nextPosition(position(), bounds)
  if (upcoming) show(upcoming.slide, upcoming.click)
}

function previousStep(): void {
  slideTransitions.flush()
  const previous = previousPosition(position(), bounds)
  if (previous) show(previous.slide, previous.click)
}

function nextSlide(): void {
  slideTransitions.flush()
  if (current < articles.length) show(current + 1)
}

function previousSlide(): void {
  slideTransitions.flush()
  if (current > 1) show(current - 1)
}

function readLocation(): void {
  const id = location.hash.slice(1)
  const key = id.replace(/^\//, '').split('/')[0]
  if (id && !aliases.has(key) && !/^(?:slide-)?\d+$/.test(key) && document.getElementById(id) && !articles[current - 1].hidden) return
  const target = readDeckLocation(currentUrl(), routing, aliases)
  if (routing.mode === 'hash' && target.page !== initialLocation.page) {
    location.reload()
    return
  }
  const click = isCapture && !captureSteps ? Number.POSITIVE_INFINITY : target.click
  show(target.slide, click, false)
}

const navigation = window.presentationNavigation = createNavigationContext(routes, slideMode,
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

function togglePresenter(): void {
  notesPanel.hidden = !notesPanel.hidden
  document.body.classList.toggle('presenting', !notesPanel.hidden)
  presenter.setAttribute('aria-pressed', String(!notesPanel.hidden))
  refreshConditions()
  if (!notesPanel.hidden) presenterControls ??= setupPresenter(routes, bounds, step => show(current, step), (route, click) =>
    deckLocation(currentUrl(), routing, 'preview', route, click))
  presenterControls?.setActive(!notesPanel.hidden)
  presenterControls?.update(position())
  drawing?.refresh()
  timer?.setActive(!notesPanel.hidden)
  resize()
}

function openPresenter(): void {
  if (isPresenter) {
    togglePresenter()
    return
  }
  const url = deckLocation(currentUrl(), routing, 'presenter', routes[current - 1], click)
  url.searchParams.delete('editor')
  popup = window.open(url, 'ts-presentation-presenter', 'popup,width=1130,height=750')
  if (!popup) togglePresenter()
}

function exitPresenter(): void {
  if (!isPresenter) togglePresenter()
  else if (opener) window.close()
  else location.assign(audienceUrl(routes[current - 1], click).href)
}

function sendOverviewPosition(): void {
  if (overview.open) overviewFrame.contentWindow?.postMessage({ presentationPreview: position() }, messageOrigin)
}

function openOverview(): void {
  const url = deckLocation(currentUrl(), routing, 'overview', routes[current - 1])
  for (const name of ['editor', 'resume']) url.searchParams.delete(name)
  overviewLink.href = url.href
  if (!overviewFrame.hasAttribute('src')) overviewFrame.src = url.href
  overview.showModal()
  sendOverviewPosition()
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) || !event.source) return
  if (isEntry || isNotes) return
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
  button: drawButton,
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
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement | SVGAElement>('a') : null
  const target = link?.getAttribute('target')
  if (!link || (target && target !== '_self') || link.hasAttribute('download')) return
  if (!link.hasAttribute('data-slide-link')) {
    const href = link.getAttribute('href')
    if (routing.mode !== 'history' || !href?.startsWith('#') || href.length === 1) return
    let id: string
    try { id = decodeURIComponent(href.slice(1)) }
    catch { return }
    const anchor = articles[current - 1].querySelector(`#${CSS.escape(id)}`)
    if (!anchor) return
    const url = currentUrl()
    url.hash = href
    event.preventDefault()
    if (url.href !== location.href) history.pushState(null, '', url)
    anchor.scrollIntoView()
    return
  }
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
if (!overviewGrid && !isEntry && !isNotes) new ResizeObserver(resize).observe(stage)

if (isOverview && window.parent !== window) window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.parent.postMessage({ presentationOverviewClose: true }, messageOrigin)
    event.preventDefault()
  }
})

const mountCopy = !isCapture && !isPreview ? setupCodeCopy(stage) : undefined
function mountCodeEditors(root: ParentNode = document): void {
  setupLiveCode(root)
  setupCodeDiffs(root)
}
if (mountCopy) mountCodeEditors()

function refreshConditions(): void {
  let changed = false
  for (const [index, article] of articles.entries()) {
    if (!conditions.update(article)) continue
    mountSlide(article, index)
    mountCopy?.(article)
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
  if (click !== previousClick) writePosition(current, click, true)
}

if (overviewGrid) {
  overviewGrid.updateSlides()
  conditions.observe(stage)
}
else for (const article of articles) article.hidden = true
const savedNotes = isNotes ? notesFeed?.saved() : undefined
if (savedNotes) {
  show(savedNotes.slide, savedNotes.click, false, false)
}
else readLocation()
if (isNotes) timer?.setActive(true)
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
  slideTransitions.stop()
  const previous = routes[current - 1]
  const previousClick = click
  const titlesChanged = routes.length !== deck.slides.length
    || deck.slides.some(({ route }, index) => route.title !== routes[index]?.title)
  routes.splice(0, routes.length, ...deck.slides.map(slide => slide.route))
  aliases.clear()
  for (const route of routes) if (route.alias) aliases.set(route.alias, route.no)
  if (titlesChanged) updateSlideTitles()
  const title = isNotes ? `Notes - ${deck.title}` : deck.title
  if (document.title !== title) document.title = title
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
    if (mountCopy) for (const article of replaced) mountCopy(article)
  }
  if (overviewGrid && (replaced.length || titlesChanged)) {
    overviewGrid.updateSlides()
    conditions.observe(stage)
  }
  current = Math.min(current, length)
  const selected = previous.alias ? aliases.get(previous.alias) ?? current : current
  show(selected, previousClick, false, false, true)
  if ((location.hash || routing.mode === 'history') && (selected !== previous.no || click !== previousClick || previous.alias !== routes[selected - 1].alias))
    writePosition(selected, click, true)
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

if (!isCapture && !isPreview && !isEntry) {
  const gotoDialog = document.querySelector<HTMLDialogElement>('#goto-dialog')!
  const nav: NavOperations = {
    next: nextStep,
    prev: previousStep,
    nextSlide,
    prevSlide: previousSlide,
    go: navigation.go,
    goFirst: () => show(1),
    goLast: () => show(articles.length),
    toggleDark: conditions.toggleDark,
    toggleOverview: () => overview.open ? overview.close() : openOverview(),
    toggleDrawing: () => drawing?.toggle(),
    escapeOverview: () => overview.close(),
    showGotoDialog: setupGotoDialog(gotoDialog, routes, show),
  }
  let shortcuts: ShortcutOptions[] = [
    { name: 'next_space', key: 'space', fn: nav.next, autoRepeat: true },
    { name: 'prev_space', key: 'Shift+space', fn: nav.prev, autoRepeat: true },
    { name: 'next_right', key: 'right', fn: nav.next, autoRepeat: true },
    { name: 'prev_left', key: 'left', fn: nav.prev, autoRepeat: true },
    { name: 'next_page_key', key: ['PageDown', 'Shift+PageDown'], fn: nav.next, autoRepeat: true },
    { name: 'prev_page_key', key: ['PageUp', 'Shift+PageUp'], fn: nav.prev, autoRepeat: true },
    { name: 'next_down', key: ['down', 'Shift+down'], fn: nav.nextSlide, autoRepeat: true },
    { name: 'prev_up', key: ['up', 'Shift+up'], fn: nav.prevSlide, autoRepeat: true },
    { name: 'next_shift', key: 'Shift+right', fn: nav.nextSlide, autoRepeat: true },
    { name: 'prev_shift', key: 'Shift+left', fn: nav.prevSlide, autoRepeat: true },
    { name: 'first_slide', key: ['Home', 'Shift+Home'], fn: nav.goFirst, autoRepeat: true },
    { name: 'last_slide', key: ['End', 'Shift+End'], fn: nav.goLast, autoRepeat: true },
    { name: 'toggle_overview', key: ['o', 'Shift+o', '`'], fn: nav.toggleOverview },
    { name: 'goto', key: ['g', 'Shift+g'], fn: nav.showGotoDialog },
    { name: 'presenter', key: ['p', 'Shift+p'], fn: openPresenter },
    { name: 'fullscreen', key: ['f', 'Shift+f'], fn: toggleFullscreen },
    { name: 'side_editor', key: ['e', 'Shift+e'], fn: () => {
      if (!sideEditor || document.body.classList.contains('presenting')) return false
      sideEditor.toggle()
    } },
    { name: 'toggle_drawing', key: ['d', 'Shift+d'], fn: () => drawing?.toggle() ?? false },
    { name: 'clear_drawing', key: ['c', 'Shift+c'], fn: () => drawing?.clear() ?? false },
  ]
  for (const setup of window.presentationShortcutSetups ?? []) shortcuts = setup(nav, shortcuts)
  const menu = window.parent === window ? document.querySelector<HTMLElement>('#presentation-context-menu') : null
  const available = () => !overview.open && !imageView.open && !gotoDialog.open
  if (menu) {
    mountContextMenu({
      stage, menu, available,
      context: target => ({ target, navigation, isPresenter: slideMode() === 'presenter', isFullscreen: Boolean(document.fullscreenElement) }),
      defaults() {
        const presenting = slideMode() === 'presenter'
        const editor = document.querySelector('#edit-slide')
        return [
          { name: 'previous-step', label: 'Previous step', action: nav.prev, disabled: previous.disabled },
          { name: 'next-step', label: 'Next step', action: nav.next, disabled: next.disabled },
          { name: 'previous-slide', label: 'Previous slide', action: nav.prevSlide, disabled: current <= 1 },
          { name: 'next-slide', label: 'Next slide', action: nav.nextSlide, disabled: current >= articles.length },
          'separator',
          { name: 'editor', label: editor?.getAttribute('aria-expanded') === 'true' ? 'Hide editor' : 'Show editor',
            action: () => sideEditor?.toggle(), show: Boolean(sideEditor) && !presenting },
          { name: 'drawing', label: drawButton.getAttribute('aria-pressed') === 'true' ? 'Hide drawing toolbar' : 'Show drawing toolbar',
            action: nav.toggleDrawing, show: !drawButton.hidden },
          { name: 'overview', label: 'Show slide overview', action: openOverview },
          { name: 'presenter', label: presenting ? 'Exit presenter view' : 'Open presenter view', action: presenting ? exitPresenter : openPresenter },
          { name: 'fullscreen', label: document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen',
            action: toggleFullscreen, show: Boolean(document.fullscreenElement || document.fullscreenEnabled) },
        ]
      },
    })
  }
  registerShortcuts(shortcuts, () => available() && menu?.hidden !== false)
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
