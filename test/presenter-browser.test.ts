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

test.skipIf(!chrome)('starts, pauses, resumes, and resets the presenter timer across subpath views', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-timer-'))
  const source = resolve(root, 'slides.md')
  await Bun.write(source, '---\nduration: 3s\ntimer: countdown\n---\n\n' + fixture)
  const server = cli('dev', source, '--port', '0', '--base', '/rehearsal/')
  let view: Bun.WebView | undefined
  try {
    const base = await serverOrigin(server) + '/rehearsal/'
    const presenter = base + 'presenter/review'
    view = new Bun.WebView({ width: 940, height: 750, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(presenter + '?clicks=1')
    const openNotes = () => view!.evaluate(`(async () => {
      const frame = document.createElement('iframe')
      frame.hidden = true
      frame.id = 'timing-notes'
      frame.src = document.querySelector('#presenter-notes-link').href
      const ready = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
      document.body.append(frame)
      await ready
      window.testTime = 1700000000000
      Date.now = frame.contentWindow.Date.now = () => window.testTime
      return getComputedStyle(frame.contentDocument.querySelector('#presenter-timer-toggle')).display
    })()`)
    const verify = (status: string, text: string, value: number, pacing = 'in-budget') =>
      view!.evaluate<unknown[]>(`(async () => {
        const docs = [document, document.querySelector('#timing-notes').contentDocument]
        const read = doc => {
          const timing = doc.querySelector('#presenter-timing')
          const progress = doc.querySelector('#presenter-time-progress')
          return [timing.dataset.timerStatus, doc.querySelector('#presenter-time').textContent,
            progress.value, timing.dataset.timerPacing]
        }
        const expected = ${JSON.stringify([status, text, value, pacing])}
        for (let attempt = 0; attempt < 100; attempt++) {
          const states = docs.map(read)
          if (states.every(state => JSON.stringify(state) === JSON.stringify(expected))) return states
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        return docs.map(read)
      })()`).then(states => expect(states).toEqual([[status, text, value, pacing], [status, text, value, pacing]]))
    expect(await openNotes()).toBe('none')
    await verify('stopped', '0:03', 0)
    expect(await view.evaluate("document.getElementById('presenter-time').getAttribute('aria-label')")).toBe('Time remaining')
    await view.evaluate("document.getElementById('presenter-timer-toggle').focus()")
    await view.press('Enter')
    await verify('running', '0:03', 0)
    await view.evaluate('window.testTime += 1250')
    await verify('running', '0:02', 1250)
    await view.press('Enter')
    await verify('paused', '0:02', 1250)
    await view.evaluate('window.testTime += 9000')
    expect(await view.evaluate('window.presentationNavigation.clicks')).toBe(1)
    await view.press('ArrowRight')
    expect(await view.evaluate('window.presentationNavigation.clicks')).toBe(2)
    await verify('paused', '0:02', 1250)

    await view.navigate(base + 'presenter/2?clicks=2')
    await openNotes()
    await verify('paused', '0:02', 1250)
    await view.evaluate("document.getElementById('presenter-timer-toggle').click()")
    await view.evaluate('window.testTime += 1300')
    await verify('running', '0:01', 2550, 'near-limit')
    await view.evaluate('window.testTime += 2750')
    await verify('running', '-0:02', 3000, 'overtime')
    await view.evaluate("document.getElementById('presenter-reset').click()")
    await verify('stopped', '0:03', 0)

    await Bun.write(source, '---\nduration: invalid\n---\n\n' + fixture)
    await view.navigate(base + 'presenter')
    expect(await view.evaluate(`[
      document.getElementById('presenter-time').textContent,
      document.getElementById('presenter-time').getAttribute('aria-label'),
      document.getElementById('presenter-time-progress').max,
    ]`)).toEqual(['0:00', 'Elapsed time', 1800000])
    expect(await view.evaluate(`(() => {
      let now = 1700000000000
      Date.now = () => now
      const button = document.getElementById('presenter-timer-toggle')
      button.click()
      now += 3661000
      button.click()
      return [document.getElementById('presenter-time').textContent, button.textContent]
    })()`)).toEqual(['1:01:01', 'Resume'])
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
    await Bun.write(source, fixture.replace('# Intro', '# Intro\n\n<input id="keyboard-input" aria-label="Keyboard input">'))
    await Bun.write(resolve(root, 'setup/shortcuts.ts'), `
import { defineShortcutsSetup } from 'ts-presentation'
export default defineShortcutsSetup((nav, base) => [
  ...base,
  { key: 'Alt+j', fn: nav.goLast },
  { key: 'Enter', fn: nav.next, autoRepeat: true },
  { key: 'Backspace', fn: nav.prev },
  { key: 'Ctrl+d', fn: nav.toggleDark },
  { key: 'End', fn: nav.goFirst },
])
`)
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
    const keypress = (key: string, options: KeyboardEventInit = {}, target = 'document.body') =>
      browser.evaluate<boolean>(`${target}.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...options })}))`)
    const location = () => browser.evaluate<string>('window.location.pathname + window.location.hash')
    expect(await keypress('Enter', {}, 'document.querySelector("#keyboard-input")')).toBe(true)
    expect(await keypress('Enter', {}, 'document.querySelector("#presenter")')).toBe(true)
    expect(await browser.evaluate('window.presentationNavigation.currentPage')).toBe(1)
    expect(await keypress('j')).toBe(true)
    expect(await keypress('∆', { altKey: true, code: 'KeyJ' })).toBe(false)
    expect(await location()).toBe('/training/deck/#slide-3')
    await keypress('End')
    expect(await location()).toBe('/training/deck/#slide-1')
    await keypress('Enter')
    expect(await location()).toBe('/training/deck/#review/1')
    await keypress('Enter', { repeat: true })
    expect(await location()).toBe('/training/deck/#review/2')
    await keypress('Backspace', { repeat: true })
    expect(await location()).toBe('/training/deck/#review/2')
    await keypress('Backspace')
    expect(await location()).toBe('/training/deck/#review/1')
    await keypress(' ', { shiftKey: true })
    expect(await location()).toBe('/training/deck/#slide-1')
    await keypress('d', { ctrlKey: true })
    expect(await browser.evaluate('document.documentElement.classList.contains("light")')).toBe(true)
    await keypress('ArrowRight', { shiftKey: true })
    expect(await location()).toBe('/training/deck/#review/1')
    await keypress('Home')
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

// Adapted from Slidev's cypress/e2e/examples/smoke.spec.ts (MIT).
test.skipIf(!chrome)('walks every reveal in play and presenter views and opens the entry, overview, and live notes pages', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-route-smoke-'))
  const source = resolve(root, 'slides.md')
  await Bun.write(source, fixture)
  const base = '/talk/'
  const server = cli('dev', source, '--port', '0', '--base', base, '--router-mode', 'history')
  let view: Bun.WebView | undefined
  try {
    const rootUrl = await serverOrigin(server) + base
    view = new Bun.WebView({ width: 990, height: 730, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate('about:blank')
    await view.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.smokeErrors = [];
        window.addEventListener('error', event => { if (event.message) window.smokeErrors.push(event.message) });
        window.addEventListener('unhandledrejection', event => window.smokeErrors.push(String(event.reason)));`,
    })
    await view.navigate(rootUrl + 'entry')
    const links = await view.evaluate<string[]>(`[...document.querySelectorAll('#deck-entry:not([hidden]) a')].map(link => link.href)`)
    expect(links).toEqual(['1', 'presenter/1', 'notes', 'overview'].map(path => rootUrl + path))
    expect(await view.evaluate("document.querySelector('#deck-entry h1').textContent")).toBe('Intro')
    expect(await view.evaluate('window.smokeErrors')).toEqual([])

    const position = () => view!.evaluate<[number, number, string]>(`(() => {
      const nav = window.presentationNavigation
      return [nav.currentPage, nav.clicks, nav.mode]
    })()`)
    for (const [url, mode] of [[links[0], 'slide'], [links[1], 'presenter']]) {
      await view.navigate(url)
      expect(await position()).toEqual([1, 0, mode])
      for (const [slide, click] of [[2, 1], [2, 2], [2, 3], [3, 0], [3, 0]]) {
        await view.press('ArrowRight')
        expect(await position()).toEqual([slide, click, mode])
      }
      expect(await view.evaluate('window.smokeErrors')).toEqual([])
    }

    await view.navigate(links[3])
    expect(await position()).toEqual([1, 0, 'overview'])
    expect(await view.evaluate("document.querySelectorAll('.overview-card').length")).toBe(3)
    expect(await view.evaluate('window.smokeErrors')).toEqual([])

    await view.navigate(rootUrl + 'presenter/review?clicks=1')
    const openNotes = async () => view!.evaluate(`(async () => {
      document.querySelector('#smoke-notes')?.remove()
      const notes = document.createElement('iframe')
      notes.id = 'smoke-notes'
      notes.src = ${JSON.stringify(links[2])}
      notes.hidden = true
      const loaded = new Promise(resolve => notes.addEventListener('load', resolve, { once: true }))
      document.body.append(notes)
      await loaded
      return notes.contentWindow.presentationNavigation.mode
    })()`)
    const notesState = () => view!.evaluate(`(async () => {
      const frame = document.querySelector('#smoke-notes')
      const contents = frame.contentDocument
      const nav = window.presentationNavigation
      for (let attempt = 0; attempt < 80 && (frame.contentWindow.presentationNavigation.clicks !== nav.clicks ||
        frame.contentWindow.presentationNavigation.currentPage !== nav.currentPage); attempt++)
        await new Promise(resolve => setTimeout(resolve, 15))
      const notes = frame.contentWindow.presentationNavigation
      const visible = [...contents.querySelectorAll('#presenter-notes section:not([hidden]) [data-note-step]:not([hidden])')]
      return [notes.currentPage, notes.clicks, contents.querySelector('#notes-position').textContent,
        visible.map(note => note.textContent.trim()), frame.contentWindow.smokeErrors]
    })()`)
    expect(await view.evaluate("document.querySelector('#presenter-notes-link').href")).toBe(links[2])
    expect(await openNotes()).toBe('notes')
    expect(await notesState()).toEqual([2, 1, 'Slide 2 of 3 · Reveal 1 of 3', ['Review the work.', 'First note.'], []])
    await view.press('ArrowRight')
    expect(await notesState()).toEqual([2, 2, 'Slide 2 of 3 · Reveal 2 of 3', ['Review the work.', 'First note.', 'Second note.'], []])
    expect(await view.evaluate(`(() => {
      const notes = document.querySelector('#smoke-notes').contentDocument
      const panel = notes.querySelector('#presenter-notes')
      const initial = panel.style.getPropertyValue('--notes-font-size')
      notes.querySelector('#notes-larger').click()
      return [initial, panel.style.getPropertyValue('--notes-font-size'), notes.querySelector('#stage').hidden]
    })()`)).toEqual(['22px', '24px', true])
    await Bun.write(source, fixture.replace('Second note.', 'Revised note.'))
    expect(await view.evaluate(`(async () => {
      const notes = document.querySelector('#smoke-notes')
      const active = () => notes.contentDocument.querySelector('#presenter-notes section:not([hidden])')
      for (let attempt = 0; attempt < 200 && !active()?.textContent.includes('Revised note.'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 20))
      return active()?.querySelector('[data-note-step="2"]:not([hidden])')?.textContent.trim()
    })()`)).toBe('Revised note.')
    await view.press('ArrowDown')
    expect(await notesState()).toEqual([3, 0, 'Slide 3 of 3', ['No speaker notes for this slide.'], []])
    expect(await openNotes()).toBe('notes')
    expect(await view.evaluate("document.querySelector('#smoke-notes').contentDocument.querySelector('#presenter-notes').style.getPropertyValue('--notes-font-size')")).toBe('24px')
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, browserTestTimeout)
