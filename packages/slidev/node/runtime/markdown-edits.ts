import type { MarkdownEdits, MarkdownReplacement } from '../../../types/src/transform.ts'

interface Edit { start: number, end: number, content: string, side?: 'left' | 'right' }
interface Stage { original: string, edits: Edit[], before: string, after: string }

function replacementText(template: string, match: string, captures: readonly string[], index: number, input: string, groups?: Record<string, string>): string {
  return template.replace(/\$(\$|&|`|'|<[^>]*>|\d{1,2})/g, (token, key: string) => {
    if (key === '$') return '$'
    if (key === '&') return match
    if (key === '`') return input.slice(0, index)
    if (key === "'") return input.slice(index + match.length)
    if (key.startsWith('<')) return groups ? groups[key.slice(1, -1)] ?? '' : token
    const capture = Number(key)
    if (capture > 0 && capture <= captures.length) return captures[capture - 1] ?? ''
    if (key.length === 2 && Number(key[0]) > 0 && Number(key[0]) <= captures.length)
      return (captures[Number(key[0]) - 1] ?? '') + key[1]
    return token
  })
}

/** Apply each hook's edits to stable offsets without another runtime dependency. */
export class SlideMarkdownEdits implements MarkdownEdits {
  #stages: Stage[]

  constructor(source: string) {
    this.#stages = [{ original: source, edits: [], before: '', after: '' }]
  }

  #stage(): Stage { return this.#stages.at(-1)! }
  get original(): string { return this.#stage().original }

  #offset(offset: number): number {
    const resolved = offset < 0 ? this.original.length + offset : offset
    if (!Number.isInteger(resolved) || resolved < 0 || resolved > this.original.length)
      throw new RangeError(`Markdown edit offset is outside the slide: ${offset}`)
    return resolved
  }

  update(start: number, end: number, content: string): this {
    start = this.#offset(start)
    end = this.#offset(end)
    if (end < start) throw new RangeError('Markdown edit ends before it starts')
    const edits = this.#stage().edits
    const same = edits.find(edit => edit.start === start && edit.end === end && !edit.side)
    if (same) same.content = content
    else {
      if (edits.some(edit => edit.start < end && start < edit.end))
        throw new RangeError('Markdown edits overlap. Commit the first edit before editing its result.')
      edits.push({ start, end, content })
    }
    return this
  }

  overwrite(start: number, end: number, content: string): this { return this.update(start, end, content) }
  remove(start: number, end: number): this { return this.update(start, end, '') }
  append(content: string): this { this.#stage().after += content; return this }
  prepend(content: string): this { this.#stage().before = content + this.#stage().before; return this }

  #insert(index: number, content: string, prepend: boolean, side: 'left' | 'right'): this {
    index = this.#offset(index)
    const edits = this.#stage().edits
    if (edits.some(edit => edit.start < index && edit.end > index))
      throw new RangeError('Cannot insert inside an overwritten Markdown range')
    const existing = edits.find(edit => edit.start === index && edit.end === index && edit.side === side)
    if (existing) existing.content = prepend ? content + existing.content : existing.content + content
    else edits.push({ start: index, end: index, content, side })
    return this
  }

  appendLeft(index: number, content: string): this { return this.#insert(index, content, false, 'left') }
  prependLeft(index: number, content: string): this { return this.#insert(index, content, true, 'left') }
  appendRight(index: number, content: string): this { return this.#insert(index, content, false, 'right') }
  prependRight(index: number, content: string): this { return this.#insert(index, content, true, 'right') }

  #replace(search: string | RegExp, replacement: MarkdownReplacement, all: boolean): this {
    const record = (match: string, ...args: unknown[]) => {
      const hasGroups = typeof args.at(-1) === 'object'
      const tail = hasGroups ? 3 : 2
      const index = args[args.length - tail] as number
      const content = typeof replacement === 'function' ? replacement(match, ...args)
        : replacementText(replacement, match, args.slice(0, -tail) as string[], index, this.original, hasGroups ? args.at(-1) as Record<string, string> : undefined)
      this.update(index, index + match.length, content)
      return match
    }
    if (all) this.original.replaceAll(search, record)
    else this.original.replace(search, record)
    return this
  }

  replace(search: string | RegExp, replacement: MarkdownReplacement): this { return this.#replace(search, replacement, false) }
  replaceAll(search: string | RegExp, replacement: MarkdownReplacement): this { return this.#replace(search, replacement, true) }

  slice(start: number = 0, end: number = this.original.length): string {
    start = this.#offset(start)
    end = this.#offset(end)
    if (end < start) return ''
    let cursor = start
    const { original, edits, before, after } = this.#stage()
    const parts = [start === 0 ? before : '']
    const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end || Number(a.side === 'right') - Number(b.side === 'right'))
    for (const edit of ordered) {
      if (edit.start < start && start < edit.end || edit.start < end && end < edit.end)
        throw new RangeError('A Markdown slice cannot split a replacement')
      if (edit.start < start || edit.end > end) continue
      if (edit.side === 'left' && edit.start === start && start !== 0) continue
      if (edit.side === 'right' && edit.end === end && end !== original.length) continue
      parts.push(original.slice(cursor, edit.start), edit.content)
      cursor = edit.end
    }
    return [...parts, original.slice(cursor, end), end === original.length ? after : ''].join('')
  }

  toString(): string { return this.slice() }
  length(): number { return this.toString().length }
  hasChanged(): boolean { return this.toString() !== this.original }
  isEmpty(): boolean { return !this.toString().trim() }

  commit(): this {
    this.#stages.push({ original: this.toString(), before: '', after: '', edits: [] })
    return this
  }

  rollback(): this {
    if (this.#stages.length <= 1) throw new Error('Cannot roll back the first Markdown stage')
    this.#stages.pop()
    return this
  }
}
