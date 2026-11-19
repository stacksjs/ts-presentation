import type { AuthoringSetup, MermaidOptions } from './authoring-setup.ts'
import type { LoadedExtensions, PresentationAddon } from './extensions.ts'
import { resolveCanvas } from './canvas.ts'
import type { CodeBlockInfo } from './code-blocks.ts'
import { codeBlock, codeFrame, createCodeHighlighter, magicFrames, parseCodeInfo } from './code-blocks.ts'
import { renderMermaid } from './diagram.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { liveBlock } from './live-markup.ts'
import { createMathRenderer, resolveMathMacros } from './math.ts'
import type { SlideRoute } from './navigation.ts'
import { slideAlias } from './navigation.ts'
import { prepareMarkdown, splitSlots } from './syntax.ts'
import type { WritableSnippet } from './snippet-write.ts'

export { defineAddon, defineTheme } from './extensions.ts'
export { defineKatexSetup, defineMermaidRendererSetup, defineMermaidSetup } from './authoring-setup.ts'
export type { KatexOptions, MermaidOptions, MermaidRenderer } from './authoring-setup.ts'
export type { PresentationNavigation, SlideRoute } from './navigation.ts'
export type { LayoutContext, PresentationAddon, PresentationTheme } from './extensions.ts'

export interface Slide {
  title: string
  content: string
  notes: string
  className: string
  layout: string
  frontmatter?: Record<string, unknown>
}

export interface Deck {
  title: string
  slides: Slide[]
  headmatter?: Record<string, unknown>
}

const codeFence = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Slide and speaker-note parsing adapted from Slidev's MIT-licensed parser.
 * See licenses/Slidev-MIT.txt for Anthony Fu's notice.
 */
export function parseDeck(markdown: string): Deck {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  const slides: Slide[] = []
  let title = ''
  let headmatter: Record<string, unknown> | undefined
  let attributes: Record<string, unknown> = {}
  let content: string[] = []
  let notes = ''
  let fence = ''
  let comment = false

  function appendSlide(): void {
    const body = content.join('\n').trim()
    if (body || notes || typeof attributes.src === 'string') {
      const heading = body.match(/^#{1,6}\s+(.+)$/m)?.[1]
        ?? body.match(/<h1\b[^>]*>([\s\S]+?)<\/h1>/i)?.[1].replace(/<[^>]+>/g, ' ')
      slides.push({
        title: String(attributes.title ?? heading ?? `Slide ${slides.length + 1}`),
        content: body,
        notes,
        className: typeof attributes.class === 'string' ? attributes.class : '',
        layout: typeof attributes.layout === 'string' ? attributes.layout : 'default',
        frontmatter: attributes,
      })
    }
    attributes = {}
    content = []
    notes = ''
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = line.match(codeFence)
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) {
        fence = ''
      }
    }
    else if (!comment && match) {
      fence = match[1]
    }
    else if (!comment && line.trimEnd() === '---') {
      appendSlide()
      const next = lines[index + 1]
      if (next && /^\w[\w-]*\s*:/.test(next)) {
        const end = lines.findIndex((value, offset) => offset > index && value.trimEnd() === '---')
        if (end === -1) throw new Error(`Unclosed slide frontmatter at line ${index + 1}`)
        const yaml: unknown = Bun.YAML.parse(lines.slice(index + 1, end).join('\n'))
        if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) {
          throw new Error(`Slide frontmatter must be a YAML mapping at line ${index + 1}`)
        }
        attributes = yaml as Record<string, unknown>
        if (index === 0) {
          headmatter = attributes
          if (typeof attributes.title === 'string') title = attributes.title
        }
        index = end
      }
      continue
    }
    else if (!comment && line.trimStart().startsWith('<!--')) {
      // A final HTML comment belongs to the speaker, in the Slidev format.
      const commentLines = [line.trimStart().slice(4)]
      let endLine = index
      while (!commentLines[commentLines.length - 1].includes('-->') && endLine + 1 < lines.length) {
        commentLines.push(lines[++endLine])
      }
      const finalLine = commentLines[commentLines.length - 1]
      const end = finalLine.indexOf('-->')
      if (end !== -1 && !finalLine.slice(end + 3).trim()) {
        let nextLine = endLine + 1
        while (nextLine < lines.length && !lines[nextLine].trim()) nextLine++
        if (nextLine === lines.length || lines[nextLine].trimEnd() === '---') {
          commentLines[commentLines.length - 1] = finalLine.slice(0, end)
          notes = commentLines.join('\n').trim()
          index = endLine
          continue
        }
      }
    }

    if (!fence && !match) {
      for (const delimiter of line.matchAll(/<!--|-->/g)) {
        if (!comment && delimiter[0] === '<!--') comment = true
        else if (comment && delimiter[0] === '-->') comment = false
      }
    }
    content.push(line)
  }
  appendSlide()

  if (!slides.length) throw new Error('The deck contains no slides')
  return { title: title || slides[0].title, slides, headmatter }
}

const escapedCode = /<pre><code(?: class="language-([\w+#.-]+)")?>([\s\S]*?)<\/code><\/pre>/g

export interface RenderOptions {
  liveCompile?: boolean
  extensions?: LoadedExtensions
  setup?: AuthoringSetup
  writableSnippets?: ReadonlyMap<string, WritableSnippet>
}

export async function renderDeck(deck: Deck, options?: RenderOptions): Promise<string> {
  return (await renderPresentation(deck, options)).html
}

export async function renderPresentation(deck: Deck, options: RenderOptions = {}): Promise<{ html: string, routes: SlideRoute[] }> {
  const { width, height } = resolveCanvas(deck.headmatter)
  const configuration = options.setup
  const renderMath = createMathRenderer({
    ...configuration?.katex,
    macros: { ...configuration?.katex?.macros, ...resolveMathMacros(deck.headmatter) },
  })
  const mermaidConfig = deck.headmatter?.mermaid
  const diagramOptions = {
    ...configuration?.mermaid,
    ...(mermaidConfig && typeof mermaidConfig === 'object' && !Array.isArray(mermaidConfig) ? mermaidConfig : {}),
  }
  const diagramFences = new Map<string, MermaidOptions>()
  const codeFences = new Map<string, CodeBlockInfo>()
  const highlight = createCodeHighlighter()
  const { extensions } = options
  const activeExtensions: PresentationAddon[] = extensions ? [extensions.theme, ...extensions.addons] : []
  const defaults = extensions?.theme.defaults
  const transforms = activeExtensions.flatMap(extension => extension.transformSlide ? [extension.transformSlide] : [])
  const adapted = transforms.length ? await Promise.all(deck.slides.map(async (slide, index) => {
    let result = slide
    for (const transform of transforms) result = await transform(result, index)
    return result
  })) : deck.slides
  const activeSlides = adapted.filter(slide => slide.frontmatter?.hide !== true && slide.frontmatter?.disabled !== true)
  if (!activeSlides.length) throw new Error('The deck contains no visible slides')
  const layoutHooks = Object.assign(Object.create(null), ...activeExtensions.map(addon => addon.layouts ?? {})) as NonNullable<PresentationAddon['layouts']>
  const codeHooks = activeExtensions.flatMap(addon => addon.renderCode ? [addon.renderCode] : [])
  function effectiveLayout(slide: Slide): string {
    return slide.layout === 'default' && typeof slide.frontmatter?.layout !== 'string' ? defaults?.layout ?? slide.layout : slide.layout
  }
  function markdown(content: string): string {
    const prepared = prepareMarkdown(content, {
      renderMath,
      mathEnabled: (deck.headmatter?.math ?? deck.headmatter?.katex) !== false,
      registerMermaid(value) {
        const marker = `mermaid-fence-${diagramFences.size}`
        diagramFences.set(marker, value)
        return marker
      },
      registerCode(info) {
        const marker = `tp-code-${codeFences.size}`
        codeFences.set(marker, info)
        return marker
      },
    })
    return prepared.restore(Bun.markdown.html(prepared.source))
  }
  const html = activeSlides.map((slide) => {
    if (!layoutHooks[effectiveLayout(slide)]) return { default: markdown(slide.content) }
    return Object.fromEntries(Object.entries(splitSlots(slide.content)).map(([name, content]) => [name, markdown(content)]))
  })
  const routes = activeSlides.map((slide, index): SlideRoute => ({
    no: index + 1,
    alias: slideAlias(slide.frontmatter?.routeAlias),
    title: slide.title,
    layout: effectiveLayout(slide),
    frontmatter: slide.frontmatter ?? {},
  }))
  const slides = await Promise.all(activeSlides.map(async (slide, index) => {
    let diagram = 0
    const { layout, alias } = routes[index]
    const lineNumbers = (slide.frontmatter?.lineNumbers ?? deck.headmatter?.lineNumbers) === true
    const renderCode = async (block: string, language = 'text', code: string) => {
      const decoded = unescapeHtml(code)
      const diagramProps = diagramFences.get(language)
      const info = codeFences.get(language)
      if (info) language = info.language
      if (diagramProps) language = 'mermaid'
      for (const hook of codeHooks) {
        const custom = hook(decoded, language, slide)
        if (custom !== undefined) return custom
      }
      const live = /^(js|ts)-tp-(run|edit)$/.exec(language)
      if (live) return liveBlock(decoded.trimEnd(), live[1] === 'ts' ? 'ts' : 'js', live[2] === 'run')
      const writable = info?.writeToken && options.liveCompile && options.writableSnippets?.get(info.writeToken)
      if (writable && /^(js|javascript|ts|typescript)$/.test(language)) {
        return liveBlock(decoded.replace(/\n$/, ''), language.startsWith('t') ? 'ts' : 'js', false,
          { token: info.writeToken!, revision: writable.revision })
      }
      if (language === 'mermaid') {
        const svg = mermaidConfig === false ? undefined : await renderMermaid(decoded, `arrow-${index}-${diagram++}`, diagramOptions, diagramProps, configuration?.diagramRenderer)
        return svg || (diagramProps ? block.replace(/language-mermaid-fence-\d+/, 'language-mermaid') : block)
      }
      if (info?.magic) {
        const frames = magicFrames(decoded)
        if (frames) return codeBlock(info, await Promise.all(frames.map(async frame => codeFrame({
          ...frame,
          info: { ...frame.info, title: frame.info.title ?? info.title, lines: frame.info.lines ?? info.lines, maxHeight: frame.info.maxHeight ?? info.maxHeight },
        }, await highlight(frame.source, frame.info.language), lineNumbers))), true)
        return block.replace(/language-tp-code-\d+/, 'language-md')
      }
      const lines = language === 'text' && !info && !lineNumbers ? undefined : await highlight(decoded, language)
      if (info || lineNumbers) {
        const settings = info ?? parseCodeInfo(language)
        if (settings) return codeBlock(settings, [codeFrame({ source: decoded, info: settings }, lines, lineNumbers)])
      }
      return lines ? `<pre><code class="language-${language}">${lines.join('\n')}</code></pre>` : block
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
    const body = custom ? custom({ slide, index, html: slots.default, slots }) : slots.default
    const className = [defaults?.className, slide.className].filter(Boolean).join(' ')
    const transition = String(slide.frontmatter?.transition ?? '')
    const motion = ['fade', 'slide-left', 'slide-up'].includes(transition) ? ` data-transition="${transition}"` : ''
    const route = alias ? ` data-route="${escapeHtml(alias)}"` : ''
    const image = slide.frontmatter?.image ?? slide.frontmatter?.background
    const safeImage = typeof image === 'string' && /^(?:https?:\/\/|[./]|[\w-]+\/)/.test(image) ? image : ''
    const background = safeImage && layout.startsWith('image-') && !custom
      ? `<img class="slide-layout-image" src="${escapeHtml(safeImage)}" alt="" loading="lazy">`
      : ''
    return `<article id="slide-${index + 1}" class="slide slidev-layout layout-${escapeHtml(layout)} ${escapeHtml(className)}" aria-label="${escapeHtml(slide.title)}"${route}${motion}>${background ? `${background}<div class="slide-content">${body}</div>` : body}</article>`
  }))

  const choices = activeSlides.map((slide, index) => `<option value="${index + 1}">${index + 1}. ${escapeHtml(slide.title)}</option>`)
  const notes = activeSlides.map((slide) => {
    const segments = (slide.notes || 'No speaker notes for this slide.').split(/^\[click\]\s*$/m)
    return `<section hidden${slide.notes ? ' data-has-notes="true"' : ''}>${segments.map((text, index) => `<div data-note-step="${index}">${markdown(text)}</div>`).join('')}</section>`
  })
  const overview = activeSlides.map((slide, index) => `<li><button type="button" value="${index + 1}"><span>${index + 1}</span> ${escapeHtml(slide.title)}</button></li>`)

  const navigation = JSON.stringify(routes).replaceAll('<', '\\u003c')
  const document = `<!doctype html>
<html lang="en" data-slide-width="${width}" data-slide-height="${height}" data-theme="${escapeHtml(extensions?.theme.name ?? 'default')}"${options.liveCompile ? ' data-live-compile="true"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>${escapeHtml(deck.title)}</title>
  <link rel="stylesheet" href="./presentation.css">
  ${extensions?.styles ? '<link rel="stylesheet" href="./extensions.css">' : ''}
  <link rel="stylesheet" href="./deck.css">
  <style>:root { --slide-width: ${width}px; --slide-height: ${height}px; } @page { size: ${width}px ${height}px; margin: 0; }</style>
  ${extensions?.client ? '<script defer src="./extensions.js"></script>' : ''}
  <script defer src="./presentation.js"></script>
</head>
<body>
  ${activeExtensions.map(extension => extension.globalTop || '').join('')}
  <script id="presentation-navigation" type="application/json">${navigation}</script>
  <main id="stage">${slides.join('\n')}</main>
  ${activeExtensions.map(extension => extension.globalBottom || '').join('')}
  <aside id="presenter-notes" hidden aria-label="Speaker notes">
    <header class="presenter-header">
      <h2>Speaker notes</h2>
      <div class="presenter-timing">
        <span id="presenter-time" aria-label="Elapsed time">0:00</span>
        <button id="presenter-reset" type="button">Reset timer</button>
      </div>
    </header>
    ${notes.join('\n')}
  </aside>
  <aside id="presenter-preview" hidden aria-label="Next frame">
    <p id="presenter-next"></p>
    <iframe title="Next presentation frame" tabindex="-1" inert></iframe>
  </aside>
  <div id="presenter-width" class="presenter-separator" role="separator" aria-label="Panel width" aria-orientation="vertical" tabindex="0" hidden></div>
  <div id="presenter-height" class="presenter-separator" role="separator" aria-label="Panel height" aria-orientation="horizontal" tabindex="0" hidden></div>
  <nav id="controls" aria-label="Presentation controls">
    <button id="previous" type="button" aria-label="Previous slide">←</button>
    <select id="goto" aria-label="Go to slide">${choices.join('')}</select>
    <button id="next" type="button" aria-label="Next slide">→</button>
    <button id="presenter" type="button">Presenter view</button>
    <select id="presenter-layout" aria-label="Presenter layout" hidden>
      <option value="1">Notes below</option>
      <option value="2">Notes beside slides</option>
      <option value="3">Large preview</option>
    </select>
    <div id="presenter-steps" hidden>
      <input id="presenter-seek" aria-label="Reveal step" type="range" step="1">
      <output for="presenter-seek"></output>
    </div>
    <button id="overview-button" type="button">Overview</button>
    <button id="draw-button" type="button" aria-pressed="false">Draw</button>
    <button id="fullscreen" type="button">Fullscreen</button>
    <button id="record-button" type="button" hidden>Record</button>
  </nav>
  <dialog id="overview" aria-label="Slide overview">
    <form method="dialog"><button aria-label="Close overview">Close</button></form>
    <h2>Slide overview</h2>
    <ol>${overview.join('')}</ol>
  </dialog>
  <dialog id="image-view" aria-label="Screenshot detail">
    <form method="dialog"><button aria-label="Close screenshot">Close</button></form>
    <img alt="">
  </dialog>
</body>
</html>
`
  return { html: document, routes }
}
