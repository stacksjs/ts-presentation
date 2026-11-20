# Slidev compatibility

The archived reference bundle comes from Slidev v53.1.0 and retains Anthony
Fu's MIT notice. It preserves tool usage and feature syntax for migrating
existing decks. Use the Stacks references for commands and supported features
in a new ts-presentation project.

| Upstream feature | Stacks equivalent |
| --- | --- |
| Markdown, frontmatter, slide includes, click steps | Native Bun parser and browser player with labeled separators, fenced YAML, and source ranges |
| Preparser extensions | Async raw-line, slide, and speaker-note hooks from `setup/preparser.ts` |
| Integrated editor and live preview | Dev Markdown pane with autosave, included-file support, conflict detection, and in-place body and title refreshes |
| Scoped styles, layouts, and themes | Slide-local CSS and keyframes, TypeScript theme and addon modules, and STX built-in and custom layouts with named slots |
| Deck components | First-party STX components from the deck, theme, or addons, with props, named Markdown slots, scoped styles, and reactive client scripts |
| Iframe layouts | Full and split STX layouts with per-slide zoom, viewport sizing for enlarged slides, and design-size layout in thumbnails and print |
| Global and per-slide layers | STX layers from the deck, theme, or addons, slide context bindings, persistent matching global content, and a custom toolbar slot |
| Subpath hosting | `--base` for build and dev, history and hash navigation, direct presenter links, and deck-relative assets |
| Custom shortcuts | Browser-side `setup/shortcuts.ts` with named defaults, string key combinations, repeat control, and navigation actions |
| Monaco editor and runner | Local editor and timed browser-worker runner. Bun compiles TypeScript edits in dev and can save opted-in snippets |
| Snippets, line highlights, Magic Move | Local file and region imports, numbered click highlights, native token animations |
| Syntax highlighting themes | `codeTheme` or a local `setup/code-highlighter.ts` selects a first-party palette |
| Code groups and copying | Comark code tabs, synchronized presenter selection, source and live editor copying |
| KaTeX | Native MathML with AMS binary and relation symbols, chemistry, ruled and compact arrays, commutative diagrams, sized and paired delimiters, prime and Unicode scripts, contextual spacing for explicit TeX atom classes and AMS operators, operator limits, modular and negated relations, mixed text and math, scoped font sizing, colored and raised boxes, phase and actuarial notation, zero-width overlaps, numbered alignment rows, scoped macros and lookahead, infix and generalized fractions, and click highlighting |
| mhchem notation | Native MathML hydrate dots, isotopes, charges, oxidation states, labelled reaction arrows, embedded TeX, scientific quantities, and unit fractions |
| Extensible arrows | Label-sized shafts for TeX, chemistry, and horizontal commutative diagram arrows, including distinct forward- and reverse-biased equilibria |
| AMS commutative diagrams | Centered vertical arrows with side labels, vertical parallel lines, extensible horizontal arrows, and row-local macros |
| Macro parameters and operator wrappers | Delimited and nested TeX parameters, inherited binary and relation spacing in bold symbols and stacked labels, and sans-serif italic math |
| KaTeX trust option | Opt-in links, URL labels, formula images, and HTML attributes through the KaTeX-shaped boolean or callback |
| KaTeX display options | Formatted `\tag` and `\tag*` labels, `leqno` for left-side equation tags, and `fleqn` for flush-left display formulas |
| KaTeX line breaks | Standalone `\\` and `\newline` in math and text, optional row spacing, and `strict` handling for standalone display breaks |
| KaTeX strict diagnostics | End-of-formula comments, HTML extensions, text accents and strikeout in math, spacing units and modes, and overflowed array columns |
| KaTeX accents and annotations | Stacked overbracket and underbracket labels, scalable line segments, text-mode underbars, circled text, and macro-expanded accent arguments |
| KaTeX conditional macros | Mode-aware `\TextOrMath`, starred forms, token lookahead, and branch expansion in formulas, text, and `\edef` |
| KaTeX macro and color settings | Deck-scoped `globalGroup`, per-formula `maxExpand` including eager definitions, and two-argument `\color` via `colorIsTextColor` |
| KaTeX sizing settings | `maxSize` for explicit dimensions and `minRuleThickness` for fraction bars, array rules, box borders, and overlines or underlines |
| PowerPoint export | Image slides or editable text and boxes with separate artwork |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, sequence, state, class, ER, pie, timeline, journey, Gantt, Git history, XY charts, and Sankey diagrams |
| Draggable elements | Inline directives, drag and arrow components, frontmatter positions, scaled editing, and local Markdown saves |
| Imported Slidev diagrams | Compatibility fences translate the supported syntax to `ts-charts` input |
| XY charts | Native YAML and imported `xychart` fences render bar and line series with category or numeric axes, orientation, legends, labels, and palette overrides |
| Sankey diagrams | Weighted links from native YAML and imported CSV fences, with four alignments, gradient or solid links, and configurable node colors and labels |
| Gantt styles and dates | Case-insensitive directives, task status palettes, partial dates and fractional seconds, calendar-aligned UTC ticks, zero-duration fallback for invalid ends, and whole-day exclusions that preserve gaps between dependent tasks through `ts-charts` |
| GitGraph | Named Mermaid palettes and color overrides, commit message and operation tooltips, and custom symbols on commits and merges |
| PlantUML sequence diagrams | Local `ts-charts` rendering for messages, participants, notes, and groups |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Reveal scheduling | Absolute and relative steps, hide ranges, grouped and nested lists, CSS presets, and switch slots |
| Navigation context | Slide-local metadata, route aliases, reveal bounds, nested outlines, slide titles and counters, and native links to slides and reveal steps |
| Conditional slots | `RenderWhen` for slide, presenter, next-frame preview, overview, print exports, and viewport visibility. `LightOrDark` for fixed or system appearance |
| Entry and live notes pages | STX view selector and a read-only speaker notes view that follows slide position, reveal steps, and timer across tabs in the same browser profile |
| Quick overview and overview page | Rendered thumbnails, keyboard navigation, standalone reveal sliders, and read-only speaker notes |
| Drawing and recording | Native SVG ink, mouse and stylus input, same-browser sync, SVG persistence, drawing options, and screen capture |

Vue component APIs, scoped slot bindings in Markdown, Vite integrations,
Monaco IntelliSense, Shiki transformers, VS Code language tooling, other
PlantUML grammars, and the full KaTeX and Mermaid grammars still need porting. Refer to the [original Slidev skill](slidev-source/skills/slidev/SKILL.md)
for upstream deck syntax.
