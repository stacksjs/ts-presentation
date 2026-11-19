import { escapeHtml } from '../html.ts'
import { diagramSvg, svgText, syntaxMask } from './svg.ts'

interface Branch { name: string, head?: Commit, fork?: Commit, order: number, index: number }
interface Commit {
  id: string
  label: string
  branch: Branch
  parents: Commit[]
  tags: string[]
  type: string
  kind: 'commit' | 'merge' | 'cherry-pick'
  rank: number
  index: number
  picked?: string
}
interface History {
  commits: Commit[]
  branches: Branch[]
  direction: string
  title: string
}

function commands(source: string): string[] {
  return source.split(/\r?\n/).flatMap((line) => {
    const mask = syntaxMask(line)
    const comment = mask.indexOf('%%')
    const end = comment < 0 ? line.length : comment
    let cursor = 0
    const parts: string[] = []
    for (const stop of mask.slice(0, end).matchAll(/;/g)) {
      parts.push(line.slice(cursor, stop.index).trim())
      cursor = stop.index + 1
    }
    parts.push(line.slice(cursor, end).trim())
    return parts.filter(Boolean)
  })
}

function lex(source: string): string[] | undefined {
  const parts: string[] = []
  const piece = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s:"']+)|(:))/gy
  while (source.slice(piece.lastIndex).trim()) {
    const value = piece.exec(source)
    if (!value) return
    const [, quoted, single, keyword, separator] = value
    parts.push(keyword ?? separator ?? (quoted ?? single).replace(/\\(["'\\])/g, '$1'))
  }
  return parts
}

function fields(raw: string[], permitted: string[]): Map<string, string[]> | undefined {
  if (raw.length % 3 !== 0) return
  const result = new Map<string, string[]>()
  for (let cursor = 0; cursor < raw.length; cursor += 3) {
    const [key, sep, value] = raw.slice(cursor, cursor + 3)
    if (!permitted.includes(key) || sep !== ':' || (result.has(key) && key !== 'tag')) return
    const values = result.get(key) ?? []
    values.push(value)
    result.set(key, values)
  }
  return result
}

function settings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function buildGitHistory(source: string, options?: unknown): History | undefined {
  const rows = commands(source)
  const header = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?$/.exec(rows.shift() ?? '')
  if (!header || rows.length > 450) return
  const config = settings(options)
  const main = typeof config.mainBranchName === 'string' && config.mainBranchName ? config.mainBranchName : 'main'
  const head: Branch = { name: main, order: typeof config.mainBranchOrder === 'number' && Number.isFinite(config.mainBranchOrder) ? config.mainBranchOrder : 0, index: 0 }
  let current = head
  let title = ''
  const branches = new Map([[main, head]])
  const commits: Commit[] = []
  const byId = new Map<string, Commit>()

  function add(kind: Commit['kind'], properties: Map<string, string[]>, other?: Commit): boolean {
    const customId = properties.get('id')?.[0]
    const label = customId ?? ''
    if (customId !== undefined && (!customId || byId.has(customId))) return false
    let index = commits.length + 1
    while (byId.has(`c${index}`)) index++
    const id = customId ?? `c${index}`
    const type = properties.get('type')?.[0] ?? 'NORMAL'
    if (!['NORMAL', 'REVERSE', 'HIGHLIGHT'].includes(type)) return false
    const parents = current.head ? [current.head] : []
    if (kind === 'merge' && other) parents.push(other)
    const rank = config.parallelCommits ? Math.max(-1, ...parents.map(commit => commit.rank)) + 1 : commits.length
    const commit: Commit = { id, label: label || id, branch: current, parents, tags: properties.get('tag') ?? [],
      kind, type, rank, index: commits.length, picked: kind === 'cherry-pick' ? other?.id : undefined }
    commits.push(commit)
    byId.set(id, commit)
    current.head = commit
    return true
  }

  for (const row of rows) {
    if (row.startsWith('accTitle:')) { title = row.slice(9).trim(); continue }
    if (row.startsWith('accDescr:')) continue
    const tokens = lex(row)
    if (!tokens) return
    const [verb, first, ...rest] = tokens
    if (verb === 'commit') {
      const attributes = fields(tokens.slice(1), ['id', 'tag', 'type'])
      if (!attributes || !add('commit', attributes)) return
      continue
    }
    if (verb === 'branch') {
      const attributes = fields(rest, ['order'])
      const order = attributes?.get('order')?.[0]
      if (!attributes || !first || branches.has(first) || (order !== undefined && !/^-?\d+$/.test(order))) return
      current = { name: first, head: current.head, fork: current.head, order: order === undefined ? 0 : Number(order), index: branches.size }
      branches.set(first, current)
      continue
    }
    if (verb === 'checkout' || verb === 'switch') {
      const branch = branches.get(first)
      if (!branch || rest.length) return
      current = branch
      continue
    }
    if (verb === 'merge') {
      const source = branches.get(first)
      const attributes = fields(rest, ['id', 'tag', 'type'])
      if (!attributes || !source?.head || source === current || !current.head || source.head === current.head
        || !add('merge', attributes, source.head)) return
      continue
    }
    if (verb === 'cherry-pick') {
      const attributes = fields(tokens.slice(1), ['id', 'parent', 'tag'])
      const from = byId.get(attributes?.get('id')?.[0] ?? '')
      const parent = attributes?.get('parent')?.[0]
      if (!attributes || !from || from.branch === current || !current.head
        || (parent !== undefined && !from.parents.some(commit => commit.id === parent))
        || (from.kind === 'merge' && parent === undefined)) return
      attributes.delete('id')
      if (!attributes.has('tag')) attributes.set('tag', [`cherry-pick: ${from.id}`])
      if (!add('cherry-pick', attributes, from)) return
      continue
    }
    return
  }
  if (!commits.length || branches.size > 40) return
  return { commits, branches: [...branches.values()].sort((a, b) => a.order - b.order || a.index - b.index), direction: header[1] ?? 'LR', title }
}

const branchColors = ['#6ba2db', '#e7b76f', '#70c1a4', '#b6a0da', '#e88998', '#59b9be', '#acc272', '#d68d61']

export function gitGraph(source: string, options?: unknown, theme?: unknown, fallbackTitle = ''): string | undefined {
  const history = buildGitHistory(source, options)
  if (!history) return
  const { commits, branches, direction } = history
  const config = settings(options)
  const variables = settings(theme)
  const title = history.title || fallbackTitle
  const showLabels = config.showCommitLabel !== false
  const showBranches = config.showBranches !== false
  const lanes = new Map(branches.map((branch, index) => [branch, index]))
  const labelWidth = Math.max(80, Math.min(250, Math.max(...branches.map(branch => branch.name.length * 8)) + 30))
  const longTag = Math.min(27, Math.max(0, ...commits.flatMap(commit => commit.tags.map(tag => tag.length))))
  const horizontal = direction === 'LR'
  const ranks = Math.max(...commits.map(commit => commit.rank)) + 1
  const gap = horizontal ? Math.max(84, longTag * 6 + 25) : 47
  const laneWidth = horizontal ? 71 : Math.max(146, labelWidth, longTag * 7 + 40)
  const pad = title ? 54 : 23
  const start = horizontal ? (showBranches ? labelWidth : 22) : pad + (showBranches ? 32 : 8)
  const time = (rank: number) => start + 25 + (direction === 'BT' ? ranks - 1 - rank : rank) * gap
  const lane = (branch: Branch) => horizontal ? pad + 26 + lanes.get(branch)! * laneWidth : laneWidth / 2 + lanes.get(branch)! * laneWidth
  const point = (commit: Commit) => horizontal ? { x: time(commit.rank), y: lane(commit.branch) } : { x: lane(commit.branch), y: time(commit.rank) }
  const width = horizontal ? start + Math.max(110, ranks * gap) + 24 : Math.max(210, branches.length * laneWidth + 44)
  const height = horizontal ? pad + Math.max(92, branches.length * laneWidth + 15) : start + ranks * gap + 20
  const color = (branch: Branch) => {
    const index = lanes.get(branch)! % branchColors.length
    const custom = variables[`git${index}`]
    return typeof custom === 'string' && /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{1,25})$/i.test(custom) ? custom : branchColors[index]
  }
  const abbreviated = (text: string, size: number) => text.length > size ? `${text.slice(0, size - 1)}…` : text
  const rails = showBranches ? branches.map((branch) => {
    const axis = lane(branch)
    const progression = direction === 'BT' ? -1 : 1
    const first = branch.fork ? time(branch.fork.rank) : time(0) - progression * 13
    const last = time(ranks - 1) + progression * 18
    const line = horizontal ? `M${first} ${axis}H${last}` : `M${axis} ${Math.min(first, last)}V${Math.max(first, last)}`
    const label = horizontal ? svgText(abbreviated(branch.name, 28), 13, axis, 'diagram-git-branch-label', 'start')
      : svgText(abbreviated(branch.name, 21), axis, pad + 8, 'diagram-git-branch-label')
    return `<g class="diagram-git-branch"><title>${escapeHtml(branch.name)}</title><path d="${line}" stroke="${color(branch)}"/>${label}</g>`
  }).join('') : ''
  const edges = commits.flatMap((commit) => {
    const to = point(commit)
    return commit.parents.map((parent) => {
      const from = point(parent)
      const middleX = (from.x + to.x) / 2
      const middleY = (from.y + to.y) / 2
      const curve = horizontal
        ? `M${from.x} ${from.y}C${middleX} ${from.y} ${middleX} ${to.y} ${to.x} ${to.y}`
        : `M${from.x} ${from.y}C${from.x} ${middleY} ${to.x} ${middleY} ${to.x} ${to.y}`
      return `<path class="diagram-git-edge" d="${curve}" stroke="${color(parent.branch === commit.branch ? commit.branch : parent.branch)}"/>`
    })
  }).join('')
  const nodes = commits.map((commit) => {
    const { x, y } = point(commit)
    const stroke = color(commit.branch)
    let node = `<circle class="diagram-git-dot" cx="${x}" cy="${y}" r="8" fill="${stroke}"/>`
    if (commit.kind === 'merge') node += `<circle class="diagram-git-ring" cx="${x}" cy="${y}" r="4.2"/>`
    if (commit.kind === 'cherry-pick') node += `<path class="diagram-git-ring" d="M${x - 3} ${y}q3 1 3-4 0 5 3 4M${x - 5} ${y + 1}h2m3 0h2"/>`
    if (commit.type === 'REVERSE') node = `<path class="diagram-git-edge" d="M${x - 7} ${y - 7}l14 14m-14 0l14-14" stroke="${stroke}"/>`
    if (commit.type === 'HIGHLIGHT') node = `<rect class="diagram-git-dot" x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="${stroke}"/>`
    const label = showLabels ? (horizontal ? svgText(abbreviated(commit.label, 17), x, y - 19, 'diagram-git-label')
      : svgText(abbreviated(commit.label, 18), x + 13, y - 9, 'diagram-git-label', 'start')) : ''
    const tag = commit.tags.join(' · ')
    const tagLabel = tag ? (horizontal ? svgText(abbreviated(tag, 27), x, y + 19, 'diagram-git-tag')
      : svgText(abbreviated(tag, 20), x + 13, y + 11, 'diagram-git-tag', 'start')) : ''
    const detail = [commit.branch.name, commit.id, commit.picked, tag].filter(Boolean).join(' / ')
    return `<g class="diagram-git-node diagram-git-${commit.kind}" data-commit-id="${escapeHtml(commit.id)}" data-parent-ids="${escapeHtml(commit.parents.map(commit => commit.id).join(', '))}"><title>${escapeHtml(detail)}</title>${node}${label}${tagLabel}</g>`
  }).join('')
  return diagramSvg(title || 'Git graph', width, height, (title ? svgText(title, width / 2, 23, 'diagram-title') : '') + rails + edges + nodes)
}
