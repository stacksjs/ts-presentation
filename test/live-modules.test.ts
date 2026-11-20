import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../src/index.ts'

const cli = new URL('../src/cli.ts', import.meta.url).pathname
const chrome = await findChrome()

async function writeDeck(root: string) {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, [
      '---', 'monacoRunAdditionalDeps: [./extra]', '---', '', '# Shared helpers', '',
      '~~~ts {live-run}', 'import { label } from "./helper"', 'const value: string = await label()',
      'console.log(value)', '~~~', '',
      '~~~js {live-run}', 'console.log((await import("./helper")).label instanceof Function)', '~~~',
    ].join('\n')),
    Bun.write(join(root, 'snippets/helper.ts'), 'import { name } from "./details"; export const label = async () => name'),
    Bun.write(join(root, 'snippets/details.ts'), 'export const name = "shared label"'),
    Bun.write(join(root, 'snippets/extra.ts'), 'export default "explicitly declared"'),
    Bun.write(join(root, 'snippets/private.ts'), 'export default "not declared"'),
  ])
  return entry
}

test('bundles declared and authored helpers, refreshes transitive imports, and confines the module graph to the deck', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'presentation-module-test-')))
  const root = join(parent, 'deck')
  try {
    const entry = await writeDeck(root)
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const first = await compile()
    expect(first.html.match(/data-live-program data-live-module/g)).toHaveLength(2)
    expect(first.html).toContain('shared label')
    expect(await first.compileExample('import value from "./extra"; console.log(value)', 'js')).toMatchObject({
      code: expect.stringContaining('explicitly declared'),
      module: true,
    })
    expect(await first.compileExample('import { label } from "./helper"; console.log(await label())', 'ts')).toMatchObject({
      code: expect.stringContaining('shared label'),
      module: true,
    })
    await expect(first.compileExample('import "./private"', 'js')).rejects.toThrow('not declared')

    const details = join(root, 'snippets/details.ts')
    await Bun.write(details, 'export const name = "updated module"')
    const updated = await compile()
    expect(updated.html).toContain('updated module')
    expect(updated.live?.revision).not.toBe(first.live?.revision)

    const outside = join(parent, 'outside.ts')
    await Bun.write(outside, 'export const name = "outside deck"')
    await Bun.write(details, 'export { name } from "../../outside"')
    const traversal = await compile()
    expect(traversal.html).toContain('Live code module leaves the deck directory')
    expect(traversal.html).not.toContain('outside deck')
    await symlink(outside, join(root, 'snippets/external.ts'))
    await Bun.write(details, 'export { name } from "./external"')
    expect((await compile()).html).toContain('Live code module leaves the deck directory')

    await Bun.write(details, 'import { sep } from "node:path"; export const name = sep')
    expect((await compile()).html).toContain('Live code module must be a relative path')

    const marker = JSON.stringify(join(root, 'macro-ran.txt'))
    await Bun.write(join(root, 'snippets/macro.ts'), `export function run() { Bun.write(${marker}, "unexpected"); return 1 }`)
    await Bun.write(details, 'import { run } from "./macro" with { type: "macro" }; export const name = run()')
    expect((await compile()).html).toContain('Macros are disabled')
    await expect(first.compileExample('import { run } from "./macro" with { type: "macro" }; console.log(run())', 'ts')).rejects.toThrow('Macros are disabled')
    expect(await Bun.file(JSON.parse(marker)).exists()).toBe(false)
  }
  finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test.skipIf(!chrome)('runs an authored module in a static site and edited modules on the dev server', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-module-browser-')))
  const out = join(root, 'published')
  let staticServer: ReturnType<typeof Bun.serve> | undefined
  let dev: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined
  let browser: Bun.WebView | undefined
  try {
    const entry = await writeDeck(root)
    const build = Bun.spawn([process.execPath, cli, 'build', entry, '--out', out], { stderr: 'pipe', stdout: 'ignore' })
    expect(await build.exited, await new Response(build.stderr).text()).toBe(0)
    staticServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        return asset(out, path === '/' ? '/index.html' : path)
      },
    })
    const view = browser = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(staticServer.url.href)
    async function run(language: 'js' | 'ts', expected: string, draft?: string) {
      const result = await view.evaluate(`(async () => {
        const selector = '[data-language="${language}"]'
        for (let attempt = 0; attempt < 60 && !document.querySelector(selector); attempt++)
          await new Promise(resolve => setTimeout(resolve, 25))
        const block = document.querySelector(selector)
        if (!block) throw new Error('Missing ' + selector + ' at ' + location.href + ': ' + document.body.textContent.slice(0, 200))
        ${draft === undefined ? '' : `block.querySelector('textarea').value = ${JSON.stringify(draft)}`}
        const button = block.querySelector('[data-live-run]')
        button.click()
        for (let attempt = 0; attempt < 150 && button.textContent === 'Stop'; attempt++)
          await new Promise(resolve => setTimeout(resolve, 25))
        return block.querySelector('[data-live-result]').textContent.trim()
      })()`)
      expect(result).toBe(expected)
    }
    await run('ts', 'shared label')
    await run('js', 'true')

    dev = Bun.spawn([process.execPath, cli, 'dev', entry, '--port', '0'], {
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 20_000,
    })
    const reader = dev.stdout.getReader()
    let output = ''
    let address: string | undefined
    try {
      while (!address) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error((await new Response(dev.stderr).text()).trim())
        output += new TextDecoder().decode(chunk.value)
        address = /Presentation running at (https?:\/\/\S+)/.exec(output)?.[1]
      }
    }
    finally { reader.releaseLock() }
    await view.navigate(address)
    await run('ts', 'explicitly declared!', 'import value from "./extra"; const suffix: string = "!"; console.log(value + suffix)')
    await run('js', 'shared label!', 'import { label } from "./helper"; console.log((await label()) + "!")')
    await run('js', 'Live code import is not declared in the deck: ./private', 'import "./private"')
  }
  finally {
    browser?.close()
    await staticServer?.stop(true)
    if (dev) {
      dev.kill()
      await dev.exited
    }
    await rm(root, { recursive: true, force: true })
  }
}, 40_000)
