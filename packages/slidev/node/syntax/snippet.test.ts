import { expect, test } from 'bun:test'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../runtime/loader.ts'
import { resolveSnippet } from '../runtime/snippets.ts'
import { saveSnippet } from '../runtime/snippet-write.ts'
import { fenced, fixture, source } from '../../test/code-fixture.ts'

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
