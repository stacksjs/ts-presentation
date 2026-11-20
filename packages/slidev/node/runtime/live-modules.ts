import { realpath, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { within } from './assets.ts'
import type { CompileLiveCode } from './compile-code.ts'
import { compileLiveCode, maxModuleLength } from './compile-code.ts'

const loaders = {
  '.ts': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.json': 'json',
} as const
const moduleExtensions = Object.keys(loaders)
const entry = 'presentation-live:example'
const namespace = 'presentation-live'

function moduleLoader(path: string) {
  return loaders[extname(path) as keyof typeof loaders]
}

export function createLiveCodeCompiler(
  root: string,
  configured: unknown,
  watch: (path: string) => Promise<unknown>,
): { authored: CompileLiveCode, edited: CompileLiveCode } {
  const snippets = join(root, 'snippets')
  const authorized = new Set(Array.isArray(configured) ? configured.filter(value => typeof value === 'string') : [])

  async function resolveLocal(specifier: string, directory: string, observe: boolean): Promise<string> {
    if (!/^\.\.?\//.test(specifier) || /[?#\\\0]/.test(specifier))
      throw new Error(`Live code module must be a relative path: ${specifier}`)
    const path = resolve(directory, specifier)
    if (!within(root, path)) throw new Error(`Live code module leaves the deck directory: ${specifier}`)
    const extension = extname(path)
    const candidates = extension
      ? [path, ...(extension === '.js' ? [path.slice(0, -3) + '.ts'] : [])]
      : [...moduleExtensions.map(ext => path + ext), ...moduleExtensions.map(ext => join(path, `index${ext}`))]
    for (const file of candidates) {
      if (!moduleLoader(file)) continue
      const canonical = await realpath(file).catch(() => undefined)
      if (canonical && !within(root, canonical)) throw new Error(`Live code module leaves the deck directory: ${specifier}`)
      if (observe) await watch(file)
      if (canonical && moduleLoader(canonical) && (await stat(canonical)).isFile()) {
        if (observe && canonical !== file) await watch(canonical)
        return canonical
      }
    }
    throw new Error(`Live code module not found: ${specifier}`)
  }

  function create(observe: boolean): CompileLiveCode {
    return (source, language) => compileLiveCode(source, language, async (imports) => {
      const config = {
        entrypoints: [entry],
        target: 'browser',
        format: 'esm',
        env: 'disable',
        // Bun's JavaScript API accepts this flag to keep module evaluation in the browser.
        macros: false,
        allowUnresolved: [],
        minify: { whitespace: true },
        throw: false,
        plugins: [{
          name: namespace,
          setup(build) {
            build.onResolve({ filter: /.*/ }, async ({ path, importer }) => {
              if (!importer && path === entry) return { path: entry, namespace }
              const fromExample = importer === entry
              if (fromExample && !observe && !authorized.has(path))
                throw new Error(`Live code import is not declared in the deck: ${path}`)
              return { path: await resolveLocal(path, fromExample ? snippets : dirname(importer), observe), namespace }
            })
            build.onLoad({ filter: /.*/, namespace }, async ({ path }) => {
              if (path === entry) return { contents: source, loader: language }
              const file = Bun.file(path)
              if ((await file.stat()).size > maxModuleLength)
                throw new Error(`Live code module is too large: ${relative(root, path)}`)
              return { contents: await file.text(), loader: moduleLoader(path) }
            })
          },
        }],
      } satisfies Bun.BuildConfig & { macros: false }
      const bundle = await Bun.build(config)
      if (!bundle.success) {
        const details = [...new Set(bundle.logs.map(log => log.message))].join('\n')
        throw new Error(details || 'Could not bundle the live code module.')
      }
      const [output] = bundle.outputs
      if (!output?.path.endsWith('.js') || bundle.outputs.length !== 1)
        throw new Error('Live code modules must bundle into a single JavaScript file.')
      if (output.size > maxModuleLength) throw new Error('Live code bundle is too large.')
      if (observe) for (const specifier of imports) authorized.add(specifier)
      return { code: await output.text(), module: true }
    })
  }

  return { authored: create(true), edited: create(false) }
}
