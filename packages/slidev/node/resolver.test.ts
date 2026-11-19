import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { computeInvocationSearchPaths, findInvocationNodeModulesPath, findWorkspaceRoot, resolveDeckEntry, resolveExtension } from './runtime/extension-resolver.ts'

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-resolver-')))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

async function install(root: string, name: string): Promise<string> {
  const directory = join(root, 'node_modules', name)
  const entry = join(directory, 'dist', 'index.mjs')
  await Bun.write(join(directory, 'package.json'), JSON.stringify({ name, exports: './dist/index.mjs' }))
  await Bun.write(entry, 'export default { name: "fixture" }')
  return entry
}

describe('extension package resolution', () => {
  it.each([
    ['official', '@slidev/theme-official'],
    ['community', 'slidev-theme-community'],
    ['slidev-theme-full', 'slidev-theme-full'],
    ['@slidev/theme-scoped', '@slidev/theme-scoped'],
    ['ours', 'ts-presentation-theme-ours'],
  ])('resolves %s through package exports', (reference, name) => project(async (root) => {
    const entry = await install(root, name)
    expect(await resolveExtension(reference, 'theme', root)).toEqual({
      name, entry, root: dirname(dirname(entry)),
    })
  }))

  it('resolves local extension directories and deck-root aliases', () => project(async (root) => {
    const entry = join(root, 'themes', 'practice', 'index.ts')
    await Bun.write(entry, 'export default { name: "practice" }')
    expect((await resolveExtension('practice', 'theme', root))?.entry).toBe(entry)
    expect((await resolveExtension('@/themes/practice', 'theme', root))?.entry).toBe(entry)
  }))

  it.each(['bad!(name)', 'evil\\package', 'UpperCase', '@scope/foo/bar', '@scope/../escape', ''])('rejects invalid package name %j', (name) => project(async (root) => {
    await expect(resolveExtension(name, 'theme', root)).rejects.toThrow('Invalid theme name')
  }))

  it('names the addon kind in package validation errors', () => project(async (root) => {
    await expect(resolveExtension('invalid&name', 'addon', root)).rejects.toThrow('Invalid addon name')
  }))

  it('prefers the deck project before a global installation', () => project(async (root) => {
    const deck = join(root, 'deck')
    const global = join(root, 'global')
    const name = 'ts-presentation-theme-rehearsal'
    const local = await install(deck, name)
    await install(global, name)
    const bin = await install(global, 'ts-presentation')
    expect((await resolveExtension('rehearsal', 'theme', deck, bin))?.entry).toBe(local)
    await rm(join(deck, 'node_modules'), { recursive: true })
    expect((await resolveExtension('rehearsal', 'theme', deck, bin))?.root).toBe(join(global, 'node_modules', name))
  }))
})

describe('invocation paths', () => {
  it('returns no path for missing arguments', () => {
    expect(findInvocationNodeModulesPath(undefined)).toBeUndefined()
    expect(findInvocationNodeModulesPath('')).toBeUndefined()
  })

  it.each([
    'global/v11/group/node_modules/ts-presentation/src/cli.ts',
    'global/node_modules/ts-presentation/src/cli.ts',
    'project/node_modules/.bin/ts-presentation',
    'project/node_modules/vendor/node_modules/ts-presentation/src/cli.ts',
  ])('takes the nearest package directory from %s', path => project(async root => {
    const executable = join(root, path)
    const expected = executable.slice(0, executable.lastIndexOf('node_modules') + 'node_modules'.length)
    expect(findInvocationNodeModulesPath(executable)).toBe(expected)
  }))

  it('follows absolute, relative, and multi-hop links and stops at cycles', () => project(async (root) => {
    const executable = join(root, 'global/node_modules/ts-presentation/src/cli.ts')
    await Bun.write(executable, '')
    await symlink(executable, join(root, 'absolute'))
    await symlink('./absolute', join(root, 'relative'))
    expect(findInvocationNodeModulesPath(join(root, 'absolute'))).toBe(join(root, 'global/node_modules'))
    expect(findInvocationNodeModulesPath(join(root, 'relative'))).toBe(join(root, 'global/node_modules'))
    await symlink('cycle-b', join(root, 'cycle-a'))
    await symlink('cycle-a', join(root, 'cycle-b'))
    expect(findInvocationNodeModulesPath(join(root, 'cycle-a'))).toBeUndefined()
    expect(findInvocationNodeModulesPath(join(root, 'nonexistent'))).toBeUndefined()
    const regular = join(root, 'regular')
    await Bun.write(regular, '')
    expect(findInvocationNodeModulesPath(regular)).toBeUndefined()
    for (let index = 0; index < 18; index++) await symlink('chain-' + (index + 1), join(root, 'chain-' + index))
    await symlink(executable, join(root, 'chain-18'))
    expect(findInvocationNodeModulesPath(join(root, 'chain-0'))).toBeUndefined()
  }))

  it('finds packages across pnpm isolated global install groups', () => project(async (root) => {
    const global = join(root, 'pnpm', 'v11')
    const core = await install(join(global, 'core'), 'ts-presentation')
    const theme = await install(join(global, 'extra'), 'ts-presentation-theme-review')
    await mkdir(join(global, 'other'), { recursive: true })
    const own = join(global, 'core', 'node_modules')
    expect(computeInvocationSearchPaths(own)).toEqual([own, join(global, 'extra', 'node_modules')])
    expect(computeInvocationSearchPaths(undefined)).toEqual([])
    expect(computeInvocationSearchPaths(join(root, 'missing', 'core', 'node_modules'))).toEqual([join(root, 'missing', 'core', 'node_modules')])
    expect((await resolveExtension('review', 'theme', root, core))?.entry).toBe(theme)
  }))
})

describe('deck entries and workspace roots', () => {
  it('accepts deck directories and extensionless Markdown paths', () => project(async (root) => {
    const file = join(root, 'slides.md')
    await Bun.write(file, '# Rehearsal')
    expect(await resolveDeckEntry(root)).toBe(file)
    expect(await resolveDeckEntry(join(root, 'slides'))).toBe(file)
    await expect(resolveDeckEntry(join(root, 'missing'))).rejects.toThrow('Could not find presentation entry')
  }))

  it('recognizes declared members and respects workspace exclusions', () => project(async (root) => {
    await Bun.write(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*', '!packages/private'] }))
    expect(await findWorkspaceRoot(join(root, 'packages/public/demo'))).toBe(root)
    expect(await findWorkspaceRoot(join(root, 'packages/private/demo'))).toBe(join(root, 'packages/private/demo'))
    expect(await findWorkspaceRoot(join(root, 'separate/demo'))).toBe(join(root, 'separate/demo'))
  }))
})
