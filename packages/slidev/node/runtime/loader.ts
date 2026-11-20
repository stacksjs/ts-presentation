import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { Deck, RenderOptions, Slide } from './index.ts'
import type { ExtensionAssets } from './extensions.ts'
import type { SlideCanvas } from '../../../types/src/canvas.ts'
import type { LiveDeck } from '../../../types/src/dev-protocol.ts'
import { loadAuthoringSetup } from './authoring-setup.ts'
import { importDeckModule } from './deck-modules.ts'
import { within } from './assets.ts'
import { resolveCanvas } from '../../../types/src/canvas.ts'
import { loadSavedDrawings } from './drawing-store.ts'
import type { DrawingStore } from './drawing-store.ts'
import { drawingEnabled, resolveDrawings } from '../../../types/src/drawings.ts'
import { bindDragSources } from './drag-source.ts'
import type { WritableDrag } from './drag-source.ts'
import { defineStxLayout, loadExtensions } from './extensions.ts'
import { loadDeckLayers } from './layers.ts'
import { findWorkspaceRoot } from './extension-resolver.ts'
import { renderPresentation } from './index.ts'
import { markdownDocument, maxDeckSourceBytes } from './markdown-source.ts'
import { extractImagesUsage, parseDeckAsync, readHeadmatter } from '../../../parser/src/deck.ts'
import type { PreparserExtension, PreparserSetup } from '../../../parser/src/deck.ts'
import { slideRange } from './selection.ts'
import type { WritableSlide } from './side-editor-source.ts'
import { bindSlideSource } from './side-editor-source.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetRevision, snippetToken } from './snippet-write.ts'
import { maxCodeLength } from './compile-code.ts'
import { prefixCssUrls } from './base-assets.ts'
import type { Routing } from '../../../client/runtime/routing.ts'
import { expandSnippets } from './snippets.ts'

export interface CompiledDeck extends ExtensionAssets {
  html: string
  title: string
  author?: string
  headmatter?: Record<string, unknown>
  canvas: SlideCanvas
  routing: Routing
  routeAliases: ReadonlySet<string>
  writableSnippets: ReadonlyMap<string, WritableSnippet>
  writableDrags: ReadonlyMap<string, WritableDrag>
  writableSlides: ReadonlyMap<string, WritableSlide>
  live?: LiveDeck
  drawingStore?: DrawingStore
}

export interface CompileOptions extends Pick<RenderOptions, 'base' | 'routerMode' | 'liveCompile' | 'mode' | 'mcpNavigation'> {
  theme?: string
}

async function fileRevision(path: string): Promise<string> {
  const stat = await Bun.file(path).stat()
  return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
}

export function createDeckCompiler(entry: string, options: CompileOptions = {}): () => Promise<CompiledDeck> {
  const root = dirname(resolve(entry))
  const writerKey = options.liveCompile ? randomBytes(32).toString('hex') : undefined
  const mode = options.mode ?? (options.liveCompile ? 'dev' : 'build')
  let cached: { files: Map<string, string | undefined>, deck: CompiledDeck } | undefined
  let pending: Promise<CompiledDeck> | undefined

  async function compile(): Promise<CompiledDeck> {
    if (cached) {
      const checks = await Promise.all([...cached.files].map(async ([path, previous]) => {
        return await fileRevision(path).catch(() => undefined) === previous
      }))
      if (checks.every(Boolean)) return cached.deck
    }

    const files = new Map<string, string | undefined>()
    const origins = new WeakMap<Slide, { path: string, slide: Slide, index: number }>()
    const writableSnippets = new Map<string, WritableSnippet>()
    const writableDrags = new Map<string, WritableDrag>()
    const sourceDocuments = new Map<string, ReturnType<typeof markdownDocument>>()
    const writableSlides = new Map<string, WritableSlide>()
    const sourceBindings = new WeakMap<Slide, { token: string, revision: string }>()
    const directory = await realpath(root)
    async function observe(path: string): Promise<string> {
      const revision = await fileRevision(path)
      files.set(path, revision)
      return revision
    }

    async function observeOptional(path: string): Promise<string | undefined> {
      try {
        return await observe(path)
      }
      catch (error) {
        const { code } = error as NodeJS.ErrnoException
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
        files.set(path, undefined)
      }
    }

    const filepath = await realpath(resolve(entry))
    if (!within(directory, filepath)) throw new Error('Slide source must stay inside the deck directory')
    await observe(filepath)
    const source = await readFile(filepath, 'utf8')
    async function loadPreparsers(root: string, headmatter: Record<string, unknown>): Promise<PreparserExtension[]> {
      const path = join(root, 'setup', 'preparser.ts')
      if (await observeOptional(path) === undefined) return []
      const { default: setup } = await importDeckModule<PreparserSetup>(path, root, observe)
      if (typeof setup !== 'function') throw new Error(`${path} must export a setup function`)
      const result = await setup({ filepath, headmatter, mode })
      if (result !== undefined && !Array.isArray(result)) throw new Error(`${path} must return a list of extensions`)
      return result ?? []
    }
    const rawHeadmatter = readHeadmatter(source)
    const projectPreparsers = await loadPreparsers(directory, rawHeadmatter)
    const bootstrap = await parseDeckAsync(source, projectPreparsers)
    const extensions = await loadExtensions(bootstrap, directory, observe, options.theme)
    const roots = extensions.roots ?? []
    const extraPreparsers = (await Promise.all(roots.filter(root => root !== directory).map(root =>
      loadPreparsers(root, bootstrap.headmatter ?? rawHeadmatter)))).flat()
    const preparsers = [...extraPreparsers, ...projectPreparsers]
    const workspace = await findWorkspaceRoot(directory)
    const allowedRoots = [...new Set([directory, ...roots, workspace])]
    const allowed = (path: string) => allowedRoots.some(root => within(root, path))

    const documents = new Map<string, Deck>()
    async function parseDocument(path: string, input: string, parsed?: Deck): Promise<Deck> {
      const deck = parsed ?? await parseDeckAsync(input, preparsers)
      documents.set(path, deck)
      if (writerKey && !preparsers.length && within(directory, path) && Buffer.byteLength(input, 'utf8') <= maxDeckSourceBytes)
        sourceDocuments.set(path, markdownDocument(path, directory, input, writerKey))
      return deck
    }
    const entryDeck = await parseDocument(filepath, source, extraPreparsers.length ? undefined : bootstrap)

    async function read(path: string, stack: string[], range?: string): Promise<Deck> {
      if (!allowed(path)) throw new Error('Slide source must stay inside the deck directory or a configured extension or workspace root')
      const filePath = await realpath(path)
      if (!allowed(filePath)) throw new Error('Slide source must stay inside the deck directory or a configured extension or workspace root')
      if (stack.includes(filePath)) throw new Error(`Circular slide source: ${relative(directory, filePath)}`)
      let deck = documents.get(filePath)
      if (!deck) {
        await observe(filePath)
        deck = await parseDocument(filePath, await readFile(filePath, 'utf8'))
      }
      const slides: Slide[] = []
      for (const number of slideRange(deck.slides.length, range)) {
        const slide = deck.slides[number - 1]
        const attributes = slide.frontmatter ?? {}
        const reference = attributes.src
        if (typeof reference !== 'string' || attributes.hide === true || attributes.disabled === true) {
          origins.set(slide, { path: filePath, slide, index: number })
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
          origins.set(selected, origins.get(item)!)
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
      const origin = origins.get(slide)!
      const doc = sourceDocuments.get(origin.path)
      const marked = doc ? bindDragSources(doc, slide, origin.slide, origin.index, writableDrags) : slide.content
      const content = await expandSnippets(marked, directory, origin.path, observe, (path, source) => {
        if (!writerKey || !within(directory, path) || source.length > maxCodeLength || source.includes('\0')) return
        const token = snippetToken(writerKey, path)
        writableSnippets.set(token, { path, root: directory, revision: snippetRevision(source) })
        return token
      }, allowedRoots)
      const result = content === slide.content ? slide : { ...slide, content }
      const editable = doc && bindSlideSource(doc, origin.slide, origin.index)
      if (editable) {
        writableSlides.set(editable.token, editable)
        sourceBindings.set(result, { token: editable.token, revision: editable.revision })
      }
      return result
    }))
    const setup = await loadAuthoringSetup(directory, observe, observeOptional, roots)
    if (extensions.references && deck.headmatter) {
      deck.headmatter = {
        ...deck.headmatter,
        theme: extensions.references.theme,
        addons: extensions.references.addons,
      }
    }
    const canvas = resolveCanvas(deck.headmatter)
    const drawings = resolveDrawings(deck.headmatter, extensions.theme.defaults?.drawings, basename(filepath, '.md'))
    const store = drawings.persist ? { root: directory, directory: resolve(directory, drawings.persist), canvas, slideCount: deck.slides.length } : undefined
    const savedDrawings = store && await loadSavedDrawings(store, async (path) => {
      const revision = await fileRevision(path).catch(() => undefined)
      files.set(path, revision)
      return revision
    })
    const saveDrawings = store !== undefined && mode === 'dev' && drawingEnabled(drawings, mode)
    const deckCss = options.liveCompile ? await observe(join(directory, 'style.css')).catch(() => undefined) : undefined
    if (options.liveCompile && deckCss === undefined) files.set(join(directory, 'style.css'), undefined)
    const layoutRoots = [directory, ...(extensions.roots ?? []).filter(root => root !== directory).reverse()]
    const layers = await loadDeckLayers(layoutRoots, observeOptional)
    const { html, routes, routing, live } = await renderPresentation(deck, {
      base: options.base, routerMode: options.routerMode, liveCompile: options.liveCompile, mcpNavigation: options.mcpNavigation, mode, extensions, setup, writableSnippets, savedDrawings, saveDrawings,
      deckCssRevision: deckCss && snippetRevision(deckCss), sourceBindings, layers,
      async resolveFileLayout(name, registered) {
        if (!/^[\w-]+$/.test(name)) return
        for (const root of registered ? [directory] : layoutRoots) {
          const path = join(root, 'layouts', `${name}.stx`)
          if (await observeOptional(path) === undefined) continue
          const template = await realpath(path)
          if (!within(root, template)) throw new Error('STX layouts must stay inside their project or extension directory')
          return defineStxLayout(pathToFileURL(template))
        }
      },
    })
    const author = typeof deck.headmatter?.author === 'string' ? deck.headmatter.author : undefined
    const routeAliases = new Set(routes.flatMap(route => route.alias ? [route.alias] : []))
    const drawingStore = saveDrawings ? { ...store, slideCount: routes.length } : undefined
    const compiled = { title: deck.title, author, headmatter: deck.headmatter, canvas, routing, html, styles: prefixCssUrls(extensions.styles, routing.base), client: extensions.client, mounts: extensions.mounts, writableSnippets, writableDrags, writableSlides, routeAliases, drawingStore, live }
    cached = { files, deck: compiled }
    return compiled
  }

  return () => pending ??= compile().finally(() => { pending = undefined })
}

export function createDeckRenderer(entry: string, options?: CompileOptions): () => Promise<string> {
  const compile = createDeckCompiler(entry, options)
  return async () => (await compile()).html
}
