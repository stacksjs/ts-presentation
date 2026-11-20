import { tokenClass } from 'ts-syntax-highlighter/browser'
import { lineMatches } from '../../../client/runtime/equation-steps.ts'
import type { CodeHighlightContext, CodeHighlightElement, CodeHighlightToken, CodeHighlightTransformer } from './highlight-transformers.ts'

// Annotation syntax and transformer names follow Shiki. See licenses/Shiki-MIT.txt.
const notation = /\[!code\s+((?:\\.|[^\]\\])+)\]/gi
export const codeWordDecoration: RegExp = /^\/((?:\\.|[^/\\\r\n])+)\/(?=\s|$)/
const blockOpening = /^(?:\/\*|<!--)/
const singleOpening = /^(\/\/+|#|--|;{1,2}|%{1,2}|\*|'|")/
const jsxLanguage = /^(?:jsx|tsx)$/
const markdownLanguage = /^(?:md|markdown|mdx)$/
const commentToken = (token: CodeHighlightToken) => tokenClass(token.type ?? '') === 'comment'
  || token.scopes?.some(scope => scope.startsWith('comment.'))

interface Directive { name: string, start: number, end: number, count?: number, used: boolean }
interface Comment {
  line: number
  nodes: CodeHighlightElement['children']
  prefix: string
  body: string
  suffix: string
  directives: Directive[]
  standalone: boolean
  atEnd: boolean
}
interface Word { line: number, word: string, className: string }
interface Decorations { comments: Comment[], words: Word[], applied: boolean }

const decorations = new WeakMap<CodeHighlightContext['meta'], Decorations>()

function readComments(context: CodeHighlightContext): Comment[] {
  const comments: Comment[] = []
  if (!/\[!code\b/i.test(context.source)) return comments
  for (const [line, row] of context.tokens.entries()) {
    const children = context.lines[line]?.children
    if (!children || children.length !== row.length) continue
    for (let first = 0; first < row.length; first++) {
      const token = row[first]
      const value = token.content.trimStart()
      const block = blockOpening.exec(value)?.[0]
      if (!commentToken(token) && !(block === '<!--' && markdownLanguage.test(context.options.lang))) continue
      const marker = block ?? singleOpening.exec(value)?.[0]
      if (!marker) continue
      const close = block === '<!--' ? '-->' : block === '/*' ? '*/' : ''
      let content = token.content
      let last = first
      if (close) {
        // HTML grammars can split the comment opener, body, and closer into
        // separately colored tokens, including an unstyled body token.
        while (last + 1 < row.length && !content.includes(close)) {
          content += row[++last].content
        }
        if (!content.trimEnd().endsWith(close)) continue
      }
      else {
        while (last + 1 < row.length && commentToken(row[last + 1])) content += row[++last].content
      }
      const leading = content.length - content.trimStart().length
      const bodyStart = leading + marker.length
      const bodyEnd = close ? content.lastIndexOf(close) : content.length
      const body = content.slice(bodyStart, bodyEnd)
      const directives: Directive[] = []
      for (const match of body.matchAll(notation)) {
        const [, name, rawCount] = /^(.*?)(?:(?<!\\):(\d+))?$/.exec(match[1].trim()) ?? []
        if (name) directives.push({ name, start: match.index, end: match.index + match[0].length, count: rawCount === undefined ? undefined : Number(rawCount), used: false })
      }
      if (!directives.length) { first = last; continue }
      let before = first
      let after = last + 1
      if (block && jsxLanguage.test(context.options.lang) && row[before - 1]?.content === '{' && row[after]?.content === '}') {
        before--
        after++
      }
      const atEnd = row.slice(after).every(token => !token.content.trim())
      const standalone = atEnd && row.slice(0, before).every(token => !token.content.trim()) && !body.replace(notation, '').trim()
      comments.push({
        line, nodes: children.slice(before, after), body, directives, standalone, atEnd,
        prefix: row.slice(before, first).map(token => token.content).join('') + content.slice(0, bodyStart),
        suffix: content.slice(bodyEnd) + row.slice(last + 1, after).map(token => token.content).join(''),
      })
      first = last
    }
  }
  return comments
}

function decorationState(context: CodeHighlightContext): Decorations {
  let state = decorations.get(context.meta)
  if (!state) {
    state = { comments: readComments(context), words: [], applied: false }
    decorations.set(context.meta, state)
  }
  return state
}

function cleanComments(context: CodeHighlightContext, comments: Comment[]): void {
  const empty = new Set<CodeHighlightElement>()
  for (const comment of comments) {
    const used = comment.directives.filter(directive => directive.used)
    if (!used.length) continue
    const line = context.lines[comment.line]
    const children = line.children
    const start = children.indexOf(comment.nodes[0])
    if (start < 0) continue
    let offset = 0
    let body = ''
    for (const directive of used) {
      body += comment.body.slice(offset, directive.start).trimEnd()
      offset = directive.end
    }
    body += comment.body.slice(offset)
    body = body.replace(/(?:\/\/|#|--|[;%]{1,2})[ \t]*$/, '').trimEnd()
    const node = comment.nodes[0]
    if (body.trim()) {
      const suffix = comment.suffix ? ` ${comment.suffix.trimStart()}` : ''
      const value = comment.prefix + body + suffix
      if (node.type === 'element') node.children = [{ type: 'text', value }]
      else node.value = value
      children.splice(start + 1, comment.nodes.length - 1)
    }
    else {
      children.splice(start, comment.nodes.length)
      if (comment.atEnd) {
        while (children.length && !textContent(children.at(-1)!).trim()) children.pop()
      }
      if (comment.standalone && !children.length) empty.add(line)
    }
  }
  const body = context.code.children
  for (let index = body.length - 1; index >= 0; index--) {
    const child = body[index]
    if (child.type !== 'element' || !empty.has(child)) continue
    const next = body[index + 1]
    const previous = body[index - 1]
    if (next?.type === 'text' && next.value === '\n') body.splice(index, 2)
    else if (previous?.type === 'text' && previous.value === '\n') body.splice(--index, 2)
    else body.splice(index, 1)
  }
}

function textContent(node: CodeHighlightElement['children'][number]): string {
  return node.type === 'text' ? node.value : node.children.map(textContent).join('')
}

function highlightWord(line: CodeHighlightElement, word: string, className: string): void {
  const content = textContent(line)
  const ranges: { start: number, end: number }[] = []
  for (let index = content.indexOf(word); index >= 0; index = content.indexOf(word, index + 1)) {
    const end = index + word.length
    const previous = ranges.at(-1)
    if (previous && index < previous.end) previous.end = end
    else ranges.push({ start: index, end })
  }
  if (!ranges.length) return

  let offset = 0
  let rangeIndex = 0
  function paint(node: CodeHighlightElement['children'][number]): CodeHighlightElement['children'] {
    if (node.type === 'element') {
      node.children = node.children.flatMap(paint)
      return [node]
    }
    if (!node.value) return [node]
    const start = offset
    offset += node.value.length
    const children: CodeHighlightElement['children'] = []
    let position = start
    for (let range = ranges[rangeIndex]; range && range.start < offset; range = ranges[rangeIndex]) {
      const from = Math.max(start, range.start)
      const end = Math.min(offset, range.end)
      if (from > position) children.push({ type: 'text', value: node.value.slice(position - start, from - start) })
      children.push({ type: 'element', tagName: 'span', properties: { class: className }, children: [
        { type: 'text', value: node.value.slice(from - start, end - start) },
      ] })
      position = end
      if (range.end > offset) break
      rangeIndex++
    }
    if (!children.length) return [node]
    if (position < offset) children.push({ type: 'text', value: node.value.slice(position - start) })
    return children
  }
  paint(line)
}

function applyDecorations(this: CodeHighlightContext): void {
  const state = decorations.get(this.meta)
  if (!state || state.applied) return
  state.applied = true
  cleanComments(this, state.comments)
  for (const { line, word, className } of state.words) highlightWord(this.lines[line], word, className)
}

export interface TransformerNotationOptions {
  matchAlgorithm?: 'v1' | 'v3'
  classActivePre?: string
  classActiveCode?: string
}

function notationTransformer(
  name: string,
  options: TransformerNotationOptions,
  apply: (this: CodeHighlightContext, directive: Directive, line: number, state: Decorations) => boolean,
): CodeHighlightTransformer {
  return {
    name: `ts-presentation:notation-${name}`,
    code(code) {
      const state = decorationState(this)
      const legacy = options.matchAlgorithm === 'v1'
      for (const comment of state.comments) {
        if (!legacy && !comment.atEnd) continue
        const line = comment.line + Number(!legacy && comment.standalone)
        for (const directive of comment.directives) {
          if (directive.used || !apply.call(this, directive, line, state)) continue
          directive.used = true
          if (options.classActivePre) this.addClassToHast(this.pre, options.classActivePre)
          if (options.classActiveCode) this.addClassToHast(code, options.classActiveCode)
        }
      }
    },
    root: applyDecorations,
  }
}

export interface TransformerNotationMapOptions extends TransformerNotationOptions {
  classMap?: Readonly<Record<string, string | string[]>>
}

export function transformerNotationMap(options: TransformerNotationMapOptions = {}, name = 'map'): CodeHighlightTransformer {
  const classes = new Map(Object.entries(options.classMap ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
  return notationTransformer(name, options, function (directive, line) {
    const value = classes.get(directive.name.toLowerCase())
    if (value === undefined) return false
    const end = Math.min(line + (directive.count ?? 1), this.lines.length)
    for (let index = line; index < end; index++) this.addClassToHast(this.lines[index], value)
    return true
  })
}

export function transformerNotationDiff(options: TransformerNotationOptions & { classLineAdd?: string, classLineRemove?: string } = {}): CodeHighlightTransformer {
  const { classLineAdd = 'diff add', classLineRemove = 'diff remove', ...settings } = options
  return transformerNotationMap({ classActivePre: 'has-diff', ...settings, classMap: { '++': classLineAdd, '--': classLineRemove } }, 'diff')
}

export function transformerNotationHighlight(options: TransformerNotationOptions & { classActiveLine?: string } = {}): CodeHighlightTransformer {
  const { classActiveLine = 'highlighted', ...settings } = options
  return transformerNotationMap({ classActivePre: 'has-highlighted', ...settings, classMap: { highlight: classActiveLine, hl: classActiveLine } }, 'highlight')
}

export function transformerNotationFocus(options: TransformerNotationOptions & { classActiveLine?: string } = {}): CodeHighlightTransformer {
  const { classActiveLine = 'focused', ...settings } = options
  return transformerNotationMap({ classActivePre: 'has-focused', ...settings, classMap: { focus: classActiveLine } }, 'focus')
}

export function transformerNotationErrorLevel(options: TransformerNotationMapOptions = {}): CodeHighlightTransformer {
  return transformerNotationMap({
    classActivePre: 'has-highlighted',
    classMap: { error: 'highlighted error', warning: 'highlighted warning', info: 'highlighted info' },
    ...options,
  }, 'error-level')
}

function unescapeWord(value: string): string { return value.replace(/\\(.)/g, '$1') }

export function transformerNotationWordHighlight(options: TransformerNotationOptions & { classActiveWord?: string } = {}): CodeHighlightTransformer {
  const { classActiveWord = 'highlighted-word', ...settings } = options
  return notationTransformer('highlight-word', settings, function (directive, line, state) {
    const raw = /^word:((?:\\.|[^:\\])+)$/.exec(directive.name)?.[1]
    if (!raw) return false
    const word = unescapeWord(raw)
    const end = Math.min(this.lines.length, line + (directive.count ?? this.lines.length))
    for (let index = line; index < end; index++) state.words.push({ line: index, word, className: classActiveWord })
    return true
  })
}

export function transformerMetaHighlight(options: { className?: string, zeroIndexed?: boolean } = {}): CodeHighlightTransformer {
  const { className = 'highlighted', zeroIndexed = false } = options
  return {
    name: 'ts-presentation:meta-highlight',
    code() {
      const metadata = this.options.meta.__raw.replace(/^\[[^\]]*\]\s*/, '')
      const range = /\{([\d,-]+)\}/.exec(metadata)?.[1]
      if (!range) return
      for (const [index, line] of this.lines.entries()) {
        if (lineMatches(range, index + Number(!zeroIndexed))) this.addClassToHast(line, className)
      }
    },
  }
}

export function transformerMetaWordHighlight(options: { className?: string } = {}): CodeHighlightTransformer {
  const { className = 'highlighted-word' } = options
  return {
    name: 'ts-presentation:meta-word-highlight',
    code() {
      const metadata = this.options.meta.__raw.replace(/^\[[^\]]*\]\s*/, '')
      const words = [...metadata.matchAll(/(?:^|\s)\/((?:\\.|[^/\\\r\n])+)\/(?=\s|$)/g)].map(match => unescapeWord(match[1]))
      if (!words.length) return
      const state = decorationState(this)
      for (const [line] of this.lines.entries()) {
        for (const word of words) state.words.push({ line, word, className })
      }
    },
    root: applyDecorations,
  }
}

export interface TransformerCompactLineOption { line: number, classes?: string[] }

export function transformerCompactLineOptions(lineOptions: readonly TransformerCompactLineOption[] = []): CodeHighlightTransformer {
  const classes = new Map<number, string[]>()
  for (const option of lineOptions) {
    if (option.classes && !classes.has(option.line)) classes.set(option.line, option.classes)
  }
  return {
    name: 'ts-presentation:compact-line-options',
    line(node, number) {
      const configured = classes.get(number)
      if (configured) this.addClassToHast(node, configured)
    },
  }
}

export function transformerRemoveNotationEscape(): CodeHighlightTransformer {
  function unescape(node: CodeHighlightElement['children'][number]): void {
    if (node.type === 'text') node.value = node.value.replaceAll('[\\!code', '[!code')
    else node.children.forEach(unescape)
  }
  return {
    name: 'ts-presentation:remove-notation-escape',
    // Run after notation matching so the restored literal stays in the output.
    root() {
      applyDecorations.call(this)
      unescape(this.code)
    },
  }
}
