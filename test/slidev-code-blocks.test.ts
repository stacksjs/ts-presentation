import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDeck, renderDeck } from '../src/index.ts'
import { createDeckCompiler } from '../src/loader.ts'
import { resolveSnippet } from '../src/snippets.ts'
import { saveSnippet } from '../src/snippet-write.ts'

const source = 'const before = 0\n// #region sample\n  function example() {\n    return 42\n  }\n// #endregion sample\n'
const tick = '```'
const fenced = (info: string, code: string) => [tick + info, code, tick].join('\n')

async function fixture<T>(test: (root: string, entry: string, file: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'presentation-code-'))
  try {
    await mkdir(join(root, 'snippets'))
    const file = join(root, 'snippets/fixture.ts')
    await Bun.write(file, source)
    return await test(root, join(root, 'slides.md'), file)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

// Adapted from Slidev's node/syntax/codeblock/wrapper.test.ts.
test('retains C# punctuation, filename, range and syntax highlighting', async () => {
  const html = await renderDeck(parseDeck(fenced('c# [Program.cs] {1} {lines:true,startLine:1}', 'using System;')))
  expect(html).toContain('<figcaption>Program.cs</figcaption>')
  expect(html).toContain('data-code-ranges="1"')
  expect(html).toContain('language-c#')
  expect(html).toMatch(/class="tok-[^"]+">using</)
  expect(html).toContain('data-code-number="1"')
  expect(html).toContain('class="code-line-number" aria-hidden="true">1</span>')
})

// Adapted from Slidev's node/syntax/snippet.test.ts. Test the actual loader
// used for dev, offline builds and exports.
test('imports VS Code regions inside lists and leaves fenced directives literal', () => fixture(async (root, entry, file) => {
  const markdown = '# Snippets\n\n- Example\n   <<< @/snippets/fixture.ts#sample\n\n' + fenced('', '<<< @/snippets/fixture.ts')
  await Bun.write(entry, markdown)
  const compile = createDeckCompiler(entry)
  const html = (await compile()).html
  expect(html).toMatch(/<li>Example\n<pre><code class="language-ts">/)
  expect(html).toContain('return')
  expect(html).not.toContain('before')
  expect(html).toContain('&lt;&lt;&lt; @/snippets/fixture.ts')
  expect((await resolveSnippet('<<< @/snippets/fixture.ts#sample', root, entry))?.file).toEndWith('/snippets/fixture.ts')
  await Bun.write(file, source.replace('42', '802'))
  expect((await compile()).html).toContain('802')
}))

test('resolves snippets relative to the included slide and rejects escapes', () => fixture(async (root, entry, file) => {
  const child = join(root, 'snippets/page.md')
  await Bun.write(child, '# Subdeck\n\n<<< ./fixture.ts#sample')
  await Bun.write(entry, '# Root\n\n---\nsrc: ./snippets/page.md\n---\n')
  expect((await createDeckCompiler(entry)()).html).toContain('language-ts')
  await expect(resolveSnippet('<<< ../outside.ts', root, entry)).rejects.toThrow(/escapes the project root/)
  const anotherRoot = await mkdtemp(join(tmpdir(), 'presentation-other-'))
  try {
    const other = join(anotherRoot, 'outside.ts')
    await Bun.write(other, 'const outside = true')
    const alias = join(root, 'snippets/escape.ts')
    await symlink(other, alias)
    await expect(resolveSnippet('<<< @/snippets/escape.ts', root, entry)).rejects.toThrow(/escapes the project root/)
    expect(await Bun.file(file).text()).toBe(source)
  }
  finally {
    await rm(anotherRoot, { recursive: true, force: true })
  }
}))

test('authorizes saving only for opted-in dev snippets and detects stale edits', () => fixture(async (_root, entry, file) => {
  await Bun.write(entry, '# Editable snippet\n\n<<< @/snippets/fixture.ts {monaco-write}')
  const offline = await createDeckCompiler(entry)()
  expect(offline.html).not.toContain('data-live-save')
  expect(offline.writableSnippets.size).toBe(0)
  const compile = createDeckCompiler(entry, { liveCompile: true })
  const online = await compile()
  const [token, target] = [...online.writableSnippets][0]
  expect(online.html).toContain('data-live-save')
  expect(online.html).toContain(`data-snippet-token="${token}"`)
  expect(online.html).not.toContain(target.path)
  const content = 'export const updated = 23'
  expect((await saveSnippet(online.writableSnippets, { token: 'unknown', revision: target.revision, source: content })).status).toBe(404)
  const saved = await saveSnippet(online.writableSnippets, { token, revision: target.revision, source: content })
  expect(saved.status).toBe(200)
  expect(await Bun.file(file).text()).toBe(content + '\n')
  expect((await saveSnippet(online.writableSnippets, { token, revision: target.revision, source: 'must not overwrite' })).status).toBe(409)
  const refreshed = await compile()
  expect(refreshed.writableSnippets.get(token)?.revision).toBe(await saved.text())
  expect(refreshed.html).toContain('export const updated = 23')
}))

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
