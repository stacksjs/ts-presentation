import { color } from 'ts-charts/color'
import { hierarchy, tree } from 'ts-charts/hierarchy'
import { diagramOptionsRecord } from './diagram-options.ts'
import { escapeHtml, unescapeHtml } from './html.ts'
import { diagramFontFamily, diagramPixels } from './mermaid/chronology.ts'
import { gitGraphPreset } from './mermaid/gitgraph-themes.ts'

type Shape = 'default' | 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon'
const shapes = new Set<unknown>(['default', 'square', 'rounded', 'circle', 'bang', 'cloud', 'hexagon'])
const palette = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#cffafe', '#ffedd5', '#e0e7ff']
const fontSize = 16
const lineHeight = 20
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

interface Run {
  text: string
  bold?: boolean
  italic?: boolean
}
interface Node {
  id: string
  label: string
  shape: Shape
  classes: string
  icon: string
  children: Node[]
  branch: number
  lines: Run[][]
  width: number
  height: number
}
interface Position { x: number, y: number, depth: number, side: number }

function classes(value: unknown): string {
  return typeof value === 'string' ? value.split(/\s+/).filter(part => /^[-\w]+$/.test(part)).slice(0, 16).join(' ') : ''
}

function pixels(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = diagramPixels(value)
  return parsed !== undefined && Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function paint(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length <= 120) return color(value)?.formatRgb()
}

function textWidth(text: string): number {
  let size = 0
  for (const char of text) {
    if (/\p{Mark}/u.test(char)) continue
    if (/\p{Extended_Pictographic}|\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(char)) size += 1.15
    else if (/[ilI.,:;'!| ]/.test(char)) size += 0.42
    else if (/[MW@%]/.test(char)) size += 0.99
    else size += 0.67
  }
  return size * fontSize
}

function labelRuns(text: string, markdown: boolean): Run[] {
  if (!markdown) return [{ text }]
  const rendered = Bun.markdown.html(text, { noHtmlBlocks: true, noHtmlSpans: true })
  const runs: Run[] = []
  let bold = 0
  let italic = 0
  for (const token of rendered.trim().split(/(<[^>]*>)/).filter(Boolean)) {
    if (token === '<strong>') bold++
    else if (token === '</strong>') bold--
    else if (token === '<em>') italic++
    else if (token === '</em>') italic--
    else if (/^(?:<\/p>|<br\s*\/?>)$/.test(token)) runs.push({ text: '\n' })
    else if (!token.startsWith('<')) runs.push({ text: unescapeHtml(token), bold: bold > 0, italic: italic > 0 })
  }
  if (runs.at(-1)?.text === '\n') runs.pop()
  return runs
}

function labelLines(text: string, markdown: boolean, maxWidth: number): Run[][] {
  const lines: Run[][] = [[]]
  let width = 0
  function newline() {
    lines.push([])
    width = 0
  }
  function append(content: string, size: number, run: Run) {
    const line = lines.at(-1)!
    const last = line.at(-1)
    if (last && last.bold === run.bold && last.italic === run.italic) last.text += content
    else line.push({ ...run, text: content })
    width += size
  }
  for (const run of labelRuns(text.replace(/<br\s*\/?>/gi, '\n'), markdown)) {
    for (const part of run.text.split(/(\n|[^\S\n]+)/u).filter(Boolean)) {
      if (part === '\n') {
        newline()
        continue
      }
      const space = /^\s+$/.test(part)
      const content = space ? ' ' : part
      const size = textWidth(content)
      if (!space && width > 0 && width + size > maxWidth) newline()
      if (space && (!width || width + size > maxWidth)) continue
      if (size <= maxWidth) append(content, size, run)
      else {
        for (const { segment } of graphemes.segment(content)) {
          const segmentWidth = textWidth(segment)
          if (width > 0 && width + segmentWidth > maxWidth) newline()
          append(segment, segmentWidth, run)
        }
      }
    }
  }
  for (const line of lines) {
    const last = line.at(-1)
    if (last) last.text = last.text.trimEnd()
  }
  return lines
}

function readTree(input: unknown, wrapWidth: number): Node {
  let count = 0
  const ids = new Set<string>()
  function read(value: unknown, depth: number, branch: number): Node {
    const original = typeof value === 'string' ? { label: value } : diagramOptionsRecord(value)
    if (!original || depth > 32 || ++count > 300 || typeof original.label !== 'string'
      || !original.label.trim() || original.label.length > 1600)
      throw new Error('Invalid mind map node')
    const id = typeof original.id === 'string' && original.id.trim() ? original.id : `mindmap-node-${count}`
    if (ids.has(id)) throw new Error('Duplicate mind map node ID')
    ids.add(id)
    const shape = shapes.has(original.shape) ? original.shape as Shape : 'default'
    const lines = labelLines(original.label, original.markdown === true, wrapWidth)
    const labelWidth = Math.max(...lines.map(line => textWidth(line.map(run => run.text).join(''))))
    const icon = classes(original.icon)
    const children = original.children
    if (children !== undefined && !Array.isArray(children)) throw new Error('Invalid mind map children')
    const inset = shape === 'hexagon' || shape === 'bang' || shape === 'cloud' ? 56 : 26
    let width = Math.max(48, Math.ceil(labelWidth + inset))
    let height = Math.max(38, lines.length * lineHeight + 14 + (icon ? 20 : 0))
    if (shape === 'circle') width = height = Math.ceil(Math.hypot(width, height))
    return {
      id, label: original.label, shape, classes: classes(original.classes), icon, branch, lines, width, height,
      children: (children ?? []).map((child, index) => read(child, depth + 1, depth === 0 ? index + 1 : branch)),
    }
  }
  return read(input, 0, 0)
}

function place(root: Node, tidy: boolean, acrossGap: number, levelGap: number): Map<Node, Position> {
  const positions = new Map<Node, Position>()
  const across = (node: Node) => tidy ? node.width : node.height
  const along = (node: Node) => tidy ? node.height : node.width
  const layout = tree<Node>().nodeSize([1, 1]).separation((a, b) =>
    (across(a.data) + across(b.data)) / 2 + acrossGap * (a.parent === b.parent ? 1 : 1.5))
  function arrange(children: Node[], side: number) {
    const sorted = layout(hierarchy(root, node => node === root ? children : node.children))
    const levels: number[] = []
    for (const node of sorted.descendants()) levels[node.depth] = Math.max(levels[node.depth] ?? 0, along(node.data))
    const column = [0]
    for (let i = 1; i < levels.length; i++) column.push(column[i - 1] + (levels[i - 1] + levels[i]) / 2 + levelGap)
    for (const node of sorted.descendants()) {
      const x = tidy ? node.x! : side * column[node.depth]
      const y = tidy ? column[node.depth] : node.x!
      positions.set(node.data, { x, y, depth: node.depth, side })
    }
  }
  if (tidy) arrange(root.children, 1)
  else {
    const sides: [Node[], Node[]] = [[], []]
    const weights = [0, 0]
    const leaves = (node: Node): number => node.children.length ? node.children.reduce((sum, child) => sum + leaves(child), 0) : node.height
    for (const child of root.children) {
      const index = weights[0] <= weights[1] ? 0 : 1
      sides[index].push(child)
      weights[index] += leaves(child)
    }
    if (sides[1].length) arrange(sides[1], -1)
    arrange(sides[0], 1)
  }
  return positions
}

function outline(node: Node, fill: string, stroke: string): string {
  const { width: w, height: h, shape } = node
  const style = `style="fill:${fill};stroke:${stroke};stroke-width:1.5;stroke-linejoin:round"`
  if (shape === 'circle') return `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" ${style}/>`
  if (shape === 'cloud') {
    const d = [
      `M 14 ${h * .65}`,
      `C -3 ${h * .65} 0 ${h * .22} 20 ${h * .25}`,
      `C 26 -1 ${w * .44} -1 ${w * .5} ${h * .19}`,
      `C ${w * .6} -1 ${w - 20} -1 ${w - 16} ${h * .28}`,
      `C ${w} ${h * .25} ${w} ${h * .77} ${w - 15} ${h * .8}`,
      `C ${w - 22} ${h} ${w * .64} ${h} ${w * .52} ${h * .91}`,
      `C ${w * .4} ${h} 17 ${h} 14 ${h * .65} Z`,
    ].join(' ')
    return `<path d="${d}" ${style}/>`
  }
  if (shape === 'bang' || shape === 'hexagon') {
    const points = shape === 'hexagon'
      ? [[0, h / 2], [14, 0], [w - 14, 0], [w, h / 2], [w - 14, h], [14, h]]
      : [[0, h / 2], [12, h * .35], [7, 2], [w * .33, 6], [w * .5, 0], [w * .67, 6], [w - 7, 2], [w - 12, h * .35], [w, h / 2], [w - 12, h * .65], [w - 7, h - 2], [w * .67, h - 6], [w * .5, h], [w * .33, h - 6], [7, h - 2], [12, h * .65]]
    return `<polygon points="${points.map(point => point.join(',')).join(' ')}" ${style}/>`
  }
  const radius = shape === 'square' ? 0 : shape === 'rounded' ? 8 : 13
  return `<rect width="${w}" height="${h}" rx="${radius}" ${style}/>`
}

function label(node: Node, ink: string): string {
  const center = node.width / 2
  const offset = (node.height - node.lines.length * lineHeight) / 2 + (node.icon ? 10 : 0)
  const icon = node.icon ? `<foreignObject data-mindmap-icon="" overflow="hidden" x="0" y="${offset - 20}" width="${node.width}" height="20">
    <div xmlns="http://www.w3.org/1999/xhtml" style="display:grid;place-items:center;height:20px;color:${ink};font-size:16px;line-height:1">
      <i class="mindmap-icon ${node.icon}" aria-hidden="true"></i>
    </div>
  </foreignObject>` : ''
  return icon + node.lines.map((line, index) => {
    if (!line.length) return ''
    const content = line.map(run => {
      const text = escapeHtml(run.text)
      if (!run.bold && !run.italic) return text
      return `<tspan${run.bold ? ' font-weight="bold"' : ''}${run.italic ? ' font-style="italic"' : ''}>${text}</tspan>`
    }).join('')
    return `<text class="mindmap-label" x="${center}" y="${offset + index * lineHeight + 15}" text-anchor="middle" xml:space="preserve" style="fill:${ink};font-size:${fontSize}px">${content}</text>`
  }).join('')
}

export function mindmapSvg(options: Readonly<Record<string, unknown>>): string {
  const root = readTree(options.root, pixels(options.maxNodeWidth, 214, 80, 640))
  const tidy = options.layout === 'tidy-tree'
  const positions = place(root, tidy, pixels(options.nodeSpacing, 18, 6, 100), pixels(options.levelSpacing, 36, 12, 180))
  const padding = pixels(options.padding, 20, 10, 160)
  const variables = diagramOptionsRecord(options.themeVariables)
  const theme = gitGraphPreset(options.theme)
  const font = diagramFontFamily(options.fontFamily, variables?.fontFamily) ?? 'system-ui, sans-serif'
  const title = typeof options.title === 'string' ? options.title : ''
  const description = typeof options.description === 'string' ? options.description : ''
  const uid = `tp-mindmap-${String(options.idPrefix ?? 'diagram').replace(/[^\w-]/g, '-')}`
  const nodes = [...positions]
  const left = Math.min(...nodes.map(([node, point]) => point.x - node.width / 2)) - padding
  const top = Math.min(...nodes.map(([node, point]) => point.y - node.height / 2)) - padding - (title ? 28 : 0)
  const width = Math.ceil(Math.max(...nodes.map(([node, point]) => point.x + node.width / 2)) + padding - left)
  const svgWidth = Math.max(width, Math.ceil(textWidth(title) + 2 * padding))
  const height = Math.ceil(Math.max(...nodes.map(([node, point]) => point.y + node.height / 2)) + padding - top)
  const shiftX = (svgWidth - width) / 2 - left
  function colors(node: Node, point: Position) {
    const index = options.colorBy === 'depth' ? point.depth : node.branch
    const slot = index === 0 ? 0 : (index - 1) % 11 + 1
    const fill = paint(index === 0 ? variables?.git0 : variables?.[`cScale${slot}`])
      ?? (index === 0 ? theme?.branches[0] ?? '#e0e7ff' : theme?.branches[slot % theme.branches.length] ?? palette[(index - 1) % palette.length])
    const ink = paint(index === 0 ? variables?.gitBranchLabel0 ?? variables?.cScaleLabel0 : variables?.[`cScaleLabel${slot}`])
      ?? (index === 0 ? theme?.branchText[0] ?? '#172554' : theme?.branchText[slot % theme.branchText.length] ?? '#182237')
    const stroke = paint(variables?.nodeBorder) ?? color(fill)?.rgb().darker(.48).formatRgb() ?? fill
    return { fill, ink, stroke, slot }
  }
  const paths: string[] = []
  const groups: string[] = []
  for (const [node, point] of nodes) {
    const { fill, ink, stroke, slot } = colors(node, point)
    for (const child of node.children) {
      const next = positions.get(child)!
      const x1 = point.x
      const y1 = point.y
      const x2 = next.x
      const y2 = next.y
      let d: string
      if (tidy) {
        const start = y1 + node.height / 2
        const end = y2 - child.height / 2
        const mid = (start + end) / 2
        d = `M ${x1} ${start} C ${x1} ${mid} ${x2} ${mid} ${x2} ${end}`
      }
      else {
        const start = x1 + next.side * node.width / 2
        const end = x2 - next.side * child.width / 2
        const mid = (start + end) / 2
        d = `M ${start} ${y1} C ${mid} ${y1} ${mid} ${y2} ${end} ${y2}`
      }
      paths.push(`<path class="mindmap-edge" data-from="${escapeHtml(node.id)}" data-to="${escapeHtml(child.id)}" d="${d}" style="fill:none;stroke:${colors(child, next).stroke};stroke-width:2"/>`)
    }
    const extraClasses = node.classes ? ` ${node.classes}` : ''
    groups.push(`<g class="mindmap-node section-${slot}${extraClasses}" data-node-id="${escapeHtml(node.id)}" data-depth="${point.depth}" data-shape="${node.shape}" transform="translate(${point.x - node.width / 2} ${point.y - node.height / 2})">${outline(node, fill, stroke)}${label(node, ink)}</g>`)
  }
  const fixed = options.useMaxWidth === false ? ` width="${svgWidth}" height="${height}"` : ''
  const rootLabel = root.lines.map(line => line.map(run => run.text).join('')).join(' ').trim()
  const accessibleTitle = typeof options.accessibleTitle === 'string' && options.accessibleTitle || title || rootLabel || root.label
  const titleInk = paint(variables?.titleColor) ?? theme?.title ?? '#182237'
  const background = theme && theme.background !== '#ffffff' ? ` style="background-color:${theme.background}"` : ''
  const role = `aria-labelledby="${uid}-title"${description ? ` aria-describedby="${uid}-desc"` : ''}`
  const caption = title ? `<text class="diagram-title" x="${svgWidth / 2}" y="${padding + 4}" text-anchor="middle" style="fill:${titleInk};font-size:20px">${escapeHtml(title)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" data-diagram-kind="mindmap" data-layout="${tidy ? 'tidy-tree' : 'balanced'}" role="img" viewBox="0 0 ${svgWidth} ${height}"${fixed}${background} font-family="${escapeHtml(font)}" ${role}>
    <title id="${uid}-title">${escapeHtml(accessibleTitle)}</title>
    ${description ? `<desc id="${uid}-desc">${escapeHtml(description)}</desc>` : ''}
    ${caption}<g transform="translate(${shiftX} ${-top})">${paths.join('')}${groups.join('')}</g></svg>`
}
