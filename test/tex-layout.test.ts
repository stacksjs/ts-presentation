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
