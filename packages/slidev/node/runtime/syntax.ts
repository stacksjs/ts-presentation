import { mathVerbLength, renderMath } from './math.ts'
import type { EquationOptions } from '../../../client/runtime/equation-steps.ts'
import { parseEquationOptions } from '../../../client/runtime/equation-steps.ts'
import type { MermaidOptions } from './authoring-setup.ts'
import { parseDiagramOptions } from './diagram-options.ts'
import { readFenceOptions } from './fence-options.ts'
import type { CodeBlockInfo } from './code-blocks.ts'
import { codeTabLabel, decoratedCode, parseCodeInfo } from './code-blocks.ts'
import { escapeHtml } from './html.ts'
import type { FenceOpening } from '../../../parser/src/markdown-fences.ts'
import { isFenceClose, MarkdownFenceReader, readFenceOpening } from '../../../parser/src/markdown-fences.ts'
import { createComarkAttributes, readComarkAttributes } from './comark.ts'

const inlineCode = /^`+/
const protectedHtml = /^<(pre|code|script|style)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/i
const htmlTag = /^<(?:[^>"']|"[^"]*"|'[^']*')+>/
const slotMarker = /^::\s*([\w.:-]+?)\s*::\s*$/
const bareDisplay = /^ {0,3}\\begin\{((?:equation|align|alignat|flalign|xalignat|gather|multline)\*?|xxalignat|CD|subequations|spreadlines)\}/
const openSpreadlines = /^ {0,3}\\begin\{spreadlines\}[ \t]*\{/
const mathtoolsSettings = /^ {0,3}\\mathtoolsset[ \t]*\{/
const tagFormStart = /^ {0,3}\\(newtagform|renewtagform|usetagform)(?=[ \t{])/
const closeSpreadlines = /^ {0,3}\\end\{spreadlines\}[ \t]*(?:%.*)?$/

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

function tagFormLine(line: string): string | undefined {
  const opening = tagFormStart.exec(line)
  if (!opening) return
  let at = opening[0].length
  function nextArgument(open: string, close: string): boolean {
    while (line[at] === ' ' || line[at] === '\t') at++
    if (line[at] !== open) return false
    const end = inlineMathEnd(line, at + 1, close)
    if (end < 0) return false
    at = end + 1
    return true
  }
  if (!nextArgument('{', '}')) return
  if (opening[1] !== 'usetagform') {
    if (/^[ \t]*\[/.test(line.slice(at)) && !nextArgument('[', ']')) return
    if (!nextArgument('{', '}') || !nextArgument('{', '}')) return
  }
  if (/^[ \t]*(?:%.*)?$/.test(line.slice(at))) return line.slice(0, at)
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
  const fences = new MarkdownFenceReader()
  let raw = ''
  function save(): void {
    slots[name] = name in slots ? `${slots[name]}\n\n${lines.join('\n')}` : lines.join('\n')
  }
  for (const line of source.split('\n')) {
    const fenced = !raw && fences.read(line)
    if (!fenced && !raw) {
      if (/^ {0,3}<!--/.test(line)) raw = 'comment'
      else raw = /^ {0,3}<(pre|code|script|style|textarea)(?:[\s>])/i.exec(line)?.[1].toLowerCase() ?? ''
    }
    const slot = !fenced && !raw && slotMarker.exec(line)
    if (slot) {
      save()
      name = slot[1]
      lines = []
      fences.reset()
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
  comark?: boolean
  codeGroups?: { nextId: () => string }
}

export interface MarkdownFence {
  info: string
  length: number
  code?: CodeBlockInfo
  diagram?: { type: 'mermaid' | 'plantuml', options: MermaidOptions }
}

interface GroupFence { opening: FenceOpening, start: number, end: number, label: string }

function readCodeGroup(lines: string[], start: number, terminator: RegExp): { end: number, tabs: GroupFence[] } | undefined {
  const tabs: GroupFence[] = []
  for (let at = start + 1; at < lines.length; at++) {
    if (!lines[at].trim()) continue
    if (terminator.test(lines[at])) return tabs.length ? { end: at, tabs } : undefined
    const opening = readFenceOpening(lines[at])
    const info = opening && parseCodeInfo(opening.info)
    if (!opening || !info || tabs.length >= 100) return
    const start = at
    for (at++; at < lines.length; at++) {
      if (isFenceClose(lines[at], opening.marker)) break
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
  const attrs = syntax.comark && source.includes('{') ? createComarkAttributes() : undefined
  if (!attrs && !source.includes('$') && !source.includes('\\(') && !source.includes('\\[') && !source.includes('\\begin{') && !source.includes('\\mathtoolsset') && !source.includes('tagform') && !source.includes('\\ref') && !source.includes('\\eqref') && !source.includes('\\noeqref') && !source.includes('{monaco') && !source.includes('{live') && !source.includes('mermaid') && !source.includes('v-click') && !source.includes('v-after') && !source.includes('```') && !source.includes('~~~')) {
    return { source, restore: html => html }
  }

  const math: string[] = []
  const displayCommands: string[] = []
  const tagFormCommands: string[] = []
  const mathScopes: [number, number][] = []
  function registerMath(body: string, display: boolean, options?: EquationOptions): number {
    const commands = display ? displayCommands : tagFormCommands
    const formula = commands.length ? `${commands.join('\n')}\n${body.trim()}` : body.trim()
    const content = (syntax.renderMath ?? renderMath)(formula, display)
    const block = options
      ? `<div class="equation-steps" data-equation-steps="${options.ranges.join('|')}" data-equation-at="${options.at}" data-equation-first="${options.startLine}" data-equation-finally="${options.finally}">${content}</div>`
      : content
    return math.push(block) - 1
  }
  function marker(body: string): string {
    const index = registerMath(body, false)
    return `<tp-math data-equation="${index}"></tp-math>`
  }

  function inline(line: string, allowAttributes: boolean): string {
    let result = ''
    const brackets: { length: number, span: boolean }[] = []
    for (let at = 0; at < line.length;) {
      const char = line[at]
      if (char === '\\' && line[at + 1]) {
        if (syntax.mathEnabled !== false && (line[at + 1] === 'e' || line[at + 1] === 'r' || line[at + 1] === 'n')) {
          const reference = /^\\(?:(?:refeq|eqref|ref)\*?|noeqref)[ \t]*\{[^{}]+\}/.exec(line.slice(at))?.[0]
          if (reference) {
            result += marker(reference)
            at += reference.length
            continue
          }
        }
        if (syntax.mathEnabled !== false && line[at + 1] === '(') {
          const end = inlineMathEnd(line, at + 2, '\\)')
          if (end > at + 2) {
            result += marker(line.slice(at + 2, end))
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
          result += marker(line.slice(at + 1, end))
          at = end + 1
          continue
        }
      }
      if (attrs && allowAttributes) {
        if (char === '[') brackets.push({ length: result.length, span: line[at - 1] !== '!' && line[at - 1] !== ']' })
        if (char === ']') {
          const open = brackets.pop()
          const block = open?.span && readComarkAttributes(line, at + 1)
          if (block) {
            const tag = attrs.register({ kind: 'span', values: block.values, literal: line.slice(at + 1, block.end), adjacent: true })
            result = `${result.slice(0, open.length)}<${tag}>${result.slice(open.length + 1)}</${tag}>`
            at = block.end
            continue
          }
        }
        if (char === '{' && line[at - 1] !== '{' && result.trim()) {
          const block = readComarkAttributes(line, at)
          if (block && line[block.end] !== '}') {
            const tag = attrs.register({ kind: 'attach', values: block.values, literal: line.slice(at, block.end), adjacent: !/\s/.test(line[at - 1]) })
            result += `<${tag}></${tag}>`
            at = block.end
            continue
          }
        }
      }
      result += char
      at++
    }
    return result
  }

  const lines = source.split('\n')
  const output: string[] = []
  function renderFenceStart(line: string, opening: FenceOpening): string {
    const { marker, info, infoStart } = opening
    const [, type, diagramInfo] = /^\s*(mermaid|plantuml)\s+(\{.*\})\s*$/i.exec(info) ?? []
    const diagram = diagramInfo && (readFenceOptions(diagramInfo) ?? parseDiagramOptions(diagramInfo))
    const registered = syntax.registerFence?.({
      info,
      length: marker.length,
      code: diagram ? undefined : decoratedCode(info),
      diagram: diagram ? { type: type.toLowerCase() as 'mermaid' | 'plantuml', options: diagram } : undefined,
    })
    return registered ? line.slice(0, infoStart) + registered : line
  }
  const fences = new MarkdownFenceReader()
  let nestedMathFence: string | undefined
  function mathContinuation(at: number): string | undefined {
    if (at >= lines.length) return
    const next = fences.readContinuation(lines[at])
    if (next !== undefined && !readFenceOpening(next) && !/^ {0,3}<!--/.test(next)) return next
  }
  function displayMath(body: string, prefix: string, options?: EquationOptions): void {
    const index = registerMath(body, true, options)
    if (prefix) {
      // Let Bun place the block inside its Markdown container. A fenced block
      // can interrupt a paragraph without inserting blank lines into list items.
      nestedMathFence ??= `tp-equation-${Bun.randomUUIDv7()}`
      const continuation = fences.continuationPrefix
      output.push(`${prefix}~~~${nestedMathFence}`, continuation + index, `${continuation}~~~`)
    }
    else output.push('', `<tp-math data-equation="${index}"></tp-math>`, '')
    fences.endBlock()
  }
  let htmlCode = ''
  let comment = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if ((comment || htmlCode) && fences.readContinuation(line) === undefined) {
      comment = false
      htmlCode = ''
    }
    if (comment) {
      comment = !line.includes('-->')
      output.push(line)
      continue
    }
    if (htmlCode) {
      if (new RegExp(`</${htmlCode}\\s*>`, 'i').test(line)) htmlCode = ''
      output.push(line)
      continue
    }
    const fenced = fences.read(line)
    if (fenced) {
      output.push(fenced.kind === 'opening' ? renderFenceStart(line, fenced.opening) : line)
      continue
    }
    const { content, prefix } = fences.block
    if (/^ {0,3}<!--/.test(content)) {
      comment = !line.includes('-->')
      output.push(line)
      continue
    }
    if (syntax.codeGroups) {
      const component = /^ {0,3}<CodeGroup\s*>\s*$/.test(line)
      const hasGroup = component || (syntax.comark && /^ {0,3}::code-group\s*$/.test(line))
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
    const rawCode = /^ {0,3}<(pre|code|script|style)(?:>|\s)/i.exec(content)
    if (rawCode && !new RegExp(`</${rawCode[1]}\\s*>`, 'i').test(content)) {
      htmlCode = rawCode[1]
      output.push(line)
      continue
    }
    if (syntax.mathEnabled !== false && !prefix) {
      const spreadlines = openSpreadlines.exec(content)?.[0]
      const opening = spreadlines ?? mathtoolsSettings.exec(content)?.[0]
      if (opening) {
        const end = inlineMathEnd(content, opening.length, '}')
        if (end >= 0 && /^[ \t]*(?:%.*)?$/.test(content.slice(end + 1))) {
          if (spreadlines) {
            mathScopes.push([displayCommands.length, tagFormCommands.length])
            displayCommands.push(`\\setlength\\jot${content.slice(opening.length - 1, end + 1)}`)
          }
          else displayCommands.push(content.slice(0, end + 1))
          output.push('')
          continue
        }
      }
      if (mathScopes.length && closeSpreadlines.test(content)) {
        const [displayLength, formLength] = mathScopes.pop()!
        displayCommands.length = displayLength
        tagFormCommands.length = formLength
        output.push('')
        continue
      }
      const form = tagFormLine(content)
      if (form !== undefined) {
        displayCommands.push(form)
        tagFormCommands.push(form)
        output.push('')
        continue
      }
    }
    const environment = syntax.mathEnabled !== false && bareDisplay.exec(content)
    if (environment) {
      const name = environment[1]
      const group = name === 'subequations' || name === 'spreadlines'
      const closing = `\\end{${name}}`
      const body = [content]
      let end = index
      while (!body.at(-1)!.trimEnd().endsWith(closing)) {
        const next = mathContinuation(++end)
        if (next === undefined || (!group && bareDisplay.test(next))) break
        body.push(next)
      }
      if (body.at(-1)!.trimEnd().endsWith(closing)) {
        displayMath(body.join('\n'), prefix)
        index = end
        continue
      }
    }
    const display = syntax.mathEnabled !== false && /^ {0,3}(\$\$|\\\[)(.*)$/.exec(content)
    if (display) {
      const delimiter = display[1] === '$$' ? '$$' : '\\]'
      const single = display[2].trimEnd()
      if (single.endsWith(delimiter) && single.trim().length > 2) {
        displayMath(single.slice(0, -2), prefix)
        continue
      }
      const options = parseEquationOptions(display[2])
      const body = [options ? '' : display[2]]
      let closed = false
      let end = index
      for (let next = mathContinuation(++end); next !== undefined; next = mathContinuation(++end)) {
        const trimmed = next.trimEnd()
        closed = trimmed.endsWith(delimiter)
        body.push(closed ? trimmed.slice(0, -2) : next)
        if (closed) break
      }
      const formula = closed ? body.join('\n').trim() : ''
      if (formula) {
        displayMath(formula, prefix, options)
        index = end
        continue
      }
    }
    output.push(inline(line, !/^(?: {4}| *\t)/.test(content)))
  }

  return {
    source: output.join('\n'),
    restore(html) {
      if (nestedMathFence) {
        const blocks = new RegExp(`<pre><code class="language-${nestedMathFence}">(\\d+)\\n</code></pre>`, 'g')
        html = html.replace(blocks, (whole, index: string) => math[Number(index)] ?? whole)
      }
      return (attrs ? attrs.restore(html) : html)
        .replace(/<p>(<tp-math data-equation="\d+"><\/tp-math>)<\/p>/g, (whole, placeholder) => {
          const index = Number(/\d+/.exec(placeholder)?.[0])
          return /^<(?:div class="(?:equation-steps|math-subequations|math-spreadlines|math-short-display)"|math [^>]* display="block"|mrow data-pending-equation-pin=)/.test(math[index] ?? '') ? placeholder : whole
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
