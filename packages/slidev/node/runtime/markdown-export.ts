import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CaptureOptions } from './capture.ts'
import { captureFrames } from './capture.ts'
import { markdownImageDirectory } from './export-options.ts'

export async function exportMarkdown(output: string, notes: readonly string[], options: CaptureOptions): Promise<void> {
  const assets = markdownImageDirectory(output)
  const images = basename(assets)
  await mkdir(assets, { recursive: true })
  const links = new Map<number, string[]>()
  const folder = encodeURIComponent(images).replaceAll('(', '%28').replaceAll(')', '%29')
  await captureFrames(options, async ({ title, position, image }) => {
    if (!position || !image) throw new Error('Missing Markdown export frame')
    const { slide, click } = position
    const name = `slide-${slide}${options.withClicks ? `-${click}` : ''}.png`
    await Bun.write(join(assets, name), image)
    const label = (title || String(slide)).replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&')
    const frames = links.get(slide) ?? []
    frames.push(`![${label}](./${folder}/${name})`)
    links.set(slide, frames)
  })

  const blocks = Array.from(links, ([slide, frames]) => [
    ...frames,
    notes[slide - 1]?.trim(),
  ].filter(Boolean).join('\n\n'))
  await Bun.write(output, blocks.join('\n\n---\n\n') + '\n')
}
