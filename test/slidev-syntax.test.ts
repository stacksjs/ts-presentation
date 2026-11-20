import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lineMatches, parseEquationOptions } from '../packages/client/runtime/equation-steps.ts'
import { readFenceOptions } from '../packages/slidev/node/runtime/fence-options.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { mermaid } from '../packages/slidev/node/runtime/diagram.ts'

// Adapted from Slidev's packages/slidev/node/syntax/katex.test.ts and
// integration.test.ts. See licenses/Slidev-MIT.txt.
test('renders inline math, keeps display ranges, and protects fenced source', async () => {
  const source = [
    '# Test', '', 'This is $x^2$ inline', '',
    '$$ {2,3|4}', 'x^2', '$$', '',
    '```', '$$x^2$$', '```', '',
    '$$ x^2 +', 'y^2 $$',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/<math /g)).toHaveLength(3)
  expect(html).toContain('data-equation-steps="2,3|4"')
  expect(html).toContain('<pre><code>$$x^2$$\n</code></pre>')
  expect(html).toContain('<msup><mi>y</mi><mn>2</mn></msup>')
  expect(parseEquationOptions("{hide|2-} {at: '+2', startLine: 2, finally: 'all'}")).toEqual({
    ranges: ['hide', '2-'], at: '+2', startLine: 2, finally: 'all',
  })
  expect([1, 2, 3, 4, 9].filter(line => lineMatches('2,4-', line))).toEqual([2, 4, 9])
})

test('numbers alignment rows, preserves deck-scoped math definitions, and formats chemistry', async () => {
  const markdown = String.raw`# First

$\gdef\sq#1{#1^2} \sq{x}$

---

# Second

$$
\begin{align}
  a &= \sq{y} \\
  b &= 2 \notag \\
  c &= 3 \tag{C}\\[.3em]
  d &= 4
\end{align}
$$

$\ce{2 H2 + O2 ->[heat] 2 H2O(l)}$
$\ce{Fe^{3+} + e- <=> Fe^{2+}}$
$\pu{1.5e-3 mol/L}$
`
  const html = await renderDeck(parseDeck(markdown))
  expect(html).toContain('<msup><mi>y</mi><mn>2</mn></msup>')
  expect(html.match(/class="math-equation-number"/g)).toHaveLength(4)
  expect(html).toContain('<mtext>(1)</mtext>')
  expect(html).toContain('<mtext>(C)</mtext>')
  expect(html).toContain('<mtext>(2)</mtext>')
  expect(html).toContain('<mtext>heat</mtext>')
  expect(html).toContain('<mo stretchy="true" movablelimits="false" minsize="1.75em">⇌</mo>')
  expect(html).toContain('<mo>3+</mo>')
  expect(html).toContain('<msup><mn>10</mn><mn>−3</mn></msup>')
  const nextDeck = await renderDeck(parseDeck('# Third\n\n$\\sq{z}$'))
  expect(nextDeck).toContain('<mtext>\\sq</mtext>')
})

test('reads Mermaid fence options without executing expressions', async () => {
  expect(readFenceOptions("{scale:0.5, theme: 'forest'}")).toMatchObject({ scale: 0.5, theme: 'forest' })
  expect(readFenceOptions('{scale: process.exit(1)}')).toBeUndefined()
  const input = ['# Diagram', '', "```mermaid {scale:0.5,theme:'forest'}", 'flowchart LR', 'A --> B', '```'].join('\n')
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('data-diagram-theme="forest"')
  const svg = /<svg\b[^>]*viewBox="0 0 \d+ (\d+)"[^>]* height="(\d+)"/.exec(html)
  expect(svg && Number(svg[2])).toBe(Math.round(Number(svg?.[1]) * 0.5))
  const disabled = await renderDeck(parseDeck('---\nkatex: false\nmermaid: false\n---\n\n' + input + '\n\n$x^2$'))
  expect(disabled).not.toContain('<svg')
  expect(disabled).toContain('language-mermaid')
  expect(disabled).toContain('$x^2$')
})

test('renders class and ER diagrams with markers and a pie chart with its legend', () => {
  const diagram = mermaid(`classDiagram
    direction LR
    class Shape {
      <<Abstract>>
      +draw()
    }
    Shape <|-- Circle : inherits`, 'class-example')
  expect(diagram).toContain('marker-start="url(#class-example-triangle)"')
  expect(diagram).toContain('+draw()')
  expect(diagram).toContain('inherits')
  const er = mermaid(`erDiagram
    ORDER ||--o{ ITEM : contains
    ORDER {
      int id PK
    }
    ITEM {
      int order_id FK
    }`, 'er-example')
  expect(er).toContain('marker-end="url(#er-example-zero-many)"')
  expect(er).toContain('order_id FK')
  const pie = mermaid(`---
title: Work by category
config:
  theme: neutral
  pie:
    donutHole: 0.3
---
pie showData
  "Completed" : 7
  "Open" : 3`, 'pie-example')
  expect(pie).toContain('aria-label="Work by category"')
  expect(pie).toContain('data-diagram-theme="neutral"')
  expect(pie).toContain('Completed [7]')
  expect(pie).toContain('70%')
})

test('loads math and Mermaid setup hooks from a standalone deck', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'standalone-slide-'))
  try {
    await mkdir(join(directory, 'setup'))
    const entry = join(directory, 'slides.md')
    await Promise.all([
      Bun.write(entry, [
        '---', 'math:', '  leqno: false', '  macros:',
        "    '\\converted': { numArgs: 1, tokens: [{ text: '}' }, { text: '1' }, { text: '#' }, { text: '{' }, { text: '\\text' }] }",
        "    '\\fromsetup': { numArgs: 0, tokens: [{ noexpand: true }] }",
        '---', '', '# Standalone', '', '$\\X + \\converted{ready} + \\fromsetup + \\describe{xy}$', '',
        '$$', String.raw`x=y\tag{A}`, '$$', '',
        '```mermaid {theme:"forest", scale:0.5}', 'special', '```',
      ].join('\n')),
      Bun.write(join(directory, 'setup/katex.ts'), String.raw`export default () => ({
        macros: {
          '\\X': '\\mathbb{X}',
          '\\fromsetup': { tokens: [{ text: '\\Delta', noexpand: true }], numArgs: 0 },
          '\\describe': context => {
            const { tokens } = context.consumeArg()
            return '\\text{arg: ' + context.expandTokens(tokens).map(token => token.text).join('') + '}'
          },
        },
        fleqn: true,
        leqno: true,
      })`),
      Bun.write(join(directory, 'setup/mermaid.ts'), `export default async () => ({ theme: 'dark', id: 'standalone' })`),
      Bun.write(join(directory, 'setup/mermaid-renderer.ts'), `export default () => async (code, options) => '<svg viewBox="0 0 60 40"><text>' + options.id + ' ' + code + '</text></svg>'`),
    ])
    const deck = await createDeckCompiler(entry)()
    expect(deck.html).toContain('<mi>𝕏</mi>')
    expect(deck.html).toContain('<mtext>ready</mtext>')
    expect(deck.html).toContain('<mi mathvariant="normal">Δ</mi>')
    expect(deck.html).toContain('<mtext>arg: xy</mtext>')
    expect(deck.html).toContain('display="block" style="display:block;padding-inline-start:2em;text-align:start"')
    expect(deck.html).toContain('class="math-equation-number" style="display:math;padding:0;justify-self:end"><mtext>(A)</mtext>')
    expect(deck.html).toContain('data-diagram-theme="forest" height="20"')
    expect(deck.html).toContain('standalone special')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('closes self-closing reveal components without changing code or void images', async () => {
  const html = await renderDeck(parseDeck([
    '# Reveal authoring', '',
    '<v-click-gap size="1" />',
    '<div v-click aria-label="Greater than > zero" />',
    '<img v-click src="./diagram.png" alt="" />', '',
    '~~~text', '<v-click-gap size="2" />', '~~~',
  ].join('\n')))
  expect(html).toContain('<v-click-gap size="1"></v-click-gap>')
  expect(html).toContain('<div v-click aria-label="Greater than > zero"></div>')
  expect(html).toContain('<img v-click src="./diagram.png" alt="" />')
  expect(html).not.toContain('</img>')
  expect(html).toContain('&lt;v-click-gap size=')
})
