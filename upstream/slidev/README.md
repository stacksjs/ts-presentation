# Slidev v53.1.0 source

The `packages/` and `test/` trees are copied from
[Slidev v53.1.0](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd).
The original [MIT license](LICENSE) credits Anthony Fu and the Slidev
community. The full upstream tree is available at the same commit in this
repository's Git history.

| Package | Upstream responsibility |
| --- | --- |
| `client` | Player, presenter views, built-in layouts, and components |
| `create-app` | Deck scaffolding and starter templates |
| `create-theme` | Theme scaffolding and starter templates |
| `parser` | Slide Markdown, frontmatter, and notes |
| `slidev` | CLI, build, development server, and export |
| `types` | Shared configuration and extension types |
| `vscode` | Editor integration |

Install and run the Bun port from the repository root. Its build and tests
use the active sources in `src/` and `test/`. The snapshot's manifests
remain intact for reading and porting subsequent features, with the
snapshot excluded from the root dependency graph and test discovery.

The editable PowerPoint port uses the upstream walker, color parser, and
normalization in `src/editable/`. Bun WebView handles Chromium capture,
and the port's Open XML writer emits the PowerPoint file. The adapted
normalization suite runs with `bun:test`.
