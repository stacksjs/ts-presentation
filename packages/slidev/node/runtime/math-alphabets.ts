export const styledMathAlphabets: Record<string, { upper: number, lower: number, digits?: number, exceptions: string }> = {
  'double-struck': { upper: 0x1D538, lower: 0x1D552, digits: 0x1D7D8, exceptions: 'CℂHℍNℕPℙQℚRℝZℤ' },
  'script': { upper: 0x1D49C, lower: 0x1D4B6, exceptions: 'BℬEℰFℱHℋIℐLℒMℳRℛeℯgℊoℴ' },
  'fraktur': { upper: 0x1D504, lower: 0x1D51E, exceptions: 'CℭHℌIℑRℜZℨ' },
}

/** Convert a browser's styled Unicode glyphs to editable Office Math letters. */
export function baseMathLetters(value: string, alphabet: string): string {
  if (!Object.hasOwn(styledMathAlphabets, alphabet)) return value
  const { upper, lower, digits, exceptions } = styledMathAlphabets[alphabet]
  return Array.from(value, (letter) => {
    const special = exceptions.indexOf(letter)
    if (special >= 0 && special % 2 === 1) return exceptions[special - 1]
    const code = letter.codePointAt(0)!
    if (code >= upper && code < upper + 26) return String.fromCharCode(65 + code - upper)
    if (code >= lower && code < lower + 26) return String.fromCharCode(97 + code - lower)
    if (digits !== undefined && code >= digits && code < digits + 10) return String.fromCharCode(48 + code - digits)
    return letter
  }).join('')
}
