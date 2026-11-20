const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const characters = Object.fromEntries(Object.entries(entities).map(([character, entity]) => [entity, character]))

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => entities[character])
}

export function unescapeHtml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, entity => characters[entity] ?? "'")
}

export function readBoundValue(value: string, frontmatter: Record<string, unknown>): unknown {
  try { return JSON.parse(value) }
  catch {
    if (/^'[^']*'$/.test(value)) return value.slice(1, -1)
    if (!/^frontmatter(?:\.[a-z_$][\w$]*)+$/i.test(value)) return
    let entry: unknown = frontmatter
    for (const part of value.split('.').slice(1)) {
      if (!entry || typeof entry !== 'object' || !Object.hasOwn(entry, part)) return
      entry = (entry as Record<string, unknown>)[part]
    }
    return entry
  }
}
