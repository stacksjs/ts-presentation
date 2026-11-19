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
- Use per-slide `layout`, `class`, `routeAlias`, `hide`, or `transition`.
- Include another Markdown file with `src: ./chapter.md`. A suffix such as
  `#2-4` selects the authored slide range from that file.
- Use `v-click`, a numbered click such as `v-click="2"`, `v-after`,
  or a `<v-clicks>` list for progressive reveals. Add `[click]` on
  its own line in speaker notes to reveal the next notes segment.
- Use `data-zoom` on a screenshot so the presenter can enlarge it.
- Serve local images and fonts from the deck's `public/` directory and
  reference them with relative paths.

## Code, math, and diagrams

- Add a title and click ranges to a fence, as in
  `ts [build.ts] {1|2-3|all}{lines:true,maxHeight:'160px'}`. Set
  `lineNumbers: true` in frontmatter for default line numbering.
- Import an existing file with `<<< ./example.ts` or use `@/` for a path
  relative to the deck root. Append `#example` to select a named region.
  Opt in to writing a whole JavaScript or TypeScript file by appending
  `{monaco-write}`. Saving is available on the local dev server.
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
  sums, matrices, math alphabets, and alignments. Use `\tag{1}` for a
  custom equation number and `\newcommand` for a formula-local macro.
- Put ranges after a display opener, as in `$$ {hide|1|2|all}`. Each
  additional range uses one click. Add `{at: 3, startLine: 2, finally: 'all'}`
  after the ranges to control click and line numbering and the final state.
  Row numbers and explicit tags work in `align` and `gather`.
- Use `\ce{...}` for common reactions and molecular notation, and
  `\pu{...}` for quantities and units.
- Use `\genfrac` or `\cfrac` for custom or continued fractions, and
  `\mathchoice` for style-dependent notation. TeX macro definitions support
  groups, delimited arguments, optional arguments, and eager expansion.
  `\raisebox`, `\rule`, and `\kern` control placement and spacing.
- Use `\begin{align}`, `\begin{alignat}`, `\begin{gather}`, or
  `\begin{equation}` at the start of a line for standalone displays.
  The starred forms omit automatic numbering.
- Use `\substack{i>0\\j<n}` or `subarray` for multiline limits and
  `smallmatrix` for compact inline matrices. For ruled arrays, use
  `|` or `:` between column specifiers, `\hline` or `\hdashline`
  between rows, and `\\[1ex]` for extra row space.
- Use `\text{for $n$ samples}` to mix upright labels with nested math.
  Font commands such as `\textbf` can appear inside the label.
- Use an AMS `\begin{CD} … \end{CD}` block for a commutative diagram.
  Use `@>f>>` for a horizontal arrow marked `f` and `@VgVV` for a downward
  arrow with `g` on the left. Put vertical arrows on their own rows.
- Use `\Braket{\phi|H|\psi}` and `\Set{x|x>0}` for scalable bra-ket and
  set-builder notation. Labeled arrows accept `[below]{above}`.
- Use deck-wide macros under `math.macros`. Quote TeX with YAML single
  quotes so backslashes are preserved.
- For new diagrams, use a `charts` fence with YAML. Set `type: flowchart`
  and supply `nodes` and `edges`, use `type: timeline` with `sections`,
  or use `type: journey` with `phases`.
- Use `type: gantt` with `sections` containing tasks. Give each task a
  `name`, an optional `id`, a `start` date or `after` list, and one
  of `end`, `duration`, or `until`. A task without a start follows the
  previous task. Set `excludes: [weekends]` to skip weekends in durations.
- Use `type: gitgraph` with `operations`. Each operation has an `op` of
  `commit`, `branch`, `checkout`, `merge`, or `cherry-pick`. Give
  branches and checkouts a `name`, merges a `branch`, and cherry-picks
  a source `commit`. When picking a merge, identify its `parent`.
- The compatibility `mermaid` fence reads existing flowcharts with styled nodes and subgraphs,
  sequence diagrams, simple state transitions, class and entity relationship
  diagrams, pie charts, Gantt schedules, GitGraph histories, timelines, and user journeys. Options like `{scale:0.5, theme:'neutral'}` on the
  fence override deck defaults. Diagram YAML can also provide a title and
  configuration, including pie legend placement and donut radius.
- Gantt supports date and axis formats, weekday and date exclusions,
  task dependencies, and milestones. GitGraph supports branch ordering,
  checkout, merges, tags, cherry-picking, and horizontal or vertical lanes.
- Use `timeline` or `timeline TD` for chronological periods. A period can
  have several events on one line or continuation lines starting with `:`.
  Add `section` headings and use `<br>` to break a label manually.
- Use `journey` to document a workflow with `Task: score: Actor, Actor` entries.
  Scores run from 1 to 5. Sections group tasks, and actor dots map to the legend.
  Add `accTitle:` or `accDescr:` for an accessible name or description.
  Use an external SVG if a diagram requires unsupported syntax.

```yaml
math:
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

Addons can listen for `presentation:slide`. Its detail includes `slide`,
`click`, `title`, and `route`. Read the active metadata and navigate via
`window.presentationNavigation` on the page that owns the slide. For example,
`currentFrontmatter` exposes authored fields, `currentPage` gives the slide
number, and `go('review', 2)` seeks to a named slide and reveal.

Verify that sample data, links and any live code you intend to run are ready for
the audience. Use the build command to rehearse without the dev server.
