// Adapted from Slidev v53.1.0's code block and inline code escape cases (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../src/chrome.ts'
import { parseDeck, renderDeck } from '../src/index.ts'
import { createDeckRenderer } from '../src/loader.ts'

const serverCode = [
  'const label = "<tag> & value"',
  '',
  'const one = 1',
  'const two = 2',
  'const three = 3',
  'const four = 4',
  'const five = 5',
  'const result = one + two + three + four + five',
].join('\n')
const fixture = [
  '---', 'comark: true', '---', '', '# Choose an example', '',
  '::code-group', '',
  '```ts [Server ~i-example:server~] {1|8}{lines:true,maxHeight:"4em"}',
  serverCode, '```', '',
  '```js [Client] {1|3|5}{lines:true}',
  'const first = 1', '', 'const third = 3', '', 'const fifth = 5', '```', '',
  '```ts [Runnable] {monaco-run}',
  'console.log("initial")', '```', '',
  '::', '',
  '<p v-click id="after">After the examples</p>', '',
  '---', 'codeCopy: false', 'magicMoveCopy: false', '---', '', '# No copy controls', '',
  '```js', 'const rate = 4', '```',
  '````md magic-move', '```js', 'const first = 1', '```',
  '```js', 'const second = 2', '```', '````',
].join('\n')

test('compiles code group labels, independently configured fences, and titled live edits', async () => {
  const html = await renderDeck(parseDeck(fixture))
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html).toContain('aria-selected="true" tabindex="0">Server</button>')
  expect(html).toContain('aria-selected="false" tabindex="-1">Client</button>')
  expect(html).toContain('aria-labelledby="code-group-1-tab-1" tabindex="0" hidden')
  expect(html).not.toContain('i-example:server')
  expect(html).toContain('data-code-ranges="1|8"')
  expect(html).toContain('data-code-ranges="1|3|5"')
  expect(html).toContain('style="max-height:4em"')
  expect(html).toContain('data-live-run')
  expect(html).toContain('data-code-copy-disabled data-magic-copy-disabled')
})

test('supports the CodeGroup component and preserves disabled or fenced syntax', async () => {
  const examples = ['```bash', 'echo plain', '```']
  const component = await renderDeck(parseDeck(['<CodeGroup>', '', ...examples, '', '</CodeGroup>'].join('\n')))
  expect(component).toContain('>Bash</button>')
  expect(component).not.toContain('<CodeGroup>')
  const disabled = await renderDeck(parseDeck(['::code-group', '', ...examples, '', '::'].join('\n')))
  expect(disabled).toContain('::code-group')
  expect(disabled).not.toContain('role="tablist"')
  const literal = await renderDeck(parseDeck([
    '---', 'comark: true', '---', '', '# Authored example', '',
    '````markdown', '::code-group', ...examples, '::', '````', '',
    'This is `inline {{code}}` test',
  ].join('\n')))
  expect(literal).not.toContain('role="tablist"')
  expect(literal).toContain('<code>inline {{code}}</code>')
})

test('leaves malformed code groups in the authored Markdown', async () => {
  const html = await renderDeck(parseDeck([
    '---', 'comark: true', '---', '', '# Examples', '',
    '::code-group', '', 'This is ordinary prose.', '', '```js [Example]', 'const x = 1', '```', '', '::',
  ].join('\n')))
  expect(html).toContain('<p>::code-group</p>')
  expect(html).toContain('<p>This is ordinary prose.</p>')
  expect(html).not.toContain('role="tablist"')
})

test('expands local snippet imports before building tab panels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-code-group-snippet-'))
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, '---\ncomark: true\n---\n\n# Local code\n\n::code-group\n\n<<< ./sample.ts [Local snippet] {1|all}\n\n::')
    await Bun.write(join(root, 'sample.ts'), 'const localSource = true\n')
    const html = await createDeckRenderer(entry)()
    expect(html).toContain('>Local snippet</button>')
    expect(html).toContain('localSource')
    expect(html).toContain('data-code-ranges="1|all"')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

const chrome = await findChrome()
test.skipIf(!chrome)('shares reveal timing, keyboard tabs, and live copying with the presenter', async () => {
  const html = await renderDeck(parseDeck(fixture))
  const entry = new URL('../src/player.ts', import.meta.url).pathname
  const bundle = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'iife' })
  expect(bundle.success).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(bundle.outputs[0])
        case '/presentation.css': return new Response(Bun.file(new URL('../src/player.css', import.meta.url)))
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 1050, height: 720, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    await view.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await view.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.testClipboard = value },
    } })`)
    expect(await view.evaluate('window.presentationNavigation.clicksTotal')).toBe(3)
    await view.evaluate('window.presentationNavigation.go(1, 1)')
    const highlighted = () => view.evaluate(`(() => {
      const panel = document.querySelector('.code-group-panel:not([hidden])')
      const line = panel.querySelector('[data-code-line]:not([data-code-dim])')
      return [line.dataset.codeNumber, panel.querySelector('pre').scrollTop > 0]
    })()`)
    expect(await highlighted()).toEqual(['8', true])
    expect(await view.evaluate(`(() => {
      const panel = document.querySelector('.code-group-panel:not([hidden])')
      const pre = panel.querySelector('pre').getBoundingClientRect()
      const button = panel.querySelector('.code-copy-action').getBoundingClientRect()
      return button.top >= pre.top && button.bottom <= pre.bottom
    })()`)).toBe(true)
    await view.evaluate('document.querySelector(".code-group-panel:not([hidden]) .code-copy-action").click()')
    expect(await view.evaluate('window.testClipboard')).toBe(serverCode)

    await view.evaluate(`(() => {
      const tab = document.querySelector('[aria-selected="true"][role="tab"]')
      tab.focus()
      tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })()`)
    expect(await view.evaluate(`[document.activeElement.textContent, window.presentationNavigation.clicks]`)).toEqual(['Client', 1])
    expect(await highlighted()).toEqual(['3', false])

    const target = await view.evaluate<{ x: number, y: number }>(`(() => {
      const open = window.open
      window.open = (...args) => {
        window.open = open
        return window.codePresenter = open.apply(window, args)
      }
      const rect = document.querySelector('#presenter').getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })()`)
    await view.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...target, button: 'left', buttons: 1, clickCount: 1 })
    await view.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', buttons: 0, clickCount: 1 })
    expect(await view.evaluate(`(async () => {
      const popup = window.codePresenter
      const selected = document => document.querySelector('[aria-selected="true"][role="tab"]')?.textContent
      async function waitUntil(condition) {
        for (let attempt = 0; attempt < 120; attempt++) {
          if (condition()) return
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error('Presenter did not receive the selected code tab')
      }
      try {
        await waitUntil(() => popup?.presentationNavigation?.mode === 'presenter' && selected(popup.document) === 'Client')
        popup.document.querySelector('#code-group-1-tab-2').click()
        await waitUntil(() => selected(document) === 'Runnable')
        return [selected(popup.document), selected(document)]
      }
      finally { popup?.close() }
    })()`)).toEqual(['Runnable', 'Runnable'])
    await view.evaluate(`(() => {
      const panel = document.querySelector('.code-group-panel:not([hidden])')
      panel.querySelector('textarea').value = 'console.log("changed")'
      panel.querySelector('.code-copy-action').click()
    })()`)
    expect(await view.evaluate('window.testClipboard')).toBe('console.log("changed")')
    expect(await view.evaluate('document.querySelectorAll("#slide-2 .code-copy-action").length')).toBe(0)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)
