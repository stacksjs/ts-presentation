import type { MermaidOptions } from './authoring-setup.ts'

export function diagramOptionsRecord(value: unknown): MermaidOptions | undefined {
  if (!value || typeof value !== 'object') return
  const prototype = Object.getPrototypeOf(value)
  if (prototype === Object.prototype || prototype === null) return value as MermaidOptions
}

export function parseDiagramOptions(literal: string): MermaidOptions | undefined {
  try { return diagramOptionsRecord(Bun.JSON5.parse(literal)) }
  catch { return }
}

export function mergeDiagramOptions(base: MermaidOptions = {}, override?: MermaidOptions): MermaidOptions {
  if (!override || base === override) return base
  const result: Record<string, unknown> = { ...base, ...override }
  for (const [name, value] of Object.entries(override)) {
    if (!Object.hasOwn(base, name)) continue
    const previous = diagramOptionsRecord(base[name])
    const next = diagramOptionsRecord(value)
    if (previous && next) result[name] = mergeDiagramOptions(previous, next)
  }
  return result
}
