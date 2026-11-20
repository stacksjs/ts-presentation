import { escapeHtml, unescapeHtml } from './html.ts'
import { attributeValues, htmlTag, serialized, setAttribute } from './slide-html.ts'
import { readComarkAttributes as readAttributes } from '../../../parser/src/comark.ts'
import type { ComarkAttributes } from '../../../parser/src/comark.ts'

export function readComarkAttributes(source: string, start: number): { values: ComarkAttributes, end: number } | undefined {
  return readAttributes(source, start, unescapeHtml)
}

export function comarkAttributeMarkup(attributes: ComarkAttributes): string {
  return [...attributes].map(([name, value]) => value === undefined ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`).join('')
}

interface AttributeMarker { kind: 'span' | 'attach', values: ComarkAttributes, literal: string, adjacent: boolean }
interface OpenTag { name: string, source: string, start: number, end: number }

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const inlineTags = new Set(['a', 'b', 'code', 'del', 'em', 'i', 'img', 's', 'span', 'strong', 'sub', 'sup', 'u'])
const opaqueTags = new Set(['pre', 'script', 'style', 'textarea'])

export function createComarkAttributes() {
  const markers: AttributeMarker[] = []
  let prefix = ''

  return {
    register(marker: AttributeMarker): string {
      prefix ||= `tp-attrs-${Bun.randomUUIDv7().replaceAll('-', '')}-`
      return `${prefix}${markers.push(marker) - 1}`
    },
    restore(input: string): string {
      if (!markers.length) return input
      // Code spans and raw blocks can cross line boundaries. Restore literal
      // syntax if Bun escaped a marker while rendering one of those blocks.
      const html = input
        .replace(new RegExp(`&lt;(${prefix}\\d+)&gt;&lt;/\\1&gt;|&lt;(/?)${prefix}(\\d+)&gt;`, 'g'), (whole, attached: string | undefined, closing: string, index: string) => {
          const marker = markers[Number(attached ? attached.slice(prefix.length) : index)]
          if (!marker) return whole
          return attached ? escapeHtml(marker.literal) : marker.kind === 'span' ? closing ? `]${escapeHtml(marker.literal)}` : '[' : whole
        })
        .replace(new RegExp(`<(/?)${prefix}(\\d+)>`, 'g'), (whole, closing: string, index: string) => {
          const marker = markers[Number(index)]
          if (marker?.kind !== 'span') return whole
          return closing ? '</span>' : `<span${comarkAttributeMarkup(marker.values)}>`
        })
      if (!html.includes(prefix)) return html
      const tokens = new RegExp(`<!--[\\s\\S]*?(?:-->|$)|${htmlTag.source}`, 'gi')
      const stack: OpenTag[] = []
      const attributes = new Map<OpenTag, ReturnType<typeof attributeValues>>()
      const edits: { start: number, end: number, value: string }[] = []
      let previous: { tag: OpenTag, end: number } | undefined
      for (let token = tokens.exec(html); token; token = tokens.exec(html)) {
        const [tag, closing, raw, source] = token
        if (!raw) continue
        const name = raw.toLowerCase()
        if (!closing && name.startsWith(prefix)) {
          const marker = markers[Number(name.slice(prefix.length))]
          if (!marker) continue
          const start = token.index
          tokens.lastIndex += name.length + 3
          const remainder = html.slice(tokens.lastIndex)
          const block = stack.at(-1)
          const item = block?.name === 'p' && stack.at(-2)?.name === 'li' ? stack.at(-2) : undefined
          const inline = marker.adjacent && previous?.end === start && inlineTags.has(previous.tag.name) ? previous.tag : undefined
          let target = inline
          if (!target && block && /^(?:p|li|h[1-6])$/.test(block.name) && /^\s*(?:<\/(?:p|li|h[1-6])>|<(?:ul|ol)\b)/i.test(remainder)) {
            target = item ?? block
            const quote = stack.at(-2)
            if (block.name === 'p' && quote?.name === 'blockquote' && !html.slice(quote.end, block.start).trim() && /^\s*<\/p>\s*<\/blockquote>/.test(remainder)) target = quote
          }
          if (target) {
            const values = attributes.get(target) ?? attributeValues(target.source)
            for (const [key, value] of marker.values) {
              if (value === undefined) values.set(key, { value: '', source: ` ${key}`, offset: -1 })
              else {
                const original = key === 'class' && values.get(key)?.value
                setAttribute(values, key, original ? `${original} ${value}` : value)
              }
            }
            attributes.set(target, values)
            previous = { tag: target, end: tokens.lastIndex }
          }
          let removal = start
          if (target && !inline) while (html[removal - 1] === ' ' || html[removal - 1] === '\t') removal--
          edits.push({ start: removal, end: tokens.lastIndex, value: target ? '' : escapeHtml(marker.literal) })
          continue
        }
        if (closing) {
          const index = stack.findLastIndex(element => element.name === name)
          if (index >= 0) {
            previous = { tag: stack[index], end: tokens.lastIndex }
            stack.length = index
          }
          continue
        }
        const element = { name, source: source.replace(/\/\s*$/, ''), start: token.index, end: tokens.lastIndex }
        if (opaqueTags.has(name)) {
          const end = new RegExp(`</${name}\\s*>`, 'gi')
          end.lastIndex = tokens.lastIndex
          if (end.exec(html)) tokens.lastIndex = end.lastIndex
        }
        else if (voidTags.has(name) || tag.endsWith('/>')) previous = { tag: element, end: tokens.lastIndex }
        else stack.push(element)
      }
      for (const [tag, values] of attributes) edits.push({ start: tag.start, end: tag.end, value: `<${tag.name}${serialized(values)}>` })
      let output = ''
      let start = 0
      for (const edit of edits.sort((first, second) => first.start - second.start)) {
        output += html.slice(start, edit.start) + edit.value
        start = edit.end
      }
      return output + html.slice(start)
    },
  }
}
