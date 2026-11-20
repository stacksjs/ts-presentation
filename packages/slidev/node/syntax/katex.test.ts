import { expect, it } from 'bun:test'
import { parseDeck, renderDeck } from '../runtime/index.ts'

it('renders inline math', async () => {
  const html = await renderDeck(parseDeck('This is $x^2$ inline'))
  expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">')
  expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
})

it('renders block math with line ranges', async () => {
  const html = await renderDeck(parseDeck('$$ {2,3|4}\nx^2\n$$'))
  expect(html).toContain('data-equation-steps="2,3|4"')
  expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">')
})

it('preserves math delimiters inside fenced code', async () => {
  const html = await renderDeck(parseDeck('```\n$$x^2$$\n```'))
  expect(html).toContain('<pre><code>$$x^2$$\n</code></pre>')
  expect(html).not.toContain('<math')
})


it('renders isotope prescripts, ionic charges and oxidation states in chemistry', async () => {
  const formula = String.raw`\ce{^{227}_{90}Th+ + ^0_-1n- + H^3HO + CrO4^2- + Fe^{II}Fe^{III}2O4}`
  const html = await renderDeck(parseDeck('$' + formula + '$'))
  expect(html).toContain('<mmultiscripts><mi mathvariant="normal">Th</mi><none/><mo>+</mo><mprescripts/><mn>90</mn><mn>227</mn></mmultiscripts>')
  expect(html).toContain('<mmultiscripts><mi mathvariant="normal">n</mi><none/><mo>−</mo><mprescripts/><mn>−1</mn><mn>0</mn></mmultiscripts>')
  expect(html).toContain('<mi mathvariant="normal">H</mi><mmultiscripts><mi mathvariant="normal">H</mi><mprescripts/><none/><mn>3</mn></mmultiscripts>')
  expect(html).toContain('<msubsup><mi mathvariant="normal">O</mi><mn>4</mn><mo>2−</mo></msubsup>')
  expect(html).toContain('<msubsup><mi mathvariant="normal">Fe</mi><mn>2</mn><mtext>III</mtext></msubsup>')
})

it('renders hydrate dots, fractional coefficients, grouped species and phase markers', async () => {
  const formula = String.raw`\ce{1/2 H2O(l) + [\{(X2)3\}2]^3+ -> KCr(SO4)2.12H2O + NO_x v}`
  const html = await renderDeck(parseDeck('$' + formula + '$'))
  expect(html).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
  expect(html).toContain('<mtext>(l)</mtext>')
  expect(html).toContain('<mo>]</mo></mrow><mo>3+</mo></msup>')
  expect(html).toContain('<mo lspace="0" rspace="0">·</mo><mspace width="0.17em"/><mn>12</mn>')
  expect(html).toContain('<msub><mi mathvariant="normal">O</mi><mi>x</mi></msub><mo>↓</mo>')
})

it('renders two reaction labels with chemical formulas, literal text, and scoped TeX math', async () => {
  const formula = String.raw`\def\pressure{p_i}\ce{A->[H2O][$\pressure$] B <-->[][{<mixed>}] C <=>[\Delta] D}+\pressure`
  const html = await renderDeck(parseDeck('$' + formula + '$'))
  expect(html).toContain('<munderover><mo stretchy="true">→</mo><mrow><msub><mi>p</mi><mi>i</mi></msub></mrow><mrow class="math-chemistry"><msub><mi mathvariant="normal">H</mi><mn>2</mn></msub>')
  expect(html).toContain('<munder><mo stretchy="true">⇄</mo><mtext>&lt;mixed&gt;</mtext></munder>')
  expect(html).toContain('<mover><mo stretchy="true">⇌</mo><mrow class="math-chemistry"><mi>Δ</mi></mrow></mover>')
  expect(html).toContain('<mo>+</mo><msub><mi>p</mi><mi>i</mi></msub>')
})

it('supports bracketed unit uncertainty, scientific notation and stacked fractions', async () => {
  const formula = String.raw`\pu{1,2(3)e-4 J // mol K} + \pu{3.4 \times 10^{-2} kg*m^{-3}} + \pu{kJ/mol} + \pu{95 \%}`
  const html = await renderDeck(parseDeck('$' + formula + '$'))
  expect(html).toContain('<mn>1,2(3)</mn><mo>·</mo><msup><mn>10</mn><mn>−4</mn></msup>')
  expect(html).toContain('<mfrac><mrow><mi mathvariant="normal">J</mi></mrow><mrow><mi mathvariant="normal">mol</mi><mspace width="0.18em"/><mi mathvariant="normal">K</mi></mrow></mfrac>')
  expect(html).toContain('<mn>3.4</mn><mo>×</mo><msup><mn>10</mn><mn>−2</mn></msup>')
  expect(html).toContain('<mi mathvariant="normal">kg</mi><mo>·</mo><msup><mi mathvariant="normal">m</mi><mn>−3</mn></msup>')
  expect(html).toContain('<mi mathvariant="normal">kJ</mi><mo>/</mo><mi mathvariant="normal">mol</mi>')
  expect(html).toContain('<mi mathvariant="normal">%</mi>')
})
