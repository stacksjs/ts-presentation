#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { parseDeck, renderDeck } from './index.ts'

const options = {
  out: { type: 'string' },
  port: { type: 'string' },
  'executable-path': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

const help = `ts-presentation <dev|build|export> [slides.md]

  dev     Serve a local presentation. Optional --port (default: 3030).
  build   Build a static site. Optional --out (default: dist beside the deck).
  export  Print a PDF using Chrome. Optional --out and --executable-path.
`

function within(root: string, path: string): boolean {
  const inside = relative(root, path)
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)
}

async function asset(root: string, path: string): Promise<Response> {
  const file = await realpath(resolve(root, `.${path}`)).catch(() => undefined)
  if (file && within(root, file)) {
    const item = Bun.file(file)
    if (await item.exists() && (await item.stat()).isFile()) {
      return new Response(item, { headers: { 'Content-Type': item.type } })
    }
  }
  return new Response('Not found', { status: 404 })
}

async function chromePath(explicit?: string): Promise<string> {
  const candidates = [
    explicit ?? process.env.CHROME_BIN,
    Bun.which('chromium'),
    Bun.which('google-chrome'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && await Bun.file(candidate).exists()) return candidate
  }
  throw new Error('Chrome or Chromium is required for PDF export. Pass --executable-path or set CHROME_BIN.')
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ options, allowPositionals: true })
  const [command, entry = 'slides.md'] = positionals
  if (values.help || !command) {
    console.log(help)
    return
  }
  if (!['dev', 'build', 'export'].includes(command) || positionals.length > 2) {
    throw new Error(help)
  }

  const source = resolve(entry)
  const directory = dirname(source)
  const publicDir = join(directory, 'public')
  const baseStyle = Bun.file(new URL('./player.css', import.meta.url))
  const customStyle = Bun.file(join(directory, 'style.css'))
  const player = await Bun.build({
    entrypoints: [join(import.meta.dir, 'player.ts')],
    target: 'browser',
    format: 'iife',
    minify: true,
  })
  if (!player.success || !player.outputs[0]) throw new Error('Could not build the browser player')
  const javascript = await player.outputs[0].text()
  const emptyStyle = '/* This deck has no custom styles. */\n'
  const document = async () => renderDeck(parseDeck(await Bun.file(source).text()))

  async function writeSite(output: string): Promise<void> {
    if (within(publicDir, output)) throw new Error('Build output must be outside the deck’s public directory')
    const html = await document()
    await mkdir(output, { recursive: true })
    if (await realpath(publicDir).catch(() => undefined)) {
      await cp(publicDir, output, { recursive: true })
    }
    await Promise.all([
      Bun.write(join(output, 'index.html'), html),
      Bun.write(join(output, 'presentation.css'), baseStyle),
      Bun.write(join(output, 'presentation.js'), javascript),
      Bun.write(join(output, 'deck.css'), await customStyle.exists() ? customStyle : emptyStyle),
    ])
  }

  if (command === 'dev') {
    await document()
    const root = await realpath(publicDir).catch(() => undefined)
    const port = Number(values.port ?? 3030)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port')
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port,
      async fetch(request) {
        let path: string
        try {
          path = decodeURIComponent(new URL(request.url).pathname)
        }
        catch {
          return new Response('Invalid URL', { status: 400 })
        }
        switch (path) {
          case '/':
          case '/index.html':
            return new Response(await document(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          case '/presentation.css':
            return new Response(baseStyle, { headers: { 'Content-Type': 'text/css' } })
          case '/deck.css':
            return new Response(await customStyle.exists() ? customStyle : emptyStyle, { headers: { 'Content-Type': 'text/css' } })
          case '/presentation.js':
            return new Response(javascript, { headers: { 'Content-Type': 'text/javascript' } })
          default:
            return root ? asset(root, path.endsWith('/') ? `${path}index.html` : path) : new Response('Not found', { status: 404 })
        }
      },
    })
    console.log(`Presentation running at ${server.url}`)
    return
  }
  if (command === 'build') {
    const output = resolve(values.out ?? join(directory, 'dist'))
    await writeSite(output)
    console.log(join(output, 'index.html'))
    return
  }

  const executable = await chromePath(values['executable-path'])
  const output = resolve(values.out ?? `${basename(source, '.md')}.pdf`)
  const temp = await mkdtemp(join(tmpdir(), 'ts-presentation-'))
  try {
    await mkdir(dirname(output), { recursive: true })
    await writeSite(temp)
    const pdf = join(temp, 'presentation.pdf')
    const { pathToFileURL } = await import('node:url')
    const process = Bun.spawn([
      executable,
      '--headless',
      '--no-first-run',
      '--no-pdf-header-footer',
      `--user-data-dir=${join(temp, 'chrome')}`,
      `--print-to-pdf=${pdf}`,
      pathToFileURL(join(temp, 'index.html')).href,
    ], { stderr: 'pipe' })
    const error = await new Response(process.stderr).text()
    if (await process.exited || !(await Bun.file(pdf).exists())) throw new Error(`Chrome PDF export failed. ${error.trim()}`)
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
