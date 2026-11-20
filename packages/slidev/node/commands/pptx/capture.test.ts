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

it.skipIf(!chrome)('navigates linked equation references and exports their formatted tags as editable math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-equation-reference-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Reference

See \eqref{rate}.

---

# Formula

\begin{equation}
x=1\tag{Rate $k^2$}\label{rate}
\end{equation}`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const dist = join(root, 'dist')
    const server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      fetch(request) {
        const name = new URL(request.url).pathname.slice(1) || 'index.html'
        if (!['index.html', 'presentation.js', 'presentation.css', 'deck.css'].includes(name)) return new Response(null, { status: 404 })
        return new Response(Bun.file(join(dist, name)))
      },
    })
    const view = new Bun.WebView({ ...canvas, backend: { type: 'chrome', path: chrome!, url: false } })
    try {
      await view.navigate(server.url.href)
      const route = await view.evaluate(`(() => {
        const link = document.querySelector('#slide-1 a[data-slide-link]');
        const label = link.textContent.replace(/\\s+/g, ' ');
        link.click();
        return { label, hash: location.hash, hidden: document.getElementById('slide-2').hidden };
      })()`)
      expect(route).toEqual({ label: '(Rate k2)', hash: '#slide-2', hidden: false })
    }
    finally {
      view.close()
      await server.stop(true)
    }
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: dist, executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Equation reference' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    expect(slide).toContain('<a14:m>')
    expect(slide).toContain('<m:sSup>')
    expect(slide).toContain('(Rate')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps AMS subequation letters and reveal opacity editable in a PowerPoint range', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-subequations-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Before

\begin{equation}
w=0
\end{equation}

---

# Grouped equations

$$ {1|2|3}
\begin{subequations}\label{series}
\begin{equation}
a=\begin{pmatrix}a&b\\c&d\end{pmatrix}\label{part:first}
\end{equation}
\begin{align}
c&=\frac{1}{2}\\
d&=f
\end{align}
\end{subequations}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, range: '2', editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(3)
    for (const [step, frame] of frames.entries()) {
      const equations = frame.editable?.nodes.flatMap(node => node.kind === 'raster' && node.equation ? [node.equation] : []) ?? []
      expect(equations).toHaveLength(2)
      const tags = equations.flatMap(equation => equation.tags ?? [])
      expect(tags.map(tag => /\(2[abc]\)/.exec(tag.expression)?.[0])).toEqual(['(2a)', '(2b)', '(2c)'])
      expect(tags.map(tag => tag.expression.includes('<a:alpha val="24000"/>'))).toEqual([0, 1, 2].map(index => index !== step))
      expect(equations[0].expression.includes('<a:alpha val="24000"/>')).toBe(step !== 0)
      expect(equations[1].expression).toContain('<m:f>')
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Grouped equations' }))
    const slide = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(slide.match(/<a14:m>/g)).toHaveLength(5)
    expect(slide).toContain('>(2c)</m:t>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

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

it.skipIf(!chrome)('keeps AMS intertext editable and outside equation reveal ranges in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-intertext-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Worked example

$$ {1|2|all}
\begin{align}
a&=b+c\\
\intertext{Now \textbf{substitute} $x_i$.}
d&=\frac{f}{g}\\
\shortintertext{Therefore,}
h&=k
\end{align}
$$

---

# Narrow calculation

<style>
math[display="block"] { width: 325px; }
</style>

$$
\begin{align*}
a&=b\\
\intertext{Read the explanation across multiple lines in the available space. \textbf{The bold words also occupy more than one line} before substituting $x_i$.}
c&=d
\end{align*}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(4)
    const dim = '<a:alpha val="24000"/>'
    for (const [step, frame] of frames.slice(0, 3).entries()) {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(body).toBeDefined()
      expect(body?.cells).toHaveLength(7)
      expect(body?.tags).toHaveLength(3)
      const [, first, normal, , second, short, , third] = [body!, ...body!.cells!]
      expect(normal.expression).toContain('>substitute</m:t>')
      expect(normal.expression).toContain('<m:sSub>')
      expect(short.expression).toContain('>Therefore,</m:t>')
      expect(second.expression).toContain('<m:f>')
      expect(first.rect.x).toBeCloseTo(second.rect.x, 1)
      expect(second.rect.x).toBeCloseTo(third.rect.x, 1)
      expect(normal.rect.x).toBeCloseTo(short.rect.x, 1)
      expect(normal.rect.x).toBeLessThan(first.rect.x)
      expect(normal.rect.y).toBeGreaterThan(first.rect.y + first.rect.h)
      expect(normal.rect.y + normal.rect.h).toBeLessThan(second.rect.y)
      expect(short.rect.y).toBeGreaterThan(second.rect.y + second.rect.h)
      expect(short.rect.y + short.rect.h).toBeLessThan(third.rect.y)
      expect(normal.rect.y - (first.rect.y + first.rect.h)).toBeGreaterThan(third.rect.y - (short.rect.y + short.rect.h))
      expect([first, normal, second, short, third].map(fragment => fragment.expression.includes(dim))).toEqual([
        step === 1, false, step === 0, false, step < 2,
      ])
      expect(body!.tags!.map(tag => tag.expression.includes(dim))).toEqual([step === 1, step === 0, step < 2])
    }
    const wrapped = frames[3].editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
    expect(wrapped).toBeDefined()
    const prose = wrapped!.cells!.slice(1, -2)
    const text = prose.flatMap(fragment => [...fragment.expression.matchAll(/<m:t(?: [^>]*)?>([^<]*)<\/m:t>/g)].map(match => match[1])).join('')
    expect(text.replace(/\s+/g, ' ')).toContain('Read the explanation across multiple lines in the available space. The bold words also occupy more than one line before substituting')
    expect(prose.some(fragment => fragment.expression.includes('<m:sSub>'))).toBe(true)
    const left = Math.min(...prose.map(fragment => fragment.rect.x))
    expect(Math.max(...prose.map(fragment => fragment.rect.x + fragment.rect.w)) - left).toBeLessThanOrEqual(326)
    expect(new Set(prose.map(fragment => Math.round(fragment.rect.y))).size).toBeGreaterThan(2)
    expect(wrapped!.cells!.at(-1)!.rect.y).toBeGreaterThan(Math.max(...prose.map(fragment => fragment.rect.y + fragment.rect.h)))
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Worked example' }))
    const final = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(final.match(/<a14:m>/g)).toHaveLength(11)
    expect(final.match(/<mc:Fallback><p:sp>/g)).toHaveLength(1)
    expect(parts.get('ppt/slides/slide4.xml')?.toString()).toContain('<m:sSub>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports Mathtools alignment arrows with the following equation reveal and editable symbols', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-alignment-arrows-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Transformations

$$ {1|2|all}
\begin{alignat}{2}
&&a&=b\\
\ArrowBetweenLines
&&c&=d
\end{alignat}
$$

---

# Reverse transformations

\begin{alignat*}{2}
a&=b&&\\
\ArrowBetweenLines*[\Downarrow]
c&=d&&
\end{alignat*}

---

# Inline transformations

From $\begin{alignedat}{2}&&x&=y\\\ArrowBetweenLines[\uparrow]&&y&=z\end{alignedat}$ as stated.`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => [frame.position?.slide, frame.position?.click])).toEqual([[1, 0], [1, 1], [1, 2], [2, 0], [3, 0]])
    for (const [index, frame] of frames.slice(0, 4).entries()) {
      const equation = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      const right = index === 3
      const cells = equation ? [equation, ...(equation.cells ?? [])] : []
      const arrow = cells.find(cell => cell.expression.includes(right ? '⇓' : '⇕'))
      const first = cells.find(cell => cell.expression.includes('>a</m:t>'))
      const second = cells.find(cell => cell.expression.includes('>c</m:t>'))
      const relation = cells.find(cell => cell.expression.includes('>b</m:t>'))
      expect(arrow).toBeDefined()
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      expect(relation).toBeDefined()
      expect(arrow!.rect.y).toBeGreaterThan(first!.rect.y)
      expect(arrow!.rect.y).toBeLessThan(second!.rect.y)
      if (right) expect(arrow!.rect.x).toBeGreaterThanOrEqual(relation!.rect.x + relation!.rect.w - 0.25)
      else expect(arrow!.rect.x + arrow!.rect.w).toBeLessThanOrEqual(first!.rect.x + 1)
      expect(arrow!.expression.includes('<a:alpha val="24000"/>')).toBe(index === 0)
      expect(first!.expression.includes('<a:alpha val="24000"/>')).toBe(index === 1)
      expect(second!.expression.includes('<a:alpha val="24000"/>')).toBe(index === 0)
      expect(equation?.tags?.length ?? 0).toBe(right ? 0 : 2)
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Transformations' }))
    expect(parts.get('ppt/slides/slide3.xml')?.toString()).toMatch(/<m:t(?: [^>]*)?>⇕<\/m:t>/)
    expect(parts.get('ppt/slides/slide4.xml')?.toString()).toMatch(/<m:t(?: [^>]*)?>⇓<\/m:t>/)
    const inline = parts.get('ppt/slides/slide5.xml')?.toString() ?? ''
    expect(inline).toContain('<m:eqArr>')
    expect(inline).toMatch(/<m:t(?: [^>]*)?>↑<\/m:t>/)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('preserves compact continuation geometry, reveals, and editable dots in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-continuations-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Regular continuation

\begin{align}
a&=b\\
&\vdotswithin{=}\notag\\
&=c
\end{align}

---

# Compact continuation

$$ {1|2|all}
\begin{align}
a&=b\\
\shortvdotswithin{=}
&=c
\end{align}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => [frame.position?.slide, frame.position?.click])).toEqual([[1, 0], [2, 0], [2, 1], [2, 2]])
    const math = frames.map(frame => frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math'))
    expect(math[0]?.rect.h).toBeGreaterThan(math[1]!.rect.h + 4)
    for (const [step, raster] of math.slice(1).entries()) {
      const cells = raster?.equation?.cells ?? []
      const dots = cells.find(cell => cell.expression.includes('>⋮</m:t>'))
      const first = cells.find(cell => cell.expression.includes('>b</m:t>'))
      const second = cells.find(cell => cell.expression.includes('>c</m:t>'))
      expect(dots).toBeDefined()
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      expect(dots!.rect.y).toBeGreaterThan(first!.rect.y)
      expect(dots!.rect.y).toBeLessThan(second!.rect.y)
      expect(first!.rect.x).toBeCloseTo(second!.rect.x)
      expect(dots!.rect.x + dots!.rect.w / 2).toBeGreaterThan(first!.rect.x)
      expect(dots!.rect.x + dots!.rect.w / 2).toBeLessThan(first!.rect.x + first!.rect.w / 2)
      const dim = '<a:alpha val="24000"/>'
      expect([first, dots, second].map(cell => cell!.expression.includes(dim)))
        .toEqual([step === 1, step === 0, step === 0])
      expect(raster?.equation?.tags?.map(tag => tag.expression.match(/>\(\d+\)<\/m:t>/)?.[0])).toEqual(['>(3)</m:t>', '>(4)</m:t>'])
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Compact continuation' }))
    expect(parts.get('ppt/slides/slide4.xml')?.toString()).toContain('>⋮</m:t>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports inner AMS baselines and flush gathered rows as editable PowerPoint equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-inner-alignment-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Inner alignments

$$
X+\begin{alignedat}[t]{1} f&=a\\g&=b\end{alignedat}+Y
$$

$$
X+\begin{lgathered}[b] c\\d+e\end{lgathered}+Y
$$

$$
X+\begin{rgathered} h\\i+j\end{rgathered}+Y
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(1)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Inner alignments' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const arrays = [...slide.matchAll(/<m:eqArr>(.*?)<\/m:eqArr>/g)].map(([, array]) => array)
    expect(arrays).toHaveLength(3)
    const [top, left, right] = arrays
    expect(top).toStartWith('<m:eqArrPr><m:baseJc m:val="top"/></m:eqArrPr>')
    expect(top).toMatch(/>f<\/m:t><\/m:r>.*?>&amp;<\/m:t>.*?>=<\/m:t>/)
    expect(left).toStartWith('<m:eqArrPr><m:baseJc m:val="bot"/></m:eqArrPr>')
    expect(left).toMatch(/<m:e><m:r>.*?>&amp;<\/m:t><\/m:r><m:r>.*?>c<\/m:t>/)
    expect(right).toMatch(/<m:e><m:r>.*?>h<\/m:t><\/m:r><m:r>.*?>&amp;<\/m:t><\/m:r><\/m:e>/)
    expect(right).not.toContain('<m:eqArrPr>')
    expect(slide.match(/<a14:m>/g)).toHaveLength(3)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('captures Mathtools frames around aligned cells as editable PowerPoint outlines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-aligned-boxes-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Boxed rows

$$ {1|2|all}
\newcommand\highlightbox[1]{\fcolorbox{112233}{ffe680}{#1}}
\MakeAboxedCommand\Highlight\highlightbox
\begin{alignat}{2}
\Highlight{a&=b}+q & \setlength{\fboxsep}{.45em}\setlength\fboxrule{2px}\Aboxed{c&=\frac{d}{e}}\\
z&=k & v&=w
\end{alignat}
$$

---

# Box around one expression

$$
\newcommand\shadebox[1]{\colorbox{e8edff}{#1}}
\MakeAboxedCommand\Shade\shadebox
\begin{align*}
\setlength\fboxsep{.5em}\Shade{x}+y &= z
\end{align*}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => [frame.position?.slide, frame.position?.click])).toEqual([[1, 0], [1, 1], [1, 2], [2, 0]])
    for (const [step, frame] of frames.slice(0, 3).entries()) {
      const math = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(math?.frames).toHaveLength(2)
      expect(math?.tags).toHaveLength(2)
      const [first, second] = math!.frames!
      const cells = [math!, ...(math?.cells ?? [])]
      const left = cells.find(cell => cell.expression.includes('>a</m:t>'))!
      const right = cells.find(cell => cell.expression.includes('>b</m:t>'))!
      const outside = cells.find(cell => cell.expression.includes('>q</m:t>'))!
      const below = cells.find(cell => cell.expression.includes('>k</m:t>'))!
      expect(first.rect.x).toBeLessThan(left.rect.x)
      expect(first.rect.x + first.rect.w).toBeGreaterThan(right.rect.x + right.rect.w)
      expect(first.rect.x + first.rect.w).toBeLessThanOrEqual(outside.rect.x + 0.5)
      expect(first.rect.x + first.rect.w).toBeLessThanOrEqual(second.rect.x + 1)
      expect(second.rect.h).toBeGreaterThan(first.rect.h + 4)
      expect(right.rect.x).toBeCloseTo(below.rect.x)
      expect(first.border?.color.a).toBeCloseTo(step === 1 ? 0.24 : 1)
      expect(first.border?.color).toMatchObject({ r: 17, g: 34, b: 51 })
      expect(first.fill).toMatchObject({ r: 255, g: 230, b: 128 })
      expect(first.fill?.a).toBeCloseTo(step === 1 ? 0.24 : 1)
      expect(second.border?.width).toBeCloseTo(2)
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Boxed rows' }))
    const slide = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(slide.match(/name="Equation frame"/g)).toHaveLength(2)
    expect(slide).toContain('<a:noFill/><a:ln w="')
    expect(slide).toContain('<a:solidFill><a:srgbClr val="FFE680">')
    expect(slide.indexOf('name="Equation frame"')).toBeLessThan(slide.indexOf('<a14:m>'))
    expect(slide).toContain('<m:f>')
    const one = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    expect(one.match(/name="Equation frame"/g)).toHaveLength(1)
    expect(one).toContain('<a:solidFill><a:srgbClr val="E8EDFF"></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln>')
    expect(one).toContain('>x</m:t>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports AMS full-width alignments with editable columns and tags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-flalign-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Full-width calculation

$$ {1|2}
\begin{flalign}
a&=\frac{b}{c} & d&=e\tag*{Result}\\
f&=g & h&=k_i
\end{flalign}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    for (const [step, frame] of frames.entries()) {
      const equation = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(equation).toBeDefined()
      expect(equation?.cells).toHaveLength(7)
      expect(equation?.tags).toHaveLength(2)
      const [, firstPair, , rightPair, , nextFirst, , nextRight] = [equation!, ...equation!.cells!]
      expect(firstPair.expression).toContain('<m:f>')
      expect(nextRight.expression).toContain('<m:sSub>')
      expect(firstPair.rect.x).toBeCloseTo(nextFirst.rect.x, 1)
      expect(rightPair.rect.x).toBeCloseTo(nextRight.rect.x, 1)
      expect(rightPair.rect.x - firstPair.rect.x).toBeGreaterThan(500)
      const [tag, nextTag] = equation!.tags!
      expect(tag.rect.x).toBeGreaterThan(rightPair.rect.x + rightPair.rect.w)
      expect(tag.expression).toContain('>Result</m:t>')
      expect(nextTag.expression).toContain('>(1)</m:t>')
      const dim = '<a:alpha val="24000"/>'
      expect([firstPair, rightPair, tag, nextFirst, nextRight, nextTag].map(fragment => fragment.expression.includes(dim)))
        .toEqual([step === 1, step === 1, step === 1, step === 0, step === 0, step === 0])
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Full-width calculation' }))
    const slide = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(slide.match(/<a14:m>/g)).toHaveLength(10)
    expect(slide.match(/<mc:Fallback><p:sp>/g)).toHaveLength(1)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports shifted AMS tags at their editable vertical positions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-raised-tags-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    const source = [0, 6].map(raise => String.raw`# Report

<style>
math[display="block"] { width: 285px; font-size: 24px; }
</style>

\begin{flalign}
a&=\quad\quad\quad\frac{b}{c} & d&=e\tag*{Quality control check}\raisetag{${raise}px}
\end{flalign}`).join('\n\n---\n\n')
    await Bun.write(entry, source)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const equations = frames.map(frame => frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation)
    for (const equation of equations) {
      expect(equation?.cells).toHaveLength(3)
      expect(equation?.cells?.[0].expression).toContain('<m:f>')
      expect(equation?.tags).toHaveLength(1)
      expect(equation?.tags?.[0].expression).toContain('>Quality control check</m:t>')
    }
    const [normal, raised] = equations.map(equation => equation!.tags![0].rect)
    expect(normal.y).toBeGreaterThan(equations[0]!.rect.y + equations[0]!.rect.h)
    expect(normal.y - raised.y).toBeCloseTo(6, 1)
    expect(normal.x).toBeCloseTo(raised.x, 1)
    expect(equations[0]!.rect).toEqual(equations[1]!.rect)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Report' }))
    const slide = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(slide.match(/<a14:m>/g)).toHaveLength(5)
    expect(slide.match(/<mc:Fallback><p:sp>/g)).toHaveLength(1)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports supported TeX as editable Office equations with picture alternatives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-equations-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Editable equations

Inline formula $a^2+\nobreak\textsf{\textbf{rate $x+\text{unit}+\texttt{code}$}}$ beside editable text.

$$
\frac{1+x_i^2}{\root3\of{y}}
$$

$$
\begin{pmatrix} a&b\\ c&d \end{pmatrix}
$$

$$
\colorbox{yellow}{z}
$$

---

# Limits and accents

$$
\sum_{i=1}^{n}x_i + y
$$

$$
\int_0^1 x^2\,dx + y\hspace*{1em}z
$$

$$
\lim_{x\to 0}f(x)=\overbrace{\widehat{ab}+\underline{cd}}^{n}
  +\underbrace{x+y}_{q}+\overline{z}
$$

---

# Frames and cancellation

$$
\boxed{\frac{x}{y}}+\fbox{proof}+a_{\angln}
$$

$$
\cancel{z}+\bcancel{\frac{x}{y}}+\xcancel{q}+\text{\sout{old}}
$$

---

# Spacing and left scripts

$$
x+\phantom{M}+\hphantom{N}+\vphantom{P}
$$

$$
\smash[t]{\sqrt{t}}+\smash[b]{v}+\smash{x}
$$

$$
\prescript{14}{6}{\mathrm C}\quad\ce{^{14}_{6}C^-}
$$

$$
\hphantom{A\kern{-1em}}+b
$$

---

# Mathematical alphabets

$$
\mathbb{R2}+\mathcal{B}+\mathfrak{H}+\mathsf{s}+\mathsfit{t}+\mathtt{u}+\mathbf{V}+\mathit{k}+\boldsymbol{\gamma}
$$

$$
\mathbb{M_{\mathrm{index}}\begin{matrix}a&b\\c&d\end{matrix}N}+\mathbb{\text{plain}}+\boldsymbol{\sum_{j=0}^{n} j}
$$

---

# Operator annotations

$$
\sideset{_i^j}{_k^l}\sum_{n=1}^{m}x_n
$$

$$
a\overunderset{A}{B}{=}b
$$

$$
\DeclareMathOperator{\rank}{rank}\rank\vcenter{\hbox{$\frac{a}{b}$}}+y
$$

---

# Adjusted root index

$$
\sqrt[\uproot{2}\leftroot{3}\beta]{z+1}
$$

---

# Mathtools boxes

$$
\mathmbox{\frac{x}{y}}+\mathmakebox{b}\xmathstrut{0}
$$

$$
x\mathmakebox[3em][r]{a}y
$$

$$
x\vdotswithin{=}y
$$

$$
\frac{\xmathstrut[.2]{.3}a}{b}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(8)
    const equations = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(equations).toHaveLength(4)
    expect(equations.filter(node => node.equation)).toHaveLength(3)
    for (const equation of equations) expect(Buffer.from(equation.data, 'base64').subarray(1, 4).toString()).toBe('PNG')

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Editable equations' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString()
    expect(slide?.match(/<a14:m>/g)).toHaveLength(3)
    expect(slide?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(slide?.match(/<a:blipFill><a:blip r:embed=/g)).toHaveLength(3)
    expect(slide?.match(/<p:pic>/g)).toHaveLength(1)
    expect(slide).toContain('<a14:m><m:oMath><m:sSup>')
    expect(slide).toContain('<m:oMathPara>')
    expect(slide).toContain('<m:f><m:num>')
    expect(slide).toContain('<m:sSubSup>')
    expect(slide).toContain('<m:rad><m:deg>')
    expect(slide).toContain('<m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/>')
    expect(slide).toContain('<m:m><m:mr>')
    expect(slide).toContain('<a:latin typeface="Cambria Math"/>')
    const inline = /<a14:m><m:oMath>(<m:sSup>.*?)<\/m:oMath><\/a14:m>/.exec(slide ?? '')?.[1] ?? ''
    const runs = new Map([...inline.matchAll(/<m:r>(.*?)<m:t xml:space="preserve">([^<]*)<\/m:t><\/m:r>/g)]
      .map(([, properties, content]) => [content, properties]))
    expect(runs.get('unit')).toContain('<m:nor/>')
    expect(runs.get('unit')).toContain(' b="1" i="0"')
    expect(runs.get('unit')).toContain('<a:latin typeface="Arial"/>')
    expect(runs.get('code')).toContain('<m:nor/>')
    expect(runs.get('code')).toContain('<a:latin typeface="Courier New"/>')
    expect(runs.get('x')).toContain('<m:sty m:val="i"/>')
    expect(runs.get('x')).toContain('<a:latin typeface="Cambria Math"/>')
    const advanced = parts.get('ppt/slides/slide2.xml')?.toString()
    expect(advanced?.match(/<a14:m>/g)).toHaveLength(3)
    expect(advanced?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    const operators = [...(advanced ?? '').matchAll(/<m:nary>(.*?)<\/m:nary>/g)].map(([, expression]) => expression)
    expect(operators).toHaveLength(2)
    expect(operators[0]).toContain('<m:chr m:val="∑"/><m:limLoc m:val="undOvr"/>')
    expect(operators[0]).toContain('<m:e><m:sSub>')
    expect(operators[0]).not.toContain('<m:t xml:space="preserve">+</m:t>')
    expect(operators[1]).toContain('<m:chr m:val="∫"/><m:limLoc m:val="subSup"/>')
    expect(operators[1]).toContain('<m:t xml:space="preserve">\u2009</m:t>')
    expect(advanced).toContain('<m:t xml:space="preserve">\u2003</m:t>')
    expect(advanced).toContain('<m:acc><m:accPr><m:chr m:val="\u0302"/>')
    expect(advanced).toContain('<m:bar><m:barPr><m:pos m:val="bot"/>')
    expect(advanced).toContain('<m:bar><m:barPr><m:pos m:val="top"/>')
    expect(advanced).toContain('<m:limLow>')
    expect(advanced).toContain('<m:limUpp>')
    expect(advanced).toContain('<m:groupChrPr><m:chr m:val="⏞"/><m:pos m:val="top"/><m:vertJc m:val="bot"/>')
    expect(advanced).toContain('<m:groupChrPr><m:chr m:val="⏟"/><m:pos m:val="bot"/><m:vertJc m:val="top"/>')
    const enclosures = parts.get('ppt/slides/slide3.xml')?.toString()
    expect(enclosures?.match(/<a14:m>/g)).toHaveLength(2)
    expect(enclosures?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    expect(enclosures).toContain('<m:borderBox><m:e><m:f>')
    expect(enclosures).toMatch(/<m:borderBox><m:e><m:r>.*?>proof<\/m:t>/)
    expect(enclosures).toContain('<m:borderBoxPr><m:hideBot m:val="1"/><m:hideLeft m:val="1"/></m:borderBoxPr>')
    const hideEdges = '<m:hideTop m:val="1"/><m:hideBot m:val="1"/><m:hideLeft m:val="1"/><m:hideRight m:val="1"/>'
    for (const strikes of [
      '<m:strikeBLTR m:val="1"/>',
      '<m:strikeTLBR m:val="1"/>',
      '<m:strikeBLTR m:val="1"/><m:strikeTLBR m:val="1"/>',
      '<m:strikeH m:val="1"/>',
    ]) expect(enclosures).toContain(`<m:borderBoxPr>${hideEdges}${strikes}</m:borderBoxPr>`)

    const spacing = parts.get('ppt/slides/slide4.xml')?.toString()
    expect(spacing?.match(/<a14:m>/g)).toHaveLength(3)
    expect(spacing?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(spacing?.match(/<p:pic>/g)).toHaveLength(1)
    const hide = '<m:show m:val="0"/>'
    const show = '<m:show m:val="1"/>'
    const zeroAsc = '<m:zeroAsc m:val="1"/>'
    const zeroDesc = '<m:zeroDesc m:val="1"/>'
    for (const properties of [hide, hide + zeroAsc + zeroDesc, hide + '<m:zeroWid m:val="1"/>', show + zeroAsc, show + zeroDesc, show + zeroAsc + zeroDesc])
      expect(spacing).toContain(`<m:phantPr>${properties}</m:phantPr>`)
    const prescripts = [...(spacing ?? '').matchAll(/<m:sPre>(.*?)<\/m:sPre>/g)].map(([, expression]) => expression)
    expect(prescripts).toHaveLength(2)
    for (const script of prescripts)
      expect(script).toMatch(/^<m:sub>.*?>6<\/m:t>.*?<\/m:sub><m:sup>.*?>14<\/m:t>.*?<\/m:sup><m:e>/)
    expect(prescripts[0]).toContain('<m:sty m:val="p"/>')
    expect(prescripts[1]).toMatch(/<m:e><m:sSup><m:e>.*?>C<\/m:t>.*?<\/m:e><m:sup>.*?>−<\/m:t>/)
    expect([...parts.keys()].filter(name => name.startsWith('ppt/media/'))).toHaveLength(23)

    const alphabets = parts.get('ppt/slides/slide5.xml')?.toString() ?? ''
    expect(alphabets.match(/<a14:m>/g)).toHaveLength(2)
    expect(alphabets.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    const fonts = new Map([...alphabets.matchAll(/<m:r><m:rPr>(.*?)<\/m:rPr>.*?<m:t xml:space="preserve">([^<]*)<\/m:t><\/m:r>/g)]
      .map(([, properties, letter]) => [letter, properties]))
    for (const [letter, script, style] of [
      ['R', 'double-struck', 'p'], ['2', 'double-struck', 'p'], ['B', 'script', 'p'], ['H', 'fraktur', 'p'],
      ['s', 'sans-serif', 'p'], ['t', 'sans-serif', 'i'], ['u', 'monospace', 'p'],
      ['M', 'double-struck', 'p'], ['N', 'double-struck', 'p'],
    ]) expect(fonts.get(letter)).toBe(`<m:scr m:val="${script}"/><m:sty m:val="${style}"/>`)
    expect(fonts.get('V')).toBe('<m:sty m:val="b"/>')
    expect(fonts.get('k')).toBe('<m:sty m:val="i"/>')
    expect(fonts.get('γ')).toBe('<m:sty m:val="bi"/>')
    const annotations = parts.get('ppt/slides/slide6.xml')?.toString() ?? ''
    expect(annotations.match(/<a14:m>/g)).toHaveLength(3)
    expect(annotations.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(annotations).toContain('<m:limUpp><m:e><m:limLow><m:e><m:sPre>')
    expect(annotations).toMatch(/<m:sPre><m:sub>.*?>i<\/m:t>.*?<m:sup>.*?>j<\/m:t>.*?<m:sSubSup><m:e>.*?>∑<\/m:t>.*?<m:sub>.*?>k<\/m:t>.*?<m:sup>.*?>l<\/m:t>/)
    expect(annotations).toMatch(/<m:limUpp><m:e><m:limLow><m:e><m:r>.*?>=<\/m:t>.*?<m:lim>.*?>B<\/m:t>.*?<m:lim>.*?>A<\/m:t>/)
    expect(annotations).toContain('<m:m><m:mPr><m:baseJc m:val="center"/></m:mPr><m:mr><m:e><m:f>')
    expect(annotations).toContain('<m:t xml:space="preserve">rank</m:t>')
    const adjusted = parts.get('ppt/slides/slide7.xml')?.toString() ?? ''
    expect(adjusted.match(/<p:pic>/g)).toHaveLength(1)
    expect(adjusted).not.toContain('<m:rad>')
    const boxes = parts.get('ppt/slides/slide8.xml')?.toString() ?? ''
    expect(boxes.match(/<a14:m>/g)).toHaveLength(1)
    expect(boxes).toContain('<m:f><m:num>')
    expect(boxes).toContain('>b</m:t>')
    expect(boxes).toContain('<m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/>')
    expect(boxes.match(/<p:pic>/g)).toHaveLength(3)
    for (const cell of ['a', 'b', 'c', 'd']) expect(fonts.get(cell)).toBe('<m:sty m:val="i"/>')
    expect(fonts.get('i')).toBe('<m:sty m:val="p"/>')
    expect(fonts.get('plain')).toBe('<m:sty m:val="p"/>')
    expect(fonts.get('∑')).toBe('<m:sty m:val="b"/>')
    expect(alphabets).toContain('<m:limUpp><m:e><m:limLow>')
    expect(alphabets).toContain('<m:m><m:mr>')
    expect(alphabets).toContain('<m:sSub>')

  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps scoped TeX colors and font sizes editable in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-math-paint-'))
  try {
    const entry = join(root, 'slides.md')
    const output = join(root, 'formulas.pptx')
    await Bun.write(entry, String.raw`# Styled equations

$$
A+{\color{rebeccapurple}B+\textcolor{#00cc0080}{\frac{C}{\textcolor{blue}{D}}}+E}+F
$$

$$
a+{\tiny b{\Large c}d}+e+\text{\small note}
$$

$$ {1|all}
\begin{align*}
x&=y\\
z&=\textcolor{#cc000080}{w}
\end{align*}
$$

$$
\colorbox{yellow}{Still needs a picture}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const exportDeck = Bun.spawn([process.execPath, cli, 'export', entry, '--format', 'pptx-editable', '--with-clicks', '--output', output, '--executable-path', chrome!], {
      stderr: 'pipe', stdout: 'ignore', timeout: 30_000,
    })
    const [status, stderr] = await Promise.all([exportDeck.exited, new Response(exportDeck.stderr).text()])
    if (status) throw new Error(stderr)

    const parts = await storedParts(Bun.file(output))
    const first = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const last = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    const runs = (slide: string) => new Map([...slide.matchAll(/<m:r>(.*?)<m:t xml:space="preserve">([^<]*)<\/m:t><\/m:r>/g)]
      .map(([, properties, token]) => [token, properties]))

    expect(first.match(/<a14:m>/g)).toHaveLength(3)
    expect(first.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(first.match(/<p:pic>/g)).toHaveLength(1)
    const properties = runs(first)
    const green = '<a:srgbClr val="00CC00"><a:alpha val="50000"/></a:srgbClr>'
    for (const letter of ['B', 'E']) expect(properties.get(letter)).toContain('<a:srgbClr val="663399"/>')
    expect(properties.get('A')).toBe(properties.get('F'))
    expect(properties.get('A')).toBeDefined()
    expect(properties.get('C')).toContain(green)
    expect(properties.get('D')).toContain('<a:srgbClr val="0000FF"/>')
    expect(first).toMatch(/<m:fPr><m:ctrlPr>.*?<a:srgbClr val="00CC00">.*?<\/m:ctrlPr><\/m:fPr>/)

    const size = (token: string) => Number(/sz="(\d+)"/.exec(properties.get(token) ?? '')?.[1])
    expect(size('a')).toBe(size('e'))
    expect(size('b')).toBe(Math.round(size('a') * 0.5))
    expect(size('d')).toBe(size('b'))
    expect(Math.abs(size('c') - size('a') * 1.44)).toBeLessThan(2)
    expect(Math.abs(size('note') - size('a') * 0.9)).toBeLessThan(2)
    expect(properties.get('w')).toContain('<a:srgbClr val="CC0000"><a:alpha val="12000"/></a:srgbClr>')
    expect(runs(last).get('w')).toContain('<a:srgbClr val="CC0000"><a:alpha val="50000"/></a:srgbClr>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports TeX invisible and middle delimiters as native Office Math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-math-delimiters-'))
  try {
    const entry = join(root, 'slides.md')
    const output = join(root, 'delimiters.pptx')
    await Bun.write(entry, String.raw`# Delimiters

$$
\DeclarePairedDelimiter{\evalat}{.}{\rvert}\evalat*{\frac{x}{2}}_0^1
$$

$$
\DeclarePairedDelimiterXPP\condition[3]{\mathbb P}\lbrace\rbrace{_q}{#1\delimsize\vert#2\delimsize\vert#3}
\condition*{\frac{x}{2}}{x>0}{x<2}
$$

$$
\color{purple}\left\llbracket \frac{x}{y} \middle\Vert z \right\rrbracket
$$

---

# More delimiters

$$
\left[\left.\frac{x}{y}\right. \middle] z \right.
$$

$$
\left(a \middle| b \middle\Vert c \right)
$$

$$
\left(\color{red}a \middle| b \right)
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const exportDeck = Bun.spawn([process.execPath, cli, 'export', entry, '--format', 'pptx-editable', '--output', output, '--executable-path', chrome!], {
      stderr: 'pipe', stdout: 'ignore', timeout: 30_000,
    })
    const [status, stderr] = await Promise.all([exportDeck.exited, new Response(exportDeck.stderr).text()])
    if (status) throw new Error(stderr)

    const parts = await storedParts(Bun.file(output))
    const first = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const second = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(first.match(/<a14:m>/g)).toHaveLength(3)
    expect(first.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(first).toContain('<m:sSubSup><m:e><m:d><m:dPr><m:begChr/><m:endChr m:val="|"/></m:dPr><m:e>')
    expect(first).toContain('<m:t xml:space="preserve">\u200a</m:t>')
    expect(first).toMatch(/<m:begChr m:val="\{"\/><m:endChr m:val="\}"\/><m:sepChr m:val="\|"\/><\/m:dPr><m:e>.*?<m:f>.*?<\/m:e><m:e>.*?>x<\/m:t>.*?&gt;<\/m:t>.*?<\/m:e><m:e>.*?&lt;<\/m:t>/)
    expect(first).toMatch(/>P<\/m:t><\/m:r><m:sSub><m:e><m:d>.*?<\/m:d><\/m:e><m:sub>.*?>q<\/m:t>/)
    expect(first).toMatch(/<m:begChr m:val="⟦"\/><m:endChr m:val="⟧"\/><m:sepChr m:val="‖"\/><m:ctrlPr>.*?<a:srgbClr val="800080"\/>/)
    expect(second.match(/<a14:m>/g)).toHaveLength(1)
    expect(second.match(/<p:pic>/g)).toHaveLength(2)
    expect(second).toContain('<m:begChr m:val="["/><m:endChr/><m:sepChr m:val="]"/></m:dPr><m:e><m:d>')
    expect(second).toContain('<m:dPr><m:begChr/><m:endChr/></m:dPr><m:e>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports labeled TeX arrows as stretchable Office Math group characters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-arrows-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Labeled arrows

<style>
p, math[display="block"] { margin-block: 0.12em; }
</style>

Inline $x\xLeftarrow[\text{inverse}]{}y$.

<div style="width:2.2em">

$A\xrightarrow{f}B$

</div>

$$
A\xleftarrow[\text{much longer lower label}]{g} B
$$

$$
A\xleftrightarrow[s]{\frac{a+b}{c}} B
$$

---

# Accents and specialized arrows

$$
\overgroup{a+b}+\undergroup{c+d}+\underleftharpoon{X}+\underrightharpoon{Y}
$$

$$
\sum_{i=1}^{n}x_i\xRightarrow{k}y\xLeftrightarrow[m]{n}z
$$

$$
A\xhookrightarrow{u}B + C\xrightleftharpoons[v]{w}D
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    const wrapped = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math').slice(2, 4) ?? []
    expect(wrapped).toHaveLength(2)
    expect(wrapped[0].equation?.expression).toContain('<m:chr m:val="→"/>')
    expect(wrapped[1].equation?.expression).toMatch(/<m:t xml:space="preserve">B<\/m:t>/)
    expect(wrapped[1].rect.y).toBeGreaterThan(wrapped[0].rect.y + wrapped[0].rect.h)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Labeled arrows' }))
    const arrows = parts.get('ppt/slides/slide1.xml')?.toString()
    expect(arrows?.match(/<a14:m>/g)).toHaveLength(6)
    expect(arrows?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(6)
    const group = (glyph: string, position: string, align = position) => `<m:groupChrPr><m:chr m:val="${glyph}"/><m:pos m:val="${position}"/><m:vertJc m:val="${align}"/>`
    expect(arrows).toContain(group('→', 'bot'))
    expect(arrows).toContain(group('⇐', 'top'))
    expect(arrows).toContain(`<m:limUpp><m:e><m:groupChr>${group('←', 'top')}`)
    expect(arrows).toContain(`<m:limLow><m:e><m:groupChr>${group('↔', 'bot')}`)
    expect(arrows).toContain('<m:e><m:argPr><m:argSz m:val="-1"/></m:argPr><m:f>')
    expect(arrows).toMatch(/much longer lower label<\/m:t><\/m:r><\/m:e><\/m:groupChr><\/m:e><m:lim><m:r>.*?>g<\/m:t>/)
    const accents = parts.get('ppt/slides/slide2.xml')?.toString()
    expect(accents?.match(/<a14:m>/g)).toHaveLength(2)
    expect(accents?.match(/<p:pic>/g)).toHaveLength(1)
    expect(accents).toMatch(/<\/m:nary>(?:<m:r>.*?<\/m:r>)*<m:groupChr><m:groupChrPr><m:chr m:val="⇒"\/>/)
    expect(accents).toContain('<m:chr m:val="⇔"/>')
    expect(accents).toContain(group('⏠', 'top', 'bot'))
    expect(accents).toContain(group('⏡', 'bot', 'top'))
    expect(accents).toContain(group('↽', 'bot', 'top'))
    expect(accents).toContain(group('⇁', 'bot', 'top'))
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports compact TeX arrays and piecewise formulas as native Office Math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-math-arrays-'))
  try {
    const entry = join(root, 'slides.md')
    const output = join(root, 'arrays.pptx')
    await Bun.write(entry, String.raw`# Compact arrays

$$
\sum_{\substack{i>0\\j<n}} x_{ij}
$$

$$
A+\begin{smallmatrix}a&b\\c&d\end{smallmatrix}+B
$$

$$
Q_{z_{\substack{i\\j}}}+{\scriptscriptstyle k}+n^{\textstyle m}
$$

$$
\lim_{\begin{subarray}{l}i=0\\j=1\end{subarray}} y
$$

---

# Piecewise definitions

$$
f(x)=\begin{cases}-x&\text{if }x<0\\x&\text{otherwise}\end{cases}
$$

$$
\begin{rcases}u&\text{given }a\\v&\text{given }b\end{rcases}\Rightarrow w
$$

$$
\begin{cases}2x&\text{a \& b}\\y&c\end{cases}
$$

---

# Centered arrays

$$
\left[\begin{array}{cc}1 & 0\\0 & 1\end{array}\right]
$$

$$
\begin{array}{c|c}a&b\\c&d\end{array}
$$

---

# Dotted matrices

$$
\begin{pmatrix}a&b&c\\\hdotsfor[1.5]{3}\\d&e&f\end{pmatrix}
$$

---

# Nested multiline equation

$$
A=\left[\begin{multlined}[b][9em]a+b\\=c-d\end{multlined}\right]
$$

$$
B=\frac{\splitfrac{x+y+z}{+w}}{n}
$$

---

# Conditions in prose

$$
\begin{dcases*}\sum_{i=1}^n i&when $n>0$\\0&otherwise\end{dcases*}
$$

$$
\begin{rcases*}x&for \(x\geq0\)\\0&otherwise\end{rcases*}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const exportDeck = Bun.spawn([process.execPath, cli, 'export', entry, '--format', 'pptx-editable', '--output', output, '--executable-path', chrome!], {
      stderr: 'pipe', stdout: 'ignore', timeout: 30_000,
    })
    const [status, stderr] = await Promise.all([exportDeck.exited, new Response(exportDeck.stderr).text()])
    if (status) throw new Error(stderr)

    const parts = await storedParts(Bun.file(output))
    const compact = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const cases = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    const arrays = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    const dotted = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    const multiline = parts.get('ppt/slides/slide5.xml')?.toString() ?? ''
    const prose = parts.get('ppt/slides/slide6.xml')?.toString() ?? ''
    expect(compact.match(/<a14:m>/g)).toHaveLength(4)
    expect(compact.match(/<mc:Fallback><p:sp>/g)).toHaveLength(4)
    expect(compact).toMatch(/<m:nary>.*?<m:sub><m:m><m:mr>/)
    expect(compact).toContain('<m:box><m:e><m:argPr><m:argSz m:val="-1"/></m:argPr><m:m>')
    expect(compact).toContain('<m:box><m:e><m:argPr><m:argSz m:val="1"/></m:argPr><m:m>')
    expect(compact).toMatch(/<m:argSz m:val="-2"\/><\/m:argPr><m:r>.*?>k<\/m:t>/)
    expect(compact).toMatch(/<m:sup><m:box><m:e><m:argPr><m:argSz m:val="1"\/>.*?>m<\/m:t>/)
    expect(compact).toMatch(/<m:limLow>.*?<m:lim><m:eqArr><m:e><m:r>.*?>&amp;<\/m:t>.*?>i<\/m:t>/)

    expect(cases.match(/<a14:m>/g)).toHaveLength(2)
    expect(cases.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    expect(cases.match(/<p:pic>/g)).toHaveLength(1)
    expect(cases).toContain('<m:dPr><m:begChr m:val="{"/><m:endChr/></m:dPr><m:e><m:eqArr>')
    expect(cases).toContain('<m:dPr><m:begChr/><m:endChr m:val="}"/></m:dPr><m:e><m:eqArr>')
    const first = /<m:eqArr>(.*?)<\/m:eqArr>/.exec(cases)?.[1] ?? ''
    expect(first.match(/>&amp;<\/m:t>/g)).toHaveLength(6)
    expect(first).toContain('>otherwise</m:t>')
    expect(arrays.match(/<a14:m>/g)).toHaveLength(1)
    expect(arrays.match(/<p:pic>/g)).toHaveLength(1)
    expect(arrays).toContain('<m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m>')
    expect(arrays.match(/<m:mr>/g)).toHaveLength(2)
    expect(dotted.match(/<p:pic>/g)).toHaveLength(1)
    expect(dotted).not.toContain('<a14:m>')
    expect(multiline.match(/<p:pic>/g)).toHaveLength(2)
    expect(multiline).not.toContain('<a14:m>')
    expect(prose.match(/<a14:m>/g)).toHaveLength(2)
    expect(prose.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    expect(prose).toContain('<m:begChr m:val="{"/>')
    expect(prose).toContain('<m:endChr m:val="}"/>')
    expect(prose).toMatch(/<m:eqArr>.*?<m:nary>.*?when\s*<\/m:t>.*?>n<\/m:t>.*?&gt;<\/m:t>/)
    expect(prose).toContain('>otherwise</m:t>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps AMS rows, tags, and click highlights editable in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-ams-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  leqno: true
---
# Aligned equations

$$ {1|2|all}
\begin{alignat}{2}
p&=q & r&=s \tag*{Review}\\
x&=y & t&=u \notag\\
a&=b & c&=d
\end{alignat}
$$

$$
\begin{gather}u=v\\f=g\end{gather}
$$

$$
\begin{align*}x&=y\\[1ex]x&=y\\x&=y\end{align*}
$$

---

# Single tags

$$
\frac{a}{b}\tag*{\textbf{Rate}}
$$

$$
\begin{equation}\begin{split}a&=b+c\\&=d\end{split}\tag{Result $k^2$}\end{equation}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(4)
    for (const [step, frame] of frames.slice(0, 3).entries()) {
      const arrays = frame.editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
      expect(arrays).toHaveLength(3)
      const [aligned, gathered, spaced] = arrays.map(node => node.equation)
      expect(aligned?.expression).toContain('<m:eqArr>')
      expect(aligned?.expression.match(/>&amp;<\/m:t>/g)).toHaveLength(9)
      expect(aligned?.tags).toHaveLength(2)
      expect(aligned?.tags?.map(tag => /<m:t[^>]*>(.*?)<\/m:t>/.exec(tag.expression)?.[1])).toEqual(['Review', '(1)'])
      expect(aligned!.tags!.every(tag => tag.rect.x + tag.rect.w < aligned!.rect.x)).toBe(true)
      expect(aligned?.expression.includes('<a:alpha val="24000"/>')).toBe(step < 2)
      expect(aligned?.tags?.map(tag => tag.expression.includes('<a:alpha val="24000"/>'))).toEqual([
        step === 1, step < 2,
      ])
      expect(gathered?.expression.match(/<m:e>/g)).toHaveLength(2)
      expect(gathered?.expression).not.toContain('&amp;')
      expect(gathered?.tags).toHaveLength(2)
      expect(spaced?.cells).toHaveLength(5)
      const rowY = [spaced!.rect.y, spaced!.cells![1].rect.y, spaced!.cells![3].rect.y]
      expect(rowY[1] - rowY[0]).toBeGreaterThan(rowY[2] - rowY[1] + 5)
    }
    const singles = frames[3].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(singles).toHaveLength(2)
    expect(singles[0].equation?.expression).toContain('<m:f>')
    expect(singles[0].equation?.tags?.[0].expression).toContain('>Rate</m:t>')
    expect(singles[0].equation?.tags?.[0].expression).toContain('<m:sty m:val="b"/>')
    expect(singles[1].equation?.expression).toContain('<m:eqArr>')
    expect(singles[1].equation?.tags?.[0].expression).toContain('>(Result')
    expect(singles[1].equation?.tags?.[0].expression).toContain('<m:sSup>')
    for (const { equation } of singles)
      expect(equation!.tags![0].rect.x + equation!.tags![0].rect.w).toBeLessThan(equation!.rect.x)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Aligned equations' }))
    const markup = [...parts].filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).map(([, value]) => value.toString())
    expect(markup).toHaveLength(4)
    for (const slide of markup.slice(0, 3)) {
      expect(slide.match(/<m:eqArr>/g)).toHaveLength(2)
      expect(slide.match(/name="Equation tag"/g)).toHaveLength(4)
      expect(slide.match(/name="Equation cell"/g)).toHaveLength(5)
      expect(slide.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    }
    expect(markup[3].match(/name="Equation tag"/g)).toHaveLength(2)
    expect(markup[3].match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps multline alignment, its single tag, and row reveals editable in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-multline-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Split calculation

$$ {1|2|all}
\begin{multline}
a=b+c\\[1em]
+\frac{d}{e}\\
=f+g\tag*{Final}
\end{multline}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(3)
    for (const [step, frame] of frames.entries()) {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(body).toBeDefined()
      expect(body?.cells).toHaveLength(2)
      expect(body?.tags).toHaveLength(1)
      const [second, last] = body!.cells!
      const [tag] = body!.tags!
      expect(second.rect.x).toBeGreaterThan(body!.rect.x + 80)
      expect(last.rect.x).toBeGreaterThan(second.rect.x + 80)
      expect(tag.rect.x).toBeGreaterThan(last.rect.x + last.rect.w)
      expect(tag.rect.y).toBeCloseTo(last.rect.y, -1)
      const firstGap = second.rect.y - (body!.rect.y + body!.rect.h)
      const secondGap = last.rect.y - (second.rect.y + second.rect.h)
      expect(firstGap).toBeGreaterThan(secondGap + 5)
      expect(second.expression).toContain('<m:f>')
      expect(tag.expression).toContain('>Final</m:t>')
      expect([body!, second, last, tag].map(fragment => fragment.expression.includes('<a:alpha val="24000"/>'))).toEqual([
        step === 1, step === 0, step < 2, step < 2,
      ])
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Split calculation' }))
    const final = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(final.match(/<a14:m>/g)).toHaveLength(4)
    expect(final.match(/name="Equation cell"/g)).toHaveLength(2)
    expect(final.match(/name="Equation tag"/g)).toHaveLength(1)
    expect(final.match(/<mc:Fallback><p:sp>/g)).toHaveLength(1)
    expect(final).toContain('<m:f>')
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
