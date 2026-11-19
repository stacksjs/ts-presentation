---
title: TypeScript presentations
theme: ./themes/lecture.ts
addons:
  - ./addons/status.ts
class: demo
layout: center
comark: true
math:
  macros:
    '\norm': '\left\lVert #1 \right\rVert'

---

# TypeScript presentations

A Markdown deck you can run in your browser.

<!--
Press P to open the synchronized presenter window.
-->

---

# Write in Markdown

- Use headings, tables, links and speaker notes.
- Put shared images and fonts in the deck’s public directory.
- Add HTML for interaction and CSS for the deck’s theme.

<!--
The source of every slide is in this Markdown file.
-->

---

# Highlight code

```ts
const audience = ['designers', 'developers']
for (const person of audience) {
  console.log(`Hello, ${person}!`)
}
```

<!--
Code highlighting uses the TypeScript highlighter from Stacks.
-->

---
layout: center
routeAlias: reveal
transition: fade

---

# Introduce the idea

<ul>
  <li>Set up the first point.</li>
  <li v-click>Reveal the next point.</li>
  <li v-click>Finish with the decision.</li>
</ul>

<!--
Each press of the next arrow reveals a point.
[click]
Explain the second point.
[click]
Then ask for the decision.
-->

---

# From draft to presentation

```charts
type: flowchart
theme: neutral
accessibleTitle: Draft, review, and present
description: Approval leads to the presentation. A requested change sends the draft back for another review.
direction: right
nodes:
  - { id: draft, label: Draft, shape: stadium }
  - { id: ready, label: 'Ready?', shape: diamond }
  - { id: present, label: Present, shape: rounded }
  - { id: revise, label: Revise }
edges:
  - { from: draft, to: ready }
  - { from: ready, to: present, label: 'Yes' }
  - { from: ready, to: revise, label: 'No', style: dotted }
  - { from: revise, to: draft, style: dotted }
```

<!--
The slide renders the diagram locally with ts-charts.
-->

---

# Live TypeScript

Edit the function and run it in the slide.

```ts {monaco-run}
const distance = (x: number, y: number) => Math.hypot(x, y)
console.log(distance(3, 4))
```

<!--
Change 3 or 4 and run the example again.
-->

---
layout: compare

---

# Vector length

The length of a vector \(v\) is \(\norm{v}\).

::right::

$$
\sqrt{x^2+y^2} = \sqrt{3^2+4^2} = 5
$$

[Browser runtime documentation](https://bun.com/docs/runtime)

<!--
Connect the formula to the preceding live example.
-->

---

# Exchange messages

```charts
type: sequence
theme: neutral
accessibleTitle: Review exchange
participants:
  - { id: author, name: Author, actor: true }
  - { id: reviewer, name: Reviewer }
events:
  - { kind: message, from: author, to: reviewer, label: Share a draft, change: start }
  - { kind: note, ids: [reviewer], label: Read and annotate }
  - { kind: message, from: reviewer, to: author, label: Return feedback, change: end, dashed: true }
```

<!--
Show how the participants, messages and note come from the diagram fence.
-->

---

# Highlight each equation

The first step expands the square. The second gives the result.

$$ {hide|1|2|all}
\begin{aligned}
24^2 &= (20 + 4)^2 \\
     &= 400 + 160 + 16 = 576
\end{aligned}
$$

<!--
Start by reading the expression.
[click]
Show the square in its expanded form.
[click]
Reveal the arithmetic.
-->

---
layout: compare

---

# Plan the work

```charts
type: pie
theme: neutral
showData: true
donutHole: 0.28
accessibleTitle: Estimated time by activity
slices:
  - { label: Review, value: 4 }
  - { label: Build, value: 6 }
  - { label: Test, value: 3 }
```

::right::

<style>
.example-columns > div:last-child { padding-top: 92px; }
</style>

```charts
type: er
theme: neutral
direction: right
accessibleTitle: Projects contain tasks
cards:
  - { id: project, name: Project, fields: ['name: string'] }
  - { id: task, name: Task, fields: ['title: string', 'status: string'] }
edges:
  - { source: project, target: task, label: contains, start: one, end: zero-many }
```

<!--
The pie chart shows an estimate. The relationship diagram shows the records behind it.
-->

---

# Schedule a release

```charts
type: gantt
theme: neutral
axisFormat: '%b %d'
tickInterval: 2days
excludes: [weekends]
todayMarker: false
sections:
  - name: Build
    tasks:
      - { id: scope, name: Review scope, start: '2026-03-02', duration: 2d, tags: [done] }
      - { id: build, name: Build changes, after: [scope], duration: 3d, tags: [active] }
  - name: Release
    tasks:
      - { id: verify, name: Verify, after: [build], duration: 2d, tags: [crit] }
      - { id: launch, name: Publish, after: [verify], duration: 0d, tags: [milestone] }
```

<!--
The verification work spans a weekend. The release milestone marks the end of that work.
-->

---

# Follow a branch

```charts
type: gitgraph
theme: neutral
direction: LR
operations:
  - { op: commit, id: Start }
  - { op: branch, name: review }
  - { op: commit, id: Draft }
  - { op: checkout, name: main }
  - { op: commit, id: Prepare }
  - { op: merge, branch: review, id: Approve, tags: [v1.0] }
```

<!--
The release combines the review branch with work on main.
-->

---

# Build a continued fraction

$$
\cfrac[l]{1}{1+\cfrac[l]{1}{1+\cfrac[l]{1}{1+x}}}
\qquad
\genfrac{(}{]}{1pt}{0}{a}{b}
$$

Between terms, use a rule or an explicit space. For example, \(\rule{0.65em}{0.8pt}\kern4mu x\).

<!--
The left expression uses continued fractions. The right expression changes delimiters and bar thickness.
-->

---

# Walk through the code

<<< ./snippets/summary.ts#summary ts [summary.ts] {1|2-3|all}{lines:true}

<!--
Start with the function signature.
[click]
Show how the completed items are counted.
[click]
Read the whole function together.
-->

---

# Show a refactor

````md magic-move
```ts [summary.ts]
const ready = items.filter(item => item.done)
const count = ready.length
```

```ts [summary.ts]
const count = items.filter(item => item.done).length
```
````

<!--
Start on the two-step implementation.
[click]
Show the same result computed inline.
-->

---

# Add conditions and labels

\begin{align*}
S &= \sum_{\substack{i>0\\j<n}} x_{ij}
  & \text{for $n$ samples}\\[0.4ex]
A &= \begin{array}{r|c}
       2 & 0 \\ \hdashline
       3 & 1
     \end{array}
  & \text{\textbf{Example} matrix}
\end{align*}

<!--
Read the two conditions under the sum. In the second row, point out the rules that divide the matrix cells.
-->

---

# Follow a release timeline

```charts
type: timeline
theme: neutral
accessibleTitle: Release milestones by phase
description: Research and planning precede the public preview and launch.
sections:
  - name: Planning
    periods:
      - { label: Week 1, events: [Interview users, Collect feedback] }
      - { label: Week 2, events: [Agree on scope] }
  - name: Delivery
    periods:
      - { label: Week 3, events: [Open a preview] }
      - { label: Week 4, events: [Publish the release] }
```

<!--
Read the periods from left to right. The first period contains two events.
-->

---

# Map a reviewer's journey

```charts
type: journey
theme: neutral
accessibleTitle: Proposal review journey
phases:
  - name: Prepare
    tasks:
      - { name: Start a draft, score: 5, actors: [Author] }
      - { name: Request feedback, score: 2, actors: [Author, Reviewer] }
  - name: Submit
    tasks:
      - { name: Resolve comments, score: 4, actors: [Author, Reviewer] }
      - { name: Approve the proposal, score: 5, actors: [Reviewer] }
```

<!--
The low score marks the wait for feedback. The colored dots identify who takes part in each step.
-->

---

# Compare two paths

\begin{CD}
A @>f>> B \\
@VuVV @VVvV \\
C @>>g> D
\end{CD}

The diagram commutes when \(v\circ f=g\circ u\).

<!--
Follow the top and right arrows, then the left and bottom arrows. Both paths start at A and end at D.
-->

---

# Change the status

<v-switch>
  <template #0><p>Draft ready for review.</p></template>
  <template #1><p>Review in progress.</p></template>
  <template #2><p>Approved for release.</p></template>
</v-switch>

<!--
Introduce the draft.
[click]
Explain what the reviewer checks.
[click]
Show the approval.
-->

---

# Keep long limits centered

A wide condition can sit directly under the summation symbol.

$$
\qquad \sum_{\mathclap{1\le i\le j\le n}}\ x_{ij}
\qquad\qquad \fcolorbox{3b82f6}{e0ecff}{$S_n=\displaystyle\sum_{i=1}^{n}i=\frac{n(n+1)}{2}$}
$$

<!--
The overlap keeps the summation compact. The frame marks a separate closed-form example.
-->

---

# Read an infix fraction

The separator groups the expressions on either side into a numerator and denominator.

$$
{\sum_{k=1}^{n} k \over n} = {n+1 \above{3pt} 2}
\qquad\qquad
{n \choose 2} = {n(n-1) \over 2}
$$

<!--
Compare the ordinary fraction bar with the thicker bar in the average. The binomial coefficient stacks its terms inside parentheses.
-->

---

# Run the checks

Choose the tab for your package manager.

::code-group

```sh [Bun]
bun run lint
bun test
```

```sh [npm]
npm run lint
npm test
```

::

<!--
Use the arrow keys while a tab has focus to switch examples. The Copy button copies the current example.
-->

---
dragPos:
  draft: 96, 216, 290, 140

---

# Arrange a slide

Double-click a card or the arrow to move it.

<v-drag pos="draft" class="review-card"><strong>Draft</strong><span>Capture the main idea.</span></v-drag>

<div v-drag="[572, 216, 290, 140]" class="review-card review-card-final"><strong>Review</strong><span>Agree on what to present.</span></div>

<v-drag-arrow pos="414, 284, 130, 0" width="4" color="#3f6d89" aria-label="Draft leads to review" />

<style>
.review-card {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 18px 24px;
  border: 2px solid #6e91a7;
  border-radius: 12px;
  background: #f7fbff;
  color: #183347;
}
.review-card-final { background: #cfe3e9; }
.review-card strong { font-size: 1.15em; }
.review-card span { font-size: 0.71em; }
</style>

<!--
Move a card, resize it with Shift, and then use the arrow handles to reconnect the two steps.
-->
