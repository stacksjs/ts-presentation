import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('prints help and formats a deck without loading the STX renderer', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'presentation-cli-startup-'))
  try {
    const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
    const guard = join(cwd, 'guard.ts')
    const deck = join(cwd, 'slides.md')
    await Promise.all([
      Bun.write(deck, '\n# First slide\n\n\n---\n\n\n# Second slide\n\n'),
      Bun.write(guard, String.raw`
        Bun.plugin({
          name: 'guard-stx-startup',
          setup(builder) {
            builder.onLoad({ filter: /[/\\]@stacksjs[/\\]stx[/\\]/ }, ({ path }) => {
              throw new Error('Unexpected STX module in a CLI utility: ' + path)
            })
          },
        })
      `),
    ])

    const help = Bun.spawnSync([process.execPath, '--preload', guard, cli, '--help'], { cwd })
    expect({ code: help.exitCode, error: help.stderr.toString() }).toEqual({ code: 0, error: '' })
    expect(help.stdout.toString()).toContain('Serve a local presentation')

    const format = Bun.spawnSync([process.execPath, '--preload', guard, cli, 'format', deck], { cwd })
    expect({ code: format.exitCode, error: format.stderr.toString() }).toEqual({ code: 0, error: '' })
    expect(await Bun.file(deck).text()).toBe('# First slide\n\n---\n\n# Second slide\n')
  }
  finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
