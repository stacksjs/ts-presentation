import { pieChart } from 'ts-charts/diagrams'

export function pieDiagram(source: string, marker: string, settings?: unknown, defaultTitle = ''): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  const header = /^(?:pie)(\s+showData)?(?:\s+title\s+(.+))?\s*$/.exec(rows.shift() ?? '')
  if (!header) return
  let title = header[2] ?? defaultTitle
  const data = []
  for (const row of rows) {
    if (/^title\s+/.test(row)) { title = row.slice(6).trim(); continue }
    const [, label, amount] = /^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)$/.exec(row) ?? []
    if (!label || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return
    data.push({ label, value: Number(amount) })
  }
  const options = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}
  const { donutHole, textPosition, legendPosition, highlightSlice } = options
  return pieChart({
    slices: data, title, idPrefix: marker, showData: !!header[1],
    donutHole: typeof donutHole === 'number' ? donutHole : undefined,
    textPosition: typeof textPosition === 'number' ? textPosition : undefined,
    legendPosition: legendPosition === 'left' || legendPosition === 'bottom' ? legendPosition : undefined,
    highlightSlice: typeof highlightSlice === 'string' ? highlightSlice : undefined,
  })
}
