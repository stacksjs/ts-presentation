import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'

const chrome = await findChrome()
const deck = [
  '# Introduction',
  '',
  '<RenderWhen context="overview">',
  '<p id="overview-copy">Thumbnail-only content</p>',
  '<template #fallback><p id="audience-copy">Audience content</p></template>',
  '</RenderWhen>',
  '',
  '---',
  'routeAlias: details',
  '---',
  '# Details',
  '',
  '<p id="reveal" v-click>Revealed detail</p>',
  '',
  '<!-- First note.',
  '[click]',
  'Second note. -->',
  '',
  '---',
  '',
  '# Conclusion',
].join('\n')

// Exercises the quick overview and standalone view using the same local deck.
test.skipIf(!chrome)('renders actual thumbnails, selects slides from the dialog, and scrubs standalone steps', async () => {
  const project = resolve(import.meta.dir, '..')
  const directory = await mkdtemp(resolve(tmpdir(), 'presentation-overview-'))
  const source = resolve(directory, 'slides.md')
  await Bun.write(source, deck)
  const server = Bun.spawn([process.execPath, 'src/cli.ts', 'dev', source, '--port', '0'], { cwd: project, stdout: 'pipe', stderr: 'pipe' })
  let view: Bun.WebView | undefined
  try {
    const start = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(start.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (!origin) throw new Error(await new Response(server.stderr).text())
    view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(`${origin}/presenter/details?clicks=1`)
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', cancelable: true }))`)
    expect(await view.evaluate(`(async () => {
      const modal = document.querySelector('#overview')
      const frame = modal.querySelector('iframe')
      const isScaled = (thumbnail) => {
        const width = thumbnail?.querySelector('article')?.getBoundingClientRect().width
        return width > 0 && Math.abs(width - thumbnail.getBoundingClientRect().width) < 1
      }
      for (let attempt = 0; attempt < 80; attempt++) {
        const child = frame.contentDocument
        const thumbnail = child?.querySelector('.overview-thumbnail')
        if (child?.querySelector('[aria-current="page"]') && isScaled(thumbnail)) break
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const child = frame.contentDocument
      const thumbnail = child.querySelector('.overview-thumbnail')
      const slide = thumbnail.querySelector('article')
      return [
        modal.open, modal.querySelectorAll('iframe').length, child.querySelectorAll('.overview-card').length,
        frame.contentWindow.presentationNavigation.mode, !!child.querySelector('#overview-copy'),
        !child.querySelector('#audience-copy'), !!document.querySelector('#audience-copy'),
        child.querySelector('[aria-current="page"]').dataset.overviewSlide,
        child.querySelector('.overview-notes') === null,
        slide.inert && isScaled(thumbnail),
      ]
    })()`)).toEqual([true, 1, 3, 'overview', true, true, true, '2', true, true])

    expect(await view.evaluate(`(async () => {
      const modal = document.querySelector('#overview')
      const frame = modal.querySelector('iframe')
      const child = frame.contentDocument
      const selected = child.querySelector('[aria-current="page"]')
      selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
      const focused = child.activeElement.dataset.overviewSlide
      selected.click()
      for (let attempt = 0; attempt < 40 && modal.open; attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      const nav = window.presentationNavigation
      return [focused, modal.open, nav.currentPage, nav.clicks, nav.mode]
    })()`)).toEqual(['1', false, 2, 1, 'presenter'])

    await view.evaluate('document.querySelector("#overview-button").click()')
    expect(await view.evaluate(`(async () => {
      const modal = document.querySelector('#overview')
      const frame = modal.querySelector('iframe')
      for (let attempt = 0; attempt < 80 && !frame.contentDocument?.querySelector('[data-overview-slide="1"]'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      frame.contentDocument.querySelector('[data-overview-slide="1"]').click()
      for (let attempt = 0; attempt < 40 && modal.open; attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      return [modal.open, window.presentationNavigation.currentPage, location.hash]
    })()`)).toEqual([false, 1, '#slide-1'])

    await view.evaluate(`document.querySelector('#overview-button').click()`)
    await view.evaluate(`(async () => {
      const frame = document.querySelector('#overview iframe')
      const deadline = performance.now() + 5000
      while (!frame.contentDocument?.querySelector('[data-overview-slide="1"]') && performance.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 25))
      const overview = frame.contentDocument
      overview.querySelector('#stage').style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))'
      overview.querySelector('[data-overview-slide="1"]').focus()
    })()`)
    const focusedSlide = () => view!.evaluate("document.querySelector('#overview iframe').contentDocument.activeElement.dataset.overviewSlide")
    await view.press('ArrowRight')
    expect(await focusedSlide()).toBe('2')
    await view.press('ArrowLeft')
    await view.press('ArrowDown')
    expect(await focusedSlide()).toBe('3')
    await view.press('ArrowUp')
    expect(await focusedSlide()).toBe('1')
    await view.press('ArrowDown')
    await view.press('Enter')
    expect(await view.evaluate(`(async () => {
      const modal = document.querySelector('#overview')
      for (let attempt = 0; attempt < 40 && modal.open; attempt++)
        await new Promise(resolve => setTimeout(resolve, 25))
      return [modal.open, window.presentationNavigation.currentPage]
    })()`)).toEqual([false, 3])

    await view.navigate(`${origin}/overview#details`)
    expect(await view.evaluate(`(() => {
      const nav = window.presentationNavigation
      const reveal = document.querySelector('#reveal')
      const card = reveal.closest('.overview-card')
      const slider = card.querySelector('input[type="range"]')
      const notes = () => [...card.querySelectorAll('[data-note-step]:not([hidden])')].map(note => note.textContent.trim())
      const end = [reveal.hasAttribute('data-reveal-hidden'), slider.value, notes()]
      slider.value = '0'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      const start = [reveal.hasAttribute('data-reveal-hidden'), slider.value, notes()]
      const path = new URL(card.querySelector('[data-overview-slide]').href)
      return [nav.mode, nav.currentPage, nav.currentPath, end, start, path.search, path.hash]
    })()`)).toEqual([
      'overview', 2, '/overview',
      [false, '1', ['First note.', 'Second note.']],
      [true, '0', ['First note.']],
      '', '#details',
    ])

    await Bun.write(source, deck.replace('Thumbnail-only content', 'Updated thumbnail'))
    expect(await view.evaluate(`(async () => {
      for (let attempt = 0; attempt < 60 && document.querySelector('#overview-copy')?.textContent !== 'Updated thumbnail'; attempt++)
        await new Promise(resolve => setTimeout(resolve, 75))
      return [document.querySelector('#overview-copy')?.textContent, document.querySelector('#reveal').closest('.overview-card').querySelector('input').value]
    })()`)).toEqual(['Updated thumbnail', '0'])
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)
