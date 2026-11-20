// Adapted from Slidev v53.1.0's VDrag Markdown cases (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { saveDrag } from '../packages/slidev/node/runtime/drag-source.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'

test('writes empty named and direct component positions without binding identical code or comments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tp-drag-markdown-'))
  try {
    const entry = join(root, 'slides.md')
    const literal = '<v-drag pos="square">Example</v-drag>'
    const source = [
      '# Initial', '', '~~~html', literal, '~~~', '', `One example: \`${literal}\`.`, '',
      `<!-- ${literal} -->`, '', literal, '', '<v-drag>New position</v-drag>',
    ].join('\n')
    await writeFile(entry, source)
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const draft = await compile()
    expect(draft.writableDrags.size).toBe(2)
    expect(draft.html.match(/data-drag-token="/g)).toHaveLength(2)
    const [named, inline] = [...draft.writableDrags.keys()]
    async function save(token: string, position: unknown): Promise<Response> {
      const doc = await compile()
      return saveDrag(doc.writableDrags, { token, revision: doc.writableDrags.get(token)?.revision, position })
    }
    expect((await save(named, [42, 90, -2, 30, 0])).status).toBe(400)
    expect((await save(named, [42, 90, 160, null, 0])).ok).toBe(true)
    expect((await save(inline, [52, 110, 169, null, 0])).ok).toBe(true)
    expect(await readFile(entry, 'utf8')).toBe(
      "---\ndragPos:\n  'square': '42, 90, 160, _'\n---\n" + source.replace('<v-drag>New', '<v-drag pos="52, 110, 169, _">New'),
    )
    expect((await createDeckCompiler(entry)()).html).not.toContain('data-drag-token')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

const chrome = await findChrome()
test.skipIf(!chrome)('moves, resizes, rotates, and saves from the player with scale and keeps capture controls hidden', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tp-drag-player-'))
  const entry = join(root, 'slides.md')
  await writeFile(entry, [
    '---', 'canvasWidth: 900', 'aspectRatio: 2', '---', '', '# Drag controls', '',
    '<div id="card" v-drag="[120, 125, 184, 72]" style="background: #315571">Card</div>', '',
    '<v-drag-arrow id="arrow" pos="420, 140, 220, 100"/>',
    '', '---', '', '# Second slide',
  ].join('\n'))
  const server = Bun.spawn([process.execPath, new URL('../packages/slidev/node/runtime/cli.ts', import.meta.url).pathname, 'dev', entry, '--port', '0'], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  })
  const view = new Bun.WebView({ width: 1150, height: 690, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    const start = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(start.value).match(/https?:\/\/[\w.:]+/)?.[0]
    expect(origin).toBeDefined()
    await view.navigate(origin!)
    await view.evaluate(`document.querySelector('#card').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    expect(await view.evaluate(`document.querySelector('#card').hasAttribute('data-drag-selected')`)).toBe(true)
    const gesture = async (selector: string, dx: number, dy: number, modifiers = 0) => {
      const { x, y, scale } = await view.evaluate(`(() => {
        const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
        const slide = document.querySelector('#slide-1')
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, scale: slide.getBoundingClientRect().width / slide.offsetWidth }
      })()`) as { x: number, y: number, scale: number }
      await view.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers })
      await view.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx * scale, y: y + dy * scale, button: 'left', buttons: 1, modifiers })
      await view.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx * scale, y: y + dy * scale, button: 'left', buttons: 0, clickCount: 1, modifiers })
    }
    await gesture('#card', 90, 30)
    await gesture('[data-drag-handle="resize"]', 46, 0, 8)
    await view.evaluate(`document.querySelector('[data-drag-handle="rotate"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }))`)
    const current = async (id: string) => view.evaluate(`JSON.parse(document.getElementById(${JSON.stringify(id)}).dataset.dragPosition)`)
    expect(await current('card')).toEqual([210, 155, 230, 90, 10])
    expect(await view.evaluate(`document.querySelector('.drag-toolbar')?.outerHTML`)).toContain('Save position')
    await view.evaluate(`document.querySelector('.drag-toolbar button').click()`)
    await view.evaluate(`document.querySelector('#arrow [data-drag-hit]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await gesture('[data-drag-handle="arrow-end"]', -42, 16)
    expect(await current('arrow')).toEqual([420, 140, 178, 116, 0])

    const until = Date.now() + 5000
    let contents = ''
    while (Date.now() < until) {
      contents = await readFile(entry, 'utf8')
      if (contents.includes('v-drag="[210, 155, 230, 90, 10]"') && contents.includes('pos="420, 140, 178, 116"')) break
      await Bun.sleep(30)
    }
    expect(contents).toContain('v-drag="[210, 155, 230, 90, 10]"')
    expect(contents).toContain('pos="420, 140, 178, 116"')
    await view.evaluate(`document.querySelector('#next').click()`)
    expect(await view.evaluate(`!!document.querySelector('.drag-controls')`)).toBe(false)
    await view.navigate(origin! + '?capture')
    expect(await current('card')).toEqual([210, 155, 230, 90, 10])
    await view.evaluate(`document.querySelector('#card').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    expect(await view.evaluate(`!!document.querySelector('.drag-controls')`)).toBe(false)
  }
  finally {
    view.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
