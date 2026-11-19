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

- A fence with `js {monaco}` or `ts {monaco}` opens an editor.
  Add `-run` to the option for a Run/Stop button and console output.
  Use small, self-contained examples. JavaScript runs in static builds.
  The dev server compiles edits to TypeScript with Bun. Offline editors can
  run the original TypeScript or edit its compiled JavaScript.
- Wrap inline equations in `$...$` or `\(...\)`. Use `$$...$$` or
  `\[...\]` for display equations. Native MathML handles fractions, roots,
  sums, matrices, math alphabets, and alignments. Use `\tag{1}` for a
  custom equation number and `\newcommand` for a formula-local macro.
- Use deck-wide macros under `math.macros`. Quote TeX with YAML single
  quotes so backslashes are preserved.
- A `mermaid` fence supports flowcharts with styled nodes and subgraphs,
  sequence diagrams with participants, messages, notes and sections,
  and simple state transitions. Flowchart and state layout uses `ts-charts`.
  Use an external SVG if a diagram requires unsupported syntax.

```yaml
math:
  macros:
    '\norm': '\left\lVert #1 \right\rVert'
```

## Rehearsal

Use **P** for synchronized presenter notes and timer, **O** for overview,
and **F** for fullscreen. Arrow keys advance through click steps. Verify
that sample data, links and any live code you intend to run are ready for
the audience. Use the build command to rehearse without the dev server.
