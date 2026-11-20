import { escapeHtml } from './html.ts'
import { gitGraphPreset } from './mermaid/gitgraph-themes.ts'
import { scopeDiagramStyles } from './scoped-style.ts'

const ganttSelectors: Readonly<Record<string, string>> = {
  task: ':is(.diagram-gantt-bar,.diagram-gantt-milestone-shape,.diagram-gantt-reference)',
  taskText: '.diagram-gantt-label[text-anchor="middle"]',
  taskTextOutsideLeft: '.diagram-gantt-label[text-anchor="end"]',
  taskTextOutsideRight: '.diagram-gantt-label[text-anchor="start"]',
  titleText: '.diagram-title',
  section: '.diagram-gantt-band',
  sectionTitle: '.diagram-gantt-section-label',
  milestone: '.diagram-gantt-milestone-shape',
  vert: '.diagram-gantt-reference',
  today: '.diagram-gantt-today',
  exclude: '.diagram-gantt-excluded',
}

const gitGraphSelectors: Readonly<Record<string, string>> = {
  commit: '.diagram-git-dot',
  'commit-label': '.diagram-git-label',
  'commit-label-bkg': '.diagram-git-label-box',
  'branch-label': '.diagram-git-branch-label',
  branchLabelBkg: '.diagram-git-branch-label-box',
  'tag-label': '.diagram-git-tag',
  'tag-label-bkg': '.diagram-git-tag-box',
  arrow: '.diagram-git-edge',
}

function diagramSelector(selector: string, aliases: Readonly<Record<string, string>>, gantt: boolean): string {
  const tokens = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(\[\s*)id((?=\s*(?:[~|^$*]?=|\]))(?:[^\]"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\])|([#.])([\w-]+)(?![\w\\-]|[^\x00-\x7f])/g
  return selector.replace(tokens, (token, attribute: string | undefined, suffix: string, type: string | undefined, name: string) => {
    if (gantt && attribute) return `:is(${token},${attribute}data-gantt-css-id${suffix})`
    if (gantt && type === '#') return `:is(${token},[data-gantt-css-id="${name}"])`
    return type === '.' && Object.hasOwn(aliases, name) ? aliases[name] : token
  })
}

export function applyDiagramTheme(svg: string, marker: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return svg
  const id = `tp-diagram-${marker.replace(/[^\w-]/g, '-')}`
  const gantt = svg.includes('data-diagram-kind="gantt"')
  const aliases = gantt ? ganttSelectors : svg.includes('data-diagram-kind="gitgraph"') ? gitGraphSelectors : undefined
  let scoped: string
  try {
    const literalsOrComments = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|^[ \t]*\/\/[^\r\n]*/gm
    const css = value.replace(literalsOrComments, token => token.trimStart().startsWith('//') ? '' : token)
    scoped = scopeDiagramStyles(css, id, aliases ? selector => diagramSelector(selector, aliases, gantt) : undefined).trim()
  }
  catch { return svg }
  if (!scoped) return svg

  // Keep the renderer's palette above deck defaults while letting an author
  // override it using ordinary selectors and the normal CSS cascade.
  const paint = new Map<string, number>()
  let root = true
  let task: string | null = null
  const markup = new HTMLRewriter().on('*', {
    element(element) {
      if (root) {
        element.setAttribute('id', id)
        root = false
      }
      const style = element.getAttribute('style')
      if (style) {
        if (!paint.has(style)) paint.set(style, paint.size)
        element.setAttribute('data-diagram-paint', String(paint.get(style)))
        element.removeAttribute('style')
      }
      if (!gantt) return
      const taskId = element.getAttribute('data-task-id')
      if (taskId !== null) {
        task = taskId
        element.onEndTag(() => { task = null })
      }
      if (task === null) return
      const classes = element.getAttribute('class')?.split(' ') ?? []
      if (classes.some(value => ['diagram-gantt-bar', 'diagram-gantt-milestone-shape', 'diagram-gantt-reference'].includes(value))) {
        element.setAttribute('data-gantt-css-id', task)
      }
      else if (classes.includes('diagram-gantt-label') || classes.includes('diagram-gantt-reference-label')) {
        element.setAttribute('data-gantt-css-id', `${task}-text`)
      }
    },
  }).transform(svg)
  const defaults = Array.from(paint, ([style, index]) =>
    `:is(#${id}, #${id} *):where([data-diagram-paint="${index}"]){${style}}`).join('')
  const styles = (defaults + scoped).replace(/<(?=\/style)/gi, '\\3c ')
  return markup.replace(/<svg\b[^>]*>/, tag => `${tag}<style data-diagram-style>${styles}</style>`)
}

export function optionsForSvg(svg: string, options: Readonly<Record<string, unknown>>): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const theme = typeof options.theme === 'string' && gitGraphPreset(options.theme) ? options.theme : ''
    const scale = typeof options.scale === 'number' && options.scale > 0 && options.scale <= 5 ? options.scale : undefined
    const viewBox = /\bviewBox="[^"]*?\s([\d.]+)"/i.exec(tag)
    const height = scale && viewBox ? Math.round(scale * Number(viewBox[1])) : undefined
    let opening = tag.slice(0, -1)
    if (theme) opening += ` data-diagram-theme="${theme}"`
    if (typeof options.title === 'string' && !tag.includes('aria-labelledby=')) {
      opening = opening.replace(/\saria-label="[^"]*"/, '')
      opening += ` aria-label="${escapeHtml(options.title)}"`
    }
    if (height) opening = opening.replace(/\s(?:width|height)="[^"]*"/g, '') + ` height="${height}"`
    return `${opening}>`
  })
}
