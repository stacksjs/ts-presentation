const topLevelKey = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^ \t#?:\[\]{},&*!|>'"%@`][^:]*):(?=[ \t]|$)/

function values(source: string): Record<string, unknown> {
  if (!source.trim()) return {}
  const parsed = Bun.YAML.parse(source)
  if (parsed == null) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid YAML frontmatter. Expected a mapping.')
  return parsed as Record<string, unknown>
}

function stringify(entries: Iterable<readonly [string, unknown]>): string {
  return Bun.YAML.stringify(Object.fromEntries(entries), null, 2)
}

function inlineComment(source: string): string {
  let quote = ''
  for (let index = topLevelKey.exec(source)?.[0].length ?? 0; index < source.length; index++) {
    const char = source[index]
    if (quote === '"' && char === '\\') { index++; continue }
    if (quote) {
      if (char === quote) quote = ''
    }
    else if (char === '"' || char === "'") quote = char
    else if (char === '#' && /\s/.test(source[index - 1])) return source.slice(index)
  }
  return ''
}

/** Patch top-level fields in block YAML and keep neighbouring text intact. */
export function patchFrontmatter(source: string, patch: Record<string, unknown>): string {
  const entries = new Map(Object.entries(values(source)))
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) entries.delete(key)
    else entries.set(key, value)
  }
  const normalized = source.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const positions = new Map<string, number>()
  for (const [index, line] of lines.entries()) {
    const key = topLevelKey.exec(line)?.[0]
    if (!key) continue
    try {
      const [name] = Object.keys(values(`${key} null`))
      if (name !== undefined) positions.set(name, index)
    }
    catch {}
  }
  const boundaries = [...positions.values()].sort((a, b) => a - b)
  const slots: { start: number, end: number, replacement: string[] }[] = []
  const added: [string, unknown][] = []
  for (const [key, value] of Object.entries(patch)) {
    const start = positions.get(key)
    if (start === undefined) {
      if (value !== null) added.push([key, value])
      continue
    }
    let end = boundaries.find(index => index > start) ?? lines.length
    while (end > start + 1 && /^(?:\s*$|#)/.test(lines[end - 1])) end--
    const replacement = value === null ? [] : stringify([[key, value]]).trimEnd().split('\n')
    const comment = inlineComment(lines[start])
    if (comment && replacement.length) replacement[0] += ` ${comment}`
    slots.push({ start, end, replacement })
  }
  for (const { start, end, replacement } of slots.sort((a, b) => b.start - a.start)) lines.splice(start, end - start, ...replacement)
  const body = lines.join('\n').trimEnd()
  const candidate = [body, added.length ? stringify(added).trimEnd() : ''].filter(Boolean).join('\n')
  try {
    if (Bun.deepEquals(values(candidate), Object.fromEntries(entries))) return candidate
  }
  catch {}
  return entries.size ? stringify(entries).trimEnd() : ''
}
