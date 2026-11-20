import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckPath } from '../../../client/runtime/routing.ts'
import { asset } from '../runtime/assets.ts'
import { findChrome } from '../runtime/chrome.ts'
import { resolveBuildDownload, resolveDownloadCapture, resolveExportSettings, resolveNotesExportSettings } from '../runtime/export-options.ts'
import { parseDeck } from '../../../parser/src/deck.ts'

const cli = fileURLToPath(new URL('../cli.ts', import.meta.url))
const chrome = await findChrome()
const exportTestTimeout = 150_000

describe('export defaults', () => {
  it('takes format, range, scale, reveal behavior, and filename from headmatter', () => {
    const settings = resolveExportSettings('/deck/slides.md', {
      exportFilename: 'reports/talk',
      config: { export: { range: '2-4', scale: 3 } },
      export: { format: 'pptx-editable', withClicks: false },
    })
    expect(settings).toMatchObject({ format: 'pptx-editable', output: resolve('reports/talk.pptx'), range: '2-4', scale: 3, withClicks: false })
  })

  it('uses explicit flags ahead of deck defaults in either direction', () => {
    const settings = resolveExportSettings('/deck/slides.md', {
      export: { format: 'png', range: '2', withClicks: true },
    }, { format: 'pptx', range: '1', out: 'override.pptx', 'without-clicks': true })
    expect(settings).toMatchObject({ format: 'pptx', range: '1', output: resolve('override.pptx'), withClicks: false })
    expect(resolveExportSettings('/deck/slides.md', { export: { withClicks: false } }, { 'with-clicks': true }).withClicks).toBe(true)
  })

  it('resolves Markdown and notes filenames without changing ordinary export defaults', () => {
    expect(resolveExportSettings('/deck/slides.md', {}, { format: 'md' })).toMatchObject({
      format: 'md', output: resolve('slides-export.md'), withClicks: false, scale: 1,
    })
    expect(resolveNotesExportSettings('/deck/slides.md', { config: { exportFilename: 'reports/talk' } })).toMatchObject({
      output: resolve('reports/talk-notes.pdf'), timeout: 30_000, wait: 0,
    })
    expect(resolveNotesExportSettings('/deck/slides.md', {}, { out: 'paper', timeout: '0', wait: '250' })).toMatchObject({
      output: resolve('paper.pdf'), timeout: 0, wait: 250,
    })
  })

  it('resolves frame wait, timeout, and color settings across capture formats', () => {
    const headmatter = { config: { export: { timeout: 8000, wait: 300 } }, export: { wait: 500, waitUntil: 'networkidle', dark: true } }
    expect(resolveExportSettings('/deck/slides.md', headmatter)).toMatchObject({ timeout: 8000, wait: 500, colorScheme: 'dark' })
    expect(resolveExportSettings('/deck/slides.md', headmatter, { format: 'png', wait: '0', timeout: '0', 'wait-until': 'none', light: true })).toMatchObject({
      timeout: 0, wait: 0, waitUntil: 'none', colorScheme: 'light',
    })
    expect(resolveDownloadCapture(headmatter)).toMatchObject({ timeout: 8000, wait: 500, waitUntil: 'networkidle', colorScheme: 'dark' })
    expect(resolveNotesExportSettings('/deck/slides.md', headmatter)).toMatchObject({ timeout: 8000, wait: 500, waitUntil: 'networkidle' })
    expect(() => resolveExportSettings('/deck/slides.md', {}, { dark: true, light: true })).toThrow('Choose either --dark or --light')
    expect(() => resolveExportSettings('/deck/slides.md', {}, { timeout: '-1' })).toThrow('Invalid export timeout')
    expect(() => resolveDownloadCapture({}, { wait: '0.25' })).toThrow('Invalid export wait')
    expect(() => resolveDownloadCapture({}, { 'wait-until': 'idle' })).toThrow('Export wait-until must be')
  })

  it('resolves the generated PDF filename, custom links, and PDF-specific capture options', () => {
    expect(resolveBuildDownload({ download: true })).toEqual({ filename: 'slidev-exported.pdf', href: './slidev-exported.pdf' })
    expect(resolveBuildDownload({ config: { download: 'auto', exportFilename: 'reports/Talk (Draft).pdf' } })).toEqual({
      filename: 'reports/Talk (Draft).pdf', href: './reports/Talk%20(Draft).pdf',
    })
    expect(resolveBuildDownload({ download: false, config: { download: true } })).toBeUndefined()
    expect(resolveBuildDownload({ download: 'https://example.com/talk.pdf' })).toEqual({ href: 'https://example.com/talk.pdf' })
    expect(resolveBuildDownload({ download: 'handouts/talk.pdf', exportFilename: 'prepared' }, true)?.filename).toBe('prepared.pdf')
    expect(() => resolveBuildDownload({ download: true, exportFilename: '../outside' })).toThrow('relative to the build directory')
    expect(() => resolveBuildDownload({ download: 'javascript:void(0)' })).toThrow('HTTP, or HTTPS')
    expect(resolveDownloadCapture({ export: { format: 'pptx', scale: 3, range: 2, withClicks: true } })).toMatchObject({
      scale: 1, range: '2', withClicks: true,
    })
  })

  it('enables outlines for PDFs through deck settings or the command flag', () => {
    const source = '/deck/slides.md'
    const headmatter = { export: { withToc: true } }
    expect(resolveExportSettings(source).withToc).toBe(false)
    expect(resolveExportSettings(source, headmatter).withToc).toBe(true)
    expect(resolveExportSettings(source, {}, { 'with-toc': true }).withToc).toBe(true)
    expect(resolveExportSettings(source, headmatter, { format: 'png' }).withToc).toBe(false)
    expect(resolveDownloadCapture(headmatter).withToc).toBe(true)
  })

  it('resolves transparent backgrounds for image exports', () => {
    const source = '/deck/slides.md'
    const headmatter = { export: { omitBackground: true } }
    expect(resolveExportSettings(source, headmatter).omitBackground).toBe(false)
    expect(resolveExportSettings(source, {}, { format: 'png' }).omitBackground).toBe(false)
    expect(resolveExportSettings(source, {}, { format: 'png', 'omit-background': true }).omitBackground).toBe(true)
    for (const format of ['png', 'md', 'pptx', 'pptx-editable'])
      expect(resolveExportSettings(source, headmatter, { format }).omitBackground).toBe(true)
  })
})

const deck = [
  '---', 'title: Export compatibility', 'exportFilename: nested/final/report', '---',
  '', '# First chapter omitted', '', '---', 'routeAlias: selected', '---', '', '# Second chapter selected', '',
  '[Jump to the last reveal](#selected/2)', '',
  '<img src="./missing-screenshot.png" alt="Unavailable screenshot" width="144" height="60" loading="lazy">', '',
  '<p v-click>First distinct reveal</p>', '<p v-click>Second distinct reveal</p>',
  '', '---', '', '# Third chapter omitted',
].join('\n')

async function runCommand(root: string, ...args: string[]): Promise<string> {
  const command = Bun.spawn([process.execPath, cli, ...args], {
    cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: exportTestTimeout - 10_000,
  })
  const [status, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()])
  if (status !== 0) throw new Error(stderr.trim() || `Export command exited with status ${status}`)
  return stdout.trim()
}

async function deckCommand(root: string, name: string, ...args: string[]): Promise<void> {
  await runCommand(root, name, 'slides.md', ...args)
}

function exportDeck(root: string, ...args: string[]): Promise<void> {
  return deckCommand(root, 'export', '--executable-path', chrome!, ...args)
}

it.skipIf(!chrome)('captures transparent corners while keeping authored backgrounds and partial opacity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-alpha-export-'))
  let view: Bun.WebView | undefined
  try {
    const slides = [
      '---', 'canvasWidth: 320', '---', '', '# Plain',
      '', '<div style="position:absolute;left:10px;top:10px;width:20px;height:20px;background:rgb(0 128 255 / 50%)"></div>',
      '', '---', 'class: painted', '---', '', '# Palette',
      '', '---', 'layout: end', '---', '', '# Finish',
    ].join('\n')
    await Bun.write(join(root, 'slides.md'), slides)
    await Bun.write(join(root, 'style.css'), '.slide.painted { background: rgb(210 42 13); }')
    await exportDeck(root, '--format', 'png', '--range', '1', '--dark', '--out', 'opaque')
    await exportDeck(root, '--format', 'png', '--omit-background', '--light', '--scale', '2', '--out', 'alpha')

    await Bun.write(join(root, 'slides.md'), slides.replace('canvasWidth: 320', 'canvasWidth: 320\nexport:\n  omitBackground: true'))
    await exportDeck(root, '--format', 'md', '--range', '1', '--out', 'handout.md')
    const paths = ['opaque/slide-1.png', 'alpha/slide-1.png', 'alpha/slide-2.png', 'alpha/slide-3.png', 'handout-images/slide-1.png']
    const images = await Promise.all(paths.map(async path => Buffer.from(await Bun.file(join(root, path)).bytes()).toString('base64')))
    view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate('about:blank')
    const samples = await view.evaluate<{ width: number, height: number, corner: number[], swatchAlpha: number }[]>(`Promise.all(
      ${JSON.stringify(images)}.map(async (base64) => {
        const image = new Image()
        image.src = 'data:image/png;base64,' + base64
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        const swatch = Math.round(20 * image.width / 320)
        return {
          width: image.width, height: image.height,
          corner: [...context.getImageData(0, 0, 1, 1).data],
          swatchAlpha: context.getImageData(swatch, swatch, 1, 1).data[3],
        }
      })
    )`)
    expect(samples.map(({ width, height }) => [width, height])).toEqual([[320, 180], [640, 360], [640, 360], [640, 360], [320, 180]])
    expect(samples.map(sample => sample.corner)).toEqual([[27, 32, 40, 255], [0, 0, 0, 0], [210, 42, 13, 255], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect([127, 128]).toContain(samples[1].swatchAlpha)
    expect([127, 128]).toContain(samples[4].swatchAlpha)
  }
  finally {
    view?.close()
    await rm(root, { recursive: true, force: true })
  }
}, exportTestTimeout)

it.skipIf(!chrome)('exports multiple decks in input order with independent formats and reveal settings', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-batch-export-')))
  try {
    await Bun.write(join(root, 'slides.md'), '# Review\n\n[Review source](https://example.com/review)')
    await Bun.write(join(root, 'training', 'slides.md'), [
      '---', 'export:', '  format: md', '  range: 2', '  withClicks: true', '---',
      '', '# Omitted', '', '---', '', '# Exercise', '', '<p v-click>Solution</p>',
      '', '<!-- Training notes for this handout. -->',
    ].join('\n'))
    const pdf = join(root, 'slides.pdf')
    const markdown = join(root, 'training', 'slides-export.md')
    const stdout = await runCommand(root, 'export', 'slides.md', 'training', '--executable-path', chrome!)
    expect(stdout.split('\n')).toEqual([pdf, markdown])
    expect(await Bun.file(pdf).text()).toContain('/URI (https://example.com/review)')
    const handout = await Bun.file(markdown).text()
    expect(handout).toContain('![Exercise](./slides-export-images/slide-2-0.png)')
    expect(handout).toContain('![Exercise](./slides-export-images/slide-2-1.png)')
    expect(handout).toContain('Training notes for this handout.')
    expect(await Bun.file(join(root, 'training/slides-export-images/slide-2-1.png')).exists()).toBe(true)
    expect(handout).not.toContain('Omitted')
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

it.skipIf(!chrome)('exports notes for multiple decks under a shared output directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-batch-notes-'))
  try {
    await Bun.write(join(root, 'review.md'), '# Review\n\n<!-- [Review notes](https://example.com/review-notes) -->')
    await Bun.write(join(root, 'training.md'), '---\nexportFilename: handouts/training\n---\n\n# Training\n\n<!-- [Training notes](https://example.com/training-notes) -->')
    await runCommand(root, 'export-notes', 'review.md', 'training.md', '--output', 'notes', '--executable-path', chrome!)
    expect(await Bun.file(join(root, 'notes/review-export-notes.pdf')).text()).toContain('/URI (https://example.com/review-notes)')
    expect(await Bun.file(join(root, 'notes/handouts/training-notes.pdf')).text()).toContain('/URI (https://example.com/training-notes)')
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

it('detects overlapping batch exports and protects all entry files before capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-batch-conflict-'))
  try {
    await Bun.write(join(root, 'slides.md'), '# Review')
    await Bun.write(join(root, 'training', 'slides.md'), '# Training')
    await expect(runCommand(root, 'export', 'slides.md', 'training', '--out', 'reports')).rejects.toThrow('conflicts with another output')
    expect(await Bun.file(join(root, 'reports/slides.pdf')).exists()).toBe(false)

    const original = '---\nexportFilename: slides\n---\n\n# Agenda'
    await Bun.write(join(root, 'agenda.md'), original)
    await expect(runCommand(root, 'export', 'slides.md', 'agenda.md', '--format', 'md')).rejects.toThrow('would overwrite the deck source')
    expect(await Bun.file(join(root, 'slides.md')).text()).toBe('# Review')
    expect(await Bun.file(join(root, 'agenda.md')).text()).toBe(original)
    expect(await Bun.file(join(root, 'slides-export.md')).exists()).toBe(false)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('exposes an existing PDF in the static player without generating a second file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-linked-pdf-'))
  try {
    await Bun.write(join(root, 'slides.md'), '---\ndownload: /handouts/existing.pdf\n---\n\n# Example')
    await Bun.write(join(root, 'public', 'handouts', 'existing.pdf'), '%PDF-existing')
    await deckCommand(root, 'build', '--base', '/demo/', '--executable-path', join(root, 'missing-chrome'))
    expect(await Bun.file(join(root, 'dist', 'index.html')).text()).toContain('id="download-pdf" href="/demo/handouts/existing.pdf" download')
    expect(await Bun.file(join(root, 'dist', 'handouts', 'existing.pdf')).text()).toBe('%PDF-existing')
    expect(await Bun.file(join(root, 'dist', 'slidev-exported.pdf')).exists()).toBe(false)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

it.skipIf(!chrome)('bundles a downloadable vector PDF and keeps note-only reveals in a subpath build without notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-built-pdf-'))
  const base = '/talks/d%C3%A9mo/'
  const site = join(root, 'output', 'site')
  let server: ReturnType<typeof Bun.serve> | undefined
  let view: Bun.WebView | undefined
  try {
    const filename = 'handouts/Release notes.pdf'
    await Bun.write(join(root, 'slides.md'), deck
      .replace('nested/final/report', filename)
      .replace('title: Export compatibility', 'title: Export compatibility\nexport:\n  withToc: true')
      .replace('Second distinct reveal</p>', [
        'Second distinct reveal</p>', '', '<!-- presenter-only-example', '',
        '[click]', '', 'First note', '', '[click]', '', 'Second note', '', '[click]', '', 'Last note -->',
      ].join('\n'))
      .replace('src="./missing-screenshot.png"', 'src="/cover.png"'))
    await Bun.write(join(root, 'public', 'cover.png'), Bun.file(new URL('../../test/fixtures/pptx/picture.png', import.meta.url)))
    await deckCommand(root, 'build', '--download', '--without-notes', '--out', site, '--base', base, '--router-mode', 'history',
      '--range', '2', '--with-clicks', '--executable-path', chrome!)
    const html = await Bun.file(join(site, 'index.html')).text()
    expect(html).toContain('data-without-notes')
    expect(html).not.toMatch(/presenter-only-example|First note|Second note|Last note/)
    expect(html).not.toContain('data-deck-page-link="notes"')
    const pdf = await Bun.file(join(site, filename)).text()
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(4)
    expect(pdf).toContain('/Type /Font')
    expect(pdf).toContain('/Subtype /Image')
    expect(pdf.match(/\/Dest \/presentation-print-2-2\b/g)).toHaveLength(4)
    expect(pdf).toContain('/Type /Outlines')
    const files = await realpath(site)
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = deckPath(new URL(request.url).pathname, base)
        if (path === undefined) return new Response(null, { status: 404 })
        return asset(files, ['/selected', '/presenter/selected', '/entry', '/overview', '/notes'].includes(path) ? '/index.html' : decodeURIComponent(path), request)
      },
    })
    view = new Bun.WebView({ width: 960, height: 600, backend: { type: 'chrome', path: chrome!, url: false } })
    await view.navigate(new URL(base + 'selected', server.url).href)
    const href = await view.evaluate<string>("document.querySelector('#download-pdf[download]').href")
    expect(new URL(href).pathname).toBe(base + 'handouts/Release%20notes.pdf')
    expect((await fetch(href)).headers.get('Content-Type')).toBe('application/pdf')
    expect(await view.evaluate('window.presentationNavigation.clicksTotal')).toBe(3)
    await view.navigate(new URL(base + 'presenter/selected', server.url).href)
    expect(await view.evaluate(`[
      window.presentationNavigation.mode, window.presentationNavigation.clicksTotal,
      document.querySelector('#presenter-notes h2').textContent,
      document.querySelector('#presenter-notes-link'),
    ]`)).toEqual(['presenter', 3, 'Presenter timer', null])
    await view.navigate(new URL(base + 'overview', server.url).href)
    expect(await view.evaluate("document.querySelectorAll('.overview-notes').length")).toBe(0)
    await view.navigate(new URL(base + 'notes', server.url).href)
    expect(await view.evaluate("window.presentationNavigation.mode")).toBe('slide')
  }
  finally {
    view?.close()
    await server?.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, exportTestTimeout)

it.skipIf(!chrome)('bookmarks nested selected slides and keeps links on their actual reveal page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-outline-'))
  try {
    await Bun.write(join(root, 'slides.md'), [
      '# Agenda', '', '[Jump to the last reveal](#review/2)', '', '---', '',
      '## Parent omitted by range', '', '---',
      'title: Review **results** (決定)', 'level: 3', 'routeAlias: review', '---', '',
      '## Results at a glance', '', '<p v-click>First point</p>', '<p v-click>Second point</p>', '',
      '---', '', '### Follow-up', '', '---', 'hideInToc: true', '---', '',
      '## Private section', '', '---', '', '### Private detail', '', '---', '', '# Closing',
    ].join('\n'))
    await exportDeck(root, '--range', '1,3-7', '--with-clicks', '--with-toc')
    const pdf = await Bun.file(join(root, 'slides.pdf')).text()
    const pages = /\/Kids \[([^\]]+)\]/.exec(pdf)![1].match(/\d+ 0 R/g)!
    expect(pages).toHaveLength(8)
    expect(pdf).toContain('/Dest /presentation-print-3-2')
    expect(pdf).toContain(`/presentation-print-3-2 [${pages[3]} /XYZ`)

    const objects = [...pdf.matchAll(/^(\d+ 0) obj\n(<< [^\n]+ >>)\nendobj$/gm)]
    const outline = objects.find(([, , value]) => value.startsWith('<< /Type /Outlines'))!
    const bookmarks = objects.filter(([, , value]) => value.startsWith('<< /Title <'))
    expect(bookmarks).toHaveLength(4)
    const item = (title: string, page: number) => {
      const encoded = Buffer.from(`\uFEFF${title}`, 'utf16le').swap16().toString('hex')
      const [, id, value] = bookmarks.find(([, , body]) => body.includes(`/Title <${encoded}>`))!
      expect(value).toContain(`/Dest [${pages[page]} /Fit]`)
      return { ref: `${id} R`, value }
    }
    const agenda = item('Agenda', 0)
    const review = item('Review results (決定)', 3)
    const followUp = item('Follow-up', 4)
    const closing = item('Closing', 7)
    expect(outline[2]).toContain(`/First ${agenda.ref} /Last ${closing.ref} /Count 4`)
    expect(agenda.value).toContain(`/Next ${closing.ref} /First ${review.ref} /Last ${followUp.ref} /Count 2`)
    expect(review.value).toContain(`/Parent ${agenda.ref}`)
    expect(review.value).toContain(`/Next ${followUp.ref}`)
    expect(followUp.value).toContain(`/Parent ${agenda.ref}`)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

describe('export creates output directories', () => {
  it.skipIf(!chrome).each([
    ['pptx', 'slides.pptx', 'PK'],
    ['pptx-editable', 'slides.pptx', 'PK'],
    ['pdf', 'slides.pdf', '%PDF'],
  ])('creates a missing directory for %s', async (format, filename, magic) => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-export-'))
    try {
      await Bun.write(join(root, 'slides.md'), deck)
      await exportDeck(root, '--format', format, '--output', join('dist', filename), ...(format === 'pdf' ? [] : ['--without-clicks']))
      expect((await Bun.file(join(root, 'dist', filename)).text()).startsWith(magic)).toBe(true)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, exportTestTimeout)

  it.skipIf(!chrome)('writes one vector page per selected reveal to the configured nested filename', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-export-range-'))
    try {
      await Bun.write(join(root, 'slides.md'), deck)
      await exportDeck(root, '--range', '2', '--with-clicks')
      const pdf = await Bun.file(join(root, 'nested', 'final', 'report.pdf')).text()
      expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(3)
      const pages = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)]
      expect(pages).toHaveLength(3)
      expect(pages.every(([, width, height]) => Math.abs(Number(width) - 720) < 0.5 && Math.abs(Number(height) - 405) < 0.5)).toBe(true)
      expect(pdf).toContain('/Type /Font')
      expect(pdf.match(/\/Dest \/presentation-print-2-2\b/g)).toHaveLength(3)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, exportTestTimeout)

  it.skipIf(!chrome)('accepts an output with no directory part', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-export-'))
    try {
      await Bun.write(join(root, 'slides.md'), '# Example')
      await exportDeck(root, '--format', 'pptx', '--output', 'slides.pptx')
      expect(await Bun.file(join(root, 'slides.pptx')).exists()).toBe(true)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, exportTestTimeout)
})

it.skipIf(!chrome)('captures delayed slide content and the chosen color scheme in PDF and PowerPoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-export-readiness-'))
  try {
    await Bun.write(join(root, 'slides.md'), [
      '---', 'theme: deferred', 'colorSchema: light', 'export:', '  dark: true', '---',
      '', '# Ready when the result appears', '',
      '<LightOrDark>',
      '<template #dark><a href="https://example.com/slot-dark">Dark appearance</a></template>',
      '<template #light><a href="https://example.com/slot-light">Light appearance</a></template>',
      '</LightOrDark>', '',
      '<div data-demo data-waitfor=".ready"></div>',
      '<div hidden data-waitfor=".never"></div>',
      '<p v-click>One reveal</p>',
    ].join('\n'))
    await Bun.write(join(root, 'themes', 'deferred', 'index.ts'), "export default { name: 'deferred', client: './client.ts' }")
    await Bun.write(join(root, 'themes', 'deferred', 'client.ts'), `
      let timers = []
      window.addEventListener('presentation:slide', (event) => {
        timers.forEach(clearTimeout)
        const root = document.querySelector('#stage > article:not([hidden]) [data-demo]')
        if (!root) return
        root.replaceChildren()
        const step = event.detail.click
        const color = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        const append = (kind) => {
          const link = document.createElement('a')
          link.className = kind
          link.textContent = kind + ' ' + step
          link.href = 'https://example.com/' + color + '/' + kind + '-' + step
          root.append(link)
        }
        timers = [setTimeout(() => append('ready'), 160), setTimeout(() => append('settled'), 290)]
      })
    `)
    await exportDeck(root, '--with-clicks', '--dark', '--wait', '200', '--wait-until', 'networkidle', '--timeout', '15000', '--out', 'frames.pdf')
    const pdf = await Bun.file(join(root, 'frames.pdf')).text()
    expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(2)
    for (const step of [0, 1]) {
      expect(pdf).toContain(`/URI (https://example.com/dark/ready-${step})`)
      expect(pdf).toContain(`/URI (https://example.com/dark/settled-${step})`)
    }
    expect(pdf).toContain('/URI (https://example.com/slot-dark)')
    expect(pdf).not.toContain('https://example.com/slot-light')

    await exportDeck(root, '--format', 'pptx', '--without-clicks', '--light', '--wait-until', 'none', '--timeout', '15000', '--out', 'frame.pptx')
    const pptx = await Bun.file(join(root, 'frame.pptx')).text()
    const links = pptx.match(/https:\/\/example\.com\/[\w/-]+/g) ?? []
    expect(links).toContain('https://example.com/light/ready-1')
    expect(links).toContain('https://example.com/slot-light')
    expect(links).not.toContain('https://example.com/slot-dark')
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

it.skipIf(!chrome)('honors the export timeout when authored content never becomes visible', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-export-timeout-'))
  try {
    await Bun.write(join(root, 'slides.md'), '# Waiting\n\n<div data-waitfor=".ready"><span class="ready" hidden>Unavailable</span></div>')
    await expect(exportDeck(root, '--timeout', '1000', '--out', 'incomplete.pdf')).rejects.toThrow('Presentation export did not finish within 1000ms')
    expect(await Bun.file(join(root, 'incomplete.pdf')).exists()).toBe(false)
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, exportTestTimeout)

it.skipIf(!chrome)('can start image capture before unrelated resources finish loading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-export-navigation-'))
  const pending = Promise.withResolvers<void>()
  let requests = 0
  const resources = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch() {
      requests++
      await pending.promise
      return new Response(null, { status: 404 })
    },
  })
  try {
    await Bun.write(join(root, 'slides.md'), `# Ready\n\n<img hidden src="${new URL('pending.png', resources.url)}" alt="">`)
    await exportDeck(root, '--format', 'png', '--wait-until', 'domcontentloaded', '--timeout', '8000', '--out', 'early')
    expect(await Bun.file(join(root, 'early', 'slide-1.png')).exists()).toBe(true)
    expect(requests).toBe(1)
    // Give Chrome time to launch and request the image before measuring a stalled load.
    await expect(exportDeck(root, '--format', 'png', '--wait-until', 'load', '--timeout', '6000', '--out', 'late')).rejects.toThrow('did not finish within 6000ms')
    expect(requests).toBe(2)
    expect(await Bun.file(join(root, 'late', 'slide-1.png')).exists()).toBe(false)
  }
  finally {
    pending.resolve()
    await resources.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, exportTestTimeout)

it('formats the entry using the native slide boundaries and leaves included files alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-format-'))
  const path = join(root, 'slides.md')
  const fragment = join(root, 'part.md')
  const newline = '\r\n'
  const head = ['---', '# Keep this YAML comment', 'title: Format', '---']
  const body = ['# Keep this heading', '', '- First line  ', '  next line', '', '~~~text', '--- inside code', '~~~']
  const included = ['--- with YAML', 'src: ./part.md', '---']
  const tail = ['---', '', '```yaml', 'layout: center', '```', '', '# Last slide']
  const source = '\uFEFF' + ['', ...head, '', '', ...body, '', '', '<!-- Read this -->', '', '', ...included, '', '', ...tail, '', ''].join(newline)
  const expected = '\uFEFF' + [...head, '', ...body, '', '<!--', 'Read this', '-->', '', ...included, '', ...tail, ''].join(newline)
  try {
    await Bun.write(path, source)
    await Bun.write(fragment, '\n\n# Unchanged include\n\n')
    await deckCommand(root, 'format')
    expect(await readFile(path, 'utf8')).toBe(expected)
    expect(parseDeck(expected)).toEqual(parseDeck(source))
    expect(await readFile(fragment, 'utf8')).toBe('\n\n# Unchanged include\n\n')
    await deckCommand(root, 'format')
    expect(await readFile(path, 'utf8')).toBe(expected)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.skipIf(!chrome)('prints only selected speaker notes and includes their complete reveals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-notes-export-'))
  try {
    const source = [
      '---', 'title: Notes review', 'exportFilename: reports/talk', '---',
      '', '# First', '', '<!--', '[First note](https://example.com/excluded-note)', '-->',
      '', '---', '', '# Empty', '', '[Audience link](https://example.com/excluded-slide)',
      '', '---', '', '# Selected', '', '<p v-click>Reveal</p>', '',
      '<!--', '[Opening note](https://example.com/selected-note)', '', '[click]', '',
      '[Second note](https://example.com/later-note)', '-->',
    ].join('\n')
    await Bun.write(join(root, 'slides.md'), source)
    await deckCommand(root, 'export-notes', '--executable-path', chrome!, '--range', '2-3')
    const pdf = await Bun.file(join(root, 'reports', 'talk-notes.pdf')).text()
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(pdf).toMatch(/\/Title \(Notes - Notes review\)/)
    const mediaBox = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!
    expect(Math.abs(Number(mediaBox[1]) - 595)).toBeLessThan(1)
    expect(Math.abs(Number(mediaBox[2]) - 842)).toBeLessThan(1)
    expect(pdf).toContain('/URI (https://example.com/selected-note)')
    expect(pdf).toContain('/URI (https://example.com/later-note)')
    expect(pdf).not.toContain('excluded-note')
    expect(pdf).not.toContain('excluded-slide')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, exportTestTimeout)

it.skipIf(!chrome)('exports Markdown with selected reveal images and original speaker-note markup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-md-export-'))
  const source = [
    '# Skipped', '', '---', '', '# Selected [topic]', '',
    '<p v-click>Reveal</p>', '', '<!--', '**Opening note.**', '', '[click]', '', '- Next point', '-->',
  ].join('\n')
  try {
    await Bun.write(join(root, 'slides.md'), source)
    await exportDeck(root, '--format', 'md', '--range', '2', '--with-clicks', '--out', 'reports/Talk (Draft)')
    const md = await Bun.file(join(root, 'reports', 'Talk (Draft).md')).text()
    expect(md).toContain('![Selected \\[topic\\]](./Talk%20%28Draft%29-images/slide-2-0.png)')
    expect(md).toContain('./Talk%20%28Draft%29-images/slide-2-1.png')
    expect(md).toContain('**Opening note.**\n\n[click]\n\n- Next point')
    expect(md).not.toContain('Skipped')
    for (const name of ['slide-2-0.png', 'slide-2-1.png']) {
      const image = Bun.file(join(root, 'reports', 'Talk (Draft)-images', name))
      expect([...await image.slice(0, 8).bytes()]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    }
    expect(await Bun.file(join(root, 'slides.md')).text()).toBe(source)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, exportTestTimeout)
