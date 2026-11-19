import { plainMarkdown } from './plain-markdown.ts'
// Adapted from Slidev's MIT-licensed Markdown parser. See licenses/Slidev-MIT.txt.
export interface Slide {
  title: string
  level?: number
  content: string
  notes: string
  className: string
  layout: string
  frontmatter?: Record<string, unknown>
  images?: string[]
}

export interface Deck {
  title: string
  slides: Slide[]
  headmatter?: Record<string, unknown>
}

type Frontmatter = Record<string, unknown>
type MaybePromise<T> = T | Promise<T>

export interface PreparserExtension {
  name?: string
  transformRawLines?: (lines: string[]) => MaybePromise<void>
  transformSlide?: (content: string, frontmatter: Frontmatter) => MaybePromise<string | void>
  transformNote?: (note: string | undefined, frontmatter: Frontmatter) => MaybePromise<string | void>
}

export interface PreparserContext {
  filepath: string
  headmatter: Frontmatter
  mode: 'dev' | 'build' | 'export'
}

export type PreparserSetup = (context: PreparserContext) => MaybePromise<PreparserExtension[] | void>

export function definePreparserSetup(setup: PreparserSetup): PreparserSetup { return setup }

const codeFence = /^ {0,3}(`{3,}|~{3,})(.*)$/
const keyStart = /^(?:["'][^"']+["']|[\w-]+)\s*:(?:\s|$)/
const imageExtension = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?)(?:[?#].*)?$/i

interface MarkdownScan {
  fence: string
  commentStart: number
  lastComment?: { start: number, end: number }
}

function splitLines(markdown: string): string[] {
  return markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
}

function fenceEnds(line: string, marker: string): boolean {
  const next = codeFence.exec(line)
  return !!next && next[1][0] === marker[0] && next[1].length >= marker.length && !next[2].trim()
}

function scanLine(line: string, offset: number, scan: MarkdownScan): string {
  if (scan.fence) {
    if (fenceEnds(line, scan.fence)) scan.fence = ''
    return ''
  }
  if (scan.commentStart === -1) {
    const opening = codeFence.exec(line)
    if (opening) {
      scan.fence = opening[1]
      return ''
    }
    if (!line.includes('<!--')) return line
  }
  let visible = ''
  let cursor = 0
  while (cursor < line.length) {
    if (scan.commentStart === -1) {
      const start = line.indexOf('<!--', cursor)
      if (start === -1) return visible + line.slice(cursor)
      visible += line.slice(cursor, start)
      scan.commentStart = offset + start
      cursor = start + 4
    }
    else {
      const end = line.indexOf('-->', cursor)
      if (end === -1) break
      cursor = end + 3
      scan.lastComment = { start: scan.commentStart, end: offset + cursor }
      scan.commentStart = -1
    }
  }
  return visible
}

function visibleMarkdown(content: string): string {
  if (!/<!--|^ {0,3}(?:`{3,}|~{3,})/m.test(content)) return content
  const scan: MarkdownScan = { fence: '', commentStart: -1 }
  return content.split('\n').map(line => scanLine(line, 0, scan)).join('\n')
}

function imageReferences(visible: string, frontmatter: Frontmatter): string[] {
  const hasInlineImages = visible.includes('![') || visible.includes('<') || visible.includes('url(')
  if (!hasInlineImages && !frontmatter.image && !frontmatter.backgroundImage && !frontmatter.background) return []
  const images = new Set<string>()
  function add(value: string, extensionRequired = false): void {
    const url = value.trim()
    if (url && !/^data:/i.test(url) && !url.includes('{{') && (!extensionRequired || imageExtension.test(url))) {
      images.add(url)
    }
  }
  for (const key of ['image', 'backgroundImage', 'background']) {
    const value = frontmatter[key]
    if (typeof value !== 'string') continue
    add(value, key === 'background' && !/^(?:https?:\/\/|\/)/i.test(value.trim()))
  }
  if (!hasInlineImages) return [...images]
  for (const [, target] of visible.matchAll(/!\[[^\]]*\]\(\s*(<[^>]*>|(?:[^()]|\([^()]*\))+)\)/g)) {
    const url = target.trim().replace(/\s+(?:"[^"]*"|'[^']*'|\([^()]*\))\s*$/, '').trim()
    add(url.startsWith('<') && url.endsWith('>') ? url.slice(1, -1) : url)
  }
  for (const [tag] of visible.matchAll(/<[\w-]+\b[^>]*>/g)) {
    for (const [, doubleQuoted, singleQuoted] of tag.matchAll(/\s:?(?:src|image)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      add((doubleQuoted ?? singleQuoted).replace(/^(["'])(.*)\1$/, '$2'), true)
    }
  }
  for (const [, value] of visible.matchAll(/\burl\(\s*["']?([^"')]+)["']?\s*\)/g)) add(value, true)
  return [...images]
}

export function extractImagesUsage(content: string, frontmatter: Frontmatter = {}): string[] {
  return imageReferences(visibleMarkdown(content), frontmatter)
}

interface Matter { attributes: Frontmatter, start: number, end: number }

function yamlMatter(lines: string[], index: number, end: number): Matter {
  const value: unknown = Bun.YAML.parse(lines.slice(index + 1, end).join('\n'))
  if (value !== null && value !== undefined && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`Slide frontmatter must be a YAML mapping at line ${index + 1}`)
  }
  return { attributes: (value ?? {}) as Frontmatter, start: index, end }
}

function dashedMatter(lines: string[], index: number): Matter | undefined {
  if (lines[index][3] === '-' || !lines[index + 1]?.trim()) return
  let first = index + 1
  while (lines[first]?.trimStart().startsWith('#')) first++
  if (!keyStart.test(lines[first] ?? '')) return
  let end = first + 1
  while (end < lines.length && lines[end].trimEnd() !== '---') end++
  if (end === lines.length && first !== index + 1) return
  if (end === lines.length) throw new Error(`Unclosed slide frontmatter at line ${index + 1}`)
  return yamlMatter(lines, index, end)
}

function fencedMatter(lines: string[], index: number): Matter | undefined {
  const opening = codeFence.exec(lines[index] ?? '')
  if (!opening || !/^ya?ml$/i.test(opening[2].trim())) return
  let end = index + 1
  while (end < lines.length && !fenceEnds(lines[end], opening[1])) end++
  if (end < lines.length) return yamlMatter(lines, index, end)
}

export function readHeadmatter(markdown: string): Frontmatter {
  const lines = splitLines(markdown)
  const first = lines.findIndex(line => line.trim())
  if (first === -1) return {}
  const matter = lines[first].startsWith('---') ? dashedMatter(lines, first) : fencedMatter(lines, first)
  return matter?.attributes ?? {}
}

interface SlideDraft {
  content: string
  notes?: string
  visible: string
  attributes: Frontmatter
  source: SlideSource
}

interface SlideSource {
  bodyLine: number
  endLine: number
  leading: number
  matter?: Pick<Matter, 'start' | 'end'>
}

const slideSources = new WeakMap<Slide, SlideSource>()

export function slideSourceOf(slide: Slide): SlideSource | undefined {
  return slideSources.get(slide)
}

function splitSlides(lines: string[]): SlideDraft[] {
  const drafts: SlideDraft[] = []
  const scan: MarkdownScan = { fence: '', commentStart: -1 }
  let start = 0
  let matter: Matter | undefined
  let visible: string[] | undefined
  let offset = 0
  let hasContent = false

  function append(end: number): void {
    if (!hasContent && !matter) return
    const raw = lines.slice(start, end).join('\n')
    const note = scan.lastComment && !raw.slice(scan.lastComment.end).trim() ? scan.lastComment : undefined
    const body = note ? raw.slice(0, note.start) : raw
    const leading = body.length - body.trimStart().length
    const content = body.trim()
    drafts.push({
      content,
      notes: note ? raw.slice(note.start + 4, note.end - 3).trim() : undefined,
      visible: visible?.join('\n') ?? content,
      attributes: matter?.attributes ?? {},
      source: { bodyLine: start, endLine: end, leading, matter },
    })
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!scan.fence && scan.commentStart === -1 && line.startsWith('---')) {
      append(index)
      matter = dashedMatter(lines, index)
      if (matter) index = matter.end
      start = index + 1
      scan.lastComment = undefined
      visible = undefined
      offset = 0
      hasContent = false
      continue
    }
    if (!hasContent && line.trim()) {
      if (!matter && (matter = fencedMatter(lines, index))) {
        index = matter.end
        start = index + 1
        offset = 0
        continue
      }
      hasContent = true
    }
    const text = scanLine(line, offset, scan)
    if (text !== line) visible ??= lines.slice(start, index)
    visible?.push(text)
    offset += line.length + 1
  }
  append(lines.length)
  return drafts
}

function finishDeck(drafts: SlideDraft[], keepSources = false): Deck {
  if (!drafts.length) throw new Error('The deck contains no slides')
  const slides = drafts.map(({ content, visible, notes, attributes, source }, index): Slide => {
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/m.exec(visible)
    const htmlTitle = heading ? undefined : visible.match(/<h1\b[^>]*>([\s\S]+?)<\/h1>/i)?.[1]
    const titled = heading?.[2].replace(/[ \t]+#+$/, '').trim() ?? htmlTitle
    const title = attributes.title ?? attributes.name ?? (titled ? plainMarkdown(titled) : undefined)
    const level = typeof attributes.level === 'number' ? attributes.level : heading?.[1].length
    const slide: Slide = {
      title: String(title ?? `Slide ${index + 1}`),
      level,
      content,
      notes: notes ?? '',
      className: typeof attributes.class === 'string' ? attributes.class : '',
      layout: typeof attributes.layout === 'string' ? attributes.layout : 'default',
      frontmatter: attributes,
      images: imageReferences(visible, attributes),
    }
    if (keepSources) slideSources.set(slide, source)
    return slide
  })
  const headmatter = drafts[0].attributes
  return { title: slides[0].title, slides, headmatter: Object.keys(headmatter).length ? headmatter : undefined }
}

export function parseDeck(markdown: string): Deck {
  return finishDeck(splitSlides(splitLines(markdown)), true)
}

export async function parseDeckAsync(markdown: string, extensions: readonly PreparserExtension[] = []): Promise<Deck> {
  if (!extensions.length) return parseDeck(markdown)
  const lines = splitLines(markdown)
  for (const extension of extensions) await extension.transformRawLines?.(lines)
  const drafts = splitSlides(lines)
  for (const draft of drafts) {
    const before = draft.content
    for (const extension of extensions) {
      const content = await extension.transformSlide?.(draft.content, draft.attributes)
      if (typeof content === 'string') draft.content = content
      const notes = await extension.transformNote?.(draft.notes, draft.attributes)
      if (typeof notes === 'string') draft.notes = notes
    }
    if (draft.content !== before) draft.visible = visibleMarkdown(draft.content)
  }
  return finishDeck(drafts)
}
