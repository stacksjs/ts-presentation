const ganttShape = ':is(.diagram-gantt-bar,.diagram-gantt-milestone-shape,.diagram-gantt-reference)'
const ganttText = ':is(.diagram-gantt-label,.diagram-gantt-reference-label)'
const ganttSelectors: Readonly<Record<string, string>> = {
  task: ganttShape,
  taskText: '.diagram-gantt-label[text-anchor="middle"]',
  taskTextOutsideLeft: '.diagram-gantt-label[text-anchor="end"]',
  taskTextOutsideRight: '.diagram-gantt-label[text-anchor="start"]',
  taskTextOutside: '.diagram-gantt-label:not([text-anchor="middle"])',
  titleText: '.diagram-title',
  section: '.diagram-gantt-band',
  sectionTitle: '.diagram-gantt-section-label',
  milestone: '.diagram-gantt-milestone-shape',
  milestoneText: `${ganttText}:where(.diagram-gantt-milestone *)`,
  vert: '.diagram-gantt-reference',
  vertText: '.diagram-gantt-reference-label',
  today: '.diagram-gantt-today',
  exclude: '.diagram-gantt-excluded',
  'exclude-range': '.diagram-gantt-excluded',
}

const active = '.diagram-gantt-active'
const done = '.diagram-gantt-done'
const crit = '.diagram-gantt-crit'
const ganttBarStates: Readonly<Record<string, string>> = {
  task: `:not(${active},${done},${crit})`,
  active: `${active}:not(${crit})`,
  activeCrit: active + crit,
  done: `${done}:not(${active},${crit})`,
  doneCrit: `${done}${crit}:not(${active})`,
  crit: `${crit}:not(${active},${done})`,
}
const ganttTextStates: Readonly<Record<string, string>> = {
  activeText: ganttBarStates.active,
  activeCritText: ganttBarStates.activeCrit,
  doneText: `${done}:not(${crit})`,
  doneCritText: done + crit,
  critText: `${crit}:not(${done})`,
}

const gitSelectors: Readonly<Record<string, string>> = {
  commit: '.diagram-git-dot',
  'commit-label': '.diagram-git-label',
  'commit-label-bkg': '.diagram-git-label-box',
  'branch-label': '.diagram-git-branch-label',
  branchLabelBkg: '.diagram-git-branch-label-box',
  'tag-label': '.diagram-git-tag',
  'tag-label-bkg': '.diagram-git-tag-box',
  'tag-hole': '.diagram-git-tag-hole',
  branch: ':is(.diagram-git-branch > path)',
  arrow: '.diagram-git-edge',
}
const gitIndexed: Readonly<Record<string, string>> = {
  commit: ':is(circle.diagram-git-dot,.diagram-git-highlight-inner,.diagram-git-ring,.diagram-git-reverse-mark):not([data-git-symbol="cherry-pick"] *)',
  'commit-highlight': 'rect.diagram-git-dot',
  branch: gitSelectors.branch,
  'branch-label': gitSelectors['branch-label'],
  label: gitSelectors.branchLabelBkg,
  arrow: gitSelectors.arrow,
}

function ganttClass(name: string): string | undefined {
  if (Object.hasOwn(ganttSelectors, name)) return ganttSelectors[name]
  const indexed = /^(.+?)(\d+)$/.exec(name)
  if (!indexed) return
  const [, role, index] = indexed
  const slot = `[data-gantt-style-index="${index}"]`
  if (Object.hasOwn(ganttBarStates, role)) return `${ganttShape}:where(${slot}${ganttBarStates[role]} *)`
  if (Object.hasOwn(ganttTextStates, role)) return `${ganttText}:where(${slot}${ganttTextStates[role]} *)`
  if (/^(?:section(?:Title)?|taskText(?:Outside)?)$/.test(role)) return `${ganttSelectors[role]}:where(${slot} *)`
}

function gitClass(name: string): string | undefined {
  if (Object.hasOwn(gitSelectors, name)) return gitSelectors[name]
  const indexed = /^(.+?)(\d+)$/.exec(name)
  if (!indexed || !Object.hasOwn(gitIndexed, indexed[1])) return
  const [, role, index] = indexed
  const slot = `[data-git-style-index="${index}"]`
  return `${gitIndexed[role]}:where(${slot},${slot} *)`
}

export function diagramThemeSelector(selector: string, kind: 'gantt' | 'gitgraph'): string {
  const gantt = kind === 'gantt'
  const tokens = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(\[\s*)id((?=\s*(?:[~|^$*]?=|\]))(?:[^\]"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\])|([#.])([\w-]+)(?![\w\\-]|[^\x00-\x7f])/g
  return selector.replace(tokens, (token, attribute: string | undefined, suffix: string, type: string | undefined, name: string) => {
    if (gantt && attribute) return `:is(${token},${attribute}data-gantt-css-id${suffix})`
    if (gantt && type === '#') return `:is(${token},[data-gantt-css-id="${name}"])`
    if (type === '.') return (gantt ? ganttClass(name) : gitClass(name)) ?? token
    return token
  })
}
