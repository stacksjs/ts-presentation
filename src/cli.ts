#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { createDeckRenderer } from './loader.ts'

const options = {
  out: { type: 'string' },
  port: { type: 'string' },
  format: { type: 'string' },
  'executable-path': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

const help = `ts-presentation <dev|build|export> [slides.md]

  dev     Serve a local presentation. Optional --port (default: 3030).
  build   Build a static site. Optional --out (default: dist beside the deck).
  export  Write PDF or PNG using Chrome. Optional --format, --out and --executable-path.
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
  const document = createDeckRenderer(source)

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
  const format = values.format ?? 'pdf'
  if (format !== 'pdf' && format !== 'png') throw new Error('Export format must be pdf or png')
  const name = basename(source, '.md')
  const output = resolve(values.out ?? (format === 'png' ? `${name}-frames` : `${name}.pdf`))
  const temp = await mkdtemp(join(tmpdir(), 'ts-presentation-'))
  try {
    await mkdir(dirname(output), { recursive: true })
    await writeSite(temp)
    const { pathToFileURL } = await import('node:url')
    const localDeck = pathToFileURL(join(temp, 'index.html'))
    if (format === 'png') {
      await mkdir(output, { recursive: true })
      const captureRoot = await realpath(temp)
      const preview = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: request => {
          const path = decodeURIComponent(new URL(request.url).pathname)
          return asset(captureRoot, path === '/' ? '/index.html' : path)
        },
      })
      const view = new Bun.WebView({
        width: 960,
        height: 540,
        backend: { type: 'chrome', path: executable, url: false },
      })
      try {
        const frames = async () => {
          await view.navigate('data:text/html,<title>Presentation export</title>')
          await view.cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false })
          await view.navigate(new URL('?capture=1', preview.url).href)
          const count = await view.evaluate<number>("document.querySelectorAll('#stage > article').length")
          if (!count) throw new Error('The browser did not load the deck for PNG export')
          for (let slide = 1; slide <= count; slide++) {
            await view.evaluate(`(async () => {
              location.hash = 'slide-${slide}'
              window.dispatchEvent(new HashChangeEvent('hashchange'))
              await document.fonts.ready
              await Promise.all([...document.querySelectorAll('article:not([hidden]) img')].map(image => image.decode()))
              return true
            })()`)
            const suffix = String(slide).padStart(String(count).length, '0')
            await Bun.write(join(output, `slide-${suffix}.png`), await view.screenshot())
          }
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            frames(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('PNG export did not finish within 60 seconds')), 60_000)
            }),
          ])
        }
        finally {
          if (timer !== undefined) clearTimeout(timer)
        }
        console.log(output)
      }
      finally {
        view.close()
        await preview.stop(true)
      }
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
