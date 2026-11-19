import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome } from '../node/runtime/chrome.ts'
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { applySlidePatch, insertSlide, loadEditingDeck, moveSlide, removeSlide } from '../node/mcp/operations.ts'
import { createSlidevMcpServer } from '../node/mcp/server.ts'

const ENTRY_MD = `---
theme: default
title: Test Deck
---

# Slide 1

---

# Slide 2

Some content

<!--
note 2
-->

---
layout: two-cols
---

# Slide 3

---
src: ./sub.md
---

---

# Slide 6
`

const SUB_MD = `# Sub 1

---

# Sub 2
`

const fixtures: string[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function createDeck() {
  const dir = await mkdtemp(join(tmpdir(), 'slidev-mcp-test-'))
  fixtures.push(dir)
  const entry = join(dir, 'slides.md')
  await writeFile(entry, ENTRY_MD, 'utf-8')
  await writeFile(join(dir, 'sub.md'), SUB_MD, 'utf-8')
  const loadData = () => loadEditingDeck(entry)
  return { dir, entry, loadData }
}

describe('mcp slide operations', () => {
  it('loads the fixture deck as expected', async () => {
    const { loadData } = await createDeck()
    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 2',
        'Slide 3',
        'Sub 1',
        'Sub 2',
        'Slide 6',
      ],
    )
  })

  it('patches slide content and preserves the note', async () => {
    const { loadData } = await createDeck()
    await applySlidePatch(await loadData(), 2, { content: '# Slide 2 Updated' })

    const data = await loadData()
    expect(data.slides[1].content.trim()).toBe('# Slide 2 Updated')
    expect(data.slides[1].note).toBe('note 2')
  })

  it('patches the note and frontmatter of a slide', async () => {
    const { loadData } = await createDeck()
    await applySlidePatch(await loadData(), 3, {
      note: 'a new note',
      frontmatter: { layout: 'center', background: 'blue' },
    })

    let data = await loadData()
    expect(data.slides[2].note).toBe('a new note')
    expect(data.slides[2].frontmatter).toEqual({ layout: 'center', background: 'blue' })

    // `null` deletes a frontmatter key
    await applySlidePatch(data, 3, {
      frontmatter: { background: null },
    })
    data = await loadData()
    expect(data.slides[2].frontmatter).toEqual({ layout: 'center' })
  })

  it('patches the entry first slide without breaking the headmatter', async () => {
    const { loadData } = await createDeck()
    await applySlidePatch(await loadData(), 1, { note: 'cover note' })

    const data = await loadData()
    expect(data.headmatter.title).toBe('Test Deck')
    expect(data.slides[0].note).toBe('cover note')
  })

  it('patches a slide imported with src: into its own file', async () => {
    const { dir, loadData } = await createDeck()
    await applySlidePatch(await loadData(), 4, { content: '# Sub 1 Changed' })

    expect(await readFile(join(dir, 'sub.md'), 'utf-8')).toContain('# Sub 1 Changed')
    expect(await readFile(join(dir, 'slides.md'), 'utf-8')).not.toContain('# Sub 1 Changed')
    const data = await loadData()
    expect(data.slides[3].content.trim()).toBe('# Sub 1 Changed')
  })

  it('rejects invalid YAML in frontmatterRaw', async () => {
    const { loadData } = await createDeck()
    await expect(applySlidePatch(await loadData(), 2, { frontmatterRaw: 'foo: [unclosed' }))
      .rejects
      .toThrow(/Invalid YAML/)
  })

  it('rejects out-of-range slide numbers', async () => {
    const { loadData } = await createDeck()
    await expect(applySlidePatch(await loadData(), 99, { content: 'x' }))
      .rejects
      .toThrow(/does not exist/)
  })

  it('inserts a slide after an existing one', async () => {
    const { loadData } = await createDeck()
    await insertSlide(await loadData(), {
      after: 2,
      content: '# Inserted',
      frontmatter: { layout: 'center' },
      note: 'inserted note',
    })

    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 2',
        'Inserted',
        'Slide 3',
        'Sub 1',
        'Sub 2',
        'Slide 6',
      ],
    )
    expect(data.slides[2].frontmatter).toEqual({ layout: 'center' })
    expect(data.slides[2].note).toBe('inserted note')
  })

  it('inserts a slide at the end of the deck', async () => {
    const { loadData } = await createDeck()
    await insertSlide(await loadData(), { after: 6, content: '# The End' })

    const data = await loadData()
    expect(data.slides.at(-1)?.title).toBe('The End')
  })

  it('removes a slide', async () => {
    const { loadData } = await createDeck()
    await removeSlide(await loadData(), 3)

    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 2',
        'Sub 1',
        'Sub 2',
        'Slide 6',
      ],
    )
  })

  it('refuses to remove the entry first slide (headmatter)', async () => {
    const { loadData } = await createDeck()
    await expect(removeSlide(await loadData(), 1)).rejects.toThrow(/headmatter/)
  })

  it('moves a slide after another one', async () => {
    const { loadData } = await createDeck()
    await moveSlide(await loadData(), { from: 2, after: 6 })

    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 3',
        'Sub 1',
        'Sub 2',
        'Slide 6',
        'Slide 2',
      ],
    )
  })

  it('moves a slide before another one', async () => {
    const { loadData } = await createDeck()
    await moveSlide(await loadData(), { from: 3, before: 2 })

    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 3',
        'Slide 2',
        'Sub 1',
        'Sub 2',
        'Slide 6',
      ],
    )
  })

  it('moves slides within an imported file', async () => {
    const { loadData } = await createDeck()
    await moveSlide(await loadData(), { from: 5, before: 4 })

    const data = await loadData()
    expect(data.slides.map(s => s.title)).toEqual(
      [
        'Test Deck',
        'Slide 2',
        'Slide 3',
        'Sub 2',
        'Sub 1',
        'Slide 6',
      ],
    )
  })

  it('refuses to move slides across files', async () => {
    const { loadData } = await createDeck()
    await expect(moveSlide(await loadData(), { from: 4, before: 2 }))
      .rejects
      .toThrow(/across markdown files/)
  })

  it('refuses to move the entry first slide or insert before it', async () => {
    const { loadData } = await createDeck()
    await expect(moveSlide(await loadData(), { from: 1, after: 2 }))
      .rejects
      .toThrow(/headmatter/)
    await expect(moveSlide(await loadData(), { from: 3, before: 1 }))
      .rejects
      .toThrow(/headmatter/)
  })

  it('requires exactly one of before/after', async () => {
    const { loadData } = await createDeck()
    await expect(moveSlide(await loadData(), { from: 2 }))
      .rejects
      .toThrow(/exactly one/)
    await expect(moveSlide(await loadData(), { from: 2, before: 3, after: 4 }))
      .rejects
      .toThrow(/exactly one/)
  })
})

describe('mcp server', () => {
  async function createServerAndClient(nav?: { getState: () => { page: number, clicks: number }, go: (page: number, clicks: number) => void }) {
    const { entry, loadData } = await createDeck()
    const handle = createSlidevMcpServer({ version: '0.0.0-test', entry, getData: loadData, nav })
    let id = 0
    async function request(method: string, params?: unknown) {
      const reply = await handle({ jsonrpc: '2.0', id: ++id, method, params })
      if (!reply || reply.error) throw new Error(reply?.error?.message ?? 'Missing RPC reply')
      return reply.result
    }
    await request('initialize', { protocolVersion: '2025-11-25' })
    await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })
    const client = {
      listTools: async () => await request('tools/list') as { tools: { name: string }[] },
      callTool: async (params: unknown) => await request('tools/call', params) as { content: { text: string }[], isError?: boolean },
    }
    return { client }
  }

  function textOf(result: { content: { text: string }[] }) {
    return result.content[0].text as string
  }

  it('exposes the expected tools', async () => {
    const { client } = await createServerAndClient()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'slidev-get-info',
      'slidev-get-slide',
      'slidev-insert-slide',
      'slidev-list-slides',
      'slidev-move-slide',
      'slidev-remove-slide',
      'slidev-update-slide',
    ])
  })

  it('exposes goto-slide only when navigation is available', async () => {
    const { client } = await createServerAndClient({
      getState: () => ({ page: 1, clicks: 0 }),
      go: () => {},
    })
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('slidev-goto-slide')
  })

  it('gets deck info', async () => {
    const { client } = await createServerAndClient()
    const info = JSON.parse(textOf(await client.callTool({ name: 'slidev-get-info', arguments: {} })))
    expect(info.title).toBe('Test Deck')
    expect(info.totalSlides).toBe(6)
    expect(info.theme).toBe('default')
    expect(info.markdownFiles).toHaveLength(2)
  })

  it('lists slides', async () => {
    const { client } = await createServerAndClient()
    const slides = JSON.parse(textOf(await client.callTool({ name: 'slidev-list-slides', arguments: {} })))
    expect(slides).toHaveLength(6)
    expect(slides[1]).toMatchObject({ no: 2, title: 'Slide 2', hasNote: true })
    expect(slides[3]).toMatchObject({ no: 4, title: 'Sub 1', importedBySrcDirective: true })
  })

  it('gets and updates a slide', async () => {
    const { client } = await createServerAndClient()
    const slide = JSON.parse(textOf(await client.callTool({
      name: 'slidev-get-slide',
      arguments: { no: 3 },
    })))
    expect(slide).toMatchObject({ no: 3, title: 'Slide 3', layout: 'two-cols' })

    const update = await client.callTool({
      name: 'slidev-update-slide',
      arguments: { no: 3, content: '# Slide 3 via MCP' },
    })
    expect(update.isError).toBeFalsy()

    const updated = JSON.parse(textOf(await client.callTool({
      name: 'slidev-get-slide',
      arguments: { no: 3 },
    })))
    expect(updated.content).toBe('# Slide 3 via MCP')
  })

  it('returns tool errors for invalid calls', async () => {
    const { client } = await createServerAndClient()
    const result = await client.callTool({
      name: 'slidev-get-slide',
      arguments: { no: 99 },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/does not exist/)
  })

  it('navigates the live presentation', async () => {
    const go = mock(() => {})
    const { client } = await createServerAndClient({
      getState: () => ({ page: 2, clicks: 1 }),
      go,
    })

    const result = await client.callTool({
      name: 'slidev-goto-slide',
      arguments: { no: 4 },
    })
    expect(result.isError).toBeFalsy()
    expect(go).toHaveBeenCalledWith(4, 0)

    const info = JSON.parse(textOf(await client.callTool({ name: 'slidev-get-info', arguments: {} })))
    expect(info.server).toBeUndefined() // no server url in this harness

    await expect(client.callTool({
      name: 'slidev-goto-slide',
      arguments: { no: 99 },
    }))
      .resolves
      .toMatchObject({ isError: true })
  })
})

const cli = fileURLToPath(new URL('../node/cli.ts', import.meta.url))

it('speaks newline-delimited MCP through the CLI and edits the deck on disk', async () => {
  const { entry, loadData } = await createDeck()
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'slidev-update-slide', arguments: { no: 3, content: '# From stdio' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'slidev-get-slide', arguments: { no: 0 } } },
  ]
  const command = Bun.spawn([process.execPath, cli, 'mcp', entry], {
    stdin: new Blob([messages.map(message => JSON.stringify(message) + '\n').join('')]),
    stdout: 'pipe', stderr: 'pipe',
  })
  const [output, error, status] = await Promise.all([new Response(command.stdout).text(), new Response(command.stderr).text(), command.exited])
  expect(status).toBe(0)
  expect(error).toBe('')
  const replies = output.trim().split('\n').map(line => JSON.parse(line))
  expect(replies.map(reply => reply.id)).toEqual([1, 2, 3, 4])
  expect(replies[0].result.protocolVersion).toBe('2025-06-18')
  expect(replies[1].result.tools).toHaveLength(7)
  expect(replies[2].result.content[0].text).toContain('Updated slide 3')
  expect(replies[3].error.code).toBe(-32602)
  expect((await loadData()).slides[2].source.content).toBe('# From stdio')
})

const chrome = await findChrome()
it.skipIf(!chrome)('publishes MCP navigation to the audience and presenter through the local dev server', async () => {
  const { entry } = await createDeck()
  const command = Bun.spawn([process.execPath, cli, 'dev', entry, '--mcp', '--port', '0'], { stdout: 'pipe', stderr: 'pipe' })
  const audience = new Bun.WebView({ width: 960, height: 540, backend: { type: 'chrome', path: chrome!, url: false } })
  const presenter = new Bun.WebView({ width: 1200, height: 800, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    const start = await command.stdout.getReader().read()
    const address = new TextDecoder().decode(start.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    expect(address).toBeDefined()
    await audience.navigate(address!)
    await presenter.navigate(address + '/?presenter=1')
    const url = address + '/__mcp'
    const post = (message: unknown, headers: Record<string, string> = {}) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(message),
    })
    const navigation = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'slidev-goto-slide', arguments: { no: 4 } } }
    expect((await post(navigation, { Origin: 'https://example.com' })).status).toBe(403)
    expect((await fetch(url)).status).toBe(405)
    const response = await post(navigation)
    expect(response.status).toBe(200)
    expect((await response.json()).result.content[0].text).toContain('Navigated to slide 4')
    async function expectSlide(browser: Bun.WebView): Promise<void> {
      const until = Date.now() + 5000
      do {
        if (await browser.evaluate('window.presentationNavigation?.currentSlideNo') === 4) return
        await Bun.sleep(100)
      } while (Date.now() < until)
      throw new Error('Browser did not receive the navigation command')
    }
    await Promise.all([expectSlide(audience), expectSlide(presenter)])
  }
  finally {
    audience.close()
    presenter.close()
    command.kill()
    await command.exited
  }
}, 25_000)

it('preserves untouched CRLF sections and rejects writes from an older snapshot', async () => {
  const { entry } = await createDeck()
  const original = '\uFEFF---\r\ntitle: First\r\n---\r\n\r\n# First  \r\n\r\n---\r\n\r\n# Second\r\n\r\n---\n\n# Third  '
  await Bun.write(entry, original)
  const snapshot = await loadEditingDeck(entry)
  await applySlidePatch(snapshot, 2, { content: '# Revised' })
  const revised = await readFile(entry, 'utf8')
  expect(revised.startsWith('\uFEFF---\r\ntitle: First\r\n---\r\n\r\n# First  \r\n\r\n')).toBe(true)
  expect(revised.endsWith('---\n\n# Third  ')).toBe(true)
  expect(revised).toContain('# Revised\r\n')
  await expect(applySlidePatch(snapshot, 2, { content: '# Stale' })).rejects.toThrow('changed on disk')
  expect(await readFile(entry, 'utf8')).toBe(revised)
})
