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
presenter window with notes, a next-slide cue and a timer. **O** opens
the overview, **F** toggles fullscreen, **D** opens the drawing layer
in the active window, and **C** clears a drawing. Where the host browser
supports screen capture, **Record** saves the chosen screen or window
as a video.

`bun run build` emits an offline browser deck. `bun run export` creates a
PDF with Chrome or Chromium. Set `CHROME_BIN` or pass `--executable-path`
if the executable is installed elsewhere.

```sh
bun src/cli.ts export examples/demo/slides.md --format pptx --out output/demo.pptx
bun src/cli.ts export examples/demo/slides.md --format png --range 1,3-5 --out output/frames
```

PowerPoint uses slide images with editable speaker notes and clickable web
links. It includes each reveal by default. Pass `--without-clicks` for one
frame per slide, or `--with-clicks` to include reveals in a PNG export.

## Write a deck

Run `bun src/cli.ts dev path/to/slides.md`. Put a blank line after
`---` for a slide break, or add YAML frontmatter ending with another
`---`. Put media and fonts in an optional `public/` directory beside
the deck and style slides with an optional `style.css`.

| feature | syntax |
| --- | --- |
| Speaker notes | Trailing HTML comment, with `[click]` on its own line for notes revealed on the next click |
| Progressive reveals | `v-click`, `v-click="3"`, `v-after`, or a `<v-clicks>` list |
| Layouts | `layout: default`, `center`, `cover`, `intro`, `section`, `image-left`, or `image-right`. Set `image` for an image layout |
| Local slides and ranges | `src: ./chapter.md` or `src: ./chapter.md#2-4`, relative to the including file |
| Navigation | `routeAlias: review`, then links such as `#review` |
| Per-slide options | `class`, `hide`, `disabled`, and `transition: fade`, `slide-left`, or `slide-up` |
| Images and component markup | Trusted HTML, with optional `data-zoom` on an image |
| Diagrams | Mermaid `flowchart` and `graph` fences for nodes, basic shapes, arrows and labels |
| Math | `$...$` inline or `$$...$$` on separate lines, rendered as MathML |
| Live code | A `js` or `ts` fence followed by `{live-run}` or `{monaco-run}`. Use `{live}` or `{monaco}` for an editor |
| Themes and addons | Set `theme: paper` or `theme: serif`, or load trusted local modules through `theme` and `addons` |
| Canvas size | Set `canvasWidth: 800` and `aspectRatio: 4/3` in deck frontmatter for an 800 × 600 canvas |

The dev server shares an in-flight compilation and reuses rendered HTML
until an included source changes. The browser renders local decks
without a framework, and slide navigation updates only the active slide.

TypeScript edits run when served by the Bun dev command. The offline build
can run the original TypeScript and offers an editable JavaScript version.
See the [Stacks presentations skill](skills/stacks-presentations/SKILL.md)
for authoring, extension APIs, exports, and the preserved upstream skill bundle.

## Upstream compatibility

The port branches from [Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
Credit goes to Anthony Fu and the Slidev community. The original MIT
license is included in [licenses/Slidev-MIT.txt](licenses/Slidev-MIT.txt).

Open compatibility work includes Vue components and extensions, Monaco tooling,
Shiki transformers, the full TeX and Mermaid grammars, PlantUML, remote slide
control, and export with editable PowerPoint slide content. See the
[compatibility guide](skills/stacks-presentations/references/compatibility.md).

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
