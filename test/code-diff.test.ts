import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codeDiffRows } from '../packages/client/runtime/code-diff.ts'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseCodeInfo } from '../packages/slidev/node/runtime/code-blocks.ts'
import { parseDeck, renderDeck } from '../src/index.ts'

const chrome = await findChrome()
const source = [
  '# Code history', '',
  '```ts [Counter change] {monaco-diff} {lines:true, startLine:4, height:"120px"}',
  'const n = 1',
  'const remove = true',
  'console.log(n)',
  '~~~',
  'const n = 2',
  'console.log(n)',
  'const add = true',
  '```',
  '', '---', '', '# Read-only example', '',
  '```js {live-diff} {readonly:true}',
  'let n = 3',
  '~~~',
  'let n = 4',
  '```',
].join('\n')

test('renders both authored diff panes with token colors, headers, and per-side line numbers', async () => {
  expect(parseCodeInfo('ts {monaco-diff} {readonly:true, height:"180px"}')).toMatchObject({
    language: 'ts', runner: 'diff', diffOptions: { readonly: true, height: '180px' },
  })
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('<figcaption>Counter change</figcaption>')
  expect(html).toContain('style="height:120px;max-height:none"')
  expect(html).toContain('<span class="code-diff-number">4</span>')
  expect(html).toContain('aria-label="Removed line"')
  expect(html).toContain('aria-label="Added line"')
  expect(html).toContain('<span class="tok-keyword">const</span>')
  expect(html.match(/data-diff-editor/g)).toHaveLength(1)
  expect(html.match(/data-code-diff data-diff-start=/g)).toHaveLength(2)
  const fallback = await renderDeck(parseDeck('```ts {monaco-diff}\nconst one = 1\n```'))
  expect(fallback).toContain('class="live-code"')
  expect(fallback).toContain('const one = 1</textarea>')
})

test('aligns shared lines after insertions and emits clean one-sided rows for empty inputs', () => {
  const shared = codeDiffRows('a\nb\nc\nd', 'a\ninserted\nb\nd', { numbers: true, start: 1 })
  expect(shared).toMatch(/data-diff-empty[^>]*><\/div><div[^>]*data-diff-side="after" data-diff-changed[^>]*>.*?inserted<\/code>/)
  expect(shared).toMatch(/data-diff-side="before"><span class="code-diff-number">2<\/span>.*?>b<\/code><\/div><div[^>]*data-diff-side="after"><span class="code-diff-number">3<\/span>.*?>b<\/code>/)
  expect(shared).toMatch(/data-diff-side="before" data-diff-changed[^>]*>.*?>c<\/code><\/div><div[^>]*data-diff-empty/)
  const afterOnly = codeDiffRows('', '<img src=x>', { numbers: false, start: 1 })
  expect(afterOnly).toContain('&lt;img src=x&gt;')
  expect(afterOnly).not.toContain('data-diff-side="before"')
  const large = codeDiffRows(Array.from({ length: 600 }, (_, i) => 'a' + i).join('\n'), Array.from({ length: 600 }, (_, i) => 'b' + i).join('\n'), { numbers: false, start: 1 })
  expect(large.match(/data-diff-changed/g)).toHaveLength(1_200)
})

test.skipIf(!chrome)('edits and resets a static comparison and shows its authored diff in capture mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-code-diff-'))
  const slides = join(root, 'slides.md')
  const output = join(root, 'site')
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    await Bun.write(slides, source)
    const build = Bun.spawn([process.execPath, 'src/cli.ts', 'build', slides, '--out', output], {
      cwd: join(import.meta.dir, '..'), stdout: 'ignore', stderr: 'pipe',
    })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr || `Static build exited with status ${status}`)
    const directory = await realpath(output)
    server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      fetch(request) {
        const url = new URL(request.url)
        return asset(directory, url.pathname === '/' ? '/index.html' : url.pathname)
      },
    })
    const browser = new Bun.WebView({ width: 960, height: 640, backend: { type: 'chrome', path: chrome!, url: false } })
    view = browser
    await browser.navigate(server.url.href)
    const changes = () => browser.evaluate<string[]>(`[...document.querySelectorAll('#slide-1 [data-diff-side="after"][data-diff-changed] code')].map(line => line.textContent)`)
    expect(await changes()).toEqual(['const n = 2', 'const add = true'])
    const aligned = await browser.evaluate<number[]>(`[...document.querySelectorAll('#slide-1 .code-diff-line')].map(line => line.getBoundingClientRect().top)`)
    expect(aligned[0]).toBe(aligned[1])
    expect(aligned[2]).toBe(aligned[3])
    expect(await browser.evaluate(`(() => {
      const region = document.querySelector('#slide-1 .code-diff-scroll')
      region.focus()
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      return [region.dispatchEvent(event), window.presentationNavigation.currentPage]
    })()`)).toEqual([true, 1])
    await browser.evaluate(`(() => {
      document.querySelector('#slide-1 .code-diff-edit summary').click()
      const editor = document.querySelector('#slide-1 [data-diff-editor]')
      editor.value = 'const n = 5\\nconst remove = true\\nconsole.log(n)\\n<mark>edit</mark>'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      return new Promise(requestAnimationFrame)
    })()`)
    expect(await changes()).toEqual(['const n = 5', '<mark>edit</mark>'])
    expect(await browser.evaluate("document.querySelector('#slide-1 .code-diff mark') === null")).toBe(true)
    await browser.evaluate(`(() => {
      document.querySelector('#slide-1 [data-diff-reset]').click()
      return new Promise(requestAnimationFrame)
    })()`)
    expect(await changes()).toEqual(['const n = 2', 'const add = true'])

    await browser.navigate(new URL('/?capture=1', server.url).href)
    expect(await browser.evaluate("getComputedStyle(document.querySelector('#slide-1 .code-diff-edit')).display")).toBe('none')
    expect(await changes()).toEqual(['const n = 2', 'const add = true'])
  }
  finally {
    view?.close()
    server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
