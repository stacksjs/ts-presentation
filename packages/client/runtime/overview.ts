import type { ClickBounds, SlideRoute } from './navigation.ts'
import { slideHash } from './navigation.ts'

interface Card {
  container: HTMLElement
  link: HTMLAnchorElement
  viewport: HTMLElement
  slider?: HTMLInputElement
  notes?: HTMLElement
  notesSource?: HTMLElement
  step: number
}

interface OverviewGrid {
  updateSlides(): void
  refreshReveals(): void
  select(slide: number, focus?: boolean): void
}

interface OverviewOptions {
  routes: SlideRoute[]
  articles: HTMLElement[]
  notes: HTMLElement[]
  bounds: ClickBounds[]
  width: number
  height: number
  origin: string
  render(index: number, step: number, nearViewport: boolean): void
}

export function setupOverviewGrid(stage: HTMLElement, options: OverviewOptions): OverviewGrid {
  const { routes, articles, notes, bounds, width, height, origin } = options
  const embedded = parent !== window
  const audienceUrl = new URL(location.href)
  audienceUrl.searchParams.delete('overview')
  const cards: Card[] = []
  const indexes = new WeakMap<Element, number>()
  const visible = new Set<HTMLElement>()
  let current = 0
  stage.setAttribute('aria-label', 'Slide overview')
  stage.style.setProperty('--overview-ratio', `${width} / ${height}`)
  const sizes = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries)
      (target as HTMLElement).style.setProperty('--overview-scale', String(contentRect.width / width))
  })
  const tiles = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const index = indexes.get(entry.target)
      const card = index === undefined ? undefined : cards[index]
      if (index === undefined || !card || card.viewport !== entry.target) continue
      if (entry.isIntersecting) {
        visible.add(card.viewport)
        options.render(index, card.step, true)
      }
      else visible.delete(card.viewport)
    }
  }, { root: stage, rootMargin: '240px' })

  function render(index: number): void {
    const card = cards[index]
    const bound = bounds[index]
    card.step = card.slider ? Math.min(bound.end, Math.max(bound.start, card.step)) : bound.end
    if (card.slider) {
      card.slider.min = String(bound.start)
      card.slider.max = String(bound.end)
      card.slider.value = String(card.step)
      card.slider.closest('label')!.hidden = bound.start === bound.end
    }
    for (const note of card.notes?.querySelectorAll<HTMLElement>('[data-note-step]') ?? [])
      note.hidden = Number(note.dataset.noteStep) > card.step
    options.render(index, card.step, visible.has(card.viewport))
  }

  function createCard(index: number): Card {
    const container = document.createElement('section')
    container.className = 'overview-card'
    const viewport = document.createElement('div')
    viewport.className = 'overview-thumbnail'
    viewport.setAttribute('aria-hidden', 'true')
    const link = document.createElement('a')
    link.className = 'overview-card-link'
    link.dataset.overviewSlide = String(index + 1)
    if (embedded) link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      parent.postMessage({ presentationOverviewSelect: index + 1 }, origin)
    })
    viewport.addEventListener('click', () => link.click())

    const card: Card = { container, link, viewport, step: bounds[index].end }
    container.append(viewport, link)
    if (!embedded) {
      const label = document.createElement('label')
      label.className = 'overview-reveal'
      label.textContent = 'Reveal'
      const slider = document.createElement('input')
      slider.type = 'range'
      slider.setAttribute('aria-label', `Reveal step for slide ${index + 1}`)
      slider.addEventListener('input', () => {
        card.step = slider.valueAsNumber
        render(index)
      })
      label.append(slider)
      container.append(label)
      card.slider = slider
    }
    stage.append(container)
    indexes.set(viewport, index)
    sizes.observe(viewport)
    tiles.observe(viewport)
    return card
  }

  function updateNotes(card: Card, source: HTMLElement): void {
    if (embedded || card.notesSource === source) return
    card.notesSource = source
    if (!source.hasAttribute('data-has-notes')) {
      card.notes?.parentElement?.remove()
      card.notes = undefined
      return
    }
    const content = source.cloneNode(true) as HTMLElement
    content.hidden = false
    if (card.notes) card.notes.replaceWith(content)
    else {
      const disclosure = document.createElement('details')
      disclosure.className = 'overview-notes'
      const summary = document.createElement('summary')
      summary.textContent = 'Speaker notes'
      disclosure.append(summary, content)
      card.container.append(disclosure)
    }
    card.notes = content
  }

  function updateSlides(): void {
    for (const { container, viewport } of cards.splice(articles.length)) {
      sizes.unobserve(viewport)
      tiles.unobserve(viewport)
      visible.delete(viewport)
      container.remove()
    }
    for (const [index, article] of articles.entries()) {
      const card = cards[index] ?? (cards[index] = createCard(index))
      const route = routes[index]
      audienceUrl.hash = slideHash(route)
      card.link.href = audienceUrl.href
      const label = `${route.no}. ${route.title}`
      if (card.link.textContent !== label) card.link.textContent = label
      if (article.parentElement !== card.viewport) card.viewport.replaceChildren(article)
      article.hidden = false
      article.inert = true
      updateNotes(card, notes[index])
      render(index)
    }
  }

  function select(slide: number, focus = false): void {
    const card = cards[slide - 1]
    if (!card) return
    if (current !== slide || !card.link.hasAttribute('aria-current')) {
      cards[current - 1]?.link.removeAttribute('aria-current')
      current = slide
      card.link.setAttribute('aria-current', 'page')
      card.container.scrollIntoView({ block: 'nearest' })
    }
    if (focus) card.link.focus({ preventScroll: true })
  }

  stage.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
    const link = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-overview-slide]') : undefined
    if (!link) return
    const index = Number(link.dataset.overviewSlide) - 1
    const columns = getComputedStyle(stage).gridTemplateColumns.split(' ').length
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1
      : index + (offsets[event.key as keyof typeof offsets] ?? 0)
    if (target === index || !cards[target]) return
    event.preventDefault()
    cards[target].link.focus()
  })
  return { updateSlides, refreshReveals: () => cards.forEach((_, index) => render(index)), select }
}
