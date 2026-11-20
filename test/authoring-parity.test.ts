import { expect, spyOn, test } from 'bun:test'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'
import { renderMath } from '../packages/slidev/node/runtime/math.ts'
import { mermaid } from '../packages/slidev/node/runtime/diagram.ts'

test('renders deck macros with arguments, TeX delimiters, and numbered equations', async () => {
  const deck = parseDeck(String.raw`---
math:
  macros:
    '\norm': '\left\lVert #1 \right\rVert'
---

# Norms

An inline equation \(\norm{v}\) and an unbraced fraction $\frac12$.

\[
\begin{align*}
A &= \mathbb{R} \\
B &= \boxed{12.5}
\end{align*}\tag{1}
\]
`)
  const html = await renderDeck(deck)
  expect(html.match(/<math /g)).toHaveLength(3)
  expect(html).toContain('<mi>ℝ</mi>')
  expect(html).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
  expect(html).toContain('columnalign="right left"')
  expect(html).toContain('<mtext>(1)</mtext>')
  expect(html).toContain('class="math-color-box math-frame"')
  expect(html).toContain('stretchy="true">‖</mo>')
})

test('expands local declarations and bounds cyclic macros', () => {
  const html = renderMath(String.raw`\newcommand{\half}[1]{\frac{#1}{2}}\half{x}`)
  expect(html).toContain('<mfrac><mrow><mi>x</mi></mrow><mrow><mn>2</mn></mrow></mfrac>')
  expect(renderMath('\\again', false, { '\\again': '\\again' })).toContain('math-unrendered')
})

test('uses math and text branches from a deck-wide TeX macro', async () => {
  const deck = parseDeck(String.raw`---
math:
  macros:
    '\@unit': '\@ifstar{\textbf{meters}}{\TextOrMath{meters}{\mu}}'
---

$\@unit + \@unit* + \text{in \@unit}$
`)
  const html = await renderDeck(deck)
  expect(html).toContain('<mi>μ</mi>')
  expect(html).toContain('<mrow style="font-weight:bold"><mtext>meters</mtext></mrow>')
  expect(html).toContain('<mtext>in meters</mtext>')
})

test('reads macro persistence, expansion budgets, and legacy color from deck headmatter', async () => {
  const deck = parseDeck(String.raw`---
math:
  globalGroup: true
  maxExpand: 1
  colorIsTextColor: true
---

$\def\saved{z}x$

---

$\color{red}{b}c$

$\saved$

$\saved\saved$
`)
  const html = await renderDeck(deck)
  expect(html).toContain('<mrow style="color:red"><mrow><mi>b</mi></mrow></mrow><mi>c</mi>')
  expect(html).toContain('<mrow><mi>z</mi></mrow>')
  expect(html).toContain(String.raw`<code class="math-unrendered" title="Too many math macro expansions" style="color:#cc0000">\saved\saved</code>`)
})

test('keeps invalid formulas isolated and honors the error settings in deck frontmatter', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const tolerant = parseDeck(String.raw`---
katex:
  errorColor: '#813b52'
  throwOnError: false
---

# Tolerant

$a+\unknown+b$

$$
\begin{broken"formula}a
$$

---

$\frac12$
`)
    const html = await renderDeck(tolerant, { setup: { katex: { errorColor: '#456789', throwOnError: true } } })
    expect(html).toContain(String.raw`<mtext style="color:#813b52">\unknown</mtext>`)
    expect(html).toContain(String.raw`<code class="math-unrendered" data-math-display title="Unsupported math environment: broken&quot;formula" style="color:#813b52">\begin{broken&quot;formula}a</code>`)
    expect(html).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
    expect(warn).not.toHaveBeenCalled()

    const strict = parseDeck(String.raw`---
math:
  throwOnError: true
---

# Strict

$a+\unknown+b$

---

$y^2$
`)
    const strictHtml = await renderDeck(strict, { setup: { katex: { throwOnError: false } } })
    expect(warn.mock.calls).toEqual([[String.raw`Unsupported math command: \unknown`]])
    expect(strictHtml).toContain(String.raw`<code class="math-unrendered" title="Unsupported math command: \unknown">a+\unknown+b</code>`)
    expect(strictHtml).toContain('<msup><mi>y</mi><mn>2</mn></msup>')
  }
  finally {
    warn.mockRestore()
  }
})

test('configures TeX dimensions and rule widths from deck headmatter', async () => {
  const deck = parseDeck(String.raw`---
math:
  maxSize: 3
  minRuleThickness: 0.2
---

$$
\rule{12em}{1em}\frac{a}{b}\overline{c}
$$
`)
  const html = await renderDeck(deck)
  expect(html).toContain('display="block" style="--math-min-rule:0.2em"')
  expect(html).toContain('<mspace width="3em" height="1em"')
  expect(html).toContain('<mfrac linethickness="0.2em">')
})

test('lets a deck override the strict TeX display option from setup', async () => {
  const deck = parseDeck(String.raw`---
math:
  strict: error
---

$$
a \\ b
$$

$a\newline b$
`)
  const html = await renderDeck(deck, { setup: { katex: { strict: 'ignore' } } })
  expect(html).toContain('<semantics><mrow><mi>a</mi><mi>b</mi></mrow>')
  expect(html).toContain('<mtable><mtr><mtd style="text-align:start;padding-bottom:0.14em"><mi>a</mi></mtd></mtr>')
})

test('renders flowchart clusters, styles, and parallel edges', () => {
  const markup = mermaid(`flowchart LR
  accTitle: Review workflow
  subgraph workers [Worker pool]
    A["Fetch; validate"] --> B[(Store)]
    A -.->|Retry| B
  end
  C((Start)) ==> A & B
  classDef storage fill:#233854,stroke:#eee
  class B storage`, 'flow')
  expect(markup).toContain('aria-label="Review workflow"')
  expect(markup).toContain('diagram-cluster')
  expect(markup).toContain('Fetch; validate')
  expect(markup).toContain('diagram-edge-dotted')
  expect(markup).toContain('diagram-edge-thick')
  expect(markup).toContain('--diagram-fill:#233854')
  expect(markup?.match(/class="diagram-edge /g)).toHaveLength(4)
})

test('renders sequence diagrams and basic state transitions', () => {
  const sequence = mermaid(`sequenceDiagram
  actor U as User
  participant W as Worker
  autonumber
  U->>+W: Send
  alt Valid
    W-->>-U: Done
  else Invalid
    Note over U,W: Try again
  end`, 'sequence')
  expect(sequence).toContain('diagram-sequence-section')
  expect(sequence).toContain('diagram-sequence-note')
  expect(sequence).toContain('diagram-activation')
  expect(sequence).toContain('2. Done')
  const state = mermaid(`stateDiagram-v2
  [*] --> Open
  state "Ready to publish" as Ready
  Open --> Ready: Approve
  Ready --> [*]`, 'states')
  expect(state).toContain('aria-label="State diagram"')
  expect(state).toContain('Ready to publish')
  expect(state).toContain('Approve')
  expect(mermaid('sequenceDiagram\nunexpected directive', 'unused')).toBeUndefined()
})

test('recognizes whole AMS display environments and nested inline math delimiters in Markdown', async () => {
  const source = [
    '# Math in a deck', '',
    String.raw`Inline $\text{for $x^2$} = y$ and \(\text{for \(z\)} = w\).`, '',
    String.raw`\begin{align} x&=y\\ y&=z \end{align}`, '',
    String.raw`\begin{equation}`,
    String.raw`\begin{split} a&=b\\ b&=c \end{split}`,
    String.raw`\end{equation}`, '',
    '~~~', String.raw`\begin{align} b&=c \end{align}`, '~~~', '',
    '<!--', String.raw`\begin{align} hidden&=1 \end{align}`, '-->', 'Visible text.',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/<math /g)).toHaveLength(4)
  expect(html.match(/<math [^>]* display="block"/g)).toHaveLength(2)
  expect(html.match(/<mtd class="math-equation-number"/g)).toHaveLength(3)
  expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  expect(html).toContain(String.raw`<pre><code>\begin{align} b&amp;=c \end{align}`)
  const disabled = await renderDeck(parseDeck('---\nmath: false\n---\n\n' + source))
  expect(disabled).not.toContain('<math ')
})

test('renders a bare commutative diagram through the deck compiler and preserves fenced examples', async () => {
  const source = [String.raw`# A commuting square`, '',
    String.raw`\begin{CD}`,
    String.raw`  U @>f>> V \\`,
    String.raw`  @VgVV @VVhV \\`,
    String.raw`  X @>>k> Y`,
    String.raw`\end{CD}`, '', '~~~tex',
    String.raw`\begin{CD}U @>f>> V\end{CD}`, '~~~'].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/class="math-cd"/g)).toHaveLength(1)
  expect(html.match(/<math [^>]* display="block"/g)).toHaveLength(1)
  expect(html).toContain('language-tex')
  expect(html).toContain('<mo stretchy="true" movablelimits="false" minsize="3em">→</mo>')
})
