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

export async function loadBrowserSetups(
  root: string,
  extensions: readonly string[],
  observe: ObserveDeckFile,
  observeOptional: (path: string) => Promise<string | undefined>,
): Promise<string> {
  const kinds = ['shortcuts', 'code-runners'] as const
  const setups: Record<typeof kinds[number], string[]> = { shortcuts: [], 'code-runners': [] }
  for (const directory of new Set([...extensions.filter(directory => directory !== root), root])) {
    for (const kind of kinds) {
      const path = join(directory, 'setup', `${kind}.ts`)
      if (await observeOptional(path) === undefined) continue
      const canonical = await realpath(path)
      if (!within(directory, canonical)) throw new Error(`${path} must stay inside its deck or extension directory`)
      setups[kind].push(canonical)
    }
  }
  if (!kinds.some(kind => setups[kind].length)) return ''

  const contents: string[] = []
  function importSetups(kind: typeof kinds[number], prefix: string): string {
    const names = setups[kind].map((path, index) => {
      const name = `${prefix}${index}`
      contents.push(`import ${name} from ${JSON.stringify(path)};`)
      return name
    })
    return `[${names.join(', ')}]`
  }
  if (setups.shortcuts.length) {
    const shortcuts = importSetups('shortcuts', 'shortcut')
    contents.push(`window.presentationShortcutSetups = ${shortcuts};`)
  }
  if (setups['code-runners'].length) {
    const runners = importSetups('code-runners', 'runner')
    const highlight = fileURLToPath(new URL('../../../client/runtime/runner-highlight.ts', import.meta.url))
    contents.push(`import { highlight, prepareHighlight } from ${JSON.stringify(highlight)};`)
    contents.push(`window.presentationCodeRunners = { setups: ${runners}, highlight, prepareHighlight };`)
  }
  const types = fileURLToPath(new URL('../../../types/src/index.ts', import.meta.url))
  return bundleExtensionClient('presentation:setups', root, observe, 'browser setup files', [{
    name: 'presentation-setups',
    setup(build) {
      build.onResolve({ filter: /^presentation:setups$/ }, () => ({ path: 'setups', namespace: 'presentation' }))
      build.onLoad({ filter: /^setups$/, namespace: 'presentation' }, () => ({
        contents: contents.join('\n'),
        loader: 'js',
      }))
      build.onResolve({ filter: /^(?:ts-presentation(?:\/types)?|@slidev\/types)$/ }, () => ({ path: types }))
    },
  }])
}
