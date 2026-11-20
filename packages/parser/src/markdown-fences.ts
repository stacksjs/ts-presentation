export interface FenceOpening {
  marker: string
  info: string
  infoStart: number
}

const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?$/
const quote = /^ {0,3}> ?/
const list = /^ {0,3}([-+*]|\d{1,9}[.)])(?= |$)( *)/
const thematicBreak = /^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/
const paragraphBreak = /^ {0,3}(?:#{1,6}(?: |$)|<[/!?a-z]|=+ *$|-+ *$)/i
const fencedLine = { kind: 'fenced' } as const
const closingLine = { kind: 'closing' } as const

export function readFenceOpening(line: string): FenceOpening | undefined {
  const match = fence.exec(line)
  if (!match) return
  const [, marker, info] = match
  if (marker[0] === '`' && info.includes('`')) return
  return { marker, info, infoStart: line.indexOf(marker) + marker.length }
}

export function isFenceClose(line: string, marker: string): boolean {
  const close = fence.exec(line)
  return !!close && close[1].startsWith(marker) && !close[2].trim()
}

interface TabExpansion {
  text: string
  offsets: number[]
}

function expandTabs(line: string): TabExpansion {
  let text = ''
  const offsets: number[] = []
  for (let offset = 0; offset < line.length; offset++) {
    const char = line[offset]
    const width = char === '\t' ? 4 - text.length % 4 : 1
    text += char === '\t' ? ' '.repeat(width) : char
    for (let column = 0; column < width; column++) offsets.push(offset)
  }
  offsets.push(line.length)
  return { text, offsets }
}

type Container = number | 'quote'

function matchContainers(text: string, containers: readonly Container[]): { offset: number, matched: number } {
  let offset = 0
  let matched = 0
  for (const container of containers) {
    const rest = text.slice(offset)
    if (container === 'quote') {
      const prefix = quote.exec(rest)
      if (!prefix) break
      offset += prefix[0].length
    }
    else if (rest.startsWith(' '.repeat(container))) offset += container
    else if (/^ *\r?$/.test(rest)) offset = text.length
    else break
    matched++
  }
  return { offset, matched }
}

function remainingText(line: string, offset: number, expanded?: TabExpansion): string {
  if (!expanded) return line.slice(offset)
  const original = expanded.offsets[offset]
  if (offset === 0 || expanded.offsets[offset - 1] !== original) return line.slice(original)
  // If a container consumed only part of a tab, keep the leftover columns.
  let end = offset
  while (end < expanded.text.length && expanded.offsets[end] === original) end++
  return ' '.repeat(end - offset) + line.slice(original + 1)
}

type FenceLine = typeof fencedLine | typeof closingLine | { kind: 'opening', opening: FenceOpening }

/** Identify fence ranges and source metadata. Bun still parses and renders the Markdown. */
export class MarkdownFenceReader {
  // A quote has no fixed indent. Lists consume their marker width and padding.
  private containers: Container[] = []
  private blockLine = { prefix: '', content: '' }
  private marker = ''
  private paragraph = false

  reset(): void {
    this.containers.length = 0
    this.marker = ''
    this.paragraph = false
    this.blockLine = { prefix: '', content: '' }
  }

  get block(): Readonly<{ prefix: string, content: string }> {
    return this.blockLine
  }

  get continuationPrefix(): string {
    return this.containers.map(container => container === 'quote' ? '> ' : ' '.repeat(container)).join('')
  }

  /** Read within the current containers without opening Markdown blocks inside a literal body. */
  readContinuation(line: string): string | undefined {
    if (!this.containers.length) return line
    const expanded = line.includes('\t') ? expandTabs(line) : undefined
    const { offset, matched } = matchContainers(expanded?.text ?? line, this.containers)
    if (matched === this.containers.length) return remainingText(line, offset, expanded)
  }

  endBlock(): void {
    this.paragraph = false
  }

  read(line: string): FenceLine | undefined {
    const expanded = (this.containers.length || !this.marker) && line.includes('\t') ? expandTabs(line) : undefined
    const text = expanded?.text ?? line
    let { offset, matched } = matchContainers(text, this.containers)
    if (this.marker && matched === this.containers.length) {
      if (!isFenceClose(text.slice(offset), this.marker)) return fencedLine
      this.marker = ''
      return closingLine
    }

    let paragraph = this.paragraph && matched === this.containers.length
    this.marker = ''
    this.containers.length = matched
    while (offset < text.length) {
      const rest = text.slice(offset)
      const prefix = quote.exec(rest)
      if (prefix) {
        this.containers.push('quote')
        offset += prefix[0].length
        paragraph = false
        continue
      }
      const item = list.exec(rest)
      if (!item || thematicBreak.test(rest)) break
      if (paragraph && (!rest.slice(item[0].length).trim() || /^\d/.test(item[1]) && !/^1[.)]$/.test(item[1]))) break
      const padding = item[2].length
      const indent = item[0].length - padding + (padding > 4 ? 1 : padding)
      this.containers.push(indent + Number(padding === 0))
      offset += indent
      paragraph = false
    }
    const rest = text.slice(offset)
    const opening = readFenceOpening(rest)
    this.paragraph = !opening && /^ {0,3}[^ \r]/.test(rest) && !paragraphBreak.test(rest) && !thematicBreak.test(rest)
    if (!opening) {
      this.blockLine = { prefix: text.slice(0, offset), content: remainingText(line, offset, expanded) }
      return
    }
    this.marker = opening.marker
    const infoStart = expanded?.offsets[offset + opening.infoStart] ?? offset + opening.infoStart
    return { kind: 'opening', opening: { marker: opening.marker, info: line.slice(infoStart), infoStart } }
  }
}
