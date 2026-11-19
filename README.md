# ts-presentation

A Bun-first fork of [Slidev](https://sli.dev/) with a TypeScript player
and CLI. It uses Bun’s Markdown, YAML, bundler and HTTP server plus
Stacks’ syntax highlighter and graph layout.

## Run the example

Requires Bun 1.4 or newer.

```sh
bun install --frozen-lockfile
bun run dev
```

Use the arrow keys or slide picker to navigate. **P** opens a synchronized
presenter window with notes, a next-frame preview and a timer. Choose
from three presenter layouts, drag the panel dividers, or use the reveal
slider to rehearse individual steps. The dev server also accepts
`/presenter` and `/presenter/2` directly. **O** opens the overview,
**F** toggles fullscreen, **D** opens the drawing layer
in the active window, and **C** clears a drawing. Where the host browser
supports screen capture, **Record** saves the chosen screen or window
as a video.

Left and right move through reveals. Up and down jump between slides.

`bun run build` emits an offline browser deck. `bun run export` creates a
PDF with Chrome or Chromium. Set `CHROME_BIN` or pass `--executable-path`
if the executable is installed elsewhere.

```sh
bun src/cli.ts export examples/demo/slides.md --format pptx --out output/demo.pptx
bun src/cli.ts export examples/demo/slides.md --format pptx-editable --out output/editable.pptx
bun src/cli.ts export examples/demo/slides.md --format png --range 1,3-5 --out output/frames
```

PowerPoint uses slide images with editable speaker notes and clickable web
links. It includes each reveal by default. Pass `--without-clicks` for one
frame per slide, or `--with-clicks` to include reveals in a PNG export.

`pptx-editable` rebuilds text, backgrounds, and boxes as PowerPoint
objects. Diagrams, formulas, and other browser artwork are embedded
as separate pictures. The exporter reports slides that require a full-frame
image. It references fonts by name, so recipients may see font substitutions.

## Write a deck

Run `bun src/cli.ts dev path/to/slides.md`. Put a blank line after
`---` for a slide break, or add YAML frontmatter ending with another
`---`. Put media and fonts in an optional `public/` directory beside
the deck and style slides with an optional `style.css`.

| feature | syntax |
| --- | --- |
| Speaker notes | Trailing HTML comment, with `[click]` on its own line for notes revealed on the next click |
| Drawing annotations | Draw with a mouse or stylus. Set `drawings.persist: true` to save SVG overlays for the built site and exports |
| Progressive reveals | `v-click`, explicit and relative clicks, enter/leave ranges, animated modifiers, grouped `<v-clicks>` lists, and replacement content with `<v-switch>` |
| Layouts | `layout: default`, `center`, `cover`, `intro`, `section`, `image-left`, or `image-right`. Set `image` for an image layout |
| Local slides and ranges | `src: ./chapter.md#2-4` selects authored slides before nested imports expand. A leading slash resolves from the deck directory |
| Markdown preparser | `setup/preparser.ts` can transform raw lines, per-slide Markdown, frontmatter, and speaker notes before rendering |
| Navigation | `routeAlias: review`, then links such as `#review` or `#review/2`. Set `clicksStart` or `clicks` to override a slide's reveal range |
| Per-slide options | `class`, `hide`, `disabled`, and `transition: fade`, `slide-left`, or `slide-up` |
| Images and component markup | Trusted HTML, with optional `data-zoom` on an image |
| First-party diagrams | YAML in a `charts` fence. Supports flowcharts, timelines, user journeys, Gantt schedules, and Git histories through `ts-charts` |
| Existing diagrams | Slidev-compatible diagram syntax for flowcharts, sequence, state, class, entity relationship, pie, Gantt, GitGraph, timelines, and user journeys |
| Math | Native MathML with scoped macros, styled fractions, numbered equations, ruled arrays, commutative diagrams, stacked subscripts, mixed text and math, click highlighting, and chemistry notation |
| Code walkthroughs | `ts [build.ts] {1\|2-3\|all}{lines:true}` for titles and click highlights, or `md magic-move` around nested fences to animate between frames |
| Source snippets | `<<< @/snippets/build.ts#example` for a named region. Use `{monaco-write}` with a whole JavaScript or TypeScript file to allow saving from the local dev editor |
| Live code | A `js` or `ts` fence followed by `{live-run}` or `{monaco-run}`. Use `{live}` or `{monaco}` for an editor |
| Themes and addons | Set `theme: paper` or `theme: serif`, or load trusted local modules through `theme` and `addons` |
| Canvas size | Set `canvasWidth: 800` and `aspectRatio: 4/3` in deck frontmatter for an 800 × 600 canvas |

```charts
type: flowchart
direction: right
nodes:
  - { id: draft, label: Draft }
  - { id: review, label: Review }
edges:
  - { from: draft, to: review }
```

The dev server shares an in-flight compilation and reuses rendered HTML
until an included source or the preparser entry changes. The browser renders local decks
without a framework, and slide navigation updates only the active slide.

TypeScript edits run when served by the Bun dev command. The offline build
can run the original TypeScript and offers an editable JavaScript version.
See the [Stacks presentations skill](skills/stacks-presentations/SKILL.md)
for authoring, extension APIs, exports, and the preserved upstream skill bundle.

## Upstream compatibility

The port branches from [Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
Credit goes to Anthony Fu and the Slidev community. The original MIT
license is included in [licenses/Slidev-MIT.txt](licenses/Slidev-MIT.txt).

All seven Slidev packages and the complete test tree are preserved in the
[source snapshot in Git history](https://github.com/stacksjs/ts-presentation/tree/fd663ef704a3dbd27ad07cf7151003490f3c21b1/upstream/slidev).
The active checkout contains the Bun port. The editable exporter ports
Slidev's DOM walker and layout normalization to Bun WebView and the native
PowerPoint writer. Adapted tests for export, code blocks, math, and diagrams run with
`bun test`.

Open compatibility work includes Vue components and extensions, Monaco tooling,
Shiki transformers, the full TeX and Mermaid grammars, PlantUML, and remote slide
control. See the
[compatibility guide](skills/stacks-presentations/references/compatibility.md).

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
