import { defaultConfig, renderComponentWithSlot } from '@stacksjs/stx'
import { readdir, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { within } from './assets.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { htmlTag } from './slide-html.ts'

type ComponentPaths = Map<string, string>
export type DeckComponentRenderer = (source: string, markdown: (source: string) => string) => Promise<string>
type Observe = (path: string) => Promise<string | undefined>

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()
}

export async function loadDeckComponents(roots: readonly string[], observe: Observe): Promise<ComponentPaths> {
  const paths: ComponentPaths = new Map()
  async function scan(root: string, directory: string): Promise<void> {
    if (await observe(directory) === undefined) return
    const canonical = await realpath(directory)
    if (!within(root, canonical)) throw new Error('STX components must stay inside their project or extension directory')
    const entries = await readdir(canonical, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(canonical, entry.name)
      if (entry.isDirectory()) {
        await scan(root, path)
        continue
      }
      if (!entry.name.endsWith('.stx') || (!entry.isFile() && !entry.isSymbolicLink())) continue
      if (await observe(path) === undefined) continue
      const file = await realpath(path)
      if (!within(root, file)) throw new Error('STX components must stay inside their project or extension directory')
      const name = basename(entry.name, '.stx')
      if (!/^[a-zA-Z][\w-]*$/.test(name)) continue
      const tag = name[0].toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      for (const key of [tag, kebab(tag)]) {
        if (!paths.has(key)) paths.set(key, file)
      }
    }
  }
  for (const root of roots) await scan(root, join(root, 'components'))
  return paths
}

interface Tag {
  name: string
  attrs: string
  start: number
  end: number
  close: boolean
  self: boolean
}

const blockRoot = /^\s*<(?:address|article|aside|blockquote|div|dl|figure|footer|h[1-6]|header|hr|main|nav|ol|p|section|table|ul)(?=[\s>])/i
const raw = new Set(['code', 'pre', 'script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'])
const builtins = new Set([
  'codegroup', 'drag', 'dragarrow', 'goto', 'lightordark', 'link', 'renderwhen', 'slidecurrentno', 'slidevvideo', 'titles',
  'toc', 'totals', 'tweet', 'vafter', 'vclick', 'vclickgap', 'vclickhide', 'vclicks', 'vswitch', 'youtube',
])

function* scanTags(source: string): Generator<Tag> {
  const nonTags = /^ {0,3}(`{3,}|~{3,})[^\r\n]*|<!--[\s\S]*?(?:-->|$)|`+/
  const tokens = new RegExp(`${nonTags.source}|${htmlTag.source}`, 'gim')
  for (let token = tokens.exec(source); token; token = tokens.exec(source)) {
    const [markup, fence, closing, name, attributes] = token
    if (fence) {
      const end = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[^\\S\\r\\n]*\\r?$`, 'gm')
      end.lastIndex = tokens.lastIndex
      tokens.lastIndex = end.exec(source) ? end.lastIndex : source.length
      continue
    }
    let backslashes = 0
    for (let cursor = token.index - 1; source[cursor] === '\\'; cursor--) backslashes++
    if (backslashes % 2) continue
    if (markup[0] === '`') {
      const end = new RegExp(`(?<!\`)${markup}(?!\`)`, 'g')
      end.lastIndex = tokens.lastIndex
      if (end.exec(source)) tokens.lastIndex = end.lastIndex
      continue
    }
    if (!name) continue
    const lower = name.toLowerCase()
    const self = !closing && attributes.endsWith('/')
    if (!closing && !self && raw.has(lower)) {
      const end = new RegExp(`</${lower}\\s*>`, 'gi')
      end.lastIndex = tokens.lastIndex
      tokens.lastIndex = end.exec(source) ? end.lastIndex : source.length
      continue
    }
    yield { name, attrs: self ? attributes.slice(0, -1) : attributes, start: token.index, end: tokens.lastIndex, close: Boolean(closing), self }
  }
}

interface Range {
  tag: Tag
  end: number
  body: string
}

function findRanges(source: string, accept: (tag: Tag) => boolean): Range[] {
  const pending: { tag: Tag, children: Range[] }[] = []
  const ranges: Range[] = []
  for (const tag of scanTags(source)) {
    if (!accept(tag)) continue
    if (!tag.close && !tag.self) {
      pending.push({ tag, children: [] })
      continue
    }
    if (tag.close && pending.at(-1)?.tag.name !== tag.name) continue
    const open = tag.close ? pending.pop()!.tag : tag
    const range = { tag: open, end: tag.end, body: tag.close ? source.slice(open.end, tag.start) : '' }
    const siblings = pending.at(-1)?.children ?? ranges
    siblings.push(range)
  }
  for (const entry of pending) ranges.push(...entry.children)
  return ranges
}

function readSlots(source: string, component: (tag: Tag) => boolean): { name: string, content: string }[] {
  const slots: { name: string, content: string }[] = []
  let rest = ''
  let cursor = 0
  for (const range of findRanges(source, tag => tag.name === 'template' || component(tag))) {
    if (range.tag.name !== 'template') continue
    const name = /^\s+(?:#|v-slot:)([a-z][\w-]*)\s*$/i.exec(range.tag.attrs)?.[1]
    if (!name) continue
    rest += source.slice(cursor, range.tag.start)
    cursor = range.end
    slots.push({ name, content: range.body })
  }
  slots.unshift({ name: 'default', content: rest + source.slice(cursor) })
  return slots
}

function propValue(value: string, frontmatter: Record<string, unknown>): unknown {
  try { return JSON.parse(value) }
  catch {
    if (/^'[^']*'$/.test(value)) return value.slice(1, -1)
    if (/^frontmatter(?:\.[a-z_$][\w$]*)+$/i.test(value)) {
      let entry: unknown = frontmatter
      for (const part of value.split('.').slice(1)) {
        if (!entry || typeof entry !== 'object' || !Object.hasOwn(entry, part)) return undefined
        entry = (entry as Record<string, unknown>)[part]
      }
      return entry
    }
  }
}

const attributes = /\s+([^\s=/\x22'<>]+)(?:\s*=\s*(?:\x22([^\x22]*)\x22|'([^']*)'|([^\s>]+)))?/g
const slideDirectives = /^v-(?:click(?:-hide)?|after|drag)(?:\.[\w-]+)*$/

function readProps(markup: string, frontmatter: Record<string, unknown>) {
  const props: Record<string, unknown> = Object.create(null)
  const forwarded: [string, string][] = []
  for (const [, attribute, double, single, bare] of markup.matchAll(attributes)) {
    const bound = attribute.startsWith(':') || attribute.startsWith('v-bind:')
    const key = attribute.replace(/^(?::|v-bind:)/, '')
    const value = double ?? single ?? bare
    if (slideDirectives.test(key)) {
      forwarded.push([attribute, value === undefined ? '' : unescapeHtml(value)])
      continue
    }
    if (!/^[\w-]+$/.test(key) || /^__|^(?:constructor|prototype)$/.test(key)) continue
    const normalized = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    if (Object.hasOwn(props, normalized)) continue
    props[normalized] = value === undefined ? !bound : bound ? propValue(unescapeHtml(value).trim(), frontmatter) : unescapeHtml(value)
  }
  return { props, forwarded }
}

function forwardDirectives(html: string, directives: [string, string][]): string {
  if (!directives.length) return html
  const root = scanTags(html).next().value
  if (!root || root.close) return html
  const offset = root.end - (root.self ? 2 : 1)
  const additions = directives.map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join('')
  return html.slice(0, offset) + additions + html.slice(offset)
}

export function createDeckComponentRenderer(
  paths: ComponentPaths,
  entry: string,
  slideNumber: number,
  frontmatter: Record<string, unknown>,
  observe?: Observe,
): DeckComponentRenderer {
  const root = dirname(entry)
  const context = { __filename: `${entry}.slide-${slideNumber}`, __importedComponents: paths, frontmatter, slideNumber }
  const options = { ...defaultConfig, root, componentsDir: join(root, 'components'), partialsDir: '', layoutsDir: '', seo: { enabled: false } }
  const marker = `tp-component-${Bun.randomUUIDv7().replaceAll('-', '')}`
  let markerCount = 0

  const isComponent = ({ name }: Tag) => (/^[A-Z]/.test(name) || name.includes('-')) && paths.has(name) && !builtins.has(name.replaceAll('-', '').toLowerCase())

  return async function render(source, markdown, depth = 0): Promise<string> {
    if (depth >= 48 || !source.includes('<')) return markdown(source)
    const ranges = findRanges(source, isComponent)
    if (!ranges.length) return markdown(source)
    let masked = ''
    let end = 0
    const uses = ranges.map((range) => {
      const key = `${marker}-${markerCount++}`
      const placeholder = `<${key}></${key}>`
      masked += source.slice(end, range.tag.start) + placeholder
      end = range.end
      return { range, key, placeholder }
    })
    const html = markdown(masked + source.slice(end))
    const replacements = new Map<string, string>()
    for (const { range, key, placeholder } of uses) {
      if (!html.includes(placeholder)) {
        replacements.set(escapeHtml(placeholder), escapeHtml(source.slice(range.tag.start, range.end)))
        continue
      }
      const { tag, body } = range
      const file = paths.get(tag.name)!
      const { props, forwarded } = readProps(tag.attrs, frontmatter)
      const values = new Map<string, string>()
      let slots = ''
      for (const slot of readSlots(body, isComponent)) {
        if (!slot.content.trim()) continue
        const id = `${key}-slot-${values.size}-end`
        const content = slot.content.replace(/^\r?\n|\r?\n[ \t]*$/g, '')
        let output = await render(content, markdown, depth + 1)
        if (!slot.content.includes('\n')) output = output.replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1')
        values.set(id, output)
        slots += slot.name === 'default' ? id : `<template #${slot.name}>${id}</template>`
      }
      const dependencies = new Set<string>()
      const rendered = await renderComponentWithSlot(file, props, slots, options.componentsDir, context, entry, options, undefined, dependencies, undefined, undefined, tag.name)
      if (observe) await Promise.all([...dependencies].filter(path => path !== file).map(observe))
      const markup = forwardDirectives(rendered, forwarded).trim().replace(new RegExp(`${key}-slot-\\d+-end`, 'g'), id => values.get(id) ?? '')
      replacements.set(placeholder, markup)
    }

    const key = `${marker}-\\d+`
    const tag = `<(${key})></\\1>`
    const literal = `&lt;(${key})&gt;&lt;/\\2&gt;`
    const placeholders = new RegExp(`${tag}|${literal}`, 'g')
    // Bun puts standalone custom tags in paragraphs. Unwrap paragraphs
    // containing only component tags when a component supplies a block root.
    const paragraphs = html.replace(/<p>([\s\S]*?)<\/p>/g, (paragraph, content: string) => {
      if (content.replace(placeholders, '').trim()) return paragraph
      const block = [...content.matchAll(placeholders)].some(([placeholder]) => blockRoot.test(replacements.get(placeholder) ?? ''))
      return block ? content : paragraph
    })
    return paragraphs.replace(placeholders, placeholder => replacements.get(placeholder) ?? placeholder)
  }
}
