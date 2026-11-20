const ganttShape = ':is(.diagram-gantt-bar,.diagram-gantt-milestone-shape,.diagram-gantt-reference)'
const ganttText = ':is(.diagram-gantt-label,.diagram-gantt-reference-label)'
const ganttSelectors: Readonly<Record<string, string>> = {
  grid: '.diagram-gantt-axis',
  tick: '.diagram-gantt-tick-group',
  domain: '.diagram-gantt-axis-line',
  task: ganttShape,
  taskText: '.diagram-gantt-label:where([text-anchor="middle"])',
  taskTextOutsideLeft: '.diagram-gantt-label:where([text-anchor="end"])',
  taskTextOutsideRight: '.diagram-gantt-label:where([text-anchor="start"])',
  taskTextOutside: '.diagram-gantt-label:where(:not([text-anchor="middle"]))',
  titleText: '.diagram-title',
  section: '.diagram-gantt-band',
  sectionTitle: '.diagram-gantt-section-label',
  milestone: '.diagram-gantt-milestone-shape',
  milestoneText: `${ganttText}:where(.diagram-gantt-milestone *)`,
  clickable: `:is(${ganttShape},${ganttText}):where(:is(.diagram-gantt-link,.diagram-gantt-action) *)`,
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

const gitSymbol = ':is(.diagram-git-dot,.diagram-git-highlight-inner,.diagram-git-ring,.diagram-git-reverse-mark,.diagram-git-pick-berry)'
const gitHighlightOuter = '.diagram-git-dot:where(rect)'
const gitSelectors: Readonly<Record<string, string>> = {
  commit: gitSymbol,
  'commit-merge': '.diagram-git-ring:where([data-git-symbol="merge"] *)',
  'commit-reverse': '.diagram-git-reverse-mark',
  'commit-highlight-outer': gitHighlightOuter,
  'commit-highlight-inner': '.diagram-git-highlight-inner',
  'commit-cherry-pick': `${gitSymbol}:where([data-git-symbol="cherry-pick"] *)`,
  'commit-label': '.diagram-git-label',
  'commit-label-bkg': '.diagram-git-label-box',
  'branch-label': '.diagram-git-branch-label',
  branchLabelBkg: '.diagram-git-branch-label-box',
  'tag-label': '.diagram-git-tag',
  'tag-label-bkg': '.diagram-git-tag-box',
  'tag-hole': '.diagram-git-tag-hole',
  branch: ':is(.diagram-git-branch > path)',
  arrow: '.diagram-git-edge',
  gitTitleText: '.diagram-title',
}
const gitIndexed: Readonly<Record<string, string>> = {
  commit: ':is(.diagram-git-dot:where(circle),.diagram-git-highlight-inner,.diagram-git-ring,.diagram-git-reverse-mark):where(:not([data-git-symbol="cherry-pick"] *))',
  'commit-highlight': gitHighlightOuter,
  'commit-merge': gitSelectors['commit-merge'],
  'commit-reverse': gitSelectors['commit-reverse'],
  'commit-cherry-pick': gitSelectors['commit-cherry-pick'],
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

function selectorName(value: string): string {
  return value.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f]))/gi, (_, hex: string | undefined, literal: string) => {
    if (!hex) return literal
    const point = Number.parseInt(hex, 16)
    return point && point <= 0x10FFFF && !(point >= 0xD800 && point <= 0xDFFF) ? String.fromCodePoint(point) : '\uFFFD'
  })
}

function attributeValue(value: string): string {
  return value.replace(/[\x00-\x1f\x7f"\\]/g, character => `\\${character.charCodeAt(0).toString(16)} `)
}

export function diagramThemeSelector(selector: string, kind: 'gantt' | 'gitgraph', commitClasses?: ReadonlySet<string>): string {
  const gantt = kind === 'gantt'
  const tokens = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(\[\s*)id((?=\s*(?:[~|^$*]?=|\]))(?:[^\]"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\])|([#.])((?:[\w-]|[^\x00-\x7f]|\\(?:[\da-fA-F]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f]))+)|\\[^\r\n\f]/g
  return selector.replace(tokens, (token, attribute: string | undefined, suffix: string, type: string | undefined, rawName: string) => {
    if (gantt && attribute) return `:is(${token},${attribute}data-gantt-css-id${suffix})`
    if (!type) return token
    const name = selectorName(rawName)
    if (gantt && type === '#') return `:is(${token},[data-gantt-css-id="${attributeValue(name)}"])`
    if (type !== '.') return token
    if (gantt) return ganttClass(name) ?? token
    const role = gitClass(name)
    if (!commitClasses?.has(name) || role === gitSymbol) return role ?? token
    const commit = `${gitSymbol}:where([data-commit-id~="${attributeValue(name)}"] *)`
    return `:is(${role ?? token},${commit})`
  })
}
