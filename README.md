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
PDF with Chrome or Chromium. Set `CHROME_BIN` if the executable is
installed elsewhere. Use `--format png` on the CLI to export slide images.

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

The dev server shares an in-flight compilation and reuses rendered HTML
until an included source changes. The browser renders local decks
without a framework, and slide navigation updates only the active slide.

## Upstream compatibility

The port branches from [Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
Credit goes to Anthony Fu and the Slidev community. The original MIT
license is included in [licenses/Slidev-MIT.txt](licenses/Slidev-MIT.txt).

The Bun player currently supports the authoring and presentation features
above. Upstream Vue components, themes and addons require a port.
Monaco, code runners, Shiki transformers, KaTeX, full Mermaid and PlantUML
support, remote slide control, and PowerPoint export also remain upstream-only.

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
