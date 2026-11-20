export type MathClass = 'ord' | 'op' | 'bin' | 'rel' | 'open' | 'close' | 'punct' | 'inner'

type Spacing = Partial<Record<MathClass, Partial<Record<MathClass, number>>>>

// TeX atom spacing in mu, adapted from KaTeX (MIT, see licenses/KaTeX-MIT.txt).
// https://github.com/KaTeX/KaTeX/blob/main/src/spacingData.ts
const normalSpacing: Spacing = {
  ord: { op: 3, bin: 4, rel: 5, inner: 3 },
  op: { ord: 3, op: 3, rel: 5, inner: 3 },
  bin: { ord: 4, op: 4, open: 4, inner: 4 },
  rel: { ord: 5, op: 5, open: 5, inner: 5 },
  close: { op: 3, bin: 4, rel: 5, inner: 3 },
  punct: { ord: 3, op: 3, rel: 5, open: 3, close: 3, punct: 3, inner: 3 },
  inner: { ord: 3, op: 3, bin: 4, rel: 5, open: 3, punct: 3, inner: 3 },
}
const scriptSpacing: Spacing = {
  ord: { op: 3 },
  op: { ord: 3, op: 3 },
  close: { op: 3 },
  inner: { op: 3 },
}

const cancelsFollowingBinary = new Set<MathClass>(['bin', 'op', 'rel', 'open', 'punct'])
const cancelsPrecedingBinary = new Set<MathClass>(['rel', 'close', 'punct'])

// Undefined slots are explicit spaces and do not interrupt atom adjacency.
// Demote a binary atom in unary position before looking up pair spacing.
export function resolveRowClasses(classes: readonly (MathClass | undefined)[]): (MathClass | undefined)[] {
  const resolved = [...classes]
  let previous = -1
  for (const [index, current] of classes.entries()) {
    if (!current) continue
    const left = resolved[previous]
    if (left === 'bin' && cancelsPrecedingBinary.has(current)) resolved[previous] = 'ord'
    if (current === 'bin' && (!left || cancelsFollowingBinary.has(left))) resolved[index] = 'ord'
    previous = index
  }
  if (resolved[previous] === 'bin') resolved[previous] = 'ord'
  return resolved
}

export function rowSpacing(resolved: readonly (MathClass | undefined)[], tight: boolean): number[] {
  const table = tight ? scriptSpacing : normalSpacing
  let left: MathClass | undefined
  return resolved.map((right) => {
    if (!right) return 0
    const gap = left ? table[left]?.[right] ?? 0 : 0
    left = right
    return gap
  })
}
