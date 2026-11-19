// Adapted from Slidev's VDrag Markdown cases (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveDrag } from '../runtime/drag-source.ts'
import { parseDeck, renderDeck } from '../runtime/index.ts'
import { createDeckCompiler } from '../runtime/loader.ts'

test.each([
  ['component', '<v-drag>Content</v-drag>'],
  ['directive', '<div v-drag>Content</div>'],
])('renders a draggable %s without authored coordinates', async (_, source) => {
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('data-presentation-drag="box"')
  expect(html).toContain('>Content</')
  expect(html).toContain('position:absolute;')
  expect(html).not.toContain('data-drag-token')
})

test('renders slide-local named positions, rotation, and signed two-way arrows', async () => {
  const source = [
    '---', 'dragPos:', '  card: 65, 110, 190, _, -12', '---', '', '# Position data', '',
    '<v-drag pos="card" style="background:beige">Note</v-drag>',
    '<v-drag-arrow pos="420, 230, -100, -64" color="#357" width="5" two-way aria-label="Review direction" />',
    '<Link to="2" title="Continue" v-drag="[720, 160, 95, 30]" />',
    '', '---', 'dragPos:', '  card: [5, 110, 190, 60]', '---', '', '# Another slide',
    '', `<span v-drag="'card'">Second note</span>`,
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('data-drag-position="[65,110,190,null,-12]"')
  expect(html).toContain('background:beige;position:absolute;left:65px;top:110px;width:190px;height:auto;rotate:-12deg')
  expect(html).toContain('data-drag-position="[5,110,190,60,0]"')
  expect(html).toContain('left:300px;top:146px;width:140px;height:104px')
  expect(html).toContain('data-drag-line x1="120" y1="84" x2="20" y2="20"')
  expect(html).toContain('marker-start="url(#drag-arrow-1-1)"')
  expect(html).toContain('aria-label="Review direction"')
  expect(html).toMatch(/<a [^>]*data-slide-link="2"[^>]*data-drag-position="\[720,160,95,30,0\]"[^>]*>Continue<\/a>/)
})

test('saves the last multiline directive at EOF, preserving a BOM, CRLF, notes, and included Markdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tp-drag-source-'))
  try {
    const entry = join(root, 'slides.md')
    const leaf = join(root, 'layout.md')
    const included = '# Test\n\n---\nsrc: ./layout.md\n---\n'
    const source = [
      '\uFEFF---', 'dragPos:', '  start: "40, 70, 180, _" # anchor', '---', '',
      '# Included', '', '<v-drag pos="start">Active card</v-drag>', '',
      '<!-- Keep the speaker note. -->', '', '---', '', '# Last', '',
      '<div', '  v-drag="[284, 248, 166, NaN]"', '>', '  V-drag element', '</div>',
    ].join('\r\n')
    await writeFile(entry, included)
    await writeFile(leaf, source)
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const first = await compile()
    expect(first.writableDrags.size).toBe(2)
    const [[name, named], [tag, inline]] = [...first.writableDrags.entries()]
    const saved = await saveDrag(first.writableDrags, { token: tag, revision: inline.revision, position: [301, 220, 184, null, 15] })
    expect(saved.ok).toBe(true)
    const revised = source.replace('[284, 248, 166, NaN]', '[301, 220, 184, NaN, 15]')
    expect(await readFile(leaf, 'utf8')).toBe(revised)
    expect(await readFile(entry, 'utf8')).toBe(included)
    const second = await compile()
    expect(second.html).toContain('data-drag-position="[301,220,184,null,15]"')
    expect(second.writableDrags.get(name)?.revision).toBe(await saved.text())
    expect((await saveDrag(second.writableDrags, { token: name, revision: named.revision, position: [2, 92, 75, 30, 0] })).status).toBe(409)
    expect((await saveDrag(second.writableDrags, { token: name, revision: second.writableDrags.get(name)?.revision, position: [2, 92, 75, 30, 0] })).ok).toBe(true)
    expect(await readFile(leaf, 'utf8')).toBe(revised.replace('"40, 70, 180, _" # anchor', "'2, 92, 75, 30' # anchor"))
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
