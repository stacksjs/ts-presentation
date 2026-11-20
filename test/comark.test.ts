import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseDeck, renderDeck } from '../src/index.ts'
import { formatDeck, inspectDeckSource, slideSourceOf } from '../packages/parser/src/deck.ts'

test('renders the copied Slidev Comark fixture with a positioned arrow', async () => {
  const source = await Bun.file(join(import.meta.dir, 'fixtures/slidev-markdown/mdc.md')).text()
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('<title>Comark</title>')
  expect(html).toContain('<h1 style="color:red">Comark</h1>')
  expect(html).toContain('marker-end="url(#slide-arrow-1-1)"')
  expect(html).toContain('<line x1="10" y1="10" x2="11" y2="11"')
})

test('attaches Comark attributes to native Markdown with the legacy mdc setting', async () => {
  const source = [
    '---', 'mdc: true', '---', '# **Heading** {.intro.wide #intro}', '',
    'A [**styled** [link](/demo) and $x^2$]{.marked title=\'Text & "markup"\'}.', '',
    '![Diagram](/image.png){width=500px lazy} [Next](#2){.button} **bold**{.heavy} `code`{.sample}', '',
    'Paragraph with attributes. {data-state="active"}', '', '> Quote {#quote}', '',
    '- [x] Task {data-status=done}', '',
    '`[code]{.literal}` and **word**\\{.escaped}', '',
    '```md', '# Fenced {.literal}', '```', '',
    '<pre>[raw]{.literal}</pre>', '', '---', '', '# Next',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('<h1 class="intro wide" id="intro"><strong>Heading</strong></h1>')
  expect(html).toContain('<span class="marked" title="Text &amp; &quot;markup&quot;"><strong>styled</strong> <a href="/demo">link</a> and <math')
  expect(html).toContain('<img src="/image.png" alt="Diagram" width="500px" lazy>')
  expect(html).toMatch(/<a [^>]*data-slide-link="2"[^>]*class="button"[^>]*>Next<\/a>/)
  expect(html).toContain('<strong class="heavy">bold</strong> <code class="sample">code</code>')
  expect(html).toContain('<p data-state="active">Paragraph with attributes.</p>')
  expect(html).toContain('<blockquote id="quote">')
  expect(html).toContain('<li class="task-list-item" data-status="done">')
  expect(html).toContain('<code>[code]{.literal}</code> and <strong>word</strong>{.escaped}')
  expect(html).toContain('<pre>[raw]{.literal}</pre>')
  expect(html).not.toContain('tp-attrs-')
})

test('keeps frontmatter-style Comark props inside the same slide and source ranges', () => {
  const source = [
    '---', 'config:', '  mdc: true', '---', '# First', '',
    '::demo-card', '---', 'title: Component title', 'message: |', '  ---', '  <!-- literal', '---', '',
    '  :::nested-card', '  ---', '  title: Nested title', '  ---', '  :::', '',
    '#footer', 'Card footer', '::', '', '<!--', 'Speaker note.', '-->', '',
    '---', 'title: Next slide', '---', '# Second', '',
  ].join('\r\n')
  const deck = parseDeck(source)
  expect(deck.slides.map(slide => slide.title)).toEqual(['First', 'Next slide'])
  expect(deck.headmatter).toEqual({ config: { mdc: true } })
  expect(deck.slides[0].content).toContain('title: Component title\nmessage: |\n  ---\n  <!-- literal')
  expect(deck.slides[0].notes).toBe('Speaker note.')
  expect(deck.slides[1].frontmatter).toEqual({ title: 'Next slide' })
  expect(inspectDeckSource(source).map(slide => slide.endLine)).toEqual(deck.slides.map(slide => slideSourceOf(slide)!.endLine))
  expect(inspectDeckSource(source).map(slide => slide.frontmatter)).toEqual([{ start: 0, end: 3 }, { start: 28, end: 30 }])
  expect(parseDeck(formatDeck(source))).toEqual(deck)
})

test('preserves slide separators after literal and incomplete Comark examples', () => {
  const source = [
    '---', 'comark: true', '---', '# First', '',
    '```md', '::demo-card', '---', 'title: Sample code', '---', '::', '```', '',
    '<!--', '::demo-card', '---', 'title: Comment', '---', '::', '-->', '',
    '::unclosed-card', '---', 'title: Second slide', '---', '# Second', '',
    '---', 'comark: false', '---', '# Literal', '::demo-card',
    '---', 'title: Third separator', '---', '# Fourth', '::', '',
  ].join('\n')
  const deck = parseDeck(source)
  expect(deck.slides.map(slide => slide.title)).toEqual(['First', 'Second slide', 'Literal', 'Third separator'])
  expect(inspectDeckSource(source)).toHaveLength(4)
  expect(deck.slides[0].content).toContain('::unclosed-card')
  expect(deck.slides[2].content).toContain('::demo-card')
})
