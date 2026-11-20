import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { Deck, RenderOptions, Slide } from './index.ts'
import type { ExtensionAssets } from './extensions.ts'
import type { SlideCanvas } from '../../../types/src/canvas.ts'
import type { LiveDeck } from '../../../types/src/dev-protocol.ts'
import type { TransformerSlideSource } from '../../../types/src/transform.ts'
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
import { loadBrowserSetups } from './extension-client.ts'
import { createDeckComponentRenderer, loadDeckComponents } from './deck-components.ts'
import { loadDeckLayers } from './layers.ts'
import { findWorkspaceRoot } from './extension-resolver.ts'
import { renderPresentation } from './index.ts'
import { markdownDocument, maxDeckSourceBytes } from './markdown-source.ts'
import type { MarkdownDocument } from './markdown-source.ts'
import { extractImagesUsage, parseDeckAsync, readHeadmatter } from '../../../parser/src/deck.ts'
import { comarkSetting } from '../../../parser/src/comark.ts'
import type { PreparserExtension, PreparserSetup } from '../../../parser/src/deck.ts'
import { slideRange } from './selection.ts'
import type { WritableSlide } from './side-editor-source.ts'
import { bindSlideSource } from './side-editor-source.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetRevision, snippetToken } from './snippet-write.ts'
import { maxCodeLength } from './compile-code.ts'
import type { CompileLiveCode } from './compile-code.ts'
import { createLiveCodeCompiler } from './live-modules.ts'
import { prefixCssUrls } from './base-assets.ts'
import type { Routing } from '../../../client/runtime/routing.ts'
import { expandSnippets } from './snippets.ts'
import { loadRoutePages } from './route-pages.ts'
import type { BuildDownload } from './export-options.ts'
import { resolveBuildDownload } from './export-options.ts'

export interface CompiledDeck extends ExtensionAssets {
  html: string
  title: string
  author?: string
  notesMarkdown: readonly string[]
  liveHighlight: boolean
  headmatter?: Record<string, unknown>
  download?: BuildDownload
  canvas: SlideCanvas
  routing: Routing
  routeAliases: ReadonlySet<string>
  pages: ReadonlyMap<string, string>
  writableSnippets: ReadonlyMap<string, WritableSnippet>
  writableDrags: ReadonlyMap<string, WritableDrag>
  writableSlides: ReadonlyMap<string, WritableSlide>
  compileExample: CompileLiveCode
  live?: LiveDeck
  drawingStore?: DrawingStore
}

export interface CompileOptions extends Pick<RenderOptions, 'base' | 'routerMode' | 'liveCompile' | 'mode' | 'mcpNavigation' | 'withoutNotes'> {
  theme?: string
  download?: boolean
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
    const origins = new WeakMap<Slide, { path: string, slide: Slide, index: number, source?: MarkdownDocument }>()
    const writableSnippets = new Map<string, WritableSnippet>()
    const writableDrags = new Map<string, WritableDrag>()
    const writableSlides = new Map<string, WritableSlide>()
    const sourceBindings = new WeakMap<Slide, { token: string, revision: string }>()
    const transformerSources = new WeakMap<Slide, TransformerSlideSource>()
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

    const documents = new Map<string, { deck: Deck, source?: MarkdownDocument }>()
    const documentKey = (path: string, comark?: boolean) => comark ? `${path}\0comark` : path
    async function parseDocument(path: string, input: string, comark?: boolean, parsed?: Deck) {
      const inheritedHeadmatter = comark ? { comark } : undefined
      const deck = parsed ?? await parseDeckAsync(input, preparsers, inheritedHeadmatter)
      const source = writerKey && !preparsers.length && within(directory, path) && Buffer.byteLength(input, 'utf8') <= maxDeckSourceBytes
        ? markdownDocument(path, directory, input, writerKey, inheritedHeadmatter)
        : undefined
      const document = { deck, source }
      documents.set(documentKey(path, comark), document)
      return document
    }
    const { deck: entryDeck } = await parseDocument(filepath, source, undefined, extraPreparsers.length ? undefined : bootstrap)

    async function read(path: string, stack: string[], range?: string, inheritedComark?: boolean): Promise<Deck> {
      if (!allowed(path)) throw new Error('Slide source must stay inside the deck directory or a configured extension or workspace root')
      const filePath = await realpath(path)
      if (!allowed(filePath)) throw new Error('Slide source must stay inside the deck directory or a configured extension or workspace root')
      if (stack.includes(filePath)) throw new Error(`Circular slide source: ${relative(directory, filePath)}`)
      let document = documents.get(documentKey(filePath, inheritedComark))
      if (!document) {
        await observe(filePath)
        document = await parseDocument(filePath, await readFile(filePath, 'utf8'), inheritedComark)
      }
      const { deck, source } = document
      const slides: Slide[] = []
      for (const number of slideRange(deck.slides.length, range)) {
        const slide = deck.slides[number - 1]
        const attributes = slide.frontmatter ?? {}
        const reference = attributes.src
        if (typeof reference !== 'string' || attributes.hide === true || attributes.disabled === true) {
          origins.set(slide, { path: filePath, slide, index: number, source })
          slides.push(slide)
          continue
        }
        const [file, selection] = reference.split('#')
        if (!file || !file.endsWith('.md')) throw new Error(`Expected a Markdown slide source: ${reference}`)
        const target = file.startsWith('/') ? resolve(directory, file.slice(1)) : resolve(dirname(filePath), file)
        const includeComark = comarkSetting(attributes, deck.headmatter) ?? inheritedComark
        const included = await read(target, [...stack, filePath], selection, includeComark)
        for (const item of included.slides) {
          const frontmatter: Record<string, unknown> = { ...item.frontmatter, ...attributes, src: undefined }
          const comark = comarkSetting(attributes) ?? comarkSetting(item.frontmatter, included.headmatter) ?? includeComark
          if (comark !== undefined && comark !== (comarkSetting(frontmatter, entryDeck.headmatter) ?? false))
            frontmatter.comark = comark
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
      const doc = origin.source
      const marked = doc ? bindDragSources(doc, slide, origin.slide, origin.index, writableDrags) : slide.content
      const content = await expandSnippets(marked, directory, origin.path, observe, (path, source) => {
        if (!writerKey || !within(directory, path) || source.length > maxCodeLength || source.includes('\0')) return
        const token = snippetToken(writerKey, path)
        writableSnippets.set(token, { path, root: directory, revision: snippetRevision(source) })
        return token
      }, allowedRoots)
      const result = content === slide.content ? slide : { ...slide, content }
      transformerSources.set(result, { filepath: origin.path, index: origin.index - 1, content: origin.slide.content })
      const editable = doc && bindSlideSource(doc, origin.slide, origin.index)
      if (editable) {
        writableSlides.set(editable.token, editable)
        sourceBindings.set(result, { token: editable.token, revision: editable.revision })
      }
      return result
    }))
    const [setup, browserSetups] = await Promise.all([
      loadAuthoringSetup(directory, observe, observeOptional, roots),
      loadBrowserSetups(directory, roots, observe, observeOptional),
    ])
    extensions.client = [extensions.client, browserSetups].filter(Boolean).join('\n;\n')
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
    const [layers, components] = await Promise.all([
      loadDeckLayers(layoutRoots, observeOptional),
      loadDeckComponents(layoutRoots, observeOptional),
    ])
    const liveCode = createLiveCodeCompiler(directory, deck.headmatter?.monacoRunAdditionalDeps, observeOptional)
    const download = mode === 'build' ? resolveBuildDownload(deck.headmatter, options.download) : undefined
    const { html, routes, routing, live, notesMarkdown, liveHighlight } = await renderPresentation(deck, {
      base: options.base, routerMode: options.routerMode, liveCompile: options.liveCompile, mcpNavigation: options.mcpNavigation, mode, extensions, setup, writableSnippets, savedDrawings, saveDrawings,
      deckCssRevision: deckCss && snippetRevision(deckCss), sourceBindings, layers, compileExample: liveCode.authored,
      entry: filepath, transformerSources, pdfDownloadHref: download?.href, withoutNotes: options.withoutNotes,
      components: components.size ? (frontmatter, number) => createDeckComponentRenderer(components, filepath, number, frontmatter, observeOptional, deck.headmatter) : undefined,
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
    const pages = mode === 'export' ? new Map<string, string>() : await loadRoutePages({
      root: directory, roots, base: routing.base, title: deck.title, headmatter: deck.headmatter, routeAliases,
      extensionStyles: Boolean(extensions.styles), observe, optional: observeOptional,
    })
    const drawingStore = saveDrawings ? { ...store, slideCount: routes.length } : undefined
    const compiled = { title: deck.title, author, notesMarkdown, liveHighlight, headmatter: deck.headmatter, download, canvas, routing, html, styles: prefixCssUrls(extensions.styles, routing.base), client: extensions.client, mounts: extensions.mounts, writableSnippets, writableDrags, writableSlides, routeAliases, pages, drawingStore, live, compileExample: liveCode.edited }
    cached = { files, deck: compiled }
    return compiled
  }

  return () => pending ??= compile().finally(() => { pending = undefined })
}

export function createDeckRenderer(entry: string, options?: CompileOptions): () => Promise<string> {
  const compile = createDeckCompiler(entry, options)
  return async () => (await compile()).html
}
