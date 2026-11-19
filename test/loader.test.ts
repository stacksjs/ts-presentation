import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckRenderer } from '../packages/slidev/node/runtime/loader.ts'

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

test('selects authored slides before expanding nested includes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deck-nested-range-'))
  try {
    const entry = join(directory, 'slides.md')
    await Bun.write(entry, '# Cover\n\n---\nsrc: /nested.md#2,1\n---')
    await Bun.write(join(directory, 'nested.md'), '---\nsrc: ./chapter.md\n---\n\n---\n\n# Selected\n\n---\nsrc: ./missing.md\n---')
    await Bun.write(join(directory, 'chapter.md'), '# Nested first\n\n---\n\n# Nested second')
    const html = await createDeckRenderer(entry)()
    const titles = [...html.matchAll(/<article[^>]*aria-label="([^"]+)"/g)].map(match => match[1])
    expect(titles).toEqual(['Cover', 'Selected', 'Nested first', 'Nested second'])
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

test('loads, updates, and removes the entry preparser for a running compiler', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deck-preparser-'))
  try {
    const entry = join(directory, 'slides.md')
    const setup = join(directory, 'setup/preparser.ts')
    await Bun.write(entry, '\uFEFF---\nauthor: Example\n---\n\n# @heading\n\n---\nsrc: ./chapter.md\n---')
    await Bun.write(join(directory, 'chapter.md'), '# @heading included\n\n<!-- draft -->')
    const render = createDeckRenderer(entry, { mode: 'export' })
    expect(await render()).toContain('aria-label="@heading"')

    async function configure(label: string): Promise<void> {
      await Bun.write(setup, `export default async ({ filepath, headmatter, mode }) => {
        if (!filepath.endsWith('/slides.md') || headmatter.author !== 'Example') throw Error('Incorrect setup input')
        return [{
          async transformRawLines(lines) {
            for (const [index, line] of lines.entries()) lines[index] = line.replace('@heading', ${JSON.stringify(label)})
          },
          transformNote(note) { if (note) return mode + ': ' + note },
        }]
      }`)
    }
    await configure('Prepared')
    const first = await render()
    expect(first).toContain('aria-label="Prepared"')
    expect(first).toContain('aria-label="Prepared included"')
    expect(first).toContain('export: draft')

    await configure('Revised preparser')
    expect(await render()).toContain('aria-label="Revised preparser included"')
    await rm(setup)
    expect(await render()).toContain('aria-label="@heading"')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
