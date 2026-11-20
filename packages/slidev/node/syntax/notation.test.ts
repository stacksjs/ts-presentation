import { expect, it } from 'bun:test'
import { fenced } from '../../test/code-fixture.ts'
import { unescapeHtml } from '../runtime/html.ts'
import {
  parseDeck,
  renderDeck,
  transformerCompactLineOptions,
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationMap,
  transformerNotationWordHighlight,
  transformerRemoveNotationEscape,
} from '../runtime/index.ts'
import type { CodeHighlightTransformer } from '../runtime/index.ts'

function render(code: string, info: string, transformers: CodeHighlightTransformer[]): Promise<string> {
  return renderDeck(parseDeck(`# Code annotations\n\n${fenced(info, code)}`), { setup: { codeHighlight: { transformers } } })
}

function codeMarkup(html: string): string {
  return /<pre class="slidev-code[^"]*"[^>]*>[\s\S]+?<\/pre>/.exec(html)?.[0] ?? ''
}

function plainText(markup: string): string {
  return unescapeHtml(markup.replace(/<[^>]*>/g, ''))
}

it('combines diff, focus, highlights and alerts without moving reveal and gutter positions', async () => {
  const source = [
    '// [!code focus:2]',
    'const before = "// [!code focus]" // [!code --]',
    'const after = "changed value" // Keep rationale [!code ++] [!code hl]',
    '// [!code word:value:2]',
    'console.error("changed value") // [!code error]',
    'console.warn("value") // [!code warning]',
    'console.log("value") // [!code info]',
    String.raw`// [\!code focus]`,
  ].join('\n')
  const html = await render(source, 'ts [Example] {5|6}{lines:true,startLine:5}', [
    transformerRemoveNotationEscape(),
    transformerNotationFocus(),
    transformerNotationDiff(),
    transformerNotationHighlight(),
    transformerNotationErrorLevel(),
    transformerNotationWordHighlight(),
  ])
  const code = codeMarkup(html)
  expect(code).toContain('class="slidev-code has-focused has-diff has-highlighted"')
  expect(code).toContain('class="line code-line focused diff remove" data-code-line="true" data-code-number="5"')
  expect(code).toContain('class="line code-line focused diff add highlighted" data-code-line="true" data-code-number="6"')
  expect(code).toContain('class="line code-line highlighted error" data-code-line="true" data-code-number="7"')
  expect(code).toContain('class="line code-line highlighted warning" data-code-line="true" data-code-number="8"')
  expect(code).toContain('class="line code-line highlighted info" data-code-line="true" data-code-number="9"')
  expect(code).toContain('data-code-number="10"')
  expect(code.match(/<span class="highlighted-word">value<\/span>/g)).toHaveLength(2)
  expect(html).toContain('data-code-ranges="5|6"')
  expect(plainText(code)).toBe([
    '5const before = "// [!code focus]"',
    '6const after = "changed value" // Keep rationale',
    '7console.error("changed value")',
    '8console.warn("value")',
    '9console.log("value")',
    '10// [!code focus]',
  ].join('\n'))
})

it('honors legacy counting and custom classes while preserving unknown and non-comment directives', async () => {
  const source = [
    '// [!code mark:2]',
    'let a = 1',
    'let b = "[!code mark]"',
    '/* [!code mark] */ let c = 3',
    '// [!code unrecognized]',
  ].join('\n')
  const settings = { classMap: { mark: ['hot', 'hot-again'] }, classActivePre: 'has-hot', classActiveCode: 'coded' }
  const modern = codeMarkup(await render(source, 'ts', [transformerNotationMap(settings)]))
  const legacy = codeMarkup(await render(source, 'ts', [transformerNotationMap({ ...settings, matchAlgorithm: 'v1' })]))
  expect(modern).toContain('<pre class="slidev-code has-hot"><code class="language-ts coded">')
  expect(modern.match(/class="line hot hot-again"/g)).toHaveLength(2)
  expect(legacy.match(/class="line hot hot-again"/g)).toHaveLength(2)
  expect(plainText(modern)).toContain('/* [!code mark] */ let c = 3')
  expect(plainText(legacy)).toContain('let c = 3')
  expect(plainText(legacy)).not.toContain('/* [!code mark] */')
  for (const snippet of [modern, legacy]) {
    expect(plainText(snippet)).toContain('let b = "[!code mark]"')
    expect(plainText(snippet)).toContain('// [!code unrecognized]')
    expect(plainText(snippet)).not.toContain('[!code mark:2]')
  }
})

it('removes HTML and JSX comment syntax and leaves unannotated Python and SQL text intact', async () => {
  const samples = [
    ['html', '<!-- [!code focus] -->\n<p>Hello</p>', '<p>Hello</p>'],
    ['tsx', '<div>\n  {/* [!code focus] */}\n  <p>JSX</p>\n</div>', '<div>\n  <p>JSX</p>\n</div>'],
    ['py', 'print("# [!code focus]") # [!code focus]', 'print("# [!code focus]")'],
    ['sql', "SELECT 'code' -- [!code focus]", "SELECT 'code'"],
  ]
  for (const [language, source, expected] of samples) {
    const code = codeMarkup(await render(source, language, [transformerNotationFocus()]))
    expect(code).toContain('class="line focused"')
    expect(plainText(code).trimEnd()).toBe(expected)
  }
})

it('highlights words spanning tokens and combines fence metadata with numbered lines', async () => {
  const source = [
    'const size = score.length',
    String.raw`const path = "a/b" // [!code word:a\/b]`,
    'const tail = score.length',
  ].join('\n')
  const html = await render(source, String.raw`ts [src/example.ts] {2}{lines:true} /score.length/ /a\/b/`, [
    transformerMetaHighlight(),
    transformerMetaWordHighlight({ className: 'metadata-word' }),
    transformerNotationWordHighlight(),
    transformerCompactLineOptions([{ line: 3, classes: ['last-line'] }]),
  ])
  const code = codeMarkup(html)
  expect(html).toContain('<figcaption>src/example.ts</figcaption>')
  expect(html).toContain('data-code-ranges="2"')
  expect(code).toContain('class="line code-line highlighted" data-code-line="true" data-code-number="2"')
  expect(code).toContain('class="line code-line last-line" data-code-line="true" data-code-number="3"')
  expect(code.match(/class="metadata-word">score<\/span>/g)).toHaveLength(2)
  expect(code.match(/class="metadata-word">\.<\/span>/g)).toHaveLength(2)
  expect(code).toContain('<span class="highlighted-word">a/b</span>')
  expect(plainText(code)).toBe('1const size = score.length\n2const path = "a/b"\n3const tail = score.length')
})
