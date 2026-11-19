#!/usr/bin/env bun
import { fileURLToPath } from 'node:url'
import { scaffold } from '../create-app/scaffold.mjs'

await scaffold({
  command: 'create-ts-presentation-theme',
  defaultDirectory: 'ts-presentation-theme-starter',
  template: fileURLToPath(new URL('./template', import.meta.url)),
  files: ['README.md', 'example.md', 'index.ts', 'styles/layout.css', '_gitignore'],
})
