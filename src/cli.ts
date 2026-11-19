#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { asset, within } from './assets.ts'
import { findChrome } from './chrome.ts'
import { compileLiveCode, maxCodeLength } from './compile-code.ts'
import { saveDrag } from './drag-source.ts'
import { saveDrawing } from './drawing-store.ts'
import type { CompiledDeck } from './loader.ts'
import type { PowerPointFrame } from './powerpoint.ts'
import { createDeckCompiler } from './loader.ts'
import { legacySlideLocation } from './navigation.ts'
import { maxSlideEditLength, readSlideSource, saveSlideSource } from './side-editor-source.ts'
import { saveSnippet } from './snippet-write.ts'

const options = {
  out: { type: 'string' },
  output: { type: 'string' },
  range: { type: 'string' },
  scale: { type: 'string' },
  'with-clicks': { type: 'boolean' },
  'without-clicks': { type: 'boolean' },
  port: { type: 'string' },
  format: { type: 'string' },
  theme: { type: 'string' },
  'executable-path': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

const help = `ts-presentation <dev|build|export> [slides.md]

  dev     Serve a local presentation. Optional --port (default: 3030).
  build   Build a static site. Optional --out (default: dist beside the deck).
  export  Write PDF, PNG, PPTX or editable PPTX using Chrome. Use --format pptx-editable for editable slides.
          Optional --out and --executable-path.
          PNG/PPTX support --range, --scale and --with-clicks or --without-clicks.
  --theme   Override the deck's theme for any command.
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
  if ((command !== 'dev' && command !== 'build' && command !== 'export') || positionals.length > 2) {
    throw new Error(help)
  }

  const source = resolve(entry)
  const directory = dirname(source)
  const publicDir = join(directory, 'public')
  const baseStyle = Bun.file(new URL('./player.css', import.meta.url))
  const customStyle = join(directory, 'style.css')
  const player = await Bun.build({
    entrypoints: [join(import.meta.dir, 'player.ts')],
    target: 'browser',
    format: 'iife',
    minify: true,
  })
  if (!player.success || !player.outputs[0]) throw new Error('Could not build the browser player')
  const javascript = await player.outputs[0].text()
  const emptyStyle = '/* This deck has no custom styles. */\n'
  const compile = createDeckCompiler(source, { liveCompile: command === 'dev', mode: command, theme: values.theme })

  async function writeSite(output: string): Promise<CompiledDeck> {
    if (within(publicDir, output)) throw new Error('Build output must be outside the deck’s public directory')
    const deck = await compile()
    const css = Bun.file(customStyle)
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
      Bun.write(join(output, 'deck.css'), await css.exists() ? css : emptyStyle),
    ])
    return deck
  }

  if (command === 'dev') {
    await compile()
    const root = await realpath(publicDir).catch(() => undefined)
    const port = Number(values.port ?? 3030)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port')
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port,
      maxRequestBodySize: Math.max(maxCodeLength * 4, maxSlideEditLength * 6 + 1024),
      async fetch(request) {
        let path: string
        const url = new URL(request.url)
        try {
          path = decodeURIComponent(url.pathname)
        }
        catch {
          return new Response('Invalid URL', { status: 400 })
        }
        switch (path) {
          case '/':
          case '/index.html':
            return new Response((await compile()).html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          case '/extensions.css':
            return new Response((await compile()).styles, { headers: { 'Content-Type': 'text/css; charset=utf-8' } })
          case '/extensions.js':
            return new Response((await compile()).client, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
          case '/__presentation/live': {
            if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
            const headers = { 'Cache-Control': 'no-store' }
            try {
              const { live } = await compile()
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
          case '/deck.css': {
            const css = Bun.file(customStyle)
            return new Response(await css.exists() ? css : emptyStyle, { headers: { 'Content-Type': 'text/css' } })
          }
          case '/presentation.js':
            return new Response(javascript, { headers: { 'Content-Type': 'text/javascript' } })
          default: {
            const extension = /^\/extensions\/([a-z0-9-]+)(\/.*)$/i.exec(path)
            const mounted = extension ? (await compile()).mounts[extension[1]] : undefined
            if (mounted && extension) return asset(mounted, extension[2])
            const found = root ? await asset(root, path.endsWith('/') ? `${path}index.html` : path) : undefined
            if (found && found.status !== 404) return found
            if ((request.method === 'GET' || request.method === 'HEAD') && /^\/(?:[a-z0-9-]+\/?){1,2}$/i.test(path)) {
              const destination = legacySlideLocation(url, (await compile()).routeAliases)
              if (destination) return Response.redirect(destination, 307)
            }
            return found ?? new Response('Not found', { status: 404 })
          }
        }
      },
    })
    console.log(`Presentation running at ${server.url}`)
    return
  }
  if (command === 'build') {
    const output = resolve(destination ?? join(directory, 'dist'))
    await writeSite(output)
    console.log(join(output, 'index.html'))
    return
  }

  const executable = await findChrome(values['executable-path'])
  if (!executable) throw new Error('Chrome or Chromium is required for export. Pass --executable-path or set CHROME_BIN.')
  const format = values.format ?? 'pdf'
  if (!['pdf', 'png', 'pptx', 'pptx-editable'].includes(format)) throw new Error('Export format must be pdf, png, pptx or pptx-editable')
  const powerPoint = format === 'pptx' || format === 'pptx-editable'
  if (values['with-clicks'] && values['without-clicks']) throw new Error('Choose either --with-clicks or --without-clicks')
  if (format === 'pdf' && (values.range || values.scale || values['with-clicks'] || values['without-clicks']))
    throw new Error('Slide range, scale and click options are available for PNG and PPTX')
  const scale = Number(values.scale ?? (powerPoint ? 2 : 1))
  if (!Number.isInteger(scale) || scale < 1 || scale > 3) throw new Error('Export scale must be 1, 2 or 3')
  const name = basename(source, '.md')
  const target = destination ?? (format === 'png' ? `${name}-frames` : `${name}.${powerPoint ? 'pptx' : 'pdf'}`)
  const output = resolve(format === 'pptx-editable' && !target.toLowerCase().endsWith('.pptx') ? `${target}.pptx` : target)
  const temp = await mkdtemp(join(tmpdir(), 'ts-presentation-'))
  try {
    await mkdir(dirname(output), { recursive: true })
    const deck = await writeSite(temp)
    const { pathToFileURL } = await import('node:url')
    const localDeck = pathToFileURL(join(temp, 'index.html'))
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
        range: values.range,
        scale,
        withClicks: values['with-clicks'] || (powerPoint && !values['without-clicks']),
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

    const pdf = join(temp, 'presentation.pdf')
    const chrome = Bun.spawn([
      executable,
      '--headless',
      '--no-first-run',
      '--no-pdf-header-footer',
      `--user-data-dir=${join(temp, 'chrome')}`,
      `--print-to-pdf=${pdf}`,
      localDeck.href,
    ], { stderr: 'pipe' })
    const error = await new Response(chrome.stderr).text()
    if (await chrome.exited || !(await Bun.file(pdf).exists())) throw new Error(`Chrome PDF export failed. ${error.trim()}`)
    await Bun.write(output, Bun.file(pdf))
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
