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
| Custom shortcuts | Browser-side `setup/shortcuts.ts` with named defaults, string key combinations, repeat control, and navigation actions. The `g` shortcut and `showGotoDialog()` action open a keyboard-operable search by slide number, title, or alias |
| Context menu | Browser-side `setup/context-menu.ts` with named actions, slide and presenter context, keyboard operation, and mode-specific frontmatter |
| Monaco editor and runner | Local editor and timed browser-worker runner. Bun compiles TypeScript edits in dev and can save opted-in snippets |
| Live editor sizing and gutters | Initial, automatic, and CSS-sized editors, inherited or per-fence line numbers, relative and interval numbering, custom starting lines, and read-only examples that can still run |
| Live editor feedback | Deck palettes and custom grammars. JavaScript and TypeScript syntax markers with selectable locations for authored code in static builds and for drafts in dev |
| Live editor wrapping | Per-fence `editorOptions.wordWrap` supports viewport, fixed-column, and bounded widths. Wrapped rows keep their line numbers, highlights, diagnostics, and automatic height aligned |
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
| Macro parameters and operator wrappers | Delimited and nested TeX parameters, expandable brace groups, semisimple groups that preserve surrounding operator spacing, inherited binary and relation spacing in bold symbols and stacked labels, and sans-serif italic math |
| Bra-ket and fraction layout | Scoped bar expansion for bra-ket notation and set builders, directional generalized fraction fences, nested unbraced fractions, and continued fraction numerator struts |
| Paired TeX delimiters | Macro-defined closing delimiters, invisible delimiters with TeX spacing, tight spacing and row-height stretch for middle delimiters under color declarations, closing-fence colors, and multiline formula bodies that honor the display break policy |
| Logical TeX relations | Expandable `\iff`, `\implies`, and `\impliedby` macros with spaced long arrows |
| Custom TeX operators and emphasis | Upright operator names with fractions, scripts, and scoped macros, style-aware limits for starred names, and nested `\emph` that alternates between italic and upright text |
| Mathtools relations and TeX fonts | Colon relation aliases and Unicode forms, scoped legacy font declarations, upright and italic Greek variants, named spacing, and nonbreaking inline spaces |
| KaTeX trust option | Opt-in links, URL labels, formula images, and HTML attributes through the KaTeX-shaped boolean or callback |
| KaTeX display options | Formatted `\tag` and `\tag*` labels, `leqno` for left-side equation tags, and `fleqn` for flush-left display formulas. Standalone `align`, `alignat`, and `gather` displays align row numbers at the margin and preserve per-row click highlights |
| AMS equation numbering | Automatic labels in rendered slide order, tags and suppression inside nested tables, and numbers preserved in range exports |
| AMS alignment and arrays | Paired operator spacing, equal alignment points across rows, explicit `alignat` counts, stable tag columns on short rows, starred matrix column alignment, scoped `\arraystretch`, and consecutive solid and dashed rules |
| Compact TeX arrays | `\substack` expands as a macro, including inside `\edef`. Stacks and small matrices use script-size rows inside nested scripts. Subarrays support left and centered rows, and small matrices use tighter column spacing |
| KaTeX line breaks | Inline wrapping after outer binary operators and relations, `\allowbreak` and `\nobreak` controls, standalone `\\` and `\newline` in math and text, macro-expanded row spacing, and `strict` handling for standalone display breaks |
| KaTeX strict diagnostics | Unicode text and unrecognized characters, end-of-formula comments, HTML extensions, text accents and strikeout in math, spacing units and modes, and overflowed array columns |
| Unicode math and text | Combining accents attached to math atoms and scripts, text-mode shaping of accented words, Unicode script and symbol validation, and original tokens in strict callbacks |
| KaTeX accents and annotations | Stacked overbracket and underbracket labels, scalable line segments, text-mode underbars, circled text, and macro-expanded accent arguments |
| KaTeX conditional macros | Mode-aware `\TextOrMath`, starred forms, token lookahead, and branch expansion in formulas, text, and `\edef`. Normal arguments retain the full expansion of a macro in their own scope. Scripts and roots without an index use primitive arguments |
| AMS ellipses | `\dots` chooses baseline, centered, or integral dots after one expansion of the next token. Explicit variants honor delimiter spacing, AMS markers, and author-defined macros |
| KaTeX legacy macros | Khan Academy color names and shades, literal token and active character snapshots with `\let`, whitespace-aware `\futurelet` lookahead, `\long` and `\global` assignment prefixes, multi-digit macro arity, and `\message` or `\errmessage` output during expansion |
| TeX character codes and scripts | `\char` expands decimal, octal, hexadecimal, and literal character codes inside macros, including eager definitions. Superscripts and subscripts accept `\relax` before the argument, and leading Unicode scripts render with an empty base |
| MathML number grouping | Leading decimals, braced digit groups, and braced thousands separators form one number. A single subscript or superscript attaches to the full number, and simultaneous upper and lower scripts preserve the final atom boundary |
| KaTeX math choices | `\mathchoice` selects display, text, script, and scriptscript branches with operator spacing from the enclosing row |
| KaTeX parser diagnostics | Macro declaration and scope checks, undefined commands in eager expansion, unexpected delimiters, text-mode command checks, and validation of expanded colors |
| KaTeX error display | Invalid formulas display their TeX source with a parser tooltip. Set `math.errorColor` for the error color or `math.throwOnError: true` to report parse errors in the build log while rendering the rest of the deck |
| KaTeX macro and color settings | Deck-scoped `globalGroup`, per-formula `maxExpand` including eager definitions, and two-argument `\color` via `colorIsTextColor` |
| Configured KaTeX macros | Deck frontmatter and `setup/katex.ts` accept TeX strings, active-character names, and KaTeX token-list expansions with argument delimiters and frozen tokens. Synchronous callbacks in `setup/katex.ts` can consume and expand tokens, inspect math or text mode, and set scoped or global definitions. The renderer compiles static definitions once per deck |
| KaTeX sizing settings | Signed TeX dimensions with optional spaces and trailing decimal points, `maxSize` for explicit dimensions, and `minRuleThickness` for fraction bars, array rules, box borders, and overlines or underlines |
| TeX horizontal spacing | Kern and skip lengths can combine macro-expanded signs, magnitudes, and units. Starred and unstarred `\hspace` expand inside definitions. Unbraced lengths consume trailing space inside text, while braced lengths preserve it |
| KaTeX text-mode boxes | Phantom space, selective height and depth removal, shifted line dimensions for `\raisebox`, text-style contents in horizontal, framed, colored, and actuarial boxes, and escaped verbatim text inside `\text{…}` |
| KaTeX text shape and font scope | TeX quote and dash ligatures in proportional text, literal paired quotes and dashes in typewriter text, scoped emphasis, and independent fonts in array cells and commutative diagrams. Embedded formulas reset the math font, and text inside those formulas recovers its surrounding named text family and weight |
| KaTeX math-mode boxes | `\phantom` retains atom spacing. `\hphantom` preserves signed kerns in math and text. Shifted `\rule` reserves space above and below the baseline, including zero-width struts |
| KaTeX enclosures | `\boxed` expands in math, text, and macro definitions with display-style contents. Framed and colored boxes use TeX padding. Diagonal cancellation strokes preserve the subject's layout and use a fixed thickness for each font size |
| PowerPoint export | Image slides or editable text, boxes, and Office Math equations with fractions, roots, scripts, matrices, operator limits, accents, and braces. Supported AMS displays export as equation arrays with separate tags and click-step opacity, or as positioned cells when row spacing varies. Single tags support bold text and inline math. Supported linear-gradient fills remain editable. Native equations carry picture alternatives, and more complex artwork is stored as separate images |
| PowerPoint equation enclosures and spacing | Frames, actuarial notation, cancellation strokes, and strikeout export as native Office Math border boxes. Phantom spaces, smashed dimensions, left-side scripts, and supported chemical isotope notation also stay editable. Serif, sans-serif, and typewriter text inside equations use Cambria, Arial, and Courier New respectively |
| Notes and Markdown export | `export-notes` prints notes with slide titles and numbers. `export --format md` links selected slide images and keeps raw speaker-note Markdown |
| Batch export | `export` and `export-notes` accept multiple entries. Each deck uses its own settings and can write beside its source or into a shared `--out` directory |
| PDF outlines | `--with-toc` or `export.withToc: true` adds nested bookmarks to exported and downloadable PDFs. Bookmarks honor the slide range and open the last exported reveal of each titled slide |
| Export rendering controls | `--dark` and `--light` select the capture color scheme. `--wait-until` selects the browser load milestone, `--wait` delays each frame, and `--timeout` sets the capture deadline. `data-waitfor` waits for visible content scoped to the authored element |
| Transparent exports | `--omit-background` or `export.omitBackground: true` removes the default canvas fill from PNGs, Markdown images, and PowerPoint exports. Authored backgrounds and artwork retain their alpha |
| Downloadable PDF in static builds | `build --download` or `download: true` generates a vector PDF and adds a player link that follows the deployment base. Set `download` to a PDF path or URL to link to an existing file |
| Audience builds without notes | `build --without-notes` omits speaker-note content and notes links from the static site while preserving the reveal timeline |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, sequence, state, class, ER, pie, timeline, journey, Gantt, Git history, XY charts, and Sankey diagrams |
| Draggable elements | Inline directives, drag and arrow components, frontmatter positions, scaled editing, and local Markdown saves |
| Imported Slidev diagrams | Compatibility fences translate the supported syntax to `ts-charts` input |
| Diagram theme CSS | `themeCSS` styles apply to the individual diagram, including nested media rules and local animations. Gantt task IDs and indexed selectors for sections, task states, commits, branches, and edges map to native SVG elements |
| XY charts | Native YAML and imported `xychart` fences render bar and line series with category or numeric axes, orientation, legends, labels, and palette overrides |
| Quadrant charts | Native YAML and imported `quadrantChart` fences render labeled quadrants, normalized points, point style classes and overrides, named themes, and accessible descriptions |
| Sankey diagrams | Weighted links from native YAML and imported CSV fences, with four alignments, gradient or solid links, and configurable node colors and labels |
| Gantt styles and dates | Full task labels wrap inside the chart, and compact rows account for both bars and labels. Supports literal leading hashes and semicolons in task names, task status palettes, multiline section headings, indented YAML options with multiline scalars, case-insensitive directives, fractional times, calendar durations and UTC ticks, short ISO start dates, and fixed SVG dimensions via `useMaxWidth: false` |
| Gantt markers and exclusions | Long vertical marker labels wrap below the time axis, and overlapping labels use separate rows. Repeated markers with the same ID, time, and label share one visible marker. Task starts accept a validated ISO fallback, while invalid ends warn and keep the task at its start. Whole-day adjustments honor exact formatted inclusion and exclusion tokens, keep ISO deadlines fixed, and adjust custom-formatted dates and `until` endpoints. Consecutive excluded days share a band on schedules shorter than six calendar years. Style the band with `.exclude-range` |
| Gantt themes | Named Mermaid palettes set the SVG background, section bands, grid, task states, and labels. Explicit theme variables override the selected palette. Today markers support RGB and HSL colors, opacity, line caps, and dash patterns |
| Gantt axes | Calendar axes default to full dates. Time labels include the date when the schedule crosses midnight. Top and bottom axes share tick positions and space out labels when ticks are dense. Imported intervals retain up to 10,000 ticks before falling back to automatic spacing. Imported `.grid .tick` and `.grid path` styles apply to the corresponding SVG groups and lines |
| Gantt local calendar | Gantt uses UTC by default. Set `config.gantt.timeZone: local` for an imported diagram or `timeZone: local` in native chart YAML to use the host time zone for dates, calendar durations, exclusions, and axes, including daylight saving changes. Diagrams with only scheduling directives display an empty axis |
| Gantt dependencies | Forward references across sections, latest `after` and earliest `until` matches, and warnings with a UTC reference-day fallback when every referenced task is missing. Automatic IDs skip names reserved by explicit IDs throughout the chart |
| GitGraph | Named Mermaid palettes, diagram padding, fixed SVG dimensions via `useMaxWidth: false`, graphs with just a header or branch declarations, complete branch and commit labels, and separate tag shapes with a shared width per commit in every orientation. Supports scoped `.tag-hole` CSS, commit and operation tooltips, custom symbols, cherry-pick source parents, and rounded connectors routed around intermediate commit dots. Branch labels sit at the start of vertical timelines, including the bottom of bottom-to-top graphs. Generated IDs skip authored IDs anywhere in the graph. Repeated authored commit IDs warn, preserve each node, and resolve later explicit commit references to the latest commit |
| GitGraph theme appearance | Classic themes use large commit symbols, dotted rails, and bold connectors. Redux themes use compact symbols, dashed rails, and square branch labels. The color variants cycle branch colors separately for labels and commits. Diagram theme variables can override the branch palette, rail color, and stroke width |
| GitGraph gradients and shadows | Neo themes give branch labels gradient borders using `gradientStart` and `gradientStop`. Set `useGradient: false` for solid borders. `look: neo` adds branch-label shadows, including the offset Redux shadow. Neo tag shadows and branch shadows support a CSS `drop-shadow()` value with pixel lengths and a color. Each SVG defines its own effects |
| PlantUML sequence diagrams | Local `ts-charts` rendering for messages, participants, notes, and groups |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Presenter timer | Stopwatch and countdown modes use the deck's `timer` and `duration` settings. Start, pause, resume, and reset in presenter mode. The notes view follows the same timer, including progress and overtime |
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
