# Slidev compatibility

The archived reference bundle comes from Slidev v53.1.0 and retains Anthony
Fu's MIT notice. It preserves tool usage and feature syntax for migrating
existing decks. Use the Stacks references for commands and supported features
in a new ts-presentation project.

| Upstream feature | Stacks equivalent |
| --- | --- |
| Markdown, frontmatter, slide includes, click steps | Native Bun parser and browser player with labeled separators, fenced YAML, and source ranges |
| Preparser extensions | Async raw-line, slide, and speaker-note hooks from `setup/preparser.ts` |
| Markdown transformers | Async `setup/transformers.ts` hooks for slide Markdown and fenced code, including fences nested in lists and block quotes. Hooks support stable edit offsets between commits, native highlighting, and STX rendering for returned components |
| Integrated editor and live preview | Dev Markdown pane with autosave, included-file support, conflict detection, and in-place body and title refreshes |
| Scoped styles, layouts, and themes | Slide-local CSS and keyframes, TypeScript theme and addon modules, and STX built-in and custom layouts with named slots |
| Deck components | First-party STX components from the deck, theme, or addons, with props, named Markdown slots, scoped text interpolation, scoped styles, and reactive client scripts |
| Iframe layouts | Full and split STX layouts with per-slide zoom, viewport sizing for enlarged slides, and design-size layout in thumbnails and print |
| Global and per-slide layers | STX layers from the deck, theme, or addons, slide context bindings, persistent matching global content, and a custom toolbar slot |
| Subpath hosting | `--base` for build and dev, history and hash navigation, direct presenter links, and deck-relative assets |
| Custom pages | `setup/routes.ts` registers fixed paths for interactive STX pages in dev and static builds. Pages use document navigation |
| Custom shortcuts | Browser-side `setup/shortcuts.ts` with named defaults, string key combinations, repeat control, and navigation actions |
| Context menu | Browser-side `setup/context-menu.ts` with named actions, slide and presenter context, keyboard operation, and mode-specific frontmatter |
| Monaco editor and runner | Local editor and timed browser-worker runner. Bun compiles TypeScript edits in dev and can save opted-in snippets |
| Runner imports | Bun bundles local JavaScript, TypeScript, and JSON imports from authored examples. Dev edits can reuse those paths or list additional local modules in `monacoRunAdditionalDeps` |
| Custom code runners | Browser-side `setup/code-runners.ts` for decks, themes, and addons, with fence options, chained runners, cancellation, and text, HTML, or DOM results |
| Runner timing | Visibility-scoped autorun, one-time and manual modes, debounced edits, and `showOutputAt` reveal scheduling |
| Monaco diff editor | Side-by-side line comparison for `{monaco-diff}` and `{live-diff}`, with an editable modified version, reset, line numbers, and printable markup |
| Snippets, line highlights, Magic Move | Local file and region imports, numbered click highlights, native token animations |
| Syntax highlighting themes | `codeTheme` or a local `setup/code-highlighter.ts` selects a first-party palette |
| Code groups and copying | Comark code tabs, synchronized presenter selection, source and live editor copying |
| KaTeX | Native MathML with AMS binary and relation symbols, chemistry, ruled and compact arrays, commutative diagrams, sized and paired delimiters, prime and Unicode scripts, contextual spacing for explicit TeX atom classes and AMS operators, operator limits, modular and negated relations, mixed text and math, scoped font sizing, colored and raised boxes, phase and actuarial notation, zero-width overlaps, numbered alignment rows, scoped macros and lookahead, infix and generalized fractions, and click highlighting |
| mhchem notation | Native MathML hydrate dots, isotopes, charges, oxidation states, labelled reaction arrows, embedded TeX, scientific quantities, and unit fractions |
| Extensible arrows | Label-sized shafts for TeX, chemistry, and horizontal commutative diagram arrows, including distinct forward- and reverse-biased equilibria |
| AMS commutative diagrams | Centered vertical arrows with side labels, vertical parallel lines, extensible horizontal arrows, and row-local macros |
| Macro parameters and operator wrappers | Delimited and nested TeX parameters, inherited binary and relation spacing in bold symbols and stacked labels, and sans-serif italic math |
| Mathtools relations and TeX fonts | Colon relation aliases and Unicode forms, scoped legacy font declarations, upright and italic Greek variants, named spacing, and nonbreaking inline spaces |
| KaTeX trust option | Opt-in links, URL labels, formula images, and HTML attributes through the KaTeX-shaped boolean or callback |
| KaTeX display options | Formatted `\tag` and `\tag*` labels, `leqno` for left-side equation tags, and `fleqn` for flush-left display formulas |
| AMS equation numbering | Automatic labels in rendered slide order, tags and suppression inside nested tables, and numbers preserved in range exports |
| AMS alignment and arrays | Paired operator spacing, equal alignment points across rows, explicit `alignat` counts, stable tag columns on short rows, starred matrix column alignment, and scoped row rules |
| KaTeX line breaks | Inline wrapping after outer binary operators and relations, `\allowbreak` and `\nobreak` controls, standalone `\\` and `\newline` in math and text, optional row spacing, and `strict` handling for standalone display breaks |
| KaTeX strict diagnostics | Unicode text and unrecognized characters, end-of-formula comments, HTML extensions, text accents and strikeout in math, spacing units and modes, and overflowed array columns |
| Unicode math and text | Combining accents attached to math atoms and scripts, text-mode shaping of accented words, Unicode script and symbol validation, and original tokens in strict callbacks |
| KaTeX accents and annotations | Stacked overbracket and underbracket labels, scalable line segments, text-mode underbars, circled text, and macro-expanded accent arguments |
| KaTeX conditional macros | Mode-aware `\TextOrMath`, starred forms, token lookahead, and branch expansion in formulas, text, and `\edef` |
| KaTeX legacy macros | Khan Academy color names and shades, literal token assignment with `\let`, multi-digit macro arity, and `\message` or `\errmessage` output during expansion |
| KaTeX parser diagnostics | Macro declaration and scope checks, undefined commands in eager expansion, unexpected delimiters, text-mode command checks, and validation of expanded colors |
| KaTeX macro and color settings | Deck-scoped `globalGroup`, per-formula `maxExpand` including eager definitions, and two-argument `\color` via `colorIsTextColor` |
| KaTeX sizing settings | `maxSize` for explicit dimensions and `minRuleThickness` for fraction bars, array rules, box borders, and overlines or underlines |
| KaTeX text-mode boxes | Phantom space, selective height and depth removal, raised boxes and rules, and escaped verbatim text inside `\text{…}` |
| PowerPoint export | Image slides or editable text and boxes, including supported linear-gradient fills, with separate artwork |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, sequence, state, class, ER, pie, timeline, journey, Gantt, Git history, XY charts, and Sankey diagrams |
| Draggable elements | Inline directives, drag and arrow components, frontmatter positions, scaled editing, and local Markdown saves |
| Imported Slidev diagrams | Compatibility fences translate the supported syntax to `ts-charts` input |
| XY charts | Native YAML and imported `xychart` fences render bar and line series with category or numeric axes, orientation, legends, labels, and palette overrides |
| Quadrant charts | Native YAML and imported `quadrantChart` fences render labeled quadrants, normalized points, point style classes and overrides, named themes, and accessible descriptions |
| Sankey diagrams | Weighted links from native YAML and imported CSV fences, with four alignments, gradient or solid links, and configurable node colors and labels |
| Gantt styles and dates | Task labels in or beside bars, task status palettes, multiline section headings, case-insensitive directives, fractional times, calendar durations and UTC ticks, short ISO start dates, and fixed SVG dimensions via `useMaxWidth: false` |
| Gantt markers and exclusions | Repeated markers with the same ID, time, and label share one visible marker. Invalid ends warn and keep the task at its start. Whole-day exclusions ignore unmatched calendar tokens |
| Gantt themes | Named Mermaid palettes set the SVG background, section bands, grid, task states, and labels. Explicit theme variables override the selected palette |
| Gantt dependencies | Forward references across sections, latest `after` and earliest `until` matches, and warnings with a UTC reference-day fallback when every referenced task is missing |
| GitGraph | Named Mermaid palettes, diagram padding, branch-only graphs, commit and operation tooltips, and custom symbols. Repeated commit IDs warn, preserve each node, and resolve later references to the latest commit |
| PlantUML sequence diagrams | Local `ts-charts` rendering for messages, participants, notes, and groups |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Reveal scheduling | Absolute and relative steps, hide ranges, grouped and nested lists, CSS presets, and switch slots |
| Navigation context | Slide-local metadata, route aliases, reveal bounds, nested outlines, slide titles and counters, and native links to slides and reveal steps |
| Conditional slots | `RenderWhen` for slide, presenter, next-frame preview, overview, print exports, and viewport visibility. `LightOrDark` for fixed or system appearance |
| Text fitting and scaling | `AutoFitText` fits literal text or Markdown slots within min and max font sizes. `Transform` scales a slot from a configurable origin. Uniform positive scales preserve editable text in PowerPoint |
| Entry and live notes pages | STX view selector and a read-only speaker notes view that follows slide position, reveal steps, and timer across tabs in the same browser profile |
| Quick overview and overview page | Rendered thumbnails, keyboard navigation, standalone reveal sliders, and read-only speaker notes |
| Drawing and recording | Native SVG ink, mouse and stylus input, same-browser sync, SVG persistence, drawing options, and screen capture |

Vue-specific component APIs, scoped slot bindings in HTML attributes, Vite integrations,
Monaco IntelliSense, Shiki transformers, VS Code language tooling, other
PlantUML grammars, and the full KaTeX and Mermaid grammars still need porting. Refer to the [original Slidev skill](slidev-source/skills/slidev/SKILL.md)
for upstream deck syntax.
