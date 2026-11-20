import { expect, test } from 'bun:test'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { collectSnapshot } from '../packages/slidev/node/runtime/editable/walker.ts'
import { createMathRenderer, renderMath } from '../packages/slidev/node/runtime/math.ts'

const thin = '<mspace width="0.16666666666666666em"/>'
const medium = '<mspace width="0.2222222222222222em"/>'
const thick = '<mspace width="0.2777777777777778em"/>'
const zeroGap = 'lspace="0em" rspace="0em"'
const operator = (glyph: string) => `<mo ${zeroGap}>${glyph}</mo>`

test('renders supplemental AMS relations, binary operators, and punctuation with distinct spacing', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`
    \def\containsMore{\supsetneqq}
    a \containsMore b \boxplus c \nleqslant d \rightleftharpoons e \cdotp \And \beth \lvertneqq \nsupseteqq
  `, true)
  expect(html).toContain(thick + operator('⫌') + thick)
  expect(html).toContain(medium + operator('⊞') + medium)
  expect(html).toContain(thick + operator('⩽̸') + thick)
  expect(html).toContain('>⇌</mo>')
  expect(html).toContain('>≨\uFE00</mo>')
  expect(html).toContain('>⫆\u0338</mo>')
  expect(html).toContain(`<mi>e</mi><mo separator="true" ${zeroGap}>⋅</mo>${thin}${operator('&amp;')}<mtext>ℶ</mtext>`)
})

test('uses supplemental symbols in contextual dots, negations, text, and operator names', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`a \dots \subsetneqq b + \not\gtrsim c`, false)).toContain('>⋯</mo>')
  const literal = 'a ' + String.raw`\dots` + ' ⫋ b'
  expect(math(literal, false)).toContain('<mo>⋯</mo>')
  const html = math(String.raw`\text{\S\textdagger\textbraceleft\textsterling\textbraceright}+\operatorname{\vdash\,closure}(x)`, false)
  expect(html).toContain('<mtext>§†{£}</mtext>')
  expect(html).toContain('<mo>⊢\u2009closure</mo>')
  expect(math(String.raw`a \not\gtrsim b`, false)).toContain('≵</mo>')
  expect(() => math(String.raw`\notARealMacro`, false)).toThrow('Unsupported math command')
})

test('expands a token after a delayed definition target and preserves noexpand through edef', () => {
  const math = createMathRenderer({ throwOnError: true })
  const delayed = math(String.raw`\def\target{X}\def\name{\target}\expandafter\def\name{A}\target`, false)
  expect(delayed).toContain('<mrow><mi>A</mi></mrow>')
  const eager = math(String.raw`\def\pick{A}\def\keep{\noexpand\pick}\edef\saved{\keep}\def\pick{B}\saved`, false)
  expect(eager).toContain('<mrow><mi>B</mi></mrow>')
  expect(math(String.raw`\def\skipme{A}x\noexpand\skipme B `, false)).toContain('<mrow><mi>x</mi><mi>B</mi></mrow>')
  expect(() => math(String.raw`\expandafter\def`, false)).toThrow('Missing token after delayed math expansion')
})

test('keeps a snapshot of the lookahead and primitive meanings when using let', () => {
  const math = createMathRenderer({ throwOnError: true })
  const clauses = math(String.raw`\def\original{A}\def\action{\def\original{B}\next}\futurelet\next\action\original`, false)
  expect(clauses).toContain('<mrow><mi>A</mi><mi>B</mi></mrow>')
  const local = math(String.raw`\def\next{Z}{\def\action{\next}\futurelet\next\action A}\next`, false)
  expect(local).toContain('<mrow><mrow><mi>A</mi><mi>A</mi></mrow><mi>Z</mi></mrow>')
  const primitive = math(String.raw`\let\oldfrac=\frac\edef\copy{\oldfrac}\def\frac{X}\copy{1}{2}\frac`, false)
  expect(primitive).toContain('<mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac><mi>X</mi>')
  expect(math(String.raw`\let\word=\textunderscore\text{literal: \word.}`, false)).toContain('literal: _.')
})

test('selects TeX macro branches before parsing and keeps lookahead tokens available', () => {
  const math = createMathRenderer({ throwOnError: true })
  const source = String.raw`
    \def\star{*}
    \def\choice{\@ifstar{\alpha}{\beta}}
    \def\optional{\@ifnextchar[\explicit\defaultRoot}
    \def\explicit[#1]{\sqrt[#1]{x}}
    \def\defaultRoot{\sqrt{x}}
    \choice* \choice\star + \optional [3] + \optional
  `
  const html = math(source, false)
  expect(html).toContain('<mi>α</mi><mi>β</mi><mo>*</mo>')
  expect(html).toContain('<mroot><mrow><mi>x</mi></mrow><mrow><mn>3</mn></mrow></mroot>')
  expect(html).toContain('<msqrt><mrow><mi>x</mi></mrow></msqrt>')
  expect(math(String.raw`\@firstoftwo{\frac}{\unrecognized}12`, false)).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
  expect(math(String.raw`\@ifnextchar{ab}{X}{Y}a`, false)).toContain('<mi>Y</mi><mi>a</mi>')
  expect(() => math(String.raw`\text{\@ifstar{yes}}`, false)).toThrow('Missing math argument')
})

test('expands conditionals eagerly and snapshots their meaning through let', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`
    \def\letter{A}
    \edef\saved{\@secondoftwo{C}{\letter}\@ifstar{S}{U}*}
    \def\letter{B}
    \let\choose=\@ifstar
    \def\@ifstar{W}
    \saved\choose{X}{Y}*
  `, false)
  expect(html).toContain('<mi>A</mi><mi>S</mi><mi>X</mi>')
  expect(math(String.raw`\expandafter\frac\@firstoftwo{12}{34}`, false)).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
  expect(() => math(String.raw`\def\cycle{\@ifstar{\cycle}{\cycle}}\cycle`, false)).toThrow('Too many math macro expansions')
})

test('selects text or math expansions across nested math and equation tags', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\def\unit{\TextOrMath{meters}{\mu}}
    \unit + \text{in \unit: $\unit$ or \(\unit\) and \unit}\tag{\unit}`, true)
  expect(html).toContain('<mtext>in meters: </mtext>')
  expect(html).toContain('<mtext> and meters</mtext>')
  expect(html).toContain('<mtext>(meters)</mtext>')
  expect(html.match(/<mi>μ<\/mi>/g)).toHaveLength(3)
})

test('renders phase angles, actuarial notation, pseudo-bold, and strikeout as MathML', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\phase{-78^\circ} + a_{\angl{n+1}}+b_\angln + \pmb{\mu} + \text{old \sout{term $x^2$}}`, true)
  expect(html).toContain('<mrow class="math-phase">')
  expect(html.match(/class="math-angl"/g)).toHaveLength(2)
  expect(html).toContain('<mrow class="math-angl"><mi>n</mi></mrow>')
  expect(html).toContain('<mrow class="math-pmb"><mrow><mi>μ</mi>')
  expect(html).toContain('<mrow class="math-sout"><mrow><mtext>term')
  expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
})

test('scopes TeX font sizing across groups, text, and nested math', () => {
  const math = createMathRenderer({ throwOnError: true })
  const markup = math(String.raw`A {\tiny b {\normalsize c} \large d} + \text{\Large Wide {\small note} end} + E `, true)
  expect(markup).toContain('<mstyle mathsize="0.5em"><mi>b</mi><mrow><mstyle mathsize="2em"><mi>c</mi></mstyle></mrow>')
  expect(markup).toContain('<mstyle mathsize="2.4em"><mi>d</mi></mstyle>')
  expect(markup).toContain('<mstyle mathsize="1.44em"><mtext>Wide')
  expect(markup).toContain('<mstyle mathsize="0.625em"><mtext>note</mtext></mstyle>')
  expect(markup).toContain('<mo>+</mo><mi>E</mi></mrow>')
})

test('renders spacing and expanded symbols in named TeX operators', () => {
  const markup = createMathRenderer({ throwOnError: true })(String.raw`
    \def\greekLabel{\alpha}
    \operatorname*{arg\,max}_{x} + \operatorname{D_\greekLabel}(x)
  `, true)
  expect(markup).toContain('<munder><mo>arg\u2009max</mo><mrow><mi>x</mi></mrow></munder>')
  expect(markup).toContain('<mo>D_α</mo>')
})

test('renders formatted equation tags and applies them to the correct alignment row', () => {
  const math = createMathRenderer({ throwOnError: true, leqno: true })
  const equation = math(String.raw`\def\num{VII} \sum_n x_n \tag{\num\textbf{b}, $x^2$}`, true)
  expect(equation).toContain('<mtext>(VII</mtext><mrow style="font-weight:bold"><mtext>b</mtext>')
  expect(equation).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  expect(equation).toContain('<mtext>)</mtext>')
  expect(equation.indexOf('math-equation-number')).toBeLessThan(equation.indexOf('<munder>'))

  const align = math(String.raw`\begin{align} a&=b\tag*{First}\\ c&=d\notag\\ e&=f\end{align}`, true)
  expect(Array.from(align.matchAll(/class="math-equation-number">(.*?)<\/mtd>/g), match => match[1])).toEqual([
    '<mtext>First</mtext>', '', '<mtext>(1)</mtext>',
  ])
  expect(() => math(String.raw`a\tag*{}\tag{b}`, true)).toThrow('Multiple tags')
  expect(() => math(String.raw`a\tag{b}`, false)).toThrow('Equation tags require display math')
})

test('sets spacing and fences for explicit TeX atom classes', () => {
  const math = createMathRenderer({ throwOnError: true })
  const markup = math(String.raw`a\mathbin{*}b\mathrel{:}c\mathpunct{!}\mathopen{[}d\mathclose{]}\mathord{+}\mathinner{\frac e f}`, false)
  expect(markup).toContain(medium + operator('*') + medium)
  expect(markup).toContain(thick + operator(':') + thick)
  expect(markup).toContain(`<mo separator="true" ${zeroGap}>!</mo>${thin}`)
  expect(markup).toContain(`form="prefix" ${zeroGap}>[</mo>`)
  expect(markup).toContain(`form="postfix" ${zeroGap}>]</mo>`)
  expect(markup).toContain('<mi mathvariant="normal">+</mi>')
  expect(markup).toMatch(/<mspace width="0\.1666[^"]+"\/><mrow><mrow><mfrac>/)
})

test('uses one TeX gap per pair and gives unary binary symbols no extra space', () => {
  const math = createMathRenderer({ throwOnError: true })
  const run = math(String.raw`\mathbin{-}a \mathbin{+}-b = \mathbin{-}c\mathbin{+}`, false)
  expect(run).toContain(`<mrow>${operator('−')}<mi>a</mi>${medium}${operator('+')}${medium}${operator('−')}<mi>b</mi>${thick}${operator('=')}${thick}${operator('−')}<mi>c</mi>${operator('+')}</mrow>`)
  expect(math(String.raw`a\mathrel{=}\mathrel{<}b`, false))
    .toContain(thick + operator('=') + operator('&lt;') + thick)
  expect(math(String.raw`(\mathbin{-}a\mathbin{+})`, false)).not.toContain('<mspace')
  expect(math(String.raw`a\mathbin{+}\kern2mu b`, false))
    .toContain(medium + operator('+') + '<mspace width="0.1111111111111111em"/>' + medium)
})

test('sets gaps outside composite script bases and uses tight spacing inside scripts', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`a\mathrel{\frac{1}{2}}_k b`, false))
    .toContain(`${thick}<msub><mrow><mrow><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></mrow></mrow><mi>k</mi></msub>${thick}`)
  const script = math(String.raw`x^{a\mathbin{+}b\mathrel{=}c\mathop{F}d}`, false)
  expect(script).toContain(`<mrow><mi>a</mi>${operator('+')}<mi>b</mi>${operator('=')}<mi>c</mi>${thin}`)
  expect(script).toContain(`>F</mo>${thin}<mi>d</mi></mrow></msup>`)
  expect(math(String.raw`\tfrac{a\boxplus b}{c\mathrel{=}d}`, false)).not.toContain('<mspace')
  expect(math(String.raw`\dfrac{a\boxplus b}{c\mathrel{=}d}`, false)).toContain(medium + operator('⊞') + medium)
})

test('handles operator limits and literal Unicode large operators in display and inline math', () => {
  const math = createMathRenderer({ throwOnError: true })
  const source = String.raw`\mathop{\mathrm{select}}\displaylimits_{i=1}^n + \bigotimes_i X_i + ${'∑'}_j a_j`
  expect(math(source, true).match(/<munderover>|<munder>/g)).toHaveLength(3)
  expect(math(source, false)).not.toMatch(/<munderover>|<munder>/)
  expect(math(String.raw`\mathop{X}\limits_i + ${'∫'}\limits_0^1`, false)).toContain(`<munderover><mo movablelimits="false" ${zeroGap}>∫</mo>`)
  expect(math('∑' + String.raw`\nolimits_i + \mathop{\mathrm{arg\,min}}_j`, true)).not.toContain('<munder>')
})

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
  expect(html).toContain('<mo stretchy="false">|</mo><mi>x</mi><mo stretchy="false">|</mo>')
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

test('sets text and mixed math in framed, raised, and centered boxes', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = String.raw`\vcenter{\hbox{\fcolorbox{d66c21}{#fc9}{$\frac{a}{b}$ result}}}
    + \raisebox{.3em}{$y^2$} + \text{\fbox{check}}
    + \colorbox{yellow}{draft} + \textcolor{228B22}{x}
    + \reflectbox{R} + \mathreflectbox{x^2}`
  const html = math(formula, true)
  expect(html).toContain('<mtable class="math-vcenter">')
  expect(html).toContain('style="background-color:#fc9;border-color:#d66c21"')
  expect(html).toContain('<mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac>')
  expect(html).toContain('<mtext> result</mtext>')
  expect(html).toContain('<mpadded voffset=".3em"><mrow style="font-style:normal;font-weight:normal"><mstyle displaystyle="false" scriptlevel="0"><msup><mi>y</mi><mn>2</mn></msup>')
  expect(html).toContain('class="math-color-box math-frame"><mtext>check</mtext>')
  expect(html).toContain('style="background-color:yellow"><mtext>draft</mtext>')
  expect(html).toContain('style="color:#228B22"')
  expect(html.match(/class="math-reflect"/g)).toHaveLength(2)
  expect(() => math(String.raw`\colorbox{red;display:none}{x}`, true)).toThrow('Invalid math box color')
  expect(renderMath(String.raw`\fcolorbox{red"}{white}{<img>}`)).toContain('math-unrendered')
})

test('keeps style-dependent math in a lap and uses text mode for plain laps', () => {
  const html = renderMath(String.raw`\sum_{\mathclap{\mathchoice{D}{T}{S}{s}}}+\text{\rlap{test}}`, true)
  expect(html).toContain('<munder>')
  expect(html).toContain('<mpadded width="0"><mrow class="math-overlap-c"><mrow><mrow><mi>S</mi></mrow>')
  expect(html).toContain('<mpadded width="0"><mrow class="math-overlap-r"><mtext>test</mtext>')
})

const chrome = await findChrome()
test.skipIf(!chrome)('keeps tagged displays centered and supports flush-left math in Chromium', async () => {
  const options = [{}, { leqno: true }, { fleqn: true }, { fleqn: true }]
  const body = options.map((settings, index) => {
    const source = index === 2 ? String.raw`\dfrac{x}{y}=1` : String.raw`\dfrac{x}{y}=1\tag{Taylor $k$}`
    return `<div>${createMathRenderer(settings)(source, true)}</div>`
  }).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="width:600px;font-size:30px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 720, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const layout = await view.evaluate<{ shift: number, center: number, leftTag?: number, rightTag?: number }[]>(`[...document.querySelectorAll('main div')].map(example => {
      const outer = example.getBoundingClientRect()
      const formula = example.querySelector('mtable mtd:not(.math-equation-number,[aria-hidden]) > mrow, semantics > mrow').getBoundingClientRect()
      const tag = example.querySelector('.math-equation-number')?.getBoundingClientRect()
      return {
        shift: formula.left - outer.left,
        center: formula.left + formula.width / 2 - (outer.left + outer.width / 2),
        leftTag: tag ? tag.left - outer.left : undefined,
        rightTag: tag ? outer.right - tag.right : undefined,
      }
    })`)
    expect(layout[0].center).toBeCloseTo(0)
    expect(layout[0].rightTag).toBeCloseTo(0)
    expect(layout[1].center).toBeCloseTo(0)
    expect(layout[1].leftTag).toBeCloseTo(0)
    expect(layout[2].shift).toBeCloseTo(60)
    expect(layout[3].shift).toBeCloseTo(60)
    expect(layout[3].rightTag).toBeCloseTo(0)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('lays out TeX atom gaps at the expected widths in Chromium', async () => {
  const formulas = [
    String.raw`a\mathbin{+}b`,
    String.raw`\mathbin{+}a`,
    String.raw`a\mathrel{=}b`,
    String.raw`x^{a\mathbin{+}b}`,
    String.raw`a\mathinner{+}b`,
    String.raw`a\mathinner{+}_i b`,
  ]
  const body = formulas.map(tex => `<div>${renderMath(tex)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:36px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 720, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const gaps = await view.evaluate<number[][]>(`[...document.querySelectorAll('main div mo')].map(glyph => {
      const operator = glyph.closest('semantics > mrow > :is(msub, mrow)') ?? glyph
      const box = operator.getBoundingClientRect()
      const gap = (sibling, before) => {
        if (!sibling) return 0
        const bounds = sibling.getBoundingClientRect()
        const isSpace = sibling.localName === 'mspace'
        return before ? box.left - (isSpace ? bounds.left : bounds.right) : (isSpace ? bounds.right : bounds.left) - box.right
      }
      return [gap(operator.previousElementSibling, true), gap(operator.nextElementSibling, false)]
    })`)
    expect(gaps.map(pair => pair.map(Math.round))).toEqual([[8, 8], [0, 0], [10, 10], [0, 0], [6, 6], [6, 6]])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('positions lap contents and explicit operator limits in Chromium', async () => {
  const formulas = [
    { id: 'reference', tex: 'AB' },
    { id: 'left', tex: String.raw`A\mathllap{xyz}B` },
    { id: 'center', tex: String.raw`A\mathclap{xyz}B` },
    { id: 'right', tex: String.raw`A\mathrlap{xyz}B` },
  ]
  const body = formulas.map(({ id, tex }) => `<div id="${id}">${renderMath(tex)}</div>`).join('')
  const limits = `<section id="limits">${renderMath(String.raw`\sum\limits_{k=0} + \sum_{k=0}`)}</section>`
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === '/presentation.css') return new Response(css)
      return new Response(`<!doctype html><link rel="stylesheet" href="/presentation.css"><main style="margin: 60px; font-size: 36px">${body}${limits}<aside>${renderMath(String.raw`\mathllap{xyz}AB`)}</aside></main>`, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    },
  })
  const view = new Bun.WebView({ width: 720, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const layout = await view.evaluate<Array<{ end: number, anchor?: number, start?: number, width?: number }>>(`[...document.querySelectorAll('main > div')].map((formula) => {
      const row = formula.querySelector('semantics > mrow')
      const lap = row.querySelector('mpadded')
      const content = lap?.firstElementChild.getBoundingClientRect()
      return {
        end: row.lastElementChild.getBoundingClientRect().left,
        anchor: lap?.getBoundingClientRect().left,
        start: content?.left,
        width: content?.width,
      }
    })`)
    const [reference, ...laps] = layout
    for (const [{ end, anchor, start, width }, alignment] of laps.map((lap, index) => [lap, [1, 0.5, 0][index]] as const)) {
      expect(end).toBeCloseTo(reference.end)
      expect(width).toBeGreaterThan(0)
      expect(start).toBeCloseTo(anchor! - width! * alignment)
    }
    const { slides: [{ nodes }] } = await view.evaluate<ReturnType<typeof collectSnapshot>>(`(${collectSnapshot.toString()})({
      containerSelector: 'main', idAttribute: 'data-export-id', slide: 1, click: 0,
    })`)
    const overflow = nodes.filter(node => node.isMath).at(-1)
    const bounds = await view.evaluate<{ actualLeft: number, inkLeft: number }>(`(() => ({
      actualLeft: document.querySelector('aside math').getBoundingClientRect().left,
      inkLeft: document.querySelector('aside .math-overlap-l').getBoundingClientRect().left,
    }))()`)
    expect(bounds.inkLeft).toBeLessThan(bounds.actualLeft)
    expect(overflow?.pageRect?.x).toBeCloseTo(bounds.inkLeft)
    const [stacked, inline] = await view.evaluate<number[]>(`[...document.querySelectorAll('#limits :is(munder, msub)')].map(node => {
      const [base, lower] = [...node.children].map(part => part.getBoundingClientRect())
      return lower.x + lower.width / 2 - base.x - base.width / 2
    })`)
    expect(Math.abs(stacked)).toBeLessThan(2)
    expect(inline).toBeGreaterThan(5)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

function formula(source: string, display = false): string {
  return createMathRenderer({ throwOnError: true })(source, display).split('<annotation')[0]
}

// Cases adapted from KaTeX's delimiter and prime parser tests.
test('renders fixed TeX delimiter sizes with open, middle, and close spacing', () => {
  const input = String.raw`\bigl( a \bigr) \Bigl\lbrack b \Bigr\rbrack
    \biggl\langle c \biggm\Vert d \biggr\rangle \Bigg\updownarrow`
  const html = formula(input)
  expect(html).toContain('fence="true" form="prefix" lspace="0em" rspace="0em" minsize="1.2em" maxsize="1.2em">(')
  expect(html).toContain('maxsize="1.8em">[</mo>')
  expect(html).toContain('fence="false" form="infix" lspace="0.278em" rspace="0.278em" minsize="2.4em" maxsize="2.4em">‖')
  expect(html).toContain('maxsize="3em">↕</mo>')
  expect(formula(String.raw`\Bigl{(}x\Biggr.`)).not.toContain('maxsize="3em"')
})

test('pairs nested stretchy delimiters, expands aliases, and supports invisible ends', () => {
  const html = formula(String.raw`\def\open{\lt}\left\open
    \left. \frac{x}{2} \right\rvert \middle\Vert y \right\gt`)
  expect(html).toContain('<mo stretchy="true">⟨</mo>')
  expect(html).toContain('<mo stretchy="true" symmetric="true" form="infix">‖</mo>')
  expect(html).toContain('<mo stretchy="true">⟩</mo>')
  expect(html).toContain('<mo stretchy="true">|</mo>')
  expect(html).not.toContain('>.</mo>')
  expect(() => formula(String.raw`\left(x`)).toThrow('Missing \\right')
  expect(() => formula(String.raw`\right)x`)).toThrow('Unexpected \\right')
  expect(() => formula(String.raw`x\middle|y`)).toThrow('\\middle requires')
  expect(() => formula(String.raw`\left q x\right)`)).toThrow('Invalid delimiter')
  expect(() => formula(String.raw`\Bigl{aa}`)).toThrow('Invalid delimiter')
  expect(() => formula(String.raw`\left(x{\right) y}`)).toThrow('Unexpected \\right')
  expect(renderMath(String.raw`\left(x & y\right)`)).toContain('math-unrendered')
})

test('retains primes with explicit exponents and renders Unicode scripts on one base', () => {
  expect(formula("x''''")).toContain('<msup><mi>x</mi><mrow><mo>′′′′</mo></mrow></msup>')
  const expected = '<msubsup><mi>x</mi><mn>2</mn><mrow><mo>′′</mo></mrow></msubsup>'
  expect(formula("x''_2")).toContain(expected)
  expect(formula("x_2''")).toContain(expected)
  expect(formula("f''^3")).toContain('<msup><mi>f</mi><mrow><mo>′′</mo><mn>3</mn></mrow></msup>')
  expect(formula('y⁻¹²ᵢⱼ')).toContain('<msubsup><mi>y</mi><mrow><mi>i</mi><mi>j</mi></mrow><mrow><mo>−</mo><mn>12</mn></mrow></msubsup>')
  expect(formula('zᵦᶿ')).toContain('<msubsup><mi>z</mi><mrow><mi>β</mi></mrow><mrow><mi>θ</mi></mrow></msubsup>')
  expect(formula('x′')).toContain('<msup><mi>x</mi><mrow><mo>′</mo></mrow></msup>')
  expect(formula('^2_1')).toContain('<msubsup><mrow/><mn>1</mn><mn>2</mn></msubsup>')
  expect(() => formula('x_1_2')).toThrow('Double subscript')
  expect(() => formula('x^1^2')).toThrow('Double superscript')
  expect(() => formula("x^1'")).toThrow('Double superscript')
  expect(() => formula('x²^3')).toThrow('Double superscript')
  expect(() => formula(String.raw`\sqrt^23`)).toThrow('Missing math argument')
})

test('sets contextual dots and negated operators beside the surrounding math', () => {
  expect(formula(String.raw`1,\dotsc,10`)).toContain('<mo>,</mo><mo>…</mo><mo>,</mo>')
  expect(formula(String.raw`x + \dots + y`)).toContain('<mo>+</mo><mo>⋯</mo><mo>+</mo>')
  expect(formula(String.raw`\def\rel{\leq} x \dots\rel y`)).toContain('<mo>⋯</mo><mo>≤</mo>')
  expect(formula(String.raw`\int\dots\int`)).toContain('<mspace width="0" style="margin-inline-end:-0.16666666666666666em"/><mo>⋯</mo></mrow><mo>∫</mo>')
  expect(formula(String.raw`x+\dotso+y`)).toContain('<mo>+</mo><mo>…</mo><mo>+</mo>')
  expect(formula(String.raw`x\not<y\not\subseteq Z`)).toContain('<mi>x</mi><mo>≮</mo><mi>y</mi><mo>⊈</mo><mi>Z</mi>')
  expect(formula(String.raw`x\not{\in}S`)).toContain('<mrow><mo>∉</mo></mrow>')
  expect(formula(String.raw`x\not\mapsto y`)).toContain('<mo>↦̸</mo>')
  expect(formula(String.raw`\not{\frac{a}{b}}`)).toContain('<mrow class="math-cancel"><mrow><mfrac>')
})

test('resolves modular spacing and named limit placement from the math style', () => {
  expect(formula(String.raw`x\equiv1\pmod{6}`)).toContain('<mspace width="0.4444444444444444em"/><mrow><mo stretchy="false">(</mo><mi mathvariant="normal">mod</mi>')
  expect(formula(String.raw`x\equiv1\pmod{6}`, true)).toContain('<mspace width="1em"/><mrow><mo stretchy="false">(</mo><mi mathvariant="normal">mod</mi>')
  expect(formula(String.raw`x\mod{6}`)).toContain('<mspace width="0.6666666666666666em"/><mi mathvariant="normal">mod</mi><mspace width="0.3333333333333333em"/>')
  expect(formula(String.raw`x\pod{6}`)).not.toContain('>mod<')
  expect(formula(String.raw`x\bmod 6`)).toContain('<mi mathvariant="normal">mod</mi><mspace width="0.2777777777777778em"/></mrow><mn>6</mn>')
  expect(formula(String.raw`\limsup_{n\to\infty}x_n`, true)).toContain('<munder><mo>lim sup</mo>')
  expect(formula(String.raw`\liminf_{n\to\infty}x_n`)).toContain('<msub><mo>lim inf</mo>')
  expect(formula(String.raw`\varinjlim_n x_n`, true)).toContain('<munder><munder accentunder="true"><mo>lim</mo>')
  expect(formula(String.raw`\varliminf_n x_n`, true)).toContain('<munder><mo class="math-underline">lim</mo>')
})

test.skipIf(!chrome)('lays out delimiter sizes, signed kerns, and scoped font sizes in Chromium', async () => {
  const examples = [
    ['plain', String.raw`(\frac{1}{\frac{2}{3}})`],
    ['fixed', String.raw`\bigl(A\bigr)\Bigl(A\Bigr)\biggl(A\biggr)\Biggl(A\Biggr)`],
    ['paired', String.raw`\left(\frac{1}{\frac{2}{3}}\middle|x\right)`],
    ['no-kern', 'xy'],
    ['negative-kern', String.raw`x\mkern-4mu y`],
    ['thin-negative', String.raw`x\!y`],
    ['font-sizes', String.raw`A{\tiny b{\normalsize c}\large d}E + \text{\Large wide {\small note} end}`],
  ]
  const content = examples.map(([id, source]) => `<div id="${id}">${renderMath(source, true)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:36px">${content}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 720, height: 500, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const metrics = await view.evaluate<{ plain: number, sizes: number[], paired: number[], kerns: number[], fontSizes: number[] }>(`(() => {
      const heights = (selector) => [...document.querySelectorAll(selector)].map(element => element.getBoundingClientRect().height)
      return {
        plain: heights('#plain mo')[0],
        sizes: heights('#fixed mo[form="prefix"]'),
        paired: heights('#paired mo[stretchy="true"]'),
        fontSizes: [...document.querySelectorAll('#font-sizes :is(mi,mtext)')].map(node => Number.parseFloat(getComputedStyle(node).fontSize)),
        kerns: [...document.querySelectorAll('#no-kern, #negative-kern, #thin-negative')].map((example) => {
          const [first, second] = example.querySelectorAll('mi')
          return second.getBoundingClientRect().left - first.getBoundingClientRect().left
        }),
      }
    })()`)
    expect(metrics.sizes).toHaveLength(4)
    expect(metrics.paired).toHaveLength(3)
    for (const [index, height] of metrics.sizes.entries())
      expect(height).toBeGreaterThan(index ? metrics.sizes[index - 1] : metrics.plain)
    for (const height of metrics.paired) expect(height).toBeGreaterThan(metrics.plain * 1.2)
    expect(metrics.kerns[0] - metrics.kerns[1]).toBeCloseTo(8, 0)
    expect(metrics.kerns[0] - metrics.kerns[2]).toBeCloseTo(36 * 0.17, 0)
    for (const [index, ratio] of [1, 0.5, 1, 1.2, 1, 1.44, 0.9, 1.44].entries())
      expect(metrics.fontSizes[index]).toBeCloseTo(36 * ratio, 1)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

// Cases adapted from the KaTeX infix builder and matrix tests.
test.each([
  ['over', '', '<mfrac>'],
  ['atop', '', '<mfrac linethickness="0">'],
  ['choose', '()', '<mfrac linethickness="0">'],
  ['brace', '{}', '<mfrac linethickness="0">'],
  ['brack', '[]', '<mfrac linethickness="0">'],
])('renders infix %s with a correctly grouped numerator and denominator', (command, delimiters, open) => {
  const html = formula(`a+b \\${command} c+d`)
  expect(html).toContain(`${open}<mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac>`)
  for (const delimiter of delimiters) expect(html).toContain(`<mo stretchy="true">${delimiter}</mo>`)
  if (!delimiters) expect(html).not.toContain('<mo stretchy="true">')
})

test('honors custom generalized fraction bars, delimiters, and explicit styles', () => {
  expect(formula(String.raw`\def\width{2pt} a\above{\width}b`)).toContain('<mfrac linethickness="2pt">')
  expect(formula(String.raw`a\above.3em b`)).toContain('<mfrac linethickness=".3em">')
  expect(formula(String.raw`a\above{} b`)).toContain('<mfrac linethickness="0">')
  expect(formula(String.raw`a\above{-1pt} b`)).toContain('<mfrac linethickness="0">')
  expect(formula(String.raw`\genfrac{}{}{}{}{a}{b}`)).toContain('<mfrac>')
  expect(formula(String.raw`\genfrac{}{}{0pt}{}{a}{b}`)).toContain('<mfrac linethickness="0">')

  const html = formula(String.raw`\def\L{(}\genfrac\L ] 2pt {1} a{a+1}`, true)
  expect(html).toContain('<mo stretchy="true">(</mo><mstyle displaystyle="false" scriptlevel="0"><mfrac linethickness="2pt">')
  expect(html).toContain('<mo stretchy="true">]</mo>')
  expect(() => formula(String.raw`a\above{50} b`)).toThrow('Invalid math dimension')
  expect(() => formula(String.raw`\genfrac{}{}{2pt}{9}ab`)).toThrow('Invalid fraction style')
  expect(() => formula(String.raw`\genfrac{}{}{}{}{n}`)).toThrow('Missing math argument')
})

test('resolves math choice and limit placement once the fraction style is known', () => {
  const source = String.raw`\def\pick{\mathchoice{D}{T}{S}{s}}\pick\over\pick`
  for (const [display, choice] of [[true, 'T'], [false, 'S']] as const) {
    const selected = `<mrow><mrow><mi>${choice}</mi></mrow></mrow>`
    expect(formula(source, display)).toContain(`<mfrac>${selected}${selected}</mfrac>`)
  }
  expect(formula(String.raw`x^{\mathchoice{D}{T}{S}{s}\over 2}`, true)).toContain('<mrow><mi>s</mi></mrow>')
  const limits = formula(String.raw`\displaystyle\sum_{k=0}^n k \over \color{blue}\sum_{k=0}^n k`, true)
  expect(limits).toContain('<mstyle displaystyle="true" scriptlevel="0"><munderover><mo>∑</mo>')
  expect(limits).toContain('<mrow style="color:blue"><msubsup><mo>∑</mo>')
  expect(() => formula(String.raw`\mathchoice{a}{b}`)).toThrow('Missing math choice')
})

test('groups infix fractions within braces, matrices, and matching fences', () => {
  const groups = formula(String.raw`{a\over b}\atop{c\over d}`)
  expect(groups.match(/<mfrac\b/g)).toHaveLength(3)
  expect(groups).toContain('<mfrac linethickness="0">')
  const matrix = formula(String.raw`\begin{matrix}0&1\over2&3\\4&5&6\end{matrix}`)
  expect(matrix.match(/<mtd\b/g)).toHaveLength(6)
  expect(matrix).toContain('<mtd><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></mtd>')
  expect(formula(String.raw`\left(a\over b\right)`)).toContain('<mo stretchy="true">(</mo><mfrac>')
  expect(() => formula(String.raw`a\over b\atop c`)).toThrow('Only one infix fraction')
  expect(renderMath(String.raw`a\over b\over c`)).toContain('math-unrendered')
})

test('accepts macro-generated infix syntax without leaking group-local definitions', () => {
  const source = String.raw`\def\separator{\choose}{\def\x{A}\x \separator \x}`
  const html = formula(source)
  expect(html).toContain('<mfrac linethickness="0"><mrow><mi>A</mi></mrow><mrow><mi>A</mi></mrow>')
  expect(() => formula(source + String.raw`\x`)).toThrow('Unsupported math command')
  expect(formula(String.raw`\sqrt[\mathchoice{D}{T}{S}{s}]{27}`)).toContain('<mroot><mrow><mn>27</mn></mrow><mrow><mrow><mi>s</mi>')
})

test('applies the last operator limit control even after scripts', () => {
  const explicit = formula(String.raw`\int_2\nolimits^3\limits f(x)`)
  expect(explicit).toContain('<munderover><mo movablelimits="false">∫</mo><mn>2</mn><mn>3</mn></munderover>')
  const side = formula(String.raw`\sum\limits_3^4\nolimits`, true)
  expect(side).toContain('<msubsup><mo>∑</mo><mn>3</mn><mn>4</mn></msubsup>')
  expect(formula(String.raw`\mathop{\mathrm{arg}}\limits_x`)).toContain('<munder><mrow>')
  expect(formula(String.raw`\operatornamewithlimits{arg}_x`, true)).toContain('<munder><mo>arg</mo><mi>x</mi></munder>')
  expect(formula(String.raw`\smallint_{a}^{b}`, true)).toContain('<munderover><mo largeop="false">∫</mo>')
  expect(() => formula(String.raw`3\nolimits_2`)).toThrow('Limit control requires a math operator')
})

test('renders TeX character codes, zero-width struts, and common font aliases', () => {
  const html = renderMath(String.raw`\char"263A+\char'101+\char66+\sqrt{\mathstrut x}+\mathscr{F}+\bm{v}`)
  expect(html).toContain('<mtext>☺</mtext><mo>+</mo><mi>A</mi><mo>+</mo><mi>B</mi>')
  expect(html).toContain('<mpadded width="0"><mphantom><mo stretchy="false">(</mo></mphantom></mpadded>')
  expect(html).toContain('mathvariant="script"')
  expect(html).toContain('mathvariant="bold-italic"')
  expect(renderMath('\\char`\\&')).toContain('<mtext>&amp;</mtext>')
  expect(renderMath(String.raw`\char"110000`)).toContain('math-unrendered')
})

test('renders verbatim math without opening Markdown or TeX delimiters inside it', async () => {
  const { parseDeck, renderDeck } = await import('../src/index.ts')
  const html = await renderDeck(parseDeck(String.raw`Examples $\verb|x $ y % { <em>| + z$ and \(\verb*+a b+\).`))
  expect(html).toContain('>x $ y % { &lt;em&gt;</mtext><mo>+</mo><mi>z</mi>')
  expect(html).toContain('>a␣b</mtext>')
  expect(html).not.toContain('<em>')
  expect(renderMath(String.raw`\verb@  a b  @`)).toContain('>  a b  </mtext>')
  expect(renderMath(String.raw`\verb*xa bx`)).toContain('>a␣b</mtext>')
})
