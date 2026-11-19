import type { PresentationAddon } from 'ts-presentation'
import { defineAddon } from 'ts-presentation'

const extension: PresentationAddon = defineAddon({
  name: 'slide-status',
  globalBottom: '<output id="example-slide-status" aria-label="Current slide"></output>',
  client: new URL('./status-client.ts', import.meta.url),
  styles: `
    #example-slide-status { position: fixed; inset: 12px 16px auto auto; color: #c7d6e4; font: 13px/1 system-ui; }
    body.capturing #example-slide-status { display: none; }
    @media print { #example-slide-status { display: none; } }
  `,
})

export default extension
