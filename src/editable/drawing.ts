import { escapeHtml } from '../html.ts'
import type { Border, IrBox, IrRun, IrText, Rect, Rgba, SlideIr } from './ir.ts'
import { EMU_PER_PX, PT_PER_PX } from './ir.ts'

export function xml(text: string): string {
  // eslint-disable-next-line no-control-regex
  return escapeHtml(text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, ''))
}

export function extents(width: number, height: number, x = 0, y = 0): string {
  return `<a:xfrm><a:off x="${Math.round(x * EMU_PER_PX)}" y="${Math.round(y * EMU_PER_PX)}"/><a:ext cx="${Math.round(width * EMU_PER_PX)}" cy="${Math.round(height * EMU_PER_PX)}"/></a:xfrm>`
}

function rgb(color: Rgba): string {
  const hex = [color.r, color.g, color.b].map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('').toUpperCase()
  const alpha = color.a < 1 ? `<a:alpha val="${Math.round(Math.max(0, color.a) * 100000)}"/>` : ''
  return `<a:srgbClr val="${hex}">${alpha}</a:srgbClr>`
}

function fill(color?: Rgba): string {
  return color ? `<a:solidFill>${rgb(color)}</a:solidFill>` : '<a:noFill/>'
}

function line(border?: Border): string {
  if (!border) return '<a:ln><a:noFill/></a:ln>'
  const dash = { solid: 'solid', dotted: 'sysDot', dashed: 'dash' }[border.style]
  return `<a:ln w="${Math.round(border.width * EMU_PER_PX)}">${fill(border.color)}<a:prstDash val="${dash}"/></a:ln>`
}

function transform(rect: Rect): string {
  return extents(rect.w, rect.h, rect.x, rect.y)
}

function rectShape(radius: number, rect: Rect): string {
  const adjustment = Math.round(Math.min(0.5, radius / Math.max(1, Math.min(rect.w, rect.h))) * 100000)
  return adjustment
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjustment}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
}

function shape(id: number, name: string, properties: string, body = ''): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr${body ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${properties}</p:spPr>${body}</p:sp>`
}

function drawBox(box: IrBox, nextId: () => number): string {
  const borders = box.borders ?? []
  const first = borders[0]
  const uniform = first && borders.length === 4 && borders.every(border =>
    border?.width === first.width && border.style === first.style && rgb(border.color) === rgb(first.color))
  const { x, y, w, h } = box.rect
  let result = ''
  if (box.fill || uniform || box.shadow) {
    const shadow = box.shadow
    const effects = shadow ? `<a:effectLst><a:outerShdw blurRad="${Math.round(shadow.blur * EMU_PER_PX)}" dist="${Math.round(shadow.offset * EMU_PER_PX)}" dir="${Math.round((shadow.angle + 360) % 360 * 60000)}">${rgb(shadow.color)}</a:outerShdw></a:effectLst>` : ''
    result += shape(nextId(), 'Box', transform(box.rect) + rectShape(box.radius ?? 0, box.rect) + fill(box.fill) + line(uniform ? first : undefined) + effects)
  }
  if (!uniform) {
    borders.forEach((border, side) => {
      if (!border) return
      const horizontal = side % 2 === 0
      const thickness = Math.min(border.width, horizontal ? h : w)
      const edge = {
        x: side === 1 ? x + w - thickness : x,
        y: side === 2 ? y + h - thickness : y,
        w: horizontal ? w : thickness,
        h: horizontal ? thickness : h,
      }
      if (border.style === 'solid') {
        result += shape(nextId(), 'Border', transform(edge) + rectShape(0, edge) + fill(border.color) + line())
      }
      else {
        const stroke = horizontal ? extents(edge.w, 0, edge.x, edge.y + thickness / 2)
          : extents(0, edge.h, edge.x + thickness / 2, edge.y)
        result += shape(nextId(), 'Border', `${stroke}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${line(border)}`)
      }
    })
  }
  return result
}

function drawRun(run: IrRun, value: string, hyperlink: (href: string) => string | undefined, besideArtwork: boolean): string {
  const linked = run.link ? hyperlink(run.link) : undefined
  const link = linked ? `<a:hlinkClick r:id="${linked}"/>` : ''
  const font = xml(run.fontFamily)
  const underline = run.underline ? run.underlineStyle ?? 'sng' : 'none'
  // A small allowance for Office font substitution keeps positioned artwork
  // from crowding the text immediately alongside it.
  const fontSize = run.fontSize * (besideArtwork ? 0.96 : 1)
  const size = Math.max(100, Math.min(400000, Math.round(fontSize * PT_PER_PX * 100)))
  const tracking = run.letterSpacing
  // DrawingML's kern value is the minimum size for kerning, in hundredths of a point.
  const spacing = tracking
    ? ` spc="${Math.max(-400000, Math.min(400000, Math.round(tracking * PT_PER_PX * 100)))}" kern="${Math.min(400000, size + 1)}"`
    : ''
  return `<a:r><a:rPr sz="${size}" b="${Number(Boolean(run.bold))}" i="${Number(Boolean(run.italic))}" u="${underline === 'dotted' ? 'dotted' : underline}" strike="${run.strike ? 'sngStrike' : 'noStrike'}"${spacing}>${run.color ? fill(run.color) : ''}<a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/>${link}</a:rPr><a:t xml:space="preserve">${xml(value)}</a:t></a:r>`
}

function drawText(node: IrText, id: number, hyperlink: (href: string) => string | undefined): string {
  const singleLine = node.lineCount === 1
  const slack = node.valign === 'middle' || node.besideArtwork ? 0 : singleLine ? 12 : 2
  const x = node.rect.x - (node.align === 'center' ? slack / 2 : node.align === 'right' ? slack : 0)
  const align = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[node.align]
  const spacing = singleLine ? '' : `<a:lnSpc><a:spcPts val="${Math.max(0, Math.min(158400, Math.round(node.lineHeight * PT_PER_PX * 100)))}"/></a:lnSpc>`
  const paragraph = `<a:p><a:pPr algn="${align}">${spacing}</a:pPr>`
  let paragraphs = paragraph
  for (const run of node.runs) {
    if (run.breakBefore) paragraphs += '<a:br/>'
    paragraphs += run.text.split(/\r?\n/).map(text => drawRun(run, text, hyperlink, Boolean(node.besideArtwork))).join('<a:br/>')
    if (run.endsParagraph) paragraphs += `</a:p>${paragraph}`
  }
  paragraphs = paragraphs.endsWith(paragraph) && paragraphs !== paragraph
    ? paragraphs.slice(0, -paragraph.length)
    : `${paragraphs}</a:p>`
  const body = `<p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" wrap="${singleLine ? 'none' : 'square'}" anchor="${node.valign === 'middle' ? 'ctr' : 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`
  return shape(id, 'Text', extents(node.rect.w + slack, node.rect.h, x, node.rect.y) + rectShape(0, node.rect) + fill() + line(), body)
}

export function embeddedPicture(id: number, relationship: string, rect: Rect, label: string, link?: string): string {
  const title = xml(label)
  const click = link ? `<a:hlinkClick r:id="${link}"/>` : ''
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${title}" descr="${title}">${click}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(rect)}${rectShape(0, rect)}</p:spPr></p:pic>`
}

export function drawEditable(
  slide: SlideIr,
  image: (png: string) => string,
  hyperlink: (href: string) => string | undefined,
): { background: string, shapes: string } {
  let id = 1
  const next = () => ++id
  const shapes = slide.nodes.map((node) => {
    if (node.kind === 'box') return drawBox(node, next)
    if (node.kind === 'text') return drawText(node, next(), hyperlink)
    const label = node.kind === 'image' ? node.alt ?? 'Image' : `Picture of ${node.reason}`
    return embeddedPicture(next(), image(node.data), node.rect, label, node.kind === 'image' && node.link ? hyperlink(node.link) : undefined)
  }).join('')
  const background = slide.background ? `<p:bg><p:bgPr>${fill(slide.background)}<a:effectLst/></p:bgPr></p:bg>` : ''
  return { background, shapes }
}
