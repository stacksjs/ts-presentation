// Adapted from Slidev's Toc, TitleRenderer, and slide counter components (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderPresentation } from '../packages/slidev/node/runtime/index.ts'

const deck = [
  '# Start **here**',
  '',
  `<Toc id="outline" columns="2" start="3" :list-class="['outline-list', 'chapters']" :list-style="['decimal', 'lower-alpha']" />`,
  '',
  '<TitleRenderer id="review-title" :no="3" />',
  '',
  '<p><SlideCurrentNo id="page" /> / <SlidesTotal id="total" /></p>',
  '',
  '---',
  '',
  '## Prepare [inputs](https://example.com/inputs)',
  '',
  '<Toc id="branch" mode="onlyCurrentTree" />',
  '',
  '<Toc id="siblings" mode="onlySiblings" />',
  '',
  '<Toc id="depth" minDepth="2" :max-depth="2" v-click />',
  '',
  '<TitleRenderer id="default-title" />',
  '',
  '---',
  'title: Export **review**',
  'level: 3',
  'routeAlias: export-review',
  'clicksStart: 2',
  '---',
  '# Alternate heading',
  '',
  '---',
  'hideInToc: true',
  '---',
  '## Private notes',
  '',
  '---',
  '',
  '### Omitted subsection',
  '',
  '---',
  '',
  '<!-- <h1>Heading in a comment</h1> -->',
  '<h2>Share <em>results</em></h2>',
  '',
  '---',
  '',
  '# Reference',
  '',
  '---',
  '',
  'A slide with no title.',
  '',
  '---',
  'disabled: true',
  '---',
  '# Draft',
].join('\n')

test('compiles accessible outlines with rich title labels and slide-local counters', async () => {
  const { html, routes } = await renderPresentation(parseDeck(deck))
  expect(routes.map(route => route.level)).toEqual([1, 2, 3, 2, 3, 2, 1, undefined])
  expect(routes[5].title).toBe('Share results')
  expect(routes.at(-1)?.untitled).toBe(true)
  expect(html).toContain('<span id="review-title">Export <strong>review</strong></span>')
  expect(html).toContain('<span id="default-title">Prepare inputs</span>')
  expect(html).toContain('<span id="page">1</span> / <span id="total">8</span>')
  expect(html).toContain('<nav id="outline" class="slidev-toc" style="column-count:2" aria-label="Contents">')
  expect(html).toContain('<ol class="outline-list chapters slidev-toc-list slidev-toc-list-level-1" start="3" style="list-style:decimal">')
  expect(html).toContain('<ol class="outline-list chapters slidev-toc-list slidev-toc-list-level-2" style="list-style:lower-alpha">')
  const contents = /<nav id="outline"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ''
  expect(contents).toContain('<a href="#slide-1" data-slide-link="1" aria-current="page">Start <strong>here</strong></a>')
  expect(contents).toContain('<a href="#slide-2" data-slide-link="2">Prepare inputs</a>')
  expect(contents).toContain('<a href="#slide-6" data-slide-link="6">Share <em>results</em></a>')
  expect(contents).not.toMatch(/Private notes|Omitted subsection|Slide 8|Draft/)
})

const chrome = await findChrome()
test.skipIf(!chrome)('navigates nested outlines with route aliases and refreshes titles across slides', async () => {
  const project = resolve(import.meta.dir, '..')
  const root = await mkdtemp(resolve(tmpdir(), 'presentation-outline-'))
  const source = resolve(root, 'slides.md')
  await Bun.write(source, deck)
  const server = Bun.spawn([process.execPath, 'src/cli.ts', 'dev', source, '--port', '0'], { cwd: project, stdout: 'pipe', stderr: 'pipe' })
  let view: Bun.WebView | undefined
  try {
    const start = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(start.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (!origin) throw new Error(await new Response(server.stderr).text())
    view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(`${origin}/?presenter=1#slide-2`)
    expect(await view.evaluate(`(() => {
      const nav = window.presentationNavigation
      const links = id => [...document.querySelectorAll('#' + id + ' a')].map(link => link.textContent)
      const [start] = nav.tocTree
      return {
        branch: links('branch'),
        siblings: links('siblings'),
        depth: links('depth'),
        depthShown: !document.querySelector('#depth').hasAttribute('data-reveal-hidden'),
        active: [start.activeParent, start.children[0].active, start.children[0].children[0].hasActiveParent],
      }
    })()`)).toEqual({
      branch: ['Start here', 'Prepare inputs', 'Export review'],
      siblings: ['Start here', 'Prepare inputs', 'Export review', 'Share results', 'Reference'],
      depth: ['Prepare inputs', 'Share results'],
      depthShown: false,
      active: [true, true, true],
    })
    expect(await view.evaluate(`(async () => {
      const nav = window.presentationNavigation
      nav.go(2, 1)
      const outline = document.querySelector('#depth')
      const deadline = performance.now() + 1000
      while (getComputedStyle(outline).visibility !== 'visible' && performance.now() < deadline)
        await new Promise(resolve => requestAnimationFrame(resolve))
      const visible = getComputedStyle(outline).visibility
      document.querySelector('#branch [data-slide-link="3"]').click()
      return [visible, nav.currentPage, nav.clicks, nav.mode, location.hash]
    })()`)).toEqual(['visible', 3, 2, 'presenter', '#export-review/2'])
    await view.evaluate('window.presentationNavigation.go(1)')
    await Bun.write(source, deck.replace('Export **review**', 'Verify **output**'))
    expect(await view.evaluate(`(async () => {
      for (let attempt = 0; attempt < 90; attempt++) {
        const title = document.querySelector('#review-title')
        if (title?.textContent === 'Verify output') return [title.innerHTML, window.presentationNavigation.currentPage]
        await new Promise(resolve => setTimeout(resolve, 75))
      }
      return [document.querySelector('#review-title')?.innerHTML, window.presentationNavigation.currentPage]
    })()`)).toEqual(['Verify <strong>output</strong>', 1])
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
