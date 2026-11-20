import { getCachedSignalsRuntime } from '@stacksjs/stx'
import { dirname } from 'node:path'
import type { Grammar } from 'ts-syntax-highlighter'
import { deckFontMarkup } from './fonts.ts'
import { applyNotesAutoRuby } from './notes.ts'
import { hasBuiltinLayoutSlots, renderBuiltinLayout, renderPresentationShell } from '../../../client/index.ts'
import type { AuthoringSetup } from './authoring-setup.ts'
import type { LoadedExtensions, PresentationAddon, PresentationLayout } from './extensions.ts'
import { resolveCanvas } from '../../../types/src/canvas.ts'
import type { LiveDeck } from '../../../types/src/dev-protocol.ts'
import { renderChart } from './charts.ts'
import { codeBlock, createHighlightedCodeRenderer, codeThemeStyles, magicFrames, parseCodeInfo } from './code-blocks.ts'
import { codeDiffBlock } from './code-diff.ts'
import { renderMermaid } from './diagram.ts'
import { optionsForSvg } from './diagram-svg.ts'
import { renderPlantUml } from './plantuml.ts'
import type { DeckComponentRenderer } from './deck-components.ts'
import { drawingOverlay } from './drawing-store.ts'
import { drawingEnabled, resolveDrawings } from '../../../types/src/drawings.ts'
import type { DrawingClientConfig, SavedDrawing } from '../../../types/src/drawings.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { liveBlock } from './live-markup.ts'
import type { CompileLiveCode } from './compile-code.ts'
import { createMathRenderer, renderUnrenderedMath, resolveMathMacros } from './math.ts'
import { MathParseError } from './math-error.ts'
import type { DeckLayers } from './layers.ts'
import { renderLayer, renderSlideLayers } from './layers.ts'
import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { slideAlias } from '../../../client/runtime/navigation.ts'
import type { RouterMode, Routing } from '../../../client/runtime/routing.ts'
import { normalizeBasePath, resolveRouterMode } from '../../../client/runtime/routing.ts'
import { createTocTree } from '../../../client/runtime/toc.ts'
import type { Deck, PreparserContext, Slide } from '../../../parser/src/deck.ts'
import { plainMarkdown } from '../../../parser/src/plain-markdown.ts'
import { parseTimeString } from '../../../parser/src/timesplit/timestring.ts'
import { createSlideDestinations, firstSlideHeading, prepareSlideHtml, titleLabel } from './slide-html.ts'
import { prepareMarkdown, renderAlerts, splitSlots } from './syntax.ts'
import type { MarkdownFence } from './syntax.ts'
import type { CodeblockTransformContext, TransformerOptions, TransformerSlideSource } from '../../../types/src/transform.ts'
import { SlideMarkdownEdits } from './markdown-edits.ts'
import { prefixMarkupUrls } from './base-assets.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetRevision } from './snippet-write.ts'
import { nativeCodeLanguage } from '../../../types/src/code-runner.ts'

export { defineAddon, defineStxLayout, defineTheme } from './extensions.ts'
export { defineShortcutsSetup } from '../../../types/src/shortcuts.ts'
export type { NavOperations, ShortcutOptions, ShortcutsSetup } from '../../../types/src/shortcuts.ts'
export { defineCodeRunnersSetup } from '../../../types/src/code-runner.ts'
export type { CodeRunner, CodeRunnerContext, CodeRunnerOutput, CodeRunnerOutputDom, CodeRunnerOutputError, CodeRunnerOutputHtml, CodeRunnerOutputText, CodeRunnerOutputTextArray, CodeRunnerOutputs, CodeRunnerProviders, CodeRunnersSetup } from '../../../types/src/code-runner.ts'
export { defineCodeHighlightSetup, defineShikiSetup, defineKatexSetup, defineMermaidRendererSetup, defineMermaidSetup } from './authoring-setup.ts'
export type { CodeHighlightOptions, KatexOptions, KatexTrustContext, MermaidOptions, MermaidRenderer } from './authoring-setup.ts'
export type { MathMacroArgument, MathMacroContext, MathMacroDefinition, MathMacroExpansion, MathMacroFunction, MathMacroNamespace, MathMacros, MathMacroToken } from './math.ts'
export type { CodeHighlightGrammar, CodeHighlightGrammarPattern, CodeHighlightLanguageEntry, CodeHighlightLanguageInput, CodeHighlightLanguages } from './code-languages.ts'
export type { CodeHighlightBlockOptions, CodeHighlightContext, CodeHighlightContextBase, CodeHighlightElement, CodeHighlightProperty, CodeHighlightRoot, CodeHighlightText, CodeHighlightToken, CodeHighlightTransformer } from './highlight-transformers.ts'
export { transformerCompactLineOptions, transformerMetaHighlight, transformerMetaWordHighlight, transformerNotationDiff, transformerNotationErrorLevel, transformerNotationFocus, transformerNotationHighlight, transformerNotationMap, transformerNotationWordHighlight, transformerRemoveNotationEscape } from './notation-transformers.ts'
export type { TransformerCompactLineOption, TransformerNotationMapOptions, TransformerNotationOptions } from './notation-transformers.ts'
export type { PresentationNavigation, SlideRoute } from '../../../client/runtime/navigation.ts'
export type { LayoutContext, PresentationAddon, PresentationLayout, PresentationTheme } from './extensions.ts'
export type { DrawingOptions } from '../../../types/src/drawings.ts'
export * from '../../../types/src/transform.ts'
export { defineRoutesSetup } from '../../../types/src/routes.ts'
export type { PresentationRoute, RoutesSetup } from '../../../types/src/routes.ts'
export { defineContextMenuSetup } from '../../../types/src/context-menu.ts'
export type { ContextMenuAction, ContextMenuContext, ContextMenuItem, ContextMenuSetup } from '../../../types/src/context-menu.ts'

export { definePreparserSetup, extractImagesUsage, parseDeck, parseDeckAsync } from '../../../parser/src/deck.ts'
export type { Deck, PreparserContext, PreparserExtension, PreparserSetup, Slide } from '../../../parser/src/deck.ts'

const escapedCode = /<pre><code(?: class="language-([\w+#.-]+)")?>([\s\S]*?)<\/code><\/pre>/g

function fenceLanguage(info: string): string {
  return /^\S+/.exec(info.trim())?.[0] ?? ''
}

function plainCode(code: string, language: string): string {
  const attribute = language ? ` class="language-${escapeHtml(language)}"` : ''
  return `<pre><code${attribute}>${escapeHtml(code)}</code></pre>`
}

export interface RenderOptions {
  base?: string
  routerMode?: RouterMode
  liveCompile?: boolean
  compileExample?: CompileLiveCode
  mcpNavigation?: boolean
  mode?: PreparserContext['mode']
  pdfDownloadHref?: string
  withoutNotes?: boolean
  extensions?: LoadedExtensions
  layers?: DeckLayers
  components?: (frontmatter: Record<string, unknown>, slideNumber: number) => DeckComponentRenderer
  resolveFileLayout?: (name: string, registered?: PresentationLayout) => Promise<PresentationLayout | undefined>
  setup?: AuthoringSetup
  entry?: string
  transformerSources?: WeakMap<Slide, TransformerSlideSource>
  writableSnippets?: ReadonlyMap<string, WritableSnippet>
  savedDrawings?: ReadonlyMap<number, SavedDrawing>
  saveDrawings?: boolean
  deckCssRevision?: string
  sourceBindings?: WeakMap<Slide, { token: string, revision: string }>
}

const sideEditor = `<aside id="side-editor" aria-labelledby="side-editor-heading" hidden>
  <header>
    <div><h2 id="side-editor-heading">Slide Markdown</h2><p id="side-editor-path"></p></div>
    <button id="side-editor-close" type="button" aria-label="Close editor">Close</button>
  </header>
  <textarea aria-label="Slide Markdown" spellcheck="false" autocomplete="off" autocapitalize="off" disabled></textarea>
  <footer>
    <button id="side-editor-save" type="button" disabled>Save</button>
    <button id="side-editor-reload" type="button" hidden>Reload source</button>
    <span id="side-editor-status" role="status"></span>
  </footer>
</aside>`

export async function renderDeck(deck: Deck, options?: RenderOptions): Promise<string> {
  return (await renderPresentation(deck, options)).html
}

const noteBreaks = /^\[click\]\s*$/gm

function resolveTimerDuration(value: unknown): number {
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const { seconds } = parseTimeString(value)
      const duration = Math.round(seconds * 1000)
      if (Number.isSafeInteger(duration) && duration > 0) return duration
    }
    catch {}
  }
  return 30 * 60 * 1000
}

export async function renderPresentation(deck: Deck, options: RenderOptions = {}): Promise<{ html: string, routes: SlideRoute[], routing: Routing, live?: LiveDeck, notesMarkdown: readonly string[], liveHighlight: boolean }> {
  const nested = deck.headmatter?.config as Record<string, unknown> | undefined
  const mode = options.mode ?? (options.liveCompile ? 'dev' : 'build')
  const menuSetting = deck.headmatter?.contextMenu ?? nested?.contextMenu
  const contextMenu = mode !== 'export' && (menuSetting == null || menuSetting === true || menuSetting === mode)
  const routing: Routing = options.mode === 'export' ? { base: '/', mode: 'legacy' } : {
    base: normalizeBasePath(options.base),
    mode: resolveRouterMode(options.routerMode ?? deck.headmatter?.routerMode ?? nested?.routerMode),
  }
  const { base, mode: routerMode } = routing
  const baseMarkup = (markup: string) => prefixMarkupUrls(markup, base)
  const { width, height } = resolveCanvas(deck.headmatter)
  const timerMode = (deck.headmatter?.timer ?? options.extensions?.theme.defaults?.timer) === 'countdown' ? 'countdown' : 'stopwatch'
  const timerDuration = resolveTimerDuration(deck.headmatter?.duration ?? options.extensions?.theme.defaults?.duration)
  const drawSettings = resolveDrawings(deck.headmatter, options.extensions?.theme.defaults?.drawings)
  const drawings: DrawingClientConfig = {
    enabled: drawingEnabled(drawSettings, mode),
    presenterOnly: drawSettings.presenterOnly,
    syncAll: drawSettings.syncAll,
    persist: options.saveDrawings === true,
    saved: Object.fromEntries([...(options.savedDrawings ?? [])].map(([slide, drawing]) => [slide, drawing.sketch])),
  }
  const configuration = options.setup
  const mathOptions = deck.headmatter?.math ?? deck.headmatter?.katex
  const mathConfig = mathOptions && typeof mathOptions === 'object' ? mathOptions as Record<string, unknown> : {}
  const strict = mathConfig.strict
  const renderFormula = createMathRenderer({
    ...configuration?.katex,
    throwOnError: typeof mathConfig.throwOnError === 'boolean' ? mathConfig.throwOnError : configuration?.katex?.throwOnError,
    errorColor: typeof mathConfig.errorColor === 'string' ? mathConfig.errorColor : configuration?.katex?.errorColor,
    trust: typeof mathConfig.trust === 'boolean' ? mathConfig.trust : configuration?.katex?.trust,
    leqno: typeof mathConfig.leqno === 'boolean' ? mathConfig.leqno : configuration?.katex?.leqno,
    fleqn: typeof mathConfig.fleqn === 'boolean' ? mathConfig.fleqn : configuration?.katex?.fleqn,
    globalGroup: typeof mathConfig.globalGroup === 'boolean' ? mathConfig.globalGroup : configuration?.katex?.globalGroup,
    maxExpand: typeof mathConfig.maxExpand === 'number' ? mathConfig.maxExpand : configuration?.katex?.maxExpand,
    maxSize: typeof mathConfig.maxSize === 'number' ? mathConfig.maxSize : configuration?.katex?.maxSize,
    minRuleThickness: typeof mathConfig.minRuleThickness === 'number' ? mathConfig.minRuleThickness : configuration?.katex?.minRuleThickness,
    colorIsTextColor: typeof mathConfig.colorIsTextColor === 'boolean' ? mathConfig.colorIsTextColor : configuration?.katex?.colorIsTextColor,
    strict: typeof strict === 'boolean' || strict === 'ignore' || strict === 'warn' || strict === 'error' ? strict : configuration?.katex?.strict,
    macros: { ...configuration?.katex?.macros, ...resolveMathMacros(deck.headmatter) },
  }, true)
  function renderMath(body: string, display: boolean, numberMarkup?: Parameters<typeof renderFormula>[2]): string {
    try { return renderFormula(body, display, numberMarkup) }
    catch (error) {
      if (!(error instanceof MathParseError)) throw error
      console.warn(error.message)
      return renderUnrenderedMath(body, display, error, false)
    }
  }
  const mermaidConfig = deck.headmatter?.mermaid
  const diagramOptions = {
    ...configuration?.mermaid,
    ...(mermaidConfig && typeof mermaidConfig === 'object' && !Array.isArray(mermaidConfig) ? mermaidConfig : {}),
  }
  const codeFences = new Map<string, MarkdownFence>()
  const renderToken = Bun.randomUUIDv7().replaceAll('-', '')
  const fencePrefix = `tp-fence-${renderToken}-`
  const rawFence = new RegExp(`(?<!language-)\\b${fencePrefix}\\d+\\b`, 'g')
  const selectedCodeTheme = deck.headmatter?.codeTheme ?? configuration?.codeHighlight?.theme
  const languages = configuration?.codeLanguageSources
    ?? (configuration?.codeHighlight?.langs ? [configuration.codeHighlight.langs] : undefined)
  const codeRenderer = createHighlightedCodeRenderer(selectedCodeTheme, configuration?.codeHighlight?.transformers, languages)
  const editorGrammars = new Map<string, Grammar>()
  const fontMarkup = deckFontMarkup(options.extensions?.theme.defaults?.fonts, nested?.fonts, deck.headmatter?.fonts)
  const color = deck.headmatter?.colorSchema ?? nested?.colorSchema
  const socialTheme = color === 'light' || (color !== 'dark' && options.extensions?.theme.name === 'paper') ? 'light' : 'dark'
  const colorSchema = color === 'auto' ? color : socialTheme
  const codeTheme = codeThemeStyles(selectedCodeTheme)
  const { extensions } = options
  const activeExtensions: PresentationAddon[] = extensions ? [extensions.theme, ...extensions.addons] : []
  const defaults = extensions?.theme.defaults
  const transforms = activeExtensions.flatMap(extension => extension.transformSlide ? [extension.transformSlide] : [])
  const noteClicks = options.withoutNotes ? new WeakMap<Slide, number>() : undefined
  const adapted = transforms.length || noteClicks ? await Promise.all(deck.slides.map(async (slide, index) => {
    let result = noteClicks ? { ...slide, notes: '' } : slide
    for (const transform of transforms) {
      result = await transform(result, index)
      if (noteClicks && result.notes) result = { ...result, notes: '' }
    }
    if (noteClicks) {
      result = { ...result, notes: '' }
      noteClicks.set(result, slide.notes.match(noteBreaks)?.length ?? 0)
    }
    const source = options.sourceBindings?.get(slide)
    if (source) options.sourceBindings?.set(result, source)
    const origin = options.transformerSources?.get(slide)
    if (origin) options.transformerSources?.set(result, origin)
    return result
  })) : deck.slides
  const activeSlides = adapted.filter(slide => slide.frontmatter?.hide !== true && slide.frontmatter?.disabled !== true)
  if (!activeSlides.length) throw new Error('The deck contains no visible slides')
  const layoutHooks = Object.assign(Object.create(null), ...activeExtensions.map(addon => addon.layouts ?? {})) as Record<string, PresentationLayout | undefined>
  const codeHooks = activeExtensions.flatMap(addon => addon.renderCode ? [addon.renderCode] : [])
  const settings = deck.headmatter?.config as Record<string, unknown> | undefined
  const transformers = configuration?.transformers
  const transformOptions: TransformerOptions | undefined = transformers && {
    mode: options.mode ?? (options.liveCompile ? 'dev' : 'build'),
    entry: options.entry,
    userRoot: options.entry && dirname(options.entry),
    config: { ...defaults, ...settings, ...deck.headmatter },
    data: {
      headmatter: deck.headmatter ?? {},
      slides: activeSlides.map((slide, index) => ({
        ...slide, index, frontmatter: slide.frontmatter ?? {}, note: slide.notes, source: options.transformerSources?.get(slide),
      })),
    },
  }
  const componentRenderers = activeSlides.map((slide, index) => options.components?.(slide.frontmatter ?? {}, index + 1))
  function effectiveLayout(slide: Slide): string {
    return slide.layout === 'default' && typeof slide.frontmatter?.layout !== 'string' ? defaults?.layout ?? slide.layout : slide.layout
  }
  const layoutNames = activeSlides.map(effectiveLayout)
  if (options.resolveFileLayout) {
    const resolve = options.resolveFileLayout
    await Promise.all([...new Set(layoutNames)].map(async (name) => {
      const layout = await resolve(name, layoutHooks[name])
      if (layout) layoutHooks[name] = layout
    }))
  }
  let groups = 0
  const deckNumberMarkup = (number: number) => `<mtext data-equation-auto="${renderToken}">(${number})</mtext>`
  function markdown(content: string, comark?: boolean): string {
    const transformFences = comark !== undefined && (!!transformers?.codeblocks.length || codeRenderer.hasTransformers)
    const prepared = prepareMarkdown(content, {
      renderMath: comark === undefined ? renderMath : (body, display) => renderMath(body, display, deckNumberMarkup),
      mathEnabled: (deck.headmatter?.math ?? deck.headmatter?.katex) !== false,
      registerFence(fence) {
        if (!transformFences && !fence.diagram && !fence.code) return
        const marker = fencePrefix + codeFences.size
        codeFences.set(marker, fence)
        return marker
      },
      codeGroups: comark === undefined ? undefined : { nextId: () => `code-group-${++groups}`, comark },
    })
    const html = prepared.restore(Bun.markdown.html(prepared.source))
      .replace(rawFence, token => {
        const fence = codeFences.get(token)
        return fence ? escapeHtml(fence.info) : token
      })
    return content.includes('[!') ? renderAlerts(html) : html
  }
  const html: Record<string, string>[] = []
  for (const [index, slide] of activeSlides.entries()) {
    const comark = (slide.frontmatter?.comark ?? deck.headmatter?.comark ?? settings?.comark) === true
    const layout = layoutNames[index]
    let source = slide.content
    if (transformers?.markdown.length && transformOptions) {
      const context = { s: new SlideMarkdownEdits(source), slide: transformOptions.data.slides[index], options: transformOptions }
      for (const transform of transformers.markdown) {
        await transform(context)
        if (context.s.hasChanged()) context.s.commit()
      }
      source = context.s.toString()
    }
    const contents = layoutHooks[layout] || hasBuiltinLayoutSlots(layout) ? splitSlots(source) : { default: source }
    const slots: Record<string, string> = Object.create(null)
    const renderComponents = componentRenderers[index]
    for (const [name, content] of Object.entries(contents)) {
      slots[name] = renderComponents ? await renderComponents(content, source => markdown(source, comark)) : markdown(content, comark)
    }
    html.push(slots)
  }
  const labels: string[] = []
  const routes = activeSlides.map((slide, index): SlideRoute => {
    const frontmatter = slide.frontmatter ?? {}
    const override = frontmatter.title || frontmatter.name
    const heading = Object.values(html[index]).map(firstSlideHeading).find(Boolean)
    const fallbackTitle = !override && !slide.level && /^Slide \d+$/.test(slide.title)
    const title = fallbackTitle && heading ? plainMarkdown(heading.html) || slide.title : slide.title
    const level = typeof frontmatter.level === 'number' ? frontmatter.level
      : override ? undefined : heading?.level ?? slide.level
    const inline = override ? Bun.markdown.html(String(override).replace(/\s*\r?\n\s*/g, ' '), { tagFilter: true }).trim().replace(/^<p>|<\/p>$/g, '')
      : heading?.html ?? escapeHtml(slide.title)
    labels.push(fallbackTitle && !heading ? '' : titleLabel(inline))
    return {
      no: index + 1,
      alias: slideAlias(frontmatter.routeAlias),
      title,
      layout: layoutNames[index],
      frontmatter,
      ...(level === undefined ? {} : { level }),
      ...(fallbackTitle && !heading ? { untitled: true } : {}),
    }
  })
  const outline = { labels, tree: createTocTree(routes) }
  const destination = createSlideDestinations(routes)
  const layers = options.layers && Object.keys(options.layers).length ? options.layers : undefined
  const slides = await Promise.all(activeSlides.map(async (slide, index) => {
    let diagram = 0
    const { layout, alias, title } = routes[index]
    const lineNumbers = (slide.frontmatter?.lineNumbers ?? deck.headmatter?.lineNumbers) === true
    const monaco = slide.frontmatter?.monaco ?? deck.headmatter?.monaco ?? settings?.monaco
    const editorMode = options.mode ?? (options.liveCompile ? 'dev' : 'build')
    const editorEnabled = monaco !== false && (monaco !== 'dev' && monaco !== 'build' || monaco === editorMode)
    const renderCode = async (block: string, language = 'text', code: string) => {
      const decoded = unescapeHtml(code)
      const fence = codeFences.get(language)
      const diagramProps = fence?.diagram
      const info = fence?.code
      if (fence) {
        const originalLanguage = fenceLanguage(fence.info)
        block = plainCode(decoded, originalLanguage)
        language = diagramProps?.type ?? info?.language ?? (originalLanguage || 'text')
      }
      const diagramIndex = language === 'charts' || language === 'ts-charts' || language === 'plantuml' || language === 'mermaid'
        ? diagram++
        : undefined
      if (fence && transformers?.codeblocks.length && transformOptions) {
        const context: CodeblockTransformContext = {
          info: fence.info.trim(), code: decoded, fence: fence.length,
          slide: transformOptions.data.slides[index], options: transformOptions,
          async renderHighlighted(override) {
            const source = override?.code ?? decoded
            const label = override?.info ?? fence.info
            const selected = parseCodeInfo(label)?.language ?? fenceLanguage(label)
            return (selected && await codeRenderer.render(source, selected, label)) || plainCode(source, selected)
          },
        }
        for (const transform of transformers.codeblocks) {
          const result = await transform(context)
          if (result != null) {
            const render = componentRenderers[index]
            return render ? render(result, source => source) : result
          }
        }
      }
      for (const hook of codeHooks) {
        const custom = hook(decoded, language, slide)
        if (custom !== undefined) return custom
      }
      const writable = info?.writeToken && options.liveCompile && options.writableSnippets?.get(info.writeToken)
      if (editorEnabled && info?.runner === 'diff') {
        const diff = await codeDiffBlock(decoded, info, lineNumbers, codeRenderer.highlight)
        if (diff) return diff
      }
      if (editorEnabled && info && (info.runner || writable)) {
        const source = decoded.replace(/\n$/, '')
        if (options.mode !== 'export') {
          const grammar = await codeRenderer.resolveGrammar(language)
          if (grammar) editorGrammars.set(language, grammar)
          if (!options.liveCompile && info.runner === 'run' && info.editorOptions?.readonly !== true && nativeCodeLanguage(language) === 'ts') {
            const javascript = await codeRenderer.resolveGrammar('js')
            if (javascript) editorGrammars.set('js', javascript)
          }
        }
        return liveBlock(source, language, info, {
          lineNumbers,
          highlighted: await codeRenderer.highlight(source, language),
          includeDiagnostics: options.mode !== 'export',
          writable: writable && info.writeToken ? { token: info.writeToken, revision: writable.revision } : undefined,
          compile: options.compileExample,
        })
      }
      if (language === 'charts' || language === 'ts-charts') {
        return renderChart(decoded, `chart-${index}-${diagramIndex}`) ?? block
      }
      if (language === 'plantuml') {
        const svg = renderPlantUml(decoded, `plantuml-${index}-${diagramIndex}`)
        return svg ? optionsForSvg(svg, diagramProps?.options ?? {}) : block
      }
      if (language === 'mermaid') {
        const svg = mermaidConfig === false ? undefined : await renderMermaid(decoded, `arrow-${index}-${diagramIndex}`, diagramOptions, diagramProps?.options, configuration?.diagramRenderer)
        return svg || block
      }
      if (info?.magic) {
        const frames = magicFrames(decoded)
        if (frames) return codeBlock(info, await Promise.all(frames.map(async frame => {
          const settings = { ...frame.info, title: frame.info.title ?? info.title, lines: frame.info.lines ?? info.lines, maxHeight: frame.info.maxHeight ?? info.maxHeight }
          return (await codeRenderer.render(frame.source, settings.language, frame.rawInfo, settings, lineNumbers))!
        })), true)
        return plainCode(decoded, 'md')
      }
      if (language === 'text' && !info && !lineNumbers && !codeRenderer.hasTransformers) return block
      const frame = info ?? (lineNumbers ? parseCodeInfo(language) : undefined)
      const rendered = await codeRenderer.render(decoded, language, fence?.info, frame, lineNumbers)
      if (rendered === undefined) return block
      return frame ? codeBlock(frame, [rendered]) : rendered
    }
    const slots = Object.fromEntries(await Promise.all(Object.entries(html[index]).map(async ([name, markup]) => {
      const blocks = [...markup.matchAll(escapedCode)]
      if (!blocks.length) return [name, markup]
      const replacements = await Promise.all(blocks.map(block => renderCode(block[0], block[1], block[2])))
      let cursor = 0
      const parts = blocks.map((block, index) => {
        const part = markup.slice(cursor, block.index) + replacements[index]
        cursor = block.index + block[0].length
        return part
      })
      return [name, parts.join('') + markup.slice(cursor)]
    })))
    const custom = layoutHooks[layout]
    const builtInBody = custom ? undefined : await renderBuiltinLayout(layout, slots, slide.frontmatter)
    const body = custom
      ? await custom({ slide, index, html: slots.default, slots })
      : builtInBody ?? slots.default
    const layer = layers && await renderSlideLayers(layers, routes[index], routes.length)
    const layered = layer?.above || layer?.below
    const markup = layered && layer ? layer.below + body + layer.above : body
    const prepared = prepareSlideHtml(markup, destination, index + 1, slide.frontmatter, socialTheme, outline)
    const className = [defaults?.className, slide.className].filter(Boolean).join(' ')
    const transition = String(slide.frontmatter?.transition ?? '')
    const motion = ['fade', 'slide-left', 'slide-up'].includes(transition) ? ` data-transition="${transition}"` : ''
    const route = alias ? ` data-route="${escapeHtml(alias)}"` : ''
    const drawing = options.savedDrawings?.get(index + 1)
    const overlay = drawing && (drawing.sketch.strokes.length || drawing.legacy) ? drawingOverlay(drawing, { width, height }) : ''
    const copy = (slide.frontmatter?.codeCopy ?? deck.headmatter?.codeCopy ?? settings?.codeCopy) === false ? ' data-code-copy-disabled' : ''
    const magic = (slide.frontmatter?.magicMoveCopy ?? deck.headmatter?.magicMoveCopy ?? settings?.magicMoveCopy) === false ? ' data-magic-copy-disabled' : ''
    const builtin = builtInBody === undefined ? '' : ' data-builtin-layout'
    return {
      html: `<article id="slide-${index + 1}" class="slide slidev-layout layout-${escapeHtml(layout)} ${escapeHtml(className)}" aria-label="${escapeHtml(title)}"${route}${motion}${copy}${magic}${builtin}${layered ? ' data-presentation-layers' : ''}>${baseMarkup(prepared.html)}${overlay}</article>`,
      css: baseMarkup(prepared.css),
    }
  }))

  // Layouts can reorder slots or omit their content. Count the equations in
  // final slide order so audience, presenter and exported ranges agree.
  let equationNumber = 0
  const autoEquation = new RegExp(`<mtext data-equation-auto="${renderToken}">\\(\\d+\\)</mtext>`, 'g')
  for (const slide of slides) {
    slide.html = slide.html.replace(autoEquation, () => `<mtext>(${++equationNumber})</mtext>`)
  }
  const choices = routes.map(({ no, title }) => `<option value="${no}">${no}. ${escapeHtml(title)}</option>`)
  const ruby = deck.headmatter?.notesAutoRuby
  const annotations = ruby && typeof ruby === 'object' && !Array.isArray(ruby)
    ? ruby as Record<string, unknown>
    : undefined
  const notes = activeSlides.map((slide) => {
    if (noteClicks) {
      const clicks = noteClicks.get(slide) ?? 0
      return clicks ? `<section hidden data-note-clicks="${clicks}"></section>` : '<section hidden></section>'
    }
    const segments = (slide.notes || 'No speaker notes for this slide.').split(noteBreaks)
    return `<section hidden${slide.notes ? ' data-has-notes="true"' : ''}>${segments.map((text, index) => `<div data-note-step="${index}">${baseMarkup(markdown(annotations ? applyNotesAutoRuby(text, annotations) : text))}</div>`).join('')}</section>`
  })

  // The live swap uses inert template fragments. Changes to hydrated slides
  // need the normal document load to execute their scoped setup scripts.
  const reactiveSlides = slides.flatMap((slide, index) => /<script\b[^>]*\bdata-stx-scoped(?:[\s=>]|$)/i.test(slide.html)
    ? [[index, snippetRevision(slide.html)]]
    : [])
  const stxRuntime = reactiveSlides.length ? await getCachedSignalsRuntime() : ''
  const preset = deck.headmatter?.clickAnimation
  const clicksPreset = typeof preset === 'string' ? escapeHtml(preset) : ''
  const navigation = JSON.stringify(routes).replaceAll('<', '\\u003c')
  const drawingConfig = JSON.stringify(drawings).replaceAll('<', '\\u003c')
  const liveGrammars = editorGrammars.size
    ? JSON.stringify([...editorGrammars.keys()].sort().map(language => [language, editorGrammars.get(language)])).replaceAll('<', '\\u003c')
    : ''
  const globalTop = baseMarkup(activeExtensions.map(extension => extension.globalTop || '').join(''))
  const globalBottom = baseMarkup(activeExtensions.map(extension => extension.globalBottom || '').join(''))
  const customControls = layers?.['custom-nav-controls']
    ? baseMarkup(await renderLayer(layers['custom-nav-controls'], routes[0], routes.length)) : ''
  const mcpNavigation = options.mcpNavigation && deck.headmatter?.mcp !== false
  let live: LiveDeck | undefined
  let liveData = ''
  if (options.liveCompile) {
    const drawingOptions = [drawings.enabled, drawings.presenterOnly, drawings.syncAll, drawings.persist]
    const theme = extensions?.theme.name
    const frame = snippetRevision(JSON.stringify([routing, width, height, clicksPreset, drawingOptions, contextMenu, theme, colorSchema, codeTheme, fontMarkup, mcpNavigation, timerMode, timerDuration, extensions?.styles, extensions?.client, globalTop, globalBottom, customControls, reactiveSlides, liveGrammars]))
    const parts = slides.map((slide, index) => {
      const source = options.sourceBindings?.get(activeSlides[index])
      const part = { ...slide, notes: notes[index], route: routes[index], sourceToken: source?.token }
      return { ...part, sourceRevision: source?.revision, revision: snippetRevision(JSON.stringify(part)) }
    })
    const deckCss = options.deckCssRevision ?? 'missing'
    const revisions = parts.map(slide => slide.revision)
    const revision = snippetRevision(JSON.stringify([frame, deck.title, deckCss, revisions, parts.map(slide => slide.sourceRevision)]))
    live = { revision, frame, title: deck.title, deckCss, slides: parts }
    liveData = `<script id="presentation-live" type="application/json">${JSON.stringify({ revision, frame, deckCss, revisions })}</script>`
  }
  const document = await renderPresentationShell({
    routeAttributes: base !== '/' || routerMode !== 'legacy' ? ` data-presentation-base="${escapeHtml(base)}" data-router-mode="${routerMode}"` : '',
    baseTag: base !== '/' || routerMode === 'history' ? `<base href="${escapeHtml(base)}">` : '',
    clickAnimation: clicksPreset ? ` data-click-animation="${clicksPreset}"` : '',
    width,
    height,
    theme: extensions?.theme.name ?? 'default',
    colorSchema,
    liveAttribute: options.liveCompile
      ? ' data-live-compile="true"' + (mcpNavigation ? ' data-mcp-navigation="true"' : '')
      : '',
    title: deck.title,
    extensionStyles: fontMarkup + (extensions?.styles ? '<link rel="stylesheet" href="./extensions.css">' : ''),
    scopedStyles: [codeTheme, ...slides.map(slide => slide.css)].filter(Boolean).join('\n  '),
    extensionScript: extensions?.client ? '<script defer src="./extensions.js"></script>' : '',
    liveHighlightScript: liveGrammars ? '<script defer src="./live-highlight.js"></script>' : '',
    globalTop,
    stxRuntime: stxRuntime ? `<script>${stxRuntime}</script>` : '',
    playerScript: '<script defer src="./presentation.js"></script>',
    navigation: `<script id="presentation-navigation" type="application/json">${navigation}</script>`,
    drawingConfig: `<script id="presentation-drawings" type="application/json">${drawingConfig}</script>`,
    liveGrammars: liveGrammars ? `<script id="presentation-live-grammars" type="application/json">${liveGrammars}</script>` : '',
    liveData,
    slideMarkup: slides.map(slide => slide.html).join('\n'),
    globalBottom,
    customControls,
    downloadButton: options.pdfDownloadHref
      ? baseMarkup(`<a id="download-pdf" href="${escapeHtml(options.pdfDownloadHref)}" download target="_blank" rel="noopener">Download PDF</a>`)
      : '',
    contextMenu: contextMenu ? '<div id="presentation-context-menu" role="menu" aria-label="Presentation actions" hidden></div>' : '',
    editorPanel: options.liveCompile ? sideEditor : '',
    withoutNotes: noteClicks ? ' data-without-notes' : '',
    entryNotesLink: noteClicks ? '' : '<a data-deck-page-link="notes">Notes</a>',
    presenterNotesLink: noteClicks ? '' : '<a id="presenter-notes-link" data-deck-page-link="notes" target="_blank" rel="noopener">Open notes view</a>',
    presenterPanelTitle: noteClicks ? 'Presenter timer' : 'Speaker notes',
    timerMode,
    timerDuration,
    presenterLayoutBelow: noteClicks ? 'Timer below' : 'Notes below',
    presenterLayoutBeside: noteClicks ? 'Timer beside slides' : 'Notes beside slides',
    notesMarkup: notes.join('\n'),
    slideChoices: choices.join(''),
    editorButton: options.liveCompile ? '<button id="edit-slide" type="button" aria-controls="side-editor" aria-expanded="false" hidden>Edit slide</button>' : '',
    drawHidden: !drawings.enabled || drawings.presenterOnly ? ' hidden' : '',
    liveStatus: options.liveCompile ? '<span id="live-update-status" role="status" hidden></span>' : '',
  })
  const notesMarkdown = options.mode === 'export' && !noteClicks ? activeSlides.map(slide => slide.notes) : []
  return { html: document, routes, routing, live, notesMarkdown, liveHighlight: Boolean(liveGrammars) }
}
