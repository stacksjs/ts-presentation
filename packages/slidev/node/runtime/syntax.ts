import { mathVerbLength, renderMath } from './math.ts'
import type { EquationOptions } from '../../../client/runtime/equation-steps.ts'
import { parseEquationOptions } from '../../../client/runtime/equation-steps.ts'
import type { FenceScalar } from './fence-options.ts'
import { readFenceOptions } from './fence-options.ts'
import type { CodeBlockInfo } from './code-blocks.ts'
import { codeTabLabel, decoratedCode, parseCodeInfo } from './code-blocks.ts'
import { escapeHtml } from './html.ts'

const fenceStart = /^ {0,3}(`{3,}|~{3,})(.*)$/
const quotePrefix = /^(?: {0,3}>[ \t]?)+/
const inlineCode = /^`+/
const protectedHtml = /^<(pre|code|script|style)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/i
const htmlTag = /^<(?:[^>"']|"[^"]*"|'[^']*')+>/
const slotMarker = /^::\s*([\w.:-]+?)\s*::\s*$/
const bareDisplay = /^ {0,3}\\begin\{((?:equation|align|alignat|gather)\*?|CD)\}/

function inlineMathEnd(line: string, start: number, delimiter: string): number {
  let braces = 0
  for (let at = start; at < line.length; at++) {
    const token = line[at]
    if (!braces && line.startsWith(delimiter, at)) return at
    if (token === '\\') {
      const length = line.startsWith('\\verb', at) ? mathVerbLength(line.slice(at)) : 0
      at += length ? length - 1 : 1
    }
    else if (token === '{') braces++
    else if (token === '}' && braces) braces--
  }
  return -1
}

function closeRevealTag(markup: string): string {
  if (!markup.endsWith('/>')) return markup
  const tag = /^<([a-z][\w-]*)\b/i.exec(markup)?.[1]
  const component = /^(?:v-click(?:-gap|-hide|s)?|v-after|v-switch)$/i.test(tag ?? '')
  const directed = /^(?:article|aside|b|button|div|em|h[1-6]|li|p|section|span|strong|td|tr)$/i.test(tag ?? '')
    && /\sv-(?:click(?:-hide)?|after)[.\s=/]/.test(markup)
  return component || directed ? `${markup.slice(0, -2).trimEnd()}></${tag}>` : markup
}

export function splitSlots(source: string): Record<string, string> {
  const slots: Record<string, string> = Object.create(null)
  let name = 'default'
  let lines: string[] = []
  let fence = ''
  let raw = ''
  function save(): void {
    slots[name] = name in slots ? `${slots[name]}\n\n${lines.join('\n')}` : lines.join('\n')
  }
  for (const line of source.split('\n')) {
    const marker = fenceStart.exec(line)
    if (!raw && marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
    }
    if (!fence && !raw) {
      if (/^ {0,3}<!--/.test(line)) raw = 'comment'
      else raw = /^ {0,3}<(pre|code|script|style|textarea)(?:[\s>])/i.exec(line)?.[1].toLowerCase() ?? ''
    }
    const slot = !fence && !raw && slotMarker.exec(line)
    if (slot) {
      save()
      name = slot[1]
      lines = []
    }
    else lines.push(line)
    if (raw === 'comment' ? line.includes('-->') : raw && new RegExp(`</${raw}\\s*>`, 'i').test(line)) raw = ''
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
  registerFence?: (fence: MarkdownFence) => string | undefined
  nestedFences?: boolean
  codeGroups?: { nextId: () => string, comark: boolean }
}

export interface MarkdownFence {
  info: string
  length: number
  code?: CodeBlockInfo
  diagram?: { type: 'mermaid' | 'plantuml', options: Record<string, FenceScalar> }
}

interface GroupFence { opening: RegExpExecArray, start: number, end: number, label: string }

function readCodeGroup(lines: string[], start: number, terminator: RegExp): { end: number, tabs: GroupFence[] } | undefined {
  const tabs: GroupFence[] = []
  for (let at = start + 1; at < lines.length; at++) {
    if (!lines[at].trim()) continue
    if (terminator.test(lines[at])) return tabs.length ? { end: at, tabs } : undefined
    const opening = fenceStart.exec(lines[at])
    const info = opening && parseCodeInfo(opening[2])
    if (!opening || !info || tabs.length >= 100) return
    const start = at
    const marker = opening[1]
    for (at++; at < lines.length; at++) {
      const close = fenceStart.exec(lines[at])
      if (close && close[1][0] === marker[0] && close[1].length >= marker.length && !close[2].trim()) break
    }
    if (at === lines.length) return
    tabs.push({ opening, start, end: at, label: codeTabLabel(info) })
  }
}

function tabsMarkup(id: string, tabs: GroupFence[]): string {
  const buttons = tabs.map(({ label }, index) => `<button type="button" class="code-group-tab" role="tab" id="${id}-tab-${index}" aria-controls="${id}-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escapeHtml(label)}</button>`)
  return `<div class="code-group-tabs" role="tablist" aria-label="Code examples">${buttons.join('')}</div>`
}

export function prepareMarkdown(source: string, syntax: MarkdownSyntax = {}): PreparedMarkdown {
  if (!source.includes('$') && !source.includes('\\(') && !source.includes('\\[') && !source.includes('\\begin{') && !source.includes('{monaco') && !source.includes('{live') && !source.includes('mermaid') && !source.includes('v-click') && !source.includes('v-after') && !source.includes('```') && !source.includes('~~~')) {
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
        const chunk = protectedHtml.exec(line.slice(at))?.[0] ?? htmlTag.exec(line.slice(at))?.[0]
        if (chunk) { result += closeRevealTag(chunk); at += chunk.length; continue }
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
  function renderFenceStart(line: string, opening: RegExpExecArray): string {
    const [, marker, info] = opening
    const prefix = line.slice(0, line.indexOf(marker)) + marker
    const [, type, diagramInfo] = /^\s*(mermaid|plantuml)\s+(\{.*\})\s*$/i.exec(info) ?? []
    const diagram = diagramInfo && readFenceOptions(diagramInfo)
    const registered = syntax.registerFence?.({
      info,
      length: marker.length,
      code: diagram ? undefined : decoratedCode(info),
      diagram: diagram ? { type: type.toLowerCase() as 'mermaid' | 'plantuml', options: diagram } : undefined,
    })
    return registered ? prefix + registered : line
  }
  let fence = ''
  let fenceQuotes = 0
  let htmlCode = ''
  let comment = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const quote = syntax.nestedFences ? quotePrefix.exec(line)?.[0] ?? '' : ''
    const depth = quote ? quote.split('>').length - 1 : 0
    if (fenceQuotes > depth) { fence = ''; fenceQuotes = 0 }
    const opening = fenceStart.exec(line.slice(quote.length))
    if (!fence && !htmlCode && (comment || /^ {0,3}<!--/.test(line))) {
      comment = !line.includes('-->')
      output.push(line)
      continue
    }
    if (fence) {
      if (opening && depth === fenceQuotes && opening[1][0] === fence[0] && opening[1].length >= fence.length && !opening[2].trim()) {
        fence = ''
        fenceQuotes = 0
      }
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
      fenceQuotes = depth
      output.push(renderFenceStart(line, opening))
      continue
    }
    if (syntax.codeGroups) {
      const component = /^ {0,3}<CodeGroup\s*>\s*$/.test(line)
      const hasGroup = component || (syntax.codeGroups.comark && /^ {0,3}::code-group\s*$/.test(line))
      const group = hasGroup && readCodeGroup(lines, index, component ? /^ {0,3}<\/CodeGroup\s*>\s*$/ : /^ {0,3}::\s*$/)
      if (group) {
        const id = syntax.codeGroups.nextId()
        output.push('', `<div class="code-group" data-code-group="${id}">`, tabsMarkup(id, group.tabs), '')
        for (const [tab, panel] of group.tabs.entries()) {
          output.push(`<div class="code-group-panel" role="tabpanel" id="${id}-panel-${tab}" aria-labelledby="${id}-tab-${tab}" tabindex="0"${tab ? ' hidden' : ''}>`, '')
          output.push(renderFenceStart(lines[panel.start], panel.opening), ...lines.slice(panel.start + 1, panel.end + 1), '', '</div>', '')
        }
        output.push('</div>', '')
        index = group.end
        continue
      }
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

/** Decorate GFM blockquote alerts after Markdown escapes literal examples. */
export function renderAlerts(html: string): string {
  return html.replace(/<blockquote>\n<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*\n|(?=<\/p>))/gi, (_, label: string) => {
    const kind = label.toLowerCase()
    const title = kind[0].toUpperCase() + kind.slice(1)
    return `<blockquote class="markdown-alert markdown-alert-${kind}"><p class="markdown-alert-title">${title}</p><p>`
  })
}
