import { isFenceClose, MarkdownFenceReader, readFenceOpening } from './markdown-fences.ts'

type Frontmatter = Record<string, unknown>
export type ComarkAttributes = Map<string, string | undefined>

const attributeToken = /(?:([.#])([^\s.#{}`]+)|(:?[a-zA-Z_][\w:.-]*)(?:[ \t]*=[ \t]*(?:"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|([^\s{}'"`=<>]+)))?)/y
const blockOpen = /^( *)(:{2,})([a-z][\w-]*)[ \t]*/i
const blockClose = /^( *)(:{2,})[ \t]*$/
const slotLine = /^( *)#([a-z][\w-]*)[ \t]*$/i
const rawOpen = /^<(pre|code|script|style|textarea|xmp|iframe|noembed|noframes|noscript)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/i
const yamlBoundary = /^( *)---[ \t]*$/

export function comarkSetting(slide?: Frontmatter, deck?: Frontmatter, inherited?: Frontmatter): boolean | undefined {
  const value = (source?: Frontmatter) => source?.comark ?? source?.mdc
  const config = (source?: Frontmatter) => source?.config as Frontmatter | undefined
  const setting = value(slide) ?? value(deck) ?? value(config(deck)) ?? value(inherited) ?? value(config(inherited))
  return setting == null ? undefined : setting === true
}

export function readComarkAttributes(source: string, start: number, decode: (value: string) => string = value => value): { values: ComarkAttributes, end: number } | undefined {
  if (source[start] !== '{') return
  const values: ComarkAttributes = new Map()
  let cursor = start + 1
  while (cursor < source.length) {
    while (source[cursor] === ' ' || source[cursor] === '\t') cursor++
    if (source[cursor] === '}') return values.size ? { values, end: cursor + 1 } : undefined
    attributeToken.lastIndex = cursor
    const match = attributeToken.exec(source)
    if (!match) return
    const [, shorthand, label, key, double, single, bare] = match
    const name = shorthand === '.' ? 'class' : shorthand === '#' ? 'id' : key
    if (/^(?:on[a-z]+|srcdoc)$/i.test(name.replace(/^:/, ''))) return
    const raw = double ?? single ?? bare
    const quote = double !== undefined ? '"' : "'"
    const value = label ?? (raw === undefined ? undefined : decode(raw.replace(/\\(.)/g, (whole, escaped: string) => escaped === quote || escaped === '\\' ? escaped : whole)))
    const prior = values.get(name)
    values.set(name, name === 'class' && prior && value ? `${prior} ${value}` : value)
    cursor = attributeToken.lastIndex
    if (!/^[ \t}.#]/.test(source[cursor] ?? '')) return
  }
}

interface PropsBlock { start: number, end: number, dashed: boolean }
interface ComponentBlock {
  start: number
  indent: number
  width: number
  name: string
  attrsStart: number
  props?: PropsBlock
  slots: { at: number, name: string }[]
}

function componentProps(lines: readonly string[], start: number): PropsBlock | undefined {
  const line = lines[start]
  if (!line) return
  const dashed = yamlBoundary.exec(line)
  if (dashed) {
    for (let end = start + 1; end < lines.length; end++) {
      if (yamlBoundary.exec(lines[end])?.[1] === dashed[1]) return { start, end, dashed: true }
      // A component terminator or a slide boundary at a lesser indent ends
      // an incomplete props candidate. Indented block scalar text is data.
      if (blockClose.exec(lines[end])?.[1].length === dashed[1].length || /^---/.test(lines[end])) return
    }
    return
  }
  const opening = readFenceOpening(line.trimStart())
  if (!opening || !/^ya?ml\s+\[props\]\s*$/i.test(opening.info)) return
  for (let end = start + 1; end < lines.length; end++) {
    if (isFenceClose(lines[end].trimStart(), opening.marker)) return { start, end, dashed: false }
  }
}

/** Discover complete component blocks before slide splitting or Markdown rendering. */
export function scanComarkBlocks(lines: readonly string[], stopAtSlides = false): { blocks: Map<number, ComponentBlock & { end: number }>, literal: Set<number> } {
  const blocks = new Map<number, ComponentBlock & { end: number }>()
  const literal = new Set<number>()
  const pending: ComponentBlock[] = []
  const fences = new MarkdownFenceReader()
  let rawEnd: RegExp | undefined
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]
    const fenced = !rawEnd && fences.read(line)
    const content = fences.block.content
    if (!rawEnd && !fenced) {
      const html = rawOpen.exec(content.trimStart())
      if (/^ {0,3}<!--/.test(content)) rawEnd = /-->/
      else if (html && !html[0].endsWith('/>')) rawEnd = new RegExp(`</${html[1]}\\s*>`, 'i')
    }
    if (rawEnd || fenced) {
      if (!stopAtSlides) literal.add(at)
      if (rawEnd?.test(line)) rawEnd = undefined
      continue
    }
    if (stopAtSlides && line.startsWith('---')) {
      pending.length = 0
      fences.reset()
      continue
    }
    const parent = pending.at(-1)
    const opening = blockOpen.exec(line)
    if (opening && opening[1].length <= (parent?.indent ?? 0) + 3) {
      const attrsStart = opening[0].length
      const attributes = readComarkAttributes(line, attrsStart)
      if (!line.slice(attributes?.end ?? attrsStart).trim()) {
        const props = opening[3] === 'code-group' ? undefined : componentProps(lines, at + 1)
        pending.push({ start: at, indent: opening[1].length, width: opening[2].length, name: opening[3], attrsStart, props, slots: [] })
        if (props) {
          if (!stopAtSlides) for (let line = props.start; line <= props.end; line++) literal.add(line)
          at = props.end
        }
        continue
      }
    }
    if (!parent) continue
    const closing = blockClose.exec(line)
    if (closing && closing[1].length <= parent.indent + 3 && closing[2].length === parent.width) {
      pending.pop()
      blocks.set(parent.start, { ...parent, end: at })
      continue
    }
    const slot = slotLine.exec(line)
    if (slot && slot[1].length <= parent.indent + 3) parent.slots.push({ at, name: slot[2] })
  }
  return { blocks, literal }
}
