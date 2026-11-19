import { compileLiveCode } from './compile-code.ts'
import { escapeHtml } from './html.ts'

export function liveBlock(source: string, language: 'js' | 'ts', runnable: boolean, writable?: { token: string, revision: string }): string {
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
  return `<section class="live-code" data-language="${language}"${writable ? ` data-snippet-token="${escapeHtml(writable.token)}" data-snippet-revision="${escapeHtml(writable.revision)}"` : ''}>
    <div class="live-code-toolbar">
      <span>${label}</span>
      <button type="button" data-live-reset>Reset</button>
      ${writable ? '<button type="button" data-live-save>Save snippet</button>' : ''}
      ${runnable && language === 'ts' ? '<button type="button" data-live-convert hidden>Edit as JavaScript</button>' : ''}
      ${runnable ? '<button type="button" data-live-run>Run</button>' : ''}
    </div>
    <textarea aria-label="Edit ${label} example" spellcheck="false" autocapitalize="off">${escapeHtml(source)}</textarea>
    ${writable ? '<output class="live-output" data-snippet-status aria-live="polite"></output>' : ''}
    ${runnable ? `<pre class="live-output" aria-live="polite"></pre>
      <template data-live-program>${escapeHtml(initial)}</template>
      ${problem ? `<template data-live-error>${escapeHtml(problem)}</template>` : ''}` : ''}
    <pre class="live-code-static"><code>${escapeHtml(source)}</code></pre>
  </section>`
}
