import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseDeck, renderDeck } from '../src/index.ts'

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
