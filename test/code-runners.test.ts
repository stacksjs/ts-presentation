import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../src/index.ts'

const chrome = await findChrome()

test('bundles browser runner hooks from the deck and extensions and observes their imports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-runner-setup-'))
  try {
    const slides = join(root, 'slides.md')
    const helper = join(root, 'setup/helper.ts')
    await Promise.all([
      Bun.write(slides, '---\naddons: ./addon/index.ts\n---\n\n# Runner\n\n~~~csv {monaco-run}\n10,20\n~~~'),
      Bun.write(join(root, 'addon/index.ts'), 'export default { name: "test-addon" }'),
      Bun.write(join(root, 'addon/setup/code-runners.ts'), 'export default () => ({ csv: () => ({ text: "addon-runner" }) })'),
      Bun.write(join(root, 'setup/code-runners.ts'), "import { defineCodeRunnersSetup } from 'ts-presentation/types'; import { message } from './helper'; export default defineCodeRunnersSetup(() => ({ csv: () => ({ text: message }) }))"),
      Bun.write(helper, 'export const message = "deck-runner"'),
    ])
    const compile = createDeckCompiler(slides, { liveCompile: true })
    const initial = await compile()
    expect(initial.html).toContain('data-language="csv"')
    expect(initial.html).toContain('data-live-run')
    expect(initial.client).toContain('window.presentationCodeRunners')
    expect(initial.client).toContain('addon-runner')
    expect(initial.client).toContain('deck-runner')
    await Bun.write(helper, 'export const message = "changed-runner"')
    const updated = await compile()
    expect(updated.client).toContain('changed-runner')
    expect(updated.live?.frame).not.toBe(initial.live?.frame)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(!chrome)('runs custom languages and composes the isolated JavaScript runner in a static deck', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-runner-browser-'))
  const source = join(root, 'slides.md')
  const out = join(root, 'site')
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    await Bun.write(source, [
      '---', 'addons: ./addon/index.ts', '---', '', '# Runner', '',
      '~~~csv {monaco-run}{runnerOptions: {header: "Total", values: [1, 2]}}', '10,20', '~~~', '',
      '~~~ts {monaco-run}', 'const number: number = 7', 'console.log(number)', '~~~', '',
      '~~~unknown-lang {live-run}', 'hello', '~~~',
    ].join('\n'))
    await Bun.write(join(root, 'addon/index.ts'), 'export default { name: "test-addon" }')
    await Bun.write(join(root, 'addon/setup/code-runners.ts'), "export default async () => ({ label: () => ({ text: 'addon' }) })")
    await Bun.write(join(root, 'setup/code-runners.ts'), `
import { defineCodeRunnersSetup } from '@slidev/types'

export default defineCodeRunnersSetup((base) => {
const earlierLabel = base.label
return {
  label: async (code, ctx) => {
    const earlier = await earlierLabel(code, ctx)
    return { text: 'deck:' + earlier.text }
  },
  async csv(source, ctx) {
    if (source === 'pending') {
      document.documentElement.dataset.runnerWaiting = 'true'
      return new Promise(resolve => ctx.signal.addEventListener('abort', () => {
        document.documentElement.dataset.runnerAborted = 'true'
        resolve({ text: 'outdated result' })
      }, { once: true }))
    }
    const worker = await ctx.run('return ' + JSON.stringify('worker output'), 'js')
    const failed = await ctx.run('throw new Error("worker failure")', 'javascript')
    const label = await ctx.run('', 'label')
    const element = document.createElement('strong')
    element.dataset.runnerElement = ''
    element.textContent = ctx.options.header + ' ' + ctx.options.values.length
    return [
      { text: source, class: 'runner-text' },
      { html: '<em data-runner-html>Rendered HTML</em>' },
      { html: ctx.highlight('const value = 42', 'javascript') },
      { element },
      label,
      { text: failed[0].error, class: 'runner-error' },
      ...worker,
    ]
  },
}
})
`)
    const build = Bun.spawn([process.execPath, 'src/cli.ts', 'build', source, '--out', out], {
      cwd: join(import.meta.dir, '..'), stdout: 'ignore', stderr: 'pipe',
    })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr || `Static build exited with status ${status}`)
    const folder = await realpath(out)
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        return asset(folder, path === '/' ? '/index.html' : path)
      },
    })
    const browser = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
    view = browser
    await browser.navigate(server.url.href)
    const run = (language: string, edit?: string) => browser.evaluate(`(() => {
      const block = document.querySelector(${JSON.stringify(`[data-language="${language}"]`)})
      ${edit === undefined ? '' : `block.querySelector('textarea').value = ${JSON.stringify(edit)};`}
      block.querySelector('[data-live-run]').click()
    })()`)
    const waitFor = async (condition: string) => {
      await browser.evaluate(`(async () => {
        for (let attempt = 0; attempt < 140; attempt++) {
          if (${condition}) return
          await new Promise(resolve => setTimeout(resolve, 30))
        }
        throw new Error('Expected runner result did not appear')
      })()`)
    }
    const csv = 'document.querySelector("[data-language=csv] [data-live-result]")'
    await run('csv', '<mark>typed data</mark>')
    await waitFor(`${csv}.textContent.includes('worker output')`)
    expect(await browser.evaluate(`${csv}.querySelector('.runner-text').textContent`)).toBe('<mark>typed data</mark>')
    expect(await browser.evaluate(`${csv}.querySelector('mark') === null`)).toBe(true)
    expect(await browser.evaluate(`${csv}.querySelector('[data-runner-html]').textContent`)).toBe('Rendered HTML')
    expect(await browser.evaluate(`${csv}.querySelector('[data-runner-element]').textContent`)).toBe('Total 2')
    expect(await browser.evaluate(`${csv}.querySelector('pre code span') !== null`)).toBe(true)
    expect(await browser.evaluate(`${csv}.textContent.includes('deck:addon')`)).toBe(true)
    expect(await browser.evaluate(`${csv}.querySelector('.runner-error').textContent`)).toBe('Error: worker failure')

    await run('csv', 'pending')
    await waitFor('document.documentElement.dataset.runnerWaiting === "true"')
    await run('csv')
    await waitFor('document.documentElement.dataset.runnerAborted === "true"')
    expect(await browser.evaluate(`${csv}.textContent`)).toBe('Stopped.\n')
    await run('csv', 'another')
    await waitFor(`${csv}.textContent.includes('worker output')`)
    expect(await browser.evaluate(`${csv}.textContent.includes('outdated result')`)).toBe(false)

    await run('ts')
    await waitFor('document.querySelector("[data-language=ts] [data-live-result]").textContent === "7\\n"')
    await run('unknown-lang')
    await waitFor('document.querySelector("[data-language=unknown-lang] [data-live-result]").textContent.includes("not found")')
  }
  finally {
    view?.close()
    server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
