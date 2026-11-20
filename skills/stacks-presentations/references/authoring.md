# Author and present a deck

Start with the author's existing slide order, visual language, opening title
and intended audience. Put the main point on the slide and delivery cues in
speaker notes. Use readable type, a visual when it carries evidence, and
consistent backgrounds and spacing.

## Slide syntax

Set `canvasWidth` and `aspectRatio` in the opening frontmatter to size the
deck. For example, `canvasWidth: 800` and `aspectRatio: 4/3` produce an
800 × 600 canvas in the browser and exported files.

- Set deck title, author, theme and addons in the opening YAML block.
- Add a label on a separator, as in `---chapter`. A leading `yaml`
  fence can supply frontmatter when the slide has no dashed YAML block.
- Use per-slide `layout`, `class`, `routeAlias`, `hide`, or `transition`.
- Use `iframe`, `iframe-left`, or `iframe-right` with a `url` to embed a page.
  Set `scale` to zoom the embedded content. Enlarged slides size the iframe
  to its displayed viewport, while thumbnails and print retain its design size.
- Put CSS in a `<style>` block on a slide to style that slide. Inside that
  block, use `:scope` to target the slide itself. Keyframes defined in
  slide styles are named per slide. Put imports and shared CSS in `style.css`.
- Link to a slide with a number or route alias such as `#review/2`.
  The optional suffix selects a reveal step. A
  `<Link :to="2" title="Review" />` also creates a slide link.
- Include another Markdown file with `src: ./chapter.md`. A suffix such as
  `#2-4` selects the authored slide range before nested includes expand.
  Use `src: /chapters/intro.md` for a path relative to the entry deck.
- Use `v-click`, a numbered click such as `v-click="2"`, `v-after`,
  or a `<v-clicks>` list for progressive reveals. Add `[click]` on
  its own line in speaker notes to reveal the next notes segment.
- Use `v-click="'+2'"` for a relative reveal and `v-click="[2, 4]"`
  to show at clicks 2 and 3. `v-click.hide` reverses the effect.
  Absolute steps do not move the relative cursor.
- Set `depth` and `every` on `<v-clicks>` to reveal nested lists
  and groups of items. `<v-click-gap size="2" />` advances the cursor.
- Author a `<v-switch>` with `<template #0>`, `<template #1>`,
  or ranges such as `<template #2-4>` to replace content over time. The
  range ends before click 4.
- Use animation modifiers such as `v-click.fade.up` or define
  `clickAnimation: fade up` in frontmatter. `v-click.none` disables
  that transition for one element.
- Use `data-zoom` on a screenshot so the presenter can enlarge it.
- Serve local images and fonts from the deck's `public/` directory and
  reference them with relative paths.

### Slide and global layers

Create `global-bottom.stx` and `global-top.stx` beside the deck to draw
behind and above slide content. Use `layouts/slide-bottom.stx` and
`layouts/slide-top.stx` for per-slide content. Layers can also come from
your theme and addons. A deck file takes precedence for the same layer.

Use STX bindings such as `{{ nav.currentPage }}`, `{{ nav.total }}`,
`title`, and `frontmatter`. Author positioned layer elements relative to
the slide canvas. The audience and presenter keep an unchanged global
layer mounted across slides when it has no slide-managed reveals or media.
The overview and exports render each slide's layer content independently.

Add `custom-nav-controls.stx` beside the deck to append controls to the
toolbar. Use the browser's `presentationNavigation` API to navigate from
deck client code.

Export a function with `definePreparserSetup` from `setup/preparser.ts`
to configure Markdown transforms for the entry and included files. The
setup receives `filepath`, `headmatter`, and `mode`. Return an ordered
list of hooks using `transformRawLines(lines)` to mutate the source lines
before splitting, `transformSlide(content, frontmatter)` to change slide
Markdown or frontmatter, and `transformNote(note, frontmatter)` to change
speaker notes. Each hook can be asynchronous.

## Edit slides beside the preview

- In the dev server, choose **Edit slide** or press **E** to open the source
  for the current slide. The pane includes its frontmatter and speaker notes.
  Edits save after a short pause. Use **Ctrl+S** or **Cmd+S** to save right away.
- An included slide writes to the file shown at the top of the pane. If that
  file changes on disk, the editor keeps your draft and prompts you to reload
  the source. Copy your draft before replacing it with the file on disk.
- External edits refresh slide bodies, speaker notes, and titles in open dev
  views. Deck-wide theme, canvas, or client settings may reload the page.
  Slides transformed by a preparser need to be edited in their source files.

## Draw on slides

- Click **Draw** or press **D** to turn on mouse and touch drawing. A stylus
  can start a stroke with Draw turned off. The overlay stays visible
  when Draw is turned off.
- Choose **Clear drawing** or press **C** while Draw is on to remove ink from
  the current slide.
- Set `drawings.presenterOnly: true` to allow editing from presenter view.
  Set `drawings.syncAll: false` to keep audience edits local to their tabs.
  Open windows of the same presentation receive the presenter's edits.
- Set `drawings.enabled: dev` to enable editing only in the dev server.
  Set the value to `false` to disable editing.
- Set `drawings.persist: true` to save SVGs under
  `.slidev/drawings/<deck-name>/`, or supply a directory relative to the
  deck. Saved ink appears in static builds, PDF, PNG, and PowerPoint.

## Code, math, and diagrams

- Add a title and click ranges to a fence, as in
  `ts [build.ts] {1|2-3|all}{lines:true,maxHeight:'160px'}`. Set
  `lineNumbers: true` in frontmatter for default line numbering.
- Import an existing file with `<<< ./example.ts` or use `@/` for a path
  relative to the deck root. Append `#example` to select a named region.
  Opt in to writing a whole JavaScript or TypeScript file by appending
  `{monaco-write}`. Saving is available on the local dev server.
- To group examples, set `comark: true` and wrap titled fences between
  `::code-group` and `::`. `<CodeGroup>` with `</CodeGroup>` also works.
  Tabs share a reveal timeline, and the first tab appears in generated exports.
- Use **Copy** to copy the active example, including current text from a
  live editor. Set `codeCopy: false` or `magicMoveCopy: false` to hide
  the corresponding controls. Code blocks with `maxHeight` scroll to
  highlighted lines as the reveal progresses.
- Open a four-backtick `md magic-move` fence and add ordinary code fences
  or snippet imports inside it. Advancing a click animates tokens between
  frames. Reduced motion switches frames immediately.
- A fence with `js {monaco}` or `ts {monaco}` opens an editor.
  Add `-run` to the option for a Run/Stop button and console output.
  Use small, self-contained examples. JavaScript runs in static builds.
  The dev server compiles edits to TypeScript with Bun. Offline editors can
  run the original TypeScript or edit its compiled JavaScript.
- Wrap inline equations in `$...$` or `\(...\)`. Use `$$...$$` or
  `\[...\]` for display equations. Native MathML handles fractions, roots,
  sums, matrices, math alphabets, and alignments. Use `\tag{A $n$}` for a
  formatted equation label or `\tag*{A $n$}` for a label without parentheses.
  Set `math.leqno: true` in deck frontmatter to put tags on the left, or
  `math.fleqn: true` to align displays left with a 2 em inset. The same
  options are available through `setup/katex.ts`.
- Put ranges after a display opener, as in `$$ {hide|1|2|all}`. Each
  additional range uses one click. Add `{at: 3, startLine: 2, finally: 'all'}`
  after the ranges to control click and line numbering and the final state.
  Row numbers and explicit tags work in `align` and `gather`.
- Use `\ce{^{227}_{90}Th+}` for isotopes, `\ce{CrO4^2-}` for charged
  species, and `\ce{A ->[H2O][$p_i$] B}` for reaction labels above and
  below an arrow. Use `<=>>` for a longer forward harpoon or `<<=>` for
  a longer reverse harpoon. Write a hydrate with `\ce{CuSO4*5H2O}`.
- Use `\pu{1,2(3)e-4 J // mol K}` for a quantity with uncertainty,
  scientific notation, and a stacked unit fraction. A single slash is
  inline. See the [mhchem syntax manual](https://mhchem.github.io/MathJax-mhchem/).
- Use `\genfrac` or `\cfrac` for custom or continued fractions, and
  `\mathchoice` for style-dependent notation. TeX macro definitions support
  groups, delimited arguments, optional arguments, and eager expansion.
  Use `\@ifstar` for starred forms, `\@ifnextchar` to inspect the next token,
  and `\TextOrMath` to choose an expansion for text or math.
  `\raisebox`, `\rule`, and `\kern` control placement and spacing.
  Use `\thinspace`, `\medspace`, or `\enspace` for named spacing and
  `\nobreakspace` to keep neighboring terms together in inline math.
  Mathtools relations such as `\coloneqq`, `\eqqcolon`, and `\dblcolon`
  receive the same spacing as other relations. Use `\Gamma` for upright
  uppercase gamma and `\varGamma` for its italic form.
  Legacy font declarations such as `{\bf x}` and `{\cal A}` apply within
  their group and respect nested font changes.
- Use `{a \over b}` for an infix fraction, `{a \above{2pt} b}` for a
  custom rule, or `{n \choose k}` for a binomial coefficient. Braces
  delimit each fraction group. Use `\limits` or `\nolimits` with a
  math operator to place scripts above and below or off to the side.
- Use `\begin{align}`, `\begin{alignat}`, `\begin{gather}`, or
  `\begin{equation}` at the start of a line for standalone displays.
  Automatic numbers follow the rendered slide order. Starred environments,
  manual tags, hidden slides, and speaker notes do not advance the sequence.
  Use `\notag` or `\nonumber` to suppress a number. A tag or suppression
  inside `split` or `aligned` applies to the enclosing equation or row.
  Use `alignat{2}` for two pairs of columns with explicit spacing between
  them, or `align` for an automatic one-em gap between pairs. Use `aligned`
  or `alignedat` inside inline math or an enclosing equation. Each pair
  aligns at its `&`, as in `a&=b`.
- Use `\substack{i>0\\j<n}` or `subarray` for multiline limits and
  `smallmatrix` for compact inline matrices. For ruled arrays, use
  `|` or `:` between column specifiers, `\hline` or `\hdashline`
  between rows, and `\\[1ex]` for extra row space.
- Use `\text{for $n$ samples}` to mix upright labels with nested math.
  Font commands such as `\textbf` can appear inside the label.
- Use `\fcolorbox{navy}{white}{$F=ma$}` for a framed formula and
  `\colorbox{yellow}{draft}` for a label. Use `\raisebox` to shift a box
  from the baseline, `\vcenter` to center a box on the math axis, and
  `\mathllap`, `\mathclap`, or `\mathrlap` to align an overlap without
  increasing the width of the formula.
- Use `\xrightarrow[below]{above}` or `\xrightleftharpoons[below]{above}`
  to label extensible arrows. Their shafts expand to fit the labels.
- Use an AMS `\begin{CD} … \end{CD}` block for a commutative diagram.
  Use `@>f>>` for a horizontal arrow marked `f` and `@VgVV` for a downward
  arrow with `g` on the left. Use `@AAhA` for an upward arrow with
  `h` on the right and `@|` for a vertical double line. Put vertical
  arrows on their own rows. Side labels preserve the arrow's alignment
  with its node column. Local macro definitions apply across one CD row.
- Use `\Braket{\phi|H|\psi}` and `\Set{x|x>0}` for scalable bra-ket and
  set-builder notation. Labeled arrows accept `[below]{above}`.
- Use `\bigl( … \bigr)` through `\Biggl( … \Biggr)` for fixed delimiter sizes.
  Use `\left\{ … \middle| … \right\}` to fit delimiters to the expression and
  `\left.` or `\right.` for an invisible end.
- Use `f''_2` for primes with a subscript and `xᵢ²` for Unicode scripts.
  `\dots` chooses centered or baseline dots from the next symbol. Use
  `\not\subseteq` for a negated relation and `x\equiv1\pmod{6}` for
  a congruence. Operators such as `\limsup` and `\varliminf` put limits
  below the operator in display math.
- Use deck-wide macros under `math.macros`. Quote TeX with YAML single
  quotes so backslashes are preserved.
- KaTeX token-list expansions work in `math.macros` and `setup/katex.ts`.
  Set `numArgs` and list `tokens` in stack order, with the first token to
  read at the end. For example, `'\originalSum': { numArgs: 0, tokens: [{ text: '\sum', noexpand: true }] }`
  keeps the built-in sum usable inside a custom definition. If the macro
  uses delimiters, list the literal prefix first and then one token list per argument.
- In `setup/katex.ts`, a macro can be a synchronous function that receives
  a `MathMacroContext` and returns TeX or a token-list expansion. Use
  `consumeArg()` for an argument, `future()` to look ahead, and `mode`
  to choose between math and text. Use `context.macros.set(name, value, true)`
  to share a definition with later formulas in the deck.
- Set `globalGroup: true` under `math` to reuse top-level TeX definitions across
  formulas in one deck. Use `maxExpand` to set the expansion budget per formula
  and `colorIsTextColor: true` for decks that use the older two-argument
  `\color` syntax. The same options work in `setup/katex.ts`.
- Set `maxSize` under `math` to cap explicit positive dimensions in TeX ems.
  Set `minRuleThickness` to make fraction bars, array rules, box borders,
  and overlines or underlines thicker. Radical rule widths follow the math font.
- Use `\\` or `\newline` for an explicit math line break. Add space with
  `\\[0.5em]`. Set `math.strict` to `true` or `error` to suppress standalone
  display breaks, or `warn` to keep them and log a warning. Inline breaks and
  row separators in environments such as `aligned` still work with strict
  mode enabled. Strict settings also cover comments at the end of a formula,
  HTML extensions, text-only commands in math, math spacing units, and
  overflowing array columns. In `setup/katex.ts`, a callback can choose a
  policy for each diagnostic code.
- Use `\overbracket{a+b}^{label}` or `\underbracket{a+b}_{label}` for
  stacked bracket annotations. Use `\overlinesegment` and
  `\underlinesegment` for a line with end marks. In text, use `\underbar`
  to underline words and `\textcircled` to circle a character.
- Position a floating element with `v-drag="[left, top, width, height, angle]"`
  or `<v-drag pos="left, top, width, height, angle">`. Use `NaN` in the
  directive or `_` in the component to retain automatic height. Set
  `pos="card"` or `v-drag="'card'"` to read the position from
  `dragPos.card` in the slide's frontmatter. A draggable arrow uses
  `<v-drag-arrow pos="x, y, dx, dy" />` with signed endpoint offsets.
- Double-click a draggable element or press **F2** while it has focus to edit
  it. Use arrow keys to nudge it and hold **Shift** while resizing to preserve
  proportions. The dev server saves inline positions and named positions in
  YAML block mappings. Complex YAML mappings and slides rewritten by preparsers
  allow temporary edits. Built decks also keep adjustments in the browser only.
- Use a `charts` YAML fence. For `type: flowchart` or `type: state`, supply
  `nodes` with stable IDs and `edges` linking those IDs with `from` and
  `to`. Label decisions with `shape: diamond`. Use `style: dotted` for
  retries and `groups` to label related steps. Add `accessibleTitle` and
  `description` to describe the workflow.
- Use `type: sequence` with `participants` and ordered `events`. Messages
  name a `from` and `to` participant. Notes list participant `ids`. Use
  `change: start` or `change: end` on messages to show activity periods.
- Use `type: class` or `type: er` with `cards` and `edges`. Cards can
  contain `fields` and `operations`. Connections use `source` and
  `target` IDs and may set `start` and `end` markers.
- Use `type: pie` with `slices` containing a `label` and positive
  `value`. Set `showData: true` to include values in the legend and
  `donutHole` to set the inner radius as a fraction of the outer radius.
- Use `type: xy` with ordered `series` of `type: bar` or `type: line`.
  Each series takes `values` and can have a `label` for the legend.
  Use `xAxis.categories` or a numeric `xAxis.domain` and give
  `yAxis.domain` an explicit range when charts need a shared scale.
  A line point may use `{ value: 8, label: Target }`.
  Set `orientation: horizontal` to flip the chart.
- Use `type: sankey` with `links` containing `source`, `target`, and
  a nonnegative `value`. Optional `nodes` give IDs custom labels or colors.
  Set `nodeAlignment` to `left`, `right`, `center`, or `justify`.
  Choose `linkColor: gradient`, `source`, `target`, or a CSS color.
- Use `type: timeline` with `sections` and `type: journey` with `phases`.
- Use `type: gantt` with `sections` containing tasks. Give each task a
  `name`, an optional `id`, a `start` date or `after` list, and one
  of `end`, `duration`, or `until`. A task without a start follows the
  previous task. Set `excludes: [weekends]` to skip weekends in durations.
  Holiday lists accept ISO dates alongside dates in the chart's `dateFormat`.
  A task's `href` can point to a URL or slide. Use `weekday` to start weekly
  ticks on a chosen day and `todayMarkerStyle` to style the current-date line.
  Set `width`, `fontSize`, `sectionFontSize`, and `sectionColors` to size and
  style the schedule.
  Use `callback: { name: delivery.review, args: [draft] }` to call a function
  exposed by your deck or addon client, such as `window.delivery.review`.
- Use `type: gitgraph` with `operations`. Each operation has an `op` of
  `commit`, `branch`, `checkout`, `merge`, or `cherry-pick`. Give
  branches and checkouts a `name`, merges a `branch`, and cherry-picks
  a source `commit`. A dashed line traces the source commit. When picking a
  merge, identify its `parent`. Set
  `rotateCommitLabel: true` for diagonal commit labels.
  Set `branchLabelColors` and `highlightColors` for the branch palette.
  `commitLabel` and `tagLabel` accept `color`, `background`, `border`, and
  `fontSize`.
- Imported Slidev diagram fences pass through a compatibility parser.
  Styled flowchart groups, sequence and state diagrams, relationships,
  pie charts, quadrant charts, XY charts, Sankey diagrams, Gantt schedules, Git histories, timelines, and journeys use
  the same `ts-charts` renderers as `charts` fences.
- In a `charts` fence with `type: quadrant`, list `quadrants` in top-right,
  top-left, bottom-left, bottom-right order. Use `xAxis` and `yAxis` for one
  or two labels in low-to-high order. Each point has a `label` and `x` and
  `y` coordinates from 0 to 1. Imported `quadrantChart` fences also accept
  `classDef` and inline point styles.
- Imported Gantt schedules support date and axis formats, exclusions, task
  dependencies, milestones, today-marker styling, and chart spacing. Enable
  imported `href` and `call` interactions with `securityLevel: loose` in diagram
  settings. An empty callback argument list passes the task ID.
  Task labels are centered inside bars when they fit and moved beside shorter
  bars and milestones. Set `taskLabelPlacement: bar` in a native `charts`
  Gantt spec to use the same layout.
  Weekends and holidays extend duration-based tasks. A trailing run of excluded
  days leaves a gap between the bar and the next dependent task. Use
  `weekend friday` for Friday and Saturday weekends and `includes` to restore
  individual dates.
  Time-only dates use the UTC date of the build. Use `S`, `SS`, or `SSS`
  for fractional seconds in `dateFormat` and `%L` for milliseconds in
  `axisFormat`. Use `%%` for a literal percent in an axis label and
  `todayMarker stroke-dasharray:5 3,stroke-linecap:round` for a dashed marker.
  Multi-unit ticks follow the calendar. For example,
  `tickInterval 3month` places ticks at the start of each quarter.
  An imported task with an invalid end date or duration has zero duration.
  Imported GitGraph diagrams support branch ordering, checkout, merges, tags,
  cherry-picking, horizontal or vertical lanes, `rotateCommitLabel`, and the
  diagram's branch, commit, and tag theme variables. Set `diagramPadding`
  under `config.gitGraph` to add space around the imported graph and title.
  Use `commit id:"abc" msg:"Describe the change"` to keep a message in the
  commit tooltip. Merge and cherry-pick tooltips describe the operation.
  Set `type:REVERSE`, `type:HIGHLIGHT`, or `type:NORMAL`
  on a commit or merge to choose its symbol. Unknown commit and merge
  properties generate a warning and leave the recognized fields intact.
  Imported Gantt tasks without IDs receive `task1`, `task2`, and so on for
  dependencies, links, and callbacks.
- Imported `xychart` or `xychart-beta` supports named `bar` and `line`
  series, quoted categories, negative and positive numbers, and point labels.
  Set dimensions and axis options in `config.xyChart`. Palette and text
  colors go in `config.themeVariables.xyChart`.
- For imported `sankey` or `sankey-beta`, write CSV rows in
  `source,target,value` order. Quote names containing commas and double
  any quotes inside that field. Use `config.sankey` for colors, dimensions,
  node labels, and alignment.
- Use `timeline` or `timeline TD` for chronological periods. A period can
  have several events on one line or continuation lines starting with `:`.
  Add `section` headings and use `<br>` to break a label manually.
- Use `journey` to document a workflow with `Task: score: Actor, Actor` entries.
  Scores run from 1 to 5. Sections group tasks, and actor dots map to the legend.
  Add `accTitle:` or `accDescr:` for an accessible name or description.
  Use an external SVG if a diagram requires unsupported syntax.

```yaml
math:
  fleqn: true
  leqno: true
  macros:
    '\norm': '\left\lVert #1 \right\rVert'
```

In a deck, `setup/katex.ts`, `setup/mermaid.ts`, and
`setup/mermaid-renderer.ts` can export callbacks created with
`defineKatexSetup`, `defineMermaidSetup`, and
`defineMermaidRendererSetup` from `ts-presentation`. The callbacks run in
Bun during compilation. A custom renderer receives plain Mermaid source
and options and returns an SVG string.

## Rehearsal

Use **P** for synchronized presenter mode, **O** for overview, and **F**
for fullscreen. The presenter can switch layouts, resize the panels, preview
the next reveal, seek through the current slide's reveals, and read the notes.
Arrow keys advance through click steps. On the dev server, open `/presenter`
or `/presenter/review?clicks=2` to start at a named slide and step. For an
offline deck, open `index.html?presenter=1#review/2`.

Open `/entry` on the dev server or `index.html?entry=1` in a built deck
to choose Slides, Presenter, Notes, or Overview. To read notes hands-free,
open `/notes` or use **Open notes view** from the presenter. The notes
window follows slide changes, reveal steps, and the timer across tabs
in the same browser profile. Its text size is stored in that browser.

Addons can listen for `presentation:slide`. Its detail includes `slide`,
`click`, `title`, and `route`. Read the active metadata and navigate via
`window.presentationNavigation` on the page that owns the slide. For example,
`currentFrontmatter` exposes authored fields, `currentPage` gives the slide
number, and `go('review', 2)` seeks to a named slide and reveal.

Verify that sample data, links and any live code you intend to run are ready for
the audience. Use the build command to rehearse without the dev server.
