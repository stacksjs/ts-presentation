import { escapeHtml } from './html.ts'
import { gitGraphPreset, gitGraphStyleIndex } from './mermaid/gitgraph-themes.ts'
import { diagramThemeSelector } from './mermaid/theme-selectors.ts'
import { scopeDiagramStyles } from './scoped-style.ts'

export function applyDiagramTheme(svg: string, marker: string, options: Readonly<Record<string, unknown>>): string {
  const value = options.themeCSS
  if (typeof value !== 'string' || !value.trim()) return svg
  const id = `tp-diagram-${marker.replace(/[^\w-]/g, '-')}`
  const gantt = svg.includes('data-diagram-kind="gantt"')
  const git = svg.includes('data-diagram-kind="gitgraph"')
  const kind = gantt ? 'gantt' : git ? 'gitgraph' : undefined
  let scoped: string
  try {
    const literalsOrComments = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|^[ \t]*\/\/[^\r\n]*/gm
    const css = value.replace(literalsOrComments, token => token.trimStart().startsWith('//') ? '' : token)
    scoped = scopeDiagramStyles(css, id, kind ? selector => diagramThemeSelector(selector, kind) : undefined).trim()
  }
  catch { return svg }
  if (!scoped) return svg

  // Keep the renderer's palette above deck defaults while letting an author
  // override it using ordinary selectors and the normal CSS cascade.
  const paint = new Map<string, number>()
  const variables = options.themeVariables as { THEME_COLOR_LIMIT?: unknown } | undefined
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
      const branch = git ? element.getAttribute('data-git-branch-index') : null
      if (branch !== null) {
        const label = element.getAttribute('class') === 'diagram-git-branch'
        const slot = gitGraphStyleIndex(Number(branch), options.theme, label, variables?.THEME_COLOR_LIMIT)
        element.setAttribute('data-git-style-index', String(slot))
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
