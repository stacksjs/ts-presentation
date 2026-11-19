import type { LoadedExtensions, PresentationAddon } from './extensions.ts'
import { resolveGrammar, tokenClass, Tokenizer } from 'ts-syntax-highlighter/browser'
import { resolveCanvas } from './canvas.ts'
import { flowchart } from './diagram.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { liveBlock } from './live-markup.ts'
import { prepareMarkdown, splitSlots } from './syntax.ts'

export { defineAddon, defineTheme } from './extensions.ts'
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

const escapedCode = /<pre><code class="language-([\w+#.-]+)">([\s\S]*?)<\/code><\/pre>/g

export interface RenderOptions {
  liveCompile?: boolean
  extensions?: LoadedExtensions
}

export async function renderDeck(deck: Deck, options: RenderOptions = {}): Promise<string> {
  const { width, height } = resolveCanvas(deck.headmatter)
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
    const prepared = prepareMarkdown(content)
    return prepared.restore(Bun.markdown.html(prepared.source))
  }
  const html = activeSlides.map((slide) => {
    if (!layoutHooks[effectiveLayout(slide)]) return { default: markdown(slide.content) }
    return Object.fromEntries(Object.entries(splitSlots(slide.content)).map(([name, content]) => [name, markdown(content)]))
  })
  const languages = new Set(html.flatMap(slide => Object.values(slide).flatMap(slot => Array.from(slot.matchAll(escapedCode), match => match[1]))))
  const highlightedLanguages = [...languages].filter(language => !language.endsWith('-tp-run') && !language.endsWith('-tp-edit') && language !== 'mermaid')
  const grammars = new Map(await Promise.all(highlightedLanguages.map(async language => [language, await resolveGrammar(language)] as const)))
  const slides = activeSlides.map((slide, index) => {
    let diagram = 0
    const layout = effectiveLayout(slide)
    const renderCode = (block: string, language: string, code: string) => {
      const decoded = unescapeHtml(code)
      for (const hook of codeHooks) {
        const custom = hook(decoded, language, slide)
        if (custom !== undefined) return custom
      }
      const live = /^(js|ts)-tp-(run|edit)$/.exec(language)
      if (live) return liveBlock(decoded.trimEnd(), live[1] === 'ts' ? 'ts' : 'js', live[2] === 'run')
      if (language === 'mermaid') return flowchart(decoded, `arrow-${index}-${diagram++}`) || block
      const grammar = grammars.get(language)
      if (!grammar) return block
      const lines = new Tokenizer(grammar).tokenize(decoded)
      const highlighted = lines.map(line => line.tokens
        .map(token => `<span class="tok-${tokenClass(token.type)}">${escapeHtml(token.content)}</span>`)
        .join('')).join('\n')
      return `<pre><code class="language-${language}">${highlighted}</code></pre>`
    }
    const slots = Object.fromEntries(Object.entries(html[index]).map(([name, markup]) => [name, markup.replace(escapedCode, renderCode)]))
    const custom = layoutHooks[layout]
    const body = custom ? custom({ slide, index, html: slots.default, slots }) : slots.default
    const className = [defaults?.className, slide.className].filter(Boolean).join(' ')
    const alias = String(slide.frontmatter?.routeAlias ?? '')
    const transition = String(slide.frontmatter?.transition ?? '')
    const motion = ['fade', 'slide-left', 'slide-up'].includes(transition) ? ` data-transition="${transition}"` : ''
    const route = /^[a-z][a-z0-9-]*$/i.test(alias) ? ` data-route="${escapeHtml(alias)}"` : ''
    const image = slide.frontmatter?.image ?? slide.frontmatter?.background
    const safeImage = typeof image === 'string' && /^(?:https?:\/\/|[./]|[\w-]+\/)/.test(image) ? image : ''
    const background = safeImage && layout.startsWith('image-') && !custom
      ? `<img class="slide-layout-image" src="${escapeHtml(safeImage)}" alt="" loading="lazy">`
      : ''
    return `<article id="slide-${index + 1}" class="slide slidev-layout layout-${escapeHtml(layout)} ${escapeHtml(className)}" aria-label="${escapeHtml(slide.title)}"${route}${motion}>${background ? `${background}<div class="slide-content">${body}</div>` : body}</article>`
  })

  const choices = activeSlides.map((slide, index) => `<option value="${index + 1}">${index + 1}. ${escapeHtml(slide.title)}</option>`)
  const notes = activeSlides.map((slide) => {
    const segments = (slide.notes || 'No speaker notes for this slide.').split(/^\[click\]\s*$/m)
    return `<section hidden${slide.notes ? ' data-has-notes="true"' : ''}>${segments.map((text, index) => `<div data-note-step="${index}">${Bun.markdown.html(text)}</div>`).join('')}</section>`
  })
  const overview = activeSlides.map((slide, index) => `<li><button type="button" value="${index + 1}"><span>${index + 1}</span> ${escapeHtml(slide.title)}</button></li>`)

  return `<!doctype html>
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
  <main id="stage">${slides.join('\n')}</main>
  ${activeExtensions.map(extension => extension.globalBottom || '').join('')}
  <aside id="presenter-notes" hidden aria-label="Speaker notes">
    <header class="presenter-header">
      <h2>Speaker notes</h2>
      <div class="presenter-timing">
        <span id="presenter-time" aria-label="Elapsed time">0:00</span>
        <button id="presenter-reset" type="button">Reset timer</button>
      </div>
      <p id="presenter-next"></p>
    </header>
    ${notes.join('\n')}
  </aside>
  <nav id="controls" aria-label="Presentation controls">
    <button id="previous" type="button" aria-label="Previous slide">←</button>
    <select id="goto" aria-label="Go to slide">${choices.join('')}</select>
    <button id="next" type="button" aria-label="Next slide">→</button>
    <button id="presenter" type="button">Presenter view</button>
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
}
