import { describe, expect, it } from 'bun:test'
import { createNavigationContext } from '../runtime/navigation.ts'
import type { NavigationActions, SlidePosition, SlideRoute } from '../runtime/navigation.ts'

const routes: SlideRoute[] = [
  { no: 1, title: 'Intro', layout: 'cover', frontmatter: { title: 'Intro', section: 'start' } },
  { no: 2, title: 'Details', alias: 'details', layout: 'two-cols', frontmatter: { title: 'Details', section: 'body' } },
]
const bounds = [{ start: 0, end: 0 }, { start: 1, end: 3 }]
const actions: NavigationActions = { go() {}, next() {}, previous() {}, nextSlide() {}, previousSlide() {} }

describe('presentation navigation context', () => {
  it('exposes current frontmatter as the player moves between slides', () => {
    let position: SlidePosition = { slide: 1, click: 0 }
    const nav = createNavigationContext(routes, () => 'slide', () => position, bounds, actions)
    expect(nav.currentFrontmatter).toEqual({ title: 'Intro', section: 'start' })

    position = { slide: 2, click: 1 }
    expect(nav.currentFrontmatter).toEqual({ title: 'Details', section: 'body' })
    expect(nav.currentLayout).toBe('two-cols')
  })

  it('uses the active export frame for metadata and the table of contents', () => {
    const nav = createNavigationContext(routes, () => 'export', () => ({ slide: 2, click: 2 }), bounds, actions)
    expect(nav.mode).toBe('export')
    expect(nav.currentSlideNo).toBe(2)
    expect(nav.currentPage).toBe(2)
    expect(nav.currentSlideRoute.frontmatter.title).toBe('Details')
    expect(nav.currentPath).toBe('/export/details')
    expect(nav.tocTree.map(item => item.active)).toEqual([false, true])
    expect([nav.clicksStart, nav.clicks, nav.clicksTotal]).toEqual([1, 2, 3])
  })

  it('returns the shared player context when no export frame is selected', () => {
    const nav = createNavigationContext(routes, () => 'slide', () => ({ slide: 1, click: 0 }), bounds, actions)
    expect(nav.currentSlideNo).toBe(1)
    expect(nav.currentPath).toBe('/1')
  })
})
