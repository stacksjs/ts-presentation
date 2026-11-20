import type { ClickBounds, SlidePosition, SlideRoute } from './navigation.ts'
import type { DeckPage } from './routing.ts'

function notesState(raw: string | null): SlidePosition | undefined {
  if (!raw) return
  try {
    const value: Partial<SlidePosition> | null = JSON.parse(raw)
    if (value && Number.isSafeInteger(value.slide) && value.slide! > 0
      && Number.isSafeInteger(value.click) && value.click! >= 0)
      return { slide: value.slide!, click: value.click! }
  }
  catch {}
}

export function notesSync(receive?: (state: SlidePosition) => void) {
  const key = `ts-presentation-notes:${new URL('.', document.baseURI).pathname}`
  if (receive) {
    window.addEventListener('storage', (event) => {
      if (event.storageArea !== localStorage || event.key !== key) return
      const state = notesState(event.newValue)
      if (state) receive(state)
    })
  }
  return {
    saved(): SlidePosition | undefined {
      try { return notesState(localStorage.getItem(key)) }
      catch { return undefined }
    },
    publish(state: SlidePosition): void {
      try { localStorage.setItem(key, JSON.stringify(state)) }
      catch {}
    },
  }
}

export function mountViewLinks(container: HTMLElement, url: (page: DeckPage) => URL): void {
  for (const link of container.querySelectorAll<HTMLAnchorElement>('[data-deck-page-link]')) {
    const page = link.dataset.deckPageLink as DeckPage
    link.href = url(page).href
  }
}

export function mountNotesPage(panel: HTMLElement, viewport: HTMLElement, url: (page: DeckPage) => URL, toggleFullscreen: () => Promise<void>) {
  const controls = document.querySelector<HTMLElement>('#notes-controls')!
  const output = controls.querySelector<HTMLOutputElement>('#notes-position')!
  const title = panel.querySelector<HTMLElement>('h2')!
  const larger = controls.querySelector<HTMLButtonElement>('#notes-larger')!
  const smaller = controls.querySelector<HTMLButtonElement>('#notes-smaller')!
  const fullscreen = controls.querySelector<HTMLButtonElement>('#notes-fullscreen')!
  const preference = 'ts-presentation-notes-font-size'
  const minimum = 14
  const maximum = 44
  let size = 22
  try { size = Number(localStorage.getItem(preference)) || size }
  catch {}
  function setFontSize(value: number): void {
    size = Math.min(maximum, Math.max(minimum, value))
    panel.style.setProperty('--notes-font-size', `${size}px`)
    larger.disabled = size >= maximum
    smaller.disabled = size <= minimum
    try { localStorage.setItem(preference, String(size)) }
    catch {}
  }

  mountViewLinks(controls, url)
  setFontSize(size)
  larger.addEventListener('click', () => setFontSize(size + 2))
  smaller.addEventListener('click', () => setFontSize(size - 2))
  fullscreen.hidden = !document.fullscreenEnabled
  fullscreen.addEventListener('click', () => { void toggleFullscreen() })
  panel.hidden = false
  viewport.hidden = true
  controls.hidden = false

  return {
    update(route: SlideRoute, current: SlidePosition, bounds: ClickBounds, total: number): void {
      title.textContent = route.title
      const reveal = bounds.end > bounds.start ? ` · Reveal ${current.click} of ${bounds.end}` : ''
      output.textContent = `Slide ${current.slide} of ${total}${reveal}`
    },
  }
}
