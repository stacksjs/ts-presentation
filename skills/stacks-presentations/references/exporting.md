# Export and verify

Run from the toolkit checkout or use the deck project's equivalent scripts.

```sh
bun src/cli.ts build path/to/slides.md --out path/to/dist
bun src/cli.ts export path/to/slides.md --format pdf --out deck.pdf
bun src/cli.ts export path/to/slides.md --format png --range 2-4 --out frames
bun src/cli.ts export path/to/slides.md --format pptx --out deck.pptx
```

Exports use an installed Chrome or Chromium. Set `CHROME_BIN` or pass
`--executable-path` if discovery cannot find it. PNG and PPTX accept
`--scale 1`, `2`, or `3` and a slide selection such as `1,3-5`.

PowerPoint preserves the slide appearance as images, attaches speaker notes
as editable text, and adds standard web hyperlink regions. It produces one
frame per reveal by default. Pass `--without-clicks` for one frame per slide.
Use `--with-clicks` for progressive PNG frames. The browser build keeps live
code and interactive components available.

Inspect exported slides at presentation size. Check math, fonts, notes,
number of steps, and intended links. If an Office-compatible viewer is
available, open the actual PowerPoint file and inspect its slide count.
