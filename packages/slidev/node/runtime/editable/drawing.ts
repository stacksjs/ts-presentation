import { escapeHtml } from '../html.ts'
import type { Border, IrBox, IrEquation, IrImage, IrRaster, IrRun, IrText, LinearGradient, Rect, Rgba, SlideIr } from './ir.ts'
import { EMU_PER_PX, PT_PER_PX } from './ir.ts'

export function xml(text: string): string {
  // eslint-disable-next-line no-control-regex
  return escapeHtml(text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, ''))
}

export function extents(width: number, height: number, x = 0, y = 0, degrees = 0): string {
  const rotation = degrees ? ` rot="${Math.round(((degrees + 360) % 360) * 60000)}"` : ''
  return `<a:xfrm${rotation}><a:off x="${Math.round(x * EMU_PER_PX)}" y="${Math.round(y * EMU_PER_PX)}"/><a:ext cx="${Math.round(width * EMU_PER_PX)}" cy="${Math.round(height * EMU_PER_PX)}"/></a:xfrm>`
}

function rgb(color: Rgba): string {
  const hex = [color.r, color.g, color.b].map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('').toUpperCase()
  const alpha = color.a < 1 ? `<a:alpha val="${Math.round(Math.max(0, color.a) * 100000)}"/>` : ''
  return `<a:srgbClr val="${hex}">${alpha}</a:srgbClr>`
}

function fill(color?: Rgba): string {
  return color ? `<a:solidFill>${rgb(color)}</a:solidFill>` : '<a:noFill/>'
}

function gradientFill(gradient: LinearGradient): string {
  const stops = gradient.stops.map(({ position, color }) =>
    `<a:gs pos="${Math.round(position * 100000)}">${rgb(color)}</a:gs>`).join('')
  const angle = Math.round(gradient.angle * 60000) % 21600000
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${angle}" scaled="0"/></a:gradFill>`
}

function line(border?: Border): string {
  if (!border) return '<a:ln><a:noFill/></a:ln>'
  const cap = border.cap ? ` cap="${border.cap}"` : ''
  const join = border.join === 'miter' ? '<a:miter lim="400000"/>'
    : border.join ? `<a:${border.join}/>` : ''
  const preset = { solid: 'solid', dotted: 'sysDot', dashed: 'dash' }[border.style]
  let dash = `<a:prstDash val="${preset}"/>`
  if (border.dashes?.length) {
    const percentage = (value: number) => Math.min(2_147_483_647, Math.round(value / border.width * 100_000))
    let stops = ''
    for (let index = 0; index < border.dashes.length; index += 2)
      stops += `<a:ds d="${percentage(border.dashes[index])}" sp="${percentage(border.dashes[index + 1])}"/>`
    dash = `<a:custDash>${stops}</a:custDash>`
  }
  return `<a:ln w="${Math.round(border.width * EMU_PER_PX)}"${cap}>${border.gradient ? gradientFill(border.gradient) : fill(border.color)}${dash}${join}</a:ln>`
}

function transform(rect: Rect, rotation?: number): string {
  return extents(rect.w, rect.h, rect.x, rect.y, rotation)
}

function rectShape(radius: number, rect: Rect): string {
  const adjustment = Math.round(Math.min(0.5, radius / Math.max(1, Math.min(rect.w, rect.h))) * 100000)
  return adjustment
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjustment}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
}

const ellipseGeometry = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'

function boxGeometry(box: IrBox, stroked: boolean): string {
  if (box.geometry?.kind === 'ellipse') return ellipseGeometry
  if (box.geometry?.kind !== 'path') return rectShape(box.radius ?? 0, box.rect)
  const tags = { M: 'moveTo', L: 'lnTo', Q: 'quadBezTo', C: 'cubicBezTo' }
  const commands = box.geometry.commands.map(command => {
    if (command.kind === 'Z') return '<a:close/>'
    let points = ''
    for (let index = 0; index < command.points.length; index += 2)
      points += `<a:pt x="${Math.round(command.points[index] * EMU_PER_PX)}" y="${Math.round(command.points[index + 1] * EMU_PER_PX)}"/>`
    const tag = tags[command.kind]
    return `<a:${tag}>${points}</a:${tag}>`
  }).join('')
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(box.rect.w * EMU_PER_PX)}" h="${Math.round(box.rect.h * EMU_PER_PX)}" fill="${box.fill || box.gradient ? 'norm' : 'none'}" stroke="${Number(stroked)}">${commands}</a:path></a:pathLst></a:custGeom>`
}

function shape(id: number, name: string, properties: string, body = ''): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr${body ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${properties}</p:spPr>${body}</p:sp>`
}

function drawBox(box: IrBox, nextId: () => number, name?: string): string {
  const borders = box.borders ?? []
  const first = borders[0]
  const uniform = first && borders.length === 4 && borders.every(border =>
    border?.width === first.width && border.style === first.style && border.gradient === first.gradient && rgb(border.color) === rgb(first.color))
  const { x, y, w, h } = box.rect
  let result = ''
  if (box.fill || box.gradient || uniform || box.shadow) {
    const shadow = box.shadow
    const effects = shadow ? `<a:effectLst><a:outerShdw blurRad="${Math.round(shadow.blur * EMU_PER_PX)}" dist="${Math.round(shadow.offset * EMU_PER_PX)}" dir="${Math.round((shadow.angle + 360) % 360 * 60000)}">${rgb(shadow.color)}</a:outerShdw></a:effectLst>` : ''
    const paint = box.gradient ? gradientFill(box.gradient) : fill(box.fill)
    result += shape(nextId(), name ?? (box.geometry ? 'Chart shape' : 'Box'), transform(box.rect, box.rotation) + boxGeometry(box, Boolean(uniform)) + paint + line(uniform ? first : undefined) + effects)
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
        result += shape(nextId(), name ?? 'Border', transform(edge) + rectShape(0, edge) + fill(border.color) + line())
      }
      else {
        const stroke = horizontal ? extents(edge.w, 0, edge.x, edge.y + thickness / 2)
          : extents(0, edge.h, edge.x + thickness / 2, edge.y)
        result += shape(nextId(), name ?? 'Border', `${stroke}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${line(border)}`)
      }
    })
  }
  return result
}

export interface HyperlinkRef { id: string, slideJump?: boolean }

export function drawHyperlink(link?: HyperlinkRef): string {
  return link ? `<a:hlinkClick r:id="${link.id}"${link.slideJump ? ' action="ppaction://hlinksldjump"' : ''}/>` : ''
}

function drawRun(run: IrRun, value: string, hyperlink: (href: string) => HyperlinkRef | undefined, besideArtwork: boolean): string {
  const link = drawHyperlink(run.link ? hyperlink(run.link) : undefined)
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

function drawText(node: IrText, id: number, hyperlink: (href: string) => HyperlinkRef | undefined): string {
  const singleLine = node.lineCount === 1
  // Viewers may wrap even a no-wrap box when a substituted font widens the
  // line. Use spare room in the measured container to keep it on one line.
  const lineRoom = Math.max(12, Math.min(node.rect.w * 0.12, node.elementRect.w - node.rect.w))
  const slack = node.valign === 'middle' || node.besideArtwork ? 0 : singleLine ? lineRoom : 2
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
  const body = `<p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" wrap="${singleLine || node.noWrap ? 'none' : 'square'}" anchor="${node.valign === 'middle' ? 'ctr' : 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`
  return shape(id, 'Text', extents(node.rect.w + slack, node.rect.h, x, node.rect.y, node.rotation) + rectShape(0, node.rect) + fill() + line(), body)
}

export function embeddedPicture(id: number, relationship: string, rect: Rect, label: string, link?: HyperlinkRef, crop?: IrImage['crop']): string {
  const title = xml(label)
  const click = drawHyperlink(link)
  const fraction = (pixels: number, full: number) => Math.round(Math.max(0, Math.min(1, pixels / full)) * 100_000)
  const source = crop ? `<a:srcRect l="${fraction(crop.x, crop.w)}" t="${fraction(crop.y, crop.h)}" r="${fraction(crop.w - crop.x - rect.w, crop.w)}" b="${fraction(crop.h - crop.y - rect.h, crop.h)}"/>` : ''
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${title}" descr="${title}">${click}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationship}"/>${source}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(rect)}${rectShape(0, rect)}</p:spPr></p:pic>`
}

function mathShape({ display, expression, rect, rotation }: IrEquation, id: number, name: string): string {
  const math = `<m:oMath>${expression}</m:oMath>`
  const content = display ? `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${math}</m:oMathPara>` : math
  const body = `<p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" wrap="none" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a14:m>${content}</a14:m></a:p></p:txBody>`
  return shape(id, name, transform(rect, rotation) + rectShape(0, rect) + fill() + line(), body)
}

function drawEquation(equation: NonNullable<IrRaster['equation']>, id: number, relationship: string, pictureRect: Rect, nextId: () => number, image: (data: string) => string): string {
  const decorations = equation.frames?.map(({ rect, border, fill: background, ellipse }) => {
    if (!border && !background) return ''
    // DrawingML centers the stroke and CSS draws it within the measured box.
    const width = border?.width ?? 0
    const inset = width / 2
    const path = { x: rect.x + inset, y: rect.y + inset, w: rect.w - width, h: rect.h - width }
    const geometry = ellipse ? ellipseGeometry : rectShape(0, path)
    return shape(nextId(), 'Equation frame', transform(path) + geometry + fill(background) + line(border))
  }).join('') ?? ''
  const strokes = equation.rules?.map(rule => drawBox(rule, nextId, 'Equation rule')).join('') ?? ''
  const artwork = equation.pictures?.map(picture =>
    embeddedPicture(nextId(), image(picture.data), picture.rect, picture.kind === 'radical' ? 'Equation radical' : 'Equation delimiter')).join('') ?? ''
  const editable = decorations + strokes + artwork + mathShape(equation, id, 'Equation')
    + (equation.cells?.map(cell => mathShape(cell, nextId(), 'Equation cell')).join('') ?? '')
    + (equation.tags?.map(tag => mathShape(tag, nextId(), 'Equation tag')).join('') ?? '')
  const picture = `<a:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
  const fallback = shape(id, 'Picture of math', transform(pictureRect) + rectShape(0, pictureRect) + picture + line())
  // MS-ODRAWXML §2.2.5 and §3.5 use a picture-filled shape for the fallback.
  return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a14" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${editable}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`
}

export function drawEditable(
  slide: SlideIr,
  image: (data: string, format?: IrImage['format']) => string,
  hyperlink: (href: string) => HyperlinkRef | undefined,
): { background: string, shapes: string, lastShapeId: number } {
  let id = 1
  const next = () => ++id
  const shapes = slide.nodes.map((node) => {
    if (node.kind === 'box') return drawBox(node, next)
    if (node.kind === 'text') return drawText(node, next(), hyperlink)
    if (node.kind === 'image') {
      return embeddedPicture(next(), image(node.data, node.format), node.rect, node.alt ?? 'Image', node.link ? hyperlink(node.link) : undefined, node.crop)
    }
    const id = next()
    const relationship = image(node.data)
    return node.equation
      ? drawEquation(node.equation, id, relationship, node.rect, next, image)
      : embeddedPicture(id, relationship, node.rect, `Picture of ${node.reason}`)
  }).join('')
  const background = slide.background ? `<p:bg><p:bgPr>${fill(slide.background)}<a:effectLst/></p:bgPr></p:bg>` : ''
  return { background, shapes, lastShapeId: id }
}
