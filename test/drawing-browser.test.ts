import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { findChrome } from '../src/chrome.ts'

const chrome = await findChrome()
const project = resolve(import.meta.dir, '..')
const strokeSelector = 'article:not([hidden]) .slide-ink g > path'

function cli(...args: string[]) {
  return Bun.spawn([process.execPath, 'src/cli.ts', ...args], { cwd: project, stdout: 'pipe', stderr: 'pipe' })
}

async function stroke(view: Bun.WebView, pointerType: 'mouse' | 'pen', yOffset: number): Promise<void> {
  const { x, y } = await view.evaluate<{ x: number, y: number }>(`(() => {
    const box = document.querySelector('article:not([hidden])').getBoundingClientRect()
    return { x: box.x + box.width * .18, y: box.y + box.height * ${yOffset} }
  })()`)
  await view.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, pointerType, button: 'left', buttons: 1, clickCount: 1 })
  await view.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 90, y: y + 24, pointerType, button: 'left', buttons: 1 })
  await view.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 90, y: y + 24, pointerType, button: 'left', buttons: 0, clickCount: 1 })
}

async function waitFor(test: () => boolean | Promise<boolean>): Promise<void> {
  for (let retry = 0; retry < 160; retry++) {
    if (await test()) return
    await Bun.sleep(25)
  }
  throw new Error('Drawing did not reach the expected state')
}

test.skipIf(!chrome)('saves presenter ink, syncs audience and late tabs, and includes saved ink in a build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-drawing-browser-'))
  const source = join(root, 'slides.md')
  const file = join(root, '.slidev/drawings/slides/1.svg')
  await Bun.write(source, '---\ndrawings:\n  persist: true\n  presenterOnly: true\n  enabled: dev\n---\n\n# Annotate this\n\n---\n\n# Next slide')
  const server = cli('dev', source, '--port', '0')
  let view: Bun.WebView | undefined
  try {
    const start = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(start.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (!origin) throw new Error(await new Response(server.stderr).text())
    view = new Bun.WebView({ width: 1060, height: 780, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(origin + '/?presenter=1')
    const client = view
    const count = () => client.evaluate<number>(`document.querySelectorAll(${JSON.stringify(strokeSelector)}).length`)
    const audienceCount = () => client.evaluate<number>(`document.querySelector('iframe[data-audience]').contentDocument.querySelectorAll(${JSON.stringify(strokeSelector)}).length`)
    async function audience(search = ''): Promise<void> {
      await client.evaluate(`(async () => {
        document.querySelector('iframe[data-audience]')?.remove()
        const frame = document.createElement('iframe')
        frame.setAttribute('data-audience', '')
        frame.style.cssText = 'position:fixed; left:-2000px; width:900px; height:650px'
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
        frame.src = ${JSON.stringify('/' + search)}
        document.body.append(frame)
        await loaded
      })()`)
    }

    expect(await client.evaluate("document.querySelector('#draw-button').hidden")).toBe(false)
    await audience()
    expect(await client.evaluate("document.querySelector('iframe[data-audience]').contentDocument.querySelector('#draw-button').hidden")).toBe(true)
    expect(await client.evaluate("document.querySelector('#draw-button').getAttribute('aria-pressed')")).toBe('false')
    await stroke(client, 'pen', .6)
    await waitFor(async () => await count() === 1 && await audienceCount() === 1)
    await waitFor(() => Bun.file(file).exists())

    await client.evaluate("document.querySelector('#draw-button').click()")
    await waitFor(() => client.evaluate("!!document.querySelector('article:not([hidden]) .slide-ink[data-drawing-active]')"))
    await stroke(client, 'mouse', .72)
    await waitFor(async () => await count() === 2 && await audienceCount() === 2)
    await waitFor(async () => (await Bun.file(file).text()).match(/<path d=/g)?.length === 2)
    await client.evaluate("document.querySelector('#draw-button').click()")
    expect(await count()).toBe(2)
    await client.evaluate('window.presentationNavigation.go(2)')
    expect(await count()).toBe(0)
    await client.evaluate('window.presentationNavigation.go(1)')
    expect(await count()).toBe(2)

    await audience()
    await waitFor(async () => await audienceCount() === 2)
    const denied = await fetch(origin + '/__presentation/drawing', { method: 'POST', body: '{}' })
    expect(denied.status).toBe(403)
    const invalid = await fetch(origin + '/__presentation/drawing', { method: 'POST', headers: { Origin: origin }, body: '{"slide":"../outside","patch":{"strokes":[]}}' })
    expect(invalid.status).toBe(400)

    const output = join(root, 'site')
    const build = cli('build', source, '--out', output)
    const [code, errors] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (code) throw new Error(errors)
    const html = await Bun.file(join(output, 'index.html')).text()
    expect(html).toContain('"enabled":false')
    expect(html).toContain('"persist":false')
    expect(html.match(/<path d="M/g)).toHaveLength(2)

    await client.evaluate("document.querySelector('#draw-button').click()")
    await waitFor(() => client.evaluate("!document.querySelector('#clear-drawing').hidden && !document.querySelector('#clear-drawing').disabled"))
    await client.evaluate("document.querySelector('#clear-drawing').click()")
    await waitFor(async () => await count() === 0 && await audienceCount() === 0)
    await waitFor(async () => (await Bun.file(file).text()).includes('"strokes":[]'))

    await Bun.write(source, '---\ndrawings:\n  persist: true\n  syncAll: false\n---\n\n# Audience ink')
    await client.navigate(origin)
    await audience('?presenter=1')
    await stroke(client, 'pen', .6)
    await waitFor(async () => await count() === 1)
    expect(await audienceCount()).toBe(0)
    expect(await Bun.file(file).text()).toContain('"strokes":[]')
  }
  finally {
    view?.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
