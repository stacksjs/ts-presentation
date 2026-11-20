import { compileLiveCode } from './compile-code.ts'
import { escapeHtml } from './html.ts'
import { nativeCodeLanguage } from '../../../types/src/code-runner.ts'

export function liveBlock(source: string, language: string, runnable: boolean, writable?: { token: string, revision: string }, runnerOptions?: Record<string, unknown>): string {
  const native = nativeCodeLanguage(language)
  const label = native === 'ts' ? 'TypeScript' : native === 'js' ? 'JavaScript' : escapeHtml(language)
  let initial = source
  let problem = ''
  if (runnable && native) {
    try {
      initial = compileLiveCode(source, native)
    }
    catch (error) {
      problem = error instanceof Error ? error.message : 'Could not compile the code block'
    }
  }
  const dataOptions = runnerOptions ? ` data-live-options="${escapeHtml(JSON.stringify(runnerOptions))}"` : ''
  return `<section class="live-code" data-language="${escapeHtml(language)}"${dataOptions}${writable ? ` data-snippet-token="${escapeHtml(writable.token)}" data-snippet-revision="${escapeHtml(writable.revision)}"` : ''}>
    <div class="live-code-toolbar">
      <span>${label}</span>
      <button type="button" data-live-reset>Reset</button>
      ${writable ? '<button type="button" data-live-save>Save snippet</button>' : ''}
      ${runnable && native === 'ts' ? '<button type="button" data-live-convert hidden>Edit as JavaScript</button>' : ''}
      ${runnable ? '<button type="button" data-live-run>Run</button>' : ''}
    </div>
    <textarea aria-label="Edit ${label} example" spellcheck="false" autocapitalize="off">${escapeHtml(source)}</textarea>
    ${writable ? '<output class="live-output" data-snippet-status aria-live="polite"></output>' : ''}
    ${runnable ? `<div class="live-output" data-live-result aria-live="polite"></div>
      ${native ? `<template data-live-program>${escapeHtml(initial)}</template>` : ''}
      ${problem ? `<template data-live-error>${escapeHtml(problem)}</template>` : ''}` : ''}
    <pre class="live-code-static"><code>${escapeHtml(source)}</code></pre>
  </section>`
}
