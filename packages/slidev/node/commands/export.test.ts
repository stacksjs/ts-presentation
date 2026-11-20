import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome } from '../runtime/chrome.ts'
import { resolveExportSettings, resolveNotesExportSettings } from '../runtime/export-options.ts'
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
})

const deck = [
  '---', 'title: Export compatibility', 'exportFilename: nested/final/report', '---',
  '', '# First chapter omitted', '', '---', 'routeAlias: selected', '---', '', '# Second chapter selected', '',
  '[Jump to the last reveal](#selected/2)', '',
  '<img src="./missing-screenshot.png" alt="Unavailable screenshot" width="144" height="60" loading="lazy">', '',
  '<p v-click>First distinct reveal</p>', '<p v-click>Second distinct reveal</p>',
  '', '---', '', '# Third chapter omitted',
].join('\n')

async function deckCommand(root: string, name: string, ...args: string[]): Promise<void> {
  const command = Bun.spawn([process.execPath, cli, name, 'slides.md', ...args], {
    cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: exportTestTimeout - 10_000,
  })
  const [status, output] = await Promise.all([command.exited, new Response(command.stderr).text()])
  if (status !== 0) throw new Error(output.trim() || `Export command exited with status ${status}`)
}

function exportDeck(root: string, ...args: string[]): Promise<void> {
  return deckCommand(root, 'export', '--executable-path', chrome!, ...args)
}

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
