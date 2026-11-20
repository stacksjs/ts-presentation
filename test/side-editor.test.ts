// Adapted from Slidev's side-editor and title-renderer HMR fixtures (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { readSlideSource, saveSlideSource } from '../packages/slidev/node/runtime/side-editor-source.ts'

test('writes edited frontmatter, body, and notes to an included slide while preserving other source bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tp-side-include-'))
  try {
    const entry = join(root, 'slides.md')
    const chapter = join(root, 'chapter.md')
    const deckSource = '# Start\n\n---\nsrc: ./chapter.md#2\n---\n'
    const untouched = '\uFEFF# Unselected\r\n\r\nLeave exactly as is.\r\n\r\n'
    const selected = '---\r\nlayout: center\r\n\r\n---\r\n\r\n# Second\r\n\r\n<!--\r\nOriginal notes.\r\n-->'
    await writeFile(entry, deckSource)
    await writeFile(chapter, untouched + selected)
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const deck = await compile()
    const token = deck.live!.slides[1].sourceToken!
    const current = readSlideSource(deck.writableSlides.get(token)!)
    expect(current.path).toBe('chapter.md')
    expect(current.source).toBe(selected.replace(/\r\n/g, '\n'))
    const bad = await saveSlideSource(deck.writableSlides, { ...current, source: '---\nlayout: [\n---\n# Bad' })
    expect(bad.status).toBe(422)
    expect(await readFile(chapter, 'utf8')).toBe(untouched + selected)
    const modified = current.source.replace('layout: center', 'layout: default').replace('# Second', '# Reviewed').replace('Original notes.', 'Updated notes.')
    const saved = await saveSlideSource(deck.writableSlides, { ...current, source: modified })
    expect(saved.status).toBe(200)
    expect(await readFile(entry, 'utf8')).toBe(deckSource)
    expect(await readFile(chapter, 'utf8')).toBe(untouched + modified.replace(/\n/g, '\r\n'))
    const updated = await compile()
    expect(updated.live?.slides[1].route.title).toBe('Reviewed')
    expect(updated.live?.slides[1].notes).toContain('Updated notes.')
    expect((await saveSlideSource(updated.writableSlides, { ...current, source: modified })).status).toBe(409)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
