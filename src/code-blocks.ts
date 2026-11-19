import { resolveGrammar, tokenClass, Tokenizer } from 'ts-syntax-highlighter/browser'
import { parseEquationOptions } from './equation-steps.ts'
import { readFenceOptions } from './fence-options.ts'
import { escapeHtml } from './html.ts'

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
  runner?: 'run' | 'edit'
  writeToken?: string
}

const decoration = /\{(?:[^{}"']|"[^"]*"|'[^']*')*\}/y

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
  while (info) {
    decoration.lastIndex = 0
    const group = decoration.exec(info)?.[0]
    if (!group) return
    const launch = /^\{\s*(live|monaco)(-run)?\s*\}$/i.exec(group)
    if (launch) {
      if (runner || magic || !/^(?:js|javascript|ts|typescript)$/i.test(lang)) return
      runner = launch[2] ? 'run' : 'edit'
    }
    else if (!ranges && parseEquationOptions(group)) ranges = group
    else {
      const fields = readFenceOptions(group)
      if (!fields) return
      options = { ...options, ...fields }
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
  return {
    language: (lang || 'text').toLowerCase(), title: caption?.[1], ranges: parseEquationOptions(ranges)?.ranges ?? [],
    start: Number(first), at, final, lines: typeof props.lines === 'boolean' ? props.lines : undefined, maxHeight, magic,
    ...(runner && { runner }),
    writeToken: typeof props.tpSnippet === 'string' && /^[a-f0-9]{64}$/.test(props.tpSnippet) ? props.tpSnippet : undefined,
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
}

export function magicFrames(source: string): CodeFrame[] | undefined {
  const frames: CodeFrame[] = []
  let fence = ''
  let info: CodeBlockInfo | undefined
  let code: string[] = []
  const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/
  for (const line of source.split('\n')) {
    const match = opening.exec(line)
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) {
        frames.push({ source: code.join('\n'), info: info! })
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
    }
  }
  if (!fence && frames.length) return frames
}

export function createCodeHighlighter(): (source: string, language: string) => Promise<string[] | undefined> {
  const grammars = new Map<string, ReturnType<typeof resolveGrammar>>()
  return async (source, language) => {
    if (!grammars.has(language)) {
      const alias = ({ 'c#': 'csharp', 'c++': 'cpp', 'f#': 'fsharp' } as Record<string, string>)[language] ?? language
      grammars.set(language, resolveGrammar(alias))
    }
    const grammar = await grammars.get(language)
    if (!grammar) return
    return new Tokenizer(grammar).tokenize(source).map(line =>
      line.tokens.map(token => `<span class="tok-${tokenClass(token.type)}">${escapeHtml(token.content)}</span>`).join(''),
    )
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

export function codeFrame(frame: CodeFrame, highlighted: string[] | undefined, lineNumbers: boolean): string {
  const { source, info } = frame
  const raw = source.replace(/\n$/, '')
  const lines = highlighted?.slice(0, raw.split('\n').length) ?? raw.split('\n').map(escapeHtml)
  const style = info.maxHeight ? ` style="max-height:${info.maxHeight}"` : ''
  const title = info.title ? `<figcaption>${escapeHtml(codeTitle(info.title))}</figcaption>` : ''
  const numbers = info.lines ?? lineNumbers
  const rows = lines.map((line, index) => {
    const number = info.start + index
    const count = numbers ? ` data-code-number="${number}"` : ''
    const gutter = numbers ? `<span class="code-line-number" aria-hidden="true">${number}</span>` : ''
    return `<span class="code-line" data-code-line${count}${line ? '' : ' data-code-empty'}>${gutter}${line || '&#8203;'}</span>`
  }).join('\n')
  return `<figure class="code-frame"${data(info)}>${title}<pre${style}><code class="language-${info.language}">${rows}</code></pre></figure>`
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
