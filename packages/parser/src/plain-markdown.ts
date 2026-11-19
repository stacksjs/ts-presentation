const tags = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const entities = /&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi

/** Convert heading Markdown to text while retaining escaped tags and literal code. */
export function plainMarkdown(source: string): string {
  return Bun.markdown.html(source)
    .replace(tags, (_, name: string | undefined) => /^(?:br|p|div|h[1-6]|li)$/i.test(name ?? '') ? ' ' : '')
    .replace(entities, entity => Bun.markdown.render(entity, {}))
    .replace(/\s+/g, ' ')
    .trim()
}
