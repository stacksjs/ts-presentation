import { expect, test } from 'bun:test'
import { parseDeck, renderDeck } from '../../runtime/index.ts'
import { fenced } from '../../../test/code-fixture.ts'

test('retains C# punctuation, filename, range and syntax highlighting', async () => {
  const html = await renderDeck(parseDeck(fenced('c# [Program.cs] {1} {lines:true,startLine:1}', 'using System;')))
  expect(html).toContain('<figcaption>Program.cs</figcaption>')
  expect(html).toContain('data-code-ranges="1"')
  expect(html).toContain('language-c#')
  expect(html).toMatch(/class="tok-[^"]+">using</)
  expect(html).toContain('data-code-number="1"')
  expect(html).toContain('class="code-line-number" aria-hidden="true">1</span>')
})
