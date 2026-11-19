/** Slidev-style ranges, preserving author order for local includes and exports. */
export function slideRange(count: number, range?: string): number[] {
  const input = range?.trim()
  if (!input || input === 'all' || input === '*') return Array.from({ length: count }, (_, index) => index + 1)
  if (input === 'none') return []
  const selected = new Set<number>()
  for (const segment of input.split(/[,;]/)) {
    const match = /^(\d+)(?:\s*-\s*(\d*))?$/.exec(segment.trim())
    if (!match) throw new Error(`Invalid slide selection: ${segment}`)
    const first = Number(match[1])
    const last = match[2] === '' ? count : Number(match[2] ?? match[1])
    if (first > last || first < 1 || last > count) throw new Error(`Slide selection is outside 1-${count}: ${segment}`)
    for (let number = first; number <= last; number++) selected.add(number)
  }
  return [...selected]
}
