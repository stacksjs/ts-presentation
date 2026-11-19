import { readFile, realpath } from 'node:fs/promises'
import { dirname, normalize } from 'node:path'
import type { LoadedSlidevData } from '../../../parser/src/fs.ts'
import * as parser from '../../../parser/src/fs.ts'
import type { FrontmatterDocument, SlideInfo, SlidePatch, SlidevMarkdown, SourceSlideInfo } from '../../../types/src/types.ts'
import { within } from '../runtime/assets.ts'
import { patchFrontmatter } from '../runtime/frontmatter-patch.ts'
import { markdownDocument, maxDeckSourceBytes } from '../runtime/markdown-source.ts'
import { snippetRevision, writeDeckFile } from '../runtime/snippet-write.ts'

export interface EditingDeck extends LoadedSlidevData {
  root: string
  sourceFiles: ReadonlyMap<string, string>
}

export async function loadEditingDeck(entry: string): Promise<EditingDeck> {
  const filepath = await realpath(entry)
  const root = dirname(filepath)
  const sourceFiles = new Map<string, string>()
  const data = await parser.load({ userRoot: root, roots: [root], allowedRoots: [root] }, filepath, async (source) => {
    const path = await realpath(source)
    if (!within(root, path)) throw new Error('Slide source escapes the deck directory')
    const snapshot = sourceFiles.get(path)
    if (snapshot !== undefined) return snapshot
    const raw = await readFile(path, 'utf8')
    sourceFiles.set(path, raw)
    return raw
  })
  return { ...data, root, sourceFiles }
}

/** Rendered slides have 1-based numbers, including expanded Markdown imports. */
export function resolveSlide(data: EditingDeck, no: number): SlideInfo {
  const slide = Number.isSafeInteger(no) ? data.slides[no - 1] : undefined
  if (!slide) throw new Error(`Slide ${no} does not exist. The deck has ${data.slides.length} slides.`)
  return slide
}

function getMarkdown(data: EditingDeck, source: SourceSlideInfo): SlidevMarkdown {
  const md = data.markdownFiles[source.filepath]
  if (!md) throw new Error(`Markdown file not loaded: ${source.filepath}`)
  return md
}

function protectHeadmatter(data: EditingDeck, source: SourceSlideInfo, action: string): void {
  if (source === data.entry.slides[0]) throw new Error(`Cannot ${action} the entry's first slide. It holds the deck headmatter.`)
}

function yamlDocument(source: string): FrontmatterDocument | undefined {
  if (!source.trim()) return
  let contents: unknown
  try { contents = Bun.YAML.parse(source) }
  catch { throw new Error('Invalid YAML frontmatter') }
  if (contents !== null && contents !== undefined && (typeof contents !== 'object' || Array.isArray(contents)))
    throw new Error('Invalid YAML frontmatter. Expected a mapping.')
  return { contents: contents ?? {}, toJSON: () => contents ?? {}, toString: () => source }
}

function renderSlide(source: SourceSlideInfo): SourceSlideInfo {
  if (source.note?.includes('-->')) throw new Error('Speaker notes cannot contain a closing HTML comment')
  const rendered = parser.prettifySlide(source)
  if (rendered.raw.trim() && parser.parseSync(rendered.raw, source.filepath).slides.length !== 1) throw new Error('The supplied content must contain one slide')
  return rendered
}

async function persist(data: EditingDeck, markdown: SlidevMarkdown, slides: SourceSlideInfo[]): Promise<string> {
  const path = await realpath(markdown.filepath)
  const original = data.sourceFiles.get(path)
  if (!within(data.root, path) || path !== normalize(markdown.filepath) || original === undefined)
    throw new Error('Slide source is unavailable for editing')
  const document = markdownDocument(path, data.root, original, '')
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const offset = (line: number) => line < document.lines.length ? document.rawIndex(document.lines[line]) : original.length
  const sections = new Map(markdown.slides.map((slide, index) => {
    const previous = markdown.slides[index - 1]
    const start = offset(previous?.end ?? slide.start)
    return [slide, {
      start,
      end: offset(markdown.slides[index + 1] ? slide.end : document.lines.length),
      body: offset(slide.start),
      hadSeparator: index > 0 || slide.raw.startsWith('---'),
    }]
  }))
  let result = original.slice(0, offset(markdown.slides[0]?.start ?? 0))
  for (const [index, slide] of slides.entries()) {
    const section = sections.get(slide)
    let fragment: string
    if (section) {
      const start = index === 0 ? section.body : section.start
      fragment = original.slice(start, section.end)
      if (index > 0 && !section.hadSeparator) fragment = `---${newline}${newline}${fragment}`
    }
    else fragment = parser.stringifySlide(slide, index).replace(/\n/g, newline)
    if (index && !result.endsWith('\n')) result += newline
    result += fragment
  }
  if (result && original.endsWith('\n') && !result.endsWith('\n')) result += newline
  if (Buffer.byteLength(result, 'utf8') > maxDeckSourceBytes) throw new Error('The edited Markdown file is too large')
  const revision = snippetRevision(original)
  const response = await writeDeckFile({ path, root: data.root, revision }, revision, maxDeckSourceBytes, 'slide source', () => result)
  if (!response.ok) throw new Error(await response.text())
  return result
}

export interface SlidePatchResult {
  slide: SlideInfo
  fileContent: string
}

export async function applySlidePatch(data: EditingDeck, no: number, patch: SlidePatch): Promise<SlidePatchResult> {
  const slide = resolveSlide(data, no)
  const source = { ...slide.source }
  const markdown = getMarkdown(data, slide.source)
  if (patch.content !== undefined) source.content = patch.content
  if (patch.note !== undefined) source.note = patch.note
  if (patch.frontmatterRaw !== undefined) source.frontmatterDoc = yamlDocument(patch.frontmatterRaw)
  if (patch.frontmatter)
    source.frontmatterDoc = yamlDocument(patchFrontmatter(source.frontmatterDoc?.toString() ?? '', patch.frontmatter))
  if (source.frontmatterDoc) source.frontmatterStyle ??= 'frontmatter'
  const edited = renderSlide(source)
  const slides = markdown.slides.map(original => original === slide.source ? edited : original)
  const fileContent = await persist(data, markdown, slides)
  return { slide: { ...slide, source: edited }, fileContent }
}

export interface InsertSlideOptions {
  after: number
  content: string
  frontmatter?: Record<string, unknown>
  note?: string
}

export interface InsertSlideResult {
  source: SourceSlideInfo
  filepath: string
  fileContent: string
}

export async function insertSlide(data: EditingDeck, options: InsertSlideOptions): Promise<InsertSlideResult> {
  const anchor = resolveSlide(data, options.after)
  const markdown = getMarkdown(data, anchor.source)
  const frontmatter = options.frontmatter ?? {}
  const doc = Object.keys(frontmatter).length ? yamlDocument(Bun.YAML.stringify(frontmatter)) : undefined
  const source = renderSlide({
    filepath: markdown.filepath, index: 0, start: 0, contentStart: 0, end: 0, revision: '', raw: '',
    contentRaw: options.content, content: options.content, frontmatter, frontmatterDoc: doc,
    frontmatterStyle: doc ? 'frontmatter' : undefined, note: options.note,
  })
  const slides = [...markdown.slides]
  slides.splice(slides.indexOf(anchor.source) + 1, 0, source)
  return { source, filepath: markdown.filepath, fileContent: await persist(data, markdown, slides) }
}

export interface RemoveSlideResult {
  removed: SlideInfo
  filepath: string
  fileContent: string
}

export async function removeSlide(data: EditingDeck, no: number): Promise<RemoveSlideResult> {
  const removed = resolveSlide(data, no)
  protectHeadmatter(data, removed.source, 'remove')
  const markdown = getMarkdown(data, removed.source)
  const slides = markdown.slides.filter(source => source !== removed.source)
  return { removed, filepath: markdown.filepath, fileContent: await persist(data, markdown, slides) }
}

export interface MoveSlideOptions { from: number, before?: number, after?: number }

export interface MoveSlideResult {
  moved: SlideInfo
  anchor: SlideInfo
  filepath: string
  fileContent: string
}

export async function moveSlide(data: EditingDeck, options: MoveSlideOptions): Promise<MoveSlideResult> {
  const { from, before, after } = options
  if ((before === undefined) === (after === undefined)) throw new Error('Specify exactly one of before or after')
  const anchorNo = (before ?? after)!
  if (anchorNo === from) throw new Error('Choose a different slide to move before or after')
  const moved = resolveSlide(data, from)
  const anchor = resolveSlide(data, anchorNo)
  if (moved.source.filepath !== anchor.source.filepath) throw new Error('Cannot move a slide across markdown files')
  protectHeadmatter(data, moved.source, 'move')
  if (before !== undefined) protectHeadmatter(data, anchor.source, 'insert before')
  const markdown = getMarkdown(data, moved.source)
  const slides = markdown.slides.filter(source => source !== moved.source)
  slides.splice(slides.indexOf(anchor.source) + Number(after !== undefined), 0, moved.source)
  return { moved, anchor, filepath: markdown.filepath, fileContent: await persist(data, markdown, slides) }
}
