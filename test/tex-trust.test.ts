// Command examples and trust contexts adapted from the KaTeX reference (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultCanvas } from '../packages/types/src/canvas.ts'
import { captureFrames } from '../packages/slidev/node/runtime/capture.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import type { KatexTrustContext } from '../packages/slidev/node/runtime/authoring-setup.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'
import { createMathRenderer } from '../packages/slidev/node/runtime/math.ts'
import { createPowerPoint } from '../packages/slidev/node/runtime/powerpoint.ts'
import type { PowerPointFrame } from '../packages/slidev/node/runtime/powerpoint.ts'

const markup = (value: string) => value.split('<annotation')[0]

test('shows blocked math commands with the configured error color by default', () => {
  const render = createMathRenderer({ errorColor: '#911', throwOnError: true })
  const html = markup(render(String.raw`\href{https://example.com}{x} \url{#agenda} \includegraphics{/badge.svg}
    \htmlClass{proof}{x} \htmlId{result}{x} \htmlStyle{color:red}{x} \htmlData{kind=total}{x}`, false))
  expect(html.match(/class="math-untrusted" style="color:#911"/g)).toHaveLength(7)
  expect(html).not.toMatch(/<a |<img |id="result"|data-kind="total"/)
})

test('checks command-level trust with URL protocols and escaped attribute values', () => {
  const contexts: KatexTrustContext[] = []
  const render = createMathRenderer({
    trust(context) {
      contexts.push(context)
      return context.command === '\\href' || context.command === '\\htmlClass' || context.command === '\\htmlData'
    },
    throwOnError: true,
  })
  const html = markup(render(String.raw`\href{https://example.com/a%20b?q=x_y&n=2}{\frac{2}{3}}
    \htmlClass{proof}{x} \htmlData{label=a{,}b,kind=x=y}{z} \url{#details} \htmlStyle{color:red}{v}`, true))
  expect(html).toContain('<a href="https://example.com/a%20b?q=x_y&amp;n=2"><math displaystyle="true">')
  expect(html).toContain('<mfrac>')
  expect(html).toContain('<mrow class="proof">')
  expect(html).toContain('<mrow data-label="a,b" data-kind="x=y">')
  expect(html.match(/class="math-untrusted"/g)).toHaveLength(2)
  expect(contexts).toEqual([
    { command: '\\href', url: 'https://example.com/a%20b?q=x_y&n=2', protocol: 'https' },
    { command: '\\htmlClass', class: 'proof' },
    { command: '\\htmlData', attributes: { 'data-label': 'a,b', 'data-kind': 'x=y' } },
    { command: '\\url', url: '#details', protocol: '_relative' },
    { command: '\\htmlStyle', style: 'color:red' },
  ])
})

test('renders linked labels, math attributes, and images with native markup', () => {
  const render = createMathRenderer({ trust: true, throwOnError: true })
  const html = markup(render(String.raw`\text{See \url{mailto:review@example.com}.}
    \href{#review}{\url{#review}} \includegraphics[width=16,height=1em,totalheight=1.5em,alt=A "badge"]{/badge.svg?v=2}
    \htmlId{total}{\htmlStyle{color:blue}{X}}`, false))
  expect(html).toContain('<a href="mailto:review@example.com">mailto:review@example.com</a>')
  expect(html.match(/href="#review"/g)).toHaveLength(1)
  expect(html).toContain('<img src="/badge.svg?v=2" alt="A &quot;badge&quot;" style="height:1.5em;width:16pt;vertical-align:calc(1em - 1.5em)">')
  expect(html).toContain('<mrow id="total">')
  expect(html).toContain('<mrow style="color:blue">')
  const defaults = markup(render(String.raw`\includegraphics{./mark.svg} \url{ftp://example.com/inactive}`, false))
  expect(defaults).toContain('<img src="./mark.svg" alt="mark" style="height:0.9em">')
  expect(defaults).toContain('class="math-untrusted"')
  expect(defaults).not.toContain('href="ftp:')
})

test('expands URL macros and keeps TeX comments outside URL arguments', () => {
  const render = createMathRenderer({ trust: true, throwOnError: true })
  const html = markup(render(String.raw`\def\link#1{\href{#1}{x}}\link{https://example.com/a\%20b}
    \url{/another%20address} % outside the address
    + y`, false))
  expect(html).toContain('href="https://example.com/a%20b"')
  expect(html).toContain('href="/another%20address"')
  expect(html).toContain('<mo>+</mo><mi>y</mi>')
  expect(html).not.toContain('outside the address')
})

test('parses empty and single-token URLs without treating a literal percent as a comment', () => {
  const render = createMathRenderer({ trust: true, throwOnError: true, strict: true })
  const html = markup(render(String.raw`\href %end \url%z \href{}{x}\url{/path\^y}`, false))
  expect(html).toContain('<a href="%"><math displaystyle="false"><mrow><mi>e</mi></mrow></math></a></mtext><mi>n</mi><mi>d</mi>')
  expect(html).toContain('<a href="%">%</a></mtext><mi>z</mi>')
  expect(html).toContain('<a href=""><math displaystyle="false"><mrow><mrow><mi>x</mi></mrow></mrow></math></a>')
  expect(html).toContain('<a href="/path^y">/path^y</a>')
  expect(markup(render('\\url%%comment\n', false))).toContain('<a href="%">%</a>')
  expect(markup(createMathRenderer({ throwOnError: true })(String.raw`\url%`, false))).not.toContain('<a ')
})

const chrome = await findChrome()
test.skipIf(!chrome)('follows a math link in Chromium and keeps it clickable over editable PowerPoint artwork', async () => {
  const source = [
    '---',
    'math:',
    '  trust: true',
    '---',
    '# Formula',
    '',
    '$$',
    String.raw`\href{#review}{\frac{2}{3}} \qquad \includegraphics[width=60px,height=30px,alt=Review badge]{/badge.svg}`,
    '$$',
    '',
    '---',
    'routeAlias: review',
    '---',
    '# Review',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
  })
  expect(player.success).toBe(true)
  const badge = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30"><rect width="60" height="30" fill="green"/></svg>'
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(player.outputs[0])
        case '/presentation.css': return new Response(css)
        case '/badge.svg': return new Response(badge, { headers: { 'Content-Type': 'image/svg+xml' } })
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    expect(await view.evaluate(`(async () => {
      const image = document.querySelector('.math-image img')
      await image.decode()
      const link = document.querySelector('.math-link a')
      const loaded = [image.naturalWidth, image.offsetWidth, image.offsetHeight, image.alt, !!link.querySelector('mfrac')]
      const target = link.dataset.slideLink
      link.click()
      return [loaded, target, window.presentationNavigation.currentPage, location.hash]
    })()`)).toEqual([[60, 60, 30, 'Review badge', true], '2', 2, '#review'])
  }
  finally {
    view.close()
    server.stop(true)
  }
  const directory = await mkdtemp(join(tmpdir(), 'presentation-math-links-'))
  try {
    await Promise.all([
      Bun.write(join(directory, 'index.html'), html),
      Bun.write(join(directory, 'presentation.css'), css),
      Bun.write(join(directory, 'presentation.js'), player.outputs[0]),
      Bun.write(join(directory, 'badge.svg'), badge),
    ])
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: directory, executable: chrome!, canvas: defaultCanvas, scale: 1, withClicks: false, editable: true },
      (frame) => { frames.push(frame) })
    expect(frames[0].editable?.nodes.some(node => node.kind === 'raster')).toBe(true)
    expect(frames[0].links?.map(({ href, inArtwork }) => [href, inArtwork])).toEqual([['#slide-2', true]])
    const powerpoint = await createPowerPoint(frames, { title: 'Formula', ...defaultCanvas }).text()
    expect(powerpoint).toContain('Target="slide2.xml"')
    expect(powerpoint).toContain('action="ppaction://hlinksldjump"')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)
