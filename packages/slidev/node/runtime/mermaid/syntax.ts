/** Mask characters protected by a node shape, quoted string, or edge label. */
export function syntaxMask(source: string, singleQuotes = false): string {
  const stack: string[] = []
  const closes: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
  let quote = ''
  let pipe = false
  let mask = ''
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote && char === '\\' && source[index + 1]) {
      index++
      mask += '  '
      continue
    }
    const sheltered = quote || pipe || stack.length > 0
    if (quote && char === quote) quote = ''
    else if (!quote && !pipe && (char === '"' || (singleQuotes && char === "'"))) quote = char
    else if (!quote && char === '|' && !stack.length) pipe = !pipe
    else if (!quote && !pipe) {
      if (closes[char]) stack.push(closes[char])
      else if (char === stack.at(-1)) stack.pop()
    }
    mask += sheltered || quote || pipe || stack.length ? ' ' : char
  }
  return mask
}
