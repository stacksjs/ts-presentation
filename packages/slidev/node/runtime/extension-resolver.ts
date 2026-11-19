import { lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type ExtensionKind = 'theme' | 'addon'

export interface ResolvedExtension {
  name: string
  entry: string
  root: string
}

const packageName = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

// Adapted from Slidev's package resolver (MIT).
export function findInvocationNodeModulesPath(argument: string | undefined): string | undefined {
  if (!argument) return
  let current = resolve(argument)
  const segment = `${sep}node_modules${sep}`
  const seen = new Set<string>()
  for (let hop = 0; hop <= 16 && !seen.has(current); hop++) {
    const boundary = current.lastIndexOf(segment)
    if (boundary >= 0) return current.slice(0, boundary + segment.length - sep.length)
    seen.add(current)
    try {
      if (!lstatSync(current).isSymbolicLink()) return
      current = resolve(dirname(current), readlinkSync(current))
    }
    catch { return }
  }
}

export function computeInvocationSearchPaths(ownModules: string | undefined): string[] {
  if (!ownModules) return []
  const install = dirname(ownModules)
  const parent = dirname(install)
  const paths = [ownModules]
  if (parent === install) return paths
  try {
    for (const sibling of readdirSync(parent).sort()) {
      const directory = join(parent, sibling, 'node_modules')
      if (directory === ownModules) continue
      try {
        if (lstatSync(directory).isDirectory()) paths.push(directory)
      }
      catch {}
    }
  }
  catch {}
  return paths
}

export async function findWorkspaceRoot(directory: string): Promise<string> {
  for (let current = directory; ; current = dirname(current)) {
    const manifest = Bun.file(join(current, 'package.json'))
    const pnpm = Bun.file(join(current, 'pnpm-workspace.yaml'))
    const data = await manifest.json().catch(() => undefined)
    const workspaces = data?.workspaces?.packages ?? data?.workspaces
    const pnpmConfig = await pnpm.text().then(text => Bun.YAML.parse(text) as { packages?: unknown } | undefined).catch(() => undefined)
    const patterns = pnpmConfig?.packages ?? workspaces
    if (Array.isArray(patterns)) {
      const includes = patterns.filter(pattern => typeof pattern === 'string' && !pattern.startsWith('!')).map(pattern => new Bun.Glob(pattern))
      const excludes = patterns.filter(pattern => typeof pattern === 'string' && pattern.startsWith('!')).map(pattern => new Bun.Glob(pattern.slice(1)))
      for (let candidate = directory; candidate !== current; candidate = dirname(candidate)) {
        const member = relative(current, candidate).split(sep).join('/')
        if (excludes.some(pattern => pattern.match(member))) break
        if (includes.some(pattern => pattern.match(member))) return current
      }
    }
    if (dirname(current) === current) return directory
  }
}

export async function resolveDeckEntry(argument: string): Promise<string> {
  const requested = resolve(argument)
  const metadata = await stat(requested).catch(() => undefined)
  const candidates = metadata?.isDirectory() ? [join(requested, 'slides.md')] : [
    requested,
    ...(requested.endsWith('.md') ? [] : [`${requested}.md`]),
  ]
  for (const file of candidates) {
    if ((await stat(file).catch(() => undefined))?.isFile()) return realpath(file)
  }
  throw new Error(`Could not find presentation entry: ${argument}`)
}

async function localEntry(candidate: string): Promise<string | undefined> {
  const metadata = await stat(candidate).catch(() => undefined)
  if (metadata?.isFile()) return realpath(candidate)
  const paths = metadata?.isDirectory()
    ? ['index.ts', 'index.js', 'index.mjs', 'index.cjs'].map(name => join(candidate, name))
    : ['.ts', '.js', '.mjs', '.cjs'].map(extension => candidate + extension)
  for (const path of paths) {
    if ((await stat(path).catch(() => undefined))?.isFile()) return realpath(path)
  }
}

async function packageRoot(entry: string): Promise<string> {
  for (let current = dirname(entry); ; current = dirname(current)) {
    if (await Bun.file(join(current, 'package.json')).exists()) return current
    if (dirname(current) === current) return dirname(entry)
  }
}

export async function resolveExtension(
  reference: string,
  type: ExtensionKind,
  directory: string,
  invocation: string | undefined = process.argv[1],
): Promise<ResolvedExtension | undefined> {
  const explicit = isAbsolute(reference) || reference.startsWith('./') || reference.startsWith('../') || reference.startsWith('@/')
  if (!explicit && !packageName.test(reference))
    throw new Error(`Invalid ${type} name "${reference}". Only valid npm package names are allowed.`)
  const local = explicit
    ? resolve(directory, reference.startsWith('@/') ? reference.slice(2) : reference)
    : join(directory, `${type}s`, reference)
  const found = await localEntry(local)
  if (found) return { name: reference, entry: found, root: dirname(found) }
  if (explicit) return

  const names = reference.startsWith('@') ? [reference] : [
    `ts-presentation-${type}-${reference}`,
    `@slidev/${type}-${reference}`,
    `slidev-${type}-${reference}`,
    reference,
  ]
  const own = findInvocationNodeModulesPath(invocation)
  const pnpmGlobal = own && /^v\d+$/.test(dirname(dirname(own)).split(sep).at(-1) ?? '')
  const parentModules = pnpmGlobal ? computeInvocationSearchPaths(own) : own ? [own] : []
  const locations = new Set([directory, ...parentModules.map(path => dirname(path))])
  for (const location of locations) {
    const from = pathToFileURL(join(location, 'slides.md')).href
    for (const name of names) {
      try {
        const url = new URL(import.meta.resolve(name, from))
        if (url.protocol !== 'file:') continue
        const entry = await realpath(fileURLToPath(url))
        return { name, entry, root: await packageRoot(entry) }
      }
      catch {}
    }
  }
}
