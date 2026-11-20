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
  expect(html).toMatch(/<munderover><mrow class="math-arrow-body"[^>]*><mo[^>]*>→<\/mo><mspace[^>]*data-right="open"[^>]*\/><\/mrow><mrow><msub><mi>p<\/mi><mi>i<\/mi><\/msub><\/mrow><mrow class="math-chemistry"><msub><mi mathvariant="normal">H<\/mi><mn>2<\/mn><\/msub>/)
  expect(html).toMatch(/<munder><mrow class="math-arrow-body"[^>]*><mo[^>]*>⇄<\/mo>[^<]*(?:<mspace[^>]*\/>){2}<\/mrow><mtext>&lt;mixed&gt;<\/mtext><\/munder>/)
  expect(html).toMatch(/<mover><mrow class="math-arrow-body"[^>]*><mo[^>]*>⇌<\/mo>[^<]*(?:<mspace[^>]*\/>){2}<\/mrow><mrow class="math-chemistry"><mi mathvariant="normal">Δ<\/mi><\/mrow><\/mover>/)
  expect(html).toMatch(/<mo[^>]*>\+<\/mo>(?:<mspace[^>]*\/>)*<msub><mi>p<\/mi><mi>i<\/mi><\/msub>/)
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

it('renders grouped digits, explicit uncertainty, and standalone exponents in quantities', async () => {
  const formula = String.raw`\pu{12345.123456 m} + \pu{1,23456(0,12345) kJ}
    + \pu{(2.5 +/- 0.2) V} + \pu{+-0.02 m} + \pu{3.4 ${'±'} 1.3 km}
    + \pu{e3 Hz} + \pu{10^-3 s}`
  const html = await renderDeck(parseDeck('$$\n' + formula + '\n$$'))
  const gap = '<mspace width="0.1111em"/>'
  expect(html).toContain(`<mn>12</mn>${gap}<mn>345.123</mn>${gap}<mn>456</mn>`)
  expect(html).toContain(`<mn>1,234</mn>${gap}<mn>56</mn><mo stretchy="false">(</mo><mn>0,123</mn>${gap}<mn>45</mn>`)
  expect(html).toContain('<mo stretchy="false">(</mo><mn>2.5</mn><mo>±</mo><mn>0.2</mn><mo stretchy="false">)</mo>')
  expect(html).toContain('<mo>±</mo><mn>0.02</mn>')
  expect(html).toContain('<mn>3.4</mn><mo>±</mo><mn>1.3</mn>')
  expect(html).toContain('<msup><mn>10</mn><mn>3</mn></msup><mspace width="0.26em"/><mi mathvariant="normal">Hz</mi>')
  expect(html).toContain('<msup><mrow><mn>10</mn></mrow><mn>−3</mn></msup>')
})

it('preserves nested unit fractions, powered groups, and unit symbols', async () => {
  const formula = String.raw`\pu{12 {J//mol} // K} + \pu{4 V/(A s)} + \pu{1 mol (m s)^-1}
    + \pu{8 \mu m} + \pu{5 \Omega} + \pu{10 ^{o}F} + \pu{4 kg*m${'−'}3}`
  const html = await renderDeck(parseDeck('$$\n' + formula + '\n$$'))
  const unit = (symbol: string) => `<mi mathvariant="normal">${symbol}</mi>`
  const gap = '<mspace width="0.18em"/>'
  expect(html).toContain(`<mfrac><mrow><mrow><mfrac><mrow>${unit('J')}</mrow><mrow>${unit('mol')}</mrow></mfrac></mrow></mrow><mrow>${unit('K')}</mrow></mfrac>`)
  expect(html).toContain(`${unit('V')}${gap}<mo>/</mo>${gap}<mrow><mo stretchy="false">(</mo>${unit('A')}${gap}${unit('s')}`)
  expect(html).toContain(`<msup><mrow><mo stretchy="false">(</mo>${unit('m')}${gap}${unit('s')}<mo stretchy="false">)</mo></mrow><mn>−1</mn></msup>`)
  for (const symbol of ['μm', 'Ω', '°F']) expect(html).toContain(unit(symbol))
  expect(html).toContain(`<msup>${unit('m')}<mn>−3</mn></msup>`)
})
