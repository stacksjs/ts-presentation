import { resolveGrammar, tokenClass, Tokenizer } from 'ts-syntax-highlighter/browser'

export interface Slide {
  title: string
  content: string
  notes: string
  className: string
  layout: string
}

export interface Deck {
  title: string
  slides: Slide[]
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
  let attributes: Record<string, unknown> = {}
  let content: string[] = []
  let notes = ''
  let fence = ''
  let comment = false

  function appendSlide(): void {
    const body = content.join('\n').trim()
    if (body || notes) {
      const heading = body.match(/^#{1,6}\s+(.+)$/m)?.[1]
        ?? body.match(/<h1\b[^>]*>([\s\S]+?)<\/h1>/i)?.[1].replace(/<[^>]+>/g, ' ')
      slides.push({
        title: String(attributes.title ?? heading ?? `Slide ${slides.length + 1}`),
        content: body,
        notes,
        className: typeof attributes.class === 'string' ? attributes.class : '',
        layout: typeof attributes.layout === 'string' ? attributes.layout : 'default',
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
        if (index === 0 && typeof attributes.title === 'string') title = attributes.title
        index = end
      }
      continue
    }
    else if (!comment && line.trimStart().startsWith('<!--')) {
      // A final HTML comment belongs to the speaker, in the Slidev format.
      const rest = lines.slice(index).join('\n').trimStart()
      const end = rest.indexOf('-->')
      if (end >= 0 && /^\s*(?:---[^\S\n]*(?:\n|$)|$)/.test(rest.slice(end + 3))) {
        notes = rest.slice(4, end).trim()
        index += rest.slice(0, end + 3).split('\n').length - 1
        continue
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
  return { title: title || slides[0].title, slides }
}

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => entities[character])
}

const escapedCode = /<pre><code class="language-([\w+#.-]+)">([\s\S]*?)<\/code><\/pre>/g
const characters = Object.fromEntries(Object.entries(entities).map(([character, escaped]) => [escaped, character]))

export async function renderDeck(deck: Deck): Promise<string> {
  const html = deck.slides.map(slide => Bun.markdown.html(slide.content))
  const languages = new Set(html.flatMap(slide => Array.from(slide.matchAll(escapedCode), match => match[1])))
  const grammars = new Map(await Promise.all([...languages].map(async language => [language, await resolveGrammar(language)] as const)))
  const slides = deck.slides.map((slide, index) => {
    const body = html[index].replace(escapedCode, (block, language: string, code: string) => {
      const grammar = grammars.get(language)
      if (!grammar) return block

      const decoded = code.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => characters[entity])
      const lines = new Tokenizer(grammar).tokenize(decoded)
      const highlighted = lines.map(line => line.tokens
        .map(token => `<span class="tok-${tokenClass(token.type)}">${escapeHtml(token.content)}</span>`)
        .join('')).join('\n')
      return `<pre><code class="language-${language}">${highlighted}</code></pre>`
    })
    return `<article id="slide-${index + 1}" class="slide slidev-layout layout-${escapeHtml(slide.layout)} ${escapeHtml(slide.className)}" aria-label="${escapeHtml(slide.title)}">${body}</article>`
  })

  const options = deck.slides.map((slide, index) => `<option value="${index + 1}">${index + 1}. ${escapeHtml(slide.title)}</option>`)
  const notes = deck.slides.map(slide => `<section hidden>${Bun.markdown.html(slide.notes || 'No speaker notes for this slide.')}</section>`)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>${escapeHtml(deck.title)}</title>
  <link rel="stylesheet" href="./presentation.css">
  <link rel="stylesheet" href="./deck.css">
  <script defer src="./presentation.js"></script>
</head>
<body>
  <main id="stage">${slides.join('\n')}</main>
  <aside id="presenter-notes" hidden aria-label="Speaker notes">
    <h2>Speaker notes</h2>
    ${notes.join('\n')}
  </aside>
  <nav id="controls" aria-label="Presentation controls">
    <button id="previous" type="button" aria-label="Previous slide">←</button>
    <select id="goto" aria-label="Go to slide">${options.join('')}</select>
    <button id="next" type="button" aria-label="Next slide">→</button>
    <button id="presenter" type="button">Presenter view</button>
    <button id="fullscreen" type="button">Fullscreen</button>
  </nav>
</body>
</html>
`
}
