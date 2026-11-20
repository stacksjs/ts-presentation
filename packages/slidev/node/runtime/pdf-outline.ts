import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { createTocTree } from '../../../client/runtime/toc.ts'
import { plainMarkdown } from '../../../parser/src/plain-markdown.ts'
import type { TocItem } from '../../../types/src/toc.ts'

interface PdfBookmark {
  title: string
  page: number
  children: PdfBookmark[]
}

export function pdfBookmarks(routes: readonly SlideRoute[], positions: readonly { slide: number }[]): PdfBookmark[] {
  // A bookmark opens the last exported reveal, like Slidev's PDF outline.
  const pages = new Map(positions.map(({ slide }, index) => [slide, index]))
  function select(entries: readonly TocItem[]): PdfBookmark[] {
    return entries.flatMap((item) => {
      if (item.hideInToc) return []
      const page = pages.get(item.no)
      const children = select(item.children)
      return page !== undefined && item.title ? [{ title: item.title, page, children }] : children
    }).sort((a, b) => a.page - b.page)
  }
  const titled = routes.map(route => route.frontmatter.title || route.frontmatter.name
    ? { ...route, title: plainMarkdown(route.title) }
    : route)
  return select(createTocTree(titled))
}

const unsupported = 'Chrome returned a PDF structure that cannot be used for an outline'
const reference = (id: number) => `${id} 0 R`

/** Read the classic cross-reference table emitted by Chrome's print backend. */
function readPrintPdf(pdf: Buffer) {
  const footer = pdf.subarray(-1024).toString('latin1')
  const start = /\bstartxref\s+(\d+)\s+%%EOF\s*$/.exec(footer)
  const xref = Number(start?.[1])
  if (!Number.isSafeInteger(xref) || xref < 1 || xref >= pdf.length) throw new Error(unsupported)
  const tail = pdf.subarray(xref).toString('latin1')
  const section = /^xref\s+0\s+(\d+)[ \t]*\r?\n([\s\S]*?)\btrailer\s*<<(.*?)>>\s*startxref\b/s.exec(tail)
  if (!section) throw new Error(unsupported)
  const size = Number(section[1])
  const trailer = section[3]
  const root = Number(/\/Root\s+(\d+)\s+0\s+R\b/.exec(trailer)?.[1])
  const entries = section[2].trim().split(/\r?\n/)
  if (!Number.isSafeInteger(root) || root < 1 || root >= size || entries.length !== size
    || Number(/\/Size\s+(\d+)\b/.exec(trailer)?.[1]) !== size || /\/(?:Prev|XRefStm|Encrypt)\b/.test(trailer))
    throw new Error(unsupported)

  function dictionary(id: number): string {
    const offset = Number(/^(\d{10})\s+00000\s+n\s*$/.exec(entries[id] ?? '')?.[1])
    if (!Number.isSafeInteger(offset) || offset < 1 || offset >= xref) throw new Error(unsupported)
    const end = pdf.indexOf('\nendobj', offset, 'latin1')
    const value = end > offset && end < xref ? pdf.toString('latin1', offset, end) : ''
    const object = /^(\d+)\s+0\s+obj\s*(<<[\s\S]*>>)\s*$/.exec(value)
    if (!object || Number(object[1]) !== id) throw new Error(unsupported)
    return object[2]
  }

  const catalog = dictionary(root)
  const pageRoot = Number(/\/Pages\s+(\d+)\s+0\s+R\b/.exec(catalog)?.[1])
  if (!/\/Type\s+\/Catalog\b/.test(catalog) || /\/Outlines\b/.test(catalog) || !Number.isSafeInteger(pageRoot))
    throw new Error(unsupported)
  const pageIds: number[] = []
  const pending = [pageRoot]
  const seen = new Set<number>()
  while (pending.length) {
    const id = pending.pop()!
    if (seen.has(id)) throw new Error(unsupported)
    seen.add(id)
    const node = dictionary(id)
    if (/\/Type\s+\/Page\b/.test(node)) pageIds.push(id)
    else {
      const children = /\/Kids\s*\[([^\]]*)\]/.exec(node)?.[1].trim()
      if (!children || !/^(?:\d+\s+0\s+R\s*)+$/.test(children) || !/\/Type\s+\/Pages\b/.test(node))
        throw new Error(unsupported)
      const ids = Array.from(children.matchAll(/(\d+)\s+0\s+R/g), ([, child]) => Number(child))
      pending.push(...ids.reverse())
    }
  }
  return { xref, trailer, size, root, catalog, pageIds }
}

/** Append an incremental PDF update, preserving page streams, tags, and destinations. */
export function addPdfOutline(pdf: Buffer<ArrayBuffer>, bookmarks: readonly PdfBookmark[], pageCount: number): Buffer<ArrayBuffer> {
  if (!bookmarks.length) return pdf
  const { xref, trailer, size, root, catalog, pageIds } = readPrintPdf(pdf)
  if (pageIds.length !== pageCount) throw new Error(`Chrome printed ${pageIds.length} pages for ${pageCount} slide frames`)

  const objects = new Map<number, string>()
  let nextId = size + 1
  function writeLevel(entries: readonly PdfBookmark[], parent: number): string {
    const ids = entries.map(() => nextId++)
    const firstChild = nextId
    for (const [index, entry] of entries.entries()) {
      const id = ids[index]
      const title = Buffer.from(`\uFEFF${entry.title}`, 'utf16le').swap16().toString('hex')
      const page = pageIds[entry.page]
      if (page === undefined) throw new Error(unsupported)
      const previous = index > 0 ? ` /Prev ${reference(ids[index - 1])}` : ''
      const next = index + 1 < ids.length ? ` /Next ${reference(ids[index + 1])}` : ''
      const children = entry.children.length ? writeLevel(entry.children, id) : ''
      objects.set(id, `<< /Title <${title}> /Parent ${reference(parent)} /Dest [${reference(page)} /Fit]${previous}${next}${children} >>`)
    }
    return ` /First ${reference(ids[0])} /Last ${reference(ids.at(-1)!)} /Count ${entries.length + nextId - firstChild}`
  }
  objects.set(size, `<< /Type /Outlines${writeLevel(bookmarks, size)} >>`)
  objects.set(root, catalog.slice(0, -2) + `\n/Outlines ${reference(size)}>>`)

  const update = ['\n']
  const offsets = new Map<number, number>()
  let length = pdf.length + 1
  for (const id of [root, ...Array.from({ length: nextId - size }, (_, index) => size + index)]) {
    offsets.set(id, length)
    const object = `${id} 0 obj\n${objects.get(id)}\nendobj\n`
    update.push(object)
    length += object.length
  }
  const entry = (id: number) => `${String(offsets.get(id)).padStart(10, '0')} 00000 n \n`
  update.push(`xref\n0 1\n0000000000 65535 f \n${root} 1\n`, entry(root), `${size} ${nextId - size}\n`)
  for (let id = size; id < nextId; id++) update.push(entry(id))
  update.push(`trailer\n<<${trailer.replace(/\/Size\s+\d+\b/, `/Size ${nextId}`)}\n/Prev ${xref}>>\nstartxref\n${length}\n%%EOF\n`)
  return Buffer.concat([pdf, Buffer.from(update.join(''), 'latin1')])
}
