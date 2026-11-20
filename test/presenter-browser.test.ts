import { expect, test } from 'bun:test'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { defaultCanvas } from '../packages/types/src/canvas.ts'

const chrome = await findChrome()
const project = resolve(import.meta.dir, '..')
const browserTestTimeout = 150_000
const fixture = '# Intro\n\n<!-- Introduce the subject. -->\n\n---\nrouteAlias: review\nsection: body\nclicksStart: 1\nclicks: 3\n---\n\n# Review\n\n<div v-click>One</div>\n<div v-click>Two</div>\n<div v-click>Three</div>\n\n<!-- Review the work.\n[click]\nFirst note.\n[click]\nSecond note.\n[click]\nFinal note.\n-->\n\n---\n\n# Last slide\n'

function cli(...args: string[]) {
  return Bun.spawn([process.execPath, 'src/cli.ts', ...args], {
    cwd: project, stdout: 'pipe', stderr: 'pipe', timeout: browserTestTimeout - 10_000,
  })
}

async function serverOrigin(server: ReturnType<typeof cli>): Promise<string> {
  const reader = server.stdout.getReader()
  const decoder = new TextDecoder()
  let output = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error((await new Response(server.stderr).text()).trim() || 'The presentation server exited before printing its address')
      output += decoder.decode(chunk.value, { stream: true })
      const origin = /http:\/\/127\.0\.0\.1:\d+\//.exec(output)?.[0]
      if (origin) return new URL(origin).origin
    }
  }
  finally {
    reader.releaseLock()
  }
}

// Adapted from cypress/e2e/examples/presenter-resizer.spec.ts. Also
// exercises the real slide-local browser context from useNav.test.ts.
test.skipIf(!chrome)('presenter previews the next reveal and keeps all three layouts resizable', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-layout-'))
  const source = resolve(root, 'slides.md')
  await Bun.write(source, fixture)
  const server = cli('dev', source, '--port', '0')
  let view: Bun.WebView | undefined
  try {
    const origin = await serverOrigin(server)
    view = new Bun.WebView({ width: 900, height: 1200, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(origin + '/presenter/review?clicks=1')
    const state = () => view!.evaluate<{ slide: number, click: number, mode: string, frontmatter: string, previewClick: number, previewMode: string, previewSlide: number }>(`(async () => {
      const frame = document.querySelector('#presenter-preview iframe')
      const deadline = performance.now() + 15_000
      while (!frame.contentWindow?.presentationNavigation && performance.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 25))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const nav = window.presentationNavigation
      const preview = frame.contentWindow.presentationNavigation
      if (!preview) throw new Error('Presenter preview did not finish loading')
      return { slide: nav.currentPage, click: nav.clicks, mode: nav.mode, frontmatter: nav.currentFrontmatter.section,
        previewClick: preview.clicks, previewMode: preview.mode, previewSlide: preview.currentPage }
    })()`)
    expect(await state()).toEqual({ slide: 2, click: 1, mode: 'presenter', frontmatter: 'body', previewClick: 2, previewMode: 'preview', previewSlide: 2 })

    const layout = (number: number) => view!.evaluate(`(() => {
      const chooser = document.querySelector('#presenter-layout')
      chooser.value = '${number}'
      chooser.dispatchEvent(new Event('change'))
    })()`)
    const sizes = () => view!.evaluate<Record<'notes' | 'stage' | 'preview' | 'width' | 'height', { x: number, y: number, height: number, width: number }>>(`(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON()
      return { notes: box('#presenter-notes'), stage: box('#stage'), preview: box('#presenter-preview'),
        width: box('#presenter-width'), height: box('#presenter-height') }
    })()`)
    const tall = await sizes()
    expect(tall.stage.y).toBeLessThan(tall.notes.y)
    expect(tall.notes.x).toBeLessThan(tall.preview.x)
    expect(tall.width.height).toBe(tall.notes.height)
    await view.cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
    const wide = await sizes()
    expect(wide.stage.x).toBeLessThan(wide.notes.x)
    expect(wide.width.height).toBe(wide.stage.height)
    expect(wide.preview.y).toBeLessThan(wide.notes.y)

    await layout(2)
    const second = await sizes()
    expect(second.notes.x).toBeLessThan(second.stage.x)
    expect(second.stage.y).toBeLessThan(second.preview.y)
    expect(second.height.width).toBe(second.stage.width)
    const x = second.width.x + second.width.width / 2
    const y = second.width.y + 90
    await view.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await view.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 70, y, button: 'left', buttons: 1 })
    await view.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 70, y, button: 'left', buttons: 0, clickCount: 1 })
    expect((await sizes()).notes.width).toBe(second.notes.width + 70)

    await layout(3)
    const third = await sizes()
    expect(third.notes.y).toBeLessThan(third.stage.y)
    expect(third.width.height).toBe(third.preview.height)
    await view.evaluate(`(() => {
      const handle = document.querySelector('#presenter-height')
      handle.focus()
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })()`)
    expect((await sizes()).notes.height).toBe(third.notes.height + 16)
    expect(await view.evaluate("document.body.style.getPropertyValue('--presenter-height')")).toBe('296px')

    await view.evaluate(`(() => {
      const seek = document.querySelector('#presenter-seek')
      seek.value = '3'
      seek.dispatchEvent(new Event('input'))
    })()`)
    expect(await state()).toEqual({ slide: 2, click: 3, mode: 'presenter', frontmatter: 'body', previewClick: 0, previewMode: 'preview', previewSlide: 3 })
    expect(await view.evaluate("document.querySelector('#presenter-notes section:not([hidden]) div[data-note-step=\"3\"]').hidden")).toBe(false)

    await view.navigate(origin + '/?presenter=1&resume=1#review/3')
    expect(await view.evaluate("document.body.dataset.presenterLayout")).toBe('3')
    expect((await sizes()).notes.width).toBe(third.notes.width)
    await view.cdp('Emulation.setDeviceMetricsOverride', { width: 415, height: 900, deviceScaleFactor: 1, mobile: false })
    const phone = await sizes()
    expect(phone.preview.y).toBeGreaterThan(phone.notes.y)
    expect(phone.width.height).toBe(0)

    await view.navigate(origin + '/export/review?clicks=2')
    expect(await view.evaluate("(() => { const nav = window.presentationNavigation; return [nav.mode, nav.currentPage, nav.clicks, nav.tocTree[1].active] })()")).toEqual(['export', 2, 2, true])
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, browserTestTimeout)

test.skipIf(!chrome)('CLI exports only the authored reveal range for a slide', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-steps-'))
  try {
    const source = resolve(root, 'slides.md')
    const output = resolve(root, 'frames')
    await Bun.write(source, fixture)
    const command = cli('export', source, '--range', '2', '--with-clicks', '--format', 'png', '--out', output)
    const [status, errors] = await Promise.all([command.exited, new Response(command.stderr).text()])
    if (status) throw new Error(errors.trim() || `Export command exited with status ${status}`)
    expect((await readdir(output)).sort()).toEqual(['slide-1.png', 'slide-2.png', 'slide-3.png'])
    const images = await Promise.all([1, 2, 3].map(step => Bun.file(resolve(output, 'slide-' + step + '.png')).bytes()))
    expect(new Set(images.map(image => Bun.hash(image))).size).toBe(3)
    for (const image of images) {
      const header = new DataView(image.buffer, image.byteOffset, image.byteLength)
      expect([header.getUint32(16), header.getUint32(20)]).toEqual([defaultCanvas.width, defaultCanvas.height])
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, browserTestTimeout)

// Adapted from cypress/e2e/examples/base-path.spec.ts and basic.spec.ts.
test.skipIf(!chrome)('keeps keyboard navigation and the presenter window under the built deck path', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-base-'))
  const output = resolve(root, 'site')
  const source = resolve(root, 'slides.md')
  let view: Bun.WebView | undefined
  let site: ReturnType<typeof Bun.serve> | undefined
  try {
    await Bun.write(source, fixture)
    const build = cli('build', source, '--out', output)
    const [status, errors] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(errors.trim() || `Build command exited with status ${status}`)
    const siteRoot = await realpath(output)
    site = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === '/training/deck/') return asset(siteRoot, '/index.html')
        if (path.startsWith('/training/deck/')) return asset(siteRoot, path.slice('/training/deck'.length))
        return new Response(null, { status: 404 })
      },
    })
    const browser = new Bun.WebView({ width: 1080, height: 720, backend: { type: 'chrome', path: chrome!, url: false } })
    view = browser
    await browser.navigate(new URL('/training/deck/#/1', site.url).href)
    expect(await browser.evaluate('window.presentationNavigation?.currentPage')).toBe(1)
    const keypress = (key: string) => browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, cancelable: true }))`)
    const location = () => browser.evaluate<string>('window.location.pathname + window.location.hash')
    await keypress('ArrowRight')
    expect(await location()).toBe('/training/deck/#review/1')
    await keypress('ArrowRight')
    expect(await location()).toBe('/training/deck/#review/2')
    await keypress('ArrowDown')
    expect(await location()).toBe('/training/deck/#slide-3')
    await keypress('ArrowLeft')
    expect(await location()).toBe('/training/deck/#review/3')
    await keypress('ArrowUp')
    expect(await location()).toBe('/training/deck/#slide-1')

    const target = await browser.evaluate<{ x: number, y: number }>(`(() => {
      const open = window.open
      window.open = (...args) => {
        window.open = open
        return window.testPresenter = open.apply(window, args)
      }
      const button = document.querySelector('#presenter').getBoundingClientRect()
      return { x: button.left + button.width / 2, y: button.top + button.height / 2 }
    })()`)
    await browser.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...target, button: 'left', buttons: 1, clickCount: 1 })
    await browser.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', buttons: 0, clickCount: 1 })
    const popup = await browser.evaluate<{ path: string, mainPage: number, mainClick: number, presenterPage: number, presenterClick: number, isOpen: boolean }>(`(async () => {
      const presenter = window.testPresenter
      if (!presenter) throw new Error('The browser did not open a presenter window')
      const waitUntil = async (condition, message) => {
        const deadline = performance.now() + 15_000
        while (performance.now() < deadline) {
          if (condition()) return
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error(message)
      }
      try {
        await waitUntil(() => presenter.presentationNavigation?.mode === 'presenter', 'Presenter window did not finish loading')
        presenter.presentationNavigation.go('review', 2)
        await waitUntil(() => window.presentationNavigation.currentPage === 2 && window.presentationNavigation.clicks === 2, 'Audience missed the presenter update')
        window.presentationNavigation.next()
        await waitUntil(() => presenter.presentationNavigation.clicks === 3, 'Presenter missed the audience update')
        return { path: presenter.location.pathname, mainPage: window.presentationNavigation.currentPage,
          mainClick: window.presentationNavigation.clicks, presenterPage: presenter.presentationNavigation.currentPage,
          presenterClick: presenter.presentationNavigation.clicks, isOpen: !presenter.closed }
      }
      finally { presenter.close() }
    })()`)
    expect(popup).toEqual({ path: '/training/deck/', mainPage: 2, mainClick: 3, presenterPage: 2, presenterClick: 3, isOpen: true })
  }
  finally {
    view?.close()
    await site?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, browserTestTimeout)
