import { expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureFrames } from '../../runtime/capture.ts'
import { findChrome } from '../../runtime/chrome.ts'
import { captureEditable } from '../../runtime/editable/capture.ts'
import type { IrImage, IrRaster } from '../../runtime/editable/ir.ts'
import { dataPicture, originalPicture } from '../../runtime/editable/pictures.ts'
import { createPowerPoint } from '../../runtime/powerpoint.ts'
import type { PowerPointFrame } from '../../runtime/powerpoint.ts'

const chrome = await findChrome()
const png = Buffer.from(await Bun.file(new URL('../../../test/fixtures/pptx/picture.png', import.meta.url)).bytes())
const jpeg = Buffer.from(await Bun.file(new URL('../../../test/fixtures/pptx/picture.jpg', import.meta.url)).bytes())
const pngData = `data:image/png;base64,${png.toString('base64')}`

it('accepts native PNG and JPEG data URIs and sends mismatches or SVG through browser capture', () => {
  expect(dataPicture(pngData)).toEqual({ format: 'png', data: png.toString('base64') })
  expect(dataPicture(`data:image/jpeg;base64,${jpeg.toString('base64')}`)).toEqual({ format: 'jpeg', data: jpeg.toString('base64') })
  expect(dataPicture('data:image/png;base64,iVBORw0KGgo=')).toBeUndefined()
  expect(dataPicture(pngData.replace('image/png', 'image/jpeg'))).toBeUndefined()
  expect(dataPicture('data:image/svg+xml,%3Csvg%2F%3E')).toBeUndefined()
  expect(dataPicture('data:image/svg+xml;base64,PHN2Zy8+')).toBeUndefined()
})

it('sends animated PNGs and orientation-dependent JPEGs through browser capture', () => {
  const animationChunk = Buffer.from('000000086163544c000000010000000000000000', 'hex')
  const animated = Buffer.concat([png.subarray(0, 33), animationChunk, png.subarray(33)])
  expect(originalPicture(animated)).toBeUndefined()
  function orient(orientation: number): Buffer {
    const exif = Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010001000000000000', 'hex')
    exif.writeUInt16BE(orientation, 28)
    return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)])
  }
  expect(originalPicture(orient(1))?.format).toBe('jpeg')
  expect(originalPicture(orient(6))).toBeUndefined()
})

async function storedParts(document: Blob): Promise<Map<string, Buffer>> {
  const archive = Buffer.from(await document.arrayBuffer())
  const parts = new Map<string, Buffer>()
  for (let offset = 0; offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034B50;) {
    const size = archive.readUInt32LE(offset + 18)
    const nameStart = offset + 30
    const nameEnd = nameStart + archive.readUInt16LE(offset + 26)
    const dataStart = nameEnd + archive.readUInt16LE(offset + 28)
    parts.set(archive.toString('utf8', nameStart, nameEnd), archive.subarray(dataStart, dataStart + size))
    offset = dataStart + size
  }
  return parts
}

it.skipIf(!chrome)('exports Chromium linear-gradient boxes as editable PowerPoint fills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-gradients-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, [
      '# Gradient export', '',
      '<section style="position:absolute;left:64px;top:169px;width:384px;height:96px;background:linear-gradient(90deg,#f00 15%,#0f0 50%,#00f 85%)">',
      '<p>Editable caption</p>',
      '</section>', '',
      '<div style="position:absolute;left:64px;top:295px;width:384px;height:96px;background:linear-gradient(to right,#48c,transparent)"></div>',
    ].join('\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, withClicks: false, canvas, editable: true }, frame => { frames.push(frame) })
    expect(frames[0].editable?.nodes.filter(node => node.kind === 'box' && node.gradient)).toHaveLength(2)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Gradient export' }))
    const xml = parts.get('ppt/slides/slide1.xml')?.toString()
    expect(xml?.match(/<a:gradFill rotWithShape="1">/g)).toHaveLength(2)
    expect(xml).toContain('<a:gs pos="50000"><a:srgbClr val="00FF00">')
    expect(xml).toContain('<a:gs pos="100000"><a:srgbClr val="4488CC"><a:alpha val="0"/>')
    expect(xml).toContain('<a:lin ang="0" scaled="0"/>')
    expect(xml).toContain('<a:t xml:space="preserve">Editable caption</a:t>')
    expect([...parts.keys()].some(name => name.startsWith('ppt/media/'))).toBe(false)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps original images editable and crops them in DrawingML across reveals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-original-pictures-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Promise.all([
      Bun.write(join(root, 'public/picture.jpg'), jpeg),
      Bun.write(entry, [
        '# Picture export',
        '',
        '<a href="https://example.com/"><img src="/picture.jpg" alt="Clipped original" style="position:absolute;left:-20px;top:150px;width:100px;height:75px"></a>',
        '',
        `<img src="${pngData}" alt="Embedded original" style="position:absolute;left:160px;top:150px;width:100px;height:75px">`,
        '',
        '<img src="/picture.jpg" alt="Styled capture" style="position:absolute;left:320px;top:150px;width:100px;height:75px;opacity:0.5">',
        '',
        '<p v-click>Keep this reveal editable</p>',
      ].join('\n')),
    ])
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, withClicks: true, canvas, editable: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    for (const frame of frames) {
      const images = frame.editable?.nodes.filter((node): node is IrImage => node.kind === 'image') ?? []
      const [clipped, embedded, styled] = images
      expect(images.map(image => image.alt)).toEqual(['Clipped original', 'Embedded original', 'Styled capture'])
      expect(clipped).toMatchObject({ format: 'jpeg', rect: { x: 0, w: 80, h: 75 }, crop: { x: 20, y: 0, w: 100, h: 75 }, link: 'https://example.com/' })
      expect(Buffer.from(clipped.data, 'base64')).toEqual(jpeg)
      expect(Buffer.from(embedded.data, 'base64')).toEqual(png)
      expect(styled.format).toBeUndefined()
      const croppedPng = Buffer.from(styled.data, 'base64')
      expect(croppedPng.subarray(1, 4).toString()).toBe('PNG')
      expect([croppedPng.readUInt32BE(16), croppedPng.readUInt32BE(20)]).toEqual([100, 75])
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Picture export' }))
    const media = [...parts.keys()].filter(name => name.startsWith('ppt/media/'))
    const jpgEntries = media.filter(name => name.endsWith('.jpeg'))
    expect(jpgEntries).toHaveLength(1)
    const [asset] = jpgEntries
    expect(parts.get(asset)).toEqual(jpeg)
    expect(parts.get('[Content_Types].xml')?.toString()).toContain('Extension="jpeg" ContentType="image/jpeg"')
    for (const slide of [1, 2]) {
      const xml = parts.get(`ppt/slides/slide${slide}.xml`)?.toString()
      expect(xml).toContain('<a:srcRect l="20000" t="0" r="0" b="0"/>')
      expect(xml).toContain('descr="Clipped original"')
      expect(parts.get(`ppt/slides/_rels/slide${slide}.xml.rels`)?.toString()).toContain(`../media/${asset.split('/').at(-1)}`)
    }
    expect(parts.get('ppt/slides/slide2.xml')?.toString()).toContain('<a:t xml:space="preserve">Keep this reveal editable</a:t>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('restores the slide after a failed clip and reports a missing target', async () => {
  const view = new Bun.WebView({ width: 960, height: 540, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    const html = '<main id="stage"><article style="position:absolute;inset:0;background:#117733">'
      + '<p id="text" style="opacity:0.7 !important">Still visible</p>'
      + '<svg id="art" style="position:absolute;left:100px;top:100px" width="160" height="100"><rect width="160" height="100" fill="red"/></svg>'
      + '</article></main>'
    await view.navigate('data:text/html,' + encodeURIComponent(html))
    const calls: string[] = []
    let missing = false
    const browser: Parameters<typeof captureEditable>[0] = {
      async evaluate<T>(script: string): Promise<T> {
        const value = await view.evaluate<T>(script)
        if (missing && script.includes('function collectSnapshot')) await view.evaluate("document.querySelector('#art').remove()")
        return value
      },
      async cdp(method, parameters) {
        calls.push(method)
        if (method === 'Page.captureScreenshot') throw new Error('Artwork clip failed')
        return view.cdp(method, parameters)
      },
    }
    const canvas = { width: 960, height: 540 }
    expect(await captureEditable(browser, canvas, 1, 0, '')).toEqual({ warnings: ['Artwork clip failed'] })
    expect(calls).toEqual(['Emulation.setDefaultBackgroundColorOverride', 'Page.captureScreenshot', 'Emulation.setDefaultBackgroundColorOverride'])
    expect(await view.evaluate(`[
      getComputedStyle(document.querySelector('article')).backgroundColor,
      document.querySelector('#text').style.opacity, document.querySelector('#text').style.getPropertyPriority('opacity'),
      typeof window.restorePresentationExport,
    ]`)).toEqual(['rgb(17, 119, 51)', '0.7', 'important', 'undefined'])
    missing = true
    calls.length = 0
    expect(await captureEditable(browser, canvas, 1, 0, '')).toEqual({ warnings: ['Picture element could not be isolated'] })
    expect(calls).toEqual(['Emulation.setDefaultBackgroundColorOverride'])
  }
  finally {
    view.close()
  }
}, 45_000)

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
