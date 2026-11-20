import { getTheme, themeTokenColors, themeTokenCss, Tokenizer } from 'ts-syntax-highlighter/browser'
import type { Grammar } from 'ts-syntax-highlighter'
import { clickSpan } from '../../../client/runtime/clicks.ts'
import { codeTokenMarkup } from '../../../client/runtime/code-tokens.ts'
import { parseEquationOptions } from '../../../client/runtime/equation-steps.ts'
import type { LiveLineNumberMode, LiveWordWrap } from '../../../client/runtime/live-editor.ts'
import { readFenceOptions } from './fence-options.ts'
import { escapeHtml } from './html.ts'
import { createCodeLanguageResolver } from './code-languages.ts'
import type { CodeHighlightLanguages } from './code-languages.ts'
import type { CodeHighlightTransformer, CodeTokenizer } from './highlight-transformers.ts'
import { orderCodeHighlightTransformers, transformHighlightedCode } from './highlight-transformers.ts'
import { codeWordDecoration } from './notation-transformers.ts'

export interface CodeBlockInfo {
  language: string
  title?: string
  ranges: string[]
  start: number
  at: string
  final: string
  lines?: boolean
  maxHeight?: string
  magic: boolean
  runner?: 'run' | 'edit' | 'diff'
  diffOptions?: { readonly: boolean, height?: string }
  editorOptions?: {
    readonly: boolean
    height?: string
    lineNumbers?: LiveLineNumberMode
    wordWrap?: LiveWordWrap
    wordWrapColumn?: number
  }
  runnerOptions?: Record<string, unknown>
  runnerTiming?: RunnerTiming
  writeToken?: string
}

export interface RunnerTiming {
  autorun?: true | 'once'
  outputAt?: string
}

function runnerOutputAt(value: unknown): string | undefined {
  const position = value === true || typeof value === 'string' || typeof value === 'number' && value !== 0
    ? String(value)
    : Array.isArray(value) && value.length === 2 && value.every(bound => typeof bound === 'number' || typeof bound === 'string')
      ? JSON.stringify(value)
      : undefined
  if (position && clickSpan(position, 0)) return position
}

const decoration = /\{(?:[^{}"']|"[^"]*"|'[^']*')*\}/y

function runnerDecoration(input: string): string | undefined {
  if (input[0] !== '{') return
  const tokens = /[{}]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^{}"']+/gy
  let depth = 0
  for (let match = tokens.exec(input); match; match = tokens.exec(input)) {
    if (match[0] === '{') depth++
    else if (match[0] === '}' && --depth === 0) return input.slice(0, tokens.lastIndex)
  }
}

/** The title and range groups follow Slidev's codeblock/wrapper grammar (MIT). */
export function parseCodeInfo(input: string): CodeBlockInfo | undefined {
  let info = input.trim()
  const [, lang] = /^([\w+#.-]*)(?=\s|[\[{]|$)/.exec(info) ?? []
  if (lang === undefined) return
  info = info.slice(lang.length).trim()
  const magic = (lang === 'md' || lang === 'markdown') && /^magic-move(?=\s|\{|$)/.test(info)
  if (magic) info = info.slice('magic-move'.length).trim()
  const caption = /^\[([^\]\r\n]+)\]/.exec(info)
  if (caption) info = info.slice(caption[0].length).trim()
  let ranges = ''
  let options = {}
  let runner: CodeBlockInfo['runner']
  let automatic = false
  while (info) {
    const word = codeWordDecoration.exec(info)
    if (word) {
      info = info.slice(word[0].length).trim()
      continue
    }
    decoration.lastIndex = 0
    const group = decoration.exec(info)?.[0] ?? (runner ? runnerDecoration(info) : undefined)
    if (!group) return
    const launch = /^\{\s*(live|monaco)(?:-(run|diff))?\s*\}$/i.exec(group)
    if (launch) {
      const mode = launch[2]?.toLowerCase()
      if (runner || magic || (!lang && mode !== 'diff')) return
      runner = mode === 'diff' ? 'diff' : mode === 'run' ? 'run' : 'edit'
      automatic = launch[1].toLowerCase() === 'monaco'
    }
    else if (!ranges && parseEquationOptions(group)) ranges = group
    else {
      let fields: unknown = readFenceOptions(group)
      if (!fields && runner) {
        try { fields = Bun.JSON5.parse(group) }
        catch { return }
      }
      if (!fields) return
      options = { ...options, ...(fields as Record<string, unknown>) }
    }
    info = info.slice(group.length).trim()
  }
  const props = options as Record<string, unknown>
  const first = props.startLine ?? 1
  const at = String(props.at ?? '+1')
  const final = String(props.finally ?? 'last')
  if (!Number.isSafeInteger(first) || Number(first) < 1 || Number(first) > 999_999
    || !/^[+-]?\d{1,3}$/.test(at) || (final !== 'last' && !parseEquationOptions(`{${final}}`))) return
  const configuredHeight = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight
  const maxHeight = typeof configuredHeight === 'string' && /^\d+(?:\.\d+)?(?:px|em|rem|vh|%)$/.test(configuredHeight) ? configuredHeight : undefined
  const configuredSize = typeof props.height === 'number' ? `${props.height}px` : props.height
  const height = typeof configuredSize === 'string' && /^(?:initial|auto|\d+(?:\.\d+)?(?:px|em|rem|vh|%))$/.test(configuredSize) ? configuredSize : undefined
  const editor = props.editorOptions && typeof props.editorOptions === 'object'
    ? props.editorOptions as Record<string, unknown> : {}
  const lineNumbers = editor.lineNumbers ?? props.lineNumbers
  const numberMode = lineNumbers === 'on' || lineNumbers === 'off' || lineNumbers === 'relative' || lineNumbers === 'interval' ? lineNumbers : undefined
  const wrap = editor.wordWrap ?? props.wordWrap
  const wordWrap = wrap === 'on' || wrap === 'off' || wrap === 'wordWrapColumn' || wrap === 'bounded' ? wrap : undefined
  const column = editor.wordWrapColumn ?? props.wordWrapColumn
  const wordWrapColumn = typeof column === 'number' && Number.isSafeInteger(column) && column > 0 ? column : undefined
  const writeToken = typeof props.tpSnippet === 'string' && /^[a-f0-9]{64}$/.test(props.tpSnippet) ? props.tpSnippet : undefined
  const autorun = props.autorun === 'once' ? 'once' : props.autorun === true || (props.autorun === undefined && automatic) ? true : undefined
  return {
    language: (lang || 'text').toLowerCase(), title: caption?.[1], ranges: parseEquationOptions(ranges)?.ranges ?? [],
    start: Number(first), at, final, lines: typeof props.lines === 'boolean' ? props.lines : undefined, maxHeight, magic,
    ...(runner && { runner, runnerOptions: props.runnerOptions && typeof props.runnerOptions === 'object' && !Array.isArray(props.runnerOptions)
      ? props.runnerOptions as Record<string, unknown>
      : undefined }),
    ...(runner === 'diff' && { diffOptions: { readonly: props.readonly === true, height: height === 'initial' ? undefined : height } }),
    ...((runner === 'edit' || runner === 'run' || writeToken !== undefined) && {
      editorOptions: { readonly: (editor.readOnly ?? props.readonly) === true, height, lineNumbers: numberMode, wordWrap, wordWrapColumn },
    }),
    ...(runner === 'run' && { runnerTiming: { autorun, outputAt: runnerOutputAt(props.showOutputAt) } }),
    writeToken,
  }
}

export function decoratedCode(input: string): CodeBlockInfo | undefined {
  const options = parseCodeInfo(input)
  if (options && (options.title || options.ranges.length || options.lines !== undefined || options.maxHeight || options.magic || options.writeToken || options.runner))
    return options
}

export interface CodeFrame {
  source: string
  info: CodeBlockInfo
  rawInfo?: string
}

export function magicFrames(source: string): CodeFrame[] | undefined {
  const frames: CodeFrame[] = []
  let fence = ''
  let info: CodeBlockInfo | undefined
  let rawInfo = ''
  let code: string[] = []
  const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/
  for (const line of source.split('\n')) {
    const match = opening.exec(line)
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) {
        frames.push({ source: code.join('\n'), info: info!, rawInfo })
        if (frames.length > 100) return
        fence = ''
        code = []
      }
      else code.push(line)
    }
    else if (match) {
      info = parseCodeInfo(match[2])
      if (!info || info.magic || info.writeToken || info.runner) return
      fence = match[1]
      rawInfo = match[2].trim()
    }
  }
  if (!fence && frames.length) return frames
}

export function codeThemeStyles(name: unknown): string {
  const theme = typeof name === 'string' ? getTheme(name) : undefined
  if (!theme) return ''
  const selector = '.slide :is(pre, .code-diff, .live-code-editor)'
  const css = themeTokenCss(theme, { selector, classPrefix: 'tok-', variablePrefix: '--tp-code-' })
  return `<style id="presentation-code-theme">${css}
${selector} { background: var(--tp-code-background); color: var(--tp-code-foreground); }</style>`
}

function createCodeTokenizer(resolve = createCodeLanguageResolver()): CodeTokenizer {
  const tokenizers = new WeakMap<Grammar, Tokenizer>()
  return async (source, language) => {
    const grammar = await resolve(language)
    if (!grammar) return
    let tokenizer = tokenizers.get(grammar)
    if (!tokenizer) {
      try {
        tokenizer = new Tokenizer(grammar)
      }
      catch (error) {
        throw new Error(`Could not compile code grammar "${language}".`, { cause: error })
      }
      tokenizers.set(grammar, tokenizer)
    }
    return tokenizer.tokenize(source)
  }
}

export function createCodeHighlighter(tokenize: CodeTokenizer = createCodeTokenizer()): (source: string, language: string) => Promise<string[] | undefined> {
  return async (source, language) => {
    const lines = await tokenize(source, language)
    if (lines) return codeTokenMarkup(lines)
  }
}

export function createHighlightedCodeRenderer(theme: unknown, hooks?: readonly (CodeHighlightTransformer | false | null | undefined)[], languages?: readonly CodeHighlightLanguages[]): {
  highlight: ReturnType<typeof createCodeHighlighter>
  resolveGrammar: ReturnType<typeof createCodeLanguageResolver>
  hasTransformers: boolean
  render: (source: string, language: string, rawInfo?: string, frame?: CodeBlockInfo, lineNumbers?: boolean) => Promise<string | undefined>
} {
  const resolveGrammar = createCodeLanguageResolver(languages)
  const tokenize = createCodeTokenizer(resolveGrammar)
  const highlight = createCodeHighlighter(tokenize)
  const transformers = orderCodeHighlightTransformers(hooks)
  const themeName = typeof theme === 'string' ? theme : undefined
  const selected = transformers.length && themeName ? getTheme(themeName) : undefined
  const palette = selected ? themeTokenColors(selected) : {}
  return {
    highlight,
    resolveGrammar,
    hasTransformers: !!transformers.length,
    async render(source, language, rawInfo, frame, lineNumbers = false) {
      if (transformers.length) {
        const meta = { __raw: rawInfo?.trim().replace(/^\S+\s*/, '') ?? '' }
        const markup = await transformHighlightedCode(source, { lang: language, theme: themeName, meta }, transformers, tokenize, palette,
          frame && { start: frame.start, lineNumbers: frame.lines ?? lineNumbers, maxHeight: frame.maxHeight })
        return frame ? wrapCodeFrame(frame, markup) : markup
      }
      const lines = await highlight(source, language)
      if (frame) return codeFrame({ source, info: frame }, lines, lineNumbers)
      if (lines) return `<pre><code class="language-${escapeHtml(language)}">${lines.join('\n')}</code></pre>`
    },
  }
}

function data(info: CodeBlockInfo): string {
  const options = [
    ['data-code-ranges', info.ranges.join('|')],
    ['data-code-start', String(info.start)],
    ['data-code-at', info.at],
    ['data-code-finally', info.final],
  ]
  return options.map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('')
}

function wrapCodeFrame(info: CodeBlockInfo, markup: string): string {
  const title = info.title ? `<figcaption>${escapeHtml(codeTitle(info.title))}</figcaption>` : ''
  return `<figure class="code-frame"${data(info)}>${title}${markup}</figure>`
}

function codeFrame(frame: CodeFrame, highlighted: string[] | undefined, lineNumbers: boolean): string {
  const { source, info } = frame
  const raw = source.replace(/\n$/, '')
  const lines = highlighted?.slice(0, raw.split('\n').length) ?? raw.split('\n').map(escapeHtml)
  const style = info.maxHeight ? ` style="max-height:${info.maxHeight}"` : ''
  const numbers = info.lines ?? lineNumbers
  const rows = lines.map((line, index) => {
    const number = info.start + index
    const count = numbers ? ` data-code-number="${number}"` : ''
    const gutter = numbers ? `<span class="code-line-number" aria-hidden="true">${number}</span>` : ''
    return `<span class="code-line" data-code-line${count}${line ? '' : ' data-code-empty'}>${gutter}${line || '&#8203;'}</span>`
  }).join('\n')
  return wrapCodeFrame(info, `<pre${style}><code class="language-${info.language}">${rows}</code></pre>`)
}

export function codeTitle(title: string): string {
  return title.replace(/~[^~]+~/g, '').trim()
}

const tabLabels = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['sh', 'Shell'], ['bash', 'Bash'], ['text', 'Text']])
export function codeTabLabel(info: CodeBlockInfo): string {
  return (info.title && codeTitle(info.title)) || tabLabels.get(info.language) || info.language
}

export function codeBlock(info: CodeBlockInfo, frames: string[], magic = false): string {
  return `<div class="presentation-code" data-code-block${magic ? ' data-code-motion="true"' : ''}${data(info)}>${frames.map((frame, index) => index ? frame.replace('<figure', '<figure hidden') : frame).join('')}</div>`
}
