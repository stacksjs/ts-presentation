import { resolveTweetId } from '../../../client/logic/tweet.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { arrowGeometry, defaultDragPosition, dragKey, dragStyle, parseDragPosition } from '../../../types/src/drag.ts'
import type { DragKind } from '../../../types/src/drag.ts'
import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { activeTocTree, filterTocTree } from '../../../client/runtime/toc.ts'
import type { ActiveTocItem, TocMode } from '../../../client/runtime/toc.ts'
import type { TocItem } from '../../../types/src/toc.ts'
import { scopeSlideStyles } from './scoped-style.ts'

export const htmlTag: RegExp = /<(\/?)([a-z][\w:-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const htmlTags = new RegExp(`<!--[\\s\\S]*?(?:-->|$)|${htmlTag.source}`, 'gi')
const rawText = new Set(['style', 'script', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'pre', 'code'])
const destinationPattern = /^(?:#\/?|\.\/|\/)?([a-z][a-z0-9-]*|\d+)(?:\/(\d+)|\?clicks=(\d+))?$/i
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

function attributeValues(source: string): Map<string, Attribute> {
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

function setAttribute(attributes: Map<string, Attribute>, name: string, value: string): void {
  attributes.set(name, { value, source: ` ${name}="${escapeHtml(value)}"`, offset: -1 })
}

function serialized(attributes: Map<string, Attribute>): string {
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

function listProp(attributes: Map<string, Attribute>, name: string): string[] {
  const prop = literalAttribute(attributes, name)
  if (prop !== undefined) return prop ? [prop] : []
  const value = attributes.get(`:${name}`)?.value.trim()
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

const outlineComponents = new Set(['Toc', 'TitleRenderer', 'SlideCurrentNo', 'SlidesTotal'])

function outlineMarkup(name: string, source: string, slide: number, outline: SlideOutline): string {
  const attributes = attributeValues(source.replace(/\/\s*$/, ''))
  const integer = (key: string, fallback: number) => {
    const value = literalAttribute(attributes, key)?.trim()
    if (!value || !/^-?\d+$/.test(value)) return fallback
    const number = Number(value)
    return Number.isSafeInteger(number) ? number : fallback
  }
  const removeProps = (keys: string[]) => {
    for (const key of keys) {
      attributes.delete(key)
      attributes.delete(`:${key}`)
    }
  }
  if (name !== 'Toc') {
    const no = integer('no', slide)
    const label = name === 'TitleRenderer' ? outline.labels[no - 1] ?? ''
      : name === 'SlideCurrentNo' ? slide : outline.labels.length
    if (name === 'TitleRenderer') removeProps(['no'])
    return `<span${serialized(attributes)}>${label}</span>`
  }

  const columns = Math.max(1, integer('columns', 1))
  const start = integer('start', 1)
  const minDepth = integer('mindepth', integer('min-depth', 1))
  const maxDepth = integer('maxdepth', integer('max-depth', Number.POSITIVE_INFINITY))
  const mode = literalAttribute(attributes, 'mode')
  const tocMode: TocMode = mode === 'onlyCurrentTree' || mode === 'onlySiblings' ? mode : 'all'
  const listClass = listProp(attributes, 'listclass').concat(listProp(attributes, 'list-class'))
  const listStyle = listProp(attributes, 'liststyle').concat(listProp(attributes, 'list-style'))
  removeProps(['columns', 'start', 'mindepth', 'min-depth', 'maxdepth', 'max-depth', 'mode', 'listclass', 'list-class', 'liststyle', 'list-style'])
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
  const head = `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${color}"/></marker>`
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
export function prepareSlideHtml(input: string, destination: (value: string) => SlideDestination | undefined, slide: number, frontmatter: Record<string, unknown> = {}, theme: 'light' | 'dark' = 'dark', outline?: SlideOutline): { html: string, css: string } {
  if (!/<(?:style|(?:a|Link|Tweet|SlidevVideo|Youtube|Toc|TitleRenderer|SlideCurrentNo|SlidesTotal)(?=[\s/>])|v-?drag)|\sv-drag\b/i.test(input)) return { html: input, css: '' }
  const blocks: StyleBlock[] = []
  const tags = new RegExp(htmlTags)
  let offset = 0
  let html = ''
  let componentOpen = false
  let arrowCount = 0
  for (let token = tags.exec(input); token; token = tags.exec(input)) {
    const [original, closing, rawName, source] = token
    const name = rawName?.toLowerCase()
    let replacement = original
    if (name && !closing && rawText.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'gi')
      close.lastIndex = tags.lastIndex
      const end = close.exec(input)
      if (!end) break
      if (name === 'style') {
        const attrs = attributeValues(source)
        attrs.delete('scoped')
        attrs.delete('data-slide-style')
        blocks.push({ attributes: serialized(attrs), content: input.slice(tags.lastIndex, end.index) })
        replacement = ''
      }
      else replacement = input.slice(token.index, close.lastIndex)
      tags.lastIndex = close.lastIndex
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
      replacement = closing ? '' : outlineMarkup(rawName, source, slide, outline)
    }
    else if (rawName === 'Link') {
      if (closing && componentOpen) {
        replacement = '</a>'
        componentOpen = false
      }
      else if (!closing) {
        const attrs = attributeValues(source)
        const value = attrs.get('to')?.value ?? attrs.get(':to')?.value.replace(/^(["'])(.*)\1$/, '$2') ?? ''
        const target = destination(value)
        if (target) {
          const title = attrs.get('title')?.value
          attrs.delete('to')
          attrs.delete(':to')
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
    html += input.slice(offset, token.index) + replacement
    offset = tags.lastIndex
  }
  html += input.slice(offset)
  const scoped = scopeSlideStyles(blocks.map(block => block.content), slide)
  const css = scoped.map((content, index) => `<style data-slide-style="${slide}"${blocks[index].attributes}>${content}</style>`).join('\n')
  return { html, css }
}
