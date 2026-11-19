import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome } from '../runtime/chrome.ts'
import { resolveExportSettings } from '../runtime/export-options.ts'

const cli = fileURLToPath(new URL('../cli.ts', import.meta.url))
const chrome = await findChrome()

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
})

const deck = [
  '---', 'title: Export compatibility', 'exportFilename: nested/final/report', '---',
  '', '# First chapter omitted', '', '---', 'routeAlias: selected', '---', '', '# Second chapter selected', '',
  '[Jump to the last reveal](#selected/2)', '',
  '<p v-click>First distinct reveal</p>', '<p v-click>Second distinct reveal</p>',
  '', '---', '', '# Third chapter omitted',
].join('\n')

async function exportDeck(root: string, ...args: string[]): Promise<void> {
  const command = Bun.spawn([process.execPath, cli, 'export', 'slides.md', '--executable-path', chrome!, ...args], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  })
  const [status, output] = await Promise.all([command.exited, new Response(command.stderr).text()])
  if (status !== 0) throw new Error(output)
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
  }, 20_000)

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
  }, 20_000)

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
  }, 20_000)
})
