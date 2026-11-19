import { describe, expect, test } from 'bun:test'
import { parseDeck, renderPresentation } from '../packages/slidev/node/runtime/index.ts'
import type { SlideMode, SlidePosition, SlideRoute } from '../packages/client/runtime/navigation.ts'
import { clickBounds, createNavigationContext, getSlideRoutePath, legacySlideLocation, nextPosition, previousPosition, readSlideHash, slideHash, slidePosition } from '../packages/client/runtime/navigation.ts'

const routes: SlideRoute[] = [
  { no: 1, title: 'First', layout: 'cover', frontmatter: { section: 'start' } },
  { no: 2, alias: 'details', title: 'Second', layout: 'center', frontmatter: { section: 'body', clicksStart: 1, clicks: 3 } },
]
const bounds = routes.map(route => clickBounds(route.frontmatter, 2))

describe('Slidev slide paths', () => {
  // Adapted from packages/client/logic/slidePath.test.ts.
  test('returns route paths without a hosting base', () => {
    expect(getSlideRoutePath({ no: 2 })).toBe('/2')
    expect(getSlideRoutePath({ no: 2 }, 'presenter')).toBe('/presenter/2')
    expect(getSlideRoutePath({ no: 2 }, 'export')).toBe('/export/2')
  })

  test('uses slide aliases for paths and portable hashes', () => {
    expect(getSlideRoutePath(routes[1])).toBe('/details')
    expect(getSlideRoutePath(routes[1], 'presenter')).toBe('/presenter/details')
    expect(slideHash(routes[1], 3)).toBe('#details/3')
    expect(readSlideHash('#/details/3', new Map([['details', 2]]))).toEqual({ slide: 2, click: 3 })
  })

  test('preserves zero and explicit reveal positions on direct links', () => {
    const aliases = new Set(['details'])
    expect(legacySlideLocation(new URL('http://localhost/presenter/details?clicks=3'), aliases)?.href).toBe('http://localhost/?presenter=1#details/3')
    expect(legacySlideLocation(new URL('http://localhost/export/2?clicks=0'), aliases)?.href).toBe('http://localhost/?capture=1&steps=1#2/0')
    expect(legacySlideLocation(new URL('http://localhost/2'), aliases)?.href).toBe('http://localhost/#2')
    expect(legacySlideLocation(new URL('http://localhost/missing'), aliases)).toBeUndefined()
  })
})

describe('Slidev navigation context', () => {
  // Adapted from packages/client/composables/useNav.test.ts.
  test('reads the frontmatter and layout of the active route on each change', () => {
    let position = slidePosition(1, undefined, bounds)
    const mode: SlideMode = 'slide'
    const nav = createNavigationContext(routes, () => mode, () => position, bounds, {
      go(slide, click) { position = slidePosition(Number(slide), click, bounds) },
      next() { position = nextPosition(position, bounds) ?? position },
      previous() { position = previousPosition(position, bounds) ?? position },
      nextSlide() { position = slidePosition(position.slide + 1, undefined, bounds) },
      previousSlide() { position = slidePosition(position.slide - 1, undefined, bounds) },
    })
    expect(nav.currentFrontmatter).toEqual({ section: 'start' })
    expect(nav.currentLayout).toBe('cover')
    expect(nav.currentSlideNo).toBe(1)
    nav.go(2)
    expect(nav.currentPage).toBe(2)
    expect(nav.currentFrontmatter).toEqual({ section: 'body', clicksStart: 1, clicks: 3 })
    expect(nav.currentLayout).toBe('center')
    expect(nav.clicksStart).toBe(1)
    expect(nav.clicks).toBe(1)
    expect(nav.clicksTotal).toBe(3)
    expect(nav.currentPath).toBe('/details')
    nav.previous()
    expect(nav.currentSlideNo).toBe(1)
    expect(nav.clicks).toBe(2)
    nav.next()
    expect(nav.currentSlideNo).toBe(2)
    expect(nav.clicks).toBe(1)
  })

  test('uses slide-local route and active outline data for export', () => {
    const main: SlidePosition = { slide: 1, click: 0 }
    const local: SlidePosition = { slide: 2, click: 3 }
    const controls = { go() {}, next() {}, previous() {}, nextSlide() {}, previousSlide() {} }
    const nav = createNavigationContext(routes, () => 'slide', () => main, bounds, controls)
    const exported = createNavigationContext(routes, () => 'export', () => local, bounds, controls)
    expect(nav.currentSlideNo).toBe(1)
    expect(exported.currentSlideNo).toBe(2)
    expect(exported.currentSlideRoute.title).toBe('Second')
    expect(exported.currentPath).toBe('/export/details')
    expect(exported.tocTree.map(slide => slide.active)).toEqual([false, true])
  })

  test('serializes the visible route catalog and safely escapes HTML in metadata', async () => {
    const deck = parseDeck('# Start\n\n---\nrouteAlias: detail\nsection: body\n---\n# Details\n\n---\nhide: true\n---\n# Excluded\n')
    deck.slides[1].frontmatter!.custom = '</script><script>example</script>'
    const { html, routes } = await renderPresentation(deck)
    expect(routes.map(route => route.title)).toEqual(['Start', 'Details'])
    const serialized = html.match(/<script id="presentation-navigation" type="application\/json">(.*?)<\/script>/)?.[1]
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized ?? 'null')).toEqual(JSON.parse(JSON.stringify(routes)))
    expect(routes[1].alias).toBe('detail')
  })
})
