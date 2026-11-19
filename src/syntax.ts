import { renderMath } from './math.ts'

const fenceStart = /^ {0,3}(`{3,}|~{3,})(.*)$/
const inlineCode = /^`+/
const protectedHtml = /^<(pre|code|script|style)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/i
const runnerOptions = /^(\s*)(js|javascript|ts|typescript)(\s+)\{(monaco-run|monaco|live-run|live)\}(\s*)$/i
const slotMarker = /^::([a-z][a-z0-9-]*)::\s*$/i

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

export function prepareMarkdown(source: string): PreparedMarkdown {
  if (!source.includes('$') && !source.includes('{monaco') && !source.includes('{live')) {
    return { source, restore: html => html }
  }

  const math: string[] = []
  const marker = (body: string, display: boolean) => {
    const index = math.push(renderMath(body.trim(), display)) - 1
    return `<tp-math data-equation="${index}"></tp-math>`
  }

  function inline(line: string): string {
    let result = ''
    for (let at = 0; at < line.length;) {
      const char = line[at]
      if (char === '\\' && line[at + 1]) {
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
      if (char === '$' && line[at + 1] && !/\s|\$/.test(line[at + 1]) && line[at - 1] !== '$') {
        let end = at + 1
        for (; end < line.length; end++) {
          if (line[end] === '\\') { end++; continue }
          if (line[end] === '$') break
        }
        if (end < line.length && !/\s/.test(line[end - 1]) && !/[\d$]/.test(line[end + 1] ?? '')) {
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
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const opening = fenceStart.exec(line)
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
      const options = runnerOptions.exec(opening[2])
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
    const display = /^ {0,3}\$\$(.*)$/.exec(line)
    if (display) {
      if (display[1].trimEnd().endsWith('$$') && display[1].trim().length > 2) {
        output.push('', marker(display[1].trimEnd().slice(0, -2), true), '')
        continue
      }
      if (!display[1].trim()) {
        const close = lines.findIndex((entry, at) => at > index && /^ {0,3}\$\$\s*$/.test(entry))
        if (close > index + 1) {
          output.push('', marker(lines.slice(index + 1, close).join('\n'), true), '')
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
          return math[index]?.includes(' display="block"') ? placeholder : whole
        })
        .replace(/<tp-math data-equation="(\d+)"><\/tp-math>/g, (whole, index: string) => math[Number(index)] ?? whole)
    },
  }
}
