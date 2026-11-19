import { compileLiveCode } from './compile-code.ts'
import { escapeHtml } from './html.ts'

export function liveBlock(source: string, language: 'js' | 'ts', runnable: boolean): string {
  const label = language === 'ts' ? 'TypeScript' : 'JavaScript'
  let initial = source
  let problem = ''
  if (runnable) {
    try {
      initial = compileLiveCode(source, language)
    }
    catch (error) {
      problem = error instanceof Error ? error.message : 'Could not compile the code block'
    }
  }
  return `<section class="live-code" data-language="${language}">
    <div class="live-code-toolbar">
      <span>${label}</span>
      <button type="button" data-live-reset>Reset</button>
      ${runnable && language === 'ts' ? '<button type="button" data-live-convert hidden>Edit as JavaScript</button>' : ''}
      ${runnable ? '<button type="button" data-live-run>Run</button>' : ''}
    </div>
    <textarea aria-label="Edit ${label} example" spellcheck="false" autocapitalize="off">${escapeHtml(source)}</textarea>
    ${runnable ? `<pre class="live-output" aria-live="polite"></pre>
      <template data-live-program>${escapeHtml(initial)}</template>
      ${problem ? `<template data-live-error>${escapeHtml(problem)}</template>` : ''}` : ''}
    <pre class="live-code-static"><code>${escapeHtml(source)}</code></pre>
  </section>`
}
