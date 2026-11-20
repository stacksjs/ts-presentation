import { escapeHtml } from '../../slidev/node/runtime/html.ts'

interface DiffRow {
  before?: number
  after?: number
  unchanged: boolean
}

function compareLines(before: string[], after: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  let left = 0
  let right = 0
  let leftEnd = before.length
  let rightEnd = after.length
  while (left < leftEnd && right < rightEnd && before[left] === after[right])
    rows.push({ before: left++, after: right++, unchanged: true })

  while (left < leftEnd && right < rightEnd && before[leftEnd - 1] === after[rightEnd - 1]) {
    leftEnd--
    rightEnd--
  }

  function changed(upToLeft: number, upToRight: number): void {
    while (left < upToLeft || right < upToRight) {
      rows.push({
        before: left < upToLeft ? left++ : undefined,
        after: right < upToRight ? right++ : undefined,
        unchanged: false,
      })
    }
  }

  // Strip shared ends before allocating the longest common subsequence table.
  // A large changed region is still displayed as paired additions and deletions.
  const width = rightEnd - right + 1
  const cells = (leftEnd - left + 1) * width
  if (left < leftEnd && right < rightEnd && cells <= 250_000) {
    const startLeft = left
    const startRight = right
    const lengths = new Uint16Array(cells)
    const index = (l: number, r: number) => (l - startLeft) * width + r - startRight
    for (let l = leftEnd - 1; l >= left; l--) {
      for (let r = rightEnd - 1; r >= right; r--) {
        const position = index(l, r)
        lengths[position] = before[l] === after[r] ? lengths[position + width + 1] + 1
          : Math.max(lengths[position + width], lengths[position + 1])
      }
    }
    let l = left
    let r = right
    while (l < leftEnd && r < rightEnd) {
      const position = index(l, r)
      if (before[l] === after[r]) {
        changed(l, r)
        rows.push({ before: left++, after: right++, unchanged: true })
        l++
        r++
      }
      else if (lengths[position + width] >= lengths[position + 1]) l++
      else r++
    }
  }

  changed(leftEnd, rightEnd)
  while (left < before.length) rows.push({ before: left++, after: right++, unchanged: true })
  return rows
}

interface DiffMarkupOptions {
  numbers: boolean
  start: number
  highlightedBefore?: string[]
  highlightedAfter?: string[]
}

export function codeDiffRows(original: string, modified: string, options: DiffMarkupOptions): string {
  const before = original ? original.split(/\r?\n/) : []
  const after = modified ? modified.split(/\r?\n/) : []
  function cell(side: 'before' | 'after', line: number | undefined, unchanged: boolean): string {
    if (line === undefined) return '<div class="code-diff-line" data-diff-empty aria-hidden="true"></div>'
    const source = side === 'before' ? before : after
    const highlighted = side === 'before' ? options.highlightedBefore : options.highlightedAfter
    const text = highlighted?.[line] ?? escapeHtml(source[line])
    const number = options.numbers ? `<span class="code-diff-number">${line + options.start}</span>` : ''
    const mark = unchanged ? '' : side === 'before' ? '−' : '+'
    const status = unchanged ? '' : side === 'before' ? 'Removed line' : 'Added line'
    return `<div class="code-diff-line" data-diff-side="${side}"${status ? ` data-diff-changed` : ''}>${number}<span class="code-diff-sign"${status ? ` role="img" aria-label="${status}"` : ' aria-hidden="true"'}>${mark}</span><code class="code-diff-text">${text || '&#8203;'}</code></div>`
  }
  return compareLines(before, after).map(row =>
    cell('before', row.before, row.unchanged) + cell('after', row.after, row.unchanged)).join('')
}

const mounted = new WeakSet<HTMLElement>()

export function setupCodeDiffs(root: ParentNode = document): void {
  for (const fixture of root.querySelectorAll<HTMLElement>('[data-code-diff]')) {
    if (mounted.has(fixture)) continue
    const editor = fixture.querySelector<HTMLTextAreaElement>('[data-diff-editor]')
    const original = fixture.querySelector<HTMLTemplateElement>('[data-diff-original]')
    const rows = fixture.querySelector<HTMLElement>('[data-diff-rows]')
    if (!editor || !original || !rows) continue
    mounted.add(fixture)
    const before = original.content.textContent ?? ''
    const revised = editor.value
    const highlighted = [...rows.querySelectorAll('[data-diff-side="before"] .code-diff-text')].map(line => line.innerHTML)
    const initial = rows.innerHTML
    const options = { numbers: fixture.hasAttribute('data-diff-numbers'), start: Number(fixture.dataset.diffStart), highlightedBefore: highlighted }
    let pending = false
    function update(): void {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        const changes = editor!.value
        rows!.innerHTML = changes === revised ? initial : codeDiffRows(before, changes, options)
      })
    }
    editor.addEventListener('input', update)
    fixture.querySelector('[data-diff-reset]')?.addEventListener('click', () => {
      editor.value = revised
      update()
      editor.focus()
    })
  }
}
