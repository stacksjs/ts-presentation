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
test.skipIf(!chrome)('keeps equivalent STX global controls mounted and exports each slide layer in paint order', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, '# First slide\n\n---\n\n# Next slide'),
    Bun.write(join(root, 'global-bottom.stx'), '<div style="position:absolute;top:210px;left:20px">Global bottom</div>'),
    Bun.write(join(root, 'layouts', 'slide-bottom.stx'), '<div style="position:absolute;top:250px;left:20px">Slide bottom {{ slideNumber }}</div>'),
    Bun.write(join(root, 'layouts', 'slide-top.stx'), '<div class="lower-badge" style="position:absolute;top:310px;left:20px;width:220px">Slide top {{ nav.currentPage }}</div>'),
    Bun.write(join(root, 'global-top.stx'), '<button class="global-badge" style="position:absolute;top:310px;left:20px;width:220px">Global top</button>'),
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
      const counter = document.createElement('output')
      counter.value = '1'
      badge.append(counter)
      badge.addEventListener('click', () => counter.value = '2')
      window.presentationNavigation.go(2)
      const next = active().querySelector('.global-badge')
      const box = next.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + 8, box.top + 8)?.closest('.global-badge') === next
      next.click()
      return [next === badge, counter.value, hit, active().querySelector('.lower-badge').textContent.trim(),
        !!document.querySelector('#slide-1 .global-badge')]
    })()`)
    expect(result).toEqual([true, '2', true, 'Slide top 2', true])
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
