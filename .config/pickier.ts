import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: false,
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/bin/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/bun.lock',
    '**/benchmarks/**',
    '**/.claude/**',
    '**/.zed/**',
    '**/skills/stacks-presentations/references/slidev-source/**',
    '**/test/fixtures/slidev-markdown/**',
    '**/packages/slidev/test/fixtures/**',
    // Retained Slidev sources that have yet to be ported to the Bun/STX runtime.
    '**/packages/client/context.ts',
    '**/packages/client/logic/slides.ts',
    '**/packages/slidev/node/commands/export.ts',
    '**/packages/slidev/node/syntax/shiki.ts',
    '**/packages/slidev/node/syntax/snippet.ts',
    '**/packages/slidev/node/virtual/nav-controls.ts',
    '**/packages/slidev/node/vite/**',
    '**/packages/slidev/template.md',
    '**/packages/create-app/template/slides.md',
    '**/packages/vscode/language-server/**',
    '**/packages/vscode/syntaxes/slidev.example.md',
  ],

  lint: {
    extensions: ['ts', 'js', 'md'],
    reporter: 'stylish',
    cache: false,
    maxWarnings: -1,
  },

  format: {
    extensions: ['ts', 'js', 'json', 'md', 'yaml', 'yml'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    quotes: 'single',
    semi: false,
  },

  rules: {
    noDebugger: 'error',
    noConsole: 'off',
  },

  pluginRules: {
    'ts/no-explicit-any': 'off',
    'ts/no-unused-vars': 'warn',
    'ts/no-top-level-await': 'off',
    'regexp/no-unused-capturing-group': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'style/brace-style': 'off',
    'style/max-statements-per-line': 'off',
    'markdown/heading-increment': 'error',
    'markdown/no-trailing-spaces': 'error',
    'markdown/fenced-code-language': 'warn',
    'markdown/no-inline-html': 'off',
    'markdown/reference-links-images': 'off',
    'markdown/single-title': 'off',
    'markdown/blanks-around-fences': 'off',
    'markdown/no-duplicate-heading': 'off',
    'markdown/single-trailing-newline': 'off',
    'markdown/link-image-style': 'off',
  },
}

export default config
