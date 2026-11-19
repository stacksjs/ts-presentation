import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../node/runtime/loader.ts'

describe('diagram renderer setup', () => {
  it('discovers a new setup, combines its options, and reloads changed local imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-diagram-setup-'))
    try {
      const entry = join(root, 'slides.md')
      const directory = join(root, 'setup')
      const renderer = join(directory, 'mermaid-renderer.ts')
      const label = join(directory, 'label.ts')
      await Bun.write(entry, ['# Diagrams', '', '$\\x$', '', '```mermaid {theme:"forest"}', 'flowchart TD', '  A --> B', '```'].join('\n'))

      const compile = createDeckCompiler(entry, { liveCompile: true })
      const initial = await compile()
      expect(initial.html).toContain('data-diagram-theme="forest"')
      expect(await compile()).toBe(initial)
      await mkdir(directory)
      await Bun.write(join(directory, 'mermaid.ts'), "export default () => ({ theme: 'dark', author: 'Deck settings' })")
      await Bun.write(renderer, [
        "import { title } from './label.ts'",
        "export default () => (source, options) => '<svg viewBox=\"0 0 100 40\"><text>' + title + ': ' + options.author + ' / ' + options.theme + '</text></svg>'",
      ].join('\n'))
      await Bun.write(join(directory, 'katex.ts'), [
        "import { symbol } from './label.ts'",
        "export default () => ({ macros: { '\\\\x': symbol } })",
      ].join('\n'))
      await Bun.write(label, "export const title = 'Custom renderer'; export const symbol = 'a'")
      expect((await compile()).html).toContain('Custom renderer: Deck settings / forest')

      await Bun.write(label, "export const title = 'Reloaded renderer'; export const symbol = 'z'")
      const updated = await compile()
      expect(updated.html).toContain('Reloaded renderer: Deck settings / forest')
      expect(updated.html).toContain('<mi>z</mi>')
      expect(updated.live?.slides[0].revision).not.toBe(initial.live?.slides[0].revision)

      await rm(renderer)
      const restored = await compile()
      expect(restored.html).not.toContain('Reloaded renderer')
      expect(restored.html).toContain('data-diagram-theme="forest"')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
