# ts-presentation

A Bun-first fork of [Slidev](https://sli.dev/) with a TypeScript player
and CLI. The active engine uses Bun’s Markdown, YAML, bundler and HTTP
server, plus Stacks’ syntax highlighter. The example deck is generic.

## Run the example

Requires Bun 1.4 or newer.

```sh
bun install --frozen-lockfile
bun run dev
```

Press **P** for a synchronized presenter window or **F** for fullscreen.
Use the arrow keys or slide picker to navigate. `bun run build` emits
an offline browser deck. `bun run export` creates a PDF with Chrome or
Chromium. Set `CHROME_BIN` if the executable is installed elsewhere.

## Start a deck

Run `bun src/cli.ts dev path/to/slides.md`. Put a blank line after
`---` for a slide break, or add YAML frontmatter ending with another
`---`. Use a trailing HTML comment for speaker notes. Add optional
`style.css` and `public/` next to the deck and refer to assets with
relative URLs.

## Upstream

The port branches from [Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
Credit goes to Anthony Fu and the Slidev community. The original MIT
license is included in [licenses/Slidev-MIT.txt](licenses/Slidev-MIT.txt).
This port currently implements a subset of Slidev’s feature set. Existing
decks that use upstream Vue components and themes need adaptation.

Tooling conventions come from [ts-starter](https://github.com/stacksjs/ts-starter).
