import type { MermaidOptions, MermaidRenderer } from './authoring-setup.ts'
import { escapeHtml } from './html.ts'
import { flowchart } from './mermaid/flowchart.ts'
import { gantt } from './mermaid/gantt.ts'
import { gitGraph } from './mermaid/gitgraph.ts'
import { pieDiagram } from './mermaid/pie.ts'
import { relationshipsDiagram } from './mermaid/relationships.ts'
import { sequence } from './mermaid/sequence.ts'

function mapping(value: unknown): MermaidOptions {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MermaidOptions : {}
}

function prepare(source: string, options?: MermaidOptions): { code: string, options: MermaidOptions } {
  let code = source.trim()
  let inline: MermaidOptions = {}
  const fields = /^---[ \t]*\r?\n([\s\S]+?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(code)
  const init = !fields && /^%%\{\s*(?:init|initialize)\s*:\s*(\{[\s\S]*?\})\s*\}%%/.exec(code)
  const header = fields || init
  if (header) {
    const options = mapping(Bun.YAML.parse(header[1]))
    inline = fields ? { ...mapping(options.config), ...(typeof options.title === 'string' ? { title: options.title } : {}) } : options
    code = code.slice(header[0].length).trimStart()
  }
  return { code, options: { ...options, ...inline } }
}

function render(code: string, marker: string, options: MermaidOptions): string | undefined {
  const header = code.split('\n').find(line => line.trim() && !line.trimStart().startsWith('%%'))?.trim()
  const title = typeof options.title === 'string' ? options.title : ''
  if (header === 'gantt') return gantt(code, options.gantt, title)
  if (/^gitGraph(?:\s|:|$)/.test(header ?? '')) return gitGraph(code, options.gitGraph, options.themeVariables, title)
  if (header === 'sequenceDiagram') return sequence(code, marker)
  if (header === 'classDiagram' || header === 'erDiagram') return relationshipsDiagram(code, marker)
  if (/^pie(?:\s|$)/.test(header ?? '')) return pieDiagram(code, options.pie, title)
  return flowchart(code, marker)
}

function optionsForSvg(svg: string, options: MermaidOptions): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const theme = typeof options.theme === 'string' && /^(default|dark|neutral|forest|base)$/.test(options.theme) ? options.theme : ''
    const scale = typeof options.scale === 'number' && options.scale > 0 && options.scale <= 5 ? options.scale : undefined
    const viewBox = /\bviewBox="[^"]*?\s([\d.]+)"/i.exec(tag)
    const height = scale && viewBox ? Math.round(scale * Number(viewBox[1])) : undefined
    let opening = tag.slice(0, -1)
    if (theme) opening += ` data-diagram-theme="${theme}"`
    if (typeof options.title === 'string') {
      opening = opening.replace(/\saria-label="[^"]*"/, '')
      opening += ` aria-label="${escapeHtml(options.title)}"`
    }
    if (height) opening = opening.replace(/\s(?:width|height)="[^"]*"/g, '') + ` height="${height}"`
    return `${opening}>`
  })
}

/** Unsupported Mermaid grammars remain visible as fenced source. */
export function mermaid(source: string, marker: string, options?: MermaidOptions): string | undefined {
  if (source.length > 30_000) return
  try {
    const diagram = prepare(source, options)
    const svg = render(diagram.code, marker, diagram.options)
    return svg && optionsForSvg(svg, diagram.options)
  }
  catch {
    return
  }
}

export async function renderMermaid(
  source: string,
  marker: string,
  config?: MermaidOptions,
  fence?: MermaidOptions,
  renderer?: MermaidRenderer,
): Promise<string | undefined> {
  if (!renderer && !fence) return mermaid(source, marker, config)
  if (source.length > 30_000) return
  try {
    const diagram = prepare(source, config)
    const options = { ...diagram.options, ...fence }
    const svg = renderer ? await renderer(diagram.code, options) : render(diagram.code, marker, options)
    return svg && optionsForSvg(svg, options)
  }
  catch {
    return
  }
}
