import type { TokenLine, TokenSettings } from 'ts-syntax-highlighter'
import { tokenClass } from 'ts-syntax-highlighter/browser'
import { escapeHtml } from './html.ts'

export type CodeHighlightProperty = string | number | boolean | (string | number)[] | null | undefined
export interface CodeHighlightText { type: 'text', value: string }
export interface CodeHighlightElement {
  type: 'element'
  tagName: string
  properties: Record<string, CodeHighlightProperty>
  children: (CodeHighlightElement | CodeHighlightText)[]
  data?: Record<string, unknown>
}
export interface CodeHighlightRoot {
  type: 'root'
  children: (CodeHighlightElement | CodeHighlightText)[]
  data?: Record<string, unknown>
}
export interface CodeHighlightToken {
  content: string
  offset: number
  type?: string
  scopes?: readonly string[]
  color?: string
  fontStyle?: number
  htmlAttrs?: Record<string, CodeHighlightProperty>
  htmlStyle?: string | Record<string, string>
}

export interface CodeHighlightBlockOptions {
  lang: string
  theme?: string
  meta: { __raw: string }
}

export interface CodeHighlightContextBase {
  meta: Record<string, unknown>
  options: CodeHighlightBlockOptions
}
export interface CodeHighlightContext extends CodeHighlightContextBase {
  readonly source: string
  readonly tokens: CodeHighlightToken[][]
  readonly root: CodeHighlightRoot
  readonly pre: CodeHighlightElement
  readonly code: CodeHighlightElement
  readonly lines: CodeHighlightElement[]
  readonly structure: 'classic'
  addClassToHast(node: CodeHighlightElement, classes: string | string[]): CodeHighlightElement
}

// The lifecycle follows Shiki's documented synchronous transformer hooks.
export interface CodeHighlightTransformer {
  name?: string
  enforce?: 'pre' | 'post'
  preprocess?: (this: CodeHighlightContextBase, code: string, options: CodeHighlightBlockOptions) => string | void
  tokens?: (this: CodeHighlightContextBase & { readonly source: string }, tokens: CodeHighlightToken[][]) => CodeHighlightToken[][] | void
  span?: (this: CodeHighlightContext, node: CodeHighlightElement, line: number, column: number, lineElement: CodeHighlightElement, token: CodeHighlightToken) => CodeHighlightElement | void
  line?: (this: CodeHighlightContext, node: CodeHighlightElement, line: number) => CodeHighlightElement | void
  code?: (this: CodeHighlightContext, node: CodeHighlightElement) => CodeHighlightElement | void
  pre?: (this: CodeHighlightContext, node: CodeHighlightElement) => CodeHighlightElement | void
  root?: (this: CodeHighlightContext, node: CodeHighlightRoot) => CodeHighlightRoot | void
  postprocess?: (this: CodeHighlightContextBase, html: string, options: CodeHighlightBlockOptions) => string | void
}

export type CodeTokenizer = (source: string, language: string) => Promise<TokenLine[] | undefined>
export interface HighlightFrameOptions { start: number, lineNumbers: boolean, maxHeight?: string }

const order = { pre: -1, post: 1 }

export function orderCodeHighlightTransformers(entries: readonly (CodeHighlightTransformer | false | null | undefined)[] = []): CodeHighlightTransformer[] {
  return entries.filter((entry): entry is CodeHighlightTransformer => !!entry)
    .sort((left, right) => (left.enforce ? order[left.enforce] : 0) - (right.enforce ? order[right.enforce] : 0))
}

function text(value: string): CodeHighlightText { return { type: 'text', value } }

function element(tagName: string, properties: CodeHighlightElement['properties'] = {}, children: CodeHighlightElement['children'] = []): CodeHighlightElement {
  return { type: 'element', tagName, properties, children }
}

function classes(...values: CodeHighlightProperty[]): string[] {
  return values.flatMap(value => typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : Array.isArray(value) ? value.map(String) : [])
}

function addClassToHast(node: CodeHighlightElement, value: string | string[]): CodeHighlightElement {
  node.properties.class = [...new Set(classes(node.properties.class, node.properties.className, value))]
  delete node.properties.className
  return node
}

const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const aliases: Readonly<Record<string, string>> = { htmlFor: 'for', tabIndex: 'tabindex' }

function serialize(node: CodeHighlightRoot | CodeHighlightElement | CodeHighlightText): string {
  if (node.type === 'text') return escapeHtml(node.value)
  if (node.type === 'root') return node.children.map(serialize).join('')
  const tag = node.tagName
  if (!/^[a-z][\w:-]*$/i.test(tag)) throw new Error(`Invalid code transformer element name: ${tag}`)
  const entries = { ...node.properties }
  if (entries.className !== undefined) {
    entries.class = [...new Set(classes(entries.class, entries.className))]
    delete entries.className
  }
  const attributes = Object.entries(entries).map(([name, value]) => {
    if (!/^[a-z_:][\w.:-]*$/i.test(name) || value == null) return ''
    const attribute = Object.hasOwn(aliases, name) ? aliases[name] : name
    if (typeof value === 'boolean' && !/^(?:data|aria)-/.test(attribute)) return value ? ` ${attribute}` : ''
    const written = Array.isArray(value) ? value.join(' ') : String(value)
    return ` ${attribute}="${escapeHtml(written)}"`
  }).join('')
  const opening = `<${tag}${attributes}>`
  return voidElements.has(tag) ? opening : `${opening}${node.children.map(serialize).join('')}</${tag}>`
}

const tokenFontFlags = ['italic', 'bold', 'underline', 'strikethrough'] as const

function tokenAttributes(token: CodeHighlightToken): CodeHighlightElement['properties'] {
  const properties = { class: `tok-${tokenClass(token.type ?? 'text')}`, ...token.htmlAttrs }
  if (token.htmlStyle !== undefined) {
    const style = typeof token.htmlStyle === 'string' ? token.htmlStyle : Object.entries(token.htmlStyle).map(([key, value]) => `${key}:${value}`).join(';')
    return { ...properties, style }
  }
  const flags = Math.max(0, token.fontStyle ?? 0)
  const decoration = [flags & 4 && 'underline', flags & 8 && 'line-through'].filter(Boolean).join(' ')
  const style = [token.color && `color:${token.color}`, flags & 1 && 'font-style:italic',
    flags & 2 && 'font-weight:bold', decoration && `text-decoration:${decoration}`].filter(Boolean).join(';')
  return style ? { ...properties, style } : properties
}

function highlightedTokens(source: string, lines: readonly TokenLine[] | undefined, palette: Readonly<Record<string, TokenSettings>>): CodeHighlightToken[][] {
  let offset = 0
  return source.split('\n').map((line, index) => {
    const tokens = lines?.[index]?.tokens ?? (line ? [{ content: line, offset: 0, type: 'text', scopes: [] }] : [])
    const row = tokens.map(token => {
      const style = palette[tokenClass(token.type)]
      const names = style?.fontStyle?.split(/\s+/) ?? []
      const fontStyle = tokenFontFlags.reduce((flags, name, index) => flags + (names.includes(name) ? 1 << index : 0), 0)
      return { ...token, offset: offset + token.offset, color: style?.foreground, fontStyle }
    })
    offset += line.length + 1
    return row
  })
}

export async function transformHighlightedCode(
  source: string,
  options: CodeHighlightBlockOptions,
  transformers: readonly CodeHighlightTransformer[],
  tokenize: CodeTokenizer,
  palette: Readonly<Record<string, TokenSettings>>,
  frame?: HighlightFrameOptions,
): Promise<string> {
  const common: CodeHighlightContextBase = { meta: {}, options }
  for (const transformer of transformers)
    source = transformer.preprocess?.call(common, source, options) ?? source
  source = source.replace(/\r\n/g, '\n')
  if (frame) source = source.replace(/\n$/, '')
  const tokensContext = { ...common, source }
  let tokens = highlightedTokens(source, await tokenize(source, options.lang), palette)
  for (const transformer of transformers)
    tokens = transformer.tokens?.call(tokensContext, tokens) ?? tokens

  const lines: CodeHighlightElement[] = []
  let root: CodeHighlightRoot = { type: 'root', children: [] }
  let pre = element('pre', { class: 'slidev-code', style: frame?.maxHeight ? `max-height:${frame.maxHeight}` : undefined })
  let code = element('code', { class: `language-${options.lang}` })
  const context: CodeHighlightContext = {
    ...tokensContext, tokens, lines, structure: 'classic', addClassToHast,
    get root() { return root },
    get pre() { return pre },
    get code() { return code },
  }

  for (const [index, row] of tokens.entries()) {
    const number = index + 1
    const visible = frame && frame.start + index
    let line = element('span', { class: frame ? 'line code-line' : 'line' })
    let column = 0
    for (const token of row) {
      let span = element('span', tokenAttributes(token), [text(token.content)])
      for (const transformer of transformers)
        span = transformer.span?.call(context, span, number, column, line, token) ?? span
      line.children.push(span)
      column += token.content.length
    }
    for (const transformer of transformers)
      line = transformer.line?.call(context, line, number) ?? line
    if (frame) {
      line.properties['data-code-line'] = true
      if (!line.children.length) {
        line.properties['data-code-empty'] = true
        line.children.push(text('\u200b'))
      }
      if (frame.lineNumbers) {
        line.properties['data-code-number'] = visible
        line.children.unshift(element('span', { class: 'code-line-number', 'aria-hidden': true }, [text(String(visible))]))
      }
    }
    lines.push(line)
    if (index > 0) code.children.push(text('\n'))
    code.children.push(line)
  }
  for (const transformer of transformers)
    code = transformer.code?.call(context, code) ?? code
  pre.children.push(code)
  for (const transformer of transformers)
    pre = transformer.pre?.call(context, pre) ?? pre
  root.children.push(pre)
  for (const transformer of transformers)
    root = transformer.root?.call(context, root) ?? root
  let markup = serialize(root)
  for (const transformer of transformers)
    markup = transformer.postprocess?.call(common, markup, options) ?? markup
  return markup
}
