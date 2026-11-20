// Adapted from Slidev's cypress/e2e/examples/iframe-layout.spec.ts (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asset } from '../../slidev/node/runtime/assets.ts'
import { findChrome } from '../../slidev/node/runtime/chrome.ts'

const chrome = await findChrome()
const source = `---
layout: iframe
url: /frame.html
---

---
layout: iframe-left
url: /frame.html
scale: 0.5
---

# Left split

---
layout: iframe-right
url: /frame.html
scale: 2
---

# Right split
`

test.skipIf(!chrome)('lays out STX iframes at the displayed size when enlarged and at design size when shrunk', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-iframe-layout-'))
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    const entry = join(root, 'slides.md')
    const cli = fileURLToPath(new URL('../../slidev/node/cli.ts', import.meta.url))
    await Bun.write(entry, source)
    await Bun.write(join(root, 'public/frame.html'), '<!doctype html><title>Frame layout test</title><canvas></canvas>')
    const result = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [exit, stderr] = await Promise.all([result.exited, new Response(result.stderr).text()])
    if (exit) throw new Error(stderr || 'Could not build the iframe deck')
    const output = await realpath(join(root, 'dist'))
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        return asset(output, path === '/' ? '/index.html' : path, request)
      },
    })
    view = new Bun.WebView({ width: 1920, height: 1080, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate('data:text/html,<title>Iframe test</title>')
    await view.cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
    await view.navigate(new URL('?preview=1', server.url).href)
    const requestGeometry = (selector = '#stage article:not([hidden])') => view!.evaluate<{
      layout: number
      displayed: number
      panel: number
      inner: number
    }>(`(async () => {
      const frame = document.querySelector(${JSON.stringify(selector)} + ' .layout-frame iframe')
      const deadline = performance.now() + 5000
      while (frame?.contentDocument?.title !== 'Frame layout test' && performance.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 25))
      if (!frame || frame.contentDocument?.title !== 'Frame layout test') throw new Error('The embedded page did not load at ' + location.href)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return {
        layout: frame.offsetWidth,
        displayed: frame.getBoundingClientRect().width,
        panel: frame.parentElement.getBoundingClientRect().width,
        inner: frame.contentWindow.innerWidth,
      }
    })()`)

    const enlarged = await requestGeometry()
    expect(enlarged.displayed).toBeCloseTo(1920)
    expect(enlarged.layout).toBeCloseTo(enlarged.displayed)
    expect(enlarged.inner).toBe(enlarged.layout)

    for (const [slide, scale] of [[2, 0.5], [3, 2]]) {
      await view.evaluate(`window.presentationNavigation.go(${slide})`)
      const split = await requestGeometry()
      expect(split.displayed).toBeCloseTo(split.panel, 0)
      expect(split.displayed).toBeLessThan(960)
      expect(Math.abs(split.layout * scale - split.displayed)).toBeLessThanOrEqual(1)
      expect(split.inner).toBe(split.layout)
    }
    await view.evaluate('window.presentationNavigation.go(1)')
    await view.cdp('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false })
    const reduced = await requestGeometry()
    expect(reduced.displayed).toBeCloseTo(480)
    expect(reduced.layout).toBe(960)
    expect(reduced.inner).toBe(960)

    await view.cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
    await view.navigate(new URL('?overview=1', server.url).href)
    const overview = await requestGeometry('#slide-1')
    expect(overview.displayed).toBeLessThan(960)
    expect(overview.inner).toBe(960)

    await view.navigate(new URL('?preview=1', server.url).href)
    await view.cdp('Emulation.setEmulatedMedia', { media: 'print' })
    const printed = await requestGeometry('#slide-1')
    expect(printed.displayed).toBeCloseTo(960)
    expect(printed.inner).toBe(960)
  }
  finally {
    view?.close()
    await server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
