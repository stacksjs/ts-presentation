import { realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { Deck, RenderOptions, Slide } from './index.ts'
import type { ExtensionAssets } from './extensions.ts'
import type { SlideCanvas } from './canvas.ts'
import { loadAuthoringSetup } from './authoring-setup.ts'
import { within } from './assets.ts'
import { resolveCanvas } from './canvas.ts'
import { loadExtensions } from './extensions.ts'
import { renderPresentation } from './index.ts'
import { extractImagesUsage, parseDeckAsync, readHeadmatter } from './parser.ts'
import type { PreparserContext, PreparserExtension, PreparserSetup } from './parser.ts'
import { slideRange } from './selection.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetRevision, snippetToken } from './snippet-write.ts'
import { maxCodeLength } from './compile-code.ts'
import { expandSnippets } from './snippets.ts'

export interface CompiledDeck extends ExtensionAssets {
  html: string
  title: string
  author?: string
  canvas: SlideCanvas
  routeAliases: ReadonlySet<string>
  writableSnippets: ReadonlyMap<string, WritableSnippet>
}

export interface CompileOptions extends Pick<RenderOptions, 'liveCompile'> {
  theme?: string
  mode?: PreparserContext['mode']
}

async function fileRevision(path: string): Promise<string> {
  const stat = await Bun.file(path).stat()
  return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
}

export function createDeckCompiler(entry: string, options: CompileOptions = {}): () => Promise<CompiledDeck> {
  const root = dirname(resolve(entry))
  const writerKey = options.liveCompile ? randomBytes(32).toString('hex') : undefined
  let cached: { files: Map<string, string | undefined>, deck: CompiledDeck } | undefined
  let pending: Promise<CompiledDeck> | undefined
  let loadedPreparserRevision: string | undefined

  async function compile(): Promise<CompiledDeck> {
    if (cached) {
      const checks = await Promise.all([...cached.files].map(async ([path, previous]) => {
        return await fileRevision(path).catch(() => undefined) === previous
      }))
      if (checks.every(Boolean)) return cached.deck
    }

    const files = new Map<string, string | undefined>()
    const origins = new WeakMap<Slide, string>()
    const writableSnippets = new Map<string, WritableSnippet>()
    const directory = await realpath(root)
    async function observe(path: string): Promise<string> {
      const revision = await fileRevision(path)
      files.set(path, revision)
      return revision
    }

    const filepath = await realpath(resolve(entry))
    if (!within(directory, filepath)) throw new Error('Slide source must stay inside the deck directory')
    await observe(filepath)
    const source = await Bun.file(filepath).text()
    const preparserPath = join(directory, 'setup', 'preparser.ts')
    const preparserRevision = await fileRevision(preparserPath).catch(() => undefined)
    files.set(preparserPath, preparserRevision)
    let preparsers: readonly PreparserExtension[] = []
    if (preparserRevision !== undefined) {
      const modulePath = require.resolve(preparserPath)
      // Bun normalizes file URLs to the module path and shares the cache with require.
      if (loadedPreparserRevision !== preparserRevision) delete require.cache[modulePath]
      const { default: setup } = await import(pathToFileURL(modulePath).href) as { default?: PreparserSetup }
      if (typeof setup !== 'function') throw new Error('setup/preparser.ts must export a setup function')
      const result = await setup({ filepath, headmatter: readHeadmatter(source), mode: options.mode ?? (options.liveCompile ? 'dev' : 'build') })
      if (result !== undefined && !Array.isArray(result)) throw new Error('setup/preparser.ts must return a list of extensions')
      preparsers = result ?? []
    }
    loadedPreparserRevision = preparserRevision
    const entryDeck = await parseDeckAsync(source, preparsers)
    const documents = new Map<string, Deck>([[filepath, entryDeck]])

    async function read(path: string, stack: string[], range?: string): Promise<Deck> {
      if (!within(directory, path)) throw new Error('Slide source must stay inside the deck directory')
      const filePath = await realpath(path)
      if (!within(directory, filePath)) throw new Error('Slide source must stay inside the deck directory')
      if (stack.includes(filePath)) throw new Error(`Circular slide source: ${relative(directory, filePath)}`)
      let deck = documents.get(filePath)
      if (!deck) {
        await observe(filePath)
        deck = await parseDeckAsync(await Bun.file(filePath).text(), preparsers)
        documents.set(filePath, deck)
      }
      const slides: Slide[] = []
      for (const number of slideRange(deck.slides.length, range)) {
        const slide = deck.slides[number - 1]
        const attributes = slide.frontmatter ?? {}
        const reference = attributes.src
        if (typeof reference !== 'string' || attributes.hide === true || attributes.disabled === true) {
          origins.set(slide, filePath)
          slides.push(slide)
          continue
        }
        const [file, selection] = reference.split('#')
        if (!file || !file.endsWith('.md')) throw new Error(`Expected a Markdown slide source: ${reference}`)
        const target = file.startsWith('/') ? resolve(directory, file.slice(1)) : resolve(dirname(filePath), file)
        const included = await read(target, [...stack, filePath], selection)
        for (const item of included.slides) {
          const frontmatter = { ...item.frontmatter, ...attributes, src: undefined }
          const selected: Slide = {
            ...item,
            layout: typeof attributes.layout === 'string' ? slide.layout : item.layout,
            className: [item.className, slide.className].filter(Boolean).join(' '),
            frontmatter,
            images: extractImagesUsage(item.content, frontmatter),
          }
          origins.set(selected, origins.get(item) ?? filePath)
          slides.push(selected)
        }
      }
      return { ...deck, slides }
    }

    const deck = await read(filepath, [])
    if (typeof deck.headmatter?.title !== 'string' && typeof entryDeck.slides[0].frontmatter?.src === 'string') {
      const firstVisible = deck.slides.find(slide => slide.frontmatter?.hide !== true && slide.frontmatter?.disabled !== true)
      if (firstVisible) deck.title = firstVisible.title
    }
    deck.slides = await Promise.all(deck.slides.map(async (slide) => {
      if (slide.frontmatter?.hide === true || slide.frontmatter?.disabled === true) return slide
      const content = await expandSnippets(slide.content, directory, origins.get(slide) ?? resolve(entry), observe, (path, source) => {
        if (!writerKey || source.length > maxCodeLength || source.includes('\0')) return
        const token = snippetToken(writerKey, path)
        writableSnippets.set(token, { path, root: directory, revision: snippetRevision(source) })
        return token
      })
      return content === slide.content ? slide : { ...slide, content }
    }))
    const [extensions, setup] = await Promise.all([
      loadExtensions(deck, directory, observe, options.theme),
      loadAuthoringSetup(directory, observe),
    ])
    const { html, routes } = await renderPresentation(deck, { liveCompile: options.liveCompile, extensions, setup, writableSnippets })
    const author = typeof deck.headmatter?.author === 'string' ? deck.headmatter.author : undefined
    const routeAliases = new Set(routes.flatMap(route => route.alias ? [route.alias] : []))
    const compiled = { title: deck.title, author, canvas: resolveCanvas(deck.headmatter), html, styles: extensions.styles, client: extensions.client, mounts: extensions.mounts, writableSnippets, routeAliases }
    cached = { files, deck: compiled }
    return compiled
  }

  return () => pending ??= compile().finally(() => { pending = undefined })
}

export function createDeckRenderer(entry: string, options?: CompileOptions): () => Promise<string> {
  const compile = createDeckCompiler(entry, options)
  return async () => (await compile()).html
}
