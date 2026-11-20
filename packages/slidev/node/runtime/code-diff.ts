import { codeDiffRows } from '../../../client/runtime/code-diff.ts'
import type { CodeBlockInfo, createCodeHighlighter } from './code-blocks.ts'
import { codeTitle } from './code-blocks.ts'
import { escapeHtml } from './html.ts'

export async function codeDiffBlock(
  source: string,
  info: CodeBlockInfo,
  lineNumbers: boolean,
  highlight: ReturnType<typeof createCodeHighlighter>,
): Promise<string | undefined> {
  const boundary = /^[ \t]*~~~[ \t]*(?:\r?\n|$)/m.exec(source)
  if (!boundary) return
  const original = source.slice(0, boundary.index).replace(/\r?\n$/, '')
  const modified = source.slice(boundary.index + boundary[0].length).replace(/\r?\n$/, '')
  const [highlightedBefore, highlightedAfter] = await Promise.all([highlight(original, info.language), highlight(modified, info.language)])
  const numbers = info.lines ?? lineNumbers
  const rows = codeDiffRows(original, modified, { numbers, start: info.start, highlightedBefore, highlightedAfter })
  const { height, readonly } = info.diffOptions ?? {}
  const styles = [
    height === 'auto' ? 'max-height:none' : height ? `height:${height};max-height:none` : '',
    info.maxHeight ? `max-height:${info.maxHeight}` : '',
  ].filter(Boolean).join(';')
  const style = styles ? ` style="${styles}"` : ''
  const caption = info.title ? `<figcaption>${escapeHtml(codeTitle(info.title))}</figcaption>` : ''
  // The newline after <textarea> is consumed by the HTML parser. Preserve
  // any leading blank line in the author's modified source.
  const edit = readonly ? '' : `<details class="code-diff-edit">
      <summary>Edit modified</summary>
      <textarea aria-label="Modified code" data-diff-editor wrap="off" spellcheck="false" autocapitalize="off" maxlength="64000">
${escapeHtml(modified)}</textarea>
      <button class="code-copy-action" type="button" data-diff-reset>Reset</button>
    </details>
    <template data-diff-original>${escapeHtml(original)}</template>`
  return `<figure class="code-diff" data-code-diff data-diff-start="${info.start}"${numbers ? ' data-diff-numbers' : ''}>
    ${caption}
    <div class="code-diff-scroll" role="region" aria-label="Code comparison" tabindex="0" data-presentation-shortcuts="ignore"${style}>
      <div class="code-diff-grid">
        <div class="code-diff-heading">Original</div>
        <div class="code-diff-heading">Modified</div>
        <div class="code-diff-rows" data-diff-rows>${rows}</div>
      </div>
    </div>
    ${edit}
  </figure>`
}
