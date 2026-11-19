import type { MermaidOptions, MermaidRenderer } from './authoring-setup.ts'
import { optionsForSvg } from './diagram-svg.ts'
import { flowchart } from './mermaid/flowchart.ts'
import { gantt } from './mermaid/gantt.ts'
import { gitGraph } from './mermaid/gitgraph.ts'
import { journey } from './mermaid/journey.ts'
import { pieDiagram } from './mermaid/pie.ts'
import { relationshipsDiagram } from './mermaid/relationships.ts'
import { sequence } from './mermaid/sequence.ts'
import { timeline } from './mermaid/timeline.ts'

function mapping(value: unknown): MermaidOptions {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MermaidOptions : {}
}

function mergeDiagramOptions(base: MermaidOptions = {}, override: MermaidOptions = {}): MermaidOptions {
  const result = { ...base, ...override }
  for (const key of ['flowchart', 'gantt', 'gitGraph', 'journey', 'pie', 'timeline', 'themeVariables']) {
    if (base[key] && override[key] && typeof base[key] === 'object' && typeof override[key] === 'object')
      result[key] = { ...mapping(base[key]), ...mapping(override[key]) }
  }
  return result
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
  return { code, options: mergeDiagramOptions(options, inline) }
}

function render(code: string, marker: string, options: MermaidOptions): string | undefined {
  const header = code.split('\n').find(line => line.trim() && !/^\s*(?:%%|#)/.test(line))?.trim()
  const title = typeof options.title === 'string' ? options.title : ''
  if (/^timeline(?:\s|$)/i.test(header ?? '')) return timeline(code, marker, options)
  if (/^journey$/i.test(header ?? '')) return journey(code, marker, options)
  if (header === 'gantt') return gantt(code, marker, options.gantt, title, options.securityLevel === 'loose')
  if (/^gitGraph(?:\s|:|$)/.test(header ?? '')) return gitGraph(code, marker, options.gitGraph, options.themeVariables, title)
  if (header === 'sequenceDiagram') return sequence(code, marker)
  if (header === 'classDiagram' || header === 'erDiagram') return relationshipsDiagram(code, marker)
  if (/^pie(?:\s|$)/.test(header ?? '')) return pieDiagram(code, marker, options.pie, title)
  return flowchart(code, marker)
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
    const options = mergeDiagramOptions(diagram.options, fence)
    const svg = renderer ? await renderer(diagram.code, options) : render(diagram.code, marker, options)
    return svg && optionsForSvg(svg, options)
  }
  catch {
    return
  }
}
