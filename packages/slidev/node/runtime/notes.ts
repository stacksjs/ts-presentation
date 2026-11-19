const RE_WORD_CHARS_ONLY = /^[\w-]+$/
const RE_REGEXP_CHARS = /[.*+?^${}()|[\]\\]/g

export function applyNotesAutoRuby(md: string, notesAutoRuby: Record<string, unknown>): string {
  const keys = Object.keys(notesAutoRuby).filter(key => key && typeof notesAutoRuby[key] === 'string')
    // Longest first, otherwise a shorter key shadows every key starting with it
    .sort((a, b) => b.length - a.length)
    // Add word boundaries to the keys when they are simple alphabets or numbers
    .map(i => RE_WORD_CHARS_ONLY.test(i)
      ? `\\b${i}\\b`
      : i.replace(RE_REGEXP_CHARS, '\\$&'))

  if (!keys.length)
    return md

  return md.replace(
    new RegExp(`(${keys.join('|')})`, 'g'),
    (match) => {
      if (notesAutoRuby[match])
        return `<ruby>${Bun.escapeHTML(match)}<rt>${Bun.escapeHTML(String(notesAutoRuby[match]))}</rt></ruby>`
      return match
    },
  )
}
