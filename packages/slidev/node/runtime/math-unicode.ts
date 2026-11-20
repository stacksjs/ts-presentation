// Unicode coverage and accents follow the KaTeX 0.19.1 tables and parser.
// See licenses/KaTeX-MIT.txt.
const mathSymbols = new Set(
  '£¥\u00A7¬°±¶·×ð÷ıȷΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρςστυφχψωϑϕϖϝϱϵ' +
  '…ℂℍℎℏℑℓℕ℘ℙℚℜℝℤℲℵℶℷℸ⅁←↑→↓↔↕↖↗↘↙↚↛↞↠↢↣↦↩↪↫↬↭↮↰↱↶↷↺↻↼↽↾↿⇀⇁⇂⇃⇄⇆⇇⇈⇉⇊⇋⇌⇍⇎⇏⇐⇑⇒⇓⇔⇕⇚⇛⇝⇠⇢' +
  '∀∁∂∃∇∈∋−∓∔∖∗∘∙∝∞∠∡∢∣∤∦∧∨∩∪∴∵∼∽≀≁≂≃≅≆≈≊≍≎≏≐≑≒≓≖≗≜≡≤≥≦≧≨≩≪≫≬≮≯≰≱≲≳≶≷≺≻≼≽≾≿⊀⊁' +
  '⊂⊃⊆⊇⊈⊉⊊⊋⊎⊏⊐⊑⊒⊓⊔⊕⊖⊗⊘⊙⊚⊛⊝⊞⊟⊠⊡⊢⊣⊨⊩⊪⊬⊭⊮⊯⊶⊷⊸⊺⊻⊼⋅⋇⋈⋉⋊⋋⋌⋍⋎⋏⋐⋑⋒⋓⋔⋘⋙⋚⋛⋞⋟⋠⋡⋦⋧⋨⋩⋬⋭⋯⋱' +
  '⌈⌉⌊⌋⌢⌣⎰⎱┌┐└┘◯♠♡♢♣♭♮♯✓⟨⟩⟮⟯⟵⟶⟷⟸⟹⟺⟼⩞⩽⩾⪅⪆⪇⪈⪉⪊⪋⪌⪕⪖⪯⪰⪵⪶⪷⪸⪹⪺⫅⫆⫋⫌' +
  // Literal characters also registered by KaTeX functions and built-in macros.
  '©®‼ℋℌℐℒℛℨℬℭℰℱℳ↤∉∌∏∐∑∫∬∭∮∯∰∷∹≔≕≘≙≚≛≝≞≟≠⋀⋁⋂⋃⋮⌜⌝⌞⌟⟂⟦⟧⦃⦄⦵⨀⨁⨂⨄⨆⩴',
)
const textSymbols = new Set('£¥°·ÆÐØÞßæðøþıŒœȷ\u2013\u2014‘’“”…ℂℍℎℕℙℚℝℤ©®⋮')
const styledSymbol = /^[\u{1D400}-\u{1D4B5}\u{1D504}-\u{1D551}\u{1D55C}\u{1D56C}-\u{1D63B}\u{1D670}-\u{1D6A3}\u{1D7CE}-\u{1D7D7}\u{1D7E2}-\u{1D7FF}]$/u
const textScript = /^[ÐÞþ\u0100-\u024F\u0300-\u036F\u0400-\u04FF\u0530-\u058F\u0900-\u109F\u10A0-\u10FF\u3000-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF\uFF00-\uFF60]$/u
const accentableLetter = /^[A-Za-zαβγδεϵζηθϑικλμνξοπϖρϱςστυφϕχψωΓΔΘΛΞΠΣΥΦΨΩ]$/u
const accentSuffix = /[\u0300-\u036F]+$/u

export const unicodeAccents: Readonly<Record<string, readonly [glyph: string, below?: boolean]>> = {
  '\u0300': ['\u0060'], '\u0301': ['´'], '\u0302': ['ˆ'], '\u0303': ['˜'], '\u0304': ['¯'],
  '\u0306': ['˘'], '\u0307': ['˙'], '\u0308': ['¨'], '\u030A': ['˚'], '\u030B': ['˝'],
  '\u030C': ['ˇ'], '\u0327': ['¸', true],
}

interface UnicodeToken {
  base: string
  marks: string
  diagnostic?: 'unicodeTextInMathMode' | 'unknownSymbol'
  textFallback?: boolean
}

export function readUnicodeToken(token: string, mode: 'math' | 'text'): UnicodeToken | undefined {
  if (!/[^\x00-\x7F]/.test(token)) return
  if (/^[\u2028\u2029\uD800-\uF8FF]/u.test(token)) throw new Error('Unexpected Unicode character in TeX input')
  const suffix = accentSuffix.exec(token)?.[0] ?? ''
  const original = suffix ? token.slice(0, -suffix.length) : token
  if (!original) throw new Error('A Unicode combining accent requires a base character')
  const symbols = mode === 'math' ? mathSymbols : textSymbols
  const known = original.charCodeAt(0) < 0x80 || symbols.has(original) || styledSymbol.test(original)
  // Normalize supported precomposed accents without rewriting other scripts.
  if (!known) {
    const decomposed = original.normalize('NFD')
    const base = decomposed[0]
    const marks = decomposed.slice(1)
    if (marks && accentableLetter.test(base) && decomposed.normalize('NFC') === original
      && [...marks].every(mark => Object.hasOwn(unicodeAccents, mark))) {
      validateAccents(suffix)
      const diagnostic = mode === 'math' ? 'unicodeTextInMathMode' : /^[A-Za-z]$/.test(base) ? undefined : 'unknownSymbol'
      return { base, marks: marks + suffix, diagnostic }
    }
  }
  validateAccents(suffix)
  if (known) return { base: original, marks: suffix }
  const diagnostic = textScript.test(original)
    ? mode === 'math' ? 'unicodeTextInMathMode' : undefined
    : 'unknownSymbol'
  return { base: original, marks: suffix, diagnostic, textFallback: true }
}

function validateAccents(marks: string): void {
  for (const mark of marks) {
    if (!Object.hasOwn(unicodeAccents, mark)) throw new Error(`Unknown Unicode combining accent: ${mark}`)
  }
}
