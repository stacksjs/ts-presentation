import { compileLayoutTemplate } from '../../../client/index.ts'
import { realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FontOptions, Headmatter } from '../../../types/src/frontmatter.ts'
import type { DrawingOptions } from '../../../types/src/drawings.ts'
import type { Deck, Slide } from './index.ts'
import { importDeckModule } from './deck-modules.ts'
import { bundleExtensionClient } from './extension-client.ts'
import { within } from './assets.ts'
import { resolveExtension } from './extension-resolver.ts'

export interface LayoutContext {
  slide: Readonly<Slide>
  index: number
  html: string
  slots: Readonly<Record<string, string>>
}

export type PresentationLayout = (context: LayoutContext) => string | Promise<string>

export interface PresentationAddon {
  name: string
  /** Inline CSS compiled before the deck's own stylesheet. */
  styles?: string
  /** Files and directories resolve relative to the module that exports the addon. */
  styleFile?: string | URL
  client?: string | URL
  assets?: string | URL
  layouts?: Readonly<Record<string, PresentationLayout>>
  transformSlide?: (slide: Readonly<Slide>, index: number) => Slide | Promise<Slide>
  renderCode?: (code: string, language: string, slide: Readonly<Slide>) => string | undefined
  globalTop?: string
  globalBottom?: string
}

export interface PresentationTheme extends PresentationAddon {
  defaults?: Pick<Headmatter, 'timer' | 'duration'> & {
    layout?: string
    className?: string
    drawings?: DrawingOptions
    fonts?: FontOptions
    addons?: string | string[]
  }
}

export interface ExtensionAssets {
  styles: string
  client: string
  mounts: Record<string, string>
}

export interface LoadedExtensions extends ExtensionAssets {
  theme: PresentationTheme
  addons: PresentationAddon[]
  roots?: string[]
  references?: { theme: string, addons: string[] }
}

const stxLayouts = new WeakMap<PresentationLayout, (observe: (path: string) => Promise<string>) => Promise<void>>()

export function defineStxLayout(template: URL): PresentationLayout {
  let revision: string | undefined
  let renderer: ReturnType<typeof compileLayoutTemplate> | undefined
  const layout: PresentationLayout = async ({ html, slots, slide, index }) => {
    renderer ??= compileLayoutTemplate(template)
    const render = await renderer
    return render({ slots: { ...slots, default: html }, frontmatter: slide.frontmatter ?? {}, title: slide.title, slideNumber: index + 1 })
  }
  stxLayouts.set(layout, async (observe) => {
    const next = await observe(fileURLToPath(template))
    if (revision !== next) renderer = undefined
    revision = next
  })
  return layout
}

export function defineTheme(theme: PresentationTheme): PresentationTheme {
  return theme
}

export function defineAddon(addon: PresentationAddon): PresentationAddon {
  return addon
}

const builtin: Record<string, PresentationTheme> = {
  default: { name: 'default' },
  none: { name: 'none' },
  paper: {
    name: 'paper',
    styles: `
      [data-theme="paper"]:not(.dark) .slide { background: #f5f1e9; color: #202831; color-scheme: light }
      [data-theme="paper"]:not(.dark) .slide h1 { color: #164f57; letter-spacing: -.035em }
      [data-theme="paper"]:not(.dark) .slide a { color: #16637a }
      [data-theme="paper"] .slide .slide-diagram { background: #182533; border-radius: .35em }
      [data-theme="paper"] .slide .live-code { color: #edf5ff; color-scheme: dark }
      [data-theme="paper"] .slide pre { color: #edf5ff }
    `,
  },
  serif: {
    name: 'serif',
    styles: `
      [data-theme="serif"] .slide { background: #201924; color: #f3eadd; font-family: var(--presentation-font-serif, Georgia, serif) }
      [data-theme="serif"] .slide h1 { color: #f9cf9b; letter-spacing: -.035em }
      [data-theme="serif"] .slide a { color: #f9cf9b }
    `,
  },
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
  const config = deck.headmatter?.config as Record<string, unknown> | undefined
  const specifiedTheme = deck.headmatter?.theme === undefined ? config?.theme : deck.headmatter.theme
  const themeName = override ?? (specifiedTheme === null ? 'none' : typeof specifiedTheme === 'string' ? specifiedTheme : 'default')
  const seen = new Set<string>()
  const styles: string[] = []
  const scripts: string[] = []
  const roots = new Set<string>()
  const mounts: Record<string, string> = Object.create(null)

  async function load(reference: string, kind: 'theme' | 'addon'): Promise<PresentationTheme> {
    const core = kind === 'theme' && Object.hasOwn(builtin, reference) ? builtin[reference] : undefined
    if (core) {
      seen.add(core.name)
      if (core.styles) styles.push(core.styles)
      return core
    }

    const resolved = await resolveExtension(reference, kind, directory)
    if (!resolved) throw new Error(`Could not find presentation ${kind}: ${reference}`)
    const { entry, root } = resolved
    roots.add(root)
    const { default: data } = await importDeckModule<PresentationTheme>(entry, within(directory, root) ? directory : root, observe)
    if (!data || typeof data.name !== 'string' || !/^[a-z][a-z0-9-]+$/i.test(data.name))
      throw new Error(`Presentation ${kind} ${reference} requires a default export with a name`)
    if (seen.has(data.name)) throw new Error(`Duplicate presentation extension: ${data.name}`)
    seen.add(data.name)
    if (data.styles) styles.push(data.styles)
    for (const layout of Object.values(data.layouts ?? {})) await stxLayouts.get(layout)?.(observe)
    if (data.styleFile) {
      const path = moduleAsset(entry, data.styleFile)
      await observe(path)
      styles.push(await Bun.file(path).text())
    }
    if (data.client) {
      const path = moduleAsset(entry, data.client)
      await observe(path)
      scripts.push(await bundleExtensionClient(path, dirname(path), observe, `${data.name}'s client module`))
    }
    if (data.assets) {
      const assetDirectory = await realpath(moduleAsset(entry, data.assets))
      if (!(await stat(assetDirectory)).isDirectory()) throw new Error(`Expected a public assets directory for ${data.name}`)
      mounts[data.name] = assetDirectory
    }
    return data
  }

  const theme = await load(themeName, 'theme')
  const rawAddons = deck.headmatter?.addons ?? config?.addons ?? theme.defaults?.addons ?? []
  const addons = typeof rawAddons === 'string' ? [rawAddons] : rawAddons
  if (!Array.isArray(addons) || addons.some(name => typeof name !== 'string'))
    throw new Error('Presentation addons must be a string or a list of names')
  const loadedAddons = []
  for (const name of addons) loadedAddons.push(await load(name, 'addon'))
  return { theme, addons: loadedAddons, roots: [...roots], references: { theme: themeName, addons }, styles: styles.join('\n'), client: scripts.join('\n;\n'), mounts }
}
