import { escapeHtml, unescapeHtml } from './html.ts'
import type { SlideRoute } from './navigation.ts'
import { scopeSlideStyles } from './scoped-style.ts'

const htmlTags = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][\w:-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const rawText = new Set(['style', 'script', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'])
const destinationPattern = /^(?:#\/?|\.\/|\/)?([a-z][a-z0-9-]*|\d+)(?:\/(\d+)|\?clicks=(\d+))?$/i
interface StyleBlock { attributes: string, content: string }
interface Attribute { value: string, source: string }

function attributeValues(source: string): Map<string, Attribute> {
  const attributes = new Map<string, Attribute>()
  const matches = source.matchAll(/\s+([^\s=\/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)
  for (const [markup, name, double, single, bare] of matches) {
    const key = name.toLowerCase()
    if (!attributes.has(key)) attributes.set(key, { value: unescapeHtml(double ?? single ?? bare ?? ''), source: markup })
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
  attributes.set(name, { value, source: ` ${name}="${escapeHtml(value)}"` })
}

function serialized(attributes: Map<string, Attribute>): string {
  return [...attributes.values()].map(attribute => attribute.source).join('')
}

function destinationAttributes(target: SlideDestination): string {
  return ` href="#slide-${target.slide}" data-slide-link="${target.slide}"${target.click === undefined ? '' : ` data-slide-click="${target.click}"`}`
}

/** Adapted from Slidev's Markdown link and scoped style transforms (MIT). */
export function prepareSlideHtml(input: string, destination: (value: string) => SlideDestination | undefined, slide: number): { html: string, css: string } {
  if (!/<(?:style|a(?=[\s/>])|Link(?=[\s/>]))/i.test(input)) return { html: input, css: '' }
  const blocks: StyleBlock[] = []
  const tags = new RegExp(htmlTags)
  let offset = 0
  let html = ''
  let componentOpen = false
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
    html += input.slice(offset, token.index) + replacement
    offset = tags.lastIndex
  }
  html += input.slice(offset)
  const scoped = scopeSlideStyles(blocks.map(block => block.content), slide)
  const css = scoped.map((content, index) => `<style data-slide-style="${slide}"${blocks[index].attributes}>${content}</style>`).join('\n')
  return { html, css }
}
