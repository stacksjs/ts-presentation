# Slidev test ports

The test baseline is Slidev v53.1.0 at
`b547b48fe86b60bd3a502d4217b33840273667dd`. Run
`bun test --timeout 45000` from the project root. Use `CHROME_BIN` to point at
Chrome if it lives outside the usual installation paths.

The 28 upstream test files under `packages/` have Bun ports at their original
paths. The upstream repository-level suites run from these locations.

| Slidev suite | Bun port |
| --- | --- |
| `test/api-snapshots.test.ts` | `packages/slidev/test/api-snapshots.test.ts` |
| `test/import-guard.test.ts` | `packages/slidev/test/import-guard.test.ts` |
| `test/mcp.test.ts` | `packages/slidev/test/mcp.test.ts` |
| `test/mermaid-renderer.test.ts` | `packages/slidev/test/mermaid-renderer.test.ts` |
| `test/parser.test.ts` | `packages/slidev/test/parser.test.ts`, `test/slidev-parser.test.ts` |
| `test/side-editor.test.ts` | `packages/slidev/test/side-editor.test.ts`, `test/side-editor.test.ts` |
| `test/title-renderer-hmr.test.ts` | `packages/slidev/test/title-renderer-hmr.test.ts` |
| `test/utils.test.ts` | `packages/slidev/test/utils.test.ts`, `test/ported-authoring-utils.test.ts` |

The five Cypress files are ported to Bun WebView. The specs exercise the
native player, presenter, and export paths in Chrome.

| Slidev browser suite | Bun port |
| --- | --- |
| `base-path.spec.ts` | `packages/slidev/test/base-path.test.ts`, `test/presenter-browser.test.ts` |
| `basic.spec.ts` | `packages/slidev/test/base-path.test.ts`, `test/presenter-browser.test.ts`, `test/click-reveal-browser.test.ts`, `test/overview.test.ts`, `test/stx-layers.test.ts`, `test/slide-style-links.test.ts`, `test/stx-components.test.ts` |
| `iframe-layout.spec.ts` | `packages/client/layouts/iframe.test.ts` |
| `presenter-resizer.spec.ts` | `test/presenter-browser.test.ts` |
| `smoke.spec.ts` | `test/presenter-browser.test.ts` |

The basic suite includes keyboard and overview navigation, named slots,
nested click groups, navigation interpolation, list items projected through STX slots, animation
presets and overrides, and code blocks inside reveals.

[Slidev v53.1.0 test sources](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd)
