// TeX absolute units in points at a 10 pt text size. See KaTeX src/units.ts (MIT).
const pointsPerUnit: Readonly<Record<string, number>> = {
  pt: 1, bp: 803 / 800, px: 803 / 800, pc: 12,
  mm: 7227 / 2540, cm: 7227 / 254, in: 72.27,
  dd: 1238 / 1157, cc: 14856 / 1157, nd: 685 / 642, nc: 1370 / 107, sp: 1 / 65536,
}

const nativeUnits = new Set(['px', 'em', 'ex', 'pt', 'cm', 'mm', 'in', 'pc'])
const dimensionPattern = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(px|em|ex|pt|bp|cm|mm|in|mu|pc|dd|cc|nd|nc|sp)?$/

function toEm(value: number, unit: string): number {
  if (unit === 'em') return value
  if (unit === 'mu') return value / 18
  if (unit === 'ex') return value * 0.431
  return value * pointsPerUnit[unit] / 10
}

export function mathDimension(source: string, maximum: number): string | undefined {
  const [, amount, unit] = dimensionPattern.exec(source.trim()) ?? []
  if (amount === undefined) return
  const value = Number(amount)
  if (!Number.isFinite(value) || (!unit && value !== 0)) return
  const em = toEm(value, unit ?? 'px')
  if (em > maximum) return `${maximum}em`
  // Scaled points can use large integers even for a fraction of a point.
  if (Math.abs(unit === 'sp' ? value * pointsPerUnit.sp : value) > 1000) return
  if (maximum !== Infinity || unit === 'mu') return `${em}em`
  if (!unit) return `${amount}px`
  if (nativeUnits.has(unit)) return `${amount}${unit}`
  if (unit === 'bp') return `${amount}pt`
  return `${value * pointsPerUnit[unit]}pt`
}

export function fractionRule(thickness: string | undefined, minimum: number): string | undefined {
  if (!minimum || thickness === '0') return thickness
  if (thickness === undefined) return minimum > 0.04 ? `${minimum}em` : undefined
  const value = Number.parseFloat(thickness)
  if (value <= 0) return thickness
  const unit = /[a-z]+$/.exec(thickness)?.[0] ?? 'px'
  return `${Math.max(minimum, toEm(value, unit))}em`
}
