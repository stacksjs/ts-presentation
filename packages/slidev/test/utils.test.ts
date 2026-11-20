import { describe, expect, it } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseAspectRatio, parseRangeString } from '../../parser/src/index.ts'
import { plainMarkdown } from '../../parser/src/plain-markdown.ts'
import type { ResolvedFontOptions } from '../../types/src/config.ts'
import { generateCoollabsFontsUrl, generateGoogleFontsUrl } from '../node/runtime/fonts.ts'
import { findWorkspaceRoot, resolveDeckEntry } from '../node/runtime/extension-resolver.ts'
import { parseDeck, renderDeck } from '../node/runtime/index.ts'
import { createDeckCompiler } from '../node/runtime/loader.ts'
import { patchFrontmatter } from '../node/runtime/frontmatter-patch.ts'
import { applySlidePatch, loadEditingDeck } from '../node/mcp/operations.ts'

const fontOptions: ResolvedFontOptions = {
  webfonts: ['Fira Code', 'PT Serif'], weights: ['200', '400', '600'], provider: 'google',
  italic: false, sans: [], mono: [], serif: [], local: [],
}

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-utilities-')))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

describe('utilities', () => {
  it('accepts page range syntax', () => {
    expect(parseRangeString(5)).toEqual([1, 2, 3, 4, 5])
    expect(parseRangeString(5, 'all')).toEqual([1, 2, 3, 4, 5])
    expect(parseRangeString(2, '*')).toEqual([1, 2])
    expect(parseRangeString(5, '1')).toEqual([1])
    expect(parseRangeString(10, '1,2-3,5')).toEqual([1, 2, 3, 5])
    expect(parseRangeString(10, '1;2-3;5')).toEqual([1, 2, 3, 5])
    expect(parseRangeString(10, '6-')).toEqual([6, 7, 8, 9, 10])
  })

  it('accepts supported aspect ratio separators', () => {
    expect(parseAspectRatio(1)).toBe(1)
    expect(parseAspectRatio('16/9')).toBe(16 / 9)
    expect(parseAspectRatio('16 / 9 ')).toBe(16 / 9)
    expect(parseAspectRatio('3:4')).toBe(3 / 4)
    expect(parseAspectRatio('1x1')).toBe(1)
    expect(parseAspectRatio('1')).toBe(1)
    expect(() => parseAspectRatio('hello')).toThrow()
    expect(() => parseAspectRatio('1/0')).toThrow()
  })

  it('converts Markdown headings to text without dropping escaped tags or literal code', async () => {
    expect(plainMarkdown('<span style="color:red">Composable</span> Vue')).toBe('Composable Vue')
    expect(plainMarkdown('<b>Whatever</b>')).toBe('Whatever')
    expect(plainMarkdown('Talk about `<details/>`')).toBe('Talk about <details/>')
    expect(plainMarkdown('What is Readonly\\<T\\> in TypeScript')).toBe('What is Readonly<T> in TypeScript')
    expect(plainMarkdown('Welcome to<br />*Slidev*')).toBe('Welcome to Slidev')
    const deck = parseDeck('# **Introduction** to `<T>`')
    expect(deck.title).toBe('Introduction to <T>')
    const html = await renderDeck(deck)
    expect(html).toContain('<title>Introduction to &lt;T&gt;</title>')
    expect(html).toContain('aria-label="Introduction to &lt;T&gt;"')
  })

  it.each([
    ['Google', generateGoogleFontsUrl, 'https://fonts.googleapis.com/css2'],
    ['Coollabs', generateCoollabsFontsUrl, 'https://api.fonts.coollabs.io/css2'],
  ] as const)('builds %s CSS2 requests for normal and italic weights', (_, url, origin) => {
    expect(url(fontOptions)).toBe(`${origin}?family=Fira+Code:wght@200;400;600&family=PT+Serif:wght@200;400;600&display=swap`)
    expect(url({ ...fontOptions, italic: true })).toBe(`${origin}?family=Fira+Code:ital,wght@0,200;0,400;0,600;1,200;1,400;1,600&family=PT+Serif:ital,wght@0,200;0,400;0,600;1,200;1,400;1,600&display=swap`)
    expect(url({ ...fontOptions, webfonts: ['"Helvetica Neue"', "'PT Serif'"], weights: ['400'] }))
      .toBe(`${origin}?family=Helvetica+Neue:wght@400&family=PT+Serif:wght@400&display=swap`)
  })

  it('applies font settings to deck CSS and excludes local families from network font requests', async () => {
    const deck = parseDeck('---\nfonts:\n  provider: coollabs\n  sans: "PT Serif"\n  mono: "Fira Code"\n  local: ["PT Serif"]\n  weights: [700, 400]\n---\n\n# Fonts')
    const html = await renderDeck(deck)
    expect(html).toContain('https://api.fonts.coollabs.io/css2?family=Fira+Code:wght@400;700&amp;display=swap')
    expect(html).not.toContain('family=PT+Serif')
    expect(html).toContain('--presentation-font-sans:"PT Serif"')
    expect(html).toContain('--presentation-font-mono:"Fira Code"')
    const offline = await renderDeck(parseDeck('---\nfonts:\n  provider: none\n  sans: Georgia\n---\n\n# Local fonts'))
    expect(offline).toContain('--presentation-font-sans:"Georgia"')
    expect(offline).not.toContain('fonts.googleapis.com')
    expect(offline).not.toContain('fonts.coollabs.io')
  })

  it('resolves a deck entry, its project folder, and its declared workspace', () => project(async (root) => {
    const entry = join(root, 'packages/deck/slides.md')
    await Bun.write(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
    await Bun.write(entry, '# Deck')
    expect(await resolveDeckEntry(dirname(entry))).toBe(entry)
    expect(await findWorkspaceRoot(dirname(entry))).toBe(root)
    expect(await findWorkspaceRoot(join(root, 'standalone'))).toBe(join(root, 'standalone'))
  }))

  it('loads real setup modules across theme, addon, and deck roots in precedence order', () => project(async (root) => {
    const entry = join(root, 'deck/slides.md')
    const theme = join(root, 'theme')
    const addon = join(root, 'addon')
    await Bun.write(entry, '---\ntheme: ../theme\naddons: [../addon]\n---\n\n# Deck\n\n$\\T+\\A+\\P+\\common$')
    await Bun.write(join(theme, 'index.ts'), "export default { name: 'base-theme' }")
    await Bun.write(join(addon, 'index.ts'), "export default { name: 'math-addon' }")
    await Bun.write(join(theme, 'setup/katex.ts'), String.raw`export default () => ({ macros: { '\\T': 't', '\\common': 'x' } })`)
    await Bun.write(join(addon, 'setup/values.ts'), "export const token = 'a'")
    await Bun.write(join(addon, 'setup/katex.ts'), String.raw`import { token } from './values.ts'
export default () => ({ macros: { '\\A': token, '\\common': 'y' } })`)
    await Bun.write(join(root, 'deck/setup/katex.ts'), String.raw`export default () => ({ macros: { '\\P': 'p', '\\common': 'z' } })`)
    const compile = createDeckCompiler(entry)
    const identifiers = (html: string) => [...html.matchAll(/<mi>([a-z])<\/mi>/g)].map(match => match[1])
    expect(identifiers((await compile()).html)).toEqual(['t', 'a', 'p', 'z'])
    await Bun.write(join(addon, 'setup/values.ts'), "export const token = 'b'")
    expect(identifiers((await compile()).html)).toEqual(['t', 'b', 'p', 'z'])
  }))

  it('updates YAML neighbouring comments, deletion, and multiline values through the MCP editor', () => project(async (root) => {
    const dragPos = { foo: '1,2,3,4' }
    const raw = '# comment\ntitle: Hello  # another comment\ndragPos:\n  bar: 5,6,7,8'
    expect(Bun.YAML.parse(patchFrontmatter('', { dragPos }))).toEqual({ dragPos })
    expect(patchFrontmatter(raw, { dragPos })).toStartWith('# comment\ntitle: Hello  # another comment\n')
    expect(patchFrontmatter(raw, { title: null })).toBe('# comment\ndragPos:\n  bar: 5,6,7,8')
    const entry = join(root, 'slides.md')
    await Bun.write(entry, `---\n${raw}\n---\n\n# YAML`)
    await applySlidePatch(await loadEditingDeck(entry), 1, { frontmatter: { dragPos, title: 'Updated' } })
    const result = await Bun.file(entry).text()
    expect(result).toContain('# comment\ntitle: Updated # another comment')
    expect((await loadEditingDeck(entry)).headmatter.dragPos).toEqual(dragPos)
  }))
})
