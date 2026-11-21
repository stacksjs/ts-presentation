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

it.skipIf(!chrome)('exports GitGraph, Gantt, and mind map shapes, paths, and labels as editable PowerPoint objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-gitgraph-gantt-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, [
      '# Repository history', '',
      '~~~mermaid', '---', 'config:', '  theme: redux', '  themeVariables:', '    commitLabelBackground: "#ecd9ff"', '---',
      'gitGraph', '  commit id: "start"', '  branch review',
      '  commit id: "change" type: REVERSE', '  checkout main',
      '  branch validation', '  commit id: "validated"', '  checkout main',
      '  cherry-pick id: "change"', '  merge review tag: "Release"', '~~~', '',
      '---', '', '# Delivery schedule', '',
      '~~~mermaid', 'gantt', '  dateFormat YYYY-MM-DD', '  todayMarker off',
      '  section Release', '  Draft :draft, 2026-11-20, 2d', '  Ship :milestone, after draft, 0d', '~~~', '',
      '---', '', '# Filtered repository history', '',
      '~~~mermaid', '---', 'config:', '  themeCSS: ".diagram-git-edge { filter: blur(1px); }"', '---',
      'gitGraph', '  commit id: "old"', '  commit id: "new"', '~~~',
      '', '---', '', '# Planning mind map', '',
      '~~~mermaid', '---', 'config:', '  layout: tidy-tree', '---',
      'mindmap', '  root((Planning))', '    work{{Work streams}}',
      '      design)Design(', '    delivery[Delivery]', '~~~',
      '', '---', '', '# Formatted and illustrated mind map', '',
      '~~~mermaid', '---', 'config:', '  themeCSS: |', '    .status-icon::before { content: "●"; color: #c63158; }', '---',
      'mindmap', '  result["`**New** and *reviewed*`"]', '    release[Release notes]', '    ::icon(status-icon)', '~~~',
    ].join('\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(5)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Editable diagrams' }))
    const graph = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const schedule = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    const filtered = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    const mindmap = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    const illustrated = parts.get('ppt/slides/slide5.xml')?.toString() ?? ''
    expect(graph).toContain('<a:prstGeom prst="ellipse">')
    expect(graph).toContain('<a:custGeom>')
    expect(graph).toContain('<a:quadBezTo>')
    expect(graph).toContain('<a:custDash>')
    expect(graph.match(/<a:xfrm rot="2700000">/g)?.length).toBeGreaterThanOrEqual(4)
    expect(graph).toContain('>review</a:t>')
    expect(graph).toContain('>validated</a:t>')
    expect(graph).toContain('>Release</a:t>')
    expect(graph).not.toContain('<p:pic>')
    expect(schedule).toContain('<a:prstGeom prst="roundRect">')
    expect(schedule).toContain('<a:custGeom>')
    expect(schedule).toContain('>Draft</a:t>')
    expect(schedule).toContain('>Ship</a:t>')
    expect(schedule).not.toContain('<p:pic>')
    expect(filtered).toContain('<p:pic>')
    expect(mindmap).toContain('<a:prstGeom prst="ellipse">')
    expect(mindmap).toContain('<a:cubicBezTo>')
    expect(mindmap).toContain('>Work streams</a:t>')
    expect(mindmap).toContain('>Design</a:t>')
    expect(mindmap).not.toContain('<p:pic>')
    expect(illustrated).toContain('>Release notes</a:t>')
    expect(illustrated).toMatch(/<a:rPr [^>]*\bb="1"[^>]*>.*?<\/a:rPr><a:t xml:space="preserve">New<\/a:t>/)
    expect(illustrated).toMatch(/<a:rPr [^>]*\bi="1"[^>]*>.*?<\/a:rPr><a:t xml:space="preserve">reviewed<\/a:t>/)
    expect(illustrated).toContain('> and </a:t>')
    expect(illustrated.match(/<p:pic>/g)).toHaveLength(1)
    const icon = frames[4].editable?.nodes.find((node): node is IrRaster => node.kind === 'raster')
    expect(icon?.reason).toBe('foreign-object')
    expect(icon?.rect.h).toBeLessThan(60)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports Neo GitGraph gradient outlines and shadows as editable PowerPoint effects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-neo-gitgraph-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, [
      '# Release history', '',
      '~~~mermaid', '---', 'config:', '  look: neo', '  theme: neo', '  themeVariables:',
      '    gradientStart: "#112233"', '    gradientStop: "#77bbcc"',
      '    dropShadow: "drop-shadow(2px 3px 2px rgba(31, 45, 59, .45))"', '---',
      'gitGraph', '  commit id: "Start"', '  branch review', '  commit id: "Review" tag: "v1"',
      '  checkout main', '  merge review', '~~~',
      '', '---', '', '# Vertical task gradient', '',
      '<svg data-diagram-kind="gantt" xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">',
      '<defs><linearGradient id="task-paint" x1="0%" x2="0%" y1="100%" y2="0%">',
      '<stop offset="0%" stop-color="#296585" /><stop offset="65%" stop-color="#55a3b1" stop-opacity=".5" />',
      '<stop offset="100%" stop-color="#a9d5da" /></linearGradient></defs>',
      '<g data-diagram-kind="gantt"><path d="M20 20H300V90H20Z" fill="url(#task-paint)" /></g>',
      '</svg>',
    ].join('\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const elements = frames[0].editable?.nodes ?? []
    const shapes = elements.filter(node => node.kind === 'box')
    const outlines = shapes.flatMap(shape => shape.borders?.[0]?.gradient ?? [])
    expect(outlines).toHaveLength(2)
    for (const outline of outlines) {
      expect(outline).toEqual({
        angle: 0, stops: [
          { position: 0, color: { r: 17, g: 34, b: 51, a: 1 } },
          { position: 1, color: { r: 119, g: 187, b: 204, a: 1 } },
        ],
      })
    }
    const shadows = shapes.flatMap(shape => shape.shadow ?? [])
    expect(shadows).toHaveLength(3)
    for (const shadow of shadows) {
      expect(shadow.color).toMatchObject({ r: 31, g: 45, b: 59 })
      expect(shadow.color.a).toBeCloseTo(.45)
      expect(shadow.angle).toBeCloseTo(56.31)
      expect(shadow.blur / shadow.offset).toBeCloseTo(4 / Math.hypot(2, 3))
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Editable chart effects' }))
    const graph = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const task = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(graph.match(/<a:ln\b[^>]*><a:gradFill\b/g)).toHaveLength(2)
    expect(graph.match(/<a:outerShdw\b/g)).toHaveLength(3)
    expect(graph).toContain('>Review</a:t>')
    expect(graph).toContain('>v1</a:t>')
    expect(graph).not.toContain('<p:pic>')
    expect(task).toContain('fill="norm" stroke="0"')
    expect(task).toContain('<a:gs pos="65000"><a:srgbClr val="55A3B1"><a:alpha val="50000"/>')
    expect(task).toContain('<a:lin ang="16200000"')
    expect(task).not.toContain('<p:pic>')
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

it.skipIf(!chrome)('keeps treemap rectangles and formatted multiline labels editable in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-treemap-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, [
      '# Release investment', '',
      '~~~mermaid', '---', 'config:', '  treemap:', '    nodeHeight: 26', "    valueFormat: '$0,0'", '---',
      'treemap-beta', '"Platform"', '  "Authoring experience": 62000:::accent',
      '  "Performance and reliability for complex presentations": 38000',
      '"Delivery"', '  "Web export": 36000', '  "PowerPoint": 24000',
      'classDef accent fill:#e97451,stroke:#102030,stroke-width:2,color:#283951;', '~~~', '',
      '---', '', '# Product allocation', '',
      '~~~charts', 'type: treemap', 'height: 240', 'showValues: false', 'nodes:',
      '  - label: Foundations', '    value: 18', '  - label: Reporting', '    value: 10', '~~~', '',
      '---', '', '# Composited allocation', '',
      '~~~mermaid', 'treemap-beta', '"Data":::translucent', '  "Streaming": 61', '  "Storage": 39',
      'classDef translucent opacity:0.45;', '~~~',
    ].join('\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)

    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(3)
    const first = frames[0].editable?.nodes ?? []
    const accent = first.find(node => node.kind === 'box' && node.fill?.r === 233 && node.fill.g === 116 && node.fill.b === 81)
    expect(accent?.kind).toBe('box')
    if (accent?.kind !== 'box') throw new Error('The treemap leaf lost its editable rectangle')
    expect(accent.rect.w).toBeGreaterThan(100)
    expect(accent.rect.y).toBeGreaterThan(120)
    expect(accent.borders?.[0]?.color).toEqual({ r: 16, g: 32, b: 48, a: 1 })
    const wrapped = first.find(node => node.kind === 'text' && node.runs.map(run => run.text).join(' ') === 'Performance and reliability for complex presentations')
    expect(wrapped).toMatchObject({ kind: 'text', align: 'center', noWrap: true })
    expect(wrapped?.kind === 'text' && wrapped.lineCount).toBeGreaterThan(1)
    expect(first.some(node => node.kind === 'raster')).toBe(false)

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Editable treemaps' }))
    const imported = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const native = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    const composite = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(imported).toContain('$62,000')
    expect(imported).toContain('Authoring experience')
    expect(imported).toContain('<a:br/>')
    expect(imported).toContain('val="E97451"')
    expect(imported).not.toContain('<p:pic>')
    expect(native).toContain('Foundations')
    expect(native).not.toContain('<p:pic>')
    expect(composite).toContain('Composited allocation')
    expect(composite).toContain('<p:pic>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

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

it.skipIf(!chrome)('exports only selected Mathtools equation numbers across reveals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-referenced-tags-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# References

See \eqref{visible}.
\noeqref{pinned}

---

# Calculation

\mathtoolsset{showonlyrefs}

$$ {1|2|3|all}
\begin{align}
A&=X\label{unreferenced}\\
B&=Y\label{pinned}\\
C&=Z\label{visible}
\end{align}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, range: '2', editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => frame.position?.click)).toEqual([0, 1, 2, 3])
    for (const [step, frame] of frames.entries()) {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(body).toBeDefined()
      const tags = body?.tags ?? []
      expect(tags.map(tag => /\(\d+\)/.exec(tag.expression)?.[0])).toEqual(['(1)', '(2)'])
      expect(tags.map(tag => tag.expression.includes('<a:alpha val="24000"/>'))).toEqual([step === 0 || step === 2, step < 2])
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Reference-driven tags' }))
    const last = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    expect(last.match(/name="Equation tag"/g)).toHaveLength(2)
    for (const tag of ['(1)', '(2)']) expect(last).toContain(`>${tag}</m:t>`)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports formatted equation tags and cross-slide references as editable Office Math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-tag-form-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# References

\newtagform{reference}[\textit]{<}{>}
\usetagform{reference}

See \eqref{value}.

---

# Calculation

\newtagform{result}[\textbf]{[}{]}
\usetagform{result}
\mathtoolsset{showonlyrefs}

\begin{equation}x=1\label{value}\end{equation}`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Tag forms' }))
    const ref = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const eq = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    for (const marker of ['>&lt;</m:t>', '>&gt;</m:t>', '<m:sty m:val="i"/>']) expect(ref).toContain(marker)
    for (const marker of ['>[</m:t>', '>1</m:t>', '>]</m:t>', '<m:sty m:val="b"/>']) expect(eq).toContain(marker)
    expect(eq.match(/name="Equation tag"/g)).toHaveLength(1)
    expect(ref).toContain('<a:hlinkClick')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports adjusted operator limits and shortened display positioning as editable equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-adjusted-limits-'))
  const canvas = { width: 960, height: 540 }
  const limit = String.raw`x&=\adjustlimits\limsup_{P}\max_{P^{\dfrac{1}{2}}}\tag{Q}`
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, ['', '\\SwapAboveDisplaySkip'].map(skip => String.raw`# Operator limits

Read the bounds.

\begin{align}
${skip}
${limit}
\end{align}`).join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const [normal, compact] = frames.map((frame) => {
      const math = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(math?.expression.match(/<m:limLow>/g)).toHaveLength(2)
      expect(math?.expression.match(/<m:zeroWid m:val="1"\/>/g)).toHaveLength(4)
      expect(math?.tags?.[0].expression).toContain('>(Q)</m:t>')
      return math!
    })
    expect(normal.rect.y - compact.rect.y).toBeGreaterThan(5)
    expect(normal.rect.x).toBeCloseTo(compact.rect.x, 1)
    expect(normal.rect.h).toBeCloseTo(compact.rect.h, 1)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Adjusted limits' }))
    const slide = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(slide.match(/<m:limLow>/g)).toHaveLength(2)
    expect(slide.match(/<m:phant>/g)).toHaveLength(4)
    expect(slide).toContain('name="Equation tag"')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports smashed operator limits and neighbors as positioned editable equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-smashed-operator-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    const body = String.raw`\sum_{n=123456789}^{987654321}`
    const source = ['', '[l]', '[r]'].map(direction => String.raw`# Limits

$$
A+\smashoperator${direction}{${body}}+B
$$`).join('\n\n---\n\n')
    await Bun.write(entry, source + String.raw`

---

# Numbered alignment

\begin{align}
A&=\smashoperator[l]{${body}}+B\tag{L}
\end{align}`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)

    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(4)
    const layouts = frames.map((frame, index) => {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(body).toBeDefined()
      const pieces = [body!, ...(body?.cells ?? [])]
      expect(pieces).toHaveLength(index === 3 ? 4 : 3)
      const stack = pieces.find(item => item.expression.includes('<m:limLow>'))!
      const left = pieces.find(item => item.expression.includes('>A</m:t>'))!
      const right = pieces.find(item => item.expression.includes('>B</m:t>'))!
      expect(stack.expression).toContain('>123456789</m:t>')
      expect(stack.expression).toContain('>987654321</m:t>')
      expect(stack.expression).not.toContain('<m:phant>')
      if (index === 3) expect(body?.tags?.[0].expression).toContain('>(L)</m:t>')
      return {
        fromLeft: stack.rect.x - left.rect.x,
        toRight: right.rect.x - stack.rect.x,
        total: right.rect.x - left.rect.x,
      }
    })
    const [center, left, right] = layouts
    expect(left.fromLeft).toBeCloseTo(center.fromLeft, 1)
    expect(right.toRight).toBeCloseTo(center.toRight, 1)
    expect(left.total).toBeCloseTo(right.total, 1)
    expect(left.total).toBeGreaterThan(center.total + 10)
    expect(right.fromLeft - center.fromLeft).toBeCloseTo(left.toRight - center.toRight, 1)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Smashed limits' }))
    const slide = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    expect(slide.match(/<a14:m>/g)).toHaveLength(5)
    expect(slide.match(/>123456789<\/m:t>/g)).toHaveLength(1)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports cramped superscripts, stacks, and measured laps as editable Office Math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-cramped-math-'))
  const canvas = { width: 960, height: 540 }
  const formulas = [
    String.raw`\cramped{x^{2^3}}`,
    String.raw`A\crampedllap{x^2}B`,
    String.raw`\sum_{\crampedsubstack{x^2\\y^3}}t`,
    String.raw`\frac{\crampedclap{x^2}n}{2}`,
  ]
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, formulas.map(formula => '# Cramped scripts\n\n$$\n' + formula + '\n$$').join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(4)
    const [power, lap, stack, fraction] = frames.map((frame) => {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      expect(body).toBeDefined()
      return body!
    })
    expect(power.expression.match(/<m:sSup>/g)).toHaveLength(2)
    expect(lap.cells).toHaveLength(2)
    expect(lap.expression).toContain('>A</m:t>')
    const [ink, after] = lap.cells!
    expect(ink.expression).toContain('<m:sSup>')
    expect(after.expression).toContain('>B</m:t>')
    expect(ink.rect.x).toBeLessThan(after.rect.x)
    expect(ink.rect.x + ink.rect.w).toBeCloseTo(after.rect.x, 1)
    expect(stack.expression).toContain('<m:nary>')
    expect(stack.expression.match(/<m:sSup>/g)).toHaveLength(2)
    expect(fraction.expression).toContain('<m:f>')
    expect(fraction.expression).toContain('<m:zeroWid m:val="1"/>')
    expect(fraction.expression).toContain('<m:sSup>')

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Cramped expressions' }))
    expect(parts.get('ppt/slides/slide2.xml')?.toString().match(/<a14:m>/g)).toHaveLength(3)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('preserves math box geometry and exports positioned boxes as editable equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-scaled-box-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  throwOnError: true
---

# Scaled equations

$x\scalebox{-2}[-0.5]{Agp}z$

$x\resizebox{90px}{!}{Agp}z$

$x\resizebox*{!}{40px}{Agp}z$

$x\resizebox{1.5\width}{38px}{Agp}z$

$x\scalebox{1}[-2]{\scalebox{1}[1.5]{Agp}}z$

---

# Native equation

$$
\frac{1}{2}
$$

---

# Rotated equations

$x\rotatebox{90}{Agp}z$

$x\rotatebox[origin=c]{180}{Agp}z$

$x\rotatebox[x=0.5\width,y=3px]{90}{Agp}z$

$x\rotatebox[origin=lB,units=-400]{100}{Agp}z$

$x\rotatebox[origin=c]{36}{\scalebox{1.3}[-1.2]{Agp}}z$

---

# Text boxes

$x\makebox[72px][l]{A}z$

$x\makebox[72px]{A}z$

$x\makebox[72px][r]{A}z$

$x\makebox[160px][s]{two words}z$

$\mathrm{Leading}x\makebox[12px][r]{Wide text}z$

$x{\setlength{\fboxsep}{4px}\fboxrule=2px\framebox[100px][r]{A}}z$

$x\mathmakebox[\dimexpr(\width+8px)*(3/2)\relax][r]{\text{Inset}}z$

---

# Raised boxes

$\raisebox{\depth}{Agp}$

$\raisebox{-.5\height}[\height][.25\totalheight]{Agp}$

$\raisebox{5px}[\height][0px]{Agp}$

$\raisebox{.1\width}{Agp}$

$\raisebox{30px}[2px][0px]{Agp}$

$\raisebox{\dimexpr(\height-\depth)/2+2px\relax}[\dimexpr9px+4px*2][3px]{Agp}$

---

# Aligned and nested boxes

\begin{align}
x&=\makebox[72px][r]{A}+z\tag{W} \\
y&=\raisebox{5px}{$\frac{1}{2}$}+z\tag{R}
\end{align}

$\frac{\raisebox{5px}{A}}{2}$

$\frac{\makebox[32px]{B}}{2}$

---

# Transformed math and alignment

$$
\scalebox{1.5}{$a^2$}
$$

\begin{align}
u&=\rotatebox[origin=rB]{36}{$\frac{1}{2}$}+v\tag{T}\\
w&=\resizebox{4em}{!}{$r_0$}+z
\end{align}

$\frac{\rotatebox{30}{Nested}}{2}$`)
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
      const measure = () => view.evaluate<{
        width: number, height: number, depth: number, natural: number[], error: number
      }[]>(`(async () => {
        await document.fonts.ready
        await new Promise(requestAnimationFrame)
        return [...document.querySelectorAll('#stage > article:not([hidden]) mpadded[data-math-transform-box]')].map(box => {
          const inner = box.firstElementChild
          const ink = inner.firstElementChild
          const frame = box.getBoundingClientRect()
          const drawing = ink.getBoundingClientRect()
          return {
            width: parseFloat(box.getAttribute('width')), height: parseFloat(box.getAttribute('height')), depth: parseFloat(box.getAttribute('depth')),
            natural: [parseFloat(getComputedStyle(inner).width), parseFloat(getComputedStyle(inner).height)],
            error: Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(frame[key] - drawing[key]))),
          }
        })
      })()`)
      const dimensions = await measure()
      expect(dimensions).toHaveLength(6)
      for (const { error } of dimensions) expect(error).toBeLessThan(0.1)
      const [reflected, wide, tall, relative, nested, inner] = dimensions
      expect(reflected.width).toBeCloseTo(reflected.natural[0] * 2, 1)
      expect(reflected.height + reflected.depth).toBeCloseTo(reflected.natural[1] * 0.5, 1)
      expect(reflected.depth).toBeGreaterThan(reflected.height)
      expect(wide.width).toBeCloseTo(90, 1)
      expect(wide.height + wide.depth).toBeCloseTo(wide.natural[1] * 90 / wide.natural[0], 1)
      expect(tall.height + tall.depth).toBeCloseTo(40, 1)
      expect(relative.width).toBeCloseTo(relative.natural[0] * 1.5, 1)
      expect(relative.height).toBeCloseTo(38, 1)
      expect(relative.depth).toBeGreaterThan(0)
      expect(nested.height).toBeCloseTo(inner.depth * 2, 1)
      expect(nested.depth).toBeCloseTo(inner.height * 2, 1)

      await view.evaluate('window.presentationNavigation.go(3)')
      const rotated = await measure()
      expect(rotated).toHaveLength(6)
      for (const { error } of rotated) expect(error).toBeLessThan(0.15)
      const [baseline, center, offset, clockwise, , nestedScale] = rotated
      expect(baseline.width).toBeCloseTo(baseline.natural[1], 1)
      expect(baseline.height).toBeCloseTo(baseline.natural[0], 1)
      expect(baseline.depth).toBe(0)
      expect(center.width).toBeCloseTo(center.natural[0], 1)
      expect(center.height + center.depth).toBeCloseTo(center.natural[1], 1)
      expect(offset.height - offset.depth).toBeCloseTo(6, 1)
      expect(offset.height + offset.depth).toBeCloseTo(offset.natural[0], 1)
      expect(clockwise.height).toBe(0)
      expect(clockwise.depth).toBeCloseTo(clockwise.natural[0], 1)

      await view.evaluate(`(async () => {
        const scale = document.querySelector('#stage > article:not([hidden]) [data-math-transform-box="scale"]')
        const before = scale.getAttribute('width')
        scale.style.fontSize = '42px'
        for (let i = 0; i < 30 && scale.getAttribute('width') === before; i++) await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
      })()`)
      const resized = (await measure()).at(-1)!
      expect(resized.width).toBeGreaterThan(nestedScale.width)
      expect(resized.width).toBeCloseTo(resized.natural[0] * 1.3, 1)
      expect(resized.error).toBeLessThan(0.15)

      await view.evaluate('window.presentationNavigation.go(4)')
      const text = await view.evaluate<{
        width: number, ink: number, offset: number, outer: number, stretch: number
      }[]>(`(async () => {
        await new Promise(requestAnimationFrame)
        return [...document.querySelectorAll('#stage > article:not([hidden]) [data-math-transform-box]')].map(box => {
          const ink = box.querySelector('[data-math-box-ink]')
          const bounds = box.getBoundingClientRect()
          const width = parseFloat(box.getAttribute('width'))
          const scale = bounds.width / width
          return {
            width, ink: ink.getBoundingClientRect().width / scale,
            offset: (ink.getBoundingClientRect().left - bounds.left) / scale,
            outer: box.parentElement.getBoundingClientRect().width / scale,
            stretch: parseFloat(ink.getAttribute('data-extra-space') ?? 0),
          }
        })
      })()`)
      expect(text).toHaveLength(7)
      const [left, centered, right, spread, overflowing, framed, resizedText] = text
      expect([left.width, centered.width, right.width]).toEqual([72, 72, 72])
      expect(left.offset).toBeCloseTo(0, 1)
      expect(centered.offset).toBeCloseTo((centered.width - centered.ink) / 2, 1)
      expect(right.offset + right.ink).toBeCloseTo(right.width, 1)
      expect(spread.stretch).toBeGreaterThan(0)
      expect(spread.ink).toBeCloseTo(160, 1)
      expect(overflowing.ink).toBeGreaterThan(overflowing.width)
      expect(overflowing.offset + overflowing.ink).toBeCloseTo(12, 1)
      expect(framed.width).toBeCloseTo(88, 1)
      expect(framed.outer).toBeCloseTo(100, 1)
      expect(framed.offset + framed.ink).toBeCloseTo(88, 1)
      expect(resizedText.width).toBeCloseTo(2 * (resizedText.ink + 8), 1)
      expect(resizedText.offset + resizedText.ink).toBeCloseTo(resizedText.width, 1)

      await view.evaluate('window.presentationNavigation.go(5)')
      const raised = await view.evaluate<{
        ascent: number, descent: number, height: number, depth: number, width: number, offset: number
      }[]>(`(async () => {
        await new Promise(requestAnimationFrame)
        return [...document.querySelectorAll('#stage > article:not([hidden]) [data-math-transform-box="raise"]')].map(box => {
          const [ink, anchor] = box.firstElementChild.children
          const inner = box.firstElementChild.getBoundingClientRect()
          const baseline = anchor.getBoundingClientRect().top
          const width = parseFloat(box.getAttribute('width'))
          const scale = inner.width / width
          return {
            ascent: parseFloat(box.getAttribute('height')), descent: parseFloat(box.getAttribute('depth')),
            height: (baseline - inner.top) / scale, depth: (inner.bottom - baseline) / scale,
            width, offset: (inner.top - ink.getBoundingClientRect().top) / scale,
          }
        })
      })()`)
      expect(raised).toHaveLength(5)
      const [lift, lower, fixed, relativeLift, expression] = raised
      expect(lift.offset).toBeCloseTo(lift.depth, 1)
      expect(lift.ascent).toBeCloseTo(lift.height + lift.depth, 1)
      expect(lift.descent).toBe(0)
      expect(lower.offset).toBeCloseTo(-lower.height / 2, 1)
      expect(lower.ascent).toBeCloseTo(lower.height, 1)
      expect(lower.descent).toBeCloseTo((lower.height + lower.depth) / 4, 1)
      expect(fixed.offset).toBeCloseTo(5, 1)
      expect(fixed.ascent).toBeCloseTo(fixed.height, 1)
      expect(fixed.descent).toBe(0)
      expect(relativeLift.offset).toBeCloseTo(relativeLift.width / 10, 1)
      expect(expression.offset).toBeCloseTo((expression.height - expression.depth) / 2 + 2, 1)
      expect(expression.ascent).toBeCloseTo(17, 1)
      expect(expression.descent).toBeCloseTo(3, 1)
    }
    finally {
      view.close()
      await server.stop(true)
    }

    const frames: PowerPointFrame[] = []
    await captureFrames({ root: dist, executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    const rendered = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(rendered).toHaveLength(5)
    expect(rendered.every(node => node.data)).toBe(true)
    expect(rendered.map(node => Boolean(node.equation))).toEqual([false, true, true, false, false])
    expect(rendered[1].equation?.cells?.[0].rect.w).toBeCloseTo(90, 1)
    expect(rendered[2].equation?.cells?.[0].rect.h).toBeCloseTo(40, 1)
    const plain = frames[1].editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')
    expect(plain?.equation?.expression).toContain('<m:f>')
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Scaled equations' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    expect(slide.match(/<p:pic>/g)).toHaveLength(3)
    expect(slide.match(/<a14:m>/g)).toHaveLength(6)
    expect(parts.get('ppt/slides/slide2.xml')?.toString()).toContain('<m:f>')
    const rotated = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(rotated.match(/<p:pic>/g)).toHaveLength(1)
    expect([...rotated.matchAll(/<a:xfrm rot="(\d+)">/g)].map(([, angle]) => Number(angle)))
      .toEqual([16200000, 10800000, 16200000, 5400000])
    const text = frames[3].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(text).toHaveLength(7)
    expect(text[4].rect.w).toBeGreaterThan(45)
    for (const node of [text[0], text[1], text[2], text[4], text[6]]) {
      expect(node.equation?.expression).toContain('>x</m:t>')
      expect(node.equation?.cells).toHaveLength(2)
      expect(node.equation?.cells?.[1].expression).toContain('>z</m:t>')
    }
    const [left, centered, right] = text.slice(0, 3).map(node => node.equation!.cells![0].rect)
    for (const node of text.slice(0, 3)) expect(node.equation?.cells?.[0].expression).toContain('>A</m:t>')
    expect(centered.x - left.x).toBeCloseTo((right.x - left.x) / 2, 1)
    expect(right.x + right.w - left.x).toBeCloseTo(72, 0)
    expect(text[4].equation!.cells![0].rect.x).toBeLessThan(text[4].equation!.rect.x + text[4].equation!.rect.w)
    expect(text[6].equation?.cells?.[0].expression).toContain('>Inset</m:t>')
    const spread = text[3].equation
    expect(spread?.expression).toContain('>x</m:t>')
    expect(spread?.cells).toHaveLength(3)
    const [firstWord, lastWord, trailingToken] = spread!.cells!
    expect(firstWord.expression).toContain('>two</m:t>')
    expect(lastWord.expression).toContain('>words</m:t>')
    expect(trailingToken.expression).toContain('>z</m:t>')
    expect(lastWord.rect.x + lastWord.rect.w - firstWord.rect.x).toBeCloseTo(160, 0)
    const framed = text[5].equation
    expect(framed?.expression).toContain('>x</m:t>')
    expect(framed?.cells).toHaveLength(2)
    expect(framed?.frames).toHaveLength(1)
    const [letter, following] = framed!.cells!
    const [frame] = framed!.frames!
    expect(letter.expression).toContain('>A</m:t>')
    expect(following.expression).toContain('>z</m:t>')
    expect(frame.rect.w).toBeCloseTo(100, 0)
    expect(frame.border?.width).toBeCloseTo(2)
    expect(frame.rect.x + frame.rect.w - letter.rect.x - letter.rect.w).toBeCloseTo(6, 0)
    const textSlide = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    expect(textSlide.match(/<a14:m>/g)).toHaveLength(22)
    expect(textSlide).toContain('name="Equation frame"')
    expect(textSlide).not.toContain('<p:pic>')
    const raised = frames[4].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(raised).toHaveLength(6)
    for (const node of raised) expect(node.equation?.expression).toContain('>Agp</m:t>')
    expect(raised[1].rect.h).toBeGreaterThan(raised[0].rect.h + 2)
    expect(raised[4].rect.h).toBeGreaterThan(30)
    expect(raised[4].equation!.rect.h).toBeLessThan(raised[4].rect.h)
    const raisedSlide = parts.get('ppt/slides/slide5.xml')?.toString() ?? ''
    expect(raisedSlide.match(/<a14:m>/g)).toHaveLength(6)
    expect(raisedSlide).not.toContain('<p:pic>')
    const aligned = parts.get('ppt/slides/slide6.xml')?.toString() ?? ''
    expect(aligned).toContain('>(W)</m:t>')
    expect(aligned).toContain('>(R)</m:t>')
    expect(aligned).toContain('<m:f>')
    expect(aligned.match(/<p:pic>/g)).toHaveLength(2)
    const transformed = frames[6].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(transformed).toHaveLength(3)
    expect(transformed[0].equation?.expression).toContain('<m:sSup>')
    expect(transformed[0].equation!.rect.w).toBeGreaterThan(25)
    const fraction = transformed[1].equation?.cells?.find(cell => cell.rotation)
    expect(fraction?.expression).toContain('<m:f>')
    expect(fraction?.rotation).toBeCloseTo(-36, 5)
    expect(transformed[1].equation?.tags?.[0].expression).toContain('>(T)</m:t>')
    expect(transformed[2].equation).toBeUndefined()
    const graphic = parts.get('ppt/slides/slide7.xml')?.toString() ?? ''
    expect(graphic).toContain('<a:xfrm rot="19440000">')
    expect(graphic.match(/<p:pic>/g)).toHaveLength(1)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

it.skipIf(!chrome)('reuses TeX boxes across slides and keeps simple saved equations editable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-saved-boxes-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  globalGroup: true
---

# Define labels

$$
\newsavebox{\plain}\newsavebox{\wide}
\sbox{\plain}{\textbf{Fraction} $\frac{1}{2}$}
\savebox{\wide}[96px][r]{\textbf{Wide}}
\usebox{\plain}
$$

---

# Reuse labels

$\usebox{\plain}$

$\usebox{\wide}$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, range: '2', editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(1)
    const formulas = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(formulas).toHaveLength(2)
    expect(formulas[0].equation?.expression).toContain('<m:f>')
    expect(formulas[0].equation?.expression).toContain('Fraction')
    expect(formulas[1].rect.w).toBeCloseTo(96, 0)
    const wide = formulas[1].equation
    expect(wide?.expression).toContain('>Wide</m:t>')
    expect(wide?.expression).toContain('<m:sty m:val="b"/>')
    expect(wide!.rect.x + wide!.rect.w - formulas[1].rect.x).toBeCloseTo(96, 0)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Saved equations' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString()
    expect(slide).toContain('<a14:m>')
    expect(slide).toContain('<m:f>')
    expect(slide?.match(/<a14:m>/g)).toHaveLength(2)
    expect(slide).not.toContain('<p:pic>')
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

it.skipIf(!chrome)('exports styled spread text and colored boxes in tagged equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-framed-math-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  minRuleThickness: 0.18
---

# Math box styles

$x\framebox[250px][s]{\textbf{two words} $t^2$}z$

$$
\fbox{natural width}
$$

\begin{align}
A&={\fboxrule=2px\fcolorbox{112233}{ffe680}{x}}+y\tag{F}\\
B&=z\tag{G}
\end{align}

$$
a^{\fbox{b}}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    const formulas = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(formulas).toHaveLength(4)

    const spread = formulas[0].equation
    const [two, words] = spread?.cells ?? []
    for (const [cell, word] of [[two, 'two'], [words, 'words']] as const) {
      expect(cell?.expression).toContain(`>${word}</m:t>`)
      expect(cell?.expression).toMatch(/<m:sty m:val="b"\/>| b="1"/)
    }
    expect(words.rect.x).toBeGreaterThan(two.rect.x + two.rect.w)
    expect(spread?.cells?.some(cell => cell.expression.includes('<m:sSup>'))).toBe(true)
    expect(spread?.cells?.at(-1)?.expression).toContain('>z</m:t>')
    expect(spread?.frames?.[0].rect.w).toBeCloseTo(250, 0)
    expect(formulas[1].equation?.frames?.[0].border?.width).toBeGreaterThan(3)
    expect(formulas[1].equation?.expression).toContain('>natural width</m:t>')

    const aligned = formulas[2].equation
    expect(aligned?.frames?.[0].fill).toEqual({ r: 255, g: 230, b: 128, a: 1 })
    expect(aligned?.frames?.[0].border?.color).toEqual({ r: 17, g: 34, b: 51, a: 1 })
    expect(aligned?.cells?.some(cell => cell.expression.includes('>x</m:t>'))).toBe(true)
    expect(aligned?.tags?.map(tag => tag.expression).join('')).toMatch(/>\(F\)<\/m:t>.*>\(G\)<\/m:t>/)
    expect(formulas[3].equation).toBeUndefined()
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Styled math boxes' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    expect(slide.match(/name="Equation frame"/g)).toHaveLength(3)
    expect(slide.match(/<p:pic>/g)).toHaveLength(1)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

it.skipIf(!chrome)('keeps circled text and measured actuarial strokes editable in PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-shaped-enclosures-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  minRuleThickness: 0.16
---

# Actuarial notation

$\textcolor{#0055cc}{\text{\textcircled{\textbf{A}}}}$

$$
\begin{align}
P&=\textcolor{#005566}{\angl{12}}\tag{N}\\
Q&=\text{\textcircled{B}}\tag{L}
\end{align}
$$

$a_{\angl{n}}$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    const formulas = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(formulas).toHaveLength(3)
    const [inline, aligned, nested] = formulas.map(node => node.equation)

    expect(inline?.frames).toHaveLength(1)
    const circle = inline!.frames![0]
    expect(circle.ellipse).toBe(true)
    expect(circle.border?.color).toEqual({ r: 0, g: 85, b: 204, a: 1 })
    expect(circle.border?.width).toBeGreaterThan(3)
    expect(inline?.expression).toContain('>A</m:t>')
    expect(inline?.expression).toMatch(/<m:sty m:val="b"\/>| b="1"/)
    expect(circle.rect.w).toBeGreaterThan(inline!.rect.w)
    expect(circle.rect.h).toBeGreaterThan(inline!.rect.h)

    expect(aligned?.frames?.[0].ellipse).toBe(true)
    expect(aligned?.rules).toHaveLength(2)
    const [top, side] = aligned!.rules!
    expect(top.fill).toEqual({ r: 0, g: 85, b: 102, a: 1 })
    expect(side.fill).toEqual(top.fill)
    expect(top.rect.h).toBeGreaterThan(3)
    expect(side.rect.w).toBeCloseTo(top.rect.h)
    expect(side.rect.y).toBeCloseTo(top.rect.y + top.rect.h)
    expect(side.rect.x + side.rect.w).toBeCloseTo(top.rect.x + top.rect.w)
    expect(aligned?.cells?.some(cell => cell.expression.includes('>12</m:t>'))).toBe(true)
    expect(aligned?.tags?.map(tag => tag.expression).join('')).toMatch(/>\(N\)<\/m:t>.*>\(L\)<\/m:t>/)
    expect(nested).toBeUndefined()

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Actuarial notation' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    expect(slide.match(/<a:prstGeom prst="ellipse">/g)).toHaveLength(2)
    expect(slide.match(/name="Equation rule"/g)).toHaveLength(2)
    expect(slide.match(/<p:pic>/g)).toHaveLength(1)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

it.skipIf(!chrome)('keeps empheq frames and delimiters aligned around editable numbered reveals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-empheq-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Reference

See \eqref{a} and \eqref{b}.

---

# Bounded equations

\DeclareLeftDelimiter[\enspace P\Rightarrow]{\lbrace}
\DeclareRightDelimiter[\Leftarrow Q\enspace]{\rbrack}
\EmphEqdelimiterfactor=650
\setlength{\EmphEqdelimitershortfall}{0.5em}
\empheqset{innerbox=\fbox,left=\empheqbiglbrace,right={\EmphEqdelimiterfactor=1120\empheqrbrack}}

$$ {1|2|all}
\newcommand{\panel}[1]{\fcolorbox{blue}{navy}{#1}}
\begin{empheq}[box=\panel]{alignat=1}
X&=\frac{1}{2}\label{a}\\
Y&=\frac{3}{4}\label{b}
\end{empheq}
$$

---

# Measured decorations

\begin{empheq}[
  innerbox=\fbox,
  left={\resizebox*{.25\EmphEqdisplaywidth}{\EmphEqdisplayheight+\EmphEqdisplaydepth}{L}},
  right={\resizebox{\EmphEqtagwidth+4px}{.5\EmphEqdisplayheight}{R}}
]{align}
X&=\frac{1}{2}\tag{A}\\
Y&=\frac{3}{4}\tag{Longer}
\end{empheq}

---

# Full-width measured decoration

\begin{empheq}[innerbox=\fbox,left={\makebox[\dimexpr\EmphEqdisplaywidth/4\relax]{L}}]{flalign}
x&=a & y&=b\\
z&=c & w&=d
\end{empheq}`)
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
      const markup = await Bun.file(join(dist, 'index.html')).text()
      expect(markup).toContain('data-slide-link="2"><math><mrow><mtext>(1)</mtext>')
      expect(markup).toContain('data-slide-link="2"><math><mrow><mtext>(2)</mtext>')
      await view.navigate(server.url.href + '#slide-2')
      const layout = await view.evaluate<{
        positioned: boolean, affixOrder: boolean, delimiters: { ink: number, minimum: number, target: number }[],
        bodyHeight: number, border: string, fill: string
      }>(`(async () => {
        await document.fonts.ready
        await new Promise(requestAnimationFrame)
        const group = document.querySelector('.math-empheq')
        const wrapper = selector => group.querySelector(selector)
        const rect = selector => wrapper(selector).getBoundingClientRect()
        const outer = rect('[data-empheq-box="outer"]')
        const inner = rect('[data-empheq-box="inner"]')
        const left = rect('[data-empheq-side="left"]')
        const right = rect('[data-empheq-side="right"]')
        const start = rect('mtr:first-child [data-empheq-start]')
        const end = rect('mtr:last-child [data-empheq-end]')
        const tag = rect('.math-equation-number')
        const paint = getComputedStyle(wrapper('[data-empheq-box="outer"]'))
        const groupBounds = group.getBoundingClientRect()
        const scale = groupBounds.height / parseFloat(getComputedStyle(group).height)
        const cells = [...group.querySelectorAll('.math-display-grid > mtr > mtd:not(.math-equation-number, [aria-hidden])')]
          .map(cell => cell.getBoundingClientRect()).filter(cell => cell.width && cell.height)
        const bodyHeight = Math.max(...cells.map(cell => cell.bottom)) - Math.min(...cells.map(cell => cell.top))
        const innerPaint = getComputedStyle(wrapper('[data-empheq-box="inner"]'))
        const inset = parseFloat(innerPaint.borderTopWidth) + parseFloat(innerPaint.paddingTop)
        return {
          positioned: outer.left < left.left && left.right <= inner.left + 0.5
            && inner.left < start.left && inner.right > end.right && inner.top < start.top && inner.bottom > end.bottom
            && right.left >= inner.right - 0.5 && outer.right > right.right && tag.left >= outer.right - 0.5,
          affixOrder: rect('[data-empheq-side="left"] [data-empheq-delimiter]').right < rect('[data-empheq-side="left"] mi').left
            && rect('[data-empheq-side="right"] mi').right < rect('[data-empheq-side="right"] [data-empheq-delimiter]').left,
          delimiters: Array.from(group.querySelectorAll('[data-empheq-delimiter]'), (fence, index) => {
            const height = bodyHeight / scale + (index === 0 ? 2 * inset : 0)
            const shortfall = parseFloat(getComputedStyle(fence).fontSize) * 0.5
            return {
              ink: fence.getBoundingClientRect().height,
              minimum: parseFloat(fence.getAttribute('minsize')),
              // The left fence is limited by the shortfall, the right one by the factor.
              target: index === 0 ? height - shortfall : height * 1.12,
            }
          }),
          bodyHeight, border: paint.borderTopColor, fill: paint.backgroundColor,
        }
      })()`)
      expect(layout.positioned).toBe(true)
      expect(layout.affixOrder).toBe(true)
      expect(layout.delimiters).toHaveLength(2)
      for (const { ink, minimum, target } of layout.delimiters) {
        expect(minimum).toBeCloseTo(target, 1)
        expect(ink).toBeGreaterThan(layout.bodyHeight * 0.85)
      }
      expect(layout.delimiters[1].ink).toBeGreaterThan(layout.bodyHeight)
      expect(layout.border).toBe('rgb(0, 0, 255)')
      expect(layout.fill).toBe('rgb(0, 0, 128)')

      await view.evaluate('window.presentationNavigation.go(3)')
      const measureDecorations = () => view.evaluate<{
        heights: number[], frameHeight: number, bodyWidth: number, tagWidth: number, boxes: number[][]
      }>(`(async () => {
        await new Promise(requestAnimationFrame)
        const group = document.querySelector('#stage > article:not([hidden]) .math-empheq')
        const style = getComputedStyle(group)
        const bounds = group.getBoundingClientRect()
        const xScale = bounds.width / parseFloat(style.width)
        const yScale = bounds.height / parseFloat(style.height)
        const grid = group.querySelector('.math-display-grid')
        const cells = [...grid.querySelectorAll('mtr > mtd:not(.math-equation-number, [aria-hidden])')]
          .map(cell => cell.getBoundingClientRect()).filter(cell => cell.width && cell.height)
        const tags = [...grid.querySelectorAll('.math-equation-number > :first-child')]
        return {
          heights: ['height', 'depth'].map(axis => parseFloat(style.getPropertyValue('--empheq-display' + axis))),
          frameHeight: group.querySelector('[data-empheq-box="inner"]').getBoundingClientRect().height / yScale,
          bodyWidth: (Math.max(...cells.map(cell => cell.right)) - Math.min(...cells.map(cell => cell.left))) / xScale,
          tagWidth: Math.max(...tags.map(tag => tag.getBoundingClientRect().width)) / xScale,
          boxes: [...group.querySelectorAll('[data-empheq-measure]')].map(box =>
            ['width', 'height', 'depth'].map(name => parseFloat(box.getAttribute(name)))),
        }
      })()`)
      const verifyDecorations = (measured: Awaited<ReturnType<typeof measureDecorations>>) => {
        const [height, depth] = measured.heights
        const [[leftWidth, leftHeight, leftDepth], [rightWidth, rightHeight]] = measured.boxes
        expect(height).toBeGreaterThan(depth)
        expect(height + depth).toBeCloseTo(measured.frameHeight, 1)
        expect(leftHeight + leftDepth).toBeCloseTo(measured.frameHeight, 1)
        expect(leftWidth).toBeCloseTo(measured.bodyWidth * 0.25, 1)
        expect(rightWidth).toBeCloseTo(measured.tagWidth + 4, 1)
        expect(rightHeight).toBeCloseTo(height * 0.5, 1)
      }
      const measured = await measureDecorations()
      verifyDecorations(measured)
      await view.evaluate(`(async () => {
        const group = document.querySelector('#stage > article:not([hidden]) .math-empheq')
        const initial = group.style.getPropertyValue('--empheq-displayheight')
        group.style.fontSize = '34px'
        for (let attempts = 0; attempts < 40 && group.style.getPropertyValue('--empheq-displayheight') === initial; attempts++)
          await new Promise(requestAnimationFrame)
      })()`)
      const resized = await measureDecorations()
      expect(resized.frameHeight).toBeGreaterThan(measured.frameHeight)
      verifyDecorations(resized)

      await view.evaluate('window.presentationNavigation.go(4)')
      const wide = await view.evaluate<{ body: number, decoration: number, register: number }>(`(async () => {
        await new Promise(requestAnimationFrame)
        const group = document.querySelector('#stage > article:not([hidden]) .math-empheq')
        const inner = getComputedStyle(group.querySelector('[data-empheq-box="inner"]'))
        const inset = parseFloat(inner.paddingLeft) + parseFloat(inner.borderLeftWidth)
        return {
          body: parseFloat(inner.width) - 2 * inset,
          decoration: parseFloat(group.querySelector('[data-empheq-measure]').getAttribute('width')),
          register: parseFloat(getComputedStyle(group).getPropertyValue('--empheq-displaywidth')),
        }
      })()`)
      expect(wide.register).toBeCloseTo(wide.body, 1)
      expect(wide.decoration).toBeCloseTo(wide.body * 0.25, 1)
    }
    finally {
      view.close()
      await server.stop(true)
    }
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: dist, executable: chrome!, scale: 1, canvas, range: '2,3', editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => [frame.position?.slide, frame.position?.click])).toEqual([[2, 0], [2, 1], [2, 2], [3, 0]])
    for (const [step, frame] of frames.slice(0, 3).entries()) {
      const equation = frame.editable?.nodes.flatMap(node => node.kind === 'raster' && node.equation?.tags ? [node.equation] : [])[0]
      expect(equation).toBeDefined()
      expect(equation?.tags?.map(tag => tag.expression.match(/\(\d+\)/)?.[0])).toEqual(['(1)', '(2)'])
      expect(equation?.tags?.map(tag => tag.expression.includes('<a:alpha val="24000"/>'))).toEqual([step === 1, step === 0])
      expect(equation?.cells?.filter(cell => cell.expression.includes('<m:f>'))).toHaveLength(2)
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Bounded equations' }))
    const slide = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(slide.match(/name="Equation tag"/g)).toHaveLength(2)
    expect(slide).toContain('val="000080"')
    expect(slide).toContain('val="0000FF"')
    expect(slide).toContain('<p:pic>')
    const decorations = parts.get('ppt/slides/slide4.xml')?.toString() ?? ''
    expect(decorations.match(/<p:pic>/g)).toHaveLength(2)
    expect(decorations.match(/name="Equation tag"/g)).toHaveLength(2)
    expect(decorations.match(/<m:f>/g)).toHaveLength(2)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('aligns empheq margin boxes with flush-left equations and keeps their frames editable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-marginbox-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    const display = (frame: string) => String.raw`# Aligned equations

\empheqset{innerbox=\fbox,left=\empheqlbrace,right=\empheqrbrack}

$$
\newcommand{\panel}[1]{{\fboxsep=12px\fboxrule=2px\fcolorbox{blue}{navy}{#1}}}
\begin{empheq}[${frame}]{align}
X&=\frac{1}{2}\tag{A}\\[2px]
Y&=\frac{3}{4}\tag{B}
\end{empheq}
$$`
    const slides = ['', String.raw`box=\panel`, String.raw`marginbox=\panel`].map(display)
    await Bun.write(entry, '---\nmath:\n  fleqn: true\n  throwOnError: true\n---\n\n' + slides.join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({
      root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false,
    }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(3)
    const layouts = frames.map(frame => {
      const nodes = frame.editable?.nodes ?? []
      const equation = nodes.find((node): node is IrRaster => node.kind === 'raster' && !!node.equation?.tags)?.equation
      const fractions = equation?.cells?.filter(cell => cell.expression.includes('<m:f>')) ?? []
      expect(fractions).toHaveLength(2)
      expect(equation?.tags?.map(tag => tag.expression.match(/\([AB]\)/)?.[0])).toEqual(['(A)', '(B)'])
      const outline = nodes.find(node => node.kind === 'box' && node.fill?.b === 128)
      return { column: fractions[0].rect.x, tagX: equation!.tags![0].rect.x, outline: outline?.rect }
    })
    const [plain, boxed, margin] = layouts
    expect(plain.outline).toBeUndefined()
    expect(margin.column).toBeCloseTo(plain.column, 1)
    expect(boxed.column - margin.column).toBeCloseTo(14, 1)
    expect(boxed.outline!.x - margin.outline!.x).toBeCloseTo(14, 1)
    expect(margin.outline!.w).toBeCloseTo(boxed.outline!.w, 1)
    expect(margin.outline!.x + margin.outline!.w).toBeLessThan(margin.tagX)
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Margin frames' }))
    const slide = parts.get('ppt/slides/slide3.xml')?.toString() ?? ''
    expect(slide).toContain('val="000080"')
    expect(slide).toContain('val="0000FF"')
    expect(slide.match(/<m:f>/g)).toHaveLength(2)
    expect(slide.match(/name="Equation tag"/g)).toHaveLength(2)
  }
  finally { await rm(root, { recursive: true, force: true }) }
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

it.skipIf(!chrome)('exports signed spreadlines spacing and nested reveals as editable equations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-spreadlines-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`# Row distances

$$ {1|2|3|4|all}
\begin{spreadlines}{14px}
\begin{align}
X&=Y\\[4px]
X&=Y
\end{align}
\begin{spreadlines}{-2px}
\begin{align}
X&=Y\\
X&=Y
\end{align}
\end{spreadlines}
\end{spreadlines}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: true }, frame => { frames.push(frame) })
    expect(frames.map(frame => frame.position?.click)).toEqual([0, 1, 2, 3, 4])
    for (const [step, frame] of frames.entries()) {
      const equations = frame.editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math').map(node => node.equation) ?? []
      expect(equations).toHaveLength(2)
      const left = equations.flatMap(equation => equation
        ? [equation, ...(equation.cells ?? [])].filter(cell => cell.expression.includes('>X</m:t>'))
        : [])
      expect(left).toHaveLength(4)
      const [a, b, c, d] = left
      expect((b.rect.y - a.rect.y) - (d.rect.y - c.rect.y)).toBeCloseTo(20, 1)
      expect(left.map(cell => cell.expression.includes('<a:alpha val="24000"/>'))).toEqual(left.map((_, index) => step < 4 && step !== index))
      expect(equations.flatMap(equation => equation?.tags ?? [])).toHaveLength(4)
    }
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Row distances' }))
    expect(parts.get('ppt/slides/slide5.xml')?.toString().match(/<a14:m>/g)).toHaveLength(12)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('positions Mathtools intertext and continuation spacing in editable Office Math', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-mathtools-spacing-'))
  const canvas = { width: 960, height: 540 }
  const alignment = String.raw`\begin{align*}
A&=x\\
\intertext{Explanation}
B&=y\\
\shortintertext{Then}
C&=z\\
\shortvdotswithin{=}
D&=w
\end{align*}`
  const variants = [
    '',
    '\\mathtoolsset{above-intertext-sep=8px,below-intertext-sep=-3px,above-shortintertext-sep=6.75pt,below-shortintertext-sep=1.5pt,shortvdotsadjustabove=3.45pt,shortvdotsadjustbelow=0pt}',
    '\\mathtoolsset{above-intertext-sep=8px,above-shortintertext-sep=6.75pt,original-intertext,original-shortintertext}',
  ]
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, variants.map(settings => String.raw`# Layout

${settings}
\begin{spreadlines}{10px}
${alignment}
\end{spreadlines}`).join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(3)
    const rowGaps = frames.map((frame) => {
      const body = frame.editable?.nodes.find((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math')?.equation
      const positions = ['A', 'Explanation', 'B', 'Then', 'C', '⋮', 'D'].map((symbol) => {
        const item = body && [body, ...(body.cells ?? [])].find(fragment => fragment.expression.includes(`>${symbol}</m:t>`))
        expect(item).toBeDefined()
        return item!.rect.y
      })
      return positions.slice(1).map((current, index) => current - positions[index])
    })
    for (const [index, delta] of [8, -3, 5, -2, 4, 4].entries())
      expect(rowGaps[1][index] - rowGaps[0][index]).toBeCloseTo(delta, 1)
    for (const [index, delta] of [10, 10, 10, 10, 0, 0].entries())
      expect(rowGaps[2][index] - rowGaps[0][index]).toBeCloseTo(delta, 1)

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Spacing options' }))
    const slide = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(slide.match(/<a14:m>/g)!.length).toBeGreaterThanOrEqual(7)
    for (const symbol of ['Explanation', 'Then', '⋮']) expect(slide).toContain(`>${symbol}</m:t>`)
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

\mathtoolsset{prescript-sup-format=\mathit,prescript-sub-format=\mathbf,prescript-arg-format=\mathrm,centercolon}

$$
\prescript{14}{6}{C}\quad\ce{^{14}_{6}C^-}\quad x:=y
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

$$
\root\leftroot{-3}\uproot{-2}\beta\of{z+1}
$$

$$
\frac{\sqrt{\sqrt[\uproot{2}3]{q}}}{n}
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
    expect(equations.filter(node => node.equation)).toHaveLength(4)
    expect(equations[3].equation?.frames?.[0].fill).toEqual({ r: 255, g: 255, b: 0, a: 1 })
    for (const equation of equations) expect(Buffer.from(equation.data, 'base64').subarray(1, 4).toString()).toBe('PNG')

    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Editable equations' }))
    const slide = parts.get('ppt/slides/slide1.xml')?.toString()
    expect(slide?.match(/<a14:m>/g)).toHaveLength(4)
    expect(slide?.match(/<mc:Fallback><p:sp>/g)).toHaveLength(4)
    expect(slide?.match(/<a:blipFill><a:blip r:embed=/g)).toHaveLength(4)
    expect(slide).toContain('name="Equation frame"')
    expect(slide).not.toContain('<p:pic>')
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
    expect(prescripts[0]).toMatch(/^<m:sub>.*?<m:sty m:val="b"\/>.*?<\/m:sub><m:sup>.*?<m:sty m:val="i"\/>/)
    expect(prescripts[0]).toContain('<m:sty m:val="p"/>')
    expect(prescripts[1]).toMatch(/<m:e><m:sSup><m:e>.*?>C<\/m:t>.*?<\/m:e><m:sup>.*?>−<\/m:t>/)
    expect(spacing).toContain('>∶</m:t>')

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
    expect(adjusted.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(adjusted.match(/<a14:m>/g)).toHaveLength(7)
    expect(adjusted.match(/name="Equation radical"/g)).toHaveLength(4)
    expect(adjusted.match(/name="Equation rule"/g)).toHaveLength(1)
    const roots = frames[6].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    const artwork = roots.flatMap(node => node.equation?.pictures ?? [])
    expect(artwork).toHaveLength(4)
    for (const radical of artwork) {
      expect(radical.kind).toBe('radical')
      expect(Buffer.from(radical.data, 'base64').subarray(1, 4).toString()).toBe('PNG')
    }
    const indexOffsets = roots.slice(0, 2).map(({ equation }) => {
      const base = equation!.rect
      const index = equation!.cells![0]
      expect(equation!.expression).toContain('>z</m:t>')
      expect(index.expression).toContain('>β</m:t>')
      return { x: index.rect.x - base.x, y: index.rect.y - base.y }
    })
    expect(indexOffsets[0].x).toBeLessThan(indexOffsets[1].x)
    expect(indexOffsets[0].y).toBeLessThan(indexOffsets[1].y)
    const boxes = parts.get('ppt/slides/slide8.xml')?.toString() ?? ''
    expect(boxes.match(/<a14:m>/g)).toHaveLength(3)
    expect(boxes).toContain('<m:f><m:num>')
    expect(boxes).toContain('>b</m:t>')
    expect(boxes).toContain('<m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/>')
    expect(boxes.match(/<p:pic>/g)).toHaveLength(2)
    expect(boxes.match(/name="Equation rule"/g)).toHaveLength(1)
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
\colorbox{yellow}{Highlighted text}
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

    expect(first.match(/<a14:m>/g)).toHaveLength(4)
    expect(first.match(/<mc:Fallback><p:sp>/g)).toHaveLength(4)
    expect(first).toContain('name="Equation frame"')
    expect(first).not.toContain('<p:pic>')
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

$$
\left[\begin{array}{|r::l|}
\hline
1&x\\
\hline\hdashline
\hdotsfor[0.8]{2}\\
3&-y\\
\hline
\end{array}\right]
$$

\begin{align}
u&=\begin{array}{c|c}p&q\\r&s\end{array}\tag{R}
\end{align}

---

# Nested multiline equation

$$
A=\left[\begin{multlined}[b][9em]a+b\\=c-d\end{multlined}\right]
$$

$$
B=\frac{\splitfrac{x+y+z}{+w}}{n}
$$

$$
C=\splitdfrac{u+v+w}{=z}
$$

$$
\cfrac[l]{a}{b+c+d}+\cfrac[r]{a}{b+c+d}
$$

---

# Conditions in prose

$$
\begin{dcases*}\sum_{i=1}^n i&when $n>0$\\0&otherwise\end{dcases*}
$$

$$
\begin{rcases*}x&for \(x\geq0\)\\0&otherwise\end{rcases*}
$$

---

# Nested ruled arrays and fractions

$$
\frac{\begin{array}{c|c}a&b\\c&d\end{array}}{2}
$$

$$
\begin{array}{c|c}\genfrac{}{}{.25em}{0}{p}{q}&s\\t&w\end{array}
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
    const nested = parts.get('ppt/slides/slide7.xml')?.toString() ?? ''
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
    expect(arrays.match(/<a14:m>/g)).toHaveLength(5)
    expect(arrays).not.toContain('<p:pic>')
    expect(arrays).toContain('name="Equation rule"')
    expect(arrays).toContain('<m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m>')
    expect(arrays.match(/<m:mr>/g)).toHaveLength(2)
    const [dottedMatrix, ruledMatrix, alignment] = [...dotted.matchAll(/<mc:Choice\b[^>]*>(.*?)<\/mc:Choice>/g)].map(([, choice]) => choice)
    expect(dotted.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(dottedMatrix.match(/<a14:m>/g)).toHaveLength(6)
    expect(dottedMatrix.match(/name="Equation delimiter"/g)).toHaveLength(2)
    expect(dottedMatrix).toContain('<a:prstGeom prst="ellipse">')
    expect(ruledMatrix.match(/<a14:m>/g)).toHaveLength(4)
    expect(ruledMatrix.match(/name="Equation delimiter"/g)).toHaveLength(2)
    expect(ruledMatrix).toContain('<a:prstGeom prst="ellipse">')
    expect(ruledMatrix).toContain('<a:custDash>')
    expect(ruledMatrix).toContain('>−</m:t>')
    expect(alignment).toContain('>(R)</m:t>')
    expect(alignment).toContain('>q</m:t>')
    expect(alignment).toContain('name="Equation rule"')
    const [lines, split, displaySplit, continued] = [...multiline.matchAll(/<mc:Choice\b[^>]*>(.*?)<\/mc:Choice>/g)].map(([, choice]) => choice)
    expect(multiline.match(/<mc:Fallback><p:sp>/g)).toHaveLength(4)
    expect(multiline.match(/<p:pic>/g)).toHaveLength(2)
    const positions = (choice: string, text: string) => [...choice.matchAll(/<p:sp>(.*?)<\/p:sp>/g)]
      .filter(([, shape]) => shape.includes(text))
      .map(([, shape]) => {
        const [, x, y] = /<a:off x="(\d+)" y="(\d+)"/.exec(shape) ?? []
        return { x: Number(x), y: Number(y) }
      })
    expect(lines.match(/<a14:m>/g)).toHaveLength(3)
    expect(lines.match(/name="Equation delimiter"/g)).toHaveLength(2)
    expect(lines).toMatch(/>a<\/m:t>.*?>b<\/m:t>.*?>c<\/m:t>.*?>d<\/m:t>/)
    const [firstLine] = positions(lines, '>a</m:t>')
    const [lastLine] = positions(lines, '>c</m:t>')
    expect(lastLine.x).toBeGreaterThan(firstLine.x)
    expect(lastLine.y).toBeGreaterThan(firstLine.y)
    expect(split.match(/<a14:m>/g)).toHaveLength(4)
    expect(split).toMatch(/>x<\/m:t>.*?>w<\/m:t>.*?>n<\/m:t>/)
    expect(split.match(/name="Equation rule"/g)).toHaveLength(1)
    const [splitUpper] = positions(split, '>x</m:t>')
    const [splitLower] = positions(split, '>w</m:t>')
    const [fractionBar] = positions(split, 'name="Equation rule"')
    const [denominator] = positions(split, '>n</m:t>')
    expect(splitLower.x).toBeGreaterThan(splitUpper.x)
    expect(splitLower.y).toBeGreaterThan(splitUpper.y)
    expect(fractionBar.y).toBeGreaterThan(splitLower.y)
    expect(denominator.y).toBeGreaterThan(fractionBar.y)
    expect(displaySplit.match(/<a14:m>/g)).toHaveLength(3)
    expect(displaySplit).not.toContain('name="Equation rule"')
    expect(continued.match(/<a14:m>/g)).toHaveLength(5)
    expect(continued.match(/name="Equation rule"/g)).toHaveLength(2)
    const numerators = positions(continued, '>a</m:t>')
    const bars = positions(continued, 'name="Equation rule"')
    expect(numerators).toHaveLength(2)
    expect(numerators[1].x - bars[1].x).toBeGreaterThan(numerators[0].x - bars[0].x)
    expect(prose.match(/<a14:m>/g)).toHaveLength(2)
    expect(prose.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    expect(prose).toContain('<m:begChr m:val="{"/>')
    expect(prose).toContain('<m:endChr m:val="}"/>')
    expect(prose).toMatch(/<m:eqArr>.*?<m:nary>.*?when\s*<\/m:t>.*?>n<\/m:t>.*?&gt;<\/m:t>/)
    expect(prose).toContain('>otherwise</m:t>')
    const nestedChoices = [...nested.matchAll(/<mc:Choice\b[^>]*>(.*?)<\/mc:Choice>/g)].map(([, choice]) => choice)
    expect(nestedChoices).toHaveLength(2)
    for (const choice of nestedChoices) {
      expect(choice.match(/<a14:m>/g)).toHaveLength(5)
      expect(choice.match(/name="Equation rule"/g)).toHaveLength(3)
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('keeps custom fraction rules, colored terms, and surrounding AMS equations editable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-fraction-rules-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  minRuleThickness: 0.18
---

# Custom fraction rules

$$
\textcolor{red}{s}+p+{a \above{2em} b}
$$

$$
\textcolor{#0055cc}{\genfrac{[}{]}{.5em}{0}{c}{d}} + e
$$

$$
\frac{q}{r}
$$

---

# AMS groups

\begin{align}
u&=\frac{x}{y}\tag{F}\\
v&=\binom{n}{k}\tag{Z}
\end{align}

$$
p+q
$$

$$
\sqrt{X}+\frac{a}{b}
$$

$$
t^{\genfrac{}{}{.5em}{2}{u}{v}}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const equations = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(equations).toHaveLength(3)
    const [thick, colored, minimum] = equations.map(node => node.equation?.rules?.[0])
    expect(thick!.rect.h).toBeGreaterThan(colored!.rect.h * 2)
    expect(colored!.rect.h).toBeGreaterThan(minimum!.rect.h * 2)
    expect(minimum!.rect.h).toBeGreaterThan(3)
    expect(colored!.fill).toEqual({ r: 0, g: 85, b: 204, a: 1 })
    const parts = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Custom fraction rules' }))
    const fractions = parts.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const ams = parts.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(fractions.match(/name="Equation rule"/g)).toHaveLength(3)
    expect(fractions.match(/name="Equation delimiter"/g)).toHaveLength(2)
    expect(fractions.match(/<a14:m>/g)).toHaveLength(8)
    const runColors = new Map([...fractions.matchAll(/<m:r>(.*?)<m:t[^>]*>([^<]*)<\/m:t><\/m:r>/g)]
      .map(([, properties, content]) => [content, /<a:srgbClr val="([0-9A-F]+)"/.exec(properties)?.[1]]))
    expect(runColors.get('c')).toBe('0055CC')
    expect(runColors.get('s')).toBe('FF0000')
    expect(runColors.get('p')).toBe(runColors.get('e'))
    expect(runColors.get('p')).not.toBe(runColors.get('s'))
    expect(ams.match(/name="Equation rule"/g)).toHaveLength(1)
    expect(ams.match(/<mc:Fallback><p:sp>/g)).toHaveLength(2)
    expect(ams.match(/<p:pic>/g)).toHaveLength(2)
    expect(ams).toContain('>(F)</m:t>')
    expect(ams).toContain('>(Z)</m:t>')
    expect(ams).toContain('<m:type m:val="noBar"/>')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)

it.skipIf(!chrome)('exports TeX line and bracket accents as editable rules with their terms and labels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-pptx-ruled-accents-'))
  const canvas = { width: 960, height: 540 }
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, String.raw`---
math:
  minRuleThickness: 0.18
---

# Measured accents

$$
\textcolor{#0055cc}{\overline{a+b}} + \underline{c+d} + \underbar{note}
$$

$$
\overbracket{x+y}^{n} + \underbracket{z+w}_{m}
$$

$$
\overlinesegment{p} + \underlinesegment{q}
$$

---

# Accents in alignments

\begin{align}
A&=\frac{\overbracket{r+s}^{h}}{t}\tag{A}\\
B&=\underline{u+v}\tag{B}
\end{align}

$$
z_{\underline{x}}
$$`)
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawn([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'ignore', timeout: 20_000 })
    const [status, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()])
    if (status) throw new Error(stderr)
    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, canvas, editable: true, withClicks: false }, frame => { frames.push(frame) })
    expect(frames).toHaveLength(2)
    const equations = frames[0].editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster' && node.reason === 'math') ?? []
    expect(equations).toHaveLength(3)
    const [line, bracket, segment] = equations.map(node => node.equation!)
    expect(line.rules).toHaveLength(3)
    const [over, under] = line.rules!
    expect(over.fill).toEqual({ r: 0, g: 85, b: 204, a: 1 })
    expect(over.rect.h).toBeGreaterThan(3)
    expect(over.rect.y + over.rect.h).toBeLessThanOrEqual(line.rect.y + 0.1)
    const underTerm = line.cells!.find(item => item.expression.includes('>c</m:t>'))!
    expect(under.rect.y).toBeGreaterThanOrEqual(underTerm.rect.y + underTerm.rect.h - 0.1)
    expect(bracket.rules).toHaveLength(6)
    expect(bracket.rules![0].rect.h).toBeGreaterThan(3)
    expect(bracket.rules![1].rect.y).toBeGreaterThan(bracket.rules![0].rect.y)
    expect(bracket.rules![4].rect.y).toBeLessThan(bracket.rules![3].rect.y)
    expect(segment.rules!.length).toBeGreaterThanOrEqual(6)
    const document = await storedParts(createPowerPoint(frames, { ...canvas, title: 'Ruled accents' }))
    const accents = document.get('ppt/slides/slide1.xml')?.toString() ?? ''
    const ams = document.get('ppt/slides/slide2.xml')?.toString() ?? ''
    expect(accents.match(/<mc:Fallback><p:sp>/g)).toHaveLength(3)
    expect(accents).not.toContain('<p:pic>')
    for (const text of ['a', 'note', 'n', 'm', 'p', 'q']) expect(accents).toContain(`>${text}</m:t>`)
    expect(ams.match(/name="Equation rule"/g)).toHaveLength(5)
    expect(ams.match(/<p:pic>/g)).toHaveLength(1)
    expect(ams).not.toContain('<m:bar>')
    for (const text of ['r', 'h', 't', 'u', '(A)', '(B)']) expect(ams).toContain(`>${text}</m:t>`)
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
    const viewport = () => view.evaluate('[innerWidth, innerHeight, scrollX, scrollY]')
    const initialViewport = await viewport()
    let missing = false
    const browser: Parameters<typeof captureEditable>[0] = {
      async evaluate<T>(script: string): Promise<T> {
        const value = await view.evaluate<T>(script)
        if (missing && script.includes('function collectSnapshot')) await view.evaluate("document.querySelector('#art').remove()")
        return value
      },
      async cdp(method, parameters) {
        calls.push(method)
        if (method === 'Page.captureScreenshot') {
          expect(parameters).toMatchObject({
            clip: { x: 100, y: 100, width: 160, height: 100, scale: 1 },
            captureBeyondViewport: false,
          })
          expect(await viewport()).toEqual(initialViewport)
          throw new Error('Artwork clip failed')
        }
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

    missing = false
    calls.length = 0
    const textOnly = await captureEditable(browser, canvas, 1, 0, '')
    expect(textOnly.warnings).toEqual([])
    expect(textOnly.content?.nodes.some(node => node.kind === 'text')).toBe(true)
    expect(calls).toEqual([])
    expect(await viewport()).toEqual(initialViewport)
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
    '<svg style="display:block;position:absolute;left:-20px;top:500px;width:100px;height:60px" viewBox="0 0 100 60">',
    '<rect width="100" height="60" fill="red"/>',
    '</svg>',
    '',
    '<svg style="position:absolute;left:-200px;top:150px" width="100" height="60"><rect width="100" height="60" fill="blue"/></svg>',
    '',
    '<p v-click>Late reveal</p>',
  ].join('\n')
  let view: Bun.WebView | undefined
  try {
    const entry = join(root, 'slides.md')
    const slides = Array.from({ length: 42 }, (_, index) => `# Slide ${index + 1}`)
    slides[0] = editableSlide.replace('Late slide', 'First slide').replace('fill="red"', 'fill="green"')
    slides[41] = editableSlide
    await Bun.write(entry, slides.join('\n\n---\n\n'))
    const cli = fileURLToPath(new URL('../../cli.ts', import.meta.url))
    const build = Bun.spawnSync([process.execPath, cli, 'build', entry], { stderr: 'pipe', stdout: 'pipe' })
    if (build.exitCode !== 0) throw new Error(build.stderr.toString())

    const frames: PowerPointFrame[] = []
    await captureFrames({ root: join(root, 'dist'), executable: chrome!, scale: 1, withClicks: true, canvas: { width: 960, height: 540 }, range: '42', editable: true },
      frame => { frames.push(frame) })
    expect(frames.map(frame => frame.position)).toEqual([{ slide: 42, click: 0 }, { slide: 42, click: 1 }])
    const pictures = frames.map(frame => frame.editable?.nodes.filter((node): node is IrRaster => node.kind === 'raster'))
    view = new Bun.WebView({ width: 160, height: 120, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate('about:blank')
    for (const rasters of pictures) {
      expect(rasters).toHaveLength(1)
      const raster = rasters![0]
      expect(raster.rect).toMatchObject({ x: 0, y: 500, w: 80, h: 40 })
      const png = Buffer.from(raster.data!, 'base64')
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 40])
      expect(await view.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify('data:image/png;base64,' + raster.data)})
        const bitmap = await createImageBitmap(await response.blob())
        const context = new OffscreenCanvas(80, 40).getContext('2d')
        context.drawImage(bitmap, 0, 0)
        return [...context.getImageData(40, 20, 1, 1).data]
      })()`)).toEqual([255, 0, 0, 255])
    }
  }
  finally {
    view?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
