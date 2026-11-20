#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { asset, within } from './assets.ts'
import { findChrome } from './chrome.ts'
import { resolveExportSettings } from './export-options.ts'
import { resolveDeckEntry } from './extension-resolver.ts'
import { compileLiveCode, maxCodeLength } from './compile-code.ts'
import { saveDrag } from './drag-source.ts'
import { saveDrawing } from './drawing-store.ts'
import type { CompiledDeck } from './loader.ts'
import type { PowerPointFrame } from './powerpoint.ts'
import { createDeckCompiler } from './loader.ts'
import { legacySlideLocation } from '../../../client/runtime/navigation.ts'
import { deckPath, matchDeckPath, normalizeBasePath, resolveRouterMode } from '../../../client/runtime/routing.ts'
import { prefixCssUrls } from './base-assets.ts'
import { maxSlideEditLength, readSlideSource, saveSlideSource } from './side-editor-source.ts'
import { saveSnippet } from './snippet-write.ts'
import { version } from '../../../../package.json'

const options = {
  out: { type: 'string' },
  output: { type: 'string' },
  range: { type: 'string' },
  scale: { type: 'string' },
  'with-clicks': { type: 'boolean' },
  'without-clicks': { type: 'boolean' },
  port: { type: 'string' },
  mcp: { type: 'boolean' },
  format: { type: 'string' },
  theme: { type: 'string' },
  base: { type: 'string' },
  'router-mode': { type: 'string' },
  'executable-path': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

const help = `ts-presentation <dev|build|export|mcp> [slides.md]

  dev     Serve a local presentation. Optional --port (default: 3030) and --mcp.
  build   Build a static site. Optional --out (default: dist beside the deck).
  export  Write PDF, PNG, PPTX or editable PPTX using Chrome. Use --format pptx-editable for editable slides.
          Optional --out and --executable-path.
          Use --range and --with-clicks to select PDF, PNG, or PPTX frames.
          PNG/PPTX also support --scale.
  mcp     Serve deck editing tools over stdio.
  --theme   Override the deck's theme for any command.
  --base    Serve or build under a deployment path such as /talks/demo/.
  --router-mode  Override the deck's history, hash, or memory mode.
`

function localAuthorRequest(request: Request, url: URL): boolean {
  return request.headers.get('Origin') === url.origin && ['127.0.0.1', 'localhost'].includes(url.hostname)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ options, allowPositionals: true })
  const [command, entry = 'slides.md'] = positionals
  const destination = values.out ?? values.output
  if (values.help || !command) {
    console.log(help)
    return
  }
  if ((command !== 'dev' && command !== 'build' && command !== 'export' && command !== 'mcp') || positionals.length > 2) {
    throw new Error(help)
  }

  const source = await resolveDeckEntry(entry)
  if (command === 'mcp') {
    const { startMcpStdioServer } = await import('../mcp/stdio.ts')
    await startMcpStdioServer(source)
    return
  }
  const directory = dirname(source)
  const base = command === 'export' ? '/' : normalizeBasePath(values.base)
  const routerMode = values['router-mode'] === undefined ? undefined : resolveRouterMode(values['router-mode'])
  const publicDir = join(directory, 'public')
  const baseStyle = Bun.file(new URL('../../../client/runtime/player.css', import.meta.url))
  const customStyle = join(directory, 'style.css')
  const player = await Bun.build({
    entrypoints: [new URL('../../../client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
    minify: true,
  })
  if (!player.success || !player.outputs[0]) throw new Error('Could not build the browser player')
  const javascript = await player.outputs[0].text()
  const emptyStyle = '/* This deck has no custom styles. */\n'
  const compile = createDeckCompiler(source, { base, routerMode, liveCompile: command === 'dev', mcpNavigation: command === 'dev' && values.mcp, mode: command, theme: values.theme })

  async function deckStyles(): Promise<string | Bun.BunFile> {
    const css = Bun.file(customStyle)
    if (!await css.exists()) return emptyStyle
    return base === '/' ? css : prefixCssUrls(await css.text(), base)
  }

  function deckPage(deck: CompiledDeck): Response {
    return new Response(deck.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  async function writeSite(output: string, compiled?: CompiledDeck): Promise<CompiledDeck> {
    if (within(publicDir, output)) throw new Error('Build output must be outside the deck’s public directory')
    const deck = compiled ?? await compile()
    await mkdir(output, { recursive: true })
    if (await realpath(publicDir).catch(() => undefined)) {
      await cp(publicDir, output, { recursive: true })
    }
    for (const [name, root] of Object.entries(deck.mounts)) {
      const destination = join(output, 'extensions', name)
      await mkdir(destination, { recursive: true })
      await cp(root, destination, { recursive: true })
    }
    await Promise.all([
      Bun.write(join(output, 'index.html'), deck.html),
      deck.styles ? Bun.write(join(output, 'extensions.css'), deck.styles) : undefined,
      deck.client ? Bun.write(join(output, 'extensions.js'), deck.client) : undefined,
      Bun.write(join(output, 'presentation.css'), baseStyle),
      Bun.write(join(output, 'presentation.js'), javascript),
      Bun.write(join(output, 'deck.css'), await deckStyles()),
    ])
    return deck
  }

  if (command === 'dev') {
    await compile()
    const root = await realpath(publicDir).catch(() => undefined)
    const port = Number(values.port ?? 3030)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port')
    let position = { page: 0, clicks: 0 }
    let requestedPosition: { id: string, page: number, clicks: number } | undefined
    const mcp = values.mcp ? await import('../mcp/http.ts') : undefined
    const handleMcp = mcp ? (await import('../mcp/server.ts')).createSlidevMcpServer({
      entry: source,
      version,
      getServerUrl: (): string => new URL(base, server.url).href,
      getData: async () => (await import('../mcp/operations.ts')).loadEditingDeck(source),
      nav: {
        getState: () => position,
        go(page, clicks) {
          position = { page, clicks }
          requestedPosition = { id: crypto.randomUUID(), page, clicks }
        },
      },
    }) : undefined
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port,
      maxRequestBodySize: Math.max(maxCodeLength * 4, maxSlideEditLength * 6 + 1024),
      async fetch(request) {
        let path: string
        const url = new URL(request.url)
        const navigable = request.method === 'GET' || request.method === 'HEAD'
        if (navigable && base !== '/' && url.pathname === base.slice(0, -1)) {
          url.pathname = base
          return Response.redirect(url, 307)
        }
        const mounted = deckPath(url.pathname, base)
        if (mounted === undefined) return new Response('Not found', { status: 404 })
        try {
          path = decodeURIComponent(mounted)
        }
        catch {
          return new Response('Invalid URL', { status: 400 })
        }
        switch (path) {
          case '/':
          case '/index.html':
            return deckPage(await compile())
          case '/extensions.css':
            return new Response((await compile()).styles, { headers: { 'Content-Type': 'text/css; charset=utf-8' } })
          case '/extensions.js':
            return new Response((await compile()).client, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
          case '/__mcp':
            if (mcp && handleMcp && (await compile()).headmatter?.mcp !== false) return mcp.handleMcpHttp(request, handleMcp)
            return new Response(null, { status: 404 })
          case '/__presentation/live': {
            if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
            const headers = new Headers({ 'Cache-Control': 'no-store' })
            try {
              const { live, headmatter } = await compile()
              if (mcp && headmatter?.mcp !== false && request.headers.get('Sec-Fetch-Site') !== 'cross-site') {
                const page = Number(url.searchParams.get('mcp-page'))
                const clicks = Number(url.searchParams.get('mcp-click'))
                const seen = url.searchParams.get('mcp-seen') ?? ''
                if (requestedPosition && seen !== requestedPosition.id) headers.set('X-Presentation-Mcp-Position', JSON.stringify(requestedPosition))
                else if (Number.isSafeInteger(page) && page > 0 && page <= (live?.slides.length ?? 0) && Number.isSafeInteger(clicks) && clicks >= 0)
                  position = { page, clicks }
              }
              return live && live.revision !== url.searchParams.get('revision')
                ? Response.json(live, { headers })
                : new Response(null, { status: 204, headers })
            }
            catch (error) {
              return new Response(error instanceof Error ? error.message : 'Could not update the deck.', { status: 422, headers })
            }
          }
          case '/__presentation/source': {
            if (request.method !== 'POST' && request.method !== 'PUT')
              return new Response(null, { status: 405, headers: { Allow: 'POST, PUT' } })
            if (!localAuthorRequest(request, url)) return new Response('Source requests must come from the local presenter.', { status: 403 })
            const input = await request.json().catch(() => undefined)
            if (!input || typeof input !== 'object') return new Response('Invalid source request.', { status: 400 })
            let deck: CompiledDeck
            try { deck = await compile() }
            catch (error) {
              return new Response(error instanceof Error ? error.message : 'Could not read the deck source.', { status: 422 })
            }
            if (request.method === 'PUT') return saveSlideSource(deck.writableSlides, input)
            if (input.deckRevision !== deck.live?.revision) return new Response('The deck changed. Waiting for the preview to update.', { status: 409 })
            const index = input.slide
            const token = Number.isSafeInteger(index) && index > 0 ? deck.live?.slides[index - 1]?.sourceToken : undefined
            const editable = token && deck.writableSlides.get(token)
            return editable
              ? Response.json(readSlideSource(editable), { headers: { 'Cache-Control': 'no-store' } })
              : new Response('This slide has no editable Markdown source.', { status: 404 })
          }
          case '/__presentation/compile':
            if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
            if (!localAuthorRequest(request, url))
              return new Response('Compile requests must come from the local presenter.', { status: 403 })
            try {
              return new Response(compileLiveCode(await request.text(), 'ts'))
            }
            catch (error) {
              return new Response(error instanceof Error ? error.message : 'Invalid code', { status: 422 })
            }
          case '/__presentation/snippet': {
            if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
            if (!localAuthorRequest(request, url)) return new Response('Save requests must come from the local presenter.', { status: 403 })
            const input = await request.json().catch(() => undefined)
            return saveSnippet((await compile()).writableSnippets, input)
          }
          case '/__presentation/drag': {
            if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
            if (!localAuthorRequest(request, url)) return new Response('Save requests must come from the local presenter.', { status: 403 })
            return saveDrag((await compile()).writableDrags, await request.json().catch(() => undefined))
          }
          case '/__presentation/drawing': {
            if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
            if (!localAuthorRequest(request, url))
              return new Response('Drawing requests must come from the local presentation.', { status: 403 })
            return saveDrawing((await compile()).drawingStore, await request.json().catch(() => undefined))
          }
          case '/presentation.css':
            return new Response(baseStyle, { headers: { 'Content-Type': 'text/css' } })
          case '/deck.css':
            return new Response(await deckStyles(), { headers: { 'Content-Type': 'text/css' } })
          case '/presentation.js':
            return new Response(javascript, { headers: { 'Content-Type': 'text/javascript' } })
          default: {
            const extension = /^\/extensions\/([a-z0-9-]+)(\/.*)$/i.exec(path)
            const mounted = extension ? (await compile()).mounts[extension[1]] : undefined
            if (mounted && extension) return asset(mounted, extension[2], request)
            const found = root ? await asset(root, path.endsWith('/') ? `${path}index.html` : path, request) : undefined
            if (found && found.status !== 404) return found
            if (navigable && /^\/(?:[a-z0-9-]+\/?){1,2}$/i.test(path)) {
              const deck = await compile()
              if (deck.routing.mode === 'history' && matchDeckPath(path, key => deck.routeAliases.has(key))) return deckPage(deck)
              url.pathname = path
              const destination = legacySlideLocation(url, deck.routeAliases)
              if (destination) {
                destination.pathname = base
                return Response.redirect(destination, 307)
              }
            }
            return found ?? new Response('Not found', { status: 404 })
          }
        }
      },
    })
    console.log(`Presentation running at ${new URL(base, server.url)}`)
    return
  }
  if (command === 'build') {
    const output = resolve(destination ?? join(directory, 'dist'))
    await writeSite(output)
    console.log(join(output, 'index.html'))
    return
  }

  const deck = await compile()
  const { format, output, scale, range, executablePath, withClicks } = resolveExportSettings(source, deck.headmatter, values)
  const executable = await findChrome(executablePath)
  if (!executable) throw new Error('Chrome or Chromium is required for export. Pass --executable-path or set CHROME_BIN.')
  const powerPoint = format === 'pptx' || format === 'pptx-editable'
  const temp = await mkdtemp(join(tmpdir(), 'ts-presentation-'))
  try {
    await mkdir(dirname(output), { recursive: true })
    await writeSite(temp, deck)
    if (format !== 'pdf') {
      const { captureFrames } = await import('./capture.ts')
      const { title, author, canvas } = deck
      const frames: PowerPointFrame[] = []
      if (format === 'png') await mkdir(output, { recursive: true })
      await captureFrames({
        root: temp,
        executable,
        canvas,
        editable: format === 'pptx-editable',
        range,
        scale,
        withClicks,
      }, async (frame, index, total) => {
        if (powerPoint) frames.push(frame)
        else {
          if (!frame.image) throw new Error('Missing PNG frame')
          const suffix = String(index + 1).padStart(String(total).length, '0')
          await Bun.write(join(output, `slide-${suffix}.png`), frame.image)
        }
      })
      if (powerPoint) {
        const { createPowerPoint } = await import('./powerpoint.ts')
        await Bun.write(output, createPowerPoint(frames, { title, author, ...canvas }))
      }
      console.log(output)
      return
    }

    const { capturePdf } = await import('./capture.ts')
    const pdf = await capturePdf({ root: temp, executable, canvas: deck.canvas, scale, range, withClicks })
    await Bun.write(output, pdf)
    console.log(output)
  }
  finally {
    await rm(temp, { recursive: true, force: true })
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
