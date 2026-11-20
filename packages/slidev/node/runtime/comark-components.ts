import { MarkdownFenceReader, isFenceClose, readFenceOpening } from '../../../parser/src/markdown-fences.ts'
import { comarkAttributeMarkup, readComarkAttributes } from './comark.ts'
import type { ComarkAttributes } from './comark.ts'
import { htmlTag } from './slide-html.ts'

const builtins: Readonly<Record<string, string>> = {
  arrow: 'Arrow', 'auto-fit-text': 'AutoFitText', link: 'Link', 'light-or-dark': 'LightOrDark', 'render-when': 'RenderWhen',
  'slide-current-no': 'SlideCurrentNo', 'slides-total': 'SlidesTotal', 'slidev-video': 'SlidevVideo', toc: 'Toc',
  transform: 'Transform', tweet: 'Tweet', youtube: 'Youtube', 'v-after': 'v-after', 'v-click': 'v-click',
  'v-click-hide': 'v-click-hide', 'v-clicks': 'v-clicks', 'v-drag': 'v-drag', 'v-drag-arrow': 'v-drag-arrow', 'v-switch': 'v-switch',
}
const htmlBlocks = new Set(['aside', 'div', 'footer', 'header', 'main', 'nav', 'section'])
const rawElement = /^(?:pre|code|script|style|textarea|xmp|iframe|noembed|noframes|noscript)$/i
const blockOpen = /^( *)(:{2,})([a-z][\w-]*)[ \t]*/i
const blockClose = /^( *)(:{2,})[ \t]*$/
const slotLine = /^( *)#([a-z][\w-]*)[ \t]*$/i

interface Block {
  start: number
  indent: number
  width: number
  tag: string | undefined
  attrs?: ComarkAttributes
  slots: { at: number, name: string }[]
}

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

function codeProps(lines: string[], start: number, end: number, attributes: ComarkAttributes): number {
  const opening = start < end && readFenceOpening(lines[start].trimStart())
  if (!opening || !/^ya?ml\s+\[props\]\s*$/i.test(opening.info)) return start
  let close = start + 1
  while (close < end && !isFenceClose(lines[close].trimStart(), opening.marker)) close++
  if (close === end) return start
  const props: unknown = Bun.YAML.parse(lines.slice(start + 1, close).join('\n'))
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('Comark component props must be a YAML mapping')
  for (const [name, property] of Object.entries(props)) {
    if (!/^[a-zA-Z_][\w-]*$/.test(name) || /^(?:on[a-z]+|srcdoc)$/i.test(name)) continue
    const value = name === 'class' && typeof property === 'string' && attributes.get('class') ? `${attributes.get('class')} ${property}` : property
    attributes.delete(name)
    attributes.delete(`:${name}`)
    if (typeof value === 'string') attributes.set(name, value)
    else attributes.set(`:${name}`, JSON.stringify(value))
  }
  return close + 1
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
  const fences = new MarkdownFenceReader()
  const literal = new Set<number>()
  const pending: Block[] = []
  const blocks = new Map<number, Block & { end: number }>()
  let rawEnd: RegExp | undefined
  const tag = new RegExp(`^${htmlTag.source}`, 'i')
  for (const [at, line] of lines.entries()) {
    const fenced = !rawEnd && fences.read(line)
    const content = fences.block.content
    if (!rawEnd && !fenced) {
      const html = tag.exec(content.trimStart())
      if (/^ {0,3}<!--/.test(content)) rawEnd = /-->/
      else if (html && !html[1] && rawElement.test(html[2]) && !html[0].endsWith('/>')) rawEnd = new RegExp(`</${html[2]}\\s*>`, 'i')
    }
    if (rawEnd || fenced) {
      literal.add(at)
      if (rawEnd?.test(line)) rawEnd = undefined
      continue
    }
    const parent = pending.at(-1)
    const opening = blockOpen.exec(line)
    if (opening && opening[1].length <= (parent?.indent ?? 0) + 3) {
      const attributes = readComarkAttributes(line, opening[0].length)
      if (!line.slice(attributes?.end ?? opening[0].length).trim()) {
        pending.push({ start: at, indent: opening[1].length, width: opening[2].length, tag: tagName(opening[3], true), attrs: attributes?.values, slots: [] })
        continue
      }
    }
    if (!parent) continue
    const closing = blockClose.exec(line)
    if (closing && closing[1].length <= parent.indent + 3 && closing[2].length === parent.width) {
      pending.pop()
      if (parent.tag) blocks.set(parent.start, { ...parent, end: at })
      continue
    }
    const slot = slotLine.exec(line)
    if (slot && slot[1].length <= parent.indent + 3) parent.slots.push({ at, name: slot[2] })
  }

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
      if (!block || block.end >= end) {
        const line = lines[at].replace(indent, '')
        if (!line.trim() || literal.has(at) || /^(?: {4}| *\t)/.test(line)) {
          flush()
          rendered.push(line)
        }
        else plain.push(line)
        continue
      }
      flush()
      const tag = block.tag!
      const attrs = block.attrs ?? new Map()
      const first = codeProps(lines, at + 1, block.end, attrs)
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
