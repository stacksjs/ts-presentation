import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckPath } from '../packages/client/runtime/routing.ts'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { writeRoutePages } from '../packages/slidev/node/runtime/route-pages.ts'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const helpers = new URL('../src/index.ts', import.meta.url).href
const base = '/talks/demo/'

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'presentation-routes-'))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('loads custom routes from the theme and deck and observes page and setup changes', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  const page = join(root, 'theme/Guide.stx')
  const routeNames = join(root, 'setup/paths.ts')
  await Promise.all([
    Bun.write(entry, '---\ntheme: ./theme/index.ts\n---\n\n# Example deck'),
    Bun.write(join(root, 'theme/index.ts'), 'export default { name: "example" }'),
    Bun.write(page, '<main><h1>Theme page</h1><p>{{ deck.title }}</p></main>'),
    Bun.write(join(root, 'theme/setup/routes.ts'), 'export default () => [{ path: "/guide", component: new URL("../Guide.stx", import.meta.url) }]'),
    Bun.write(join(root, 'Examples.stx'), '<main><h1>Custom examples</h1><p>{{ route.path }}</p></main>'),
    Bun.write(routeNames, 'export const path = "/handbook/examples"'),
    Bun.write(join(root, 'setup/routes.ts'), [
      'import { defineRoutesSetup } from ' + JSON.stringify(helpers),
      'import { path } from "./paths.ts"',
      'export default defineRoutesSetup(async routes => [...routes, { path, component: new URL("../Examples.stx", import.meta.url), title: "Examples & details" }])',
    ].join('\n')),
  ])

  const compile = createDeckCompiler(entry, { base, liveCompile: true })
  const first = await compile()
  expect([...first.pages.keys()]).toEqual(['/guide', '/handbook/examples'])
  expect(first.pages.get('/guide')).toContain('<h1>Theme page</h1><p>Example deck</p>')
  expect(first.pages.get('/handbook/examples')).toContain('<title>Examples &amp; details</title>')
  expect(first.pages.get('/handbook/examples')).toContain('<p>/handbook/examples</p>')
  expect(first.pages.get('/handbook/examples')).toContain('<base href="/talks/demo/">')
  await Bun.write(page, '<main>Updated theme page</main>')
  await Bun.write(routeNames, 'export const path = "/examples"')
  const updated = await compile()
  expect([...updated.pages.keys()]).toEqual(['/guide', '/examples'])
  expect(updated.pages.get('/guide')).toContain('<main>Updated theme page</main>')
  expect(updated.live?.frame).toBe(first.live?.frame)
}))

test('rejects custom paths that overlap an alias and rejects templates outside their root', async () => project(async (root) => {
  const entry = join(root, 'deck/slides.md')
  const setup = join(root, 'deck/setup/routes.ts')
  await Promise.all([
    Bun.write(entry, '---\nrouteAlias: agenda\n---\n# Agenda'),
    Bun.write(setup, 'export default () => [{ path: "/agenda/details", component: new URL("../Guide.stx", import.meta.url) }]'),
    Bun.write(join(root, 'Outside.stx'), '<main>Outside</main>'),
  ])
  await symlink(join(root, 'Outside.stx'), join(root, 'deck/Guide.stx'))
  const compile = createDeckCompiler(entry)
  await expect(compile()).rejects.toThrow('conflicts with a deck route')
  await Bun.write(setup, 'export default () => [{ path: "/guide", component: new URL("../Guide.stx", import.meta.url) }]')
  await expect(compile()).rejects.toThrow('must stay inside its project or extension directory')
}))

test('keeps generated route pages inside the build output', async () => project(async (root) => {
  const output = join(root, 'dist')
  const outside = join(root, 'outside')
  await Promise.all([mkdir(output), Bun.write(join(outside, 'index.html'), 'keep original')])
  await symlink(outside, join(output, 'guide'))
  await expect(writeRoutePages(output, new Map([['/guide', 'new page']]))).rejects.toThrow('is not a directory')
  expect(await Bun.file(join(outside, 'index.html')).text()).toBe('keep original')
}))

const chrome = await findChrome()
test.skipIf(!chrome)('serves and builds custom STX routes with interactive content under a deployment base', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, '# Deck\n\n[Handbook](/handbook/intro/)'),
    Bun.write(join(root, 'setup/routes.ts'), 'export default () => [{ path: "/handbook/intro", component: new URL("../Intro.stx", import.meta.url) }]'),
    Bun.write(join(root, 'Intro.stx'), [
      '<template><main><h1>Handbook</h1><img src="/mark.svg" alt="Mark" />',
      '<button @click="increase">Add</button><output>{{ count() }}</output></main></template>',
      '<script client>',
      'const count = state(1)',
      'function increase() { count.set(count() + 1) }',
      '</script>',
    ].join('\n')),
    Bun.write(join(root, 'public/mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>'),
  ])

  const args = [process.execPath, cli]
  const build = Bun.spawn([...args, 'build', entry, '--base', base], { stdout: 'ignore', stderr: 'pipe', timeout: 20_000 })
  const dev = Bun.spawn([...args, 'dev', entry, '--base', base, '--port', '0'], { stdout: 'pipe', stderr: 'pipe', timeout: 25_000 })
  let host: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    const reader = dev.stdout.getReader()
    let output = ''
    let address: string | undefined
    while (!address) {
      const data = await reader.read()
      if (data.done) throw new Error(await new Response(dev.stderr).text())
      output += new TextDecoder().decode(data.value)
      address = /Presentation running at (\S+)/.exec(output)?.[1]
    }
    const remote = new URL('handbook/intro', address)
    const redirect = await fetch(remote, { redirect: 'manual' })
    expect(redirect.status).toBe(307)
    expect(redirect.headers.get('location')).toBe(remote.href + '/')
    const response = await fetch(remote)
    expect(response.url).toBe(remote.href + '/')
    expect(await response.text()).toContain('<h1>Handbook</h1>')
    expect(await (await fetch(remote, { method: 'HEAD' })).text()).toBe('')
    expect((await fetch(new URL('not-found', address))).status).toBe(404)

    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status !== 0) throw new Error(stderr)
    const dist = await realpath(join(root, 'dist'))
    host = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      const path = deckPath(new URL(request.url).pathname, base)
      return path ? asset(dist, path.endsWith('/') ? path + 'index.html' : path, request) : new Response(null, { status: 404 })
    } })
    view = new Bun.WebView({ width: 900, height: 650, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(new URL(base, host.url).href)
    const link = await view.evaluate<string>(`document.querySelector('#slide-1 a').href`)
    expect(link).toBe(new URL(`${base}handbook/intro/`, host.url).href)
    await view.navigate(link)
    const result = await view.evaluate(`(async () => {
      const image = document.querySelector('img')
      await image.decode()
      const output = document.querySelector('output')
      const before = output.textContent.trim()
      document.querySelector('button').click()
      return [new URL(image.src).pathname, image.naturalWidth, before, output.textContent.trim()]
    })()`)
    expect(result).toEqual([base + 'mark.svg', 12, '1', '2'])
  }
  finally {
    dev.kill()
    await Promise.all([build.exited, dev.exited])
    view?.close()
    await host?.stop(true)
  }
}), 35_000)
