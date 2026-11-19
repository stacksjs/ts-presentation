export type FenceScalar = string | number | boolean

/** Read Slidev-style scalar props without evaluating a JavaScript expression. */
export function readFenceOptions(source: string): Record<string, FenceScalar> | undefined {
  const object = source.trim()
  if (!object.startsWith('{') || !object.endsWith('}')) return
  const body = object.slice(1, -1)
  const options: Record<string, FenceScalar> = Object.create(null)
  const entry = /\s*([A-Z][\w-]*)\s*:\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([-+]?(?:\d+(?:\.\d+)?|\.\d+))|(true|false))\s*(,|$)/giy
  let cursor = 0
  while (body.slice(cursor).trim()) {
    entry.lastIndex = cursor
    const match = entry.exec(body)
    if (!match || !match[0]) return
    const [, name, quoted, single, numeric, bool] = match
    options[name] = quoted ?? single ?? (numeric === undefined ? bool === 'true' : Number(numeric))
    cursor = entry.lastIndex
  }
  return options
}
