import type { MermaidOptions, MermaidRenderer } from './authoring-setup.ts'
import { diagramOptionsRecord, mergeDiagramOptions, parseDiagramOptions } from './diagram-options.ts'
import { applyDiagramTheme, optionsForSvg } from './diagram-svg.ts'
import { flowchart } from './mermaid/flowchart.ts'
import { gantt, isGanttHeader } from './mermaid/gantt.ts'
import { gitGraph } from './mermaid/gitgraph.ts'
import { journey } from './mermaid/journey.ts'
import { pieDiagram } from './mermaid/pie.ts'
import { quadrantDiagram } from './mermaid/quadrant.ts'
import { relationshipsDiagram } from './mermaid/relationships.ts'
import { sankey } from './mermaid/sankey.ts'
import { sequence } from './mermaid/sequence.ts'
import { timeline } from './mermaid/timeline.ts'
import { xyDiagram } from './mermaid/xy.ts'

function inlineQuotedScalars(yaml: string): string {
  const property = /^( *)(?:[\w.-]+|"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\r\n]|'')*'):[ \t]*(?=(["'|>]))/gm
  const quoted = /(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^']|'')*')(?=[ \t]*(?:#|$))/my
  let cursor = 0
  let normalized = ''
  for (let match = property.exec(yaml); match; match = property.exec(yaml)) {
    const [, indent, indicator] = match
    if (indicator === '|' || indicator === '>') {
      // Leave content inside YAML block scalars alone.
      const content = new RegExp(`\\r?\\n(?:[ \\t]*(?=\\r?\\n)| {${indent.length + 1}}[^\\r\\n]*)`, 'y')
      const nextLine = yaml.indexOf('\n', property.lastIndex)
      if (nextLine < 0) break
      content.lastIndex = nextLine
      while (content.exec(yaml)) property.lastIndex = content.lastIndex
      continue
    }
    const start = property.lastIndex
    quoted.lastIndex = start
    const scalar = quoted.exec(yaml)?.[0]
    if (!scalar) continue
    property.lastIndex = quoted.lastIndex
    if (!scalar.includes('\n')) continue
    // Bun can fold a quoted multiline value at the root of a YAML document.
    const { value } = Bun.YAML.parse(`value: ${scalar}`) as { value: string }
    normalized += yaml.slice(cursor, start) + JSON.stringify(value)
    cursor = quoted.lastIndex
  }
  return normalized + yaml.slice(cursor)
}

function diagramFrontmatter(source: string): MermaidOptions {
  // A diagram can indent its whole YAML mapping inside a fenced example.
  const indent = Math.min(...Array.from(source.matchAll(/^ *(?=[^#\s])/gm), match => match[0].length))
  const yaml = indent > 0 && Number.isFinite(indent) ? source.replace(new RegExp(`^ {${indent}}`, 'gm'), '') : source
  try { return diagramOptionsRecord(Bun.YAML.parse(yaml)) ?? {} }
  catch (error) {
    const normalized = inlineQuotedScalars(yaml)
    if (normalized === yaml) throw error
    return diagramOptionsRecord(Bun.YAML.parse(normalized)) ?? {}
  }
}

// Match directives on their own lines, skipping comments and quoted text in diagram data.
const quotedDiagramText = /"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/.source
const diagramDirectives = new RegExp(
  String.raw`^[ \t]*%%\{\s*(?:init|initialize)\s*:\s*(\{(?:${quotedDiagramText}|[^"'])*?\})\s*\}%%`
  + String.raw`|%%[^\r\n]*|^[ \t]*#[^\r\n]*|(?<!\w)(?:${quotedDiagramText})`,
  'gm',
)
const diagramScopes: Readonly<Record<string, string>> = {
  graph: 'flowchart', 'flowchart-v2': 'flowchart', sequenceDiagram: 'sequence',
  classDiagram: 'class', erDiagram: 'er', stateDiagram: 'state', 'stateDiagram-v2': 'state',
  xychart: 'xyChart', 'xychart-beta': 'xyChart', 'sankey-beta': 'sankey',
}

function parseDirectiveYaml(literal: string): MermaidOptions | undefined {
  try { return diagramOptionsRecord(Bun.YAML.parse(literal)) }
  catch { return }
}

function prepare(source: string, options?: MermaidOptions): { code: string, options: MermaidOptions } {
  let code = source.trim()
  let inline: MermaidOptions = {}
  const fields = /^---[ \t]*\r?\n([\s\S]+?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(code)
  if (fields) {
    const defined = diagramFrontmatter(fields[1])
    const config = { ...diagramOptionsRecord(defined.config) }
    if (typeof defined.title === 'string') config.title = defined.title
    if (defined.displayMode === 'compact') config.gantt = { ...diagramOptionsRecord(config.gantt), displayMode: defined.displayMode }
    inline = config
    code = code.slice(fields[0].length).trimStart()
  }
  let directives: MermaidOptions | undefined
  if (code.includes('%%{')) {
    code = code.replace(diagramDirectives, (token, literal: string | undefined) => {
      if (literal === undefined) return token
      const config = parseDiagramOptions(literal) ?? parseDirectiveYaml(literal)
      directives = mergeDiagramOptions(directives, config)
      return ''
    }).trim()
  }
  const legacyOptions = diagramOptionsRecord(directives?.config)
  const type = legacyOptions && diagramHeader(code)?.split(/[\s:;]/, 1)[0]
  const scope = type && (Object.hasOwn(diagramScopes, type) ? diagramScopes[type] : /^gantt$/i.test(type) ? 'gantt' : type)
  const config = scope ? { ...directives, [scope]: legacyOptions } : directives
  return { code, options: mergeDiagramOptions(mergeDiagramOptions(options, inline), config) }
}

function diagramHeader(code: string): string | undefined {
  return code.split('\n').find(line => line.trim() && !/^\s*(?:%%|#)/.test(line))?.trim()
}

function render(code: string, marker: string, options: MermaidOptions): string | undefined {
  const header = diagramHeader(code)
  const title = typeof options.title === 'string' ? options.title : ''
  if (/^timeline(?:\s|$)/i.test(header ?? '')) return timeline(code, marker, options)
  if (/^journey$/i.test(header ?? '')) return journey(code, marker, options)
  if (isGanttHeader(header)) return gantt(code, marker, options)
  if (/^sankey(?:-beta)?$/.test(header ?? '')) return sankey(code, marker, options)
  if (/^xychart(?:-beta)?(?:\s|$)/.test(header ?? '')) return xyDiagram(code, marker, options)
  if (/^gitGraph(?:\s|:|;|$)/.test(header ?? '')) return gitGraph(code, marker, options)
  if (header === 'sequenceDiagram') return sequence(code, marker)
  if (header === 'classDiagram' || header === 'erDiagram') return relationshipsDiagram(code, marker)
  if (/^pie(?:\s|$)/.test(header ?? '')) return pieDiagram(code, marker, options.pie, title)
  if (/^quadrantChart(?:\s|;|$)/i.test(header ?? '')) return quadrantDiagram(code, marker, options)
  return flowchart(code, marker)
}

/** Unsupported Mermaid grammars remain visible as fenced source. */
export function mermaid(source: string, marker: string, options?: MermaidOptions): string | undefined {
  if (source.length > 30_000) return
  try {
    const diagram = prepare(source, options)
    const svg = render(diagram.code, marker, diagram.options)
    return svg && applyDiagramTheme(optionsForSvg(svg, diagram.options), marker, diagram.options)
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
    if (!svg) return
    const formatted = optionsForSvg(svg, options)
    return renderer ? formatted : applyDiagramTheme(formatted, marker, options)
  }
  catch {
    return
  }
}
