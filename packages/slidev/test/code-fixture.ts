import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const source: string = 'const before = 0\n// #region sample\n  function example() {\n    return 42\n  }\n// #endregion sample\n'
const tick = '```'
export const fenced = (info: string, code: string): string => [tick + info, code, tick].join('\n')

export async function fixture<T>(test: (root: string, entry: string, file: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'presentation-code-'))
  try {
    await mkdir(join(root, 'snippets'))
    const file = join(root, 'snippets/fixture.ts')
    await Bun.write(file, source)
    return await test(root, join(root, 'slides.md'), file)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}
