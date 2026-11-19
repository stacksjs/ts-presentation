import { expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureFrames } from '../../runtime/capture.ts'
import { findChrome } from '../../runtime/chrome.ts'
import type { IrRaster } from '../../runtime/editable/ir.ts'
import type { PowerPointFrame } from '../../runtime/powerpoint.ts'

const chrome = await findChrome()

it.skipIf(!chrome)('captures cropped PNG artwork at the end of a deck beyond a normal capture surface', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-capture-'))
  const editableSlide = [
    '# Late slide',
    '',
    '<svg style="display:block;position:absolute;left:-20px;top:150px;width:100px;height:60px" viewBox="0 0 100 60">',
    '<rect width="100" height="60" fill="red"/>',
    '</svg>',
    '',
    '<svg style="position:absolute;left:-200px;top:150px" width="100" height="60"><rect width="100" height="60" fill="blue"/></svg>',
    '',
    '<p v-click>Late reveal</p>',
  ].join('\n')
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, Array.from({ length: 42 }, (_, index) => index === 41 ? editableSlide : `# Slide ${index + 1}`).join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawnSync([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'pipe' })
    if (build.exitCode !== 0) throw new Error(build.stderr.toString())

    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, withClicks: true, canvas: { width: 960, height: 540 }, range: '42', editable: true },
      frame => { frames.push(frame) })
    expect(frames.map(frame => frame.position)).toEqual([{ slide: 42, click: 0 }, { slide: 42, click: 1 }])
    const pictures = frames.map(frame => frame.editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster'))
    for (const rasters of pictures) {
      expect(rasters).toHaveLength(1)
      const raster = rasters![0]
      expect(raster.rect).toMatchObject({ x: 0, w: 80, h: 60 })
      const png = Buffer.from(raster.data!, 'base64')
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 60])
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
