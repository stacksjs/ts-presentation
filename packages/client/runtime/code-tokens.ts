import { tokenClass } from 'ts-syntax-highlighter/browser'
import type { TokenLine } from 'ts-syntax-highlighter'
import { escapeHtml } from '../../slidev/node/runtime/html.ts'

export function codeTokenMarkup(lines: TokenLine[]): string[] {
  return lines.map(line =>
    line.tokens.map(token => `<span class="tok-${tokenClass(token.type)}">${escapeHtml(token.content)}</span>`).join(''),
  )
}
