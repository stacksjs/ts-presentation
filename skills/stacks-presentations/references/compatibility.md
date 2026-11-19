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
| Monaco editor and runner | Local editor and timed browser-worker runner. Bun compiles TypeScript edits in dev and can save opted-in snippets |
| Snippets, line highlights, Magic Move | Local file and region imports, numbered click highlights, native token animations |
| Syntax highlighting themes | `codeTheme` or a local `setup/code-highlighter.ts` selects a first-party palette |
| Code groups and copying | Comark code tabs, synchronized presenter selection, source and live editor copying |
| KaTeX | Native MathML with AMS binary and relation symbols, chemistry, ruled and compact arrays, commutative diagrams, sized and paired delimiters, prime and Unicode scripts, explicit atom classes and operator limits, modular and negated relations, mixed text and math, scoped font sizing, colored and raised boxes, phase and actuarial notation, zero-width overlaps, numbered alignment rows, scoped macros and lookahead, infix and generalized fractions, and click highlighting |
| PowerPoint export | Image slides or editable text and boxes with separate artwork |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, sequence, state, class, ER, pie, timeline, journey, Gantt, and Git history |
| Draggable elements | Inline directives, drag and arrow components, frontmatter positions, scaled editing, and local Markdown saves |
| Imported Slidev diagrams | Compatibility fences translate the supported syntax to `ts-charts` input |
| PlantUML sequence diagrams | Local `ts-charts` rendering for messages, participants, notes, and groups |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Reveal scheduling | Absolute and relative steps, hide ranges, grouped and nested lists, CSS presets, and switch slots |
| Navigation context | Slide-local metadata, route aliases, reveal bounds, and native links to slides and reveal steps |
| Drawing and recording | Native SVG ink, mouse and stylus input, same-browser sync, SVG persistence, drawing options, and screen capture |

Copied Vue components, Vite integrations, Monaco IntelliSense, Shiki transformers,
VS Code language tooling, other PlantUML grammars, and the full KaTeX and Mermaid grammars still
need porting. Refer to the [original Slidev skill](slidev-source/skills/slidev/SKILL.md)
for upstream deck syntax.
