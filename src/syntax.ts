import { renderMath } from './math.ts'
import type { EquationOptions } from './equation-steps.ts'
import { parseEquationOptions } from './equation-steps.ts'
import type { FenceScalar } from './fence-options.ts'
import { readFenceOptions } from './fence-options.ts'
import type { CodeBlockInfo } from './code-blocks.ts'
import { decoratedCode } from './code-blocks.ts'

const fenceStart = /^ {0,3}(`{3,}|~{3,})(.*)$/
const inlineCode = /^`+/
const protectedHtml = /^<(pre|code|script|style)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/i
const runnerOptions = /^(\s*)(js|javascript|ts|typescript)(\s+)\{(monaco-run|monaco|live-run|live)\}(\s*)$/i
const slotMarker = /^::([a-z][a-z0-9-]*)::\s*$/i
const bareDisplay = /^ {0,3}\\begin\{((?:equation|align|alignat|gather)\*?|CD)\}/

function inlineMathEnd(line: string, start: number, delimiter: string): number {
  let braces = 0
  for (let at = start; at < line.length; at++) {
    const token = line[at]
    if (!braces && line.startsWith(delimiter, at)) return at
    if (token === '\\') at++
    else if (token === '{') braces++
    else if (token === '}' && braces) braces--
  }
  return -1
}

export function splitSlots(source: string): Record<string, string> {
  const slots: Record<string, string> = Object.create(null)
  let name = 'default'
  let lines: string[] = []
  let fence = ''
  function save(): void {
    slots[name] = name in slots ? `${slots[name]}\n\n${lines.join('\n')}` : lines.join('\n')
  }
  for (const line of source.split('\n')) {
    const marker = fenceStart.exec(line)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
    }
    const slot = !fence && slotMarker.exec(line)
    if (slot) {
      save()
      name = slot[1].toLowerCase()
      lines = []
    }
    else lines.push(line)
  }
  save()
  return slots
}

interface PreparedMarkdown {
  source: string
  restore: (rendered: string) => string
}

interface MarkdownSyntax {
  renderMath?: (body: string, display: boolean) => string
  mathEnabled?: boolean
  registerMermaid?: (options: Record<string, FenceScalar>) => string
  registerCode?: (info: CodeBlockInfo) => string
}

export function prepareMarkdown(source: string, syntax: MarkdownSyntax = {}): PreparedMarkdown {
  if (!source.includes('$') && !source.includes('\\(') && !source.includes('\\[') && !source.includes('\\begin{') && !source.includes('{monaco') && !source.includes('{live') && !source.includes('mermaid') && !source.includes('```') && !source.includes('~~~')) {
    return { source, restore: html => html }
  }

  const math: string[] = []
  const marker = (body: string, display: boolean, options?: EquationOptions) => {
    const content = (syntax.renderMath ?? renderMath)(body.trim(), display)
    const block = options
      ? `<div class="equation-steps" data-equation-steps="${options.ranges.join('|')}" data-equation-at="${options.at}" data-equation-first="${options.startLine}" data-equation-finally="${options.finally}">${content}</div>`
      : content
    const index = math.push(block) - 1
    return `<tp-math data-equation="${index}"></tp-math>`
  }

  function inline(line: string): string {
    let result = ''
    for (let at = 0; at < line.length;) {
      const char = line[at]
      if (char === '\\' && line[at + 1]) {
        if (syntax.mathEnabled !== false && line[at + 1] === '(') {
          const end = inlineMathEnd(line, at + 2, '\\)')
          if (end > at + 2) {
            result += marker(line.slice(at + 2, end), false)
            at = end + 2
            continue
          }
        }
        result += line.slice(at, at + 2)
        at += 2
        continue
      }
      if (char === '`') {
        const opening = inlineCode.exec(line.slice(at))?.[0] ?? ''
        const rest = line.slice(at + opening.length)
        const runs = [...rest.matchAll(/`+/g)]
        const end = runs.find(run => run[0].length === opening.length)
        if (end) {
          const stop = at + opening.length + (end.index ?? 0) + opening.length
          result += line.slice(at, stop)
          at = stop
          continue
        }
      }
      if (char === '<') {
        const chunk = protectedHtml.exec(line.slice(at))?.[0] ?? /^<[^>]+>/.exec(line.slice(at))?.[0]
        if (chunk) { result += chunk; at += chunk.length; continue }
      }
      if (syntax.mathEnabled !== false && char === '$' && line[at + 1] && !/\s|\$/.test(line[at + 1]) && line[at - 1] !== '$') {
        const end = inlineMathEnd(line, at + 1, '$')
        if (end > at + 1 && !/\s/.test(line[end - 1]) && !/[\d$]/.test(line[end + 1] ?? '')) {
          result += marker(line.slice(at + 1, end), false)
          at = end + 1
          continue
        }
      }
      result += char
      at++
    }
    return result
  }

  const lines = source.split('\n')
  const output: string[] = []
  let fence = ''
  let htmlCode = ''
  let comment = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const opening = fenceStart.exec(line)
    if (!fence && !htmlCode && (comment || /^ {0,3}<!--/.test(line))) {
      comment = !line.includes('-->')
      output.push(line)
      continue
    }
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length && !opening[2].trim()) fence = ''
      output.push(line)
      continue
    }
    if (htmlCode) {
      if (new RegExp(`</${htmlCode}\\s*>`, 'i').test(line)) htmlCode = ''
      output.push(line)
      continue
    }
    if (opening) {
      fence = opening[1]
      const [, diagramInfo] = /^\s*mermaid\s+(\{.*\})\s*$/i.exec(opening[2]) ?? []
      const diagram = diagramInfo && readFenceOptions(diagramInfo)
      if (diagram && syntax.registerMermaid) {
        output.push(`${line.slice(0, line.indexOf(fence))}${fence}${syntax.registerMermaid(diagram)}`)
        continue
      }
      const options = runnerOptions.exec(opening[2])
      const decoration = !options && decoratedCode(opening[2])
      if (decoration && syntax.registerCode) {
        output.push(`${line.slice(0, line.indexOf(fence))}${fence}${syntax.registerCode(decoration)}`)
        continue
      }
      const module = options?.[2].toLowerCase().startsWith('j') ? 'js' : 'ts'
      const mode = options?.[4].toLowerCase().endsWith('run') ? 'run' : 'edit'
      output.push(options ? `${line.slice(0, line.indexOf(fence))}${fence}${module}-tp-${mode}` : line)
      continue
    }
    const rawCode = /^ {0,3}<(pre|code|script|style)(?:>|\s)/i.exec(line)
    if (rawCode && !new RegExp(`</${rawCode[1]}\\s*>`, 'i').test(line)) {
      htmlCode = rawCode[1]
      output.push(line)
      continue
    }
    const environment = syntax.mathEnabled !== false && bareDisplay.exec(line)
    if (environment) {
      const closing = `\\end{${environment[1]}}`
      let end = index
      while (!lines[end].trimEnd().endsWith(closing)) {
        const next = lines[++end]
        if (next === undefined || fenceStart.test(next) || bareDisplay.test(next) || /^ {0,3}<!--/.test(next)) {
          end = -1
          break
        }
      }
      if (end >= index) {
        output.push('', marker(lines.slice(index, end + 1).join('\n'), true), '')
        index = end
        continue
      }
    }
    const display = syntax.mathEnabled !== false && /^ {0,3}(\$\$|\\\[)(.*)$/.exec(line)
    if (display) {
      const delimiter = display[1] === '$$' ? '$$' : '\\]'
      if (display[2].trimEnd().endsWith(delimiter) && display[2].trim().length > 2) {
        output.push('', marker(display[2].trimEnd().slice(0, -2), true), '')
        continue
      }
      const options = parseEquationOptions(display[2])
      const ends = (value: string) => value.trimEnd().endsWith(delimiter)
      let close = index + 1
      while (close < lines.length && !fenceStart.test(lines[close]) && !ends(lines[close])) close++
      if (close < lines.length && ends(lines[close]) && !fenceStart.test(lines[close])) {
        const last = lines[close].trimEnd().slice(0, -2)
        const body = [options ? '' : display[2], ...lines.slice(index + 1, close), last].join('\n').trim()
        if (body) {
          output.push('', marker(body, true, options), '')
          index = close
          continue
        }
      }
    }
    output.push(inline(line))
  }

  return {
    source: output.join('\n'),
    restore(html) {
      return html
        .replace(/<p>(<tp-math data-equation="\d+"><\/tp-math>)<\/p>/g, (whole, placeholder) => {
          const index = Number(/\d+/.exec(placeholder)?.[0])
          return /^<div class="equation-steps"|^<math [^>]* display="block"/.test(math[index] ?? '') ? placeholder : whole
        })
        .replace(/<tp-math data-equation="(\d+)"><\/tp-math>/g, (whole, index: string) => math[Number(index)] ?? whole)
    },
  }
}
