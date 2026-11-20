# Slidev compatibility

The archived reference bundle comes from Slidev v53.1.0 and retains Anthony
Fu's MIT notice. It preserves tool usage and feature syntax for migrating
existing decks. Use the Stacks references for commands and supported features
in a new ts-presentation project.

| Upstream feature | Stacks equivalent |
| --- | --- |
| Markdown, frontmatter, slide includes, click steps | Native Bun parser and browser player with labeled separators, fenced YAML, and source ranges |
| Source formatter | `format` writes consistent slide boundaries and speaker-note blocks while preserving Markdown bodies, YAML, and included files |
| Preparser extensions | Async raw-line, slide, and speaker-note hooks from `setup/preparser.ts` |
| Markdown transformers | Async `setup/transformers.ts` hooks for slide Markdown and fenced code, including fences nested in lists and block quotes. Hooks support stable edit offsets between commits, native highlighting, and STX rendering for returned components |
| Syntax highlighting transformers | `setup/shiki.ts` and `setup/code-highlighter.ts` run source, token, HTML tree, and post-processing hooks for static highlighted code, numbered lines, Magic Move, and static editor fallbacks |
| Custom code grammars | Static highlighting through TextMate objects and lazy loaders in `langs`, language aliases, nested repositories, and registered TextMate includes |
| Code annotations | First-party diff, focus, line and word highlights, severity levels, custom notation maps, fence metadata, and literal annotation escapes. Standalone annotations are removed before display rows are numbered |
| Integrated editor and live preview | Dev Markdown pane with autosave, included-file support, conflict detection, and in-place body and title refreshes |
| Scoped styles, layouts, and themes | Slide-local CSS and keyframes, TypeScript theme and addon modules, and STX built-in and custom layouts with named slots |
| Deck components | First-party STX components from the deck, theme, or addons, with props, scoped Markdown slots, reactive text and native HTML attribute bindings, scoped styles, and client scripts |
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
| mhchem notation | Native MathML hydrate dots, isotopes, charges, oxidation states, labelled reaction arrows, embedded TeX, and physical quantities with grouped digits, uncertainties, standalone powers, and nested unit fractions |
| Extensible arrows | Label-sized shafts for TeX, chemistry, and horizontal commutative diagram arrows, including distinct forward- and reverse-biased equilibria |
| AMS commutative diagrams | Centered vertical arrows with side labels, vertical parallel lines, extensible horizontal arrows, and row-local macros |
| Macro parameters and operator wrappers | Delimited and nested TeX parameters, inherited binary and relation spacing in bold symbols and stacked labels, and sans-serif italic math |
| Bra-ket and fraction layout | Scoped bar expansion for bra-ket notation and set builders, directional generalized fraction fences, nested unbraced fractions, and continued fraction numerator struts |
| Paired TeX delimiters | Macro-defined closing delimiters, invisible delimiters with TeX spacing, tight spacing and row-height stretch for middle delimiters under color declarations, closing-fence colors, and multiline formula bodies that honor the display break policy |
| Logical TeX relations | Expandable `\iff`, `\implies`, and `\impliedby` macros with spaced long arrows |
| Custom TeX operators and emphasis | Upright operator names with fractions, scripts, and scoped macros, style-aware limits for starred names, and nested `\emph` that alternates between italic and upright text |
| Mathtools relations and TeX fonts | Colon relation aliases and Unicode forms, scoped legacy font declarations, upright and italic Greek variants, named spacing, and nonbreaking inline spaces |
| KaTeX trust option | Opt-in links, URL labels, formula images, and HTML attributes through the KaTeX-shaped boolean or callback |
| KaTeX display options | Formatted `\tag` and `\tag*` labels, `leqno` for left-side equation tags, and `fleqn` for flush-left display formulas. Standalone `align`, `alignat`, and `gather` displays align row numbers at the margin and preserve per-row click highlights |
| AMS equation numbering | Automatic labels in rendered slide order, tags and suppression inside nested tables, and numbers preserved in range exports |
| AMS alignment and arrays | Paired operator spacing, equal alignment points across rows, explicit `alignat` counts, stable tag columns on short rows, starred matrix column alignment, scoped `\arraystretch`, and consecutive solid and dashed rules |
| KaTeX line breaks | Inline wrapping after outer binary operators and relations, `\allowbreak` and `\nobreak` controls, standalone `\\` and `\newline` in math and text, optional row spacing, and `strict` handling for standalone display breaks |
| KaTeX strict diagnostics | Unicode text and unrecognized characters, end-of-formula comments, HTML extensions, text accents and strikeout in math, spacing units and modes, and overflowed array columns |
| Unicode math and text | Combining accents attached to math atoms and scripts, text-mode shaping of accented words, Unicode script and symbol validation, and original tokens in strict callbacks |
| KaTeX accents and annotations | Stacked overbracket and underbracket labels, scalable line segments, text-mode underbars, circled text, and macro-expanded accent arguments |
| KaTeX conditional macros | Mode-aware `\TextOrMath`, starred forms, token lookahead, and branch expansion in formulas, text, and `\edef` |
| KaTeX legacy macros | Khan Academy color names and shades, literal token assignment with `\let`, multi-digit macro arity, and `\message` or `\errmessage` output during expansion |
| KaTeX math choices | `\mathchoice` selects display, text, script, and scriptscript branches with operator spacing from the enclosing row |
| KaTeX parser diagnostics | Macro declaration and scope checks, undefined commands in eager expansion, unexpected delimiters, text-mode command checks, and validation of expanded colors |
| KaTeX macro and color settings | Deck-scoped `globalGroup`, per-formula `maxExpand` including eager definitions, and two-argument `\color` via `colorIsTextColor` |
| KaTeX sizing settings | `maxSize` for explicit dimensions and `minRuleThickness` for fraction bars, array rules, box borders, and overlines or underlines |
| KaTeX text-mode boxes | Phantom space, selective height and depth removal, shifted line dimensions for `\raisebox`, text-style box contents in scripts, and escaped verbatim text inside `\text{…}` |
| KaTeX math-mode boxes | `\phantom` retains atom spacing. `\hphantom` preserves signed kerns in math and text. Shifted `\rule` reserves space above and below the baseline, including zero-width struts |
| KaTeX enclosures | `\boxed` expands in math, text, and macro definitions with display-style contents. Framed and colored boxes use TeX padding. Diagonal cancellation strokes preserve the subject's layout and use a fixed thickness for each font size |
| PowerPoint export | Image slides or editable text, boxes, and Office Math equations with fractions, roots, scripts, matrices, operator limits, accents, and braces. Supported AMS displays export as equation arrays with separate tags and click-step opacity, or as positioned cells when row spacing varies. Single tags support bold text and inline math. Supported linear-gradient fills remain editable. Native equations carry picture alternatives, and more complex artwork is stored as separate images |
| Notes and Markdown export | `export-notes` prints notes with slide titles and numbers. `export --format md` links selected slide images and keeps raw speaker-note Markdown |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, sequence, state, class, ER, pie, timeline, journey, Gantt, Git history, XY charts, and Sankey diagrams |
| Draggable elements | Inline directives, drag and arrow components, frontmatter positions, scaled editing, and local Markdown saves |
| Imported Slidev diagrams | Compatibility fences translate the supported syntax to `ts-charts` input |
| Diagram theme CSS | `themeCSS` styles apply to the individual diagram, including nested media rules and local animations. Gantt task IDs and indexed selectors for sections, task states, commits, branches, and edges map to native SVG elements |
| XY charts | Native YAML and imported `xychart` fences render bar and line series with category or numeric axes, orientation, legends, labels, and palette overrides |
| Quadrant charts | Native YAML and imported `quadrantChart` fences render labeled quadrants, normalized points, point style classes and overrides, named themes, and accessible descriptions |
| Sankey diagrams | Weighted links from native YAML and imported CSV fences, with four alignments, gradient or solid links, and configurable node colors and labels |
| Gantt styles and dates | Full task labels wrap inside the chart, and compact rows account for both bars and labels. Supports literal leading hashes and semicolons in task names, task status palettes, multiline section headings, indented YAML options with multiline scalars, case-insensitive directives, fractional times, calendar durations and UTC ticks, short ISO start dates, and fixed SVG dimensions via `useMaxWidth: false` |
| Gantt markers and exclusions | Repeated markers with the same ID, time, and label share one visible marker. Task starts accept a validated ISO fallback, while invalid ends warn and keep the task at its start. Whole-day adjustments honor exact formatted inclusion and exclusion tokens, keep ISO deadlines fixed, and adjust custom-formatted dates and `until` endpoints. Consecutive excluded days share a band on schedules shorter than six calendar years. Style the band with `.exclude-range` |
| Gantt themes | Named Mermaid palettes set the SVG background, section bands, grid, task states, and labels. Explicit theme variables override the selected palette |
| Gantt dependencies | Forward references across sections, latest `after` and earliest `until` matches, and warnings with a UTC reference-day fallback when every referenced task is missing |
| GitGraph | Named Mermaid palettes, diagram padding, fixed SVG dimensions via `useMaxWidth: false`, branch-only graphs, complete branch and commit labels, and separate tag shapes with a shared width per commit in every orientation. Supports scoped `.tag-hole` CSS, commit and operation tooltips, custom symbols, cherry-pick source parents, and rounded connectors routed around intermediate commit dots. Repeated commit IDs warn, preserve each node, and resolve later references to the latest commit |
| PlantUML sequence diagrams | Local `ts-charts` rendering for messages, participants, notes, and groups |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Reveal scheduling | Absolute and relative steps, hide ranges, grouped and nested lists, CSS presets, and switch slots |
| Navigation context | Slide-local metadata, route aliases, reveal bounds, nested outlines, slide titles and counters, and native links to slides and reveal steps |
| Conditional slots | `RenderWhen` for slide, presenter, next-frame preview, overview, print exports, and viewport visibility. `LightOrDark` for fixed or system appearance |
| Text fitting and scaling | `AutoFitText` fits literal text or Markdown slots within min and max font sizes. `Transform` scales a slot from a configurable origin. Uniform positive scales preserve editable text in PowerPoint |
| Entry and live notes pages | STX view selector and a read-only speaker notes view that follows slide position, reveal steps, and timer across tabs in the same browser profile |
| Quick overview and overview page | Rendered thumbnails, keyboard navigation, standalone reveal sliders, and read-only speaker notes |
| Drawing and recording | Native SVG ink, mouse and stylus input, same-browser sync, SVG persistence, drawing options, and screen capture |
| VS Code authoring | Slide outline and folding, top-level frontmatter completions and hover help, Markdown syntax highlighting, and Bun preview commands |

Vue-specific component APIs, Vite integrations,
Monaco IntelliSense, full TextMate regex and injection behavior, additional Shiki transformers, advanced VS Code tooling, other
PlantUML grammars, and the full KaTeX and Mermaid grammars still need porting. Refer to the [original Slidev skill](slidev-source/skills/slidev/SKILL.md)
for upstream deck syntax.
