import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
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
  expect(await renderDeck(parseDeck('# Plain deck'))).not.toContain('live-highlight.js')
  const exported = await renderDeck(markup, { mode: 'export' })
  expect(exported).not.toContain('live-highlight.js')
  expect(exported).toMatch(/live-code-static"><code><span class="tok-/)
})

test.skipIf(!chrome)('highlights and sizes live editors, synchronizes their gutters, and runs read-only examples', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-live-editor-'))
  let view: Bun.WebView | undefined
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const source = join(root, 'slides.md')
    await Bun.write(source, [
      '---', 'lineNumbers: true', 'codeTheme: nord', '---', '', '# Automatic editor height',
      '', '~~~js {monaco} {height:"auto", lineNumbers:"relative", startLine:7}', 'const first = 1', 'const second = 2', '~~~',
      '', '---', '', '# Fixed editor height',
      '', '~~~js {monaco} {height:"90px", lineNumbers:"interval", startLine:8}',
      ...Array.from({ length: 12 }, (_, line) => '// Line ' + (line + 8)), '~~~',
      '', '---', '', '# Read-only runner',
      '', '~~~js {monaco-run} {readonly:true, autorun:false}', 'console.log("read-only result")', '~~~',
      '', '---', '', '# Hidden line numbers',
      '', '~~~js {live} {height:"initial", lines:false}', 'const fixed = 1', '~~~',
      '', '---', '', '# Custom grammar', '',
      '~~~probe {live}', 'advance 1', '~~~',
      '', '---', '', '# Convertible example', '',
      '~~~ts {live-run}', 'const typed: number = 2', 'console.log(typed)', '~~~',
      '', '---', '', '# Wrapped editor', '',
      '~~~js {monaco} {height:"auto", startLine:7, editorOptions:{wordWrap:"wordWrapColumn", wordWrapColumn:24}}',
      'const label = "' + 'break me '.repeat(10) + '"', 'const next = 2', '~~~',
      '', '---', '', '# Wrapped diagnostics', '',
      '~~~js {monaco} {height:"80px", editorOptions:{wordWrap:"bounded", wordWrapColumn:24}}',
      'const value = "' + 'wrap me '.repeat(24) + '" + )', '~~~',
      '', '---', '', '# Variable viewport', '',
      '~~~js {live} {height:"auto", editorOptions:{wordWrap:"on"}}',
      '// ' + 'a wide comment '.repeat(14), 'const end = true', '~~~',
      '', '---', '', '# Wide column', '',
      '~~~js {monaco} {height:"90px", editorOptions:{wordWrap:"wordWrapColumn", wordWrapColumn:160}}',
      '// ' + 'a wide comment '.repeat(24), 'const end = true', '~~~',
    ].join('\n'))
    await mkdir(join(root, 'setup'))
    await Bun.write(join(root, 'setup', 'shiki.ts'), String.raw`
      export default () => ({ langs: [{
        name: 'probe', scopeName: 'source.probe',
        patterns: [{ match: '\\b(?:advance|retreat)\\b', name: 'keyword.control.probe' }],
      }] })
    `)
    const output = join(root, 'site')
    const build = Bun.spawn([process.execPath, 'src/cli.ts', 'build', source, '--out', output], {
      cwd: join(import.meta.dir, '..'), stdout: 'ignore', stderr: 'pipe',
    })
    const [status, errors] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status !== 0) throw new Error(errors || `Build exited with status ${status}`)
    const directory = await realpath(output)
    server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      fetch(request) {
        const { pathname } = new URL(request.url)
        return asset(directory, pathname === '/' ? '/index.html' : pathname)
      },
    })
    const browser = new Bun.WebView({ width: 960, height: 540, backend: { type: 'chrome', path: chrome!, url: false } })
    view = browser
    await browser.navigate(server.url.href)
    const geometry = await browser.evaluate<{ auto: number[], fixed: number, initial: number[], relative: string, interval: string, scroll: number[], hidden: boolean }>(`(() => {
      const editor = slide => document.querySelector('#slide-' + slide + ' textarea')
      const gutter = slide => document.querySelector('#slide-' + slide + ' [data-live-gutter]')
      const height = element => parseFloat(getComputedStyle(element).height)
      const changed = element => element.dispatchEvent(new Event('input', { bubbles: true }))
      const first = editor(1)
      const auto = [height(first)]
      first.value += '\\nconst third = 3\\nconst fourth = 4'
      first.setSelectionRange(first.value.length, first.value.length)
      changed(first)
      auto.push(height(first))
      const relative = gutter(1).textContent
      document.querySelector('#slide-1 [data-live-reset]').click()
      auto.push(height(first))
      window.presentationNavigation.go(2)
      const second = editor(2)
      second.scrollTop = 60
      second.dispatchEvent(new Event('scroll'))
      const offset = new DOMMatrix(getComputedStyle(gutter(2)).transform).m42
      const scroll = [second.scrollTop, offset]
      const fixed = height(second)
      const interval = gutter(2).textContent
      window.presentationNavigation.go(4)
      const last = editor(4)
      const initial = [height(last)]
      last.value += '\\n'.repeat(15)
      changed(last)
      initial.push(height(last))
      return { auto, fixed, initial, relative, interval, scroll, hidden: gutter(4) === null }
    })()`)
    expect(geometry.auto[1] - geometry.auto[0]).toBe(45)
    expect(geometry.auto[2]).toBe(geometry.auto[0])
    expect(geometry.relative).toBe('3\n2\n1\n10')
    expect(geometry.fixed).toBe(90)
    expect(geometry.interval.split('\n').slice(0, 4)).toEqual(['8', '', '10', ''])
    expect(geometry.scroll).toEqual([60, -60])
    expect(geometry.initial[0]).toBe(geometry.initial[1])
    expect(geometry.hidden).toBe(true)
    expect(await browser.evaluate(`(async () => {
      window.presentationNavigation.go(5)
      const block = document.querySelector('#slide-5 .live-code-editor')
      const editor = block.querySelector('textarea')
      const layer = block.querySelector('.live-code-highlight > div')
      const keyword = () => layer.querySelector('.tok-keyword')
      const original = keyword()?.textContent
      const palette = keyword() && getComputedStyle(keyword()).color
      editor.dispatchEvent(new CompositionEvent('compositionstart'))
      const visibleDuringComposition = block.hasAttribute('data-live-highlighted')
      editor.value = 'retreat <img alt="literal" src="sample">\\t' + 'a'.repeat(150)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      editor.dispatchEvent(new CompositionEvent('compositionend'))
      editor.scrollLeft = 100
      editor.dispatchEvent(new Event('scroll'))
      const offset = new DOMMatrix(getComputedStyle(layer).transform).m41
      const edited = [keyword()?.textContent, layer.textContent === editor.value, layer.querySelector('img') === null, offset]
      editor.value = 'advance\\t2'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(resolve))
      return [original, palette, visibleDuringComposition, edited, layer.textContent]
    })()`)).toEqual(['advance', 'rgb(129, 161, 193)', false, ['retreat', true, true, -100], 'advance\t2'])
    expect(await browser.evaluate(`(() => {
      window.presentationNavigation.go(6)
      const block = document.querySelector('#slide-6 .live-code')
      const editable = block.querySelector('textarea')
      const highlighted = block.querySelector('.live-code-highlight > div')
      block.querySelector('[data-live-convert]').click()
      const converted = [!editable.value.includes(': number'), highlighted.textContent === editable.value]
      block.querySelector('[data-live-reset]').click()
      return [...converted, editable.value.includes(': number'), highlighted.textContent === editable.value]
    })()`)).toEqual([true, true, true, true])
    const wrap = await browser.evaluate<{ flags: boolean[], lines: string[], added: number, alignment: number[] }>(`(async () => {
      window.presentationNavigation.go(7)
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const block = document.querySelector('#slide-7 .live-code-editor')
      const editor = block.querySelector('textarea')
      const layer = block.querySelector('.live-code-highlight > div')
      const rows = block.querySelector('.live-code-measure > div')
      const gutter = block.querySelector('[data-live-gutter]')
      const height = () => parseFloat(getComputedStyle(editor).height)
      const initial = height()
      const lines = gutter.textContent.split('\\n')
      const next = [...layer.querySelectorAll('.tok-keyword')].at(-1)
      const nativeTop = rows.children[1].getBoundingClientRect().top - rows.children[0].getBoundingClientRect().top
      const highlightTop = next.getBoundingClientRect().top - layer.querySelector('.tok-keyword').getBoundingClientRect().top
      const expectedGutter = lines.indexOf('8') * parseFloat(getComputedStyle(gutter).lineHeight)
      const actualGutter = rows.children[1].offsetTop
      const flags = [editor.wrap === 'soft', editor.scrollWidth === editor.clientWidth,
        layer.textContent === editor.value, initial + 1 >= editor.scrollHeight]
      editor.value += '\\n// ' + 'a very long new comment '.repeat(4)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      return { flags, lines, added: height() - initial, alignment: [nativeTop - highlightTop, expectedGutter - actualGutter] }
    })()`)
    expect(wrap.flags).toEqual([true, true, true, true])
    expect(wrap.lines[0]).toBe('7')
    expect(wrap.lines.at(-1)).toBe('8')
    expect(wrap.lines.length).toBeGreaterThan(3)
    expect(wrap.lines.slice(1, -1).every(value => !value)).toBe(true)
    expect(wrap.added).toBeGreaterThan(22.5)
    for (const offset of wrap.alignment) expect(Math.abs(offset)).toBeLessThan(1)
    expect(await browser.evaluate(`(async () => {
      window.presentationNavigation.go(8)
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const block = document.querySelector('#slide-8 .live-code')
      const editor = block.querySelector('textarea')
      const marker = block.querySelector('.live-code-diagnostics button')
      marker.click()
      editor.dispatchEvent(new Event('scroll'))
      const marks = block.querySelector('.live-code-marks')
      const underline = marks.querySelector('span').getBoundingClientRect()
      const viewport = editor.getBoundingClientRect()
      return [marker.textContent.startsWith('Line 1,'), editor.scrollTop > 100,
        editor.value.slice(editor.selectionStart, editor.selectionEnd), underline.top >= viewport.top, underline.bottom <= viewport.bottom]
    })()`)).toEqual([true, true, ')', true, true])
    expect(await browser.evaluate(`(async () => {
      const wait = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) }
      window.presentationNavigation.go(9)
      await wait()
      const viewport = document.querySelector('#slide-9 .live-code-editor')
      const editor = viewport.querySelector('textarea')
      const height = parseFloat(getComputedStyle(editor).height)
      viewport.style.width = '300px'
      await wait()
      const narrowed = parseFloat(getComputedStyle(editor).height) > height
      window.presentationNavigation.go(10)
      await wait()
      const wide = document.querySelector('#slide-10 .live-code-editor')
      wide.scrollLeft = 150
      const child = wide.querySelector('textarea')
      return [narrowed, wide.scrollWidth > wide.clientWidth, wide.scrollLeft > 0, child.scrollLeft === 0]
    })()`)).toEqual([true, true, true, true])
    expect(await browser.evaluate(`(() => {
      window.presentationNavigation.go(3)
      const block = document.querySelector('#slide-3 .live-code')
      const editor = block.querySelector('textarea')
      editor.focus()
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
      return [editor.readOnly, !!block.querySelector('[data-live-reset]'), block.querySelector('[data-live-gutter]').textContent]
    })()`)).toEqual([true, false, '1'])
    expect(await browser.evaluate(`(async () => {
      const output = document.querySelector('#slide-3 [data-live-result]')
      for (let attempt = 0; attempt < 100 && !output.textContent; attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      return output.textContent.trim()
    })()`)).toBe('read-only result')
    await browser.navigate(new URL('/?capture=1', server.url).href)
    expect(await browser.evaluate("getComputedStyle(document.querySelector('#slide-1 .live-code-editor')).display")).toBe('none')
    expect(await browser.evaluate("getComputedStyle(document.querySelector('#slide-1 .live-code-static')).display")).toBe('block')
    expect(await browser.evaluate("document.querySelector('#slide-1 .live-code-static .tok-keyword').textContent")).toBe('const')
  }
  finally {
    view?.close()
    await server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

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
