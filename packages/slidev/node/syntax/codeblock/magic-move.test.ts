import { expect, test } from 'bun:test'
import { createDeckCompiler } from '../../runtime/loader.ts'
import { parseDeck, renderDeck } from '../../runtime/index.ts'
import { fenced, fixture, source } from '../../../test/code-fixture.ts'

// Adapted from Slidev's node/syntax/codeblock/magic-move.test.ts.
test('resolves region snippets before validating Magic Move frame fences', () => fixture(async (_root, entry, file) => {
  const markdown = ['# Motion', '', '````md magic-move', '<<< @/snippets/fixture.ts#sample ts', '<<< @/snippets/fixture.ts ts {1}', '````'].join('\n')
  await Bun.write(entry, markdown)
  const compile = createDeckCompiler(entry)
  const html = (await compile()).html
  expect(html).toContain('data-code-motion="true"')
  expect(html.match(/class="language-ts"/g)).toHaveLength(2)
  expect(html).toMatch(/<figure hidden class="code-frame" data-code-ranges="1"/)
  await Bun.write(file, source.replace('42', '859'))
  expect((await compile()).html).toContain('859')
}))

test('retains C# and C++ language identifiers in animation frames', async () => {
  const html = await renderDeck(parseDeck(['# Motion', '', '````md magic-move', fenced('c#', 'var a = 1;'), 'Comment between frames', fenced('c++', 'int a = 1;'), '````'].join('\n')))
  expect(html).toContain('language-c#')
  expect(html).toContain('language-c++')
  expect(html).toContain('data-code-motion="true"')
  expect(html).not.toContain('Comment between frames')
})
