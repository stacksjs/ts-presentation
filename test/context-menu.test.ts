import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

const chrome = await findChrome()
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('honors context menu settings and keeps the menu out of exports', async () => {
  const cases = [
    ['', 'dev', true],
    ['contextMenu: false', 'dev', false],
    ['contextMenu: dev', 'build', false],
    ['contextMenu: build', 'build', true],
    ['config:\n  contextMenu: build', 'dev', false],
    ['contextMenu: true', 'export', false],
  ] as const
  for (const [frontmatter, mode, expected] of cases) {
    const source = frontmatter ? ['---', frontmatter, '---', '', '# Example'].join('\n') : '# Example'
    const html = await renderDeck(parseDeck(source), { mode })
    expect(html.includes('id="presentation-context-menu"')).toBe(expected)
  }
})

test.skipIf(!chrome)('builds browser context menu setups in extension order and runs menu actions by keyboard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-context-menu-'))
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    const entry = join(root, 'slides.md')
    await Promise.all([
      Bun.write(entry, [
        '---', 'theme: ./theme/index.ts', 'addons: [./addon/index.ts]', '---', '',
        '# First', '', '<input value="Native menu">', '', '<p v-click>Revealed</p>', '', '---', '', '# Second',
      ].join('\n')),
      Bun.write(join(root, 'theme/index.ts'), 'export default { name: "example-theme" }'),
      Bun.write(join(root, 'theme/setup/context-menu.ts'), 'export default items => [...items, { name: "theme-command", label: "Theme", action() {} }]'),
      Bun.write(join(root, 'addon/index.ts'), 'export default { name: "example-addon" }'),
      Bun.write(join(root, 'addon/setup/context-menu.ts'), 'export default items => { items.push({ name: "addon-command", label: "Addon", action() {} }) }'),
      Bun.write(join(root, 'setup/context-menu.ts'), [
        'import { defineContextMenuSetup } from "ts-presentation/types"',
        'export default defineContextMenuSetup((items, { navigation, isPresenter, target }) => [',
        '  ...items.filter(item => item === "separator" || item.name !== "fullscreen"),',
        '  { name: "jump", label: "Jump from " + target.id + " on " + navigation.currentPage,',
        '    icon: "→", small: true, disabled: isPresenter, action: () => navigation.go(2) },',
        '])',
      ].join('\n')),
    ])
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stdout: 'ignore', stderr: 'pipe', timeout: 20_000 })
    const [exit, error] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (exit) throw new Error(error)
    const output = await realpath(join(root, 'dist'))
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      const path = new URL(request.url).pathname
      return asset(output, path === '/' ? '/index.html' : path, request)
    } })
    view = new Bun.WebView({ width: 760, height: 550, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(server.url.href)
    const opened = await view.evaluate(`(() => {
      const stage = document.querySelector('#stage')
      const input = stage.querySelector('input')
      const menu = document.querySelector('#presentation-context-menu')
      const context = init => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 758, clientY: 548, ...init })
      const native = [input.dispatchEvent(context()), stage.dispatchEvent(context({ shiftKey: true })), menu.hidden]
      const stageMenu = stage.dispatchEvent(context())
      const box = menu.getBoundingClientRect()
      const inside = box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
      return [native, stageMenu, inside, document.activeElement.dataset.menuItem,
        menu.querySelector('[data-menu-item="previous-step"]').getAttribute('aria-disabled'),
        [...menu.querySelectorAll('button')].slice(-3).map(item => item.dataset.menuItem),
        menu.querySelector('[data-menu-item="jump"]').getAttribute('aria-label'),
        Boolean(menu.querySelector('[data-menu-item="fullscreen"]'))]
    })()`)
    expect(opened).toEqual([[true, true, true], false, true, 'previous-step', 'true',
      ['theme-command', 'addon-command', 'jump'], 'Jump from stage on 1', false])

    const key = async (key: string, modifiers = 0) => {
      await view!.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers })
      await view!.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers })
    }
    await key('Escape')
    expect(await view.evaluate(`[document.activeElement.id, document.querySelector('#presentation-context-menu').hidden]`)).toEqual(['stage', true])
    await key('F10', 8)
    expect(await view.evaluate(`document.querySelector('#presentation-context-menu').hidden`)).toBe(false)
    await key('ArrowDown')
    expect(await view.evaluate(`document.activeElement.dataset.menuItem`)).toBe('next-step')
    await key('Enter')
    expect(await view.evaluate(`[window.presentationNavigation.currentPage, window.presentationNavigation.clicks,
      document.querySelector('#presentation-context-menu').hidden]`)).toEqual([1, 1, true])
    await key('F10', 8)
    await key('End')
    await key('Enter')
    expect(await view.evaluate(`window.presentationNavigation.currentPage`)).toBe(2)

    await view.navigate(new URL('?presenter=1#slide-1', server.url).href)
    const presenter = await view.evaluate(`(() => {
      document.querySelector('#stage').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      return [document.querySelector('[data-menu-item="presenter"]').textContent,
        document.querySelector('[data-menu-item="jump"]').getAttribute('aria-disabled')]
    })()`)
    expect(presenter).toEqual(['Exit presenter view', 'true'])
  }
  finally {
    view?.close()
    await server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 35_000)
