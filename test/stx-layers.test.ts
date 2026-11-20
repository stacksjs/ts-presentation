import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { captureFrames } from '../packages/slidev/node/runtime/capture.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import type { PowerPointFrame } from '../packages/slidev/node/runtime/powerpoint.ts'

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'presentation-stx-layers-'))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('discovers STX slide layers across the theme and deck and invalidates live slides on changes', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  const local = join(root, 'layouts', 'slide-top.stx')
  await Promise.all([
    Bun.write(entry, '---\ntheme: ./theme/index.ts\nlayout: cover\n---\n\n# Cover\n\n---\nlayout: default\n---\n\n# Body'),
    Bun.write(join(root, 'theme', 'index.ts'), 'export default { name: "layer-theme" }'),
    Bun.write(join(root, 'theme', 'layouts', 'slide-top.stx'), '<p>Theme {{ slideNumber }}</p>'),
    Bun.write(join(root, 'custom-nav-controls.stx'), '<button id="custom-controls">Deck of {{ nav.total }}</button>'),
  ])
  const compile = createDeckCompiler(entry, { liveCompile: true, base: '/talk/' })
  const first = await compile()
  expect(first.live?.slides[0].html).toContain('<p>Theme 1</p>')
  expect(first.live?.slides[1].html).toContain('<p>Theme 2</p>')
  expect(first.html).toContain('<button id="custom-controls">Deck of 2</button>')
  expect(first.html).not.toContain('id="presentation-custom-controls-data"')

  await Bun.write(local, '@if(nav.currentLayout !== "cover")\n<aside><img src="/mark.svg">Page {{ nav.currentPage }} of {{ nav.total }}</aside>\n@endif')
  const second = await compile()
  expect(second.live?.frame).toBe(first.live?.frame)
  expect(second.live?.slides[0].html).not.toContain('data-presentation-layer')
  expect(second.live?.slides[1].html).toContain('<img src="/talk/mark.svg">Page 2 of 2')
  expect(second.html).not.toContain('<p>Theme')

  await rm(local)
  expect((await compile()).live?.slides[1].html).toContain('<p>Theme 2</p>')
}))

test('rejects a layer template outside the deck and extension directories', async () => project(async (root) => {
  const entry = join(root, 'deck', 'slides.md')
  const layer = join(root, 'outside.stx')
  await Bun.write(entry, '# Example')
  await Bun.write(layer, '<p>Outside</p>')
  await symlink(layer, join(root, 'deck', 'global-top.stx'))
  await expect(createDeckCompiler(entry)()).rejects.toThrow('STX layers must stay inside')
}))

const chrome = await findChrome()
test.skipIf(!chrome)('hydrates STX toolbar controls for the active presenter slide and disposes replaced scopes', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  const counter = await Bun.file(new URL('../packages/create-app/template/components/Counter.stx', import.meta.url)).text()
  await Promise.all([
    Bun.write(entry, '---\nrouterMode: history\nrouteAlias: intro\nnext: review/1\n---\n# Intro\n\n---\nrouteAlias: review\nnext: intro\n---\n# Review\n\n<Counter :start="10" />\n\n<p v-click>First reveal</p>'),
    Bun.write(join(root, 'custom-nav-controls.stx'), [
      '<style>#nav-title { --toolbar-style: retained; }</style>',
      '<p id="nav-title">{{ nav.currentPage }}. {{ title }} / {{ nav.total }}</p>',
      '<Toc id="nav-outline" />',
      '<Link id="nav-link" v-bind:to="frontmatter.next" title="Open slide" />',
      '<Counter :start="nav.currentPage" />',
    ].join('\n')),
    Bun.write(join(root, 'components', 'Counter.stx'), counter.replace('const count = state(props.start ?? 0)', [
      'const count = state(props.start ?? 0)',
      'const lifecycle = window.toolbarLifecycle ??= []',
      'onMount(() => {',
      '  if (props.start < 10) lifecycle.push("mount " + props.start)',
      '  if (props.start === 1 && window.toolbarRedirect) {',
      '    window.toolbarRedirect = false',
      '    window.presentationNavigation.go(2, 1)',
      '  }',
      '})',
      'onDestroy(() => { if (props.start < 10) lifecycle.push("destroy " + props.start) })',
    ].join('\n'))),
  ])
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  const server = Bun.spawn([process.execPath, cli, 'dev', entry, '--port', '0', '--base', '/talk/'], { stdout: 'pipe', stderr: 'pipe', timeout: 25_000 })
  let view: Bun.WebView | undefined
  try {
    const output = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(output.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (!origin) throw new Error(await new Response(server.stderr).text())
    view = new Bun.WebView({ width: 1024, height: 660, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(origin + '/talk/presenter/review')
    const state = () => view!.evaluate<unknown[]>(`(() => {
      const title = document.querySelector('#nav-title')
      const outline = document.querySelector('#nav-outline [aria-current="page"]')
      const link = document.querySelector('#nav-link')
      const counter = document.querySelector('#presentation-custom-controls .demo-counter output')
      return [title.textContent, outline.textContent, new URL(link.href).pathname, getComputedStyle(title).getPropertyValue('--toolbar-style').trim(), window.presentationNavigation.clicks, counter.textContent.trim()]
    })()`)
    expect(await state()).toEqual(['2. Review / 2', 'Review', '/talk/intro', 'retained', 0, '2'])
    await view.evaluate("document.querySelector('#presentation-custom-controls [aria-label=\"Increase counter\"]').click()")
    expect((await state()).at(-1)).toBe('3')
    const clickSlideCounter = () => view!.evaluate(`(() => {
      const counter = document.querySelector('#slide-2 .demo-counter')
      counter.querySelector('[aria-label="Increase counter"]').click()
      return counter.querySelector('output').textContent.trim()
    })()`)
    expect(await clickSlideCounter()).toBe('11')
    await view.evaluate("document.querySelector('#nav-link').click()")
    expect(await state()).toEqual(['1. Intro / 2', 'Intro', '/talk/review', 'retained', 0, '1'])
    await view.evaluate("document.querySelector('#nav-link').click()")
    expect(await state()).toEqual(['2. Review / 2', 'Review', '/talk/intro', 'retained', 1, '2'])
    expect(await view.evaluate('window.toolbarLifecycle')).toEqual(['mount 2', 'destroy 2', 'mount 1', 'destroy 1', 'mount 2'])
    expect(await clickSlideCounter()).toBe('12')
    expect(await view.evaluate('location.pathname + location.search')).toBe('/talk/presenter/review?clicks=1')
    await view.evaluate(`(() => {
      window.toolbarRedirect = true
      window.presentationNavigation.go(1)
    })()`)
    expect(await state()).toEqual(['2. Review / 2', 'Review', '/talk/intro', 'retained', 1, '2'])
    expect(await view.evaluate('window.toolbarLifecycle.slice(-4)')).toEqual(['destroy 2', 'mount 1', 'destroy 1', 'mount 2'])
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
  }
}), 30_000)

test.skipIf(!chrome)('keeps equivalent STX layers and scripted controls mounted and exports layers in paint order', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, '# First slide\n\n---\n\n# Next slide'),
    Bun.write(join(root, 'global-bottom.stx'), '<div style="position:absolute;top:210px;left:20px">Global bottom</div>'),
    Bun.write(join(root, 'layouts', 'slide-bottom.stx'), '<div style="position:absolute;top:250px;left:20px">Slide bottom {{ slideNumber }}</div>'),
    Bun.write(join(root, 'layouts', 'slide-top.stx'), '<div class="lower-badge" style="position:absolute;top:310px;left:20px;width:220px">Slide top {{ nav.currentPage }}</div>'),
    Bun.write(join(root, 'global-top.stx'), '<button class="global-badge" style="position:absolute;top:310px;left:20px;width:220px">Global top</button>'),
    Bun.write(join(root, 'components', 'Counter.stx'), Bun.file(new URL('../packages/create-app/template/components/Counter.stx', import.meta.url))),
    Bun.write(join(root, 'custom-nav-controls.stx'), '<Counter :start="1" />'),
  ])
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  const command = Bun.spawn([process.execPath, cli, 'build', entry], { stdout: 'ignore', stderr: 'pipe', timeout: 20_000 })
  const [exit, stderr] = await Promise.all([command.exited, new Response(command.stderr).text()])
  if (exit) throw new Error(stderr)
  const path = await realpath(join(root, 'dist'))
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname
      return asset(path, pathname === '/' ? '/index.html' : pathname, request)
    },
  })
  const view = new Bun.WebView({ width: 1024, height: 660, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const result = await view.evaluate(`(() => {
      const active = () => document.querySelector('#stage article:not([hidden])')
      const badge = active().querySelector('.global-badge')
      const counter = document.querySelector('#presentation-custom-controls .demo-counter')
      const badgeCount = document.createElement('output')
      badgeCount.value = '1'
      badge.append(badgeCount)
      badge.addEventListener('click', () => badgeCount.value = '2')
      window.presentationNavigation.go(2)
      const next = active().querySelector('.global-badge')
      const box = next.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + 8, box.top + 8)?.closest('.global-badge') === next
      next.click()
      counter.querySelector('[aria-label="Increase counter"]').click()
      return [next === badge, badgeCount.value, hit, active().querySelector('.lower-badge').textContent.trim(),
        !!document.querySelector('#slide-1 .global-badge'), counter === document.querySelector('#presentation-custom-controls .demo-counter'),
        counter.querySelector('output').textContent.trim()]
    })()`)
    expect(result).toEqual([true, '2', true, 'Slide top 2', true, true, '2'])
  }
  finally {
    view.close()
    await server.stop(true)
  }
  const frames: PowerPointFrame[] = []
  await captureFrames({ root: path, executable: chrome!, canvas: { width: 960, height: 540 }, withClicks: true, scale: 1, editable: true },
    frame => { frames.push(frame) })
  expect(frames).toHaveLength(2)
  expect(frames.map(frame => frame.editable?.nodes.flatMap(node => node.kind === 'text' ? node.runs.map(run => run.text) : []))).toEqual([
    ['Global bottom', 'Slide bottom 1', 'First slide', 'Slide top 1', 'Global top'],
    ['Global bottom', 'Slide bottom 2', 'Next slide', 'Slide top 2', 'Global top'],
  ])
}), 45_000)
