// Adapted from Slidev's cypress/e2e/examples/base-path.spec.ts (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckPath, normalizeBasePath } from '../../client/runtime/routing.ts'
import { asset } from '../node/runtime/assets.ts'
import { prefixCssUrls, prefixMarkupUrls } from '../node/runtime/base-assets.ts'
import { findChrome } from '../node/runtime/chrome.ts'

const base = '/talks/demo/'
const cli = fileURLToPath(new URL('../node/cli.ts', import.meta.url))
const chrome = await findChrome()
const source = `---
routerMode: history
---

# Start

![Example](/image.svg)

<style>
.probe { background: url('/image.svg'); }
</style>

[Review](#review)

---

# Next

<p v-click>Reveal</p>

[Jump](#note)

<p id="note">Local note</p>

---
routeAlias: review
---

# Review

---

# Review checklist
`

async function writeDeck(root: string): Promise<string> {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, source),
    Bun.write(join(root, 'style.css'), '.slide { --asset: url("/image.svg"); }'),
    Bun.write(join(root, 'public/image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>'),
  ])
  return entry
}

test('normalizes base paths and prefixes deck URLs while preserving external URLs and literals', () => {
  expect(normalizeBasePath('talks/demo')).toBe(base)
  expect(normalizeBasePath('/d%C3%A9mo/')).toBe('/d%C3%A9mo/')
  for (const invalid of ['https://example.com/', '//example.com/', '/a/../b', '/a/%2f/b', '/?x=y', '/a//b', '/a/%ZZ']) {
    expect(() => normalizeBasePath(invalid)).toThrow('--base')
  }
  expect(deckPath(base + '2', base)).toBe('/2')
  expect(deckPath('/talks/demo-longer/2', base)).toBeUndefined()
  const markup = '<img src="/image.svg" srcset="data:image/png;base64,abc 1x, /image.svg 2x">'
    + '<a href="https://examples.invalid/a">Remote</a><a href="#anchor">Anchor</a>'
    + '<style>.example{content:"url(/literal)";mask:url(/image.svg)}</style>'
  const html = prefixMarkupUrls(markup, base)
  expect(html).toContain('src="/talks/demo/image.svg" srcset="data:image/png;base64,abc 1x, /talks/demo/image.svg 2x"')
  expect(html).toContain('href="https://examples.invalid/a"')
  expect(html).toContain('href="#anchor"')
  expect(html).toContain('content:"url(/literal)";mask:url(/talks/demo/image.svg)')
  expect(prefixCssUrls('@import "/style.css";/* url(/comment) */ a { background:url(//cdn.example/a) }', base))
    .toBe('@import "/talks/demo/style.css";/* url(/comment) */ a { background:url(//cdn.example/a) }')
  expect(prefixMarkupUrls(html, base)).toBe(html)
})

test.skipIf(!chrome).each(['history', 'hash'] as const)('keeps static %s navigation and presenter previews within the base path', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-base-build-'))
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    const entry = await writeDeck(root)
    const args = mode === 'hash' ? ['--router-mode', mode] : []
    const build = Bun.spawn([process.execPath, cli, 'build', entry, '--base', base, ...args], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const output = await realpath(join(root, 'dist'))
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const path = deckPath(new URL(request.url).pathname, base)
        if (path === undefined) return new Response(null, { status: 404 })
        const file = await asset(output, path === '/' ? '/index.html' : path, request)
        if (file.status !== 404 || mode !== 'history' || path.includes('.')) return file
        return asset(output, '/index.html', request)
      },
    })
    const site = new URL(base, server.url)
    const locationFor = (path: string) => new URL((mode === 'hash' ? '#/' : '') + path, site).href
    view = new Bun.WebView({ width: 1000, height: 800, backend: { type: 'chrome', path: chrome!, url: false } })
    const visit = async (path: string) => {
      if (mode === 'hash') await view!.navigate('about:blank')
      await view!.navigate(locationFor(path))
    }
    await visit('1')
    const state = () => view!.evaluate<[string, number, number, string]>(`[
      location.href, window.presentationNavigation.currentPage, window.presentationNavigation.clicks, window.presentationNavigation.mode,
    ]`)
    expect(await state()).toEqual([locationFor('1'), 1, 0, 'slide'])
    expect(await view.evaluate(`(async () => {
      const image = document.querySelector('#slide-1 img')
      await image.decode()
      return [image.naturalWidth, new URL(image.src).pathname, document.querySelector('#slide-1 a[data-slide-link]').href]
    })()`)).toEqual([12, base + 'image.svg', locationFor('review')])
    expect(await (await fetch(new URL('deck.css', site))).text()).toContain('url("/talks/demo/image.svg")')

    const advance = () => view!.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' })
    await advance()
    expect(await state()).toEqual([locationFor('2'), 2, 0, 'slide'])
    await advance()
    expect(await state()).toEqual([locationFor('2?clicks=1'), 2, 1, 'slide'])
    await visit('2?clicks=1')
    expect(await state()).toEqual([locationFor('2?clicks=1'), 2, 1, 'slide'])
    if (mode === 'history') {
      await view.evaluate("document.querySelector('#slide-2 a[href=\"#note\"]').click()")
      expect(await state()).toEqual([locationFor('2?clicks=1#note'), 2, 1, 'slide'])
    }
    // Adapt the numeric jump from Slidev's cypress/e2e/examples/basic.spec.ts.
    const search = async (query: string) => {
      await view!.press('g')
      expect(await view!.evaluate('document.activeElement.id')).toBe('slidev-goto-input')
      await view!.cdp('Input.insertText', { text: query })
      expect(await view!.evaluate(`[document.activeElement.value, document.querySelector('#goto-dialog').open]`)).toEqual([query, true])
    }
    await search('/1')
    expect(await view.evaluate('document.activeElement.value')).toBe('/1')
    await view.press('Enter')
    expect(await state()).toEqual([locationFor('1'), 1, 0, 'slide'])
    await search('999')
    await view.press('Enter')
    expect(await view.evaluate(`[
      document.querySelector('#goto-dialog').open,
      document.querySelector('#goto-status').textContent,
      document.activeElement.getAttribute('aria-expanded'),
    ]`)).toEqual([true, 'No matching slides.', 'false'])
    await view.press('Escape')
    expect(await view.evaluate("document.querySelector('#goto-dialog').open")).toBe(false)
    await search('rvew')
    expect(await view.evaluate("document.activeElement.getAttribute('aria-activedescendant')")).toBe('goto-result-3')
    await view.press('ArrowUp')
    expect(await view.evaluate("document.activeElement.getAttribute('aria-activedescendant')")).toBe('goto-result-4')
    await view.press('Enter')
    expect(await state()).toEqual([locationFor('4'), 4, 0, 'slide'])
    await search('next')
    await view.press('Enter')
    expect(await state()).toEqual([locationFor('2'), 2, 0, 'slide'])
    await advance()
    expect(await view.evaluate(`(() => {
      let opened
      const original = window.open
      window.open = url => { opened = String(url); return window }
      document.querySelector('#presenter').click()
      window.open = original
      return opened
    })()`)).toBe(locationFor('presenter/2?clicks=1'))
    await visit('presenter/2?clicks=1')
    expect(await state()).toEqual([locationFor('presenter/2?clicks=1'), 2, 1, 'presenter'])
    expect(await view.evaluate(`(async () => {
      const frame = document.querySelector('#presenter-preview iframe')
      const deadline = performance.now() + 5000
      while (!frame.contentWindow?.presentationNavigation && performance.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 25))
      return [new URL(frame.src).pathname, frame.contentWindow?.presentationNavigation?.currentPage]
    })()`)).toEqual([base, 3])
    await search('#review')
    await view.evaluate("document.querySelector('#goto-result-3 span').click()")
    expect(await state()).toEqual([locationFor('presenter/review'), 3, 0, 'presenter'])
    await visit('overview')
    expect(await view.evaluate("document.querySelector('a[data-overview-slide=\"3\"]').href")).toBe(locationFor('review'))
  }
  finally {
    view?.close()
    await server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

test('serves the mounted dev deck, assets, direct links, and live endpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-base-dev-'))
  const entry = await writeDeck(root)
  const server = Bun.spawn([process.execPath, cli, 'dev', entry, '--base', base, '--port', '0'], {
    stdout: 'pipe', stderr: 'pipe', timeout: 25_000,
  })
  try {
    const reader = server.stdout.getReader()
    let stdout = ''
    let address: string | undefined
    try {
      while (!address) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error((await new Response(server.stderr).text()).trim())
        stdout += new TextDecoder().decode(chunk.value)
        address = /Presentation running at (https?:\/\/\S+)/.exec(stdout)?.[1]
      }
    }
    finally { reader.releaseLock() }
    const url = new URL(address)
    expect(url.pathname).toBe(base)
    expect((await fetch(new URL('presenter/review', url))).status).toBe(200)
    expect((await fetch(new URL('missing', url))).status).toBe(404)
    expect((await fetch(new URL('/presentation.js', url))).status).toBe(404)
    const redirect = await fetch(new URL(base.slice(0, -1), url), { redirect: 'manual' })
    expect(redirect.headers.get('location')).toBe(url.href)
    const live = await fetch(new URL('__presentation/live', url))
    expect(live.status).toBe(200)
    expect((await live.json()).slides[0].html).toContain('src="/talks/demo/image.svg"')
    const compiled = await fetch(new URL('__presentation/compile', url), {
      method: 'POST',
      headers: { Origin: url.origin },
      body: 'const number: number = 3; console.log(number)',
    })
    expect(compiled.status).toBe(200)
    expect(await compiled.text()).toContain('console.log(number)')
  }
  finally {
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
