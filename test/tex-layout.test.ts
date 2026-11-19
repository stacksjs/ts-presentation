import { expect, test } from 'bun:test'
import { findChrome } from '../src/chrome.ts'
import { collectSnapshot } from '../src/editable/walker.ts'
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
test.skipIf(!chrome)('positions lap contents and explicit operator limits in Chromium', async () => {
  const formulas = [
    { id: 'reference', tex: 'AB' },
    { id: 'left', tex: String.raw`A\mathllap{xyz}B` },
    { id: 'center', tex: String.raw`A\mathclap{xyz}B` },
    { id: 'right', tex: String.raw`A\mathrlap{xyz}B` },
  ]
  const body = formulas.map(({ id, tex }) => `<div id="${id}">${renderMath(tex)}</div>`).join('')
  const limits = `<section id="limits">${renderMath(String.raw`\sum\limits_{k=0} + \sum_{k=0}`)}</section>`
  const css = Bun.file(new URL('../src/player.css', import.meta.url))
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
