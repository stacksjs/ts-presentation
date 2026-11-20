import { expect, spyOn, test } from 'bun:test'
import type { MathMacroContext } from '../src/index.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { collectSnapshot } from '../packages/slidev/node/runtime/editable/walker.ts'
import { parseDeck, renderDeck, renderPresentation } from '../packages/slidev/node/runtime/index.ts'
import { MathParseError } from '../packages/slidev/node/runtime/math-error.ts'
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

test('renders mathtools colons as single relation atoms, including literal Unicode and aliases', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = String.raw`a\coloneqq b\equalscolon c\dblcolon d\coloncolonapprox e` + '⩴f'
  const html = math(formula, false)
  for (const glyph of ['≔', '≕', '∷', '∷≈', '⩴'])
    expect(html).toContain(thick + operator(glyph) + thick)
  const script = math(String.raw`x^{a\ratio b\Coloneq c}`, false)
  expect(script).toContain('<mi>a</mi>' + operator('∶') + '<mi>b</mi>' + operator('∷−') + '<mi>c</mi>')
  expect(script).not.toContain('<mspace')
  expect(math(String.raw`a\dots\colonequals b`, false)).toContain(operator('…'))
  expect(math(String.raw`\N \Reals \Bbbk a\lArr b`, false)).toContain('<mi>ℕ</mi><mi>ℝ</mi><mi>𝕜</mi>')
})

test('renders named TeX spaces and keeps nonbreaking spaces in the same inline fragment', () => {
  const math = createMathRenderer({ throwOnError: true }, true)
  const source = String.raw`\text{x\thinspace y\enspace z} +\nobreakspace y =
    u\negmedspace v\thickspace w\>t`
  const html = math(source, false).split('<annotation')[0]
  expect(html).toContain('<mtext>x</mtext><mspace width="0.17em"/>')
  expect(html).toContain('<mtext>y</mtext><mspace width="0.5em"/><mtext>z</mtext>')
  expect(html).toContain('<mspace width="0.5em"/>')
  expect(html).toContain('<mspace width="0" style="margin-inline-end:-0.22em"/>')
  expect(html).toContain('<mspace width="0.28em"/>')
  expect(html.match(/data-math-break/g)).toHaveLength(1)
  expect(math(String.raw`x+~y`, false).split('<annotation')[0]).not.toContain('data-math-break')
})

test('scopes legacy font declarations and selects MathML branches without expanding skipped input', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`{\cal A{\bf B} C} D+\mathrm{x\mathit{y}}+\Alpha\Gamma\varGamma`, false)
  expect(html).toContain('<mi>𝒜</mi>')
  expect(html).toContain('class="math-bold" mathvariant="bold"><mi mathvariant="normal">B</mi>')
  expect(html).toContain('<mi>𝒞</mi></mrow></mrow><mi>D</mi>')
  expect(html).toContain('<mi mathvariant="normal">x</mi><mrow class="math-italic" mathvariant="italic"><mrow><mi>y</mi>')
  expect(html).toContain('<mi mathvariant="normal">Α</mi><mi mathvariant="normal">Γ</mi><mi>Γ</mi>')
  const text = math(String.raw`\text{before \bf word {\tt code} after} \LaTeX \TeX \KaTeX`, false)
  expect(text).toContain('class="math-bold" mathvariant="bold"><mtext>word')
  expect(text).toContain('class="math-monospace" mathvariant="monospace"><mtext>code</mtext>')
  for (const name of ['LaTeX', 'TeX', 'KaTeX'])
    expect(text).toContain(`<mrow style="font-family:serif"><mtext>${name}</mtext></mrow>`)
  const branch = math(String.raw`\html@mathml{\unsupported}{\plim_n X_n}`, false)
  expect(branch).toContain('<munder><mo movablelimits="false">plim</mo><mi>n</mi></munder>')
})

test('uses supplemental symbols in contextual dots, negations, text, and operator names', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`a \dots \subsetneqq b + \not\gtrsim c`, false)).toContain('>⋯</mo>')
  const literal = 'a ' + String.raw`\dots` + ' ⫋ b'
  expect(math(literal, false)).toContain('<mo>⋯</mo>')
  const html = math(String.raw`\text{\S\textdagger\textbraceleft\textsterling\textbraceright}+\operatorname{\vdash\,closure}(x)`, false)
  expect(html).toContain('<mtext>§†{£}</mtext>')
  expect(html).toContain(operator('⊢\u2009closure'))
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
  expect(math(String.raw`\futurelet\next a b\text{[\next]}`, false)).toContain('<mi>a</mi><mi>b</mi><mtext>[ ]</mtext>')
  expect(math(String.raw`\futurelet\next\relax b\text{[\next]}`, false)).toContain('<mi>b</mi><mtext>[b]</mtext>')
  expect(math(String.raw`\let\deferred=\undefined\edef\saved{\deferred}\def\deferred{x}\saved`, false)).toContain('<mi>x</mi>')
})

// Parser cases adapted from KaTeX v0.19.1 (licenses/KaTeX-MIT.txt).
test('assigns whitespace and brace tokens with let and preserves literal meanings during expansion', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`\def\:{\let\space= }\: \text{\space}`, false)).toContain('<mtext>\u00A0</mtext>')
  expect(math(String.raw`\def\bold{\bgroup\bf\let\next= }\bold{a}b`, false))
    .toContain('<mrow class="math-bold" mathvariant="bold"><mi mathvariant="normal">a</mi></mrow></mrow><mi>b</mi>')
  expect(math(String.raw`\let\open{\sqrt\open1}`, false)).toContain('<msqrt><mrow><mn>1</mn></mrow></msqrt>')
  expect(math(String.raw`\let\foo=x\noexpand\foo`, false)).toContain('<mi>x</mi>')
  expect(math(String.raw`\let\foo=x\edef\saved{\foo}\def\foo{y}\saved`, false)).toContain('<mi>y</mi>')
})

test('matches expanded brace pairs and scopes semisimple groups without changing relation spacing', () => {
  const math = createMathRenderer({ throwOnError: true })
  const braces = math(String.raw`\def\grouped{\bgroup} \grouped a}+{b\egroup`, false)
  expect(braces).toContain('<mrow><mi>a</mi></mrow><mo>+</mo><mrow><mi>b</mi></mrow>')
  const text = math(String.raw`\text{outer \bgroup\bf bold\egroup\ rest}`, false)
  expect(text).toContain('<mrow class="math-bold" mathvariant="bold"><mtext>bold</mtext></mrow><mtext>\u00A0rest</mtext>')
  const group = math(String.raw`\def\term{x}\term\begingroup\def\term{y}+\term\endgroup=\term`, false)
  expect(group).toContain('<mi>x</mi>' + medium + operator('+') + medium + '<mi>y</mi>' + thick + operator('=') + thick + '<mi>x</mi>')
  expect(() => math(String.raw`\begingroup x\egroup`, false)).toThrow('Unexpected math token')
})

// Macro argument and prefix cases adapted from KaTeX v0.19.1 (MIT).
test('expands the whole unbraced text argument inside its own scope', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`\gdef\phrase{hi}\phrase+\text\phrase`, false))
    .toContain('<mi>h</mi><mi>i</mi><mo>+</mo><mtext>hi</mtext>')
  expect(math(String.raw`\def\mode{\TextOrMath{text}{math}}\textbf\mode + \mode`, false))
    .toContain('<mrow style="font-weight:bold"><mtext>text</mtext></mrow><mo>+</mo><mi>m</mi><mi>a</mi><mi>t</mi><mi>h</mi>')
  expect(math(String.raw`\def\nested{a\textbf{b}c}\text\nested+d`, false))
    .toContain('<mrow><mtext>a</mtext><mrow style="font-weight:bold"><mtext>b</mtext></mrow><mtext>c</mtext></mrow><mo>+</mo><mi>d</mi>')
  expect(math(String.raw`\def\letter{a}\def\change{\def\letter{b}\letter}\text\change\letter`, false))
    .toContain('<mtext>b</mtext><mi>a</mi>')
  expect(math(String.raw`\text{a\begingroup\bf bold\endgroup c}`, false))
    .toContain('<mtext>a</mtext><mrow class="math-bold" mathvariant="bold"><mtext>bold</mtext></mrow><mtext>c</mtext>')
  expect(() => math(String.raw`\def\arg#1{hi #1}\text\arg{you}`, false)).toThrow('Missing math argument')
  expect(() => math(String.raw`\text\bgroup x\egroup`, false)).toThrow('Unclosed math text')
  expect(() => math(String.raw`\def\open{$x}\text\open+y$`, false)).toThrow('Unclosed inline math in text')
  const longText = createMathRenderer({ macros: { '\\tail': 'b'.repeat(260) }, throwOnError: true })
  const prefix = 'a'.repeat(5930)
  expect(longText(String.raw`\text{${prefix}\tail}`, false)).toContain(`<mtext>${prefix}${'b'.repeat(260)}</mtext>`)
})

test('checks assignment prefixes and freezes active characters copied by let', () => {
  const math = createMathRenderer({ throwOnError: true })
  math(String.raw`\def\assign{\def}\long\global\assign\shared{x}`, false)
  expect(math(String.raw`\shared`, false)).toContain('<mi>x</mi>')
  expect(math(String.raw`\let\saved=x\def x{y}\saved x`, false)).toContain('<mi>x</mi><mi>y</mi>')
  expect(math(String.raw`\let\digit=1\def1{y}\kern\digit em+\char\digit02`, false))
    .toContain('<mspace width="1em"/><mo>+</mo><mi>f</mi>')
  for (const source of [String.raw`\long x`, String.raw`\global\long`, String.raw`\global\newcommand\broken{x}`])
    expect(() => math(source, false)).toThrow('Invalid token after math macro prefix')
})

test('accepts signed TeX dimensions with separating spaces and trailing decimal points', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`\rule{-1em}{- 0.2em}X`, false))
    .toContain('<mspace width="-1em" height="-0.2em" style="background:currentColor"/><mi>X</mi>')
  expect(math(String.raw`\kern+ 1.em X\mkern- .9mu Y`, false))
    .toContain('<mspace width="1em"/><mi>X</mi><mspace width="0" style="margin-inline-end:-0.05em"/><mi>Y</mi>')
  expect(math(String.raw`\begin{array}{r}a\\[- .2em]b\end{array}`, true))
    .toContain('padding-bottom:max(0px,calc(0.14em + -.2em))')
  expect(() => math(String.raw`\rule{1em}{+ -.2em}`, false)).toThrow('Invalid math dimension')
})

test('reads multi-digit and expanded argument counts in macro declarations', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\def\arity{10}\newcommand\foo[ \arity ]{#1^2}\foo 0123456789+x`, false)
  expect(html).toContain('<msup><mn>0</mn><mn>2</mn></msup>')
  expect(html).not.toContain('<mn>123456789</mn>')
  expect(() => math(String.raw`\newcommand\foo[1.5]{x}`, false)).toThrow('Invalid macro argument count')
  expect(() => math(String.raw`\newcommand\foo[900000000]{x}`, false)).toThrow('Invalid macro argument count')
})

// Configured MacroExpansion fixtures adapted from KaTeX v0.19.1 (MIT).
test('expands configured stacks in reverse order and retains frozen primitives', () => {
  const math = createMathRenderer({
    throwOnError: true,
    macros: {
      '\\OldInt': { tokens: [{ text: '\\int', noexpand: true }], numArgs: 0, unexpandable: true },
      '\\int': { tokens: [{ text: '\\limits' }, { text: '\\OldInt' }], numArgs: 0 },
      '\\labeltext': {
        tokens: [{ text: '}', noexpand: true }, { text: '1' }, { text: '#' }, { text: '{', noexpand: true }, { text: '\\text' }],
        numArgs: 1,
      },
      '\\oldletter': { tokens: [{ text: 'x', noexpand: true }], numArgs: 0, unexpandable: true },
      '\\frozen': { tokens: [{ text: 'x', noexpand: true }], numArgs: 0 },
      '\\inhibited': { tokens: [{ text: '\\labeltext', noexpand: true, treatAsRelax: true }], numArgs: 0 },
      'α': '\\beta',
    },
  })
  expect(math(String.raw`\int_0^1 x`, false)).toContain('<munderover><mo movablelimits="false">∫</mo><mn>0</mn><mn>1</mn></munderover>')
  expect(math(String.raw`\labeltext{sample}+${'α'}`, false)).toContain('<mtext>sample</mtext><mo>+</mo><mi>β</mi>')
  expect(math(String.raw`\edef\late{\oldletter}\edef\early{\frozen}\def x{y}\def\oldletter{z}\late\early x`, false))
    .toContain('<mi>z</mi><mi>x</mi><mi>y</mi>')
  expect(math(String.raw`\inhibited x`, false)).toContain('<mrow><mi>x</mi></mrow>')
})

test('reads configured macro prefixes and delimiters with or without nested groups', () => {
  const stack = Object.freeze(['\\frac', '{', '#', '2', '}', '{', '#', '1', '}'].reverse()
    .map(text => Object.freeze({ text })))
  const math = createMathRenderer({
    throwOnError: true,
    macros: { '\\ratioof': { tokens: stack, numArgs: 2, delimiters: [['|'], [','], [';']] } },
  })
  expect(math(String.raw`\ratioof|{2,3},4;`, false))
    .toContain('<mfrac><mrow><mn>4</mn></mrow><mrow><mn>2</mn><mo>,</mo><mn>3</mn></mrow></mfrac>')
  expect(() => math(String.raw`\ratioof 2,3;`, false)).toThrow('Missing macro prefix')
  expect(() => math(String.raw`\ratioof|2,3`, false)).toThrow('Missing macro delimiter')
  expect(stack[0].text).toBe('}')
})

test('runs function macros with KaTeX-style argument order, modes, and token operations', () => {
  const math = createMathRenderer({
    throwOnError: true,
    macros: {
      '\\select': context => ({ tokens: context.consumeArgs(2)[context.mode === 'math' ? 0 : 1], numArgs: 0 }),
      '\\tail': '',
      '\\step': context => {
        const count = context.expandOnce()
        const next = context.future()
        context.popToken()
        context.pushToken(next)
        return `\\text{${count}:${next.text}}`
      },
      '\\colorname': 'blue',
      '\\paint': context => {
        const { tokens } = context.consumeArg()
        const body = context.expandTokens(tokens).reverse()
        return { tokens: body, numArgs: 0 }
      },
      '\\collect': context => {
        const [first, second] = context.consumeArgs(2, [['|'], [','], [';']])
        return { tokens: [...second, { text: '+' }, ...first], numArgs: 0 }
      },
      '\\peekafter': context => {
        const next = context.expandAfterFuture().text
        const consumed = context.expandNextToken().text
        return `\\text{${next.slice(1)}:${consumed}}`
      },
      '\\outer': '\\inner',
      '\\inner': 'q',
    },
  })
  expect(math(String.raw`\select{a}{b}+\text{\select{a}{b}}`, false))
    .toContain('<mi>a</mi><mo>+</mo><mtext>b</mtext>')
  expect(math(String.raw`\step\tail x`, false)).toContain('<mtext>0:x</mtext><mi>x</mi>')
  expect(math(String.raw`\paint{\textcolor{\colorname}{x}}`, false)).toContain('style="color:blue"><mrow><mi>x</mi>')
  expect(math(String.raw`\collect|2,3;`, false)).toContain('<mn>2</mn><mo>+</mo><mn>3</mn>')
  expect(math(String.raw`\peekafter\outer`, false)).toContain('<mtext>inner:q</mtext>')
})

test('keeps function macro assignments in their TeX groups and persists explicit global changes', () => {
  const configured = {
    macros: {
      '\\fixed': 'x',
      '\\configure': ({ macros, isDefined, isExpandable, expandMacroAsText }: MathMacroContext) => {
        expect(macros.has('\\fixed')).toBe(true)
        expect(macros.get('\\fixed')).toBe('x')
        expect(macros.has('\\alpha')).toBe(false)
        expect(isDefined('\\alpha')).toBe(true)
        expect(isExpandable('\\fixed')).toBe(true)
        macros.beginGroup()
        macros.set('\\fixed', 'y')
        const local = expandMacroAsText('\\fixed')
        macros.endGroup()
        macros.set('\\saved', local, true)
        macros.set('\\alias', macros.get('\\point'), true)
        macros.set('\\ketAlias', macros.get('\\Braket'), true)
        return ''
      },
      '\\remove': ({ macros }: MathMacroContext) => {
        macros.set('\\fixed', undefined, true)
        return ''
      },
    },
    throwOnError: true,
  }
  const math = createMathRenderer(configured)
  expect(math(String.raw`\newcommand{\point}[2][r]{#1+#2}{\configure}\fixed\saved`, false))
    .toContain('<mi>x</mi><mi>y</mi>')
  expect(math(String.raw`\alias{s}`, false)).toContain('<mi>r</mi><mo>+</mo><mi>s</mi>')
  expect(math(String.raw`\ketAlias{a|b}`, false)).toContain('<mo stretchy="true">⟨</mo>')
  math(String.raw`\remove`, false)
  expect(() => math(String.raw`\fixed`, false)).toThrow('Unsupported math command')
  expect(createMathRenderer(configured)(String.raw`\fixed`, false)).toContain('<mi>x</mi>')
})

test('counts function macros and their nested expansion work against the formula budget', () => {
  let calls = 0
  const math = createMathRenderer({ macros: { '\\local': () => { calls++; return 'x' } }, maxExpand: 0, throwOnError: true })
  expect(() => math(String.raw`\local`, false)).toThrow('Too many math macro expansions')
  expect(calls).toBe(0)
  const cycle = createMathRenderer({
    macros: { '\\cycle': context => context.expandMacroAsText('\\cycle') ?? '' }, maxExpand: 8, throwOnError: true,
  })
  expect(() => cycle(String.raw`\cycle`, false)).toThrow('Too many math macro expansions')
})

// Parser diagnostics adapted from the KaTeX v0.19.1 test suite (MIT).
test('checks macro declaration intent against local, built-in, and configured commands', () => {
  const math = createMathRenderer({ macros: { '\\deckTerm': 'Q' }, throwOnError: true })
  expect(math(String.raw`\newcommand\term{A}{\renewcommand\term{B}\term}\providecommand\term{C}\term`, false))
    .toContain('<mrow><mi>B</mi></mrow><mi>A</mi>')
  expect(math(String.raw`\providecommand\lambda{X}\lambda\renewcommand\deckTerm{R}\deckTerm`, false))
    .toContain('<mi>λ</mi><mi>R</mi>')
  for (const command of ['\\bar', '\\lambda', '\\textdollar', '\\limits', '\\blue', '\\deckTerm']) {
    expect(() => math(`\\newcommand{${command}}{x}`, false)).toThrow('already defined')
  }
  expect(() => math(String.raw`\renewcommand\unknown{X}`, false)).toThrow('undefined')
  expect(() => math(String.raw`\newcommand\term{X}\newcommand\term{Y}`, false)).toThrow('already defined')
})

test('checks definition targets, named parameters, and eager expansion', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(math(String.raw`\def+{A}\def1{B}2+31`, false)).toContain('<mn>2</mn><mi>A</mi><mn>3</mn><mi>B</mi>')
  expect(math(String.raw`\def+{A}` + 'x\u207ax\u207a', false)).toContain('<msup><mi>x</mi><mrow><mi>A</mi></mrow></msup>')
  expect(() => math(String.raw`\def+{\undefined}` + 'x\u207a', false)).toThrow('Unsupported math command')
  expect(math(String.raw`\edef\saved{\sin}\saved x`, false)).toContain('<mo>sin</mo><mi>x</mi>')
  expect(() => math(String.raw`\gdef{\foo}{}`, false)).toThrow('Invalid macro name')
  expect(() => math(String.raw`\newcommand{\foo\bar}{}`, false)).toThrow('Invalid macro name')
  expect(() => math(String.raw`\newcommand\foo{#1}\foo x`, false)).toThrow('Unbound macro parameter')
  expect(() => math(String.raw`\edef\foo{\unknown}`, false)).toThrow('Undefined control sequence')
})

test('rejects stray delimiters, undeclared environments, and nested unbraced functions', () => {
  const math = createMathRenderer({ throwOnError: true })
  for (const source of ['x}', 'x&y', 'x#2', '$x$', String.raw`x\end{align}`]) {
    expect(() => math(source, false)).toThrow('Unexpected math token')
  }
  expect(() => math(String.raw`\begin{unknown}x\end{unknown}`, true)).toThrow('Unsupported math environment')
  expect(() => math(String.raw`x^\sqrt x`, false)).toThrow('requires a grouped argument')
  expect(() => math(String.raw`\frac \left(x\right) y`, false)).toThrow('Invalid delimiter')
  expect(() => math(String.raw`\mathbb \mathrm R`, false)).toThrow('Missing math argument')
  expect(math(String.raw`x^{\sqrt y}+\frac \alpha 2`, false)).toContain('<msqrt><mi>y</mi></msqrt>')
  expect(math(String.raw`\sqrt \frac x y+x^\frac x y+e^\mathbf{x}`, false)).toContain('<msqrt><mfrac>')
  expect(renderMath('x}')).toBe('<code class="math-unrendered" title="Unexpected math token: }" style="color:#cc0000">x}</code>')
  expect(() => math(String.raw`\raisebox5pt{text}`, false)).toThrow('requires a grouped dimension')
  expect(() => math(String.raw`s\hspace7ex k`, false)).toThrow('requires a grouped dimension')
  expect(math(String.raw`s\hskip7ex k`, false)).toContain('<mspace width="7ex"/>')
})

test('distinguishes text symbols, unknown commands, and math-only functions', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\text{\sect\textregistered\char65\vdots\dots x\tag{Note}}`, true)
  expect(html).toContain('<mtext>\u00a7®A⋮</mtext><mo>…</mo><mtext>x</mtext>')
  expect(html).toContain('<mtext>(Note)</mtext>')
  expect(() => math(String.raw`\text{\sqrt{x}}`, false)).toThrow('requires math mode')
  expect(() => math(String.raw`\text{\unknown}`, false)).toThrow('Unsupported math command')
  expect(() => math(String.raw`\text{a_b}`, false)).toThrow('Unexpected text token')
  const tolerant = createMathRenderer({ errorColor: '#a00' })
  expect(tolerant(String.raw`\text{a\unknown b}`, false)).toContain('<mtext style="color:#a00">\\unknown</mtext>')
  expect(tolerant(String.raw`\text{\sqrt{x}}`, false)).toContain('math-unrendered')
})

test('reports recoverable math errors with a safe color and lets extension failures surface', () => {
  const tolerant = createMathRenderer({ throwOnError: false })
  expect(tolerant(String.raw`a+\missing+b`, false)).toContain(String.raw`<mtext style="color:#cc0000">\missing</mtext>`)
  const color = createMathRenderer({ errorColor: '#413855' })
  expect(color('x}<em>sample</em>', false))
    .toBe('<code class="math-unrendered" title="Unexpected math token: }" style="color:#413855">x}&lt;em&gt;sample&lt;/em&gt;</code>')
  expect(createMathRenderer({ errorColor: 'red" data-test="example' })('x}', false))
    .toContain('style="color:#cc0000"')
  const strict = createMathRenderer({ throwOnError: true })
  expect(() => strict(String.raw`\begin{array}{c}a`, true)).toThrow(MathParseError)
  expect(() => strict('x'.repeat(6001), false)).toThrow('Equation has too many input tokens')
  const configured = createMathRenderer({ macros: { '\\example': () => { throw new Error('Example setup failed') } } })
  expect(() => configured(String.raw`\example`, false)).toThrow('Example setup failed')
})

test('handles math debug messages, an accented blank, and text-mode ring accents', () => {
  const math = createMathRenderer({ throwOnError: true, strict: 'ignore' })
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const html = math(String.raw`\edef\prepare{\message{preparing}}\prepare\text{a\errmessage{diagnostic}\' \aa\AA}\aa`, false)
    expect(log).toHaveBeenCalledWith('preparing')
    expect(log).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('diagnostic')
    expect(html).toContain('<mtext>\u00A0</mtext>')
    expect(html).toContain('<mtext>åÅ</mtext></mrow><mi>å</mi>')
  }
  finally {
    log.mockRestore()
    error.mockRestore()
  }
  const strict = createMathRenderer({ throwOnError: true, strict: true })
  expect(() => strict(String.raw`\aa`, false)).toThrow('mathVsTextAccents')
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

test('enforces the configured expansion budget, including eager definition output', () => {
  const limited = createMathRenderer({ maxExpand: 2, throwOnError: true })
  expect(limited(String.raw`\def\letter{z}\letter\letter`, false)).toContain('<mi>z</mi><mi>z</mi>')
  expect(() => limited(String.raw`\def\letter{z}\letter\letter\letter`, false)).toThrow('Too many math macro expansions')
  expect(limited(String.raw`\edef\two{ab}`, false)).toContain('<math')
  expect(() => limited(String.raw`\def\part{ab}\edef\two{\part}`, false)).toThrow('Too many math macro expansions')
  expect(limited(String.raw`\def\letter{y}\letter`, false)).toContain('<mi>y</mi>')

  const longFormula = String.raw`\def\term{x}` + String.raw`\term`.repeat(400)
  expect(createMathRenderer({ throwOnError: true })(longFormula, false).match(/<mi>x<\/mi>/g)).toHaveLength(400)
  expect(createMathRenderer({ maxExpand: Infinity, throwOnError: true })(longFormula, false)).toContain('<mi>x</mi>')
  expect(createMathRenderer({ maxExpand: 0 })(String.raw`\def\term{x}\term`, false)).toContain('math-unrendered')
})

test('persists top-level definitions in a global group and scopes definitions inside text and arrays', () => {
  const math = createMathRenderer({ globalGroup: true, throwOnError: true })
  const first = math(String.raw`
    \long\def\base{A}
    \newcommand{\another}{B}
    \let\copy=\base
    {\def\base{X}\base}
    \text{\edef\word{\TextOrMath{local}{wrong}}\word\gdef\shared{C}}
    \begin{aligned}\def\cell{D}\cell\end{aligned}
  `, true)
  expect(first).toContain('<mi>X</mi>')
  expect(first).toContain('<mtext>local</mtext>')
  expect(first).toContain('<mi>D</mi>')
  expect(math(String.raw`\base\another\copy\shared`, false)).toContain('<mi>A</mi><mi>B</mi><mi>A</mi><mi>C</mi>')
  expect(() => math(String.raw`\word`, false)).toThrow('Unsupported math command')
  expect(() => math(String.raw`\cell`, false)).toThrow('Unsupported math command')
  expect(() => createMathRenderer({ globalGroup: true, throwOnError: true })(String.raw`\base`, false)).toThrow('Unsupported math command')
})

test('applies the legacy color option to one argument in text and math', () => {
  const tex = String.raw`a\color{red}{b}c`
  const legacy = createMathRenderer({ colorIsTextColor: true, throwOnError: true })
  expect(legacy(tex, false)).toContain('<mi>a</mi><mrow style="color:red"><mrow><mi>b</mi></mrow></mrow><mi>c</mi>')
  expect(renderMath(tex)).toContain('<mrow style="color:red"><mrow><mi>b</mi></mrow><mi>c</mi></mrow>')
  expect(legacy(String.raw`\text{a\color{blue}{b}c}`, false))
    .toContain('<mtext>a</mtext><mrow style="color:blue"><mtext>b</mtext></mrow><mtext>c</mtext>')
})

test('expands legacy palette macros in math and text and allows scoped overrides', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\let\shade=\blue{\def\blue{B}\blue}\shade x+\redA{y}+\text{\mintC{fresh}}`, false)
  expect(html).toContain('<mrow><mi>B</mi></mrow><mrow style="color:#6495ed"><mrow><mi>x</mi></mrow></mrow>')
  expect(html).toContain('<mrow style="color:#fca9a9"><mrow><mi>y</mi></mrow></mrow>')
  expect(html).toContain('<mrow style="color:#e0e5cc"><mtext>fresh</mtext></mrow>')
})

test('validates expanded color values and scopes alpha colors in text and math', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\def\tint{##1234}\text{a{\color{\tint}b\textcolor{#ABCDEF80}{c}}d}+\textcolor{\tint}{x}`, false)
  expect(html).toContain('<mtext>a</mtext><mrow style="color:#1234"><mtext>b</mtext><mrow style="color:#ABCDEF80"><mtext>c</mtext></mrow></mrow><mtext>d</mtext>')
  expect(html).toContain('<mrow style="color:#1234"><mrow><mi>x</mi></mrow></mrow>')
  for (const value of ['bad-color', '#abcde', '#fff0000g', 'red"><img>']) {
    expect(() => math(`\\textcolor{${value}}{x}`, false)).toThrow('Invalid math color')
  }
})

test('caps positive TeX dimensions in ems, including TeX-only units', () => {
  const math = createMathRenderer({ maxSize: 2, throwOnError: true })
  const html = math(String.raw`a\hspace{1500em}\rule[40pt]{10pc}{1pc}\mkern{27mu}\kern{-4em}b`, false)
  expect(html).toContain('<mspace width="2em"/>')
  expect(html).toMatch(/<mpadded voffset="2em" [^>]+><mspace width="2em" height="1\.2em" style="background:currentColor"\/>/)
  expect(html).toContain('<mspace width="1.5em"/>')
  expect(html).toContain('<mspace width="0" style="margin-inline-end:-4em"/>')
  expect(renderMath(String.raw`\hspace{65536sp}`)).toContain('<mspace width="1pt"/>')
  const zero = createMathRenderer({ maxSize: 0, throwOnError: true })
  expect(zero(String.raw`\rule{2pt}{1dd}`, false)).toContain('<mspace width="0em" height="0em"')
})

test('applies minimum rules to fractions and arrays and keeps line-free binomials', () => {
  const math = createMathRenderer({ minRuleThickness: 0.3, throwOnError: true })
  const html = math(String.raw`\frac ab + {a\above{1pt}b} + \genfrac{}{}{4pt}{}ab + \binom ab
    \begin{array}{|c||}\hline a\\\hdashline b\end{array}`, true)
  expect(html.match(/<mfrac linethickness="0.3em">/g)).toHaveLength(2)
  expect(html).toContain('<mfrac linethickness="0.4em">')
  expect(html).toContain('<mfrac linethickness="0">')
  expect(html).toContain('border-left:max(1px,0.3em) solid currentColor')
  expect(html).toContain('dashed currentColor')
  expect(html).toContain('border-right:calc(1 * max(0.2em,2 * max(1px,0.3em)) + max(1px,0.3em)) solid transparent')
})

test('renders phase angles, actuarial notation, pseudo-bold, and strikeout as MathML', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\phase{-78^\circ} + a_{\angl{n+1}}+b_\angln + \pmb{\mu} + \text{old \sout{term $x^2$}}`, true)
  expect(html).toContain('<mrow class="math-phase">')
  expect(html.match(/class="math-angl"/g)).toHaveLength(2)
  expect(html).toContain('<mrow class="math-angl"><mstyle displaystyle="false" scriptlevel="0"><mtext>n</mtext>')
  expect(html).toContain('<mrow class="math-angl"><mstyle displaystyle="false" scriptlevel="0"><mtext>n+1</mtext>')
  expect(math(String.raw`\edef\year{\angln}\year+\angl{$n+1$}`, false)).toContain('<mi>n</mi><mo>+</mo><mn>1</mn>')
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

// Typography and font-scope cases adapted from KaTeX's mathml-spec.ts (MIT).
test('shapes TeX text punctuation in proportional fonts and preserves typewriter ligatures', () => {
  const math = createMathRenderer({ throwOnError: true })
  const sample = "\x60\x60ready'' -- ---"
  const proportional = '<mtext>\u201cready\u201d \u2013 \u2014'
  const mono = '<mtext>\x60\x60ready&#39;&#39; -- ---'
  expect(math(`\\text{${sample}}`, false)).toContain(proportional + '</mtext>')
  expect(math(`\\texttt{${sample}}`, false)).toContain(mono + '</mtext>')
  const nested = math(`\\text{\\tt ${sample}{---} \\textsf{${sample}} ---}{\\text{---}}`, false)
  expect(nested).toContain(mono + '</mtext><mtext>---</mtext>')
  expect(nested).toContain(proportional + '</mtext>')
  expect(nested).toContain('<mtext>\u00a0---</mtext>')
  expect(nested).toContain('<mtext>\u2014</mtext>')
  expect(math("\\text{\x60x' \\verb|\x60x'---|}", false)).toContain('<mtext>\u2018x\u2019\u00a0</mtext>')
  expect(math("\\text{\x60x' \\verb|\x60x'---|}", false)).toContain(">\x60x&#39;---</mtext>")
})

test('resets horizontal box text style independently of the surrounding scripts', () => {
  const math = createMathRenderer({ throwOnError: true })
  const source = String.raw`x_{\scriptstyle \hbox{$\sum^a_b$}\fbox{$z$}\colorbox{red}{$y$}}`
  const markup = math(source, false).split('<annotation')[0]
  expect(markup).toContain('<msub><mi>x</mi><mrow><mstyle displaystyle="false" scriptlevel="1">')
  expect(markup.match(/<mstyle displaystyle="false" scriptlevel="0">/g)).toHaveLength(3)
  expect(markup).toContain('<msubsup><mo>∑</mo><mi>b</mi><mi>a</mi></msubsup>')
})

test('keeps surrounding fonts out of array cells and commutative diagram labels', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = String.raw`\mathcal{A\begin{matrix}x&\mathbb{N}\end{matrix}B}`
  const markup = math(formula, false).split('<annotation')[0]
  expect(markup).toContain('<mi>𝒜</mi>')
  expect(markup).toContain('<mtable data-equation-lines data-math-array><mtr><mtd><mi>x</mi>')
  expect(markup).toContain('<mi>ℕ</mi>')
  expect(markup).toContain('<mi>ℬ</mi>')
  const cd = math(String.raw`\mathsf{\begin{CD}A @>x>> B\end{CD}}`, true)
  expect(cd).toContain('<mtd><mi>A</mi></mtd>')
  expect(cd).toContain('<mrow><mi>x</mi></mrow></mover>')
  expect(cd).toContain('<mtd><mi>B</mi></mtd>')
  const fraction = math(String.raw`\mathsf{\dfrac{A123}{x456}}`, false)
  expect(fraction).toContain('<mfrac><mrow><mi mathvariant="normal">A</mi><mn>123</mn>')
  expect(fraction).toContain('<mi mathvariant="normal">x</mi><mn>456</mn>')
})

test('resets math fonts inside text and restores named text styles on reentry', () => {
  const math = createMathRenderer({ throwOnError: true })
  const switched = math(String.raw`\mathcal{A\textsf{before $x+\text{inside}+\mathbb{R}$ after}B}`, false)
  expect(switched).toContain('<mi>𝒜</mi>')
  expect(switched).toContain('<mrow class="math-font-reset"><mi>x</mi>')
  expect(switched).toContain('<mrow style="font-family:sans-serif;font-weight:normal;font-style:normal"><mtext>inside</mtext></mrow>')
  expect(switched).toContain('<mi>ℝ</mi>')
  expect(switched).toContain('<mi>ℬ</mi>')
  for (const inner of [
    String.raw`\text{word}`, String.raw`\hbox{word}`, String.raw`\raisebox{2pt}{word}`,
    String.raw`\fbox{word}`, String.raw`\colorbox{red}{word}`, String.raw`\fcolorbox{blue}{red}{word}`, String.raw`\angl{word}`,
  ]) {
    expect(math(`\\mathsf{${inner}}`, false))
      .toContain('<mrow style="font-family:math;font-weight:normal;font-style:normal"><mtext>word</mtext></mrow>')
  }
  const legacy = math(String.raw`\text{\tt $x+\text{word}$}`, false)
  expect(legacy).toContain('<mrow class="math-font-reset"><mi>x</mi><mo>+</mo><mtext>word</mtext></mrow>')
  const italic = math(String.raw`\textit{\text{upright}\hbox{italic} $x+\text{upright}+\hbox{italic}$}`, false)
  expect(italic).toContain('<mrow style="font-style:normal"><mtext>upright</mtext></mrow><mtext>italic')
  expect(italic).toContain('font-style:normal"><mtext>upright</mtext></mrow><mo>+</mo>')
  expect(italic).toContain('font-style:italic"><mtext>italic</mtext></mrow>')
})

// Operator and emphasis cases adapted from KaTeX v0.19.1 (licenses/KaTeX-MIT.txt).
test('preserves spacing, markup, and limits in named TeX operators', () => {
  const math = createMathRenderer({ throwOnError: true })
  const markup = math(String.raw`
    \def\greekLabel{\alpha}
    \operatorname*{arg\,max}_{x} + \operatorname{D_\greekLabel}(x)
  `, true)
  const fraction = String.raw`\operatorname*{x*Π∑\Pi\sum\frac a b}_y x`
  expect(markup).toContain(`<munder>${operator('arg\u2009max')}<mrow><mi>x</mi></mrow></munder>`)
  expect(markup).toContain('<msub><mi mathvariant="normal">D</mi><mi mathvariant="normal">α</mi></msub>')
  expect(math(fraction, true)).toContain('<mfrac><mi mathvariant="normal">a</mi><mi mathvariant="normal">b</mi></mfrac></mrow><mi>y</mi></munder>')
  expect(math(fraction, false)).toContain('</mfrac></mrow><mi>y</mi></msub>')
  expect(math(String.raw`\operatorname{sn}\limits_{b>c}(b+c)`, true)).toContain(`<msub>${operator('sn')}`)
  expect(math(String.raw`\operatorname*{sn}\limits_x`, false)).toContain('<munder><mo movablelimits="false"')
  expect(math(String.raw`\operatorname*{sn}\nolimits_x`, true)).toContain(`<msub>${operator('sn')}`)
  expect(math(String.raw`a\operatorname{p-\ast q}b`, false)).toContain(thin + operator('p-*q') + thin)
  expect(() => math(String.raw`\operatorname{\unsupported}`, false)).toThrow('Unsupported math command')
})

test('toggles nested TeX emphasis in the active text shape', () => {
  const math = createMathRenderer({ throwOnError: true })
  const nested = String.raw`\emph{foo \emph{bar} baz}`
  const upright = String.raw`\textit{foo \textup{bar} baz}`
  const italic = String.raw`\textup{foo \textit{bar} baz}`
  const formulas = [
    [nested, upright],
    [String.raw`\text{${nested}}`, String.raw`\text{${upright}}`],
    [String.raw`\textup{${nested}}`, String.raw`\textup{${upright}}`],
    [String.raw`\textit{${nested}}`, String.raw`\textit{${italic}}`],
    [String.raw`\text{\it italic {\emph{up}} \emph{still up} {\rm \emph{italic again}}}`,
      String.raw`\text{\it italic {\textup{up}} \textup{still up} {\rm \textit{italic again}}}`],
    [String.raw`\text{{\it italic} \emph{also italic}}`,
      String.raw`\text{{\it italic} \textit{also italic}}`],
  ]
  for (const [source, reference] of formulas)
    expect(math(source, false).split('<annotation')[0]).toBe(math(reference, false).split('<annotation')[0])
})

test('renders formatted equation tags and applies them to the correct alignment row', () => {
  const math = createMathRenderer({ throwOnError: true, leqno: true })
  const equation = math(String.raw`\def\num{VII} \sum_n x_n \tag{\num\textbf{b}, $x^2$}`, true)
  expect(equation).toContain('<mtext>(VII</mtext><mrow style="font-weight:bold"><mtext>b</mtext>')
  expect(equation).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  expect(equation).toContain('<mtext>)</mtext>')
  expect(equation.indexOf('math-equation-number')).toBeLessThan(equation.indexOf('<munder>'))

  const align = math(String.raw`\begin{align} a&=b\tag*{First}\\ c&=d\notag\\ e&=f\end{align}`, true)
  expect(align).toContain('data-equation-tags="left"')
  expect(Array.from(align.matchAll(/class="math-equation-number">(.*?)<\/mtd>/g), match => match[1])).toEqual([
    '<mtext>First</mtext>', '', '<mtext>(1)</mtext>',
  ])
  expect(() => math(String.raw`a\tag*{}\tag{b}`, true)).toThrow('Multiple tags')
  expect(() => math(String.raw`a\tag{b}`, false)).toThrow('Equation tags require display math')
})

test('uses nested math annotations for the enclosing equation or alignment row', () => {
  const math = createMathRenderer({ throwOnError: true })
  const manual = math(String.raw`\begin{equation}\begin{split}a&=b\tag{Title}\\&+c\end{split}\end{equation}`, true)
  expect(manual).toContain('class="math-tagged-display"')
  expect(manual).not.toContain('math-display-grid')
  expect(manual.match(/class="math-equation-number"/g)).toHaveLength(1)
  expect(manual).toContain('<mtext>(Title)</mtext>')
  const noNumber = math(String.raw`\begin{equation}\begin{aligned}a&=b\notag\\&+c\end{aligned}\end{equation}`, true)
  expect(noNumber).not.toContain('math-equation-number')
  const aligned = math(String.raw`\begin{align}a&=\begin{matrix}b\tag*{Manual}\end{matrix}\\c&=d\end{align}`, true)
  expect([...aligned.matchAll(/class="math-equation-number">(.+?)<\/mtd>/g)].map(([, label]) => label)).toEqual([
    '<mtext>Manual</mtext>', '<mtext>(1)</mtext>',
  ])
  expect(() => math(String.raw`\begin{equation*}\tag{Outside}\begin{aligned}a&=b\tag{Inside}\end{aligned}\end{equation*}`, true))
    .toThrow('Multiple tags')
})

test('counts explicit empty final rows in numbered AMS alignments', () => {
  const math = createMathRenderer({ throwOnError: true })
  const numbered = math(String.raw`\begin{align}a&=b\\\end{align}`, true)
  expect(numbered.match(/<mtr>/g)).toHaveLength(2)
  expect(numbered).toContain('<mtext>(2)</mtext>')
  const starred = math(String.raw`\begin{align*}a&=b\\\end{align*}`, true)
  expect(starred.match(/<mtr>/g)).toHaveLength(1)
  const suppressed = math(String.raw`\begin{gather}a=b\\\notag\end{gather}`, true)
  expect(suppressed.match(/<mtr>/g)).toHaveLength(1)
})

test('reads matrix row spacing only after adjacent double backslashes and permits an empty CD', () => {
  const math = createMathRenderer({ throwOnError: true })
  const source = String.raw`\begin{matrix}a&b\cr[c]&d\\ [e]&f\\[1ex]g&h\end{matrix}`
  const html = math(source, true)
  expect(html.match(/<mtr/g)).toHaveLength(4)
  expect(html.match(/<mo stretchy="false">\[<\/mo>/g)).toHaveLength(2)
  expect(html).toContain('padding-bottom:max(0px,calc(0.14em + 1ex))')
  expect(math(String.raw`\begin{CD}\end{CD}`, true)).toContain('<mtable class="math-cd"></mtable>')
  expect(() => math(String.raw`\begin{CD}x\end{matrix}`, true)).toThrow('Unclosed CD environment')
})

test('numbers rendered deck equations in layout order and keeps notes out of the sequence', async () => {
  const left = String.raw`\begin{equation}l=1\end{equation}`
  const deck = [
    '---', 'layout: two-cols', '---', '', '# Columns', '',
    '::right::', '', String.raw`\begin{equation}r=2\end{equation}`, '',
    '::left::', '', left, '',
    '---', 'hide: true', '---', '', '# Hidden', '', String.raw`\begin{equation}h=3\end{equation}`, '',
    '---', '', '# Next', '', '$$',
    String.raw`\begin{align}a&=b\tag*{Manual}\\c&=d\notag\\e&=f\end{align}`, '$$', '',
    '<!--', String.raw`\begin{equation}n=4\end{equation}`, '-->',
  ].join('\n')
  const first = await renderPresentation(parseDeck(deck), { liveCompile: true })
  const slides = first.live?.slides ?? []
  expect(slides).toHaveLength(2)
  expect(slides[0].html).toMatch(/<mi>l<\/mi>.*?<mtext>\(1\)<\/mtext>.*?<mi>r<\/mi>.*?<mtext>\(2\)<\/mtext>/s)
  expect(slides[1].html).toContain('<mtext>Manual</mtext>')
  expect(slides[1].html).toContain('<mtext>(3)</mtext>')
  expect(slides[1].notes).toContain('<mtext>(1)</mtext>')
  expect(first.html).not.toContain('data-equation-auto')

  const edited = await renderPresentation(parseDeck(deck.replace(left, 'No numbered equation here.')), { liveCompile: true })
  expect(edited.live?.slides[1].html).toContain('<mtext>(2)</mtext>')
  expect(edited.live?.slides[1].revision).not.toBe(slides[1].revision)
  expect(edited.live?.frame).toBe(first.live?.frame)
})

test('keeps AMS relation spacing, explicit pair counts, and tags aligned across short rows', () => {
  const math = createMathRenderer({ throwOnError: true })
  const source = String.raw`\def\pairs{2}\def\extra{.4em}
    \begin{alignat}{\pairs} a&=b & c&+d \\[\extra]
      ee&\color{blue}=f\tag{Q} \\
      g&h\notag
    \end{alignat}`
  const html = math(source, true)
  expect(html).toContain('columnalign="right left right left right"')
  expect(html).toContain(thick + operator('=') + thick)
  expect(html).toContain(medium + operator('+') + medium)
  expect(html).toContain('style="color:blue">' + thick + operator('=') + thick)
  expect(html).toContain('padding-bottom:max(0px,calc(0.125em + .4em))')
  expect(html).not.toContain('padding-inline-start:1em')
  const rows = [...html.matchAll(/<mtr>(.*?)<\/mtr>/g)].map(row => row[1])
  expect(rows.map(row => row.match(/<mtd\b/g)?.length)).toEqual([5, 5, 5])
  expect(rows[1]).toEndWith('<mtd class="math-equation-number"><mtext>(Q)</mtext></mtd>')
  expect(rows[2]).toEndWith('<mtd class="math-equation-number"></mtd>')
  expect(math(String.raw`\begin{aligned}a&=b&c&=d\end{aligned}`, false)).toContain('padding-inline-start:1em')
  expect(math(String.raw`\begin{gathered}a=b\\c=d\end{gathered}`, false)).not.toContain('math-equation-number')
})

test('validates AMS environment modes and arguments, and accepts rules inside matrices', () => {
  const math = createMathRenderer({ throwOnError: true })
  expect(() => math(String.raw`\begin{align*} a&=b\end{align*}`, false)).toThrow('align* requires display math')
  expect(() => math(String.raw`\begin{equation} a&=b\end{equation}`, true)).toThrow('Too many columns in equation')
  expect(() => math(String.raw`\begin{split} a&=b&=c\end{split}`, true)).toThrow('Too many columns in split')
  expect(() => math(String.raw`\begin{alignat}{1e2} a&=b\end{alignat}`, true)).toThrow('Invalid alignment column count')
  expect(() => math(String.raw`\begin{alignedat}{1} a&=b & c&=d\end{alignedat}`, false)).toThrow('Too many alignment columns')
  expect(() => math(String.raw`\begin{pmatrix*}[lr] a & b\end{pmatrix*}`, false)).toThrow('Invalid matrix alignment')
  const table = math(String.raw`\def\side{r}\begin{pmatrix*}[\side]\hline a&b\\\hdashline c\\\hline\end{pmatrix*}`, false)
  expect(table).toContain('columnalign="right right"')
  expect(table.match(/border-top:1px solid currentColor/g)).toHaveLength(2)
  expect(table.match(/border-top:1px dashed currentColor/g)).toHaveLength(2)
  expect(table.match(/border-bottom:1px solid currentColor/g)).toHaveLength(2)
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
  expect(html).toContain('<mstyle displaystyle="true" scriptlevel="0"><mrow><mo stretchy="true">(</mo><mfrac linethickness="2pt">')
  expect(html).toContain('<mo stretchy="true">]</mo>')
  expect(html).toContain('<mfrac numalign="right"><mrow><mspace width="0" height="0.85em" depth="0.35em"/>')
  const choices = String.raw`\mathchoice{D}{T}{S}{s} + x^{\mathchoice{D}{T}{S}{s}}`
  expect(renderMath(choices)).toContain('<semantics><mrow><mi>T</mi>')
  expect(renderMath(choices, true)).toContain('<semantics><mrow><mi>D</mi>')
  expect(renderMath(choices)).toContain('<mrow><mi>S</mi></mrow>')
})

test('spaces math choice branches in the surrounding row at the selected style', () => {
  const choices = String.raw`a\mathchoice{=}{+}{\sin}{\cos}b`
  const neighbors = (space: string, glyph: string) => `<mi>a</mi>${space}${operator(glyph)}${space}<mi>b</mi>`
  expect(renderMath(choices, true)).toContain(neighbors(thick, '='))
  expect(renderMath(choices)).toContain(neighbors(medium, '+'))
  expect(renderMath(`x^{${choices}}`)).toContain(neighbors(thin, 'sin'))
  expect(renderMath(`x^{y_{${choices}}}`)).toContain(neighbors(thin, 'cos'))
  expect(renderMath(String.raw`a\mathchoice{\mathchoice{+}{}{}{}}{}{}{}+b`, true))
    .toContain(`<mi>a</mi>${medium}${operator('+')}${medium}${operator('+')}<mi>b</mi>`)
  expect(renderMath(String.raw`a\mathchoice{+}{}{}{}=b`))
    .toContain(neighbors(thick, '='))
  expect(renderMath(String.raw`a\mathchoice{c=}{+}{}{}_ib`, true))
    .toContain(`<mi>a</mi>${thick}<msub><mrow><mi>c</mi><mo>=</mo></mrow><mi>i</mi></msub>${thick}<mi>b</mi>`)
})

test('keeps phantom atoms invisible with the spacing of their visible equivalents', () => {
  const phantom = (content: string) => `<mphantom>${content}</mphantom>`
  expect(renderMath(String.raw`a\phantom{=+}b`))
    .toContain(`<mi>a</mi>${thick}${phantom(operator('='))}${thick}${phantom(operator('+'))}<mi>b</mi>`)
  expect(renderMath(String.raw`a\phantom{\mathchoice{=}{+}{\sin}{s}}b`))
    .toContain(`<mi>a</mi>${medium}${phantom(operator('+'))}${medium}<mi>b</mi>`)
  expect(renderMath(String.raw`a\phantom{\kern-.25em}b`))
    .toContain('<mi>a</mi><mspace width="0" style="margin-inline-end:-.25em"/><mi>b</mi>')
})

test('retains signed horizontal phantoms as ordinary atoms in math and text', () => {
  const math = createMathRenderer({ throwOnError: true })
  const phantom = '<mpadded height="0" depth="0" style="margin-inline-end:-0.17em"><mphantom>'
  expect(math(String.raw`\hphantom{\!}+x`, false)).toContain(`${phantom}</mphantom></mpadded>${medium}${operator('+')}${medium}<mi>x</mi>`)
  expect(math(String.raw`\hphantom{\hphantom{X\!}}`, false)).toContain(`${phantom}<mpadded height="0" depth="0"><mphantom><mi>X</mi>`)
  expect(math(String.raw`\text{A\hphantom\!B}`, false)).toContain(`<mtext>A</mtext>${phantom}</mphantom></mpadded><mtext>B</mtext>`)
  expect(math(String.raw`\text\quad`, false)).toContain('<mspace width="1em"/>')
})

test('positions boxes and prescripts with bounded MathML dimensions', () => {
  const formula = String.raw`\raisebox{2pt}[1ex][0pt]{x}\kern7mu \rule[-1pt]{1em}{.5pt}\smash[b]{y} \prescript{14}{6}{C}`
  const html = renderMath(formula)
  expect(html).toContain('<mpadded height="1ex" depth="0pt"><mtext class="math-raised-box"')
  expect(html).toContain('vertical-align:2pt"><math')
  expect(html).toContain('<mspace width="0.3888888888888889em"/>')
  expect(html).toMatch(/<mpadded voffset="-1pt" [^>]+><mspace width="1em" height="\.5pt"/)
  expect(html).toContain('<mpadded depth="0">')
  expect(html).toContain('<mmultiscripts><mrow><mi>C</mi></mrow><mprescripts/>')
  const unsafe = renderMath(String.raw`\hspace{2em" onclick="oops}`)
  expect(unsafe).toContain('math-unrendered')
  expect(unsafe).not.toContain(' onclick="')
})

test('renders phantom space, smashed dimensions, raised boxes, rules, and verbatim in text mode', async () => {
  const source = String.raw`\def\sides{tb}\def\shift{2pt}
    \text{A\phantom{hidden}\hphantom{wide}\vphantom{tall}\smash[\sides]{flat}
      \raisebox{\shift}{up}\rule[\shift]{1em}{.5pt}\verb*|<a $ b>%{}|Z}`
  const html = await renderDeck(parseDeck(`Inline $${source.replace(/\s*\n\s*/g, ' ')}$ stays inline.`))
  expect(html).toContain('<mphantom><mtext>hidden</mtext></mphantom>')
  expect(html).toContain('<mpadded height="0" depth="0"><mphantom><mtext>wide</mtext></mphantom></mpadded>')
  expect(html).toContain('<mpadded width="0"><mphantom><mtext>tall</mtext></mphantom></mpadded>')
  expect(html).toContain('<mpadded height="0" depth="0"><mtext>flat</mtext></mpadded>')
  expect(html).toMatch(/vertical-align:2pt"><math[^>]*><mrow><mtext>up<\/mtext>/)
  expect(html).toMatch(/<mpadded voffset="2pt" [^>]+><mspace width="1em" height="\.5pt"/)
  expect(html).toContain('>&lt;a␣$␣b&gt;%{}</mtext><mtext>Z</mtext>')
  expect(html).toContain(' stays inline.')
})

test('applies only valid TeX smash flags and expands optional box dimensions', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`\smash[]x\smash[tx]{y}\smash[t]{z} + \text{\smash[b]{g}}`, false)
  expect(html).toContain('<mi>x</mi><mrow><mi>y</mi></mrow><mpadded height="0"><mrow><mi>z</mi></mrow></mpadded>')
  expect(html).toContain('<mpadded depth="0"><mtext>g</mtext></mpadded>')
  expect(math(String.raw`\def\size{1ex}\raisebox{2pt}[\size]{x}`, false)).toContain('<mpadded height="1ex"><mtext class="math-raised-box"')
  expect(() => math(String.raw`\text{\rule[wrong]{1em}{2pt}}`, false)).toThrow('Invalid math box dimension')
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
  expect(html).toContain('<mrow><mi>q</mi></mrow><mtext style="color:#cc0000">\\tmp</mtext>')
})

test('captures eager macro expansion and tracks global definitions per deck', () => {
  const math = createMathRenderer()
  const html = math(String.raw`\def\x{a}\edef\frozen{\x}\def\x{b}\global\def\persist{\nope}\frozen\global\let\deckOnly=\frozen\x`, false)
  expect(html).toContain('<mi>a</mi><mi>b</mi>')
  expect(math(String.raw`\deckOnly`, false)).toContain('<mi>a</mi>')
  expect(math(String.raw`\persist`, false)).toContain('<mtext style="color:#cc0000">\\nope</mtext>')
  expect(createMathRenderer()(String.raw`\deckOnly`, false)).toContain('<mtext style="color:#cc0000">\\deckOnly</mtext>')
})

test('expands brace-delimited definitions and nested macro parameters', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = math(String.raw`
    \def\before#1#{\left[#1\right]}
    \before q{z}
    \def\factory#1{\def\formed##1{#1+##1}}
    \factory{x}\formed{y}
    \def\identity#1,{#1}
    \identity{\def\saved{Q}},\saved
  `, true)
  expect(formula).toContain('<mo stretchy="true">[</mo><mi>q</mi><mo stretchy="true">]</mo>')
  expect(formula).toContain('<mrow><mi>z</mi></mrow>')
  expect(formula).toContain('<mi>x</mi><mo>+</mo><mi>y</mi><mi>Q</mi>')
  expect(() => math(String.raw`\def\before#1#{#1}\before a`, false)).toThrow('Missing macro delimiter')
  expect(() => math(String.raw`\def\identity#1,{#1}\identity{{\def\local{L}}},\local`, false)).toThrow('Unsupported math command')
})

test('uses the base operator class for labelled and bold symbols', () => {
  const math = createMathRenderer({ throwOnError: true })
  const labels = math(String.raw`a\overset{!}{=}b\underset{i}{+}c`, true)
  expect(labels).toContain(thick + '<mover><mrow>' + operator('='))
  expect(labels).toContain('</mover>' + thick + '<mi>b</mi>' + medium + '<munder><mrow>' + operator('+'))
  expect(labels).toContain('</munder>' + medium + '<mi>c</mi>')
  const bold = math(String.raw` a\boldsymbol{\leq}b\bm{+}c\pmb{=}d \@binrel{+}{\square}e`, true)
  expect(bold).toContain(thick + '<mrow class="math-bold-italic"')
  expect(bold).toContain(operator('≤') + '</mrow></mrow>' + thick)
  expect(bold).toContain(operator('+') + '</mrow></mrow>' + medium)
  expect(bold).toContain(thick + '<mrow class="math-pmb"><mrow>' + operator('=') + '</mrow></mrow>' + thick)
  expect(bold).toContain('<mi>d</mi>' + medium)
  expect(bold).toContain(medium + '<mi>e</mi>')
  const ordinary = math(String.raw`a\overset{!}{x}b`, true)
  expect(ordinary).not.toContain('<mspace')
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
  expect(html).toContain('border-right:calc(1 * max(0.2em,2 * 1px) + 1px) solid transparent')
  expect(html).toContain('border-top:1px solid currentColor')
  expect(html).toContain('border-top:1px dashed currentColor')
  expect(html).toContain('border-bottom:1px solid currentColor')
  expect(html).toContain('padding-bottom:max(0px,calc(0.21em + 1ex))')
  expect(html).toContain('<mstyle displaystyle="true" scriptlevel="0"><mi>D</mi></mstyle>')
  expect(html).toContain('<mtext style="color:#cc0000">\\value</mtext>')
  const array = html.match(/<mtable data-equation-lines[^>]*>.*?<\/mtable>/)?.[0]
  expect(array?.match(/<mtr>/g)).toHaveLength(2)
  expect(renderMath(String.raw`\begin{array}{c}a`)).toContain('math-unrendered')
  expect(renderMath(String.raw`\begin{array}{c}a\\[bogus]b\end{array}`)).toContain('math-unrendered')
})

test('honors the scoped array stretch in AMS matrices and alignment environments', () => {
  const math = createMathRenderer({ throwOnError: true })
  const html = math(String.raw`
    {\def\arraystretch{2}\begin{pmatrix}a\\b\end{pmatrix}
      \begin{aligned}a&=b\\c&=d\end{aligned}}
    \begin{pmatrix}a\\b\end{pmatrix}
  `, true)
  expect(html.match(/padding-block:0\.28em/g)).toHaveLength(2)
  expect(html.match(/padding-block:0\.25em/g)).toHaveLength(4)
  expect(() => math(String.raw`\def\arraystretch{0}\begin{matrix}a\end{matrix}`, true)).toThrow('Invalid array stretch')
  const fixed = math(String.raw`\def\arraystretch{0}\begin{subarray}{l}a\\b\end{subarray}
    \begin{cases}c&d\end{cases}`, true)
  expect(fixed).toContain('padding-block:0.06em')
  expect(fixed).toContain('padding-block:0.125em')
})

test('limits the number of array rules expanded across cells', () => {
  const math = createMathRenderer({ throwOnError: true })
  const spec = '|'.repeat(500) + 'c'
  const body = Array.from({ length: 50 }, () => 'a').join(String.raw`\\`)
  expect(() => math(`\\begin{array}{${spec}}${body}\\end{array}`, true)).toThrow('Math array has too many rules')
})

test('renders compact substack and subarray limits with no nested equation click rows', () => {
  const html = renderMath(String.raw`\sum_{\substack{i>0\\j<n}} x_{ij} +
    \lim_{\begin{subarray}{l}i\to0\cr j\to0\end{subarray}} y`, true)
  expect(html.match(/class="math-compact-array/g)).toHaveLength(2)
  expect(html.match(/<munder>/g)).toHaveLength(2)
  expect(html.match(/<mtr><mtd style=/g)).toHaveLength(4)
  expect(html).toContain('columnalign="left"')
  expect(html).not.toContain('data-equation-lines')
  expect(renderMath(String.raw`\substack{a & b}`)).toContain('math-unrendered')
  expect(renderMath(String.raw`\begin{subarray}{r}a\end{subarray}`)).toContain('math-unrendered')
})

test('expands single-token and eager substack arguments and resets compact rows to script style', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = String.raw`\def\terms{i>0\\j<n}\edef\limits{\substack\terms}
    \def\terms{z}\sum_{\limits}x+
    y_{z_{\substack{\mathchoice{D}{T}{S}{Q}}}}+
    \begin{subarray}{}a\\b\end{subarray}`
  const markup = math(formula, true).split('<annotation')[0]
  expect(markup.match(/class="math-compact-array/g)).toHaveLength(3)
  expect(markup.match(/<mtr><mtd style=/g)).toHaveLength(5)
  expect(markup).toContain('<mi>i</mi>')
  expect(markup).toContain('<mi>j</mi>')
  expect(markup).toContain('<mi>S</mi>')
  expect(markup).not.toContain('<mi>Q</mi>')
  expect(math(String.raw`\let\stack=\substack \stack x`, false)).toContain('<mi>x</mi>')
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
  expect(html).not.toMatch(/<mtext[^>]*>\\badcommand<\/mtext>/)
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
  expect(html).toContain('<munderover><mrow class="math-arrow-body" style="min-width:3em"><mo stretchy="true" movablelimits="false" minsize="3em">→</mo><mspace class="math-arrow-track" data-right="open" aria-hidden="true"/></mrow><mrow><mi>p</mi></mrow><mrow><mi>f</mi></mrow></munderover>')
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
  expect(html).toContain('<mover><mrow class="math-arrow-body" style="min-width:3em"><mo stretchy="true" movablelimits="false" minsize="3em">→</mo><mspace class="math-arrow-track" data-right="open" aria-hidden="true"/></mrow><mrow><mi>g</mi></mrow></mover>')
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

test('shares local macros across CD cells and labels within one row', () => {
  const render = createMathRenderer({ throwOnError: true, macros: { '\\mapLabel': 'x' } })
  const html = render(String.raw`\begin{CD}
    \def\mapLabel{a} A @>\mapLabel>\def\mapLabel{b}\mapLabel> \mapLabel\\
    @V\mapLabel VV @. \\
    C @<\mapLabel<< D
  \end{CD} + \mapLabel`, true)
  expect(html).toContain('<mrow><mi>b</mi></mrow><mrow><mi>a</mi></mrow></munderover></mtd><mtd><mi>b</mi></mtd>')
  expect(html).toContain('<mstyle displaystyle="false" scriptlevel="1"><mrow><mi>x</mi></mrow></mstyle><mrow class="math-cd-arrow" data-direction="down">')
  expect(html).toContain('<mrow><mi>x</mi></mrow></mover>')
  expect(html).toContain('</mtable><mo>+</mo><mi>x</mi>')
})

// The reference expansions follow KaTeX v0.19.1's braket.sty tests (MIT).
test('expands fixed and scalable bra-ket and set-builder delimiters', () => {
  const math = createMathRenderer({ throwOnError: true })
  const markup = (source: string) => math(source, false).split('<annotation')[0]
  const cases = [
    [String.raw`A\bra{\psi}B`, String.raw`A\mathinner{\langle{\psi}|}B`],
    [String.raw`\ket{\phi}\braket{\phi|\psi}`, String.raw`\mathinner{|{\phi}\rangle}\mathinner{\langle{\phi|\psi}\rangle}`],
    [String.raw`\Bra{\frac ab}\Ket{x}`, String.raw`\left\langle\frac ab\right|\left|x\right\rangle`],
    [String.raw`\Braket{u|\frac H2\|v}`, String.raw`\left\langle u\,\middle\vert\,\frac H2\,\middle\vert\,v\right\rangle`],
    [String.raw`\Set{x||x<5|S|}`, String.raw`\left\{\:x\;\middle\Vert\;x<5|S|\:\right\}`],
    [String.raw`\set{x\|x<5|S|}`, String.raw`\{\,x\|x<5\mid S|\,\}`],
    [String.raw`\def\sep{|}\Set{x\sep y|S|}`, String.raw`\left\{\:x\;\middle\vert\;y|S|\:\right\}`],
    [String.raw`\def|{P}\Set{x\|y|z}|`, String.raw`\left\{\:x\;\middle\Vert\;yPz\:\right\}P`],
    [String.raw`\edef\saved{\Braket{x|\frac ab|y}}\saved`, String.raw`\Braket{x|\frac ab|y}`],
  ]
  for (const [source, expansion] of cases) expect(markup(source)).toBe(markup(expansion))
  math(String.raw`\global\let\savedSet=\Set`, false)
  expect(markup(String.raw`\savedSet{n\|n>0}`)).toBe(markup(String.raw`\Set{n||n>0}`))
  expect(renderMath(String.raw`\Braket{\psi|`)).toContain('math-unrendered')
})

test('places arrow, accent, and stretchy brace labels with the expected math styles', () => {
  const input = String.raw`A\xrightleftharpoons[slow]{\mathchoice{D}{T}{S}{s}}B \quad
  \overbrace{a+b}^{n} \quad \underbrace{c+d}_{m}
  \quad \widecheck{fg}+\underleftharpoon{h}`
  const html = renderMath(input, true)
  expect(html).toContain('<munderover><mrow class="math-arrow-body" style="min-width:1.75em"><mo stretchy="true" movablelimits="false" minsize="1.75em">⇌</mo><mspace class="math-arrow-track" data-lane="upper" data-right="upper" aria-hidden="true"/><mspace class="math-arrow-track" data-lane="lower" data-left="lower" aria-hidden="true"/></mrow><mrow><mi>s</mi><mi>l</mi><mi>o</mi><mi>w</mi></mrow><mrow><mi>S</mi></mrow></munderover>')
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
  expect(html).toMatch(/vertical-align:\.3em"><math[^>]* scriptlevel="0" displaystyle="false"><mrow><mrow class="math-font-reset"><msup><mi>y<\/mi><mn>2<\/mn><\/msup>/)
  expect(html).toContain('class="math-color-box math-frame"><mstyle displaystyle="false" scriptlevel="0"><mtext>check</mtext>')
  expect(html).toContain('style="background-color:yellow"><mstyle displaystyle="false" scriptlevel="0"><mtext>draft</mtext>')
  expect(html).toContain('style="color:#228B22"')
  expect(html.match(/class="math-reflect"/g)).toHaveLength(2)
  expect(() => math(String.raw`\colorbox{red;display:none}{x}`, true)).toThrow('Invalid math box color')
  expect(renderMath(String.raw`\fcolorbox{red"}{white}{<img>}`)).toContain('math-unrendered')
})

test('keeps style-dependent math in a lap and uses text mode for plain laps', () => {
  const html = renderMath(String.raw`\sum_{\mathclap{\mathchoice{D}{T}{S}{s}}}+\text{\rlap{test}}`, true)
  expect(html).toContain('<munder>')
  expect(html).toContain('<mpadded width="0"><mrow class="math-overlap-c"><mrow><mi>S</mi></mrow>')
  expect(html).toContain('<mpadded width="0"><mrow class="math-overlap-r"><mtext>test</mtext>')
})

test('renders explicit TeX breaks in inline, display, text, and alignment math', () => {
  const math = createMathRenderer({ throwOnError: true, maxSize: 2 })
  const source = String.raw`a\\[4em]b\newline[c]`
  const inline = math(source, false)
  expect(inline).toContain('<mtable><mtr><mtd style="text-align:start;padding-bottom:max(0px,calc(0.14em + 2em))">')
  expect(inline.match(/<mtr>/g)).toHaveLength(3)
  expect(inline).toContain('<mo stretchy="false">[</mo><mi>c</mi><mo stretchy="false">]</mo>')
  expect(math(source, true)).toContain('<mtable data-equation-lines>')
  expect(math(String.raw`\textbf{first\newline second}`, false)).toContain('<mrow style="font-weight:bold"><mtable>')
  expect(math(String.raw`\text{up\\[1em]down}`, false)).toContain('<mtext>up</mtext></mtd></mtr>')
  expect(math(String.raw`\begin{equation*}a\\b\end{equation*}`, true)).toContain('<mtable data-equation-lines>')
  expect(math(String.raw`\begin{align*}a&=b\newline c&=d\end{align*}`, true).match(/<mtr>/g)).toHaveLength(2)
  expect(math(String.raw`\def\gap{1.5em}a\\[\gap]b`, false)).toContain('padding-bottom:max(0px,calc(0.14em + 1.5em))')
  expect(math(String.raw`\text{\def\gap{1em}a\\[\gap]b}`, false)).toContain('padding-bottom:max(0px,calc(0.14em + 1em))')
  expect(() => math(String.raw`a\\[large]b`, false)).toThrow('Invalid math line spacing')
})

test('marks outer binary operators and relations for inline wrapping', () => {
  const math = createMathRenderer({ throwOnError: true }, true)
  const marker = '<mspace width="0" data-math-break=""/>'
  const pieces = (source: string, display = false) => math(source, display).split('<annotation')[0].split(marker)
  const automatic = pieces(String.raw`a+b=c`)
  expect(automatic).toHaveLength(3)
  expect(automatic[0]).toEndWith(operator('+') + medium)
  expect(automatic[1]).toBe('<mi>b</mi>' + thick + operator('=') + thick)
  expect(automatic[2]).toBe('<mi>c</mi></mrow>')
  expect(pieces(String.raw`+a=b+`)).toHaveLength(2)
  expect(pieces(String.raw`a + \kern{1em}\nobreak b\allowbreak c`)).toHaveLength(2)
  expect(pieces(String.raw`a + \kern{1em}\nobreak b\allowbreak c`)[0]).toEndWith('<mi>b</mi>')
  expect(pieces(String.raw`{a+b}+\frac{c+d}{e=f}`)).toHaveLength(2)
  expect(pieces(String.raw`{a+b}=c+d`)).toHaveLength(3)
  expect(pieces(String.raw`x^{a+b}y`)).toHaveLength(1)
  expect(pieces(String.raw`a+b\over c+d`)).toHaveLength(1)
  expect(pieces(String.raw`a+b\allowbreak c=d`, true)).toHaveLength(1)
  expect(pieces(String.raw`a+b\\c+d`)).toHaveLength(1)
})

test('uses the strict display break policy while keeping inline and AMS line breaks', () => {
  const calls: { code: string, message: string }[] = []
  const math = createMathRenderer({
    throwOnError: true,
    strict(code, message) {
      calls.push({ code, message })
      return 'error'
    },
  })
  const source = String.raw`a + \\[1em] b\newline c`
  expect(math(source, true)).toContain('<mrow><mi>a</mi><mo>+</mo><mi>b</mi><mi>c</mi></mrow>')
  expect(math(source, false)).toContain('<mtable>')
  expect(math(String.raw`\begin{aligned}a&=b\\[.5em]c&=d\end{aligned}`, true).match(/<mtr>/g)).toHaveLength(2)
  expect(calls.map(call => call.code)).toEqual(['newLineInDisplayMode', 'newLineInDisplayMode'])
  expect(calls[0].message).toContain('LaTeX display math')
  expect(createMathRenderer({ strict: true })(source, true)).not.toContain('<mtable')
  expect(createMathRenderer({ strict: 'ignore' })(source, true)).toContain('<mtable data-equation-lines>')
})

test('renders bracket annotations, ruled segments, and text accents in both modes', () => {
  const math = createMathRenderer({ throwOnError: true })
  const formula = String.raw`\overbracket{a+b}^{top} + \underbracket{c+d}_{bottom}
    + \overlinesegment{AB} + \underlinesegment{CD} + \underbar{AB $i^2$}
    + \text{\def\vowel{e}caf\'{\vowel} \textcircled{A} \underbar{note}}
    + \c{c} + \textcircled{B}`
  const html = math(formula, true)
  expect(html).toContain('<mover><mrow class="math-overbracket">')
  expect(html).toContain('<munder><mrow class="math-underbracket">')
  expect(html).toContain('<mrow class="math-overlinesegment"><mrow><mi>A</mi><mi>B</mi>')
  expect(html).toContain('<mrow class="math-underlinesegment"><mrow><mi>C</mi><mi>D</mi>')
  expect(html).toContain('<mrow class="math-underline"><mrow><mtext>AB </mtext>')
  expect(html).toContain('<mtext>café </mtext>')
  expect(html).toContain('<mtext>ç</mtext>')
  expect(math(String.raw`\u{g}`, false)).toContain('<mtext>ğ</mtext>')
  expect(() => math(String.raw`\u`, false)).toThrow('Missing math text argument')
  expect(html).toContain('<mrow class="math-underline"><mtext>note</mtext>')
  expect(html).toContain('<mrow class="math-text-circled"><mtext>A</mtext>')
  expect(html).toContain('<mrow class="math-text-circled"><mtext>B</mtext>')
  expect(math(String.raw`\sout{x^2}`, false)).toContain('<mrow class="math-sout"><mrow><msup><mi>x</mi>')
  expect(math(String.raw`\text{a\kern1emb}`, false)).toContain('<mtext>a</mtext><mspace width="1em"/><mtext>b</mtext>')
})

// Unicode diagnostics and examples adapted from the KaTeX 0.19.1 fixtures.
test('keeps combining accents attached to math atoms, scripts, and macro arguments', () => {
  const math = createMathRenderer({ throwOnError: true, strict: true })
  const html = math(String.raw`\def\mark#1{#1}` + 'x\u0302^2 + \u03B1\u0301 + i\u0301 + \\mark j\u0301', false)
  expect(html).toContain('<msup><mover accent="true"><mi>x</mi><mo>ˆ</mo></mover><mn>2</mn></msup>')
  expect(html).toContain('<mover accent="true"><mi>α</mi><mo>´</mo></mover>')
  expect(html).toContain('<mover accent="true"><mi>ı</mi><mo>´</mo></mover>')
  expect(html).toContain('<mover accent="true"><mi>ȷ</mi><mo>´</mo></mover>')
  expect(math('\\text{A\u0301C\u0301 \u1EA5}', false)).toContain('<mtext>ÁĆ ấ</mtext>')
  expect(() => math('\u0301', false)).toThrow('requires a base character')
  expect(() => math('x\u0323', false)).toThrow('Unknown Unicode combining accent')
})

test('reports KaTeX Unicode diagnostic codes and original tokens in the active mode', () => {
  const diagnostics: [string, string | undefined][] = []
  const math = createMathRenderer({
    throwOnError: true,
    strict(code, _message, token) {
      diagnostics.push([code, token?.text])
      return 'ignore'
    },
  })
  const html = math('é+試+x’+۹ + \\text{試 é 👩}', true)
  expect(html).toContain('<mover accent="true"><mi>e</mi><mo>´</mo></mover>')
  expect(html).toContain('<mtext>試</mtext>')
  expect(html).toContain('<mtext>試 é 👩</mtext>')
  expect(diagnostics).toEqual([
    ['unicodeTextInMathMode', 'é'], ['unicodeTextInMathMode', '試'],
    ['unknownSymbol', '’'], ['unknownSymbol', '۹'], ['unknownSymbol', '👩'],
  ])
  diagnostics.length = 0
  expect(math('𝔸 + 𝟎 + x² + α ≠ β + \\text{Café 試}', false)).toContain('<mn>𝟎</mn>')
  expect(diagnostics).toEqual([])
})

test('makes Unicode policy affect mixed equations and retains explicit Unicode spacing', () => {
  const strict = createMathRenderer({ throwOnError: true, strict: 'error' })
  expect(() => strict('é', false)).toThrow('[unicodeTextInMathMode]')
  expect(() => strict('x′', false)).toThrow('[unknownSymbol]')
  expect(() => strict('²', false)).toThrow('[unknownSymbol]')
  expect(() => strict('x\u2009y', false)).toThrow('[unknownSymbol]')
  expect(() => strict('\\text{ά}', false)).toThrow('[unknownSymbol]')
  expect(() => strict('®', false)).toThrow('[mathVsTextAccents]')
  expect(() => strict('x\u2028y', false)).toThrow('Unexpected Unicode character')
  const relaxed = createMathRenderer({ throwOnError: true, strict: 'ignore' })
  expect(relaxed('x\u2009y', false)).toContain('<mi>x</mi><mtext>\u2009</mtext><mi>y</mi>')
  expect(relaxed('\\text{x\u00A0y}', false)).toContain('<mtext>x\u00A0y</mtext>')
  expect(relaxed('x′', false)).toContain('<msup><mi>x</mi>')
  expect(createMathRenderer({ strict: 'error' })('é', false)).toContain('math-unrendered')
})

test('enforces KaTeX strict settings for comments, markup, text commands, spacing, and array columns', () => {
  const samples = [
    ['commentAtEnd', 'x % comment'],
    ['htmlExtension', String.raw`\htmlClass{accent}{x}`],
    ['mathVsSout', String.raw`\sout{x^2}`],
    ['mathVsTextAccents', String.raw`\'{e}`],
    ['mathVsTextUnits', String.raw`a\mkern1emb`],
    ['mathVsTextUnits', String.raw`\text{a\mskip{2mu}b}`],
    ['mathVsTextUnits', String.raw`\text{a\kern{2mu}b}`],
    ['textEnv', String.raw`\begin{array}{c}a&b\end{array}`],
  ]
  const error = createMathRenderer({ strict: true, throwOnError: true, trust: true })
  const permissive = createMathRenderer({ strict: 'ignore', throwOnError: true, trust: true })
  for (const [code, source] of samples) {
    expect(() => error(source, true)).toThrow(`[${code}]`)
    expect(permissive(source, true)).toContain('<math ')
  }
  const valid = String.raw`\text{s\'{e} \sout{old}\kern{1pt} 50\%} + x\mkern2muy`
  expect(error(valid, true)).toContain('<mtext>sé </mtext>')
  expect(error('x % comment\ny', false)).toContain('<mi>x</mi><mi>y</mi>')
  expect(error(String.raw`\verb|a%b| \url{https://example.com/a%20b}`, false)).toContain('href="https://example.com/a%20b"')
  expect(createMathRenderer({ strict: 'error' })('x % comment', false)).toContain('math-unrendered')
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const called: string[][] = []
    const policy = createMathRenderer({
      throwOnError: true,
      strict(code, message, token) {
        called.push([code, token?.text ?? ''])
        return message.includes('accent') ? 'warn' : 'error'
      },
    })
    expect(policy(String.raw`\'e`, true)).toContain('<mtext>é</mtext>')
    expect(() => policy('x % comment', false)).toThrow('[commentAtEnd]')
    expect(called).toEqual([['mathVsTextAccents', "\\'"], ['commentAtEnd', '']])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[mathVsTextAccents]')
  }
  finally {
    warn.mockRestore()
  }
})

const chrome = await findChrome()

test.skipIf(!chrome)('preserves the horizontal advance of negative kerns in invisible boxes in Chromium', async () => {
  const comparisons = [
    [String.raw`x\,\hphantom{\!}x`, 'xx'],
    [String.raw`x\hphantom{\kern{-1em}X\mkern{-9mu}}x`, String.raw`x\hphantom{X}\kern{-1em}\mkern{-9mu}x`],
    [String.raw`x\hphantom{\mathchoice{D}{\!\kern{-.2em}}{S}{s}}x`, String.raw`x\!\kern{-.2em}x`],
    [String.raw`\text{A\hphantom{T\kern{-.3em}}B}`, String.raw`\text{A\hphantom{T}\kern{-.3em}B}`],
  ]
  const rows = comparisons.flat().map(tex => `<div>${renderMath(tex)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px">${rows}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const gaps = await view.evaluate<number[]>(`[...document.querySelectorAll('main > div > math')].map(math => {
      const glyphs = [...math.querySelectorAll('mi, mtext')].filter(node => !node.closest('mphantom'))
      return glyphs[1].getBoundingClientRect().left - glyphs[0].getBoundingClientRect().right
    })`)
    for (let index = 0; index < gaps.length; index += 2)
      expect(gaps[index]).toBeCloseTo(gaps[index + 1], 1)
    expect(gaps[2]).toBeLessThan(0)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('sizes raised text boxes from their shifted baseline in Chromium', async () => {
  const math = createMathRenderer({ throwOnError: true })
  const formulas = [
    String.raw`\raisebox{}{Ag}`,
    String.raw`\raisebox{1em}{Ag}`,
    String.raw`\raisebox{-1em}{Ag}`,
    String.raw`\raisebox{-.1em}{Ag}`,
    String.raw`\raisebox{1em}[.2em][.25em]{Ag}`,
    String.raw`x_{\raisebox{.2em}{$\mathchoice{D}{T}{S}{SS}$}}`,
    String.raw`\textbf{\raisebox{.2em}{Ag}}`,
  ]
  const marker = '<mspace class="baseline" width="0" height="0" depth="0"/>'
  const rows = formulas.map(source => `<div>${math(source, false).replace('</mrow><annotation', `${marker}</mrow><annotation`)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px">${rows}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const boxes = await view.evaluate<{
      ascent: number, descent: number, ink: number, offset: number, font: number, text: string, weight: string,
    }[]>(`[...document.querySelectorAll('main > div > math')].map(math => {
      const baseline = math.querySelector('.baseline').getBoundingClientRect().top
      const box = math.getBoundingClientRect()
      const shifted = math.querySelector('.math-raised-box > span > span')
      const text = shifted.querySelector('math > mrow')
      return {
        ascent: baseline - box.top,
        descent: box.bottom - baseline,
        ink: baseline - text.getBoundingClientRect().top,
        offset: parseFloat(getComputedStyle(shifted).verticalAlign),
        font: parseFloat(getComputedStyle(text).fontSize),
        text: text.textContent,
        weight: getComputedStyle(text).fontWeight,
      }
    })`)
    const [normal, raised, lowered, shifted, fixed, script, bold] = boxes
    expect(raised.ascent).toBeCloseTo(normal.ascent + 40)
    expect(raised.descent).toBeCloseTo(0)
    expect(lowered.ascent).toBeCloseTo(0)
    expect(lowered.descent).toBeCloseTo(normal.descent + 40)
    expect(shifted.ascent).toBeCloseTo(normal.ascent - 4)
    expect(shifted.descent).toBeCloseTo(normal.descent + 4)
    expect(fixed.ascent).toBeCloseTo(8)
    expect(fixed.descent).toBeCloseTo(10)
    expect(fixed.ink).toBeCloseTo(raised.ink)
    expect(script.text).toBe('T')
    expect(script.font).toBe(normal.font)
    expect(script.offset).toBeCloseTo(5.6, 1)
    expect(bold.weight).toBe('700')
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('matches visible atom positions for math choices and phantoms in Chromium', async () => {
  const cases = [
    String.raw`a\mathrel{=}+b`,
    String.raw`a\mathchoice{=}{+}{-}{}+b`,
    String.raw`a\phantom{=+}b`,
  ]
  const body = cases.map(source => `<div>${renderMath(source, true)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const positions = await view.evaluate<number[][]>(`[...document.querySelectorAll('math')].map(math => {
      const left = math.querySelector('mi').getBoundingClientRect().left
      return [...math.querySelectorAll('mi, mo')].map(atom => atom.getBoundingClientRect().left - left)
    })`)
    expect(positions[0]).toHaveLength(4)
    for (const [index, left] of positions[0].entries()) {
      expect(positions[1][index]).toBeCloseTo(left)
      expect(positions[2][index]).toBeCloseTo(left)
    }
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('reserves ascent and descent for shifted TeX rules in Chromium', async () => {
  const math = createMathRenderer({ throwOnError: true })
  const formulas = [
    String.raw`\rule{1em}{.5em}`,
    String.raw`\rule[+.5em]{1em}{.5em}`,
    String.raw`\rule[-8px]{1em}{.5em}`,
    String.raw`\rule[-1em]{1em}{.5em}`,
    String.raw`\rule{}{.5em}`,
    String.raw`\rule[.5em]{1em}{}`,
  ]
  const baseline = '<mspace class="baseline" width="0" height="0" depth="0"/>'
  const body = formulas.map(formula => math(formula, false).replace('</mrow><annotation', `${baseline}</mrow><annotation`)).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<number[][]>(`[...document.querySelectorAll('math')].map(math => {
      const baseline = math.querySelector('.baseline').getBoundingClientRect().top
      const box = math.getBoundingClientRect()
      const ink = math.querySelector('mspace').getBoundingClientRect()
      return [baseline - box.top, box.bottom - baseline, baseline - ink.top, ink.bottom - baseline, ink.width]
    })`)
    const expected = [
      [20, 0, 20, 0, 40],
      [40, 0, 40, -20, 40],
      [12, 8, 12, 8, 40],
      [0, 40, -20, 40, 40],
      [20, 0, 20, 0, 0],
      [20, 0, 20, -20, 40],
    ]
    for (const [index, dimensions] of expected.entries())
      for (const [metric, dimension] of dimensions.entries())
        expect(geometry[index][metric]).toBeCloseTo(dimension)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('paints mixed array rules as separate strokes on all sides in Chromium', async () => {
  const math = createMathRenderer({ minRuleThickness: 0.08, throwOnError: true })
  const formula = String.raw`\begin{array}{|:|c::}
    \hline\hdashline\hline abcdefghijklmnop\\\hdashline\hline
  \end{array}`
  const stylesheet = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${stylesheet}</style>
      <main class="slide" style="background:white;color:#d00000;font-size:40px">${math(formula, true)}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const screenshot = await view.screenshot()
    const encoded = Buffer.from(await screenshot.arrayBuffer()).toString('base64')
    const strokes = await view.evaluate<Record<string, number[]>>(`(async () => {
      const cell = document.querySelector('math mtd')
      const { left, right, top, bottom } = cell.getBoundingClientRect()
      const styles = getComputedStyle(cell)
      const em = parseFloat(styles.fontSize)
      const ratio = devicePixelRatio
      const image = new Image()
      image.src = 'data:' + ${JSON.stringify(screenshot.type || 'image/png')} + ';base64,${encoded}'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const { width, data } = context.getImageData(0, 0, image.width, image.height)
      function coverage(horizontal, fixed, start, end) {
        let count = 0
        for (let pos = start; pos < end; pos++) {
          const x = Math.floor((horizontal ? pos : fixed) * ratio)
          const y = Math.floor((horizontal ? fixed : pos) * ratio)
          const i = (y * width + x) * 4
          if (data[i] > 120 && data[i + 1] < 100 && data[i + 2] < 100)
            count++
        }
        return count / Math.ceil(end - start)
      }
      const line = (y) => coverage(true, y, left + 0.5 * em, right - 0.5 * em)
      const rule = (x) => coverage(false, x, top + 0.65 * em, bottom - 0.4 * em)
      const center = 0.04 * em
      return {
        left: [0, 0.2, 0.4, 0.1].map(n => rule(left + n * em + center)),
        right: [0.2, 0, 0.1].map(n => rule(right - n * em - center)),
        top: [0, 0.25, 0.5, 0.125].map(n => line(top + n * em + center)),
        bottom: [0.25, 0, 0.125].map(n => line(bottom - n * em - center)),
      }
    })()`)
    for (const [side, kinds] of Object.entries({
      left: ['solid', 'dashed', 'solid', 'gap'],
      right: ['dashed', 'dashed', 'gap'],
      top: ['solid', 'dashed', 'solid', 'gap'],
      bottom: ['dashed', 'solid', 'gap'],
    })) {
      for (const [index, kind] of kinds.entries()) {
        const coverage = strokes[side][index]
        if (kind === 'solid') expect(coverage).toBeGreaterThan(0.9)
        if (kind === 'dashed') {
          expect(coverage).toBeGreaterThan(0.3)
          expect(coverage).toBeLessThan(0.8)
        }
        if (kind === 'gap') expect(coverage).toBe(0)
      }
    }
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('uses continued fraction struts and styles both generalized fraction fences in Chromium', async () => {
  const sources = [
    String.raw`\dfrac{1}{1}`,
    String.raw`\cfrac{1}{1}`,
    String.raw`\genfrac{(}{)}{}{0}{1}{1}`,
    String.raw`\genfrac{(}{)}{}{1}{1}{1}`,
  ]
  const body = sources.map(source => `<div>${renderMath(source)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const measures = await view.evaluate<{ height: number, fences: number[] }[]>(`[...document.querySelectorAll('main > div')].map(row => ({
      height: row.querySelector('mfrac').getBoundingClientRect().height,
      fences: [...row.querySelectorAll('mo')].map(fence => fence.getBoundingClientRect().height),
    }))`)
    expect(measures[1].height).toBeGreaterThan(measures[0].height)
    expect(measures[2].height).toBeGreaterThan(measures[3].height)
    expect(measures[2].fences).toHaveLength(2)
    for (const [index, height] of measures[2].fences.entries())
      expect(height).toBeGreaterThan(measures[3].fences[index])
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('renders legacy font boundaries and colon relation gaps in Chromium', async () => {
  const source = String.raw`{\bf A{\tt B}C} \Gamma\varGamma + a\coloneqq b`
  const matrix = String.raw`\mathbf{a\begin{matrix}x&\mathbf{y}\end{matrix}b}`
  const scripts = String.raw`x_{\hbox{Box}}+y_{\text{Script}}`
  const switches = String.raw`\textsf{\textbf{\textit{outer $x+\text{inner}+\textit{italic}$ rest}}}\mathsf{\text{reset}}`
  const body = `<div>${renderMath(source)}</div><div id="matrix-fonts">${renderMath(matrix)}</div><div id="box-style">${renderMath(scripts)}</div><div id="font-switch">${renderMath(switches)}</div>`
  const stylesheet = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${stylesheet}</style><div class="slide" style="font-size:36px">${body}</div>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{ weights: string[], family: string, transforms: string[], gaps: number[], matrix: string[], sizes: number[], switches: string[][] }>(`(() => {
      const bold = document.querySelector('.math-bold')
      const [a, b, c] = bold.querySelectorAll('mi')
      const capitals = [...document.querySelectorAll('mi')].filter(letter => letter.textContent === 'Γ')
      const relation = [...document.querySelectorAll('mo')].find(symbol => symbol.textContent === '≔')
      return {
        weights: [a, b, c].map(letter => getComputedStyle(letter).fontWeight),
        family: getComputedStyle(b).fontFamily,
        transforms: capitals.map(letter => getComputedStyle(letter).textTransform),
        gaps: [relation.previousElementSibling, relation.nextElementSibling].map(space => space.getBoundingClientRect().width),
        matrix: [...document.querySelectorAll('#matrix-fonts mi')].map(letter => getComputedStyle(letter).fontWeight),
        sizes: [...document.querySelectorAll('#box-style mtext')].map(text => parseFloat(getComputedStyle(text).fontSize)),
        switches: [...document.querySelectorAll('#font-switch :is(mtext, mi)')].map(node => {
          const { fontFamily, fontStyle, fontWeight } = getComputedStyle(node)
          return [node.textContent.trim(), fontFamily, fontStyle, fontWeight]
        }),
      }
    })()`)
    expect(geometry.weights).toEqual(['700', '400', '700'])
    expect(geometry.family).toContain('monospace')
    expect(geometry.transforms[0]).not.toBe(geometry.transforms[1])
    expect(geometry.gaps.map(Math.round)).toEqual([10, 10])
    expect(geometry.matrix).toEqual(['700', '400', '700', '700'])
    expect(geometry.sizes[0]).toBeGreaterThan(geometry.sizes[1])
    expect(geometry.switches).toEqual([
      ['outer', 'sans-serif', 'italic', '700'], ['x', 'math', 'normal', '400'], ['inner', 'sans-serif', 'normal', '700'],
      ['italic', 'sans-serif', 'italic', '700'], ['rest', 'sans-serif', 'italic', '700'], ['reset', 'math', 'normal', '400'],
    ])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('lays out compact TeX arrays with script-sized rows and correct alignment in Chromium', async () => {
  const examples = [
    String.raw`\begin{subarray}{l}x\\xxx\end{subarray}`,
    String.raw`\substack{x\\xxx}`,
    String.raw`\begin{smallmatrix}x&x\\x&x\end{smallmatrix}`,
    String.raw`x_{y_{\substack{x\\xxx}}}`,
  ]
  const body = examples.map(source => `<p>${renderMath(source)}</p>`).join('')
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{ start: number, center: number, font: number, padding: number, gap: number }[]>(`[...document.querySelectorAll('.math-compact-array')].map(table => {
      const rows = [...table.children].map(row => row.querySelectorAll('mi'))
      const [first, second] = rows.map(line => [...line].map(node => node.getBoundingClientRect()))
      const style = getComputedStyle(rows[0][0])
      return {
        start: first[0].left - second[0].left,
        center: (first[0].left + first.at(-1).right - second[0].left - second.at(-1).right) / 2,
        font: parseFloat(style.fontSize),
        padding: parseFloat(getComputedStyle(table.querySelector('mtd')).paddingInlineStart),
        gap: first[1] ? first[1].left - first[0].right : 0,
      }
    })`)
    const [left, centered, matrix, nested] = geometry
    expect(left.start).toBeCloseTo(0)
    expect(centered.start).toBeGreaterThan(0)
    expect(centered.center).toBeCloseTo(0, 1)
    expect(matrix.gap).toBeCloseTo(matrix.font * 0.2778, 1)
    for (const measures of geometry) {
      expect(measures.font).toBeCloseTo(left.font)
      expect(measures.padding).toBe(0)
    }
    expect(left.font).toBeLessThan(40)
    expect(nested.center).toBeCloseTo(0, 1)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('aligns paired AMS cells and row numbers at the expected positions in Chromium', async () => {
  const examples = [
    String.raw`\begin{align} a&=b & c&=d \\ xyz&=p \end{align}`,
    String.raw`\begin{alignat}{2} a&=b & c&=d \\ xyz&=p \end{alignat}`,
  ]
  const inline = renderMath(String.raw`x+\begin{aligned}a&=b\\xyz&=p\end{aligned}+y`)
  const body = examples.map(source => `<div>${renderMath(source, true)}</div>`).join('') + `<p>${inline}</p>`
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style><main style="font-size:36px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{ groupGap: number, operatorGap: number, relations: number[], tags: number[] }[]>(`[...document.querySelectorAll('main > div .math-alignment-grid')].map(table => {
      const rows = [...table.children]
      const box = item => item.getBoundingClientRect()
      const [lhs, rhs, nextLhs] = rows[0].children
      return {
        groupGap: box(nextLhs.querySelector('mi')).left - box(rhs.querySelector('mi')).right,
        operatorGap: box(rhs.querySelector('mo')).left - box(lhs.querySelector('mi')).right,
        relations: rows.map(row => box(row.children[1].querySelector('mo')).left),
        tags: rows.map(row => box(row.querySelector('.math-equation-number')).left),
      }
    })`)
    for (const layout of geometry) {
      expect(layout.relations[0]).toBeCloseTo(layout.relations[1])
      expect(layout.tags[0]).toBeCloseTo(layout.tags[1])
      expect(layout.operatorGap).toBeCloseTo(10, 0)
    }
    expect(geometry[0].groupGap - geometry[1].groupGap).toBeCloseTo(36, 0)
    const inlineOffset = await view.evaluate<number>(`(() => {
      const math = document.querySelector('main > p math')
      return math.querySelector('mi').getBoundingClientRect().top
        - math.querySelector('.math-alignment-grid').getBoundingClientRect().top
    })()`)
    expect(inlineOffset).toBeGreaterThan(22)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('places AMS display tags at the margins and keeps the formula aligned in Chromium', async () => {
  const examples = [
    String.raw`\begin{align}a&=b\tag*{1}\\abcd&=xyz\tag*{Longer label}\\a&=b\notag\end{align}`,
    String.raw`\begin{alignat}{2}a&=b & c&=d\tag*{1}\\xyz&=p & e&=g\tag*{Longer label}\\a&=b\notag\end{alignat}`,
    String.raw`\begin{gather}a=b\tag*{1}\\abcd=xyz\tag*{Longer label}\\a=b\notag\end{gather}`,
  ]
  const options = [{}, { leqno: true }, { fleqn: true }, { fleqn: true, leqno: true }]
  const body = examples.flatMap(source => options.map(settings =>
    `<section>${createMathRenderer(settings)(source, true)}</section>`)).join('')
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style><main style="width:600px;font-size:30px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 720, height: 480, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{ shift: number, center: number, leftTags: number[], rightTags: number[], gap: number, labels: string[] }[]>(`[...document.querySelectorAll('main > section')].map(section => {
      const outer = section.getBoundingClientRect()
      const rows = [...section.querySelector('mtable[data-equation-lines]').children]
      const cells = [...rows[1].querySelectorAll('mtd:not(.math-equation-number)')]
      const boxes = cells.map(cell => cell.getBoundingClientRect())
      const formulaStart = boxes[0].left
      const formulaEnd = boxes.at(-1).right
      const tags = rows.map(row => row.querySelector('.math-equation-number'))
      const [short, long] = tags.map(tag => tag.getBoundingClientRect())
      const label = tags[1].querySelector('mtext').getBoundingClientRect()
      return {
        shift: formulaStart - outer.left,
        center: (formulaStart + formulaEnd - outer.left - outer.right) / 2,
        leftTags: [short, long].map(box => box.left - outer.left),
        rightTags: [short, long].map(box => outer.right - box.right),
        gap: label.right <= formulaStart ? formulaStart - label.right : label.left - formulaEnd,
        labels: tags.map(tag => tag.textContent),
      }
    })`)
    expect(geometry).toHaveLength(12)
    for (const [index, layout] of geometry.entries()) {
      const { fleqn, leqno } = options[index % options.length]
      expect(layout.labels).toEqual(['1', 'Longer label', ''])
      for (const edge of leqno ? layout.leftTags : layout.rightTags) expect(edge).toBeCloseTo(fleqn && leqno ? 60 : 0, 1)
      if (!fleqn) expect(layout.center).toBeCloseTo(0, 1)
      else if (!leqno) expect(layout.shift).toBeCloseTo(60, 1)
      expect(layout.gap).toBeGreaterThanOrEqual(14)
    }
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('wraps inline formulas in the player while preserving one accessible expression', async () => {
  const html = await renderDeck(parseDeck(String.raw`---
math:
  trust: true
---
# Inline formulas

<div id="automatic" style="width:8.5em">

$\text{alpha bravo}+\text{charlie delta}=\text{echo foxtrot}$

</div>
<div id="suppressed" style="width:8.5em">

$\text{alpha bravo}+\nobreak\text{charlie delta}$

</div>
<div id="explicit" style="width:8.5em">

$\text{alpha bravo}\allowbreak\text{echo foxtrot}$

</div>
<div id="linked">

$a+\href{#last}{b}=c$

</div>

<!-- Read $a+\text{remaining terms}$ aloud. -->

---
routeAlias: last
---
# End
`))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
  })
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(player.outputs[0])
        case '/presentation.css': return new Response(css)
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 1024, height: 680, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const countLines = (selector: string) => view.evaluate<number>(`new Set([...document.querySelectorAll(${JSON.stringify(selector + ' .math-inline-fragment')})]
      .map(fragment => Math.round(fragment.getBoundingClientRect().top))).size`)
    expect(await countLines('#automatic')).toBe(3)
    expect(await countLines('#explicit')).toBe(2)
    expect(await view.evaluate("document.querySelectorAll('#suppressed math').length")).toBe(1)
    expect(await view.evaluate("document.querySelectorAll('#automatic math:not([aria-hidden=true])').length")).toBe(1)
    expect(await view.evaluate("document.querySelector('#automatic math:not([aria-hidden=true]) annotation').textContent"))
      .toBe(String.raw`\text{alpha bravo}+\text{charlie delta}=\text{echo foxtrot}`)
    expect(await view.evaluate("document.querySelectorAll('#presenter-notes .math-inline-fragment').length")).toBe(2)
    const snapshot = await view.evaluate<ReturnType<typeof collectSnapshot>>(`(${collectSnapshot.toString()})({
      containerSelector: '#automatic', idAttribute: 'data-export-id', slide: 1, click: 0,
    })`)
    expect(snapshot.slides[0].nodes.filter(node => node.isMath)).toHaveLength(3)
    await view.evaluate("document.querySelector('#automatic').style.width = '30em'")
    expect(await countLines('#automatic')).toBe(1)
    await view.evaluate("document.querySelector('#linked a').click()")
    expect(await view.evaluate('window.presentationNavigation.currentPage')).toBe(2)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('stretches bracket and segment rules across their bases and stacks bracket labels in Chromium', async () => {
  const math = createMathRenderer({ minRuleThickness: 0.2, throwOnError: true })
  const formula = String.raw`\overbracket{x}^{top}+\overbracket{a+b+c+d}^{wide}
    +\underbracket{a+b}_{lower}+\overlinesegment{e+f}+\underlinesegment{g+h}+\textcircled{A}`
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: request => new URL(request.url).pathname === '/player.css'
      ? new Response(css, { headers: { 'Content-Type': 'text/css' } })
      : new Response(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/player.css"><main style="font-size:40px">${math(formula, true)}</main>`, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
  })
  const view = new Bun.WebView({ width: 1000, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const dimensions = await view.evaluate<{ widths: number[], stroked: boolean, upper: boolean, lower: boolean, circled: string }>(`(() => {
      const marks = [...document.querySelectorAll('.math-overbracket,.math-underbracket,.math-overlinesegment,.math-underlinesegment')]
      const [short, wide, lower] = marks
      return {
        widths: marks.map(mark => mark.getBoundingClientRect().width),
        stroked: marks.every(mark => getComputedStyle(mark).backgroundSize.includes('100% 8px')),
        upper: wide.nextElementSibling.getBoundingClientRect().bottom <= wide.getBoundingClientRect().top,
        lower: lower.nextElementSibling.getBoundingClientRect().top >= lower.getBoundingClientRect().bottom,
        circled: getComputedStyle(document.querySelector('.math-text-circled')).borderTopWidth,
      }
    })()`)
    expect(dimensions.widths).toHaveLength(5)
    expect(dimensions.widths[1]).toBeGreaterThan(dimensions.widths[0] * 2)
    expect(dimensions.widths[0]).toBeGreaterThanOrEqual(63)
    expect(dimensions.stroked).toBe(true)
    expect(dimensions.upper).toBe(true)
    expect(dimensions.lower).toBe(true)
    expect(dimensions.circled).toBe('8px')
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('renders TeX line breaks and vertical gaps in Chromium', async () => {
  const sources = [String.raw`a\\b`, String.raw`a\\[1em]b`, String.raw`a\newline b`]
  const body = sources.map((source, index) => `<div>${renderMath(source, index !== 2)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 720, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const rows = await view.evaluate<number[][]>(`[...document.querySelectorAll('mtable')].map(table =>
      [...table.querySelectorAll('mi')].map(token => token.getBoundingClientRect().top))`)
    expect(rows).toHaveLength(3)
    const [normal, spaced, inline] = rows.map(([first, second]) => second - first)
    expect(normal).toBeGreaterThan(20)
    expect(spaced - normal).toBeCloseTo(40, 0)
    expect(inline).toBeGreaterThan(20)
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

test('expands boxed formulas in math and text with display-style contents', () => {
  const math = createMathRenderer({ throwOnError: true })
  const inline = math(String.raw`a+\boxed{\mathchoice{D}{T}{S}{s}+\sum_{i=1}^{n} i}+b`, false)
  expect(inline).toContain('<mstyle displaystyle="true" scriptlevel="0"><mrow><mi>D</mi>')
  expect(inline).toContain('<munderover>')
  const script = math(String.raw`x^{\boxed{\mathchoice{D}{T}{S}{s}}}`, false)
  expect(script).toContain('<mstyle displaystyle="true" scriptlevel="0"><mrow><mi>D</mi>')
  const nested = math(String.raw`\edef\answer{\boxed{\frac ab}}\text{Answer: \answer}`, false)
  expect(nested).toContain('<mrow class="math-color-box math-frame">')
  expect(nested).toContain('<mstyle displaystyle="true" scriptlevel="0"><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac>')
})

test.skipIf(!chrome)('applies configured TeX sizing to the rendered browser geometry', async () => {
  const source = String.raw`\rule{4em}{.2em}+\frac ab+\overline{c}+\boxed{d}`
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const body = `<div id="normal">${renderMath(source, true)}</div><div id="sized">${createMathRenderer({ maxSize: 1.5, minRuleThickness: 0.65 })(source, true)}</div>`
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === '/player.css') return new Response(css, { headers: { 'Content-Type': 'text/css' } })
      return new Response(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/player.css"><main style="font-size:40px">${body}</main>`, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    },
  })
  const view = new Bun.WebView({ width: 720, height: 400, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{ width: number, fraction: number, line: number, box: number, padding: number[] }[]>(`[...document.querySelectorAll('main > div')].map(formula => {
      const box = getComputedStyle(formula.querySelector('.math-frame'))
      return {
        width: formula.querySelector('mspace').getBoundingClientRect().width,
        fraction: formula.querySelector('mfrac').getBoundingClientRect().height,
        line: Number.parseFloat(getComputedStyle(formula.querySelector('.math-overline')).borderTopWidth),
        box: Number.parseFloat(box.borderTopWidth),
        padding: [box.paddingTop, box.paddingRight, box.paddingBottom, box.paddingLeft].map(parseFloat),
      }
    })`)
    expect(geometry[0].width).toBeCloseTo(160)
    expect(geometry[1].width).toBeCloseTo(60)
    expect(geometry[1].fraction).toBeGreaterThan(geometry[0].fraction)
    expect(geometry[1].line).toBeCloseTo(26, 0)
    expect(geometry[1].box).toBeCloseTo(26, 0)
    expect(geometry[0].padding).toEqual([12, 12, 12, 12])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('paints cancellation strokes at a constant thickness without changing layout in Chromium', async () => {
  const examples = [
    String.raw`\phantom{\rule{4em}{1em}}`,
    String.raw`\cancel{\phantom{\rule{4em}{1em}}}`,
    String.raw`\bcancel{\phantom{\rule{10em}{2.5em}}}`,
    String.raw`\xcancel{\phantom{\rule{10em}{2.5em}}}`,
  ]
  const body = examples.map(source => `<div>${renderMath(source)}</div>`).join('')
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style>
      <main style="width:max-content;padding:20px;background:white;color:#f00000;font-size:48px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ width: 580, height: 540, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const screenshot = await view.screenshot()
    const src = `data:${screenshot.type || 'image/png'};base64,${Buffer.from(await screenshot.arrayBuffer()).toString('base64')}`
    const boxes = await view.evaluate<{ width: number, height: number, strokes: { y: number, length: number }[][] }[]>(`(async () => {
      const image = new Image()
      image.src = ${JSON.stringify(src)}
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return [...document.querySelectorAll('main math')].map(math => {
        const { left, top, width, height } = math.getBoundingClientRect()
        const strokes = [0.3, 0.7].map(fraction => {
          const x = Math.round((left + width * fraction) * devicePixelRatio)
          const { data } = context.getImageData(x, Math.ceil(top * devicePixelRatio), 1, Math.floor(height * devicePixelRatio))
          const runs = []
          let length = 0
          for (let i = 0; i <= data.length; i += 4) {
            if (data[i] > 150 && data[i + 1] < 100) length++
            else if (length) {
              runs.push({ y: i / 4 - length, length: length / devicePixelRatio })
              length = 0
            }
          }
          return runs
        })
        return { width, height, strokes }
      })
    })()`)
    expect(boxes[0].strokes).toEqual([[], []])
    expect(boxes[1].width).toBeCloseTo(boxes[0].width)
    expect(boxes[1].height).toBeCloseTo(boxes[0].height)
    expect(boxes[3].width).toBeCloseTo(boxes[2].width)
    expect(boxes[3].height).toBeCloseTo(boxes[2].height)
    for (const [index, box] of boxes.slice(1).entries()) {
      for (const strokes of box.strokes) {
        expect(strokes).toHaveLength(index === 2 ? 2 : 1)
        for (const { length } of strokes) {
          expect(length).toBeGreaterThanOrEqual(1)
          expect(length).toBeLessThanOrEqual(3)
        }
      }
    }
    expect(boxes[1].strokes[0][0].y).toBeGreaterThan(boxes[1].strokes[1][0].y)
    expect(boxes[2].strokes[0][0].y).toBeLessThan(boxes[2].strokes[1][0].y)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

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
    String.raw`a\overset{!}{=}b`,
    String.raw`a\underset{i}{+}b`,
    String.raw`a\boldsymbol{\leq}b`,
    String.raw`a\pmb{+}b`,
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
    const gaps = await view.evaluate<number[][]>(`[...document.querySelectorAll('main div')].map(formula => {
      const glyph = formula.querySelector('mo')
      const operator = glyph.closest('semantics > mrow > :is(msub, mrow, mover, munder)') ?? glyph
      const box = operator.getBoundingClientRect()
      const gap = (sibling, before) => {
        if (!sibling) return 0
        const bounds = sibling.getBoundingClientRect()
        const isSpace = sibling.localName === 'mspace'
        return before ? box.left - (isSpace ? bounds.left : bounds.right) : (isSpace ? bounds.right : bounds.left) - box.right
      }
      return [gap(operator.previousElementSibling, true), gap(operator.nextElementSibling, false)]
    })`)
    expect(gaps.map(pair => pair.map(Math.round))).toEqual([
      [8, 8], [0, 0], [10, 10], [0, 0], [6, 6], [6, 6], [10, 10], [8, 8], [10, 10], [8, 8],
    ])
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

// Based on KaTeX's MathML number fixtures and script-base joining.
test('joins TeX number atoms and braced separators while preserving script boundaries', () => {
  expect(formula('0.34=.34^1')).toContain('<mn>0.34</mn><mo>=</mo><msup><mn>.34</mn><mn>1</mn></msup>')
  expect(formula('1{,}000{,}000')).toContain('<mn>1,000,000</mn>')
  expect(formula('2 {,} 500.')).toContain('<mn>2,500.</mn>')
  expect(formula('2,500')).toContain('<mn>2</mn><mo>,</mo><mn>500</mn>')
  expect(formula('1{2}3')).toContain('<mn>123</mn>')
  expect(formula('1{}2')).toContain('<mn>1</mn><mrow></mrow><mn>2</mn>')
  expect(formula('1{,}234_5')).toContain('<msub><mn>1,234</mn><mn>5</mn></msub>')
  expect(formula('1{,}234_5^6')).toContain('<mn>1,23</mn><msubsup><mn>4</mn><mn>5</mn><mn>6</mn></msubsup>')
  expect(formula('1{2}^3')).toContain('<msup><mn>12</mn><mn>3</mn></msup>')
  expect(formula('1{2x}^3')).toContain('<mn>1</mn><msup><mrow><mn>2</mn><mi>x</mi></mrow><mn>3</mn></msup>')
  expect(formula(String.raw`1\kern0em2`)).toContain('<mn>1</mn><mspace width="0em"/><mn>2</mn>')
  expect(formula(String.raw`1\def\digit{2}\digit\relax\char51`)).toContain('<mn>123</mn>')
  expect(formula(String.raw`1\mathchoice{2}{3}{4}{5}4`)).toContain('<mn>134</mn>')
  expect(formula(String.raw`1\mathchoice{2}{3}{4}{5}4`, true)).toContain('<mn>124</mn>')
})

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
  expect(html).toContain('<mo stretchy="true" symmetric="true" form="infix" fence="true" lspace="0.05em" rspace="0.05em">‖</mo>')
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

test('keeps middle delimiters from applying relation glue or cancelling binary operators', () => {
  const middle = '<mo stretchy="true" symmetric="true" form="infix" fence="true" lspace="0.05em" rspace="0.05em">|</mo>'
  expect(formula(String.raw`\left(x\mathord{a}\middle|y\right)`))
    .toContain(`<mi>x</mi><mi>a</mi>${middle}<mi>y</mi>`)
  expect(formula(String.raw`\left(x+\middle|y\right)`))
    .toContain(`<mi>x</mi>${medium}${operator('+')}${middle}<mi>y</mi>`)
  expect(formula(String.raw`\left(x\middle|-y\right)`))
    .toContain(`<mi>x</mi>${middle}${operator('−')}${medium}<mi>y</mi>`)
  const blank = '<mspace width="0.12em"/>'
  expect(formula(String.raw`\left.x\middle.y\right.`))
    .toContain(`${blank}<mi>x</mi>${blank}<mi>y</mi>${blank}`)
})

test.skipIf(!chrome)('uses tight middle spacing and stretches a colored delimiter with its row in Chromium', async () => {
  const inputs = [
    String.raw`\left(x\middle|y\right)`,
    String.raw`\left(x\mid y\right)`,
    String.raw`\left.x\middle.y\right.`,
    String.raw`\left(\frac{\frac12}{3}\middle|y\right)`,
    String.raw`\left(\frac{\frac12}{3}\color{red}\middle|y\right)`,
    String.raw`\left(\frac{\frac12}{3}\color{red}\mathchoice{\middle|}{a}{b}{c}y\right)`,
  ]
  const body = inputs.map(source => `<div>${renderMath(source, true)}</div>`).join('')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px">${body}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const result = await view.evaluate<{ gaps: number[], blanks: number[], heights: number[], color: string }>(`(() => {
      const [middle, relation, invisible, tall, colored, choice] = document.querySelectorAll('main > div')
      const operators = (row) => [...row.querySelectorAll('mo')]
      const gaps = [middle, relation].flatMap(row => {
        const [, bar] = operators(row)
        const [x, y] = [...row.querySelectorAll('mi')].map(node => node.getBoundingClientRect())
        const bounds = bar.getBoundingClientRect()
        return [bounds.left - x.right, y.left - bounds.right]
      })
      return {
        gaps,
        blanks: [...invisible.querySelectorAll('mspace')].map(space => space.getBoundingClientRect().width),
        heights: [tall, colored, choice].map(row => operators(row)[1].getBoundingClientRect().height),
        color: getComputedStyle(operators(colored)[1]).color,
      }
    })()`)
    for (const gap of result.gaps.slice(0, 2)) expect(gap).toBeCloseTo(2, 1)
    for (const gap of result.gaps.slice(2)) expect(gap).toBeGreaterThan(10)
    expect(result.blanks).toHaveLength(3)
    for (const blank of result.blanks) expect(blank).toBeCloseTo(4.8, 1)
    expect(result.heights[0]).toBeGreaterThan(100)
    expect(result.heights[1]).toBeCloseTo(result.heights[0])
    expect(result.heights[2]).toBeCloseTo(result.heights[0])
    expect(result.color).toBe('rgb(255, 0, 0)')
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45_000)

// Paired delimiters use the surrounding TeX macro and color scope in KaTeX.
test('expands closing fences and tracks the last declared color through nested pairs', () => {
  expect(formula(String.raw`\left(\def\close{)}\def\value{x}\value\right\close\value`))
    .toBe(formula(String.raw`\left(x\right)x`))
  expect(() => formula(String.raw`{\left(\def\value{x}\value\right)}\value`))
    .toThrow(String.raw`Unsupported math command: \value`)
  const nested = formula(String.raw`\left(\color{red}\left[\color{blue}x\right] y\right)z`)
  expect(nested).toContain('<mo stretchy="true">(</mo><mrow style="color:red"><mrow><mo stretchy="true">[</mo>')
  expect(nested).toContain('<mo stretchy="true" style="color:blue">]</mo></mrow><mi>y</mi></mrow><mo stretchy="true" style="color:blue">)</mo></mrow><mi>z</mi>')
  for (const body of [String.raw`{\color{red}x}`, String.raw`\textcolor{red}{x}`]) {
    expect(formula(String.raw`\left(${body}\right)`)).toContain('<mo stretchy="true">)</mo>')
  }
  expect(formula(String.raw`\left(\color{red}x\right.`)).not.toContain('<mo stretchy="true" style="color:red">')
})

test('uses KaTeX Greek glyphs, distinct circled minus symbols, and logical arrow macros', () => {
  expect(formula(String.raw`\epsilon\varepsilon`)).toContain('<mi>ϵ</mi><mi>ε</mi>')
  expect(formula(String.raw`\ominus\minuso`)).toContain('⊖</mo><mtext>⦵</mtext>')
  for (const [name, arrow] of [['iff', 'Longleftrightarrow'], ['implies', 'Longrightarrow'], ['impliedby', 'Longleftarrow']]) {
    expect(formula(`x\\${name} y`)).toBe(formula(`x\\;\\${arrow}\\;y`))
  }
  expect(formula(String.raw`\edef\relation{\iff}\def\Longleftrightarrow{=}\relation`))
    .toBe(formula(String.raw`\;=\;`))
  expect(formula(String.raw`\def\Longleftrightarrow{=}\edef\relation{\iff}\def\Longleftrightarrow{<}\relation`))
    .toBe(formula(String.raw`\;=\;`))
})

test.skipIf(!chrome)('renders colored and multiline paired fences around full-height math in Chromium', async () => {
  const source = String.raw`\left(\color{red}\frac{a}{b}\\[0.5em]\color{blue}c\right)`
  const markup = createMathRenderer({ throwOnError: true })(source, false)
  const strict = createMathRenderer({ strict: 'error', throwOnError: true })(source, true)
  expect(strict).not.toContain('<mtable')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><main style="font-size:40px;color:black">${markup}</main>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const view = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const layout = await view.evaluate<{ colors: string[], heights: number[], rows: number[] }>(`(() => {
      const fences = [...document.querySelectorAll('mo[stretchy]')]
      const rows = [...document.querySelectorAll('mtable mtr')]
      return {
        colors: fences.map(node => getComputedStyle(node).color),
        heights: fences.map(node => node.getBoundingClientRect().height),
        rows: rows.map(node => node.getBoundingClientRect().top),
      }
    })()`)
    expect(layout.colors).toEqual(['rgb(0, 0, 0)', 'rgb(0, 0, 255)'])
    expect(layout.rows).toHaveLength(2)
    expect(layout.rows[1] - layout.rows[0]).toBeGreaterThan(40)
    expect(layout.heights.every(height => height > 80)).toBe(true)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)

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
  expect(formula(String.raw`\int\dots\int`)).toContain('<mspace width="0" style="margin-inline-end:-0.17em"/><mo>⋯</mo><mo>∫</mo>')
  expect(formula(String.raw`x+\dotso+y`)).toContain('<mo>+</mo><mo>…</mo><mo>+</mo>')
  expect(formula(String.raw`x\not<y\not\subseteq Z`)).toContain('<mi>x</mi><mo>≮</mo><mi>y</mi><mo>⊈</mo><mi>Z</mi>')
  expect(formula(String.raw`x\not{\in}S`)).toContain('<mrow><mo>∉</mo></mrow>')
  expect(formula(String.raw`x\not\mapsto y`)).toContain('<mo>↦̸</mo>')
  expect(formula(String.raw`\not{\frac{a}{b}}`)).toContain('<mrow class="math-cancel"><mrow><mfrac>')
})

test('expands AMS ellipsis commands with one-token lookahead and scoped overrides', () => {
  expect(formula(String.raw`\dots,`)).toContain('<mo>…</mo><mo>,</mo>')
  expect(formula(String.raw`\dots\mathrel{!}x`)).toContain('>⋯</mo>')
  expect(formula(String.raw`\dots\xrightarrow{f}`)).toContain('<mo>⋯</mo><mover>')
  expect(formula(String.raw`\dots\implies`)).toContain('<mo>⋯</mo><mspace width="0.28em"/><mo>⟹</mo>')
  expect(formula(String.raw`\dots\notin`)).toContain('<mo>…</mo><mo>∉</mo>')
  expect(formula(String.raw`\dots\not=x`)).toContain('<mo>…</mo><mo>≠</mo>')
  expect(formula(String.raw`\def\rel{\not}\dots\rel=x`)).toContain('<mo>⋯</mo><mo>≠</mo>')
  expect(formula(String.raw`\dots\neq x`)).toContain('<mo>…</mo><mo>≠</mo>')
  expect(formula(String.raw`\dots\vcentcolon x`)).toContain('>⋯</mo>')
  expect(formula(String.raw`\def\relation{\vcentcolon}\dots\relation x`)).toContain('>…</mo>')
  expect(formula(String.raw`\dots\oiint`)).toContain('<mo>…</mo><mo>∯</mo>')
  expect(formula(String.raw`\cdots)`)).toContain('<mo>⋯</mo><mspace width="0.17em"/><mo stretchy="false">)</mo>')
  expect(formula(String.raw`\dots\}`)).toContain('<mo>…</mo><mspace width="0.17em"/><mo stretchy="false">}</mo>')
  expect(formula(String.raw`x^{\dots}`)).not.toContain('<mspace')
  expect(formula(String.raw`\def\close{)}\dotso\close`)).not.toContain('<mspace')
  expect(formula(String.raw`\def\close{)}\dots\close`)).toContain('<mo>…</mo><mspace width="0.17em"/>')
  expect(formula(String.raw`\def\inner{+}\def\outer{\inner}\dots\outer x`)).toContain('<mo>…</mo><mo>+</mo><mi>x</mi>')
  expect(formula(String.raw`\def\operator{\DOTSB+}\dots\operator x`)).toContain('<mo>⋯</mo><mo>+</mo><mi>x</mi>')
  expect(formula(String.raw`\def\operator{\DOTSI\intop}\dots\operator`)).toContain('margin-inline-end:-0.17em"/><mo>⋯</mo><mo>∫</mo>')
  expect(formula(String.raw`\def\spaced{\DOTSX x}\dots\spaced`)).toContain('<mo>…</mo><mspace width="0.17em"/><mi>x</mi>')
  expect(formula(String.raw`\def\dotsb{B}\dots+`)).toContain('<mi>B</mi><mo>+</mo>')
  expect(formula(String.raw`\let\saved=\dots\def\dots{N}\saved+x`)).toContain('<mo>⋯</mo><mo>+</mo><mi>x</mi>')
  expect(formula(String.raw`\edef\saved{\dots+}\def\cdots{N}\saved`)).toContain('<mo>⋯</mo><mo>+</mo>')
  expect(formula(String.raw`\text{First\dots last}`)).toContain('<mtext>First</mtext><mo>…</mo><mtext>last</mtext>')
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
  expect(html).toContain('<mstyle displaystyle="false" scriptlevel="0"><mrow><mo stretchy="true">(</mo><mfrac linethickness="2pt">')
  expect(html).toContain('<mo stretchy="true">]</mo></mrow></mstyle>')
  const opposite = formula(String.raw`\genfrac{]}{\rVert}{}{}{a}{b}`)
  expect(opposite).not.toContain('>]</mo>')
  expect(opposite).toContain('</mfrac><mo stretchy="true">‖</mo>')
  expect(formula(String.raw`\genfrac{\lvert}{q}{}{}{a}{b}`)).toContain('<mo stretchy="true">|</mo><mfrac>')
  expect(formula(String.raw`\genfrac{\mathopen{/}}{q}{}{}{a}{b}`)).not.toContain('stretchy=')
  expect(formula(String.raw`\frac{\frac12}x`)).toContain('<mfrac><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow><mi>x</mi></mfrac>')
  expect(() => formula(String.raw`\frac\frac12 x`)).toThrow('Missing math argument')
  expect(() => formula(String.raw`a\above{50} b`)).toThrow('Invalid math dimension')
  expect(() => formula(String.raw`\genfrac{}{}{2pt}{9}ab`)).toThrow('Invalid fraction style')
  expect(() => formula(String.raw`\genfrac{}{}{}{}{n}`)).toThrow('Missing math argument')
})

test('isolates ordinary TeX arguments while preserving primitive roots and scripts', () => {
  const math = createMathRenderer({
    throwOnError: true,
    macros: {
      '\\empty': ' ',
      '\\pair': 'ab',
      '\\inner': String.raw`\frac{1}{2}+z`,
      '\\branch': String.raw`\mathchoice{D}{T}{ab}{Q}`,
      '\\boldarg': String.raw`\mathbf{#1}`,
      '\\local': String.raw`\def\temporary{t}\temporary`,
    },
  })
  const render = (source: string, display = false) => math(source, display).split('<annotation')[0]
  expect(render(String.raw`\frac\empty\empty`)).toContain('<mfrac><mrow></mrow><mrow></mrow></mfrac>')
  expect(render(String.raw`\frac\relax y`)).toContain('<mfrac><mrow></mrow><mi>y</mi></mfrac>')
  expect(render(String.raw`\frac\pair x`)).toContain('<mfrac><mrow><mi>a</mi><mi>b</mi></mrow><mi>x</mi></mfrac>')
  expect(render(String.raw`\frac\inner 2`)).toBe(render(String.raw`\frac{\frac{1}{2}+z}2`))
  expect(render(String.raw`\frac{\boldarg{ab}}q`)).toContain('<mi>q</mi></mfrac>')
  expect(() => render(String.raw`\frac\boldarg{ab}q`)).toThrow('Missing math argument')
  expect(render(String.raw`\frac\branch x`)).toBe(render(String.raw`\frac{ab}x`))
  expect(render(String.raw`\sqrt\pair x`)).toContain('<msqrt><mi>a</mi></msqrt><mi>b</mi><mi>x</mi>')
  expect(render(String.raw`x^\pair`)).toContain('<msup><mi>x</mi><mi>a</mi></msup><mi>b</mi>')
  expect(render(String.raw`\sqrt[3]\pair x`)).toContain('<mroot><mrow><mi>a</mi><mi>b</mi></mrow><mrow><mn>3</mn></mrow></mroot><mi>x</mi>')
  expect(render(String.raw`\sqrt[]x`)).toContain('<mroot><mi>x</mi><mrow></mrow></mroot>')
  expect(render(String.raw`\mathchoice\pair T S Qx`, true)).toContain('<mi>a</mi><mi>b</mi><mi>x</mi>')
  expect(render(String.raw`\textcolor{red}\pair x`)).toContain('<mi>a</mi><mi>b</mi></mrow></mrow><mi>x</mi>')
  expect(render(String.raw`\frac\local x`)).toContain('<mfrac><mrow><mi>t</mi></mrow><mi>x</mi></mfrac>')
  expect(() => render(String.raw`\temporary`)).toThrow('Unsupported math command')
})

test('resolves math choice and limit placement once the fraction style is known', () => {
  const source = String.raw`\def\pick{\mathchoice{D}{T}{S}{s}}\pick\over\pick`
  for (const [display, choice] of [[true, 'T'], [false, 'S']] as const) {
    const selected = `<mrow><mi>${choice}</mi></mrow>`
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
  expect(formula(String.raw`\sqrt[\mathchoice{D}{T}{S}{s}]{27}`)).toContain('<mroot><mrow><mn>27</mn></mrow><mrow><mi>s</mi></mrow></mroot>')
})

test('applies the last operator limit control even after scripts', () => {
  const explicit = formula(String.raw`\int_2\nolimits^3\limits f(x)`)
  expect(explicit).toContain('<munderover><mo movablelimits="false">∫</mo><mn>2</mn><mn>3</mn></munderover>')
  const side = formula(String.raw`\sum\limits_3^4\nolimits`, true)
  expect(side).toContain('<msubsup><mo>∑</mo><mn>3</mn><mn>4</mn></msubsup>')
  expect(formula(String.raw`\mathop{\mathrm{arg}}\limits_x`)).toContain('<munder><mrow>')
  expect(formula(String.raw`\operatornamewithlimits{arg}_x`, true)).toContain(`<munder>${operator('arg')}<mi>x</mi></munder>`)
  expect(formula(String.raw`\smallint_{a}^{b}`, true)).toContain('<munderover><mo largeop="false">∫</mo>')
  expect(() => formula(String.raw`3\nolimits_2`)).toThrow('Limit control requires a math operator')
})

test('renders TeX character codes, zero-width struts, and common font aliases', () => {
  const html = renderMath(String.raw`\char"263A+\char'101+\char66+\sqrt{\mathstrut x}+\mathscr{F}+\bm{v}+\mathsfit{K}`)
  const plus = medium + operator('+') + medium
  expect(html).toContain('<mtext>☺</mtext>' + plus + '<mi>A</mi>' + plus + '<mi>B</mi>')
  expect(html).toContain('<mpadded width="0"><mphantom><mo stretchy="false">(</mo></mphantom></mpadded>')
  expect(html).toContain('mathvariant="script"')
  expect(html).toContain('mathvariant="bold-italic"')
  expect(html).toContain('<mrow class="math-sans-serif-italic" mathvariant="sans-serif-italic"><mrow><mi>K</mi></mrow></mrow>')
  expect(renderMath('\\char`\\&')).toContain('<mtext>&amp;</mtext>')
  expect(renderMath(String.raw`\char"110000`)).toContain('math-unrendered')
})

test('expands TeX character codes eagerly and reads literal character tokens', () => {
  const percent = '<mtext>%</mtext>'
  for (const source of ['\\char`\\%', '\\char37', "\\char'45", '\\char"25', '\\@char{37}']) {
    expect(formula(source)).toContain(percent)
  }
  expect(formula('\\def\\a{B}\\char`\\a')).toContain('<mi>a</mi>')
  expect(formula('\\char`🙃')).toContain('<mtext>🙃</mtext>')
  expect(formula(String.raw`\char"1d7d9`)).toContain('<mtext>𝟙</mtext>')
  expect(formula(String.raw`\edef\saved{\char"41}\def\char{B}\saved`)).toContain('<mi>A</mi>')
  expect(formula('\\edef\\saved{\\char`\\x}\\text{\\saved\\@char{121}}')).toContain('<mtext>xy</mtext>')
  expect(formula(String.raw`\def\digits{6 5}\@char{\digits}`)).toContain('<mi>A</mi>')
  expect(() => formula(String.raw`\text{\@char{6 5}}`)).toThrow('Invalid math character code')
  expect(() => formula(String.raw`\@char{\text{2}}`)).toThrow('Invalid math character code')
  for (const source of ['\\char', '\\char`', "\\char'8", '\\char"g', '\\char"110000']) {
    expect(() => formula(source)).toThrow('Invalid math character code')
  }
})

test('skips relax before script arguments and preserves scripts with an empty base', () => {
  expect(formula(String.raw`x^\relax 2_\relax\relax 3`)).toContain('<msubsup><mi>x</mi><mn>3</mn><mn>2</mn></msubsup>')
  expect(formula(String.raw`x'^\relax 2`)).toBe(formula("x'^2"))
  expect(formula(String.raw`\hskip1em\relax^2`)).toContain('<mspace width="1em"/><msup><mrow/><mn>2</mn></msup>')
  expect(formula('^3_2')).toContain('<msubsup><mrow/><mn>2</mn><mn>3</mn></msubsup>')
  expect(formula('¹²C')).toContain('<msup><mrow/><mrow><mn>12</mn></mrow></msup><mi>C</mi>')
  expect(formula('₂₃C')).toContain('<msub><mrow/><mrow><mn>23</mn></mrow></msub><mi>C</mi>')
  expect(() => formula(String.raw`x^\relax`)).toThrow('Missing math argument')
})

test('renders verbatim math without opening Markdown or TeX delimiters inside it', async () => {
  const html = await renderDeck(parseDeck(String.raw`Examples $\verb|x $ y % { <em>| + z$ and \(\verb*+a b+\).`))
  expect(html).toContain('>x $ y % { &lt;em&gt;</mtext>')
  expect(html).toContain('data-math-break=""/><mi>z</mi>')
  expect(html).toContain('>a␣b</mtext>')
  expect(html).not.toContain('<em>')
  expect(renderMath(String.raw`\verb@  a b  @`)).toContain('>  a b  </mtext>')
  expect(renderMath(String.raw`\verb*xa bx`)).toContain('>a␣b</mtext>')
})

test.skipIf(!chrome)('stretches horizontal reaction, TeX, and CD arrows to their labels in Chromium', async () => {
  const formulas = [
    String.raw`a\xrightarrow{\text{f}}b`,
    String.raw`a\xrightarrow[\frac{x}{y}]{\text{a substantially longer label}}b`,
    String.raw`\ce{A <=>>[{forward reaction}] B <<=>[][{reverse reaction}] C <=> D}`,
    String.raw`a\xmapsto{f}b\xLeftrightarrow{g}c\xtwoheadrightarrow{h}d\xhookleftarrow{i}e`,
    String.raw`\begin{CD} A @>{\text{long commuting map}}>> B @= C \end{CD}`,
  ]
  const rendered = formulas.map((formula, index) => `<div id="formula-${index}">${renderMath(formula, index === 4)}</div>`).join('')
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: request => new URL(request.url).pathname === '/player.css'
      ? new Response(css, { headers: { 'Content-Type': 'text/css' } })
      : new Response(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/player.css"><main style="font-size:40px">${rendered}</main>`, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
  })
  const view = new Bun.WebView({ width: 1160, height: 700, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const geometry = await view.evaluate<{
      shortWidth: number
      long: { width: number, labelWidth: number, trackWidth: number, wellPlaced: boolean, hasTip: boolean }
      bias: { widths: number[], node: string, sides: string[] }[]
      shapes: string[][]
      commutative: { width: number, labelWidth: number, hasDouble: boolean }
    }>(`(() => {
      const width = node => node.getBoundingClientRect().width
      const long = document.querySelector('#formula-1 .math-arrow-body')
      const [baseline, lower, upper] = long.parentElement.children
      const shaft = long.querySelector('.math-arrow-track')
      const cd = document.querySelector('#formula-4 .math-arrow-body')
      return {
        shortWidth: width(document.querySelector('#formula-0 .math-arrow-body')),
        long: {
          width: width(long),
          labelWidth: width(upper),
          trackWidth: width(shaft),
          wellPlaced: upper.getBoundingClientRect().bottom <= baseline.getBoundingClientRect().top &&
            lower.getBoundingClientRect().top >= baseline.getBoundingClientRect().bottom,
          hasTip: getComputedStyle(shaft, '::after').clipPath.startsWith('polygon('),
        },
        bias: [...document.querySelectorAll('#formula-2 .math-arrow-body')].map(body => ({
          widths: [...body.querySelectorAll('.math-arrow-track')].map(width),
          node: body.dataset.equilibrium || '',
          sides: [...body.querySelectorAll('.math-arrow-track')].map(track => track.dataset.left || track.dataset.right),
        })),
        shapes: [...document.querySelectorAll('#formula-3 .math-arrow-track')]
          .map(track => [track.dataset.left || '', track.dataset.right || '']),
        commutative: {
          width: width(cd),
          labelWidth: width(cd.nextElementSibling),
          hasDouble: !!document.querySelector('#formula-4 .math-arrow-track[data-double]'),
        },
      }
    })()`)
    expect(geometry.shortWidth).toBeGreaterThanOrEqual(70)
    expect(geometry.long.width).toBeGreaterThan(geometry.shortWidth * 2)
    expect(geometry.long.width).toBeCloseTo(geometry.long.labelWidth)
    expect(geometry.long.trackWidth).toBeCloseTo(geometry.long.width)
    expect(geometry.long.wellPlaced).toBe(true)
    expect(geometry.long.hasTip).toBe(true)
    expect(geometry.bias.map(item => item.node)).toEqual(['right', 'left', ''])
    expect(geometry.bias.every(item => item.sides.join(',') === 'upper,lower')).toBe(true)
    expect(geometry.bias[0].widths[0] - geometry.bias[0].widths[1]).toBeCloseTo(40, 0)
    expect(geometry.bias[1].widths[1] - geometry.bias[1].widths[0]).toBeCloseTo(40, 0)
    expect(geometry.bias[2].widths[0]).toBeCloseTo(geometry.bias[2].widths[1])
    expect(geometry.shapes).toEqual([['bar', 'open'], ['double', 'double'], ['', 'two'], ['open', 'hook']])
    expect(geometry.commutative.width).toBeCloseTo(geometry.commutative.labelWidth)
    expect(geometry.commutative.hasDouble).toBe(true)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('centers tall AMS CD arrows beneath node columns with unequal side labels', async () => {
  const source = String.raw`\begin{CD}
    A @>f>> B @>g>> C \\
    @V{\text{projection onto the first component}}VV @AA{\frac{p}{q}}A @| \\
    D @<<< E @= F
  \end{CD}`
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: request => new URL(request.url).pathname === '/player.css'
      ? new Response(css, { headers: { 'Content-Type': 'text/css' } })
      : new Response(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/player.css"><main style="font-size:40px">${renderMath(source, true)}</main>`, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
  })
  const view = new Bun.WebView({ width: 1450, height: 700, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    const layout = await view.evaluate<{
      nodes: [number[], number[]]
      arrows: { center: number, height: number, direction: string, shape: string }[]
      labelsOutsideShaft: boolean[]
      horizontal: number[]
    }>(`(() => {
      const mid = node => { const rect = node.getBoundingClientRect(); return rect.x + rect.width / 2 };
      const [top, middle, bottom] = document.querySelectorAll('mtable.math-cd > mtr')
      const nodes = row => [...row.querySelectorAll(':scope > mtd > mi')].map(mid)
      const arrows = [...middle.querySelectorAll('.math-cd-arrow')].map(node => ({
        center: mid(node), height: node.getBoundingClientRect().height, direction: node.dataset.direction,
        shape: node.dataset.direction === 'parallel' ? getComputedStyle(node, '::before').borderLeftStyle
          : getComputedStyle(node, '::after').clipPath,
      }))
      const [leftArrow, rightArrow] = middle.querySelectorAll('.math-cd-arrow')
      const left = leftArrow.previousElementSibling.querySelector('mtext').getBoundingClientRect()
      const right = rightArrow.nextElementSibling.querySelector('mfrac').getBoundingClientRect()
      return {
        nodes: [nodes(top), nodes(bottom)], arrows,
        labelsOutsideShaft: [left.right < leftArrow.getBoundingClientRect().left, right.left > rightArrow.getBoundingClientRect().right],
        horizontal: [...top.querySelectorAll('.math-arrow-body')].map(node => node.getBoundingClientRect().width),
      }
    })()`)
    expect(layout.arrows.map(arrow => arrow.direction)).toEqual(['down', 'up', 'parallel'])
    for (const [index, arrow] of layout.arrows.entries()) {
      expect(arrow.center).toBeCloseTo(layout.nodes[0][index], 0)
      expect(arrow.center).toBeCloseTo(layout.nodes[1][index], 0)
      expect(arrow.height).toBeGreaterThanOrEqual(71)
    }
    expect(layout.arrows[0].shape).toStartWith('polygon(')
    expect(layout.arrows[1].shape).toStartWith('polygon(')
    expect(layout.arrows[2].shape).toBe('solid')
    expect(layout.labelsOutsideShaft).toEqual([true, true])
    expect(layout.horizontal).toEqual([120, 120])
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)
