# Slidev test ports

The test baseline is Slidev v53.1.0 at
`b547b48fe86b60bd3a502d4217b33840273667dd`. Run
`bun test --timeout 45000` from the project root. Use `CHROME_BIN` to point at
Chrome if it lives outside the usual installation paths.

The inventory lists all 41 suites from the baseline. The
[case manifest](../../../test/fixtures/slidev-cases.json) maps 398 original cases
to Bun assertions. A string keeps the original test title. An array gives the
original title followed by the equivalent Bun test titles. The manifest expands
parameterized cases and maps Vite, Vue, and Playwright inputs to the corresponding
Bun and STX behavior. GitHub Actions checks those titles against the Bun JUnit
report and fails on missing assertions, failed tests, or skips. The five Cypress
suites run in Bun WebView with Chrome.

| Slidev suite | Bun port |
| --- | --- |
| `packages/client/builtin/KaTexBlockWrapper.test.ts` | `packages/client/builtin/KaTexBlockWrapper.test.ts` |
| `packages/client/composables/useNav.test.ts` | `packages/client/composables/useNav.test.ts` |
| `packages/client/logic/slidePath.test.ts` | `packages/client/logic/slidePath.test.ts` |
| `packages/client/logic/tweet.test.ts` | `packages/client/logic/tweet.test.ts` |
| `packages/parser/src/timesplit/timesplit.test.ts` | `packages/parser/src/timesplit/timesplit.test.ts` |
| `packages/parser/src/timesplit/timestring.test.ts` | `packages/parser/src/timesplit/timestring.test.ts` |
| `packages/parser/src/utils.test.ts` | `packages/parser/src/utils.test.ts` |
| `packages/slidev/node/commands/export.test.ts` | `packages/slidev/node/commands/export.test.ts` |
| `packages/slidev/node/commands/pptx/build.test.ts` | `packages/slidev/node/commands/pptx/build.test.ts` |
| `packages/slidev/node/commands/pptx/capture.test.ts` | `packages/slidev/node/commands/pptx/capture.test.ts` |
| `packages/slidev/node/commands/pptx/normalize.test.ts` | `packages/slidev/node/commands/pptx/normalize.test.ts` |
| `packages/slidev/node/commands/pptx/walker.test.ts` | `packages/slidev/node/commands/pptx/walker.test.ts` |
| `packages/slidev/node/integrations/drawings.test.ts` | `packages/slidev/node/integrations/drawings.test.ts` |
| `packages/slidev/node/options.test.ts` | `packages/slidev/node/options.test.ts` |
| `packages/slidev/node/resolver.test.ts` | `packages/slidev/node/resolver.test.ts` |
| `packages/slidev/node/syntax/codeblock/magic-move.test.ts` | `packages/slidev/node/syntax/codeblock/magic-move.test.ts` |
| `packages/slidev/node/syntax/codeblock/wrapper.test.ts` | `packages/slidev/node/syntax/codeblock/wrapper.test.ts` |
| `packages/slidev/node/syntax/drag.test.ts` | `packages/slidev/node/syntax/drag.test.ts` |
| `packages/slidev/node/syntax/escape-code.test.ts` | `packages/slidev/node/syntax/escape-code.test.ts` |
| `packages/slidev/node/syntax/integration.test.ts` | `packages/slidev/node/syntax/integration.test.ts` |
| `packages/slidev/node/syntax/katex.test.ts` | `packages/slidev/node/syntax/katex.test.ts` |
| `packages/slidev/node/syntax/link.test.ts` | `packages/slidev/node/syntax/link.test.ts` |
| `packages/slidev/node/syntax/scoped.test.ts` | `packages/slidev/node/syntax/scoped.test.ts` |
| `packages/slidev/node/syntax/shiki.test.ts` | `packages/slidev/node/syntax/shiki.test.ts` |
| `packages/slidev/node/syntax/slot-sugar.test.ts` | `packages/slidev/node/syntax/slot-sugar.test.ts` |
| `packages/slidev/node/syntax/snippet.test.ts` | `packages/slidev/node/syntax/snippet.test.ts` |
| `packages/slidev/node/utils.test.ts` | `packages/slidev/node/utils.test.ts` |
| `packages/vscode/src/utils/isSamePath.test.ts` | `packages/vscode/src/utils/isSamePath.test.ts` |
| `test/api-snapshots.test.ts` | `packages/slidev/test/api-snapshots.test.ts` |
| `test/import-guard.test.ts` | `packages/slidev/test/import-guard.test.ts` |
| `test/mcp.test.ts` | `packages/slidev/test/mcp.test.ts` |
| `test/mermaid-renderer.test.ts` | `packages/slidev/test/mermaid-renderer.test.ts` |
| `test/parser.test.ts` | `packages/slidev/test/parser.test.ts`, `test/slidev-parser.test.ts` |
| `test/side-editor.test.ts` | `packages/slidev/test/side-editor.test.ts`, `test/side-editor.test.ts` |
| `test/title-renderer-hmr.test.ts` | `packages/slidev/test/title-renderer-hmr.test.ts` |
| `test/utils.test.ts` | `packages/slidev/test/utils.test.ts`, `test/ported-authoring-utils.test.ts` |
| `cypress/e2e/examples/base-path.spec.ts` | `packages/slidev/test/base-path.test.ts`, `test/presenter-browser.test.ts` |
| `cypress/e2e/examples/basic.spec.ts` | `packages/slidev/test/base-path.test.ts`, `test/presenter-browser.test.ts`, `test/click-reveal-browser.test.ts`, `test/overview.test.ts`, `test/stx-layers.test.ts`, `test/slide-style-links.test.ts`, `test/stx-components.test.ts` |
| `cypress/e2e/examples/iframe-layout.spec.ts` | `packages/client/layouts/iframe.test.ts` |
| `cypress/e2e/examples/presenter-resizer.spec.ts` | `test/presenter-browser.test.ts` |
| `cypress/e2e/examples/smoke.spec.ts` | `test/presenter-browser.test.ts` |

The basic suite includes keyboard and overview navigation, named slots,
nested click groups, navigation interpolation, local styles, list items projected through STX slots, animation
presets and overrides, and code blocks inside reveals.

[Slidev v53.1.0 test sources](https://github.com/slidevjs/slidev/tree/b547b48fe86b60bd3a502d4217b33840273667dd)
