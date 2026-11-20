import { scanComarkBlocks } from '../../../parser/src/comark.ts'
import type { ComarkAttributes } from '../../../parser/src/comark.ts'
import { comarkAttributeMarkup, readComarkAttributes } from './comark.ts'
import { htmlTag } from './slide-html.ts'

const builtins: Readonly<Record<string, string>> = {
  arrow: 'Arrow', 'auto-fit-text': 'AutoFitText', link: 'Link', 'light-or-dark': 'LightOrDark', 'render-when': 'RenderWhen',
  'slide-current-no': 'SlideCurrentNo', 'slides-total': 'SlidesTotal', 'slidev-video': 'SlidevVideo', toc: 'Toc',
  transform: 'Transform', tweet: 'Tweet', youtube: 'Youtube', 'v-after': 'v-after', 'v-click': 'v-click',
  'v-click-hide': 'v-click-hide', 'v-clicks': 'v-clicks', 'v-drag': 'v-drag', 'v-drag-arrow': 'v-drag-arrow', 'v-switch': 'v-switch',
}
const htmlBlocks = new Set(['aside', 'div', 'footer', 'header', 'main', 'nav', 'section'])
const rawElement = /^(?:pre|code|script|style|textarea|xmp|iframe|noembed|noframes|noscript)$/i

function labelEnd(line: string, start: number): number {
  const tokens = /\\.|`+|[[\]\n]/g
  tokens.lastIndex = start + 1
  let depth = 1
  for (let token = tokens.exec(line); token; token = tokens.exec(line)) {
    if (token[0] === '\n') return -1
    if (token[0][0] === '`') {
      const end = new RegExp(`(?<!\x60)${token[0]}(?!\x60)`, 'g')
      end.lastIndex = tokens.lastIndex
      if (end.exec(line)) tokens.lastIndex = end.lastIndex
    }
    if (token[0] === '[') depth++
    if (token[0] === ']' && --depth === 0) return token.index
  }
  return -1
}

function mergeProps(source: string, attributes: ComarkAttributes): void {
  const props: unknown = Bun.YAML.parse(source)
  if (props == null) return
  if (typeof props !== 'object' || Array.isArray(props)) throw new Error('Comark component props must be a YAML mapping')
  for (const [name, property] of Object.entries(props)) {
    if (!/^[a-zA-Z_][\w-]*$/.test(name) || /^(?:on[a-z]+|srcdoc)$/i.test(name)) continue
    const value = name === 'class' && typeof property === 'string' && attributes.get('class') ? `${attributes.get('class')} ${property}` : property
    attributes.delete(name)
    attributes.delete(`:${name}`)
    if (typeof value === 'string') attributes.set(name, value)
    else attributes.set(`:${name}`, JSON.stringify(value))
  }
}

export function expandComarkComponents(source: string, registered?: (name: string) => boolean): string {
  if (!/(?:^|[\s*_[~(]):+[a-z]/i.test(source)) return source
  function tagName(name: string, block = false): string | undefined {
    if (name === 'code-group') return
    if (registered?.(name)) {
      const component = name[0].toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      return registered(component) ? component : name
    }
    const lower = name.toLowerCase()
    if (Object.hasOwn(builtins, lower)) return builtins[lower]
    if (block && htmlBlocks.has(lower)) return lower
  }

  const lines = source.split('\n')
  const { blocks, literal } = scanComarkBlocks(lines)

  const inlinePattern = `\\\\.|\x60+|<!--[\\s\\S]*?(?:-->|$)|${htmlTag.source}|(?<![^\\s*_[~(])(:[a-z][\\w-]*)`
  function inline(line: string, depth = 0): string {
    if (!line.includes(':') || depth >= 48) return line
    const inlineTokens = new RegExp(inlinePattern, 'gi')
    let output = ''
    let start = 0
    for (let token = inlineTokens.exec(line); token; token = inlineTokens.exec(line)) {
      const [markup, closing, htmlName, , component] = token
      if (markup[0] === '`') {
        const end = new RegExp(`(?<!\x60)${markup}(?!\x60)`, 'g')
        end.lastIndex = inlineTokens.lastIndex
        if (end.exec(line)) inlineTokens.lastIndex = end.lastIndex
      }
      else if (htmlName && !closing && rawElement.test(htmlName)) {
        const end = new RegExp(`</${htmlName}\\s*>`, 'gi')
        end.lastIndex = inlineTokens.lastIndex
        if (end.exec(line)) inlineTokens.lastIndex = end.lastIndex
      }
      if (!component) continue
      const tag = tagName(component.slice(1))
      if (!tag) continue
      let end = inlineTokens.lastIndex
      let content: string | undefined
      if (line[end] === '[') {
        const close = labelEnd(line, end)
        if (close < 0) continue
        content = line.slice(end + 1, close)
        end = close + 1
      }
      const attributes = readComarkAttributes(line, end)
      if (!attributes && line[end] === '{') continue
      end = attributes?.end ?? end
      const props = attributes ? comarkAttributeMarkup(attributes.values) : ''
      output += line.slice(start, token.index) + (content === undefined ? `<${tag}${props} />` : `<${tag}${props}>${inline(content, depth + 1)}</${tag}>`)
      start = inlineTokens.lastIndex = end
    }
    return output + line.slice(start)
  }

  function renderLines(start: number, end: number, margin: number): string[] {
    const rendered: string[] = []
    const plain: string[] = []
    const indent = new RegExp(`^ {0,${margin}}`)
    function flush(): void {
      if (plain.length) rendered.push(inline(plain.join('\n')))
      plain.length = 0
    }
    for (let at = start; at < end; at++) {
      const block = blocks.get(at)
      const tag = block && tagName(block.name, true)
      if (!block || !tag || block.end >= end) {
        const line = lines[at].replace(indent, '')
        if (!line.trim() || literal.has(at) || /^(?: {4}| *\t)/.test(line)) {
          flush()
          rendered.push(line)
        }
        else plain.push(line)
        continue
      }
      flush()
      const attrs = readComarkAttributes(lines[at], block.attrsStart)?.values ?? new Map()
      const first = block.props ? block.props.end + 1 : at + 1
      if (block.props) mergeProps(lines.slice(block.props.start + 1, block.props.end).join('\n'), attrs)
      rendered.push(`<${tag}${comarkAttributeMarkup(attrs)}>`, '')
      let slotStart = first
      let named = false
      for (const slot of block.slots) {
        if (slot.at < first) continue
        rendered.push(...renderLines(slotStart, slot.at, block.indent), '')
        if (named) rendered.push('</template>', '')
        named = slot.name !== 'default'
        if (named) rendered.push(`<template #${slot.name}>`, '')
        slotStart = slot.at + 1
      }
      rendered.push(...renderLines(slotStart, block.end, block.indent), '')
      if (named) rendered.push('</template>', '')
      rendered.push(`</${tag}>`)
      at = block.end
    }
    flush()
    return rendered
  }
  return renderLines(0, lines.length, 0).join('\n')
}
