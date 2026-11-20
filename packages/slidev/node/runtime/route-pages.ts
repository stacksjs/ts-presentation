import { defaultConfig, getCachedSignalsRuntime, renderComponentWithSlot } from '@stacksjs/stx'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTemplate } from '../../../client/index.ts'
import { matchDeckPath } from '../../../client/runtime/routing.ts'
import type { PresentationRoute, RoutesSetup } from '../../../types/src/routes.ts'
import { within } from './assets.ts'
import { prefixMarkupUrls } from './base-assets.ts'
import type { ObserveDeckFile } from './deck-modules.ts'
import { importDeckModule } from './deck-modules.ts'

const pagePath = /^\/(?:[a-z\d]+(?:-[a-z\d]+)*\/)*[a-z\d]+(?:-[a-z\d]+)*$/
const builtInPaths = new Set(['/entry', '/overview', '/notes', '/preview', '/export', '/presenter', '/extensions'])
let shell: ReturnType<typeof compileTemplate> | undefined

export function routePagePath(path: string): string | undefined {
  const normalized = path.replace(/(?:\/index\.html|\/)$/, '')
  if (pagePath.test(normalized)) return normalized
}

interface RoutePageOptions {
  root: string
  roots: readonly string[]
  base: string
  title: string
  headmatter?: Readonly<Record<string, unknown>>
  routeAliases: ReadonlySet<string>
  extensionStyles: boolean
  observe: ObserveDeckFile
  optional: (path: string) => Promise<string | undefined>
}

export async function loadRoutePages(options: RoutePageOptions): Promise<ReadonlyMap<string, string>> {
  const { root, roots, base, title, headmatter, routeAliases, extensionStyles, observe, optional } = options
  const owners = new Map<PresentationRoute, string>()
  let routes: readonly PresentationRoute[] = []
  for (const directory of new Set([...roots.filter(directory => directory !== root), root])) {
    const source = join(directory, 'setup/routes.ts')
    if (await optional(source) === undefined) continue
    const path = await realpath(source)
    if (!within(directory, path)) throw new Error('setup/routes.ts must stay inside its project or extension directory')
    const { default: setup } = await importDeckModule<RoutesSetup>(path, directory, observe)
    if (typeof setup !== 'function') throw new Error('setup/routes.ts must export a setup function')
    const registered = [...routes]
    routes = await setup(registered) ?? registered
    if (!Array.isArray(routes)) throw new Error('setup/routes.ts must return a list of routes')
    for (const route of routes) {
      if (!owners.has(route)) owners.set(route, directory)
    }
  }

  const pages = new Map<string, string>()
  for (const definition of routes) {
    const directory = owners.get(definition)!
    const authoredPath = definition?.path
    const path = typeof authoredPath === 'string' ? authoredPath.replace(/\/$/, '') : ''
    if (!pagePath.test(path)) throw new Error('Expected a static route path in setup/routes.ts, such as /handbook/guide')
    const prefix = `/${path.split('/')[1]}`
    if (builtInPaths.has(prefix) || matchDeckPath(prefix, key => routeAliases.has(key)))
      throw new Error(`Custom route ${path} conflicts with a deck route`)
    if (pages.has(path)) throw new Error(`Duplicate custom route ${path}`)

    const { component, title: label } = definition
    if (!(component instanceof URL) || component.protocol !== 'file:' || component.search || component.hash)
      throw new Error(`Custom route ${path} must reference an STX file URL`)
    const file = fileURLToPath(component)
    if (!file.endsWith('.stx') || !within(directory, file)) throw new Error(`Custom route ${path} must stay inside its project or extension directory`)
    await observe(file)
    const canonical = await realpath(file)
    if (!within(directory, canonical)) throw new Error(`Custom route ${path} must stay inside its project or extension directory`)
    if (!(await Bun.file(canonical).stat()).isFile()) throw new Error(`Custom route ${path} must reference an STX file`)

    const name = 'PresentationRoutePage'
    const context = {
      __filename: `${canonical}:${path}`,
      __importedComponents: new Map([[name, canonical]]),
      deck: { title, base },
      route: { path },
      frontmatter: headmatter ?? {},
    }
    const componentsDir = join(directory, 'components')
    const stx = { ...defaultConfig, root: directory, componentsDir, partialsDir: '', layoutsDir: '', seo: { enabled: false } }
    const dependencies = new Set<string>()
    const content = await renderComponentWithSlot(canonical, {}, '', componentsDir, context, canonical, stx, undefined, dependencies, undefined, undefined, name)
    await Promise.all([...dependencies].map(observe))
    const reactive = /<script\b[^>]*\bdata-stx-scoped(?:[\s=>]|$)/i.test(content)
    shell ??= compileTemplate(new URL('../../../client/runtime/RoutePage.stx', import.meta.url))
    const render = await shell
    pages.set(path, render({
      title: typeof label === 'string' ? label : title,
      base: base === '/' ? '../'.repeat(path.split('/').length - 1) : base,
      content: prefixMarkupUrls(content, base),
      extensionStyles: extensionStyles ? '<link rel="stylesheet" href="extensions.css">' : '',
      stxRuntime: reactive ? `<script>${await getCachedSignalsRuntime()}</script>` : '',
    }))
  }
  return pages
}

export async function writeRoutePages(output: string, pages: ReadonlyMap<string, string>): Promise<void> {
  async function stat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
    try { return await lstat(path) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  for (const [path, html] of pages) {
    let directory = output
    for (const segment of path.slice(1).split('/')) {
      directory = join(directory, segment)
      const existing = await stat(directory)
      if (!existing) await mkdir(directory)
      else if (!existing.isDirectory()) throw new Error(`Cannot build custom route ${path}: ${directory} is not a directory`)
    }
    const file = join(directory, 'index.html')
    const existing = await stat(file)
    if (existing && !existing.isFile()) throw new Error(`Cannot build custom route ${path}: ${file} is not a regular file`)
    await Bun.write(file, html)
  }
}
