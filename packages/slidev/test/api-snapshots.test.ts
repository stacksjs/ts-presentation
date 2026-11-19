import { afterAll, beforeAll, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../../../', import.meta.url))
let declarations: string | undefined

beforeAll(async () => {
  declarations = await mkdtemp(join(tmpdir(), 'presentation-api-'))
  const tsc = Bun.which('tsc', { PATH: join(project, 'node_modules', '.bin') })
  if (!tsc) throw new Error('The TypeScript compiler bundled by better-dx is unavailable')
  const command = Bun.spawn([tsc, '-p', 'tsconfig.json', '--noEmit', 'false', '--emitDeclarationOnly', '--outDir', declarations], {
    cwd: project, stdout: 'pipe', stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()])
  if (status !== 0) throw new Error(`Declaration build failed:\n${stdout}${stderr}`)
})

afterAll(async () => {
  if (declarations) await rm(declarations, { recursive: true, force: true })
})

async function declarationTree(entries: string[]): Promise<string> {
  const root = declarations!
  const files = new Map<string, string>()
  async function read(path: string): Promise<void> {
    const name = relative(root, path).split(sep).join('/')
    if (files.has(name)) return
    const source = await Bun.file(path).text()
    files.set(name, source.trimEnd().replace(/\r\n/g, '\n'))
    for (const [, dependency] of source.matchAll(/\b(?:from\s+|import\(\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      const declaration = dependency.replace(/\.[cm]?tsx?$/, '.d.ts')
      await read(resolve(dirname(path), declaration))
    }
  }
  for (const entry of entries) await read(join(root, entry))
  return [...files].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, source]) => `// ${name}\n${source}`).join('\n\n')
}

it('keeps the public parser declarations stable', async () => {
  expect(await declarationTree(['packages/parser/src/index.d.ts'])).toMatchSnapshot()
})

it('keeps the public types declarations stable', async () => {
  expect(await declarationTree(['packages/types/src/index.d.ts'])).toMatchSnapshot()
})
