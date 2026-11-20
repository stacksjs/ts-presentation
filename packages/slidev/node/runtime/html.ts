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

export function readBoundValue(value: string, frontmatter: Record<string, unknown>, parentProps?: Record<string, unknown>): unknown {
  try { return JSON.parse(value) }
  catch {
    if (/^'[^']*'$/.test(value)) return value.slice(1, -1)
    if (!/^(?:frontmatter|props)(?:\.(?:[a-z_$][\w$]*|\d+))+$/i.test(value)) return
    const [root, ...path] = value.split('.')
    let entry: unknown = root.toLowerCase() === 'frontmatter' ? frontmatter : parentProps
    for (const part of path) {
      if (!entry || typeof entry !== 'object' || !Object.hasOwn(entry, part)) return
      entry = (entry as Record<string, unknown>)[part]
    }
    return entry
  }
}
