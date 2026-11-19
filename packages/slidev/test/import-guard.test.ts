import { describe, expect, it } from 'bun:test'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asset } from '../node/runtime/assets.ts'
import { createDeckCompiler } from '../node/runtime/loader.ts'

describe('native public assets', () => {
  it('serves root-relative image markup separately from the filesystem module graph', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-public-')))
    try {
      const publicDir = join(root, 'public')
      const entry = join(root, 'slides.md')
      await Bun.write(entry, '# Images\n\n<img src="/avatars/example.svg?version=1#icon" alt="Diagram">')
      await Bun.write(join(publicDir, 'avatars/example.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      const deck = await createDeckCompiler(entry)()
      expect(deck.html).toContain('src="/avatars/example.svg?version=1#icon"')
      const url = new URL('http://127.0.0.1/avatars/example.svg?version=1#icon')
      const image = await asset(publicDir, decodeURIComponent(url.pathname))
      expect(image.status).toBe(200)
      expect(image.headers.get('Content-Type')).toBe('image/svg+xml')
      expect(await image.text()).toContain('<svg')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('denies missing, nonpublic, directory, and relative resources', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-public-')))
    try {
      const publicDir = join(root, 'public')
      await Bun.write(join(publicDir, 'assets/logo.svg'), '<svg/>')
      await Bun.write(join(publicDir, '.logo.svg'), '<svg/>')
      await Bun.write(join(root, 'outside.svg'), '<svg/>')
      await symlink(join(root, 'outside.svg'), join(publicDir, 'outside.svg'))
      const paths = ['/missing.svg', '/@fs/logo.svg', '/@id/virtual', 'logo.svg', './logo.svg', '../logo.svg', '/assets', '/../outside.svg', '/outside.svg']
      for (const path of paths) expect((await asset(publicDir, path)).status).toBe(404)
      expect((await asset(join(root, 'missing-public'), '/logo.svg')).status).toBe(404)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })
})
