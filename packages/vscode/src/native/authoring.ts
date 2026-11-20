import { builtinLayouts } from '../../../client/runtime/builtin-layouts.ts'
import { inspectDeckSource } from '../../../parser/src/deck.ts'

interface Field {
  description: string
  values?: readonly string[]
}

const booleans = ['true', 'false']
const slideFields: Readonly<Record<string, Field>> = {
  title: { description: 'Override the title of this slide.' },
  name: { description: 'Set the slide title when title is omitted.' },
  layout: { description: 'Choose a built-in or custom slide layout.', values: Object.keys(builtinLayouts) },
  class: { description: 'Add a CSS class to the slide.' },
  src: { description: 'Include slides from a Markdown file relative to this deck.' },
  routeAlias: { description: 'Set a named URL for this slide and its reveals.' },
  transition: { description: 'Choose the transition used when entering the slide.', values: ['fade', 'slide-left', 'slide-up'] },
  clicks: { description: 'Set the number of reveal steps.' },
  clicksStart: { description: 'Set the first reveal step on this slide.' },
  hide: { description: 'Skip the slide in the presentation.', values: booleans },
  disabled: { description: 'Skip the slide in the presentation.', values: booleans },
  hideInToc: { description: 'Hide the slide from the table of contents.', values: booleans },
  image: { description: 'Set the image used by an image layout.' },
  background: { description: 'Set a background color or image.' },
  comark: { description: 'Enable Comark Markdown features on this slide.', values: booleans },
  lineNumbers: { description: 'Show line numbers on code blocks.', values: booleans },
}
const deckFields: Readonly<Record<string, Field>> = {
  ...slideFields,
  theme: { description: 'Set the deck theme or the path to a theme package.', values: ['default', 'paper', 'serif', 'none'] },
  addons: { description: 'Load addons for the deck.' },
  canvasWidth: { description: 'Set the slide canvas width in pixels.' },
  aspectRatio: { description: 'Set the slide canvas width-to-height ratio.', values: ['16/9', '4/3', '1/1'] },
  colorSchema: { description: 'Set the deck appearance or follow the system.', values: ['auto', 'light', 'dark'] },
  routerMode: { description: 'Choose how slide navigation updates URLs.', values: ['history', 'hash', 'memory'] },
  codeTheme: { description: 'Choose a syntax highlighting palette.' },
  math: { description: 'Configure MathML rendering and TeX macros, or disable math.', values: booleans },
  fonts: { description: 'Configure sans, serif, and monospace fonts for the deck.' },
  drawings: { description: 'Configure drawing permissions, sync, and persistence.', values: booleans },
  export: { description: 'Set defaults for presentation exports.' },
}

export interface AuthoringSlide {
  index: number
  title: string
  start: number
  end: number
  selection: number
  frontmatter?: { start: number, end: number }
}

export interface AuthoringDocument {
  slides: AuthoringSlide[]
  lines: string[]
}

const fieldLine = /^(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))[ \t]*:(?=[ \t]|$)([ \t]*)/

function entryKey(match: RegExpExecArray): string {
  return match[1] ?? match[2] ?? match[3]
}

function inlineValue(token: string): string | undefined {
  const value = token.trim()
  if (!value || /^[#|>\[{]/.test(value) || /^(?:null|~)$/i.test(value)) return
  const doubleQuoted = /^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/.exec(value)
  if (doubleQuoted) {
    try { return JSON.parse(doubleQuoted[1]) as string }
    catch { return doubleQuoted[1].slice(1, -1) }
  }
  const singleQuoted = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(value)
  return singleQuoted ? singleQuoted[1].replaceAll("''", "'") : value.split(/[ \t]+#/)[0]
}

export function readAuthoringDocument(source: string): AuthoringDocument {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)
  const slides = inspectDeckSource(source).map(({ startLine, endLine, heading, frontmatter }, index) => {
    let end = endLine - 1
    while (end > startLine && !lines[end]?.trim()) end--
    const fields = new Map<string, { line: number, value: string }>()
    if (frontmatter) {
      for (let line = frontmatter.start + 1; line < frontmatter.end; line++) {
        const match = fieldLine.exec(lines[line])
        if (!match) continue
        const key = entryKey(match)
        if (key !== 'title' && key !== 'name' && key !== 'src') continue
        const value = inlineValue(lines[line].slice(match[0].length))
        if (value) fields.set(key, { line, value })
      }
    }
    const headingField = fields.get('title') ?? fields.get('name')
    const include = fields.get('src')
    return {
      index,
      title: headingField?.value ?? heading?.title ?? (include ? `Include ${include.value}` : `Slide ${index + 1}`),
      start: startLine,
      end,
      selection: headingField?.line ?? heading?.line ?? include?.line ?? startLine,
      frontmatter,
    }
  })
  return { slides, lines }
}

function frontmatterAt(doc: AuthoringDocument, line: number): AuthoringSlide | undefined {
  return doc.slides.find(slide => slide.frontmatter && slide.frontmatter.start < line && line < slide.frontmatter.end)
}

function fieldAt(slide: AuthoringSlide, key: string): Field | undefined {
  const fields = slide.index === 0 ? deckFields : slideFields
  return Object.hasOwn(fields, key) ? fields[key] : undefined
}

export interface Completion {
  label: string
  description: string
  insert: string
  start: number
  end: number
  isKey: boolean
}

export function frontmatterCompletions(doc: AuthoringDocument, line: number, character: number): Completion[] {
  const slide = frontmatterAt(doc, line)
  const text = doc.lines[line]
  if (text === undefined) return []
  const match = fieldLine.exec(text)
  if (slide && match) {
    const start = match[0].length
    const value = /^([\w./-]*)(?=[ \t]*(?:#|$))/.exec(text.slice(start))?.[1]
    const field = fieldAt(slide, entryKey(match))
    if (!field?.values || value === undefined || character < start || character > start + value.length) return []
    const prefix = text.slice(start, character)
    return field.values.filter(label => label.startsWith(prefix)).map(label => ({
      label, description: field.description, insert: match[4] ? label : ` ${label}`,
      start, end: start + value.length, isKey: false,
    }))
  }
  if (text && !/^[a-z][\w-]*$/i.test(text)) return []
  // A dashed block with one partial key is ambiguous until the colon. Offer
  // completions there without treating it as frontmatter in the slide outline.
  const draft = doc.lines[line - 1]?.trimEnd() === '---' && doc.lines[line + 1]?.trimEnd() === '---'
    && (line === 1 || doc.slides.some(slide => slide.start === line - 1 && slide.end === line))
  if (!slide && !draft) return []
  const existing = new Set<string>()
  if (slide?.frontmatter) {
    const { start, end } = slide.frontmatter
    for (let index = start + 1; index < end; index++) {
      if (index === line) continue
      const match = fieldLine.exec(doc.lines[index])
      if (match) existing.add(entryKey(match))
    }
  }
  const fields = (slide ? slide.index === 0 : line === 1) ? deckFields : slideFields
  return Object.entries(fields)
    .filter(([key]) => !existing.has(key) && key.startsWith(text.slice(0, character)))
    .map(([label, { description }]) => ({
      label, description, insert: `${label}: `, start: 0, end: text.length, isKey: true,
    }))
}

export function frontmatterHelp(doc: AuthoringDocument, line: number, character: number): { description: string, end: number } | undefined {
  const slide = frontmatterAt(doc, line)
  const match = slide && fieldLine.exec(doc.lines[line])
  if (!slide || !match) return
  const end = match[0].indexOf(':')
  if (character >= end) return
  const field = fieldAt(slide, entryKey(match))
  if (field) return { description: field.description, end }
}
