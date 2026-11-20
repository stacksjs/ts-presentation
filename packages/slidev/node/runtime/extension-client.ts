import { realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BunPlugin } from 'bun'
import type { ObserveDeckFile } from './deck-modules.ts'
import { within } from './assets.ts'

export async function bundleExtensionClient(entry: string, root: string, observe: ObserveDeckFile, label: string, plugins?: BunPlugin[]): Promise<string> {
  const client = await Bun.build({
    entrypoints: [entry],
    root,
    target: 'browser',
    format: 'iife',
    minify: true,
    metafile: true,
    plugins,
    throw: false,
  })
  if (!client.success) throw new Error(`Could not build ${label}\n${client.logs.join('\n')}`)
  const [script] = client.outputs
  if (!script?.path.endsWith('.js') || client.outputs.length !== 1)
    throw new Error(`${label} must bundle into a single JavaScript file`)
  for (const input of Object.keys(client.metafile?.inputs ?? {})) {
    // Bun reports metafile inputs relative to the process directory.
    const path = resolve(input)
    if (await Bun.file(path).exists()) await observe(path)
  }
  return script.text()
}

export async function loadShortcutClient(
  root: string,
  extensions: readonly string[],
  observe: ObserveDeckFile,
  observeOptional: (path: string) => Promise<string | undefined>,
): Promise<string> {
  const setupPaths: string[] = []
  for (const directory of new Set([...extensions.filter(directory => directory !== root), root])) {
    const path = join(directory, 'setup', 'shortcuts.ts')
    if (await observeOptional(path) === undefined) continue
    const canonical = await realpath(path)
    if (!within(directory, canonical)) throw new Error(`${path} must stay inside its deck or extension directory`)
    setupPaths.push(canonical)
  }
  if (!setupPaths.length) return ''

  const contents = setupPaths.map((path, index) => `import setup${index} from ${JSON.stringify(path)};`)
  contents.push(`window.presentationShortcutSetups = [${setupPaths.map((_, index) => `setup${index}`).join(', ')}];`)
  const types = fileURLToPath(new URL('../../../types/src/shortcuts.ts', import.meta.url))
  return bundleExtensionClient('presentation:shortcuts', root, observe, 'setup/shortcuts.ts', [{
    name: 'presentation-shortcuts',
    setup(build) {
      build.onResolve({ filter: /^presentation:shortcuts$/ }, () => ({ path: 'shortcuts', namespace: 'presentation' }))
      build.onLoad({ filter: /^shortcuts$/, namespace: 'presentation' }, () => ({
        contents: contents.join('\n'),
        loader: 'js',
      }))
      build.onResolve({ filter: /^(?:ts-presentation(?:\/types)?|@slidev\/types)$/ }, () => ({ path: types }))
    },
  }])
}
