import type { PresentationTheme } from 'ts-presentation'
import { defineTheme } from 'ts-presentation'

const extension: PresentationTheme = defineTheme({
  name: 'lecture',
  styles: `
    [data-theme="lecture"] .slide { background: #eaf0f3; color: #132b40; color-scheme: light }
    [data-theme="lecture"] .slide a { color: #00556a }
    [data-theme="lecture"] .slide pre { color: #edf5ff }
    [data-theme="lecture"] .slide-diagram { background: #14202c; border-radius: 0.4em }
    [data-theme="lecture"] .live-code { color: #edf5ff; color-scheme: dark }
    .example-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 2em; }
  `,
  layouts: {
    compare: ({ html, slots }) => `<div class="example-columns"><div>${html}</div><div>${slots.right ?? ''}</div></div>`,
  },
})

export default extension
