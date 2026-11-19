import { flowchart } from './mermaid/flowchart.ts'
import { sequence } from './mermaid/sequence.ts'

/** Unsupported Mermaid syntax stays readable as a fenced code block. */
export function mermaid(source: string, marker: string): string | undefined {
  if (source.length > 30_000) return
  return /^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/.test(source) ? sequence(source, marker) : flowchart(source, marker)
}
