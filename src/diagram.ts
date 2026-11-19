import { edgePath, layeredLayout } from 'ts-charts/layered'

const directions = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' } as const
const nodePattern = /^([\w-]+)(?:\[([^\]]+)\]|\{([^}]+)\}|\(([^)]+)\))?$/

function escapeXML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Renders the portable Mermaid flowchart subset. Unsupported syntax stays a code block. */
export function flowchart(source: string, marker: string): string | undefined {
  const rows = source
    .split(/\n|;/)
    .map(row => row.trim())
    .filter(row => row && !row.startsWith('%%'))
  const [, orientation] = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)$/.exec(rows.shift() || '') ?? []
  if (!orientation) return
  const direction = directions[orientation as keyof typeof directions]
  const nodes = new Map<string, { label: string, shape: 'rect' | 'round' | 'diamond' }>()
  const edges: Array<{ source: string, target: string, label?: string }> = []

  function node(value: string): string | undefined {
    const match = nodePattern.exec(value.trim())
    if (!match) return
    const [, id, rect, diamond, round] = match
    if (!nodes.has(id) || rect || diamond || round) {
      nodes.set(id, { label: (rect || diamond || round || id).replace(/^"|"$/g, ''), shape: diamond ? 'diamond' : round ? 'round' : 'rect' })
    }
    return id
  }

  for (const row of rows) {
    const parts = row.split(/\s*-->\s*/)
    let from = node(parts[0])
    if (!from) return
    for (const expression of parts.slice(1)) {
      const [, label, term] = /^(?:\|([^|]+)\|\s*)?(.+)$/.exec(expression) ?? []
      const to = term && node(term)
      if (!to) return
      edges.push({ source: from, target: to, label })
      from = to
    }
  }
  if (!nodes.size) return

  const layout = layeredLayout({
    nodes: [...nodes].map(([id, value]) => ({ id, width: Math.max(105, value.label.length * 8 + 36), height: value.shape === 'diamond' ? 74 : 52 })),
    edges,
  }, { direction, padding: 19, layerGap: 52, nodeGap: 28 })

  const labels = new Map(edges.map(edge => [`${edge.source}:${edge.target}`, edge.label]))
  const paths = layout.edges.map((edge, index) => {
    const id = `${marker}-line-${index}`
    const label = labels.get(`${edge.source}:${edge.target}`)
    const d = edgePath(edge.points, { direction, curve: 'orthogonal' })
    const text = label ? `<text class="diagram-edge-label"><textPath href="#${id}" startOffset="50%" text-anchor="middle" dy="-4">${escapeXML(label)}</textPath></text>` : ''
    return `<path id="${id}" class="diagram-edge" d="${d}" marker-end="url(#${marker})"/>${text}`
  })

  const boxes = layout.nodes.map((box) => {
    const item = nodes.get(box.id)!
    const { x, y, width, height } = box
    const cx = x + width / 2
    const cy = y + height / 2
    const shape = item.shape === 'diamond'
      ? `<polygon points="${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}"/>`
      : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${item.shape === 'round' ? 24 : 7}"/>`
    return `<g class="diagram-node">${shape}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${escapeXML(item.label)}</text></g>`
  })

  return `<svg class="slide-diagram" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Flowchart">
    <defs><marker id="${marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="diagram-arrow" d="M0 0L8 4L0 8Z"/></marker></defs>
    ${paths.join('')}${boxes.join('')}
  </svg>`
}
