import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseCodeInfo } from '../packages/slidev/node/runtime/code-blocks.ts'
import { createDeckCompiler, parseDeck, renderDeck } from '../src/index.ts'

const chrome = await findChrome()

test('parses runner timing and uses standard click positions for output', () => {
  const timing = (info: string) => parseCodeInfo(info)?.runnerTiming
  expect(timing('ts {monaco-run}')).toEqual({ autorun: true, outputAt: undefined })
  expect(timing('ts {live-run}')).toEqual({ autorun: undefined, outputAt: undefined })
  expect(timing('ts {monaco-run} {autorun:false, showOutputAt:0}')).toEqual({ autorun: undefined, outputAt: undefined })
  expect(timing("ts {live-run} {autorun:'once', showOutputAt:'+2'}")).toEqual({ autorun: 'once', outputAt: '+2' })
  expect(timing("ts {monaco-run} {showOutputAt:[2,'+2']}")).toEqual({ autorun: true, outputAt: '[2,"+2"]' })
  expect(timing('ts {monaco-run} {showOutputAt:"not-a-click"}')?.outputAt).toBeUndefined()
})

test('honors deck and slide editor settings before emitting runnable markup', async () => {
  const markup = parseDeck([
    '---', 'monaco: dev', '---', '', '# Dev example', '',
    '~~~js {monaco-run}', 'console.log(1)', '~~~', '',
    '---', 'monaco: false', '---', '', '# Disabled', '',
    '~~~js {monaco-run}', 'console.log(2)', '~~~', '',
    '---', 'monaco: true', '---', '', '# Enabled', '',
    '~~~js {monaco-run}', 'console.log(3)', '~~~',
  ].join('\n'))
  const build = await renderDeck(markup, { mode: 'build' })
  const dev = await renderDeck(markup, { mode: 'dev' })
  expect(build.match(/data-live-autorun="true"/g)).toHaveLength(1)
  expect(build).toContain('language-js')
  expect(dev.match(/data-live-autorun="true"/g)).toHaveLength(2)
})

test.skipIf(!chrome)('autoruns visible runners, tracks the output reveal, and cancels superseded drafts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-runner-timing-'))
  let view: Bun.WebView | undefined
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const source = join(root, 'slides.md')
    await Bun.write(source, [
      '---', 'comark: true', '---', '', '# Introduction', '', '---', '', '# Running examples', '',
      '<div v-click>First reveal</div>', '',
      '~~~probe {monaco-run} {showOutputAt:"+1"}', 'eager', '~~~', '',
      '~~~probe {monaco-run} {autorun:"once"}', 'once', '~~~', '',
      '~~~probe {monaco-run} {autorun:false}', 'manual', '~~~', '',
      '---', '', '# Code tabs', '', '::code-group',
      '~~~text [Source]', 'Code sample', '~~~',
      '~~~probe [Run it] {monaco-run}', 'tab', '~~~', '::',
    ].join('\n'))
    await Bun.write(join(root, 'setup/code-runners.ts'), `
const history = []
window.runnerHistory = history
export default () => ({
  probe(source, { signal }) {
    history.push(source)
    if (source !== 'pending') return { text: source }
    return new Promise(resolve => signal.addEventListener('abort', () => {
      history.push('cancelled')
      resolve({ text: 'stale result' })
    }, { once: true }))
  },
})
`)
    const deck = await createDeckCompiler(source)()
    const player = await Bun.build({
      entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
      target: 'browser',
      format: 'iife',
    })
    const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
    server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      fetch(request) {
        switch (new URL(request.url).pathname) {
          case '/': return new Response(deck.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          case '/presentation.js': return new Response(player.outputs[0])
          case '/presentation.css': return new Response(css)
          case '/extensions.js': return new Response(deck.client, { headers: { 'Content-Type': 'text/javascript' } })
          default: return new Response(null, { status: 404 })
        }
      },
    })
    const browser = new Bun.WebView({ width: 1024, height: 680, backend: { type: 'chrome', path: chrome!, url: false } })
    view = browser
    await browser.navigate(server.url.href)
    const waitFor = (condition: string) => browser.evaluate(`(async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (${condition}) return
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      throw new Error('Expected example state did not appear')
    })()`)
    const history = () => browser.evaluate<string[]>('window.runnerHistory')
    const block = (index: number) => `document.querySelectorAll('#slide-2 .live-code')[${index}]`
    const output = `${block(0)}.querySelector('[data-live-result]')`
    const edit = (index: number, value: string) => browser.evaluate(`(() => {
      const editor = ${block(index)}.querySelector('textarea')
      editor.value = ${JSON.stringify(value)}
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)

    await Bun.sleep(300)
    expect(await history()).toEqual([])
    await browser.evaluate('window.presentationNavigation.go(2)')
    await waitFor(`${output}.textContent === 'eager' && window.runnerHistory.includes('once')`)
    expect((await history()).sort()).toEqual(['eager', 'once'])
    expect(await browser.evaluate(`getComputedStyle(${output}).display`)).toBe('none')
    await browser.evaluate('window.presentationNavigation.next()')
    expect(await browser.evaluate(`getComputedStyle(${output}).display`)).toBe('none')
    await browser.evaluate('window.presentationNavigation.next()')
    expect(await browser.evaluate(`getComputedStyle(${output}).display`)).toBe('block')

    await edit(1, 'once changed')
    await edit(0, 'intermediate')
    await edit(0, 'pending')
    await waitFor("window.runnerHistory.includes('pending')")
    await edit(0, 'latest')
    await waitFor(`${output}.textContent === 'latest'`)
    expect((await history()).slice(2)).toEqual(['pending', 'cancelled', 'latest'])
    await browser.evaluate(`${block(2)}.querySelector('[data-live-run]').click()`)
    await waitFor("window.runnerHistory.includes('manual')")

    await browser.evaluate('window.presentationNavigation.go(3)')
    await Bun.sleep(300)
    expect(await history()).not.toContain('tab')
    await browser.evaluate("document.querySelectorAll('#slide-3 [role=tab]')[1].click()")
    await waitFor("window.runnerHistory.includes('tab')")
    await browser.evaluate('window.presentationNavigation.go(2)')
    await Bun.sleep(300)
    expect((await history()).slice(2)).toEqual(['pending', 'cancelled', 'latest', 'manual', 'tab'])

    await browser.navigate(new URL('/?capture=1#slide-2', server.url).href)
    await Bun.sleep(300)
    expect(await history()).toEqual([])
  }
  finally {
    view?.close()
    server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
