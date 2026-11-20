import { cp, mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { within } from './assets.ts'
import { prefixCssUrls } from './base-assets.ts'
import type { CompiledDeck } from './loader.ts'
import { writeRoutePages } from './route-pages.ts'

export const playerStyle: Bun.BunFile = Bun.file(new URL('../../../client/runtime/player.css', import.meta.url))

async function bundleRuntime(entry: string): Promise<string> {
  const bundle = await Bun.build({
    entrypoints: [new URL(`../../../client/runtime/${entry}.ts`, import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
    minify: true,
  })
  if (!bundle.success || !bundle.outputs[0]) throw new Error(`Could not build the browser runtime "${entry}"`)
  return bundle.outputs[0].text()
}

export function bundlePlayer(): Promise<string> {
  return bundleRuntime('player')
}

let liveHighlight: Promise<string> | undefined

export function bundleLiveHighlight(): Promise<string> {
  return liveHighlight ??= bundleRuntime('live-highlight').catch((error) => {
    liveHighlight = undefined
    throw error
  })
}

export async function deckStyles(directory: string, base: string): Promise<string | Bun.BunFile> {
  const css = Bun.file(join(directory, 'style.css'))
  if (!await css.exists()) return '/* This deck has no custom styles. */\n'
  return base === '/' ? css : prefixCssUrls(await css.text(), base)
}

export async function writeStaticSite(output: string, deck: CompiledDeck, options: {
  directory: string
  base: string
  javascript: string
}): Promise<void> {
  const { directory, base, javascript } = options
  const publicDir = join(directory, 'public')
  if (within(publicDir, output)) throw new Error('Build output must be outside the deck’s public directory')
  await mkdir(output, { recursive: true })
  if (await realpath(publicDir).catch(() => undefined))
    await cp(publicDir, output, { recursive: true })
  for (const [name, root] of Object.entries(deck.mounts)) {
    const destination = join(output, 'extensions', name)
    await mkdir(destination, { recursive: true })
    await cp(root, destination, { recursive: true })
  }
  await Promise.all([
    Bun.write(join(output, 'index.html'), deck.html),
    deck.styles ? Bun.write(join(output, 'extensions.css'), deck.styles) : undefined,
    deck.client ? Bun.write(join(output, 'extensions.js'), deck.client) : undefined,
    Bun.write(join(output, 'presentation.css'), playerStyle),
    Bun.write(join(output, 'presentation.js'), javascript),
    deck.liveHighlight ? Bun.write(join(output, 'live-highlight.js'), await bundleLiveHighlight()) : undefined,
    Bun.write(join(output, 'deck.css'), await deckStyles(directory, base)),
  ])
  await writeRoutePages(output, deck.pages)
}
