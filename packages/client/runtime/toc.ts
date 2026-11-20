import type { SlideRoute } from './navigation.ts'
import type { TocItem } from '../../types/src/toc.ts'

export interface ActiveTocItem extends TocItem {
  title: string
  active: boolean
  activeParent: boolean
  hasActiveParent: boolean
  children: ActiveTocItem[]
}

export type TocMode = 'all' | 'onlyCurrentTree' | 'onlySiblings'

// Adapted from Slidev's useTocTree and Toc component (MIT).
export function createTocTree(routes: readonly SlideRoute[]): TocItem[] {
  const tree: TocItem[] = []
  for (const route of routes) {
    if (!route.title || route.untitled) continue
    let siblings = tree
    let level = 1
    const titleLevel = route.level ?? 1
    let previous = siblings.at(-1)
    while (previous && titleLevel > level && previous.titleLevel < titleLevel) {
      siblings = previous.children
      level++
      previous = siblings.at(-1)
    }
    siblings.push({
      no: route.no,
      title: route.title,
      path: `/${route.alias ?? route.no}`,
      level,
      titleLevel,
      hideInToc: Boolean(route.frontmatter.hideInToc),
      children: [],
    })
  }
  return tree
}

export function activeTocTree(entries: readonly TocItem[], slide: number): ActiveTocItem[] {
  function annotate(nodes: readonly TocItem[], hasActiveParent: boolean, parent?: ActiveTocItem): ActiveTocItem[] {
    return nodes.flatMap((node) => {
      const item: ActiveTocItem = { ...node, title: node.title ?? '', active: node.no === slide, activeParent: false, hasActiveParent, children: [] }
      item.children = annotate(node.children, hasActiveParent || item.active, item)
      if (parent && (item.active || item.activeParent)) parent.activeParent = true
      return node.hideInToc ? [] : [item]
    })
  }
  return annotate(entries, false)
}

export function filterTocTree(items: readonly ActiveTocItem[], mode: TocMode, minDepth: number, maxDepth: number): ActiveTocItem[] {
  function filter(nodes: readonly ActiveTocItem[], level: number): ActiveTocItem[] {
    if (!nodes.length || level > maxDepth) return []
    const active = (item: ActiveTocItem) => item.active || item.activeParent
    if (level < minDepth) return filter(nodes.find(active)?.children ?? [], level + 1)
    const currentTree = (item: ActiveTocItem) => active(item) || item.hasActiveParent
    const selected = mode === 'onlyCurrentTree' ? nodes.filter(currentTree)
      : mode === 'onlySiblings' && !nodes.some(currentTree) ? [] : nodes
    return selected.map(item => ({ ...item, children: filter(item.children, level + 1) }))
  }
  return filter(items, 1)
}
