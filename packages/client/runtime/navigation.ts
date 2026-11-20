import { activeTocTree, createTocTree } from './toc.ts'
import type { ActiveTocItem } from './toc.ts'

export interface SlideRoute {
  no: number
  alias?: string
  title: string
  level?: number
  untitled?: boolean
  layout: string
  frontmatter: Record<string, unknown>
  transition?: unknown
}

export interface ClickBounds { start: number, end: number }
export interface SlidePosition { slide: number, click: number }
export type SlideMode = 'slide' | 'presenter' | 'export' | 'preview' | 'overview' | 'notes'
type UtilityPage = 'entry' | 'overview' | 'notes'

export function matchUtilityPage(path: string, hasAlias: (key: string) => boolean): UtilityPage | undefined {
  const page = /^\/(entry|overview|notes)\/?$/.exec(path)?.[1] as UtilityPage | undefined
  return page && !hasAlias(page) ? page : undefined
}

const routeKey = /^(?:[a-z][a-z0-9-]*|[1-9]\d*)$/i
const numericSlide = /^(?:slide-)?(\d+)$/

export function slideAlias(value: unknown): string | undefined {
  if (typeof value === 'string' && /^[a-z][a-z0-9-]*$/i.test(value) && !numericSlide.test(value)
    && value !== 'presenter' && value !== 'export') return value
}

function clickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
}

export function clickBounds(frontmatter: Record<string, unknown>, calculated: number): ClickBounds {
  const start = clickNumber(frontmatter.clicksStart) ?? 0
  return { start, end: Math.max(start, clickNumber(frontmatter.clicks) ?? calculated) }
}

export function slidePosition(rawSlide: number, step: number | undefined, bounds: ClickBounds[]): SlidePosition {
  const slide = Math.max(1, Math.min(bounds.length, rawSlide))
  const { start, end } = bounds[slide - 1]
  return { slide, click: Math.min(end, Math.max(start, step ?? start)) }
}

export function nextPosition(position: SlidePosition, bounds: ClickBounds[]): SlidePosition | undefined {
  const { slide, click } = position
  if (click < bounds[slide - 1].end) return { slide, click: click + 1 }
  if (slide < bounds.length) return { slide: slide + 1, click: bounds[slide].start }
}

export function previousPosition(position: SlidePosition, bounds: ClickBounds[]): SlidePosition | undefined {
  const { slide, click } = position
  if (click > bounds[slide - 1].start) return { slide, click: click - 1 }
  if (slide > 1) return { slide: slide - 1, click: bounds[slide - 2].end }
}

export function slideHash(route: Pick<SlideRoute, 'no' | 'alias'>, click = 0): string {
  return `#${route.alias ?? `slide-${route.no}`}${click ? `/${click}` : ''}`
}

/** Adapted from Slidev's slidePath helpers. These paths are relative to the server base. */
export function getSlideRoutePath(route: Pick<SlideRoute, 'no' | 'alias'>, mode: SlideMode = 'slide'): string {
  if (mode === 'overview' || mode === 'notes') return `/${mode}`
  const key = route.alias ?? String(route.no)
  return `${mode === 'presenter' || mode === 'export' ? `/${mode}` : ''}/${key}`
}

export function readSlideHash(hash: string, aliases: ReadonlyMap<string, number>): { slide: number, click?: number } {
  const [key, step] = hash.replace(/^#\/?/, '').split('/')
  const numeric = numericSlide.exec(key)
  return {
    slide: numeric ? Number(numeric[1]) : (aliases.get(key) ?? 1),
    click: /^\d+$/.test(step ?? '') ? Number(step) : undefined,
  }
}

export function legacySlideLocation(url: URL, aliases: ReadonlySet<string>): URL | undefined {
  const page = matchUtilityPage(url.pathname, key => aliases.has(key))
  if (page) {
    const location = new URL(url)
    location.pathname = '/'
    location.searchParams.set(page, '1')
    return location
  }
  const path = url.pathname.split('/').filter(Boolean)
  const mode = path[0] === 'presenter' || path[0] === 'export' ? path.shift() : undefined
  if (path.length > 1 || (!mode && !path.length)) return
  const key = path[0] ?? '1'
  if (!routeKey.test(key) || (!numericSlide.test(key) && !aliases.has(key))) return
  const position = new URL(url)
  position.pathname = '/'
  const requested = position.searchParams.get('clicks') ?? ''
  const click = /^\d+$/.test(requested) ? requested : undefined
  position.searchParams.delete('clicks')
  if (mode === 'presenter') position.searchParams.set('presenter', '1')
  if (mode === 'export') {
    position.searchParams.set('capture', '1')
    if (click !== undefined) position.searchParams.set('steps', '1')
  }
  position.hash = click === undefined ? key : `${key}/${click}`
  return position
}

export interface NavigationActions {
  go(slide: number | string, click?: number): void
  next(): void
  previous(): void
  nextSlide(): void
  previousSlide(): void
}

export interface PresentationNavigation extends NavigationActions {
  readonly mode: SlideMode
  readonly currentSlideNo: number
  readonly currentPage: number
  readonly currentSlideRoute: SlideRoute
  readonly currentFrontmatter: Record<string, unknown>
  readonly currentLayout: string
  readonly currentPath: string
  readonly clicks: number
  readonly clicksStart: number
  readonly clicksTotal: number
  readonly total: number
  readonly tocTree: ActiveTocItem[]
}

declare global {
  interface Window { presentationNavigation?: PresentationNavigation }
}

export function createNavigationContext(
  routes: SlideRoute[],
  mode: () => SlideMode,
  position: () => SlidePosition,
  bounds: ClickBounds[],
  actions: NavigationActions,
): PresentationNavigation {
  const route = () => routes[position().slide - 1]
  return {
    get mode() { return mode() },
    get currentSlideNo() { return route().no },
    get currentPage() { return route().no },
    get currentSlideRoute() { return route() },
    get currentFrontmatter() { return route().frontmatter },
    get currentLayout() { return route().layout },
    get currentPath() { return getSlideRoutePath(route(), mode()) },
    get clicks() { return position().click },
    get clicksStart() { return bounds[position().slide - 1].start },
    get clicksTotal() { return bounds[position().slide - 1].end },
    get total() { return routes.length },
    get tocTree() { return activeTocTree(createTocTree(routes), position().slide) },
    ...actions,
  }
}
