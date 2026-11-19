# ts-presentation

A Bun-first fork of [Slidev](https://sli.dev/) with an STX slide shell, a TypeScript player,
and a Bun CLI. It uses Bun’s Markdown, YAML, bundler, and HTTP server plus
Stacks’ syntax highlighter and ts-charts.

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

In dev, **Edit slide** or **E** opens the slide's Markdown beside the
preview. The editor saves frontmatter, body, and speaker notes to the
source file. Use **Ctrl+S** or **Cmd+S** to save immediately. Changes
from an external editor update the open preview and navigation titles.

`bun run build` emits an offline browser deck. `bun run export` creates a
PDF with Chrome or Chromium. Set `CHROME_BIN` or pass `--executable-path`
if the executable is installed elsewhere.

```sh
bun src/cli.ts export examples/demo/slides.md --format pptx --out output/demo.pptx
bun src/cli.ts export examples/demo/slides.md --format pptx-editable --out output/editable.pptx
bun src/cli.ts export examples/demo/slides.md --format png --range 1,3-5 --out output/frames
bun src/cli.ts export examples/demo/slides.md --range 2-4 --with-clicks --out output/rehearsal.pdf
```

PowerPoint uses slide images with editable speaker notes and clickable web
and slide links. It includes each reveal by default. Pass `--without-clicks` for one
frame per slide, or `--with-clicks` to include reveals in a PNG export.

`pptx-editable` rebuilds text, backgrounds, and boxes as PowerPoint
objects. Diagrams, formulas, and other browser artwork are embedded
as separate pictures. The exporter reports slides that require a full-frame
image. It references fonts by name, so recipients may see font substitutions.

Set `exportFilename` and `export` in the deck headmatter for repeatable exports.
The `export` mapping accepts `format`, `range`, and `withClicks`.
PNG and PowerPoint can also set `scale`. CLI options override the deck defaults. With PDF
`--with-clicks`, each selected reveal becomes a page with selectable text.

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
| Layouts | `layout: default`, `center`, `cover`, `intro`, `section`, `image-left`, `image-right`, `two-cols`, `two-cols-header`, `iframe`, `iframe-left`, or `iframe-right`. Use named slots in column layouts and set `url` for iframe layouts |
| Slide CSS | A `<style>` block styles its authored slide. Use `style.css` for deck-wide rules |
| Draggable elements | Use `v-drag`, `<v-drag>`, or `<v-drag-arrow>`. Double-click to move, resize, or rotate. Dev saves positions to the Markdown |
| Local slides and ranges | `src: ./chapter.md#2-4` selects authored slides before nested imports expand. A leading slash resolves from the deck directory |
| Markdown preparser | `setup/preparser.ts` can transform raw lines, per-slide Markdown, frontmatter, and speaker notes before rendering |
| Slide editor | Edit the Markdown of the current slide and preview file changes in dev |
| Navigation | `routeAlias: review`, then links such as `#review` or `#review/2`. Use `clicksStart` and `clicks` to set reveal bounds |
| Outline and counters | `<Toc />` links to slides grouped by heading depth. Use `<TitleRenderer no="2" />` for a slide title, or `<SlideCurrentNo />` and `<SlidesTotal />` for page numbers |
| Per-slide options | `class`, `hide`, `disabled`, and `transition: fade`, `slide-left`, or `slide-up` |
| Images and component markup | Trusted HTML, with optional `data-zoom` on an image |
| Post embeds | `<Tweet id="…" />` or `<Tweet url="…" />` loads the X widget in a sandboxed iframe |
| Video | `<SlidevVideo v-click controls>` accepts native video sources, playback and reset options, and a print poster or seek time. `<Youtube id="…" />` embeds playback in the deck and links to YouTube in exports |
| Fonts | Set `fonts.sans`, `fonts.serif`, or `fonts.mono`. Choose `fonts.provider` as `google`, `coollabs`, or `none` |
| First-party diagrams | YAML in a `charts` fence. `ts-charts` renders flowcharts, sequence and state diagrams, class and entity relationships, pie charts, Gantt schedules, Git histories, timelines, and user journeys |
| Imported diagrams | Slidev diagram fences are translated to structured data and rendered by the same `ts-charts` functions |
| PlantUML sequence diagrams | `plantuml` fences render messages, participants, notes, and groups locally through `ts-charts` |
| Markdown alerts | Start a blockquote with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` |
| Math | Native MathML with scoped macros, styled fractions, numbered equations, ruled arrays, commutative diagrams, stacked subscripts, mixed text and math, click highlighting, and chemistry notation |
| Code walkthroughs | `ts [build.ts] {1\|2-3\|all}{lines:true}` for titles and click highlights, or `md magic-move` around nested fences to animate between frames |
| Code groups | Enable `comark: true` and place titled fences between `::code-group` and `::` to create keyboard-accessible tabs |
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
until an included source or the preparser entry changes. STX compiles the presentation shell and built-in layout templates once per process.
The TypeScript player updates only the active slide and its reveal state.

Set `codeTheme: nord` in deck headmatter to choose a first-party syntax palette.
Use `setup/code-highlighter.ts` to set the palette in code. Existing
`setup/shiki.ts` files can return a palette name through `theme`. In dev
mode, edits to setup files, their local imports, and STX layouts refresh the
preview.

Use a deck directory or an entry path without the `.md` suffix on the CLI.
Theme and addon resolution checks the deck project first, then the package
installation that launched the CLI. Both local extensions and compatible
installed packages can provide `setup/preparser.ts`. Include Markdown from
selected extensions or from a declared workspace. The side editor writes
only within the deck directory.

Put `hero.stx` in a deck, theme, or addon's `layouts/` directory and select
it with `layout: hero`. Extension modules can also register layouts with
`defineStxLayout(new URL('./layouts/hero.stx', import.meta.url))`.
Use `{!! content !!}` for the default Markdown slot and `{!! slots.right !!}`
for a named slot. STX expressions can read `title`, `slideNumber`, and
`frontmatter`. The image layouts accept `image`, `imageAlt`, and `backgroundSize`.

TypeScript edits run when served by the Bun dev command. The offline build
can run the original TypeScript and offers an editable JavaScript version.
See the [Stacks presentations skill](skills/stacks-presentations/SKILL.md)
for authoring, extension APIs, exports, and the preserved upstream skill bundle.

## Work with a deck through MCP

Run `bun src/cli.ts mcp path/to/slides.md` for a stdio MCP server. It can list
slides, inspect source and notes, update fields, and insert, reorder, or remove
slides in the deck's Markdown files.

Run `bun src/cli.ts dev path/to/slides.md --mcp` to enable the local
`/__mcp` JSON endpoint and navigation for open audience and presenter
windows. Set `mcp: false` in deck headmatter to disable the dev endpoint.

## Upstream compatibility

The port branches from [Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
Credit goes to Anthony Fu and the Slidev community. The original MIT
license is included in [licenses/Slidev-MIT.txt](licenses/Slidev-MIT.txt).

The supplemental TeX symbol mappings draw on KaTeX. Credit goes to Khan
Academy and the KaTeX contributors. Their MIT notice is included in
[licenses/KaTeX-MIT.txt](licenses/KaTeX-MIT.txt).

The seven Slidev packages are carried in `packages/`. The Bun CLI and render
pipeline are in `packages/slidev`, the STX presentation templates and player in
`packages/client`, and Markdown parsing and shared contracts in `packages/parser`
and `packages/types`.

```sh
bun packages/create-app/index.mjs my-deck
bun packages/create-theme/index.mjs my-theme
bun run --filter ts-presentation-vscode build
```

The VS Code build provides Markdown syntax, audience and presenter commands,
and a command to stop previews. It launches the project’s local Bun CLI.

The original test tree lives in `packages/slidev/test`. `bun test` runs
the adapted copied suites alongside the native regression suite. The Bun runtime
uses the published [Stacks STX package](https://github.com/stacksjs/stx) for the
shell, built-in layouts, and custom templates. Some copied components, Vite
integrations, and VS Code language tooling still need porting. See the
[compatibility guide](skills/stacks-presentations/references/compatibility.md)
for authoring support and known gaps.

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
