import { expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../runtime/loader.ts'

it('uses the configured first-party syntax theme and reloads changed setup files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-highlighter-'))
  try {
    const directory = join(root, 'setup')
    await mkdir(directory)
    const entry = join(root, 'slides.md')
    const native = join(directory, 'code-highlighter.ts')
    await Bun.write(entry, ['# Colors', '', '```ts', 'const review = 1', '```'].join('\n'))
    await Bun.write(join(directory, 'shiki.ts'), "export default () => ({ theme: 'nord' })")
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const dark = await compile()
    expect(dark.html).toContain('id="presentation-code-theme"')
    expect(dark.html).toContain('--tp-code-background: #2e3440')
    expect(dark.html).toContain('class="tok-keyword">const</span>')

    await Bun.write(native, "export default () => ({ theme: 'github-light' })")
    const light = await compile()
    expect(light.html).toContain('--tp-code-background: #ffffff')
    expect(light.live?.frame).not.toBe(dark.live?.frame)
    await rm(native)
    expect((await compile()).html).toContain('--tp-code-background: #2e3440')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
