import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckRenderer } from '../src/loader.ts'

test('resolves an include range, hides disabled slides and invalidates cached output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deck-loader-'))
  const entry = join(directory, 'slides.md')
  const chapter = join(directory, 'chapter.md')
  await Bun.write(entry, '# Cover\n\n---\nsrc: ./chapter.md#2-3\n---')
  await Bun.write(chapter, '# Skip first\n\n---\n\n# Included\n\n---\nhide: true\n---\n\n# Hidden')
  const render = createDeckRenderer(entry)
  const [first, concurrent] = await Promise.all([render(), render()])
  expect(first).toContain('Included')
  expect(first).not.toContain('Skip first')
  expect(first).not.toContain('Hidden')
  expect(concurrent).toBe(first)

  await Bun.write(chapter, '# Skip first\n\n---\n\n# Replaced content\n\n---\nhide: true\n---\n\n# Hidden')
  expect(await render()).toContain('Replaced content')
})

test('fails on a circular include', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deck-loader-'))
  const entry = join(directory, 'slides.md')
  await Bun.write(entry, '---\nsrc: ./slides.md\n---')
  await expect(createDeckRenderer(entry)()).rejects.toThrow('Circular slide source')
})
