import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'
import { splitSlots } from '../packages/slidev/node/runtime/syntax.ts'

test('isolates math and live fences from inline and fenced code', async () => {
  const source = [
    '# Equations', '', 'Pay $5 or $10. Compare $x^2$ with `$x^2$`.', '',
    '$$', '\\frac{1}{2} + \\sqrt{x}', '$$', '',
    '```txt', '$untouched$', '```', '',
    '```ts {monaco-run}', 'const answer: number = 42', 'console.log(answer)', '```',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/<math /g)).toHaveLength(2)
  expect(html).toContain('<mfrac>')
  expect(html).toContain('<msqrt>')
  expect(html).toContain('Pay $5 or $10.')
  expect(html).toContain('<code>$x^2$</code>')
  expect(html).toContain('untouched$')
  expect(html).toContain('data-live-run')
  expect(html).toMatch(/<template data-live-program>[^<]*answer = 42/)
})

test('keeps literal slot markers in code and joins repeated slots', () => {
  const slots = splitSlots('Left\n```text\n::right::\n```\n::right::\nFirst\n::right::\nSecond')
  expect(slots.default).toContain('```text\n::right::\n```')
  expect(slots.right).toBe('First\n\nSecond')
})

test('compiles a local theme and refreshes changed addon styles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ts-presentation-test-'))
  try {
    const entry = join(directory, 'slides.md')
    const styles = join(directory, 'addon.css')
    await Promise.all([
      Bun.write(entry, '---\ntheme: ./theme.ts\naddons: ./addon.ts\n---\n\n# Left\n\n::right::\n\nRight'),
      Bun.write(join(directory, 'theme.ts'), 'export default { name: "test-theme", defaults: { layout: "compare" }, layouts: { compare: ({ slots }) => `<aside>${slots.right}</aside>` } }'),
      Bun.write(join(directory, 'addon.ts'), 'export default { name: "test-addon", styleFile: "./addon.css", globalBottom: "<footer>Plugin loaded</footer>" }'),
      Bun.write(styles, 'aside { color: red }'),
    ])
    const compile = createDeckCompiler(entry)
    const [first, concurrent] = await Promise.all([compile(), compile()])
    expect(first).toBe(concurrent)
    expect(first.html).toContain('data-theme="test-theme"')
    expect(first.html).toMatch(/<aside><p>Right<\/p>\s*<\/aside>/)
    expect(first.html).toContain('<footer>Plugin loaded</footer>')
    expect(first.styles).toContain('color: red')
    await Bun.write(styles, 'aside { color: green }')
    expect((await compile()).styles).toContain('color: green')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
