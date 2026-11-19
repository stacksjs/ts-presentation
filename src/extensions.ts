import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DrawingOptions } from './drawings.ts'
import type { Deck, Slide } from './index.ts'

export interface LayoutContext {
  slide: Readonly<Slide>
  index: number
  html: string
  slots: Readonly<Record<string, string>>
}

export interface PresentationAddon {
  name: string
  /** Inline CSS compiled before the deck's own stylesheet. */
  styles?: string
  /** Files and directories resolve relative to the module that exports the addon. */
  styleFile?: string | URL
  client?: string | URL
  assets?: string | URL
  layouts?: Readonly<Record<string, (context: LayoutContext) => string>>
  transformSlide?: (slide: Readonly<Slide>, index: number) => Slide | Promise<Slide>
  renderCode?: (code: string, language: string, slide: Readonly<Slide>) => string | undefined
  globalTop?: string
  globalBottom?: string
}

export interface PresentationTheme extends PresentationAddon {
  defaults?: { layout?: string, className?: string, drawings?: DrawingOptions }
}

export interface ExtensionAssets {
  styles: string
  client: string
  mounts: Record<string, string>
}

export interface LoadedExtensions extends ExtensionAssets {
  theme: PresentationTheme
  addons: PresentationAddon[]
}

export function defineTheme(theme: PresentationTheme): PresentationTheme {
  return theme
}

export function defineAddon(addon: PresentationAddon): PresentationAddon {
  return addon
}

const builtin: Record<string, PresentationTheme> = {
  default: { name: 'default' },
  paper: {
    name: 'paper',
    styles: `
      [data-theme="paper"] .slide { background: #f5f1e9; color: #202831; color-scheme: light }
      [data-theme="paper"] .slide h1 { color: #164f57; letter-spacing: -.035em }
      [data-theme="paper"] .slide a { color: #16637a }
      [data-theme="paper"] .slide .slide-diagram { background: #182533; border-radius: .35em }
      [data-theme="paper"] .slide .live-code { color: #edf5ff; color-scheme: dark }
      [data-theme="paper"] .slide pre { color: #edf5ff }
    `,
  },
  serif: {
    name: 'serif',
    styles: `
      [data-theme="serif"] .slide { background: #201924; color: #f3eadd; font-family: Georgia, serif }
      [data-theme="serif"] .slide h1 { color: #f9cf9b; letter-spacing: -.035em }
      [data-theme="serif"] .slide a { color: #f9cf9b }
    `,
  },
}

async function localEntry(candidate: string): Promise<string | undefined> {
  const info = await stat(candidate).catch(() => undefined)
  if (info?.isFile()) return realpath(candidate)
  const possible = info?.isDirectory()
    ? ['index.ts', 'index.js', 'index.mjs'].map(name => join(candidate, name))
    : ['.ts', '.js', '.mjs'].map(extension => candidate + extension)
  for (const path of possible) {
    if (await stat(path).then(info => info.isFile()).catch(() => false)) return realpath(path)
  }
}

async function extensionEntry(reference: string, kind: 'theme' | 'addon', directory: string): Promise<string> {
  const local = reference.startsWith('.') || isAbsolute(reference)
    ? resolve(directory, reference)
    : join(directory, `${kind}s`, reference)
  const path = await localEntry(local)
  if (path) return path
  if (reference.startsWith('.') || isAbsolute(reference)) throw new Error(`Could not find presentation ${kind}: ${reference}`)

  const from = pathToFileURL(join(directory, 'slides.md')).href
  for (const name of [reference, `ts-presentation-${kind}-${reference}`]) {
    try {
      const url = new URL(import.meta.resolve(name, from))
      if (url.protocol === 'file:') return await realpath(fileURLToPath(url))
    }
    catch {
      // The next convention may resolve the installed package.
    }
  }
  throw new Error(`Could not find presentation ${kind}: ${reference}`)
}

function moduleAsset(module: string, value: string | URL): string {
  return value instanceof URL ? fileURLToPath(value) : resolve(dirname(module), value)
}

export async function loadExtensions(
  deck: Deck,
  directory: string,
  observe: (path: string) => Promise<string>,
  override?: string,
): Promise<LoadedExtensions> {
  const themeName = override ?? (typeof deck.headmatter?.theme === 'string' ? deck.headmatter.theme : 'default')
  const rawAddons = deck.headmatter?.addons ?? []
  const addons = typeof rawAddons === 'string' ? [rawAddons] : rawAddons
  if (!Array.isArray(addons) || addons.some(name => typeof name !== 'string'))
    throw new Error('Presentation addons must be a string or a list of names')
  const seen = new Set<string>()
  const styles: string[] = []
  const scripts: string[] = []
  const mounts: Record<string, string> = Object.create(null)

  async function load(reference: string, kind: 'theme' | 'addon'): Promise<PresentationTheme> {
    const core = kind === 'theme' && Object.hasOwn(builtin, reference) ? builtin[reference] : undefined
    if (core) {
      seen.add(core.name)
      if (core.styles) styles.push(core.styles)
      return core
    }

    const entry = await extensionEntry(reference, kind, directory)
    const data = (await import(pathToFileURL(entry).href)).default as PresentationTheme | undefined
    if (!data || typeof data.name !== 'string' || !/^[a-z][a-z0-9-]+$/i.test(data.name))
      throw new Error(`Presentation ${kind} ${reference} requires a default export with a name`)
    if (seen.has(data.name)) throw new Error(`Duplicate presentation extension: ${data.name}`)
    seen.add(data.name)
    if (data.styles) styles.push(data.styles)
    if (data.styleFile) {
      const path = moduleAsset(entry, data.styleFile)
      await observe(path)
      styles.push(await Bun.file(path).text())
    }
    if (data.client) {
      const path = moduleAsset(entry, data.client)
      await observe(path)
      const client = await Bun.build({ entrypoints: [path], root: dirname(path), target: 'browser', format: 'iife', minify: true, metafile: true })
      if (!client.success) throw new AggregateError(client.logs, `Could not build ${data.name}'s client module`)
      const script = client.outputs.find(output => output.path.endsWith('.js'))
      if (!script || client.outputs.length !== 1) throw new Error(`Use ${data.name}'s styleFile and assets fields for non-JavaScript files`)
      scripts.push(await script.text())
      for (const input of Object.keys(client.metafile?.inputs ?? {})) {
        const inputPath = resolve(dirname(path), input)
        if (await Bun.file(inputPath).exists()) await observe(inputPath)
      }
    }
    if (data.assets) {
      const assetDirectory = await realpath(moduleAsset(entry, data.assets))
      if (!(await stat(assetDirectory)).isDirectory()) throw new Error(`Expected a public assets directory for ${data.name}`)
      mounts[data.name] = assetDirectory
    }
    return data
  }

  const theme = await load(themeName, 'theme')
  const loadedAddons = []
  for (const name of addons) loadedAddons.push(await load(name, 'addon'))
  return { theme, addons: loadedAddons, styles: styles.join('\n'), client: scripts.join('\n;\n'), mounts }
}
