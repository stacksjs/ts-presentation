import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ShortcutsSetup } from '../packages/types/src/shortcuts.ts'
import { createDeckCompiler } from '../src/index.ts'

test('bundles theme, addon and deck shortcut setups and watches their browser imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'presentation-shortcuts-'))
  try {
    const slides = join(directory, 'slides.md')
    const theme = join(directory, 'theme')
    const addon = join(directory, 'addon')
    const setup = join(directory, 'setup/shortcuts.ts')
    const bindings = join(directory, 'setup/bindings.ts')
    await Promise.all([
      Bun.write(slides, '---\ntheme: ./theme/index.ts\naddons: [./addon/index.ts]\n---\n\n# Example\n'),
      Bun.write(join(theme, 'index.ts'), 'export default { name: "test-theme" }'),
      Bun.write(join(theme, 'setup/shortcuts.ts'), `
import { defineShortcutsSetup } from '@slidev/types'
export default defineShortcutsSetup((nav, base) => [...base, { name: 'theme', key: 't', fn: nav.goFirst }])
`),
      Bun.write(join(addon, 'index.ts'), 'export default { name: "test-addon" }'),
      Bun.write(join(addon, 'setup/shortcuts.ts'), `
import { defineShortcutsSetup } from 'ts-presentation/types'
export default defineShortcutsSetup((nav, base) => [...base, { name: 'addon', key: 'a', fn: nav.goLast }])
`),
    ])
    const compile = createDeckCompiler(slides, { liveCompile: true })
    const initial = await compile()
    const shortcuts = (client: string) => {
      const browser = { presentationShortcutSetups: [] as ShortcutsSetup[] }
      new Function('window', client)(browser)
      return browser.presentationShortcutSetups
    }
    expect(shortcuts(initial.client)).toHaveLength(2)

    await Bun.write(setup, `
import { defineShortcutsSetup } from 'ts-presentation'
import { key } from './bindings'
export default defineShortcutsSetup((nav, base) => [
  ...base.map(shortcut => shortcut.name === 'theme' ? { ...shortcut, key } : shortcut),
  { name: 'deck', key: 'd', fn: nav.next },
])
`)
    await Bun.write(bindings, 'export const key = "Ctrl+r"')
    const first = await compile()
    expect(first.live?.frame).not.toBe(initial.live?.frame)
    expect(first.html).toContain('src="./extensions.js"')
    const nav = { next() {}, prev() {}, nextSlide() {}, prevSlide() {}, go() {}, goFirst() {}, goLast() {}, toggleDark() {}, toggleOverview() {}, toggleDrawing() {}, escapeOverview() {}, showGotoDialog() {} }
    function keys(client: string): (string | readonly string[])[] {
      return shortcuts(client).reduce<ReturnType<ShortcutsSetup>>((base, setup) => setup(nav, base), []).map(shortcut => shortcut.key)
    }
    expect(keys(first.client)).toEqual(['Ctrl+r', 'a', 'd'])

    await Bun.write(bindings, 'export const key = "Shift+g"')
    const changed = await compile()
    expect(changed.live?.frame).not.toBe(first.live?.frame)
    expect(keys(changed.client)).toEqual(['Shift+g', 'a', 'd'])
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
