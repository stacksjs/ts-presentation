import { escapeHtml } from './html.ts'
import { gitGraphPreset } from './mermaid/gitgraph-themes.ts'

export function optionsForSvg(svg: string, options: Readonly<Record<string, unknown>>): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const theme = typeof options.theme === 'string' && gitGraphPreset(options.theme) ? options.theme : ''
    const scale = typeof options.scale === 'number' && options.scale > 0 && options.scale <= 5 ? options.scale : undefined
    const viewBox = /\bviewBox="[^"]*?\s([\d.]+)"/i.exec(tag)
    const height = scale && viewBox ? Math.round(scale * Number(viewBox[1])) : undefined
    let opening = tag.slice(0, -1)
    if (theme) opening += ` data-diagram-theme="${theme}"`
    if (typeof options.title === 'string' && !tag.includes('aria-labelledby=')) {
      opening = opening.replace(/\saria-label="[^"]*"/, '')
      opening += ` aria-label="${escapeHtml(options.title)}"`
    }
    if (height) opening = opening.replace(/\s(?:width|height)="[^"]*"/g, '') + ` height="${height}"`
    return `${opening}>`
  })
}
