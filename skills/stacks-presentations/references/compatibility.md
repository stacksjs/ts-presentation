# Slidev compatibility

The archived reference bundle comes from Slidev v53.1.0 and retains Anthony
Fu's MIT notice. It preserves tool usage and feature syntax for migrating
existing decks. Use the Stacks references for commands and supported features
in a new ts-presentation project.

| Upstream feature | Stacks equivalent |
| --- | --- |
| Markdown, frontmatter, slide includes, click steps | Native Bun parser and browser player |
| Scoped layouts and themes | TypeScript theme and addon modules, named slots, deck CSS |
| Monaco editor and runner | Local editor and timed browser-worker runner. TypeScript compilation for edits uses Bun in dev |
| KaTeX | Native MathML with deck macros, TeX delimiters and tagged equations |
| PowerPoint export | Image slides or editable text and boxes with separate artwork |
| Mermaid | Local flowchart, sequence, and basic state rendering |
| Presenter mode | Two synced browser windows, notes and timer |
| Drawing and recording | Canvas drawing and browser screen capture |

Existing Vue components, UnoCSS configuration, Monaco IntelliSense, Shiki
transformers, PlantUML, and the full KaTeX and Mermaid grammars need
additional ports. Keep the source deck when
a user needs those features later. Refer to the [upstream guide](upstream/skills/slidev/SKILL.md)
for interpreting that source.
