import { expect, test } from 'bun:test'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { collectSnapshot } from '../packages/slidev/node/runtime/editable/walker.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'
import { prepareSlideHtml } from '../packages/slidev/node/runtime/slide-html.ts'

const source = [
  '---', 'heading: A heading that resizes', 'zoomFactor: 0.5', '---', '',
  '# Layout examples', '',
  '<AutoFitText id="fit" class="headline" style="width:320px;padding-inline:10px" :min="12" :max="64" v-bind:model-value="frontmatter.heading" />',
  '',
  '<Transform id="scaled" :scale="frontmatter.zoomFactor" origin="0 0" style="width:220px">',
  '',
  '<AutoFitText id="scaled-fit" :min="12" :max="60" modelValue="Scale with the parent" />',
  '',
  '</Transform>', '',
  '<AutoFitText id="wrap" style="width:90px" :min="18" :max="42" modelValue="This caption has enough words to wrap" />',
  '',
  '<AutoFitText id="scroll" style="width:74px" :min="18" :max="42" :multiLine="false" modelValue="Keep this on one line" />',
  '',
  '<AutoFitText modelValue="fallback"><template v-slot:default>**Authored slot**</template></AutoFitText>',
  '', '~~~md', '<AutoFitText modelValue="literal syntax" />', '~~~',
  '', '---', '', '# Destination',
  '',
  '<AutoFitText id="next-fit" style="width:220px" :min="12" :max="60" modelValue="Fit when this slide opens" />',
].join('\n')

test('compiles auto-fitting and scaled content through the native deck renderer', async () => {
  const html = await renderDeck(parseDeck(source))
  expect(html).toContain('class="slidev-auto-fit-text headline"')
  expect(html).toContain('data-fit-min="12" data-fit-max="64"')
  expect(html).toContain('style="font-size:12px">A heading that resizes</')
  expect(html).toContain('style="width:220px;transform-origin:0 0;transform:scale(0.5)"')
  expect(html).toContain('<strong>Authored slot</strong>')
  expect(html).not.toContain('>fallback</')
  expect(html).toContain('literal syntax')
  expect(html).not.toContain('<AutoFitText')
  expect(html).not.toContain('<Transform')
  const safe = prepareSlideHtml('<AutoFitText modelValue="&lt;b&gt;Plain&lt;/b&gt;"></AutoFitText><Transform origin="center;position:fixed" :scale="\'bad\'"/>', () => undefined, 1).html
  expect(safe).toContain('&lt;b&gt;Plain&lt;/b&gt;')
  expect(safe).toContain('transform-origin:top left')
  expect(safe).not.toContain('position:fixed')
})

const chrome = await findChrome()
test.skipIf(!chrome)('fits text at presentation scale, refits changed content, and prepares capture frames', async () => {
  const html = await renderDeck(parseDeck(source))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser', format: 'iife',
  })
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html' } })
        case '/presentation.js': return new Response(player.outputs[0], { headers: { 'Content-Type': 'text/javascript' } })
        case '/presentation.css': return new Response(css, { headers: { 'Content-Type': 'text/css' } })
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 850, height: 650, backend: { type: 'chrome', path: chrome!, url: false } })
  const measure = (id: string) => view.evaluate<{ size: number, wrapped: boolean, width: number, available: number, visual: number }>(`(() => {
    const host = document.getElementById(${JSON.stringify(id)})
    const inner = host.firstElementChild
    const style = getComputedStyle(host)
    return {
      size: Number.parseFloat(inner.style.fontSize), wrapped: inner.hasAttribute('data-fit-wrapped'), width: inner.scrollWidth,
      available: host.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd),
      visual: inner.getBoundingClientRect().width,
    }
  })()`)
  const until = async (condition: string) => {
    await view.evaluate(`(async () => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (${condition}) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('The text did not refit')
    })()`)
  }
  try {
    await view.navigate(server.url.href)
    await until('Number.parseFloat(document.querySelector("#fit .slidev-auto-fit-text-inner").style.fontSize) > 12')
    const initial = await measure('fit')
    expect(initial.size).toBeLessThan(64)
    expect(initial.width).toBeLessThanOrEqual(initial.available)
    const scaled = await measure('scaled-fit')
    expect(scaled.width).toBeLessThanOrEqual(scaled.available)
    expect(scaled.visual).toBeLessThan(scaled.width * 0.6)
    expect(await measure('wrap')).toMatchObject({ size: 18, wrapped: true })
    expect(await measure('scroll')).toMatchObject({ size: 18, wrapped: false })
    expect(await view.evaluate("getComputedStyle(document.getElementById('scaled')).transform")).toBe('matrix(0.5, 0, 0, 0.5, 0, 0)')
    const snapshot = await view.evaluate<ReturnType<typeof collectSnapshot>>(`(${collectSnapshot.toString()})({
      containerSelector: '#slide-1', idAttribute: 'data-text-export-test', slide: 1, click: 0,
    })`)
    const nodes = snapshot.slides[0].nodes
    const text = nodes.find(node => node.text === 'Scale with the parent')!
    const textStyle = snapshot.styles[nodes.find(node => node.id === text.parent)!.style]
    expect(Number.parseFloat(textStyle.fontSize)).toBeCloseTo(scaled.size * 0.5)
    expect(snapshot.styles.every(style => style.transform !== 'matrix(0.5, 0, 0, 0.5, 0, 0)')).toBe(true)

    await view.evaluate("document.getElementById('fit').style.width = '470px'")
    await until(`Number.parseFloat(document.querySelector("#fit .slidev-auto-fit-text-inner").style.fontSize) > ${initial.size + 5}`)
    await view.evaluate("document.getElementById('fit').firstElementChild.textContent = 'Short'")
    await until('document.querySelector("#fit .slidev-auto-fit-text-inner").style.fontSize === "64px"')

    await view.navigate(new URL('?capture=1&steps=1#slide-2', server.url).href)
    await until('typeof window.presentationFitText === "function" && !document.getElementById("slide-2").hidden')
    await view.evaluate('window.presentationFitText(document.getElementById("slide-2"))')
    const capture = await measure('next-fit')
    expect(capture.size).toBeGreaterThan(12)
    expect(capture.width).toBeLessThanOrEqual(capture.available)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 30_000)
