import { checkLiveCode, compileLiveCode } from './compile-code.ts'
import type { CompileLiveCode, LiveProgram } from './compile-code.ts'
import { escapeHtml } from './html.ts'
import { nativeCodeLanguage } from '../../../types/src/code-runner.ts'
import type { LiveDiagnostic } from '../../../types/src/live-diagnostic.ts'
import { liveLineNumbers } from '../../../client/runtime/live-editor.ts'
import type { CodeBlockInfo } from './code-blocks.ts'

export async function liveBlock(source: string, language: string, info: CodeBlockInfo, options: {
  lineNumbers: boolean
  highlighted?: string[]
  includeDiagnostics: boolean
  writable?: { token: string, revision: string }
  compile?: CompileLiveCode
}): Promise<string> {
  const { lineNumbers, highlighted, includeDiagnostics, writable, compile = compileLiveCode } = options
  const { editorOptions, runnerOptions, runnerTiming: timing, start, maxHeight } = info
  const readonly = editorOptions?.readonly === true
  const saveable = readonly ? undefined : writable
  const runnable = info.runner === 'run'
  const native = nativeCodeLanguage(language)
  const label = native === 'ts' ? 'TypeScript' : native === 'js' ? 'JavaScript' : escapeHtml(language)
  const diagnostics: LiveDiagnostic[] | undefined = native && includeDiagnostics ? [] : undefined
  let initial: LiveProgram | undefined
  let problem = ''
  if (runnable && native) {
    try {
      initial = await compile(source, native)
    }
    catch (error) {
      diagnostics?.push(...checkLiveCode(source, native))
      problem = diagnostics?.length
        ? diagnostics.map(diagnostic => diagnostic.message).join('\n')
        : error instanceof Error ? error.message : 'Could not compile the code block'
    }
  }
  else if (native && diagnostics) diagnostics.push(...checkLiveCode(source, native))
  const dataOptions = runnerOptions ? ` data-live-options="${escapeHtml(JSON.stringify(runnerOptions))}"` : ''
  const automatic = timing?.autorun ? ` data-live-autorun="${timing.autorun}"` : ''
  const reveal = timing?.outputAt ? ` data-click="${escapeHtml(timing.outputAt)}"` : ''
  const numbering = editorOptions?.lineNumbers ?? ((info.lines ?? lineNumbers) ? 'on' : 'off')
  const height = editorOptions?.height ?? 'initial'
  const mode = height === 'initial' || height === 'auto' ? height : 'fixed'
  const count = source.split('\n').length
  const size = mode === 'fixed' ? `--live-code-height:${height}` : `--live-code-rows:${count}`
  const wrap = editorOptions?.wordWrap
  const wrapping = wrap && wrap !== 'off'
  const styles = [size, maxHeight && `--live-code-max-height:${maxHeight}`,
    wrapping && wrap !== 'on' && `--live-code-wrap-column:${editorOptions?.wordWrapColumn ?? 80}`,
    numbering !== 'off' && `--live-code-digits:${String(start + count - 1).length}`].filter(Boolean).join(';')
  const gutter = numbering === 'off' ? ''
    : `<div class="live-code-gutter" aria-hidden="true"><div data-live-gutter>${liveLineNumbers(count, start, numbering)}</div></div>`
  return `<section class="live-code" data-language="${escapeHtml(language)}"${dataOptions}${automatic}${saveable ? ` data-snippet-token="${escapeHtml(saveable.token)}" data-snippet-revision="${escapeHtml(saveable.revision)}"` : ''}>
    <div class="live-code-toolbar">
      <span>${label}</span>
      ${readonly ? '' : '<button type="button" data-live-reset>Reset</button>'}
      ${saveable ? '<button type="button" data-live-save>Save snippet</button>' : ''}
      ${runnable && native === 'ts' && !readonly ? '<button type="button" data-live-convert hidden>Edit as JavaScript</button>' : ''}
      ${runnable ? '<button type="button" data-live-run>Run</button>' : ''}
    </div>
    <div class="live-code-editor" data-live-height="${mode}" data-live-start="${start}"${gutter ? ` data-live-numbering="${numbering}"` : ''}${wrapping ? ` data-live-wrap="${wrap}"` : ''} style="${styles}">
      <div class="live-code-highlight" aria-hidden="true"><div></div></div>
      ${diagnostics ? '<div class="live-code-marks" aria-hidden="true" hidden><div></div></div>' : ''}
      ${gutter}<textarea aria-label="${readonly ? '' : 'Edit '}${label} example" wrap="${wrapping ? 'soft' : 'off'}" spellcheck="false" autocapitalize="off"${readonly ? ' readonly' : ''}>
${escapeHtml(source)}</textarea>
    </div>
    ${diagnostics ? '<ul class="live-code-diagnostics" aria-live="polite"></ul>' : ''}
    ${diagnostics?.length ? `<template data-live-diagnostics>${escapeHtml(JSON.stringify(diagnostics))}</template>` : ''}
    ${saveable ? '<output class="live-output" data-snippet-status aria-live="polite"></output>' : ''}
    ${runnable ? `<div class="live-output" data-live-result aria-live="polite"${reveal}></div>
      ${initial ? `<template data-live-program${initial.module ? ' data-live-module' : ''}>${escapeHtml(initial.code)}</template>` : ''}
      ${problem ? `<template data-live-error>${escapeHtml(problem)}</template>` : ''}` : ''}
    <pre class="live-code-static"><code>${highlighted?.join('\n') ?? escapeHtml(source)}</code></pre>
  </section>`
}
