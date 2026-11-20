import type { SlideMode, SlideRoute } from './navigation.ts'
import { getSlideRoutePath, matchUtilityPage, readSlideHash, slideHash } from './navigation.ts'

export type RouterMode = 'legacy' | 'history' | 'hash' | 'memory'
export type DeckPage = SlideMode | 'entry'
type Route = Pick<SlideRoute, 'no' | 'alias'>

export interface Routing {
  base: string
  mode: RouterMode
}

export function normalizeBasePath(value = '/'): string {
  if (!value || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value) || /[?#\\\s\u0000-\u001f\u007f]/u.test(value)) throw new Error('Expected a local deployment path for --base')
  const segments = value.replace(/^\/|\/$/g, '').split('/')
  if (value === '/') return value
  try {
    const names = segments.map(decodeURIComponent)
    if (names.some(name => !name || name === '.' || name === '..' || /[/\\\u0000-\u001f\u007f]/u.test(name))) throw new Error()
    return `/${names.map(encodeURIComponent).join('/')}/`
  }
  catch {
    throw new Error('Expected a local deployment path for --base')
  }
}

export function resolveRouterMode(value: unknown): RouterMode {
  if (value === undefined || value === 'legacy') return 'legacy'
  if (value === 'history' || value === 'hash' || value === 'memory') return value
  throw new Error('Router mode must be history, hash, or memory')
}

export function deckPath(path: string, base: string): string | undefined {
  if (path.startsWith(base)) return `/${path.slice(base.length)}`
}

export function matchDeckPath(path: string, hasAlias: (key: string) => boolean): { key: string, page: DeckPage } | undefined {
  if (path === '/' || path === '/index.html') return { key: '1', page: 'slide' }
  const page = matchUtilityPage(path, hasAlias)
  if (page) return { key: '1', page }
  const match = /^\/(?:(presenter|export)(?:\/|$))?([a-z0-9-]+)?\/?$/i.exec(path)
  if (!match || (!match[1] && !match[2])) return
  const key = match[2] ?? '1'
  if (/^(?:slide-)?[1-9]\d*$/.test(key) || hasAlias(key)) return { key, page: (match[1] as DeckPage | undefined) ?? 'slide' }
}

export function readDeckLocation(url: URL, routing: Routing, aliases: ReadonlyMap<string, number>): { slide: number, click?: number, page: DeckPage } {
  const { searchParams: query } = url
  const explicit = (['capture', 'overview', 'preview', 'presenter', 'notes', 'entry'] as const).find(page => query.has(page))
  if (explicit) return { ...readSlideHash(url.hash, aliases), page: explicit === 'capture' ? 'export' : explicit }
  const [fragment, fragmentQuery] = url.hash.slice(1).split('?', 2)
  const path = routing.mode === 'history' ? deckPath(url.pathname, routing.base)
    : routing.mode === 'hash' && fragment.startsWith('/') ? fragment : undefined
  const match = path && matchDeckPath(path, key => aliases.has(key))
  if (match) {
    const value = (routing.mode === 'history' ? query : new URLSearchParams(fragmentQuery)).get('clicks')
    return { ...readSlideHash(match.key, aliases), click: value && /^\d+$/.test(value) ? Number(value) : undefined, page: match.page }
  }
  return { ...readSlideHash(url.hash, aliases), page: 'slide' }
}

export function deckLocation(current: URL, routing: Routing, page: DeckPage, slide: Route, click = 0): URL {
  const url = new URL(current)
  const { mode, base } = routing
  if (mode === 'history' || (mode === 'hash' && url.protocol !== 'file:')) url.pathname = base
  for (const key of ['capture', 'preview', 'presenter', 'overview', 'notes', 'entry', 'clicks']) url.searchParams.delete(key)
  if ((mode === 'history' || mode === 'hash') && page !== 'preview' && page !== 'export') {
    const path = page === 'entry' ? '/entry' : getSlideRoutePath(slide, page)
    if (mode === 'history') {
      url.pathname = base + path.slice(1)
      if (click) url.searchParams.set('clicks', String(click))
      url.hash = ''
    }
    else url.hash = path + (click ? `?clicks=${click}` : '')
  }
  else {
    if (page === 'export') url.searchParams.set('capture', '1')
    else if (page !== 'slide') url.searchParams.set(page, '1')
    url.hash = page === 'entry' || page === 'notes' ? '' : slideHash(slide, click)
  }
  return url
}
