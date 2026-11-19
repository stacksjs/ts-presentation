import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../node/runtime/loader.ts'
import { readSlideSource } from '../node/runtime/side-editor-source.ts'

test.each([
  ['frontmatter only', '---\nlayout: image\nimage: /example.png\n---'],
  ['frontmatter and body', '---\nlayout: center\n---\n\n# Hello'],
])('opens a slide with %s in the editor', async (_, source) => {
  const root = await mkdtemp(join(tmpdir(), 'tp-side-source-'))
  try {
    const entry = join(root, 'slides.md')
    await writeFile(entry, source)
    const deck = await createDeckCompiler(entry, { liveCompile: true })()
    const token = deck.live!.slides[0].sourceToken!
    expect(readSlideSource(deck.writableSlides.get(token)!)).toMatchObject({ path: 'slides.md', source })
    const build = await createDeckCompiler(entry)()
    expect(build.live).toBeUndefined()
    expect(build.writableSlides.size).toBe(0)
    expect(build.html).not.toContain('id="side-editor"')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
