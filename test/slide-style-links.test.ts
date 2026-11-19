// Adapted from Slidev v53.1.0's scoped CSS, link, and slot syntax cases (MIT).
import { expect, test } from 'bun:test'
import { findChrome } from '../src/chrome.ts'
import { parseDeck, renderDeck } from '../src/index.ts'
import { splitSlots } from '../src/syntax.ts'

const draft = [
  '# Prepare',
  '',
  '[Go to the reveal](#review/1) · [External](https://example.com/a?one=1&two=2 "Example")',
  '',
  '<Link :to="2" title="Open review" />',
  '',
  '<div class="box"><span class="marker" data-value="a,b">First marker</span></div>',
  '',
  '<style>',
  '  :scope { --accent: #be213e; }',
  '  .box { & > .marker[data-value="a,b"], & > p { color: var(--accent); } }',
  '  .marker/* keep this compound */::before { content: "first;{,}"; }',
  '  @supports (display: grid) { @media all { .marker { font-weight: 700; } } }',
  '  .slide { & + article .marker { opacity: 0.12; } }',
  '  @keyframes pulse { from { opacity: .3; } to { opacity: 1; } }',
  '  .marker { animation: pulse 60s linear paused; }',
  '</style>',
  '',
  '```html',
  '<style>',
  '.marker { font-size: 100px }',
  '</style>',
  '```',
  '',
  '---',
  'routeAlias: review',
  '---',
  '',
  '# Review',
  '',
  '<p id="local-heading" class="marker">Second marker</p>',
  '',
  '<div v-click>Review reveal</div>',
  '',
  '[This section](#local-heading) · [Return](1)',
  '',
  '<style scoped media="all">',
  '  .marker { color: #2364aa; animation-name: pulse; }',
  '  @keyframes pulse { to { transform: translateX(20px); } }',
  '</style>',
].join('\n')

test('scopes ordinary and explicit styles, preserves fences, and compiles native links', async () => {
  const html = await renderDeck(parseDeck(draft))
  expect(html).toContain('<style data-slide-style="1">')
  expect(html).toContain('<style data-slide-style="2" media="all">')
  expect(html).not.toContain('<style scoped')
  expect(html).toContain('first;{,}')
  expect(html).toContain('@keyframes tp-slide-1-pulse')
  expect(html).toContain('@keyframes tp-slide-2-pulse')
  expect(html).toContain('animation: tp-slide-1-pulse 60s linear paused')
  expect(html).toContain('animation-name: tp-slide-2-pulse')
  expect(html.match(/<style data-slide-style=/g)).toHaveLength(2)
  const codeExample = /<pre><code class="language-html">([\s\S]*?)<\/code><\/pre>/.exec(html)?.[1]
  expect(codeExample?.replace(/<\/?span\b[^>]*>/g, '')).toContain('&lt;style&gt;')
  expect(html).toContain('<a href="#slide-2" data-slide-link="2" data-slide-click="1">Go to the reveal</a>')
  expect(html).toContain('<a href="#slide-2" data-slide-link="2">Open review</a>')
  expect(html).toContain('href="https://example.com/a?one=1&amp;two=2" title="Example" target="_blank" rel="noopener noreferrer"')
  expect(html).toContain('<a href="#local-heading">This section</a>')
  expect(html).toContain('<a href="#slide-1" data-slide-link="1">Return</a>')
})

test('protects raw HTML text and does not move unrelated links into slide navigation', async () => {
  const script = `<script>const source = '<style>.x { color: red }</style>'</script>`
  const html = await renderDeck(parseDeck([
    '# Example', '',
    script,
    '<textarea> <style>.x { color: red }</style> </textarea>',
    '',
    '<a href="https://example.com" target="_self" title="&copy;">Self</a>',
    '',
    '<a href="2" download>Download</a>',
    '',
    '<style>@import "shared.css"; .ok { color: green }</style>',
    '',
    '---',
    '',
    '# Second',
  ].join('\n')))
  expect(html.match(/<style data-slide-style=/g)).toHaveLength(1)
  expect(html).toContain(script)
  expect(html).toContain('<textarea> <style>.x { color: red }</style> </textarea>')
  expect(html).not.toContain('@import "shared.css"')
  expect(html).toContain('<a href="https://example.com" target="_self" title="&copy;">Self</a>')
  expect(html).toContain('<a href="2" download>Download</a>')
})

test('preserves slot text inside raw blocks and accepts compound, case-sensitive slot names', () => {
  const slots = splitSlots('Left\n<!--\n::ignored::\n-->\n<style>\n::literal::\n</style>\n::  Aside.label:data  ::\nRight')
  expect(Object.keys(slots)).toEqual(['default', 'Aside.label:data'])
  expect(slots.default).toContain('::ignored::')
  expect(slots.default).toContain('::literal::')
  expect(slots['Aside.label:data']).toBe('Right')
})

const chrome = await findChrome()
test.skipIf(!chrome)('keeps computed styles local and follows native links to their reveal step', async () => {
  const html = await renderDeck(parseDeck(draft))
  const compiled = await Bun.build({ entrypoints: [new URL('../src/player.ts', import.meta.url).pathname], target: 'browser', format: 'iife' })
  expect(compiled.success).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(compiled.outputs[0])
        case '/presentation.css': return new Response(Bun.file(new URL('../src/player.css', import.meta.url)))
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    expect(await view.evaluate(`(() => {
      const first = document.querySelector('#slide-1 .marker')
      const second = document.querySelector('#slide-2 .marker')
      return [getComputedStyle(first).color, getComputedStyle(first, '::before').content, getComputedStyle(first).fontWeight,
        getComputedStyle(first).animationName, getComputedStyle(second).animationName, getComputedStyle(second).opacity]
    })()`)).toEqual(['rgb(190, 33, 62)', '"first;{,}"', '700', 'tp-slide-1-pulse', 'tp-slide-2-pulse', '1'])

    await view.evaluate('document.querySelector("[data-slide-click]").click()')
    expect(await view.evaluate(`[location.hash, window.presentationNavigation.currentPage, window.presentationNavigation.clicks,
      getComputedStyle(document.querySelector('#slide-2 .marker')).color]`)).toEqual(['#review/1', 2, 1, 'rgb(35, 100, 170)'])
    await view.evaluate(`(async () => {
      const changed = new Promise(resolve => window.addEventListener('hashchange', resolve, { once: true }))
      document.querySelector('a[href="#local-heading"]').click()
      await changed
    })()`)
    expect(await view.evaluate('[location.hash, window.presentationNavigation.currentPage]')).toEqual(['#local-heading', 2])
    await view.evaluate('document.querySelector("#slide-2 [data-slide-link]").click()')
    expect(await view.evaluate('[location.hash, window.presentationNavigation.currentPage]')).toEqual(['#slide-1', 1])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)
