import { resolveTweetId } from '../../../client/logic/tweet.ts'
import { escapeHtml, readBoundValue, unescapeHtml } from './html.ts'
import { htmlTags, rawText } from '../../../client/runtime/html-tags.ts'
import { arrowGeometry, defaultDragPosition, dragKey, dragStyle, parseDragPosition } from '../../../types/src/drag.ts'
import type { DragKind } from '../../../types/src/drag.ts'
import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { activeTocTree, filterTocTree } from '../../../client/runtime/toc.ts'
import type { ActiveTocItem, TocMode } from '../../../client/runtime/toc.ts'
import type { TocItem } from '../../../types/src/toc.ts'
import { scopeSlideStyles } from './scoped-style.ts'

export { htmlTag } from '../../../client/runtime/html-tags.ts'
const destinationPattern = /^(?:#\/?|\.\/|\/)?([a-z][a-z0-9-]*|\d+)(?:\/(\d+)|\?clicks=(\d+))?$/i
const viewTransitionClass = /^view-transition-((?:-?[a-zA-Z_]|--)[\w-]*)$/
const reservedViewNames = /^(?:none|initial|inherit|unset|revert|revert-layer|default)$/i
const navigationText = /\{\{\s*(?:\$(page)|\$(?:slidev\.)?nav\.(currentPage|total))\s*\}\}/g
interface StyleBlock { attributes: string, content: string }
interface Attribute { value: string, source: string, offset: number }

export interface SlideOutline {
  tree: readonly TocItem[]
  labels: readonly string[]
}

export function firstSlideHeading(input: string): { level: number, html: string } | undefined {
  if (!/<h[1-6]\b/i.test(input)) return
  const tags = new RegExp(htmlTags)
  for (let token = tags.exec(input); token; token = tags.exec(input)) {
    const [, closing, rawName] = token
    const name = rawName?.toLowerCase()
    if (closing || !name) continue
    const heading = /^h([1-6])$/.exec(name)
    if (!heading && !rawText.has(name)) continue
    const close = new RegExp(`</${name}\\s*>`, 'gi')
    const start = tags.lastIndex
    close.lastIndex = start
    const end = close.exec(input)
    if (!end) return
    if (heading) return { level: Number(heading[1]), html: input.slice(start, end.index) }
    tags.lastIndex = close.lastIndex
  }
}

export function titleLabel(html: string): string {
  if (!/<\/?a(?=[\s/>])/i.test(html)) return html
  return html.replace(new RegExp(htmlTags), (tag, _closing, name) => name?.toLowerCase() === 'a' ? '' : tag)
}

export function attributeValues(source: string): Map<string, Attribute> {
  const attributes = new Map<string, Attribute>()
  const matches = source.matchAll(/\s+([^\s=\/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)
  for (const match of matches) {
    const [markup, name, double, single, bare] = match
    const key = name.toLowerCase()
    if (!attributes.has(key)) attributes.set(key, { value: unescapeHtml(double ?? single ?? bare ?? ''), source: markup, offset: match.index })
  }
  return attributes
}

export interface SlideDestination { slide: number, click?: number }

export function createSlideDestinations(routes: readonly SlideRoute[]): (value: string) => SlideDestination | undefined {
  const numbers = new Map<string, number>()
  for (const route of routes) {
    numbers.set(String(route.no), route.no)
    numbers.set(`slide-${route.no}`, route.no)
    if (route.alias) numbers.set(route.alias, route.no)
  }
  return (value) => {
    const match = destinationPattern.exec(value.trim())
    if (!match) return
    const slide = numbers.get(match[1])
    if (slide === undefined) return
    const step = match[2] ?? match[3]
    const click = step === undefined ? undefined : Number(step)
    if (click === undefined || Number.isSafeInteger(click)) return { slide, click }
  }
}

export function setAttribute(attributes: Map<string, Attribute>, name: string, value: string): void {
  attributes.set(name, { value, source: ` ${name}="${escapeHtml(value)}"`, offset: -1 })
}

export function serialized(attributes: Map<string, Attribute>): string {
  return [...attributes.values()].map(attribute => attribute.source).join('')
}

function literalAttribute(attributes: Map<string, Attribute>, name: string): string | undefined {
  const plain = attributes.get(name)
  if (plain) return plain.value
  const value = attributes.get(`:${name}`)?.value.trim()
  if (value === undefined) return
  const quoted = /^(?:"([^"]*)"|'([^']*)')$/.exec(value)
  if (quoted) return quoted[1] ?? quoted[2]
  if (/^(?:true|false|-?\d+(?:\.\d+)?)$/.test(value)) return value
}

function takeBinding(attributes: Map<string, Attribute>, name: string): string | undefined {
  const key = `:${name}`
  const longKey = `v-bind:${name}`
  const binding = (attributes.get(key) ?? attributes.get(longKey))?.value.trim()
  attributes.delete(key)
  attributes.delete(longKey)
  return binding
}

function takeProp(attributes: Map<string, Attribute>, frontmatter: Record<string, unknown>, name: string): unknown {
  const literal = attributes.get(name)?.value
  attributes.delete(name)
  const binding = takeBinding(attributes, name)
  return literal ?? (binding === undefined ? undefined : readBoundValue(binding, frontmatter))
}

function takeLiteral(attributes: Map<string, Attribute>, frontmatter: Record<string, unknown>, ...names: string[]): string | undefined {
  let value: string | undefined
  for (const name of names) {
    const prop = takeProp(attributes, frontmatter, name)
    if (typeof prop === 'string' || typeof prop === 'number' || typeof prop === 'boolean') value ??= String(prop)
  }
  return value
}

function autoFitOpening(source: string, tag: 'div' | 'span', frontmatter: Record<string, unknown>): { html: string, fallback: string } {
  const attributes = attributeValues(source)
  const size = (key: string, fallback: number) => {
    const number = Number(takeLiteral(attributes, frontmatter, key))
    return Number.isFinite(number) && number > 0 ? number : fallback
  }
  const max = size('max', 100)
  const min = Math.min(size('min', 30), max)
  const wrap = takeLiteral(attributes, frontmatter, 'multiline', 'multi-line') !== 'false'
  const fallback = escapeHtml(takeLiteral(attributes, frontmatter, 'modelvalue', 'model-value') ?? '')
  const existingClass = attributes.get('class')?.value
  setAttribute(attributes, 'class', ['slidev-auto-fit-text', existingClass].filter(Boolean).join(' '))
  setAttribute(attributes, 'data-auto-fit-text', '')
  setAttribute(attributes, 'data-fit-min', String(min))
  setAttribute(attributes, 'data-fit-max', String(max))
  if (wrap) setAttribute(attributes, 'data-fit-multiline', '')
  const open = `<${tag}${serialized(attributes)}><${tag} class="slidev-auto-fit-text-inner" style="font-size:${min}px">`
  return { html: open, fallback }
}

function transformOpening(source: string, tag: 'div' | 'span', frontmatter: Record<string, unknown>): string {
  const attributes = attributeValues(source)
  const scale = takeLiteral(attributes, frontmatter, 'scale')?.trim()
  const origin = takeLiteral(attributes, frontmatter, 'origin')?.trim()
  const style = attributes.get('style')?.value
  const factor = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*,\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+))?$/
  const declarations = [tag === 'span' ? 'display:inline-block' : '', style,
    `transform-origin:${origin && /^[\w\s.,%()+*/-]+$/.test(origin) ? origin : 'top left'}`]
  if (scale && factor.test(scale)) declarations.push(`transform:scale(${scale})`)
  setAttribute(attributes, 'style', declarations.filter(Boolean).join(';'))
  setAttribute(attributes, 'data-presentation-transform', '')
  return `<${tag}${serialized(attributes)}>`
}

function parseList(value: string | undefined): string[] {
  if (!value?.startsWith('[') || !value.endsWith(']')) return []
  const entries = value.slice(1, -1).trim()
  if (!entries) return []
  const item = /\s*(?:"([^"]*)"|'([^']*)')\s*(?:,|$)/gy
  const values: string[] = []
  while (item.lastIndex < entries.length) {
    const match = item.exec(entries)
    if (!match) return []
    values.push(match[1] ?? match[2])
  }
  return values
}

function takeList(attributes: Map<string, Attribute>, frontmatter: Record<string, unknown>, name: string): string[] {
  const binding = (attributes.get(`:${name}`) ?? attributes.get(`v-bind:${name}`))?.value.trim()
  const value = takeProp(attributes, frontmatter, name)
  if (typeof value === 'string') return value ? [value] : []
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  return parseList(binding)
}

const outlineComponents = new Set(['Toc', 'TitleRenderer', 'SlideCurrentNo', 'SlidesTotal'])

function conditionalMarkup(name: string, source: string, selfClosing: boolean, frontmatter: Record<string, unknown>): string {
  const attributes = attributeValues(selfClosing ? source.replace(/\/\s*$/, '') : source)
  if (name === 'RenderWhen') {
    const contexts = takeList(attributes, frontmatter, 'context')
    setAttribute(attributes, 'data-render-when', contexts.join(' '))
  }
  else setAttribute(attributes, 'data-light-or-dark', '')
  return `<div${serialized(attributes)}>${selfClosing ? '</div>' : '<template data-condition-content>'}`
}

function outlineMarkup(name: string, source: string, slide: number, outline: SlideOutline, frontmatter: Record<string, unknown>): string {
  const attributes = attributeValues(source.replace(/\/\s*$/, ''))
  const integer = (fallback: number, ...keys: string[]) => {
    const value = takeLiteral(attributes, frontmatter, ...keys)?.trim()
    if (!value || !/^-?\d+$/.test(value)) return fallback
    const number = Number(value)
    return Number.isSafeInteger(number) ? number : fallback
  }
  if (name !== 'Toc') {
    const no = name === 'TitleRenderer' ? integer(slide, 'no') : slide
    const label = name === 'TitleRenderer' ? outline.labels[no - 1] ?? ''
      : name === 'SlideCurrentNo' ? slide : outline.labels.length
    return `<span${serialized(attributes)}>${label}</span>`
  }

  const columns = Math.max(1, integer(1, 'columns'))
  const start = integer(1, 'start')
  const minDepth = integer(1, 'mindepth', 'min-depth')
  const maxDepth = integer(Number.POSITIVE_INFINITY, 'maxdepth', 'max-depth')
  const mode = takeLiteral(attributes, frontmatter, 'mode')
  const tocMode: TocMode = mode === 'onlyCurrentTree' || mode === 'onlySiblings' ? mode : 'all'
  const listClass = takeList(attributes, frontmatter, 'listclass').concat(takeList(attributes, frontmatter, 'list-class'))
  const listStyle = takeList(attributes, frontmatter, 'liststyle').concat(takeList(attributes, frontmatter, 'list-style'))
  const tree = filterTocTree(activeTocTree(outline.tree, slide), tocMode, minDepth, maxDepth)

  function list(items: ActiveTocItem[], level: number): string {
    if (!items.length) return ''
    const classes = escapeHtml([...listClass, 'slidev-toc-list', `slidev-toc-list-level-${level}`].join(' '))
    const style = listStyle[level - 1]
    const rules = style && !/[;{}]/.test(style) ? ` style="list-style:${escapeHtml(style)}"` : ''
    const number = level === 1 && start !== 1 ? ` start="${start}"` : ''
    const entries = items.map((item) => {
      const state = item.active ? ' slidev-toc-item-active' : item.activeParent ? ' slidev-toc-item-parent-active' : ''
      const current = item.active ? ' aria-current="page"' : ''
      const label = outline.labels[item.no - 1] || escapeHtml(item.title)
      return `<li class="slidev-toc-item${state}"><a${destinationAttributes({ slide: item.no })}${current}>${label}</a>${list(item.children, level + 1)}</li>`
    })
    return `<ol class="${classes}"${number}${rules}>${entries.join('')}</ol>`
  }
  const classes = attributes.get('class')?.value
  const style = attributes.get('style')?.value
  setAttribute(attributes, 'class', classes ? `slidev-toc ${classes}` : 'slidev-toc')
  setAttribute(attributes, 'style', `column-count:${columns}${style ? `;${style}` : ''}`)
  if (!attributes.has('aria-label') && !attributes.has('aria-labelledby')) setAttribute(attributes, 'aria-label', 'Contents')
  return `<nav${serialized(attributes)}>${list(tree, 1)}</nav>`
}

function videoMarkup(source: string, selfClosing: boolean): string {
  const attrs = attributeValues(selfClosing ? source.replace(/\/\s*$/, '') : source)
  const autoplay = literalAttribute(attrs, 'autoplay')
  const autoreset = literalAttribute(attrs, 'autoreset')
  const timestamp = literalAttribute(attrs, 'timestamp')
  const printTimestamp = literalAttribute(attrs, 'printtimestamp') ?? literalAttribute(attrs, 'print-timestamp')
  const printPoster = literalAttribute(attrs, 'printposter') ?? literalAttribute(attrs, 'print-poster')
  const timePattern = /^\d+(?:\.\d+)?$/
  for (const key of ['autoplay', 'autoreset', 'timestamp', 'printtimestamp', 'print-timestamp', 'printposter', 'print-poster']) {
    attrs.delete(key)
    attrs.delete(`:${key}`)
  }
  for (const key of ['src', 'poster', 'preload', 'width', 'height', 'crossorigin', 'controls', 'loop', 'muted', 'playsinline']) {
    const value = literalAttribute(attrs, key)
    attrs.delete(`:${key}`)
    if (value === undefined) continue
    if (['controls', 'loop', 'muted', 'playsinline'].includes(key)) {
      if (value === 'false') attrs.delete(key)
      else setAttribute(attrs, key, '')
    }
    else if (!attrs.has(key)) setAttribute(attrs, key, value)
  }
  setAttribute(attrs, 'data-presentation-video', '')
  if (!attrs.has('preload')) setAttribute(attrs, 'preload', 'none')
  if (autoplay === '' || autoplay === 'true' || autoplay === 'once') setAttribute(attrs, 'data-video-autoplay', autoplay === 'once' ? 'once' : 'true')
  if (autoreset === 'click' || autoreset === 'slide') setAttribute(attrs, 'data-video-reset', autoreset)
  if (timestamp && timePattern.test(timestamp)) setAttribute(attrs, 'data-video-time', timestamp)
  if (printTimestamp && (printTimestamp === 'last' || timePattern.test(printTimestamp))) setAttribute(attrs, 'data-video-print-time', printTimestamp)
  if (printPoster !== undefined) setAttribute(attrs, 'data-video-print-poster', printPoster)
  return `<video${serialized(attrs)}>${selfClosing ? '</video>' : ''}`
}

function youtubeMarkup(source: string): string {
  const attrs = attributeValues(source.replace(/\/\s*$/, ''))
  const match = /^([\w-]{11})(?:\?start=(\d{1,10}))?$/.exec(literalAttribute(attrs, 'id') ?? '')
  const dimensions = ['width', 'height'].map((key) => {
    const value = literalAttribute(attrs, key)
    return value && /^\d{1,5}$/.test(value) ? ` ${key}="${value}"` : ''
  }).join('')
  const title = escapeHtml(literalAttribute(attrs, 'title') || 'YouTube video')
  for (const key of ['id', 'width', 'height', 'title']) {
    attrs.delete(key)
    attrs.delete(`:${key}`)
  }
  const classes = attrs.get('class')?.value
  setAttribute(attrs, 'class', classes ? `slidev-youtube ${classes}` : 'slidev-youtube')
  if (!match) return `<span${serialized(attrs)}>Video unavailable</span>`
  const [id, start] = match.slice(1)
  const embed = `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}`
  const watch = `https://www.youtube.com/watch?v=${id}${start ? `&amp;t=${start}s` : ''}`
  return `<span${serialized(attrs)}><iframe hidden data-presentation-youtube="${embed}" title="${title}"${dimensions} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><a href="${watch}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></span>`
}

function destinationAttributes(target: SlideDestination): string {
  return ` href="#slide-${target.slide}" data-slide-link="${target.slide}"${target.click === undefined ? '' : ` data-slide-click="${target.click}"`}`
}

function dragAttributes(name: string, attrs: ReadonlyMap<string, Attribute>): { kind: DragKind, prop: string, component: boolean, original?: Attribute } | undefined {
  const component = /^(?:v-drag|vdrag)(?:-?arrow)?$/i.test(name)
  if (!component && !attrs.has('v-drag')) return
  const prop = component ? attrs.has(':pos') && !attrs.has('pos') ? ':pos' : 'pos' : 'v-drag'
  return { kind: component && /arrow$/i.test(name) ? 'arrow' : 'box', prop, component, original: attrs.get(prop) }
}

export function describeDrag(name: string, source: string): ReturnType<typeof dragAttributes> {
  return dragAttributes(name, attributeValues(source))
}

function arrowHead(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${color}"/></marker>`
}

function arrowMarkup(source: string, id: string): string {
  const attrs = attributeValues(source)
  const coordinates = ['x1', 'y1', 'x2', 'y2'].map(key => Number(literalAttribute(attrs, key)))
  if (!coordinates.every(value => Number.isFinite(value))) return ''
  const [x1, y1, x2, y2] = coordinates
  const width = Number(literalAttribute(attrs, 'width')) || 2
  const color = escapeHtml(literalAttribute(attrs, 'color') || 'currentColor')
  const both = literalAttribute(attrs, 'two-way') ?? literalAttribute(attrs, 'twoway')
  const position = [x1, y1, x2 - x1, y2 - y1, 0] as const
  const padding = Math.max(10, Math.abs(width) * 4)
  const box = arrowGeometry([...position], padding)
  const style = attrs.get('style')?.value
  for (const key of ['x1', 'y1', 'x2', 'y2', 'width', 'color', 'two-way', 'twoway']) {
    attrs.delete(key)
    attrs.delete(`:${key}`)
  }
  setAttribute(attrs, 'style', `${dragStyle([...position], 'arrow', padding)}${style ? `;${style}` : ''}`)
  setAttribute(attrs, 'viewBox', `0 0 ${box.width} ${box.height}`)
  if (!attrs.has('role')) setAttribute(attrs, 'role', 'img')
  if (!attrs.has('aria-label') && !attrs.has('aria-labelledby')) setAttribute(attrs, 'aria-label', 'Arrow')
  const line = `<line x1="${box.x1}" y1="${box.y1}" x2="${box.x2}" y2="${box.y2}" stroke="${color}" stroke-width="${Math.abs(width)}" marker-end="url(#${id})"${both !== undefined && both !== 'false' ? ` marker-start="url(#${id})"` : ''}/>`
  return `<svg${serialized(attrs)}><defs>${arrowHead(id, color)}</defs>${line}</svg>`
}

function dragMarkup(name: string, source: string, frontmatter: Record<string, unknown>, id: string): string | undefined {
  const attrs = attributeValues(source)
  const description = dragAttributes(name, attrs)
  if (!description) return
  const { kind, component, original } = description
  const raw = original?.value ?? ''
  const key = dragKey(raw)
  const locations = frontmatter.dragPos && typeof frontmatter.dragPos === 'object' ? frontmatter.dragPos as Record<string, unknown> : {}
  const position = parseDragPosition(key && Object.hasOwn(locations, key) ? locations[key] : raw, kind) ?? defaultDragPosition(kind)
  const style = attrs.get('style')?.value
  const rawWidth = attrs.get('width')?.value ?? '3'
  const width = /^\d+(?:\.\d+)?$/.test(rawWidth) && Number(rawWidth) >= 1 && Number(rawWidth) <= 40 ? Number(rawWidth) : 3
  const padding = kind === 'arrow' ? Math.max(10, Math.ceil(width * 4)) : 0
  setAttribute(attrs, 'data-presentation-drag', kind)
  setAttribute(attrs, 'data-drag-position', JSON.stringify(position))
  if (key) setAttribute(attrs, 'data-drag-name', key)
  setAttribute(attrs, 'style', `${style ? `${style};` : ''}${dragStyle(position, kind, padding)}`)
  attrs.delete('v-drag')
  if (component) { attrs.delete('pos'); attrs.delete(':pos') }
  if (kind === 'box') return `<${name}${serialized(attrs)}>`

  const rawColor = attrs.get('color')?.value ?? ''
  const color = /^(?:#[a-f0-9]{3,8}|[a-z]{1,24})$/i.test(rawColor) ? rawColor : 'currentColor'
  const both = attrs.has('twoway') || attrs.has('two-way') || attrs.get(':two-way')?.value === 'true' || attrs.get(':twoway')?.value === 'true'
  for (const field of ['color', 'width', 'two-way', 'twoway', ':two-way', ':twoway', 'viewbox']) attrs.delete(field)
  // Include the stroke and marker in the SVG bounds used by slide exports.
  const geometry = arrowGeometry(position, padding)
  setAttribute(attrs, 'data-drag-padding', String(padding))
  const head = arrowHead(id, color)
  const points = `x1="${geometry.x1}" y1="${geometry.y1}" x2="${geometry.x2}" y2="${geometry.y2}"`
  const line = `<line data-drag-line ${points} stroke="${color}" stroke-width="${width}" marker-end="url(#${id})"${both ? ` marker-start="url(#${id})"` : ''}/>`
  const hit = `<line data-drag-hit ${points} stroke="transparent" stroke-width="${Math.max(width, 18)}"/>`
  setAttribute(attrs, 'viewBox', `0 0 ${geometry.width} ${geometry.height}`)
  if (!attrs.has('role')) setAttribute(attrs, 'role', 'img')
  if (!attrs.has('aria-label') && !attrs.has('aria-labelledby')) setAttribute(attrs, 'aria-label', 'Arrow')
  return `<svg${serialized(attrs)}><defs>${head}</defs>${line}${hit}</svg>`
}

function tweetMarkup(source: string, theme: 'light' | 'dark'): string {
  const attrs = attributeValues(source)
  const literal = (name: string) => attrs.get(name)?.value ?? attrs.get(`:${name}`)?.value.replace(/^(["'])(.*)\1$/, '$2')
  const id = resolveTweetId(literal('id'), literal('url'))
  if (!id) return '<span class="slidev-tweet">Post unavailable</span>'
  const scale = Number(literal('scale') ?? 1)
  const zoom = Number.isFinite(scale) && scale >= 0.1 && scale <= 3 ? scale : 1
  const url = new URL('https://platform.twitter.com/embed/Tweet.html')
  url.search = new URLSearchParams({
    id,
    theme,
    dnt: 'true',
    hideThread: String(literal('conversation') !== 'all'),
    hideCard: String(literal('cards') === 'hidden'),
  }).toString()
  return `<span class="slidev-tweet" style="zoom:${zoom}"><iframe data-presentation-tweet="${id}" title="Post on X" width="550" height="80" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" data-src="${escapeHtml(url.href)}"></iframe><a href="https://x.com/i/web/status/${id}" target="_blank" rel="noopener noreferrer">View post on X</a></span>`
}

/** Adapted from Slidev's Markdown link and scoped style transforms (MIT). */
export function prepareSlideHtml(input: string, destination: (value: string) => SlideDestination | undefined, slide: number, frontmatter: Record<string, unknown> = {}, theme: 'light' | 'dark' = 'dark', outline?: SlideOutline, { scopeStyles = true }: { scopeStyles?: boolean } = {}): { html: string, css: string } {
  const total = outline?.labels.length
  const interpolate = total !== undefined && navigationText.test(input)
  navigationText.lastIndex = 0
  if (!interpolate && !/<(?:style|(?:a|Arrow|Link|Tweet|SlidevVideo|Youtube|Toc|TitleRenderer|SlideCurrentNo|SlidesTotal|RenderWhen|LightOrDark|AutoFitText|Transform)(?=[\s/>])|v-?drag)|\sv-drag\b|view-transition-/i.test(input)) return { html: input, css: '' }
  const blocks: StyleBlock[] = []
  const viewRules = new Set<string>()
  const tags = new RegExp(htmlTags)
  let offset = 0
  let html = ''
  let componentOpen = false
  let conditionalDepth = 0
  let graphicDepth = 0
  let arrowCount = 0
  let paragraph = false
  const layoutComponents: { name: string, tag: 'div' | 'span', content: number, fallback?: string }[] = []
  const layoutSlots: boolean[] = []
  function textMarkup(text: string): string {
    if (!interpolate || graphicDepth) return text
    return text.replace(navigationText, (_, page, property) => page ? String(slide)
      : property === 'total' ? String(total) : `<span class="slidev-nav-current-page">${slide}</span>`)
  }
  for (let token = tags.exec(input); token; token = tags.exec(input)) {
    const [original, closing, rawName, source] = token
    const name = rawName?.toLowerCase()
    let replacement = original
    if (name === 'p') paragraph = !closing
    if (scopeStyles && name && !closing && source.includes('view-transition-')) {
      const classes = attributeValues(source).get('class')?.value.split(/\s+/) ?? []
      for (const className of classes) {
        const viewName = viewTransitionClass.exec(className)?.[1]
        if (viewName && !reservedViewNames.test(viewName))
          viewRules.add(`:where(#slide-${slide} .${className}){view-transition-name:${viewName}}`)
      }
    }
    if (name && !closing && rawText.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'gi')
      close.lastIndex = tags.lastIndex
      const end = close.exec(input)
      if (!end) {
        html += textMarkup(input.slice(offset, token.index)) + input.slice(token.index)
        offset = input.length
        break
      }
      if (scopeStyles && name === 'style') {
        const attrs = attributeValues(source)
        attrs.delete('scoped')
        attrs.delete('data-slide-style')
        const content = input.slice(tags.lastIndex, end.index)
        if (conditionalDepth) {
          const [scoped] = scopeSlideStyles([content], slide)
          replacement = `<style${serialized(attrs)}>${scoped}</style>`
        }
        else {
          blocks.push({ attributes: serialized(attrs), content })
          replacement = ''
        }
      }
      else replacement = input.slice(token.index, close.lastIndex)
      tags.lastIndex = close.lastIndex
    }
    else if (name === 'arrow') {
      replacement = closing ? '' : arrowMarkup(source, `slide-arrow-${slide}-${++arrowCount}`)
    }
    else if (rawName === 'Tweet') {
      replacement = closing ? '' : tweetMarkup(source, theme)
    }
    else if (rawName === 'SlidevVideo') {
      replacement = closing ? '</video>' : videoMarkup(source, /\/>$/.test(original))
    }
    else if (rawName === 'Youtube' || rawName === 'YouTube') {
      replacement = closing ? '' : youtubeMarkup(source)
    }
    else if (outline && outlineComponents.has(rawName)) {
      replacement = closing ? '' : outlineMarkup(rawName, source, slide, outline, frontmatter)
    }
    else if (rawName === 'RenderWhen' || rawName === 'LightOrDark') {
      const selfClosing = /\/>$/.test(original)
      if (closing && conditionalDepth) conditionalDepth--
      else if (!closing && !selfClosing) conditionalDepth++
      replacement = closing ? '</template></div>' : conditionalMarkup(rawName, source, selfClosing, frontmatter)
    }
    else if (rawName === 'AutoFitText' || rawName === 'Transform') {
      if (closing) {
        const previous = layoutComponents.at(-1)
        if (previous?.name === rawName) {
          layoutComponents.pop()
          const fallback = previous.fallback && !input.slice(previous.content, token.index).trim() ? previous.fallback : ''
          const close = `</${previous.tag}>`
          replacement = rawName === 'AutoFitText' ? fallback + close + close : close
        }
      }
      else {
        const tag = paragraph ? 'span' : 'div'
        const selfClosing = /\/>$/.test(original)
        const props = selfClosing ? source.replace(/\/\s*$/, '') : source
        const fitted = rawName === 'AutoFitText' ? autoFitOpening(props, tag, frontmatter) : undefined
        replacement = fitted?.html ?? transformOpening(props, tag, frontmatter)
        if (selfClosing) replacement += fitted ? `${fitted.fallback}</${tag}></${tag}>` : `</${tag}>`
        else layoutComponents.push({ name: rawName, tag, content: tags.lastIndex, fallback: fitted?.fallback })
      }
    }
    else if (name === 'template') {
      if (closing) {
        if (layoutSlots.pop()) replacement = ''
      }
      else {
        const enclosing = layoutComponents.at(-1)
        const namedDefault = enclosing && /^\s+(?:#|v-slot:)default\s*$/.test(source)
          && !input.slice(enclosing.content, token.index).trim()
        layoutSlots.push(Boolean(namedDefault))
        if (namedDefault) replacement = ''
      }
    }
    else if (rawName === 'Link') {
      if (closing && componentOpen) {
        replacement = '</a>'
        componentOpen = false
      }
      else if (!closing) {
        const attrs = attributeValues(source)
        const fallback = attrs.get(':to')?.value.replace(/^(["'])(.*)\1$/, '$2')
        const value = takeLiteral(attrs, frontmatter, 'to') ?? fallback ?? ''
        const target = destination(value)
        if (target) {
          const title = attrs.get('title')?.value
          attrs.delete('title')
          attrs.delete('href')
          attrs.delete('data-slide-link')
          attrs.delete('data-slide-click')
          const opening = `<a${destinationAttributes(target)}${serialized(attrs)}>`
          componentOpen = !/\/>$/.test(original)
          replacement = componentOpen ? opening + escapeHtml(title ?? '') : `${opening}${escapeHtml(title ?? value)}</a>`
        }
      }
    }
    else if (name === 'a' && !closing) {
      const attrs = attributeValues(source)
      const href = attrs.get('href')?.value ?? ''
      const target = !attrs.has('download') && destination(href)
      if (target) {
        attrs.delete('href')
        attrs.delete('data-slide-link')
        attrs.delete('data-slide-click')
        replacement = `<a${destinationAttributes(target)}${serialized(attrs)}>`
      }
      else if (/^(?:https?:)?\/\//i.test(href.trim()) && !attrs.has('target') && !attrs.has('download')) {
        const options = new Set((attrs.get('rel')?.value ?? '').split(/\s+/).filter(Boolean))
        options.add('noopener')
        options.add('noreferrer')
        setAttribute(attrs, 'target', '_blank')
        setAttribute(attrs, 'rel', [...options].join(' '))
        replacement = `<a${serialized(attrs)}>`
      }
    }
    const isArrow = name && /^v-?drag-?arrow$/.test(name)
    if (isArrow && closing) replacement = ''
    else if (rawName && !closing && !rawText.has(name!) && (isArrow || /^v-?drag$/i.test(rawName) || /\sv-drag(?:[\s=\/]|$)/i.test(source))) {
      const updated = /^<([a-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*)$/i.exec(replacement)
      const markup = updated && dragMarkup(updated[1], updated[2], frontmatter, `drag-arrow-${slide}-${isArrow ? ++arrowCount : arrowCount}`)
      if (markup && updated) {
        const selfClosedBox = !isArrow && /\/>$/.test(original) && /^v-?drag$/i.test(rawName)
        replacement = (selfClosedBox ? `${markup}</${rawName}>` : markup) + updated[3]
      }
    }
    html += textMarkup(input.slice(offset, token.index)) + replacement
    if ((name === 'svg' || name === 'math') && !original.endsWith('/>')) graphicDepth = Math.max(0, graphicDepth + (closing ? -1 : 1))
    offset = tags.lastIndex
  }
  html += textMarkup(input.slice(offset))
  const scoped = scopeSlideStyles(blocks.map(block => block.content), slide)
  const styles = scoped.map((content, index) => `<style data-slide-style="${slide}"${blocks[index].attributes}>${content}</style>`)
  if (viewRules.size) styles.unshift(`<style data-slide-style="${slide}">${[...viewRules].join('\n')}</style>`)
  return { html, css: styles.join('\n') }
}
