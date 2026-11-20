import type { ZipPart } from './zip.ts'
import type { SlideIr } from './editable/ir.ts'
import { drawEditable, drawHyperlink, embeddedPicture, extents, xml } from './editable/drawing.ts'
import type { HyperlinkRef } from './editable/drawing.ts'
import type { PictureFormat } from './editable/pictures.ts'
import type { SlidePosition } from '../../../client/runtime/navigation.ts'
import { zipParts } from './zip.ts'

export interface FrameLink {
  href: string
  label: string
  x: number
  y: number
  width: number
  height: number
  inArtwork?: boolean
}

export type PowerPointFrame = {
  title: string
  notes: string
  links?: FrameLink[]
  position?: SlidePosition
} & ({ image: Uint8Array<ArrayBuffer>, editable?: never } | { editable: SlideIr, image?: never })

export interface PowerPointOptions {
  title: string
  author?: string
  width: number
  height: number
}

const p = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships'
const coreNS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const mime = 'application/vnd.openxmlformats-officedocument'
const presentationNS = `xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}"`
const prolog = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const mapping = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
const mapped = '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'

type XmlRelation = [id: string, kind: string, target: string, external?: boolean]

function relationships(items: XmlRelation[]): string {
  return `<Relationships xmlns="${relationshipsNamespace}">${items.map(([id, kind, target, external]) =>
    `<Relationship Id="${id}" Type="${kind.startsWith('http') ? kind : `${r}/${kind}`}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`
}

function lightTheme(): string {
  const scheme = Object.entries({
    dk1: '000000', lt1: 'FFFFFF', dk2: '182533', lt2: 'F4F7FB',
    accent1: '3477A7', accent2: 'CF6547', accent3: '568B75', accent4: '75619A',
    accent5: '287986', accent6: 'D9A83C', hlink: '1A65B2', folHlink: '744C91',
  }).map(([node, value]) => `<a:${node}><a:srgbClr val="${value}"/></a:${node}>`).join('')
  const font = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>'
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const line = `<a:ln w="9525">${fill}<a:prstDash val="solid"/></a:ln>`
  const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>'
  return `<a:theme xmlns:a="${a}" name="Presentation"><a:themeElements>
    <a:clrScheme name="Presentation">${scheme}</a:clrScheme>
    <a:fontScheme name="Arial"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme>
    <a:fmtScheme name="Presentation"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${effect.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements></a:theme>`
}

function notesShape(notes: string): string {
  const paragraphs = notes.split(/\r?\n/).map(line => `<a:p><a:r><a:rPr lang="en-US"/><a:t xml:space="preserve">${xml(line)}</a:t></a:r></a:p>`).join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Speaker Notes"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr>${extents(620, 408, 50, 466)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
}

function validRectangle(link: FrameLink): boolean {
  return [link.x, link.y, link.width, link.height].every(Number.isFinite)
    && link.width > 0 && link.height > 0
}

export function createPowerPoint(frames: readonly PowerPointFrame[], options: PowerPointOptions): Blob {
  if (!frames.length) throw new Error('Select at least one slide for PowerPoint export')
  if (![options.width, options.height].every(value => Number.isInteger(value) && value > 0 && value <= 10000))
    throw new Error('PowerPoint canvas dimensions must be positive integers up to 10000 pixels')
  const { width, height, title, author = '' } = options
  const files: ZipPart[] = []
  const types: string[] = []
  const add = (name: string, markup: string, kind?: string) => {
    files.push({ name, data: prolog + markup })
    if (kind) types.push(`<Override PartName="/${name}" ContentType="${mime}.${kind}+xml"/>`)
  }

  add('_rels/.rels', relationships([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', coreNS, 'docProps/core.xml']]))
  add('ppt/presentation.xml', `<p:presentation ${presentationNS}>
    <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
    <p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
    <p:sldIdLst>${frames.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 3}"/>`).join('')}</p:sldIdLst>
    <p:sldSz cx="${width * 9525}" cy="${height * 9525}"/><p:notesSz cx="6858000" cy="9144000"/>
    <p:defaultTextStyle/>
  </p:presentation>`, 'presentationml.presentation.main')
  add('ppt/_rels/presentation.xml.rels', relationships([
    ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
    ['rId2', 'notesMaster', 'notesMasters/notesMaster1.xml'],
    ...frames.map((_, index): XmlRelation => [`rId${index + 3}`, 'slide', `slides/slide${index + 1}.xml`]),
  ]))
  add('ppt/theme/theme1.xml', lightTheme(), 'theme')
  add('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster ${presentationNS}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${mapping}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles/></p:sldMaster>`, 'presentationml.slideMaster')
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships([
    ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml'],
  ]))
  add('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout ${presentationNS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld>${mapped}</p:sldLayout>`, 'presentationml.slideLayout')
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]))
  add('ppt/notesMasters/notesMaster1.xml', `<p:notesMaster ${presentationNS}><p:cSld><p:spTree>${group}${notesShape('')}</p:spTree></p:cSld>${mapping}<p:notesStyle/></p:notesMaster>`, 'presentationml.notesMaster')
  add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relationships([['rId1', 'theme', '../theme/theme1.xml']]))

  add('docProps/core.xml', `<cp:coreProperties xmlns:cp="${coreNS}" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator></cp:coreProperties>`)
  types.push('<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>')

  const firstFrame = new Map<number, number>()
  const revealFrames = new Map<string, number>()
  const media: Record<PictureFormat, Map<string, string>> = { png: new Map(), jpeg: new Map() }
  for (const [index, frame] of frames.entries()) {
    const position = frame.position ?? { slide: index + 1, click: 0 }
    if (!firstFrame.has(position.slide)) firstFrame.set(position.slide, index + 1)
    revealFrames.set(`${position.slide}/${position.click}`, index + 1)
  }

  for (const [index, frame] of frames.entries()) {
    const slide = index + 1
    const rels: XmlRelation[] = [
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'notesSlide', `../notesSlides/notesSlide${slide}.xml`],
    ]
    const urls = new Map<string, HyperlinkRef>()
    const hyperlink = (href: string): HyperlinkRef | undefined => {
      const previous = urls.get(href)
      if (previous) return previous
      const internal = /^#slide-([1-9]\d*)(?:\/(\d+))?$/.exec(href)
      const id = `rId${rels.length + 1}`
      const link: HyperlinkRef = { id }
      if (internal) {
        const frame = revealFrames.get(`${internal[1]}/${internal[2]}`) ?? firstFrame.get(Number(internal[1]))
        if (!frame) return
        rels.push([id, 'slide', `slide${frame}.xml`])
        link.slideJump = true
      }
      else {
        if (!/^(?:https?:\/\/|mailto:)/i.test(href)) return
        rels.push([id, 'hyperlink', href, true])
      }
      urls.set(href, link)
      return link
    }
    const image = (bytes: Uint8Array<ArrayBuffer> | string, format: PictureFormat = 'png') => {
      const id = `rId${rels.length + 1}`
      let name = typeof bytes === 'string' ? media[format].get(bytes) : undefined
      if (!name) {
        name = `slide${slide}-${id}.${format}`
        files.push({ name: `ppt/media/${name}`, data: typeof bytes === 'string' ? Buffer.from(bytes, 'base64') : bytes })
        if (typeof bytes === 'string') media[format].set(bytes, name)
      }
      rels.push([id, 'image', `../media/${name}`])
      return id
    }
    let background = ''
    let shapes: string
    let shapeId = 2
    if (frame.editable) {
      const drawing = drawEditable(frame.editable, image, hyperlink)
      background = drawing.background
      shapes = drawing.shapes
      shapeId = drawing.lastShapeId
    }
    else {
      shapes = embeddedPicture(2, image(frame.image), { x: 0, y: 0, w: width, h: height }, frame.title)
    }
    // Links inside raster artwork need their own hit areas even in an editable deck.
    shapes += (frame.links ?? []).filter(link => (!frame.editable || link.inArtwork) && validRectangle(link)).map((link) => {
      const action = drawHyperlink(hyperlink(link.href))
      return action ? `<p:sp><p:nvSpPr><p:cNvPr id="${++shapeId}" name="${xml(link.label)}">${action}</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${extents(link.width, link.height, link.x, link.y)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>` : ''
    }).join('')
    add(`ppt/slides/slide${slide}.xml`, `<p:sld ${presentationNS}><p:cSld name="${xml(frame.title)}">${background}<p:spTree>${group}${shapes}</p:spTree></p:cSld>${mapped}</p:sld>`, 'presentationml.slide')
    add(`ppt/slides/_rels/slide${slide}.xml.rels`, relationships(rels))
    add(`ppt/notesSlides/notesSlide${slide}.xml`, `<p:notes ${presentationNS}><p:cSld><p:spTree>${group}${notesShape(frame.notes)}</p:spTree></p:cSld>${mapped}</p:notes>`, 'presentationml.notesSlide')
    add(`ppt/notesSlides/_rels/notesSlide${slide}.xml.rels`, relationships([
      ['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'],
      ['rId2', 'slide', `../slides/slide${slide}.xml`],
    ]))
  }

  add('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
    <Default Extension="jpeg" ContentType="image/jpeg"/>
    ${types.join('')}
  </Types>`)
  return zipParts(files)
}
