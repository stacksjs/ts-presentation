import { describe, expect, it } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from './runtime/loader.ts'

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-options-')))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

describe('bootstrap deck options', () => {
  it('locks extension selection while letting the selected preparsers update the deck', () => project(async (root) => {
    const entry = join(root, 'deck/slides.md')
    const themeRoot = join(root, 'theme')
    const addonRoot = join(root, 'addon')
    await Bun.write(entry, [
      '---', 'theme: ../theme', 'title: Before', 'canvasWidth: 960', '---',
      '', '# Before', '', 'HOOKS', '', '---', 'src: ../addon/shared.md', '---',
    ].join('\n'))
    await Bun.write(join(themeRoot, 'index.ts'), "export default { name: 'bootstrap', defaults: { addons: ['../addon'] } }")
    await Bun.write(join(themeRoot, 'setup/preparser.ts'), "export default () => [{ transformSlide(content) { return content.replace('HOOKS', 'HOOKS Theme') } }]")
    await Bun.write(join(addonRoot, 'index.ts'), "export default { name: 'selected-addon', globalBottom: '<div id=\"selected-addon\"></div>' }")
    await Bun.write(join(addonRoot, 'setup/preparser.ts'), [
      'export default ({ mode }) => [{',
      '  transformRawLines(lines) {',
      "    if (lines.includes('title: Before')) {",
      "      lines[lines.indexOf('theme: ../theme')] = 'theme: missing-theme'",
      "      lines[lines.indexOf('title: Before')] = 'title: After'",
      "      lines[lines.indexOf('canvasWidth: 960')] = 'canvasWidth: 840'",
      "      lines.splice(4, 0, 'addons: [missing-addon]')",
      '    }',
      '  },',
      "  transformSlide(content) { return content.replace('HOOKS Theme', 'HOOKS Theme Addon ' + mode) },",
      '}]',
    ].join('\n'))
    await Bun.write(join(addonRoot, 'shared.md'), '# Packaged chapter')
    await Bun.write(join(root, 'deck/setup/preparser.ts'), "export default () => [{ transformSlide(content) { return content.replace('HOOKS', 'HOOKS Local') } }]")

    const deck = await createDeckCompiler(entry, { mode: 'dev', liveCompile: true })()
    expect(deck.title).toBe('After')
    expect(deck.canvas.width).toBe(840)
    expect(deck.headmatter).toMatchObject({ theme: '../theme', addons: ['../addon'], title: 'After' })
    expect(deck.html).toContain('data-theme="bootstrap"')
    expect(deck.html).toContain('HOOKS Local Theme Addon dev')
    expect(deck.html).toContain('id="selected-addon"')
    expect(deck.html).toContain('<h1>Packaged chapter</h1>')
    expect(deck.writableSlides.size).toBe(0)
  }))

  it('uses a theme override and supports theme-less decks', () => project(async (root) => {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, '---\ntheme: missing-theme\n---\n\n# Override')
    expect((await createDeckCompiler(entry, { theme: 'paper' })()).html).toContain('data-theme="paper"')
    await Bun.write(entry, '---\nconfig:\n  theme: null\n---\n\n# Theme-less')
    expect((await createDeckCompiler(entry)()).html).toContain('data-theme="none"')
  }))

  it('allows declared workspace chapters and leaves their files read-only in the deck editor', () => project(async (root) => {
    const entry = join(root, 'packages/show/slides.md')
    await Bun.write(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
    await Bun.write(entry, '# Presentation\n\n---\nsrc: ../shared/chapter.md\n---\n')
    const chapter = join(root, 'packages/shared/chapter.md')
    await Bun.write(chapter, '# Shared chapter\n\n<<< ./sample.ts {monaco-write}')
    await Bun.write(join(root, 'packages/shared/sample.ts'), 'export const shared = 1')

    const deck = await createDeckCompiler(entry, { liveCompile: true })()
    expect(deck.html).toContain('<h1>Shared chapter</h1>')
    expect(deck.html).toContain('export const shared = 1')
    expect(deck.writableSlides.size).toBe(1)
    expect(deck.writableSnippets.size).toBe(0)
  }))
})
