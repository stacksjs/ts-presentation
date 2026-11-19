import { expect, test } from 'bun:test'
import { createMathRenderer, renderMath } from '../src/math.ts'

test('handles general fractions, TeX math styles, and continued fractions', () => {
  const html = renderMath(String.raw`\genfrac{(}{]}{2pt}{0}{a}{b}+\cfrac[r]{1}{1+\tfrac12}`)
  expect(html).toContain('<mstyle displaystyle="true" scriptlevel="0"><mfrac linethickness="2pt">')
  expect(html).toContain('<mo stretchy="true">]</mo>')
  expect(html).toContain('<mfrac numalign="right">')
  const choices = String.raw`\mathchoice{D}{T}{S}{s} + x^{\mathchoice{D}{T}{S}{s}}`
  expect(renderMath(choices)).toContain('<mrow><mi>T</mi></mrow>')
  expect(renderMath(choices, true)).toContain('<mrow><mi>D</mi></mrow>')
  expect(renderMath(choices)).toContain('<mrow><mi>S</mi></mrow>')
})

test('positions boxes and prescripts with bounded MathML dimensions', () => {
  const formula = String.raw`\raisebox{2pt}[1ex][0pt]{x}\kern7mu \rule[-1pt]{1em}{.5pt}\smash[b]{y} \prescript{14}{6}{C}`
  const html = renderMath(formula)
  expect(html).toContain('<mpadded voffset="2pt" height="1ex" depth="0pt">')
  expect(html).toContain('<mspace width="0.3888888888888889em"/>')
  expect(html).toContain('<mpadded voffset="-1pt"><mspace width="1em" height=".5pt"')
  expect(html).toContain('<mpadded depth="0">')
  expect(html).toContain('<mmultiscripts><mrow><mi>C</mi></mrow><mprescripts/>')
  const unsafe = renderMath(String.raw`\hspace{2em" onclick="oops}`)
  expect(unsafe).toContain('math-unrendered')
  expect(unsafe).not.toContain(' onclick="')
})

test('supports optional arguments, delimited macros and scoped definitions', () => {
  const math = String.raw`\newcommand{\sumPair}[2][z]{#1 + #2}
    \def\pair#1,#2\endpair{\left(#1,#2\right)}
    \sumPair{x} \sumPair[y]{x} \pair a,b\endpair
    {\def\tmp{q}\tmp} \tmp`
  const html = renderMath(math)
  expect(html).toContain('<mi>z</mi><mo>+</mo><mi>x</mi>')
  expect(html).toContain('<mi>y</mi><mo>+</mo><mi>x</mi>')
  expect(html).toContain('<mo stretchy="true">(</mo><mi>a</mi><mo>,</mo><mi>b</mi>')
  expect(html).toContain('<mrow><mi>q</mi></mrow><mtext>\\tmp</mtext>')
})

test('captures eager macro expansion and tracks global definitions per deck', () => {
  const math = createMathRenderer()
  const html = math(String.raw`\def\x{a}\edef\frozen{\x}\def\x{b}\global\def\persist{\nope}\frozen\global\let\u=\frozen\x`, false)
  expect(html).toContain('<mi>a</mi><mi>b</mi>')
  expect(math(String.raw`\u`, false)).toContain('<mi>a</mi>')
  expect(math(String.raw`\persist`, false)).toContain('<mtext>\\nope</mtext>')
  expect(createMathRenderer()(String.raw`\u`, false)).toContain('<mtext>\\u</mtext>')
})

test('lays out AMS arrays with solid and dashed rules, row gaps, and scoped cell styles', () => {
  const source = String.raw`\def\arraystretch{1.5}\begin{darray}{|r:c||}
    \hline \def\value{a}\value & \mathchoice{D}{T}{S}{s} \\[1ex]
    \hdashline z & \value \cr \hline
  \end{darray}`
  const html = renderMath(source)
  expect(html).toContain('columnalign="right center"')
  expect(html).toContain('math-style:normal')
  expect(html).toContain('border-left:1px solid currentColor')
  expect(html).toContain('border-left:1px dashed currentColor')
  expect(html).toContain('border-right:3px double currentColor')
  expect(html).toContain('border-top:1px solid currentColor')
  expect(html).toContain('border-top:1px dashed currentColor')
  expect(html).toContain('border-bottom:1px solid currentColor')
  expect(html).toContain('padding-bottom:max(0px,calc(0.21em + 1ex))')
  expect(html).toContain('<mrow><mi>D</mi></mrow>')
  expect(html).toContain('<mtext>\\value</mtext>')
  expect(html.match(/<mtr>/g)).toHaveLength(2)
  expect(renderMath(String.raw`\begin{array}{c}a`)).toContain('math-unrendered')
  expect(renderMath(String.raw`\begin{array}{c}a\\[bogus]b\end{array}`)).toContain('math-unrendered')
})

test('renders compact substack and subarray limits with no nested equation click rows', () => {
  const html = renderMath(String.raw`\sum_{\substack{i>0\\j<n}} x_{ij} +
    \lim_{\begin{subarray}{l}i\to0\cr j\to0\end{subarray}} y`, true)
  expect(html.match(/class="math-compact-array"/g)).toHaveLength(2)
  expect(html.match(/<munder>/g)).toHaveLength(2)
  expect(html.match(/<mtr>/g)).toHaveLength(4)
  expect(html).toContain('columnalign="left"')
  expect(html).not.toContain('data-equation-lines')
  expect(renderMath(String.raw`\substack{a & b}`)).toContain('math-unrendered')
  expect(renderMath(String.raw`\begin{subarray}{r}a\end{subarray}`)).toContain('math-unrendered')
})

test('renders nested math, escaped text, accents, and stacked fonts inside TeX labels', () => {
  const html = renderMath(String.raw`\text{\textsf{\textbf{Caf\'{e}}}: $x^2$ and \(y\) costs \$5~\&~tax}`)
  expect(html).toContain('<mrow style="font-family:sans-serif"><mrow style="font-weight:bold"><mtext>Café</mtext>')
  expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  expect(html).toContain('<mi>y</mi>')
  expect(html).toContain('$5</mtext>')
  expect(html).toContain('<mtext>&amp;</mtext>')
  expect(renderMath(String.raw`\text{price $x}`)).toContain('math-unrendered')
})

test('ignores TeX comments while preserving escaped percent signs inside text', () => {
  const html = renderMath(String.raw`\text{90\%} + %\badcommand
    x`)
  expect(html).toContain('<mtext>90%</mtext><mo>+</mo><mi>x</mi>')
  expect(html).not.toContain('<mtext>\\badcommand</mtext>')
  expect(html).toContain('%\\badcommand')
})

test('lays out AMS commutative diagrams with labeled arrows and aligned columns', () => {
  const source = String.raw`\begin{CD}
  U @>f>p> V @= W \\
  @VaVV @AA b A @| \cr
  X @<q<< Y @. Z
  \end{CD}`
  const math = createMathRenderer({ throwOnError: true })
  const html = math(source, true)
  expect(html).toContain('<mtable class="math-cd">')
  expect(html.match(/<mtr>/g)).toHaveLength(3)
  expect(html.match(/<mtd>/g)).toHaveLength(15)
  expect(html).toContain('<munderover><mo stretchy="true" movablelimits="false" minsize="2em">→</mo><mrow><mi>p</mi></mrow><mrow><mi>f</mi></mrow></munderover>')
  expect(html).toContain('class="math-cd-vertical"')
  expect(html).toContain('>↓</mo>')
  expect(html).toContain('>↑</mo>')
  expect(html).toContain('>‖</mo>')
  expect(html).toContain('>←</mo>')
  expect(html).not.toContain('data-equation-lines')
})

test('keeps CD labels scoped and rejects incomplete arrows and environments', () => {
  const math = createMathRenderer({ throwOnError: true, macros: { '\\identity': 'I' } })
  const html = math(String.raw`\begin{CD}
    U @>\def\temporary{g}\temporary>> V \cr
    @. @. \cr
    X @>\identity>> Y
  \end{CD}`, true)
  expect(html).toContain('<mover><mo stretchy="true" movablelimits="false" minsize="2em">→</mo><mrow><mi>g</mi></mrow></mover>')
  expect(html).toContain('<mrow><mi>I</mi></mrow></mover>')
  expect(() => math(String.raw`\begin{CD}U @>f> V\end{CD}`, true)).toThrow('Incomplete CD arrow')
  expect(() => math(String.raw`\begin{CD}U @* V\end{CD}`, true)).toThrow('Unknown CD arrow')
  expect(() => math(String.raw`\begin{CD}
    U @>\def\temp{g}\temp>> V \\
    @. @. \\
    X @>\temp>> Y
  \end{CD}`, true)).toThrow('Unsupported math command')

  expect(renderMath(String.raw`\begin{CD}U @>>> V`, true)).toContain('math-unrendered')
})

test('renders fixed and scalable bra-ket and set-builder delimiters', () => {
  const html = renderMath(String.raw`\bra{\phi}\ket{\psi}+\Braket{\phi|\frac{H}{2}|\psi}\quad
  \Set{x||x\in\mathbb{R}, |x|<1}+\set{n|n>0}`)
  expect(html).toContain('<mo stretchy="false">⟨</mo>')
  expect(html).toContain('<mo stretchy="false">⟩</mo>')
  expect(html).toContain('<mo stretchy="true">⟨</mo>')
  expect(html).toContain('<mo stretchy="true">⟩</mo>')
  expect(html.match(/<mo stretchy="true">∣<\/mo>/g)).toHaveLength(2)
  expect(html).toContain('<mo stretchy="true">‖</mo>')
  expect(html).toContain('<mo stretchy="false">{</mo><mi>n</mi><mo>∣</mo>')
  expect(html).toContain('<mo>|</mo><mi>x</mi><mo>|</mo>')
  expect(renderMath(String.raw`\Braket{\psi|`)).toContain('math-unrendered')
})

test('places arrow, accent, and stretchy brace labels with the expected math styles', () => {
  const input = String.raw`A\xrightleftharpoons[slow]{\mathchoice{D}{T}{S}{s}}B \quad
  \overbrace{a+b}^{n} \quad \underbrace{c+d}_{m}
  \quad \widecheck{fg}+\underleftharpoon{h}`
  const html = renderMath(input, true)
  expect(html).toContain('<munderover><mo stretchy="true" movablelimits="false">⇌</mo><mrow><mi>s</mi><mi>l</mi><mi>o</mi><mi>w</mi></mrow><mrow><mrow><mi>S</mi></mrow></mrow></munderover>')
  expect(html).toContain('<mover><mover accent="true">')
  expect(html).toContain('<munder><munder accentunder="true">')
  expect(html).toContain('<mo stretchy="true">ˇ</mo>')
  expect(html).toContain('<mo stretchy="true">↽</mo>')
})
