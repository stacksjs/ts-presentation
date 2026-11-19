---
name: stacks-presentations
description: Create, edit, rehearse, and export Markdown-based slide decks with ts-presentation. Use for technical presentations with interactive code, equations, diagrams, or speaker notes and for porting Slidev decks to the Stacks presentation toolkit.
---

# Stacks presentations

Use `ts-presentation` for a presentation the user wants to author in Markdown.
For an existing deck, open its entry file, theme and addons before editing.
Keep the deck content and screenshots in the user's project and put reusable
engines, layouts and generic examples in library projects.

## Work on a deck

1. Use `slides.md` or the entry the project already uses. A blank line after
   `---` starts a new slide. The first YAML block sets deck options. Later YAML
   blocks configure individual slides. A final HTML comment holds notes.
2. Run the project command if it has one. In a standalone toolkit checkout,
   run `bun src/cli.ts dev path/to/slides.md`. Use the printed loopback URL.
3. Keep the speaker's narration in the notes. Inspect the visible slides,
   code output, equations, and presenter transitions before delivery.

## References

- [Authoring and presenting](references/authoring.md) for slide includes, click
  steps, math, live code, and diagrams.
- [Themes and addons](references/extensions.md) for extension configuration,
  layouts, hooks, client scripts, and assets.
- [Export and verification](references/exporting.md) for PDF, PNG and PowerPoint.
- [Slidev reference](references/slidev-source/skills/slidev/SKILL.md) for
  interpreting Slidev decks and checking feature conventions. Refer to the
  [compatibility notes](references/compatibility.md) before applying upstream
  instructions to a Stacks deck.
