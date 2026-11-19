import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { within } from './assets.ts'

export type ObserveDeckFile = (path: string) => Promise<string>

interface Imports {
  revision: string
  paths: string[]
}

const remembered = new Map<string, Imports>()
const loaded = new Map<string, Map<string, string>>()
const runtimeRevisions = new Map<string, string>()
const transpiler = new Bun.Transpiler({ loader: 'tsx' })

export async function importDeckModule<T>(entry: string, root: string, observe: ObserveDeckFile): Promise<{ default?: T }> {
  entry = await realpath(entry)
  const files = new Map<string, Imports>()
  async function scan(path: string): Promise<void> {
    if (files.has(path)) return
    const revision = await observe(path)
    let imports = remembered.get(path)
    if (imports?.revision !== revision) {
      const paths: string[] = []
      if (/^\.[cm]?[jt]sx?$/.test(extname(path))) {
        const resolve = createRequire(path).resolve
        for (const { path: source } of transpiler.scanImports(await Bun.file(path).text())) {
          if (!source.startsWith('./') && !source.startsWith('../')) continue
          try {
            paths.push(resolve(source))
          }
          catch {
            // Bun reports missing imports when evaluating the author’s module.
          }
        }
      }
      imports = { revision, paths }
      remembered.set(path, imports)
    }
    files.set(path, imports)
    for (const dependency of imports.paths) {
      if (within(root, dependency)) await scan(dependency)
    }
  }
  await scan(entry)

  // Bun keys its ESM cache by canonical file path. Invalidate an importer
  // alongside its changed dependencies so named imports are rebound.
  const previous = loaded.get(entry)
  const changed = new Set<string>()
  const importers = new Map<string, string[]>()
  for (const [path, { revision, paths }] of files) {
    const known = previous?.get(path) ?? runtimeRevisions.get(path)
    if (known !== undefined && known !== revision) changed.add(path)
    for (const dependency of paths) {
      const parents = importers.get(dependency) ?? []
      parents.push(path)
      importers.set(dependency, parents)
    }
  }
  for (const path of changed) {
    for (const importer of importers.get(path) ?? []) changed.add(importer)
  }
  for (const path of changed) delete require.cache[path]
  const result = await import(pathToFileURL(entry).href) as { default?: T }
  const revisions = new Map<string, string>()
  for (const [path, { revision }] of files) {
    runtimeRevisions.set(path, revision)
    revisions.set(path, revision)
  }
  loaded.set(entry, revisions)
  return result
}
