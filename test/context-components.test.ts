// Adapted from Slidev's RenderWhen and LightOrDark component examples (MIT).
import { expect, test } from 'bun:test'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

const deck = [
  '---',
  'colorSchema: auto',
  '---',
  '# Conditional slides',
  '',
  `<RenderWhen :context="['presenter', 'print']" id="conditional">`,
  '<template #default>',
  '',
  '**Extra detail**',
  '',
  '<p id="detail-click" v-click>Extra reveal</p>',
  '<style>#tail { color: rgb(140, 50, 90); }</style>',
  '',
  '</template>',
  '<template v-slot:fallback><p id="audience-copy">Audience copy</p></template>',
  '</RenderWhen>',
  '',
  '<LightOrDark width="100" alt="Theme badge">',
  '<template #dark="props"><img id="dark-badge" v-bind="props" /></template>',
  '<template #light><p id="light-badge" v-click>Light badge</p></template>',
  '</LightOrDark>',
  '',
  '<RenderWhen context="slide"><p id="slide-only">Slide only</p></RenderWhen>',
  '',
  '<RenderWhen context="main"><p id="main-copy">Main views</p></RenderWhen>',
  '',
  '<RenderWhen context="print"><p id="print-only">Print only</p></RenderWhen>',
  '',
  '<RenderWhen context="previewNext"><p id="preview-only">Next frame only</p></RenderWhen>',
  '',
  '<RenderWhen id="intersection" context="visible" style="position:absolute;left:-2000px;width:100px;top:0">',
  '<span id="in-viewport">Visible detail</span>',
  '<template #fallback><span id="outside-viewport">Outside viewport</span></template>',
  '</RenderWhen>',
  '',
  '<v-switch>',
  '<template #1><RenderWhen context="presenter"><span id="nested-slot">Nested presenter</span></RenderWhen></template>',
  '<template #2>Next switch slot</template>',
  '</v-switch>',
  '',
  '<p id="tail" v-click>Final reveal</p>',
  '',
  '---',
  '',
  '# End',
].join('\n')

test('compiles conditional blocks with inert content and static context lists', async () => {
  const html = await renderDeck(parseDeck(deck))
  expect(html).toContain('data-color-schema="auto"')
  expect(html).toContain('<div id="conditional" data-render-when="presenter print"><template data-condition-content>')
  expect(html).toContain('<strong>Extra detail</strong>')
  expect(html).toContain('<div width="100" alt="Theme badge" data-light-or-dark=""><template data-condition-content>')
  expect(html).not.toContain('<RenderWhen')
  expect(html).not.toContain('<LightOrDark')
})

const chrome = await findChrome()
test.skipIf(!chrome)('mounts context and appearance slots without counting inactive reveals', async () => {
  const html = await renderDeck(parseDeck(deck))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
  })
  expect(player.success).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(player.outputs[0])
        case '/presentation.css': return new Response(Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)))
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  const mode = (value: 'dark' | 'light') => view.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
  try {
    await view.navigate('data:text/html,<title>Conditional components</title>')
    await mode('dark')
    await view.navigate(server.url.href)
    const initial = await view.evaluate<number>(`(async () => {
      for (let attempt = 0; attempt < 20 && !document.querySelector('#outside-viewport'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      if (!document.querySelector('#outside-viewport')) throw new Error('Off-screen slot did not fall back')
      return window.presentationNavigation.clicksTotal
    })()`)
    expect(await view.evaluate(`(() => {
      const ids = ['audience-copy', 'detail-click', 'slide-only', 'main-copy', 'print-only', 'preview-only']
      const badge = document.querySelector('#dark-badge')
      return [document.documentElement.className, badge.getAttribute('width'), badge.alt,
        getComputedStyle(document.querySelector('#tail')).color,
        ...ids.map(id => !!document.getElementById(id))]
    })()`)).toEqual(['dark', '100', 'Theme badge', 'rgb(251, 250, 248)', true, false, true, true, false, false])

    expect(await view.evaluate(`(async () => {
      document.querySelector('#intersection').style.left = '0'
      for (let attempt = 0; attempt < 20 && !document.querySelector('#in-viewport'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      return !!document.querySelector('#in-viewport')
    })()`)).toBe(true)

    expect(await view.evaluate(`(() => {
      window.open = () => null
      document.querySelector('#presenter').click()
      const nav = window.presentationNavigation
      return [nav.mode, nav.clicks, nav.clicksTotal, !!document.querySelector('#nested-slot'), !document.querySelector('#audience-copy')]
    })()`)).toEqual(['presenter', 0, initial + 1, true, true])

    await view.evaluate('window.presentationNavigation.go(1, 1)')
    await mode('light')
    expect(await view.evaluate(`(async () => {
      for (let attempt = 0; attempt < 20 && !document.querySelector('#light-badge'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      const nav = window.presentationNavigation
      const first = document.querySelector('#detail-click')
      return [document.documentElement.className, !!document.querySelector('#light-badge'),
        !document.querySelector('#dark-badge'), nav.clicks, nav.clicksTotal,
        getComputedStyle(document.querySelector('#tail')).color,
        first.inert, first.hasAttribute('data-reveal-hidden'),
        document.querySelectorAll('v-switch > div').length,
      ]
    })()`)).toEqual(['light', true, true, 1, initial + 2, 'rgb(140, 50, 90)', false, false, 2])

    await view.navigate(new URL('?preview=1', server.url).href)
    expect(await view.evaluate(`[!!document.querySelector('#preview-only'), !!document.querySelector('#audience-copy'), !!document.querySelector('#main-copy')]`)).toEqual([true, true, false])
    await view.navigate(new URL('?capture=1', server.url).href)
    expect(await view.evaluate(`[!!document.querySelector('#print-only'), !!document.querySelector('#detail-click'), !!document.querySelector('#main-copy')]`)).toEqual([true, true, false])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)
