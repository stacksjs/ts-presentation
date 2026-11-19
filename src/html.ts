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
