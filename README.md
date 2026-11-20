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
Open `/entry` to choose a view. `/notes` follows the current slide, reveals,
and timer across tabs in the same browser profile. In a built deck, open
`index.html?entry=1` or `index.html?notes=1` directly.

Use **Start**, **Pause**, and **Reset timer** in presenter view. The timer
starts when you press **Start** and keeps its state across presenter and
notes tabs. Set `duration` in deck frontmatter to choose a time budget
(default `30min`). Set `timer: countdown` to show time remaining and
overtime. The default `stopwatch` mode shows elapsed time.

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
bun src/cli.ts export examples/demo/slides.md --format md --out output/handout.md
bun src/cli.ts export-notes examples/demo/slides.md --out output/notes.pdf
bun src/cli.ts format examples/demo/slides.md
```

Markdown exports keep speaker notes and link to PNGs in a sibling
`<name>-images` directory. Notes PDFs include slide titles, numbers, and all
note reveal steps for slides with notes. Pass `--range` to select slides.
Pass multiple entries to `export` or `export-notes` to export a batch, for
example `ts-presentation export review.md training.md --out reports`. Each
deck uses its own export settings. Relative filenames resolve beside each
deck by default or inside the shared directory passed to `--out`. Assign
distinct `exportFilename` values if two decks would produce the same path.

The formatter normalizes slide boundaries and note blocks in the entry file
while preserving the Markdown body and YAML.

PowerPoint uses slide images with editable speaker notes and clickable web
and slide links. It includes each reveal by default. Pass `--without-clicks` for one
frame per slide, or `--with-clicks` to include reveals in a PNG export.

`pptx-editable` rebuilds text, backgrounds, and boxes as PowerPoint
objects, including supported CSS linear-gradient fills. MathML formulas with
fractions, roots, scripts, matrices, operator limits, accents, and braces can
become Office Math objects with picture alternatives. Supported AMS alignment
and gather environments export as equation arrays with separate editable tags
and per-row click dimming. Custom row gaps use separately positioned editable
cells. Single equation tags also support bold text and embedded math.
Other formulas, diagrams, and browser artwork are embedded as pictures.
Eligible deck-local PNG and JPEG images retain their source bytes and
slide-edge crops. Browser capture preserves effects like image opacity and
rotation. The exporter reports slides that require a
full-frame image. It references fonts by name, so recipients may see font
substitutions.

Set `exportFilename` and `export` in the deck headmatter for repeatable exports.
The `export` mapping accepts `format`, `range`, and `withClicks`.
PNG and PowerPoint can also set `scale`. CLI options override the deck defaults. With PDF
`--with-clicks`, each selected reveal becomes a page with selectable text.
Use `--omit-background` or `export.omitBackground: true` to omit the built-in
canvas fill in PNGs, Markdown handout images, and PowerPoint exports.
Custom CSS backgrounds and artwork retain their colors and opacity.

Use `--with-toc` or set `export.withToc: true` to add nested PDF bookmarks
from slide titles. Bookmarks skip hidden sections and untitled slides, honor
the export range, and open the last exported reveal of each slide.

Use `--dark` or `--light` to set the color scheme for exported slides and
downloadable PDFs. Use `--wait` to delay each frame and `--timeout` to set the
overall capture deadline, both in milliseconds. Set `--timeout 0` to disable
the deadline. Exports wait for the page to load by default. Choose
`--wait-until domcontentloaded`, `networkidle`, or `none` to select a different
browser milestone. Add `data-waitfor=".finished"` to a slide element to wait
for a visible matching descendant before capturing its frame. Use
`export.dark`, `export.wait`, `export.timeout`, and `export.waitUntil` in
headmatter to save these settings with the deck.

Use `build --download` or set `download: true` in deck headmatter to bundle
a PDF and show a **Download PDF** link in the built player. The default file
is `slidev-exported.pdf`. Use `exportFilename` for a filename or nested path
inside the build directory. The generated PDF honors the configured slide
range, reveal, and bookmark settings. Set `download` to a path in `public/` or an HTTP
or HTTPS URL to link to an existing PDF.

## Host under a subpath

```sh
bun src/cli.ts build slides.md --base /talks/demo/ --router-mode hash
```

Mount the build output at `/talks/demo/`. Use the same `--base` with
`dev` to preview it locally. Choose `hash` for static hosts, or
`history` for clean slide URLs when the host can serve `index.html`
for slide routes. Set `routerMode` in the deck headmatter or override it
with `--router-mode`. Deck resources such as `/image.png` resolve under
the configured base.

Use `build --without-notes` to publish an audience deck with the speaker-note
text and notes links removed from the static player. The build keeps the
authored reveal counts and supports the same option alongside `--download`.

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
| Markdown transformers | `setup/transformers.ts` rewrites individual slides and registers custom fenced-code renderers |
| Slide editor | Edit the Markdown of the current slide and preview file changes in dev |
| Navigation | `routeAlias: review`, then links such as `#review` or `#review/2`. Use `clicksStart` and `clicks` to set reveal bounds |
| Keyboard shortcuts | Press `g` to find a slide by number, title, or route alias. Use `setup/shortcuts.ts` to change the default bindings in dev and static builds |
| Context menu | `setup/context-menu.ts` customizes right-click and keyboard actions on audience and presenter slides |
| Custom pages | `setup/routes.ts` adds interactive STX pages at fixed paths in dev and static builds |
| Outline and counters | `<Toc />` links to slides grouped by heading depth. Use `<TitleRenderer no="2" />` for a slide title, or `<SlideCurrentNo />` and `<SlidesTotal />` for page numbers |
| Slide overview | Press **O** for a thumbnail grid and jump to any slide. Open `/overview` on the dev server or add `?overview=1` to a built deck URL to review speaker notes and reveal steps |
| Conditional content | `<RenderWhen context="presenter">` selects content by view, with an optional `#fallback` slot. `<LightOrDark>` selects a `#light` or `#dark` slot. Set `colorSchema: auto` to follow system appearance |
| Text fitting and scaling | `<AutoFitText :min="20" :max="72" modelValue="Heading" />` fits text to its width. `<Transform :scale="0.5">` scales its content with a configurable origin |
| Per-slide options | `class`, `hide`, `disabled`, and `transition: fade`, `slide-left`, or `slide-up` |
| Images and component markup | Trusted HTML, with optional `data-zoom` on an image |
| Post embeds | `<Tweet id="…" />` or `<Tweet url="…" />` loads the X widget in a sandboxed iframe |
| Video | `<SlidevVideo v-click controls>` accepts native video sources, playback and reset options, and a print poster or seek time. `<Youtube id="…" />` embeds playback in the deck and links to YouTube in exports |
| Fonts | Set `fonts.sans`, `fonts.serif`, or `fonts.mono`. Choose `fonts.provider` as `google`, `coollabs`, or `none` |
| First-party diagrams | YAML in a `charts` fence. `ts-charts` renders flowcharts, sequence and state diagrams, class and entity relationships, pie charts, XY bar and line charts, Sankey diagrams, Gantt schedules, Git histories, timelines, and user journeys |
| Imported diagrams | Slidev diagram fences are translated to structured data and rendered by the same `ts-charts` functions |
| PlantUML sequence diagrams | `plantuml` fences render messages, participants, notes, and groups locally through `ts-charts` |
| Markdown alerts | Start a blockquote with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` |
| Math | Native MathML with scoped macros, styled fractions, formatted equation tags, ruled arrays, commutative diagrams, stacked subscripts, mixed text and math, click highlighting, and chemistry notation. Set `math.fleqn` for flush-left displays and `math.leqno` for left-side tags |
| Math links and images | `\href`, `\url`, `\includegraphics`, and `\html*` attributes honor `math.trust` in deck frontmatter or the `trust` callback in `setup/katex.ts` |
| Code walkthroughs | `ts [build.ts] {1\|2-3\|all}{lines:true}` for titles and click highlights, or `md magic-move` around nested fences to animate between frames |
| Code groups | Enable `comark: true` and place titled fences between `::code-group` and `::` to create keyboard-accessible tabs |
| Source snippets | `<<< @/snippets/build.ts#example` for a named region. Use `{monaco-write}` with a whole JavaScript or TypeScript file to allow saving from the local dev editor |
| Live code | Add `{live-run}` or `{monaco-run}` to a fence for a built-in or custom runner. Use `{live}` or `{monaco}` for editing |
| Code diffs | Add `{monaco-diff}` or `{live-diff}` to a backtick fence and separate the original and modified code with a line containing `~~~`. Edit the modified version in the player or use `{readonly:true}` for a fixed comparison |
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
Use `setup/code-highlighter.ts` or `setup/shiki.ts` to configure a palette
and transformer hooks. Hooks can change source, tokens, line classes, or
the generated HTML of a static code block.

```ts
import { defineCodeHighlightSetup } from 'ts-presentation'

export default defineCodeHighlightSetup(() => ({
  theme: 'nord',
  transformers: [{
    line(node, number) {
      if (number === 2) this.addClassToHast(node, 'review-line')
    },
  }],
}))
```

Hooks from the theme, addons, and deck run in that order within each
`enforce` tier. `this.options.meta.__raw` contains the fence text after its
language. Add CSS for authored classes in the deck stylesheet. In dev
mode, edits to setup files, their local imports, and STX layouts refresh
the preview.

Import `transformerNotationDiff`, `transformerNotationFocus`,
`transformerNotationHighlight`, `transformerNotationErrorLevel` and
`transformerNotationWordHighlight` from `ts-presentation` to render
`[!code …]` comments. For example, `// [!code focus:2]` on its own line
focuses the next two rows. Inline annotations start at the current row.
Use `transformerMetaHighlight` for ranges in fence metadata and
`transformerMetaWordHighlight` for `/word/` markers.

Register a custom TextMate grammar in either highlighter setup through
`langs`. An array accepts grammar objects with names and aliases. A map
can load a local grammar on demand or register an alias for a bundled or
custom language.

```ts
import { defineShikiSetup } from 'ts-presentation'

export default defineShikiSetup(() => ({
  langs: {
    pipeline: () => import('./pipeline.tmLanguage.json'),
    pipe: 'pipeline',
  },
}))
```

Use `pipeline` or `pipe` as the fence language. Grammar patterns use
JavaScript regular expressions. To load an embedded scope on demand, use
its TextMate scope name as the map key.

Use a deck directory or an entry path without the `.md` suffix on the CLI.
Theme and addon resolution checks the deck project first, then the package
installation that launched the CLI. Both local extensions and compatible
installed packages can provide `setup/preparser.ts`. Include Markdown from
selected extensions or from a declared workspace. The side editor writes
only within the deck directory.

Add `setup/shortcuts.ts` to a deck, theme, or addon to customize keyboard
navigation. The deck runs its setup after the theme and addons.

```ts
import { defineShortcutsSetup } from 'ts-presentation'

export default defineShortcutsSetup((nav, base) => [
  ...base,
  { key: 'Enter', fn: nav.next, autoRepeat: true },
  { key: 'Backspace', fn: nav.prev },
  { key: 'Alt+g', fn: () => nav.go('review') },
])
```

Use a string or an array of strings for `key`. For a shared key combination,
the last shortcut in the returned list wins. Remove an existing shortcut by
filtering the list by its `name`.

Put `hero.stx` in a deck, theme, or addon's `layouts/` directory and select
it with `layout: hero`. Extension modules can also register layouts with
`defineStxLayout(new URL('./layouts/hero.stx', import.meta.url))`.
Use `{!! content !!}` for the default Markdown slot and `{!! slots.right !!}`
for a named slot. STX expressions can read `title`, `slideNumber`, and
`frontmatter`. The image layouts accept `image`, `imageAlt`, and `backgroundSize`.

TypeScript edits run when served by the Bun dev command. The offline build
runs the original TypeScript and offers an editable JavaScript version of
self-contained examples.
`{monaco-run}` starts when its example becomes visible in the audience or
presenter view and reruns after edits. Set `{autorun:false}` for manual
execution, `{autorun:'once'}` for a single automatic run, or
`{showOutputAt:'+1'}` to reveal the output on the next click. `{live-run}`
uses manual execution by default and accepts the same options.
Live editors inherit the deck's `lineNumbers` setting. Use
`{lines:true, startLine:7}` for an individual fence or set
`lineNumbers` to `'on'`, `'off'`, `'relative'`, or `'interval'`.
Set `{height:'auto'}` to grow as you type, `{height:'140px'}` for a fixed
height, or `{height:'initial'}` to size from the original code. Use
`{readonly:true}` to lock the code while keeping Run available.
Use `monaco: false` in frontmatter for static code blocks, or set it to
`dev` or `build` to enable editors in that mode.

Use `setup/transformers.ts` to migrate Slidev Markdown and codeblock hooks.

```ts
import { defineTransformersSetup } from 'ts-presentation'

export default defineTransformersSetup(() => ({
  pre: [({ s }) => { s.replaceAll('[[release]]', '**Release**') }],
  codeblocks: [async ({ info, renderHighlighted }) => {
    if (info !== 'example') return
    return `<figure class="example">${await renderHighlighted({ info: 'ts' })}</figure>`
  }],
}))
```

Each Markdown hook reads the committed input from `s.original` and edits it
with methods such as `replaceAll`, `update`, and `append`. The compiler
commits edits between hooks. Codeblock hooks receive the fence's full info
string and length, along with its source and slide context. Returning HTML or
a deck STX component handles the fence. Return `undefined` to continue to the
built-in renderers.

JavaScript and TypeScript runner examples can import local modules. Place
shared helpers under `snippets/` beside the deck. For example, this runnable
fence uses the `formatScore` export from `snippets/score.ts`.

````markdown
```ts {monaco-run}
import { formatScore } from './score'
console.log(formatScore(42))
```
````

Bun bundles the authored imports for static builds. Use the dev server to run
edits that use imports. An edit can reuse imports from the deck's authored
examples or introduce paths listed in `monacoRunAdditionalDeps` in headmatter,
such as `monacoRunAdditionalDeps: ['./score', './statistics']`. The entry paths
are relative to `snippets/`. Helpers can import other JavaScript, TypeScript,
and JSON files inside the deck directory. Runnable examples with imports use
module syntax and report output through `console.log`.

Register runners in `setup/code-runners.ts` in a deck, theme, or addon. This
example runs `csv {monaco-run}` fences in both dev and static builds.

```ts
import { defineCodeRunnersSetup } from 'ts-presentation'

export default defineCodeRunnersSetup(() => ({
  csv(source, { options }) {
    const rows = source.trim().split(/\r?\n/)
    return { text: String(options.label ?? 'Rows') + ' ' + rows.length }
  },
}))
```

Pass options in a second fence group, such as
`{runnerOptions: {label: "Entries"}}`. The runner context includes `run`
for invoking another runner, `highlight` for code formatting, and `signal`
for cancellation. Runners can return text, errors, trusted HTML, or DOM
elements. Sanitize HTML derived from editable input before returning it.

See the [Stacks presentations skill](skills/stacks-presentations/SKILL.md)
for authoring, extension APIs, exports, and the preserved upstream skill bundle.

Add `global-top.stx` or `global-bottom.stx` beside the deck for shared
layers and `layouts/slide-top.stx` or `layouts/slide-bottom.stx` for
per-slide layers. STX templates can use slide context such as
`nav.currentPage` and `nav.total`. The layers are included in exports.

Put reusable STX components in the deck, theme, or addon's `components/`
directory. Use them directly in slide Markdown, such as
`<Counter :start="1" v-click />`. Components support props, Markdown in
default and named slots, scoped text interpolation, scoped styles, and
client-side STX signals. The starter includes an interactive counter. See the
[components reference](skills/stacks-presentations/references/extensions.md#stx-components)
for examples and precedence.

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

The supplemental TeX symbol mappings, atom spacing, and trust option draw on KaTeX. Credit
goes to Khan Academy and the KaTeX contributors. Their MIT notice is included in
[licenses/KaTeX-MIT.txt](licenses/KaTeX-MIT.txt).

GitGraph theme colors come from Mermaid 12.3.0. The Mermaid MIT notice is
included in [licenses/Mermaid-MIT.txt](licenses/Mermaid-MIT.txt).

The highlight annotations follow Shiki's transformer syntax. Credit goes to
Pine Wu, Anthony Fu, and the Shiki contributors. The original MIT notice is
included in [licenses/Shiki-MIT.txt](licenses/Shiki-MIT.txt).

The seven Slidev packages are carried in `packages/`. The Bun CLI and render
pipeline are in `packages/slidev`, the STX presentation templates and player in
`packages/client`, and Markdown parsing and shared contracts in `packages/parser`
and `packages/types`.

```sh
bun packages/create-app/index.mjs my-deck
bun packages/create-theme/index.mjs my-theme
bun run --cwd packages/vscode build
```

The VS Code build provides slide outlines, slide folding, frontmatter
completions, hover help, and Markdown syntax highlighting. It launches audience
and presenter previews with the project’s local Bun CLI. See the
[extension guide](packages/vscode/README.md) for setup and deck file patterns.

Run `bun test` from the project root to discover the adapted Slidev suites
under `packages/` and the presentation regression suite under `test/`. The Bun runtime
uses the published [`@stacksjs/stx` package](https://github.com/stacksjs/stx) for the
shell, built-in layouts, and custom templates. Bun installs it from the registry.
Some copied components, Vite integrations, and advanced VS Code tooling still
need porting. See the
[compatibility guide](skills/stacks-presentations/references/compatibility.md)
for authoring support and known gaps.

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
