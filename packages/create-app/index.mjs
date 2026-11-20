#!/usr/bin/env bun
import { fileURLToPath } from 'node:url'
import { scaffold } from './scaffold.mjs'

await scaffold({
  command: 'create-ts-presentation',
  defaultDirectory: 'presentation',
  template: fileURLToPath(new URL('./template', import.meta.url)),
  files: ['README.md', 'slides.md', '_gitignore', 'components/Counter.stx'],
})
