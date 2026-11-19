# Slidev compatibility

The archived reference bundle comes from Slidev v53.1.0 and retains Anthony
Fu's MIT notice. It preserves tool usage and feature syntax for migrating
existing decks. Use the Stacks references for commands and supported features
in a new ts-presentation project.

| Upstream feature | Stacks equivalent |
| --- | --- |
| Markdown, frontmatter, slide includes, click steps | Native Bun parser and browser player with labeled separators, fenced YAML, and source ranges |
| Preparser extensions | Async raw-line, slide, and speaker-note hooks from `setup/preparser.ts` |
| Scoped layouts and themes | TypeScript theme and addon modules, named slots, deck CSS |
| Monaco editor and runner | Local editor and timed browser-worker runner. Bun compiles TypeScript edits in dev and can save opted-in snippets |
| Snippets, line highlights, Magic Move | Local file and region imports, numbered click highlights, native token animations |
| KaTeX | Native MathML with chemistry, ruled and compact arrays, commutative diagrams, bra-ket and set notation, mixed text and math, colored and raised boxes, zero-width overlaps, numbered alignment rows, scoped macros, custom fractions, and click highlighting |
| PowerPoint export | Image slides or editable text and boxes with separate artwork |
| First-party diagram authoring | YAML `charts` fences through `ts-charts` for flowcharts, timelines, user journeys, Gantt schedules, and Git histories |
| Mermaid syntax compatibility | Local flowchart, sequence, basic state, class, ER, pie, Gantt, GitGraph, timeline, and user journey rendering |
| Presenter mode | Two synced browser windows, notes, timer, resizable layouts, next-frame preview, and reveal seeking |
| Reveal scheduling | Absolute and relative steps, hide ranges, grouped and nested lists, CSS presets, and switch slots |
| Navigation context | Slide-local metadata, route aliases, reveal bounds, and navigation controls |
| Drawing and recording | Native SVG ink, mouse and stylus input, same-browser sync, SVG persistence, drawing options, and screen capture |

Existing Vue components, UnoCSS configuration, Monaco IntelliSense, Shiki
transformers, PlantUML, and the full KaTeX and Mermaid grammars need
additional ports. Keep the source deck when
a user needs those features later. Refer to the [Slidev guide](slidev-source/skills/slidev/SKILL.md)
for interpreting that source.
