import { expect, it } from 'bun:test'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../runtime/loader.ts'

const markdown = `---
layout: two-cols-header
---

# Slide Title

Default content with [internal link](#1) and [external](https://example.com)

Inline code: \`{{ code }}\` and math: $x^2$

::right::

<v-drag>Draggable content</v-drag>

$$ {1}
x^2
$$

::right::

<style>
.custom { color: blue; }
</style>

- item
   <<< @/snippets/snippet.ts#snippet {monaco}{propA:1}

\`\`\` [filename.ts]{1,2|3}{maxHeight:'200px'}
This is code block with:
- ::slot:: markers
- {{$math$}}
- <<< snippets
Should not transform
\`\`\`

text1
::bottom::
text2

\`\`\`mermaid {scale:0.5}
graph TD
  A --> B
\`\`\`

1. foo
   \`\`\`plantuml {scale:0.5}
   @startuml
   Alice -> Bob: Hello
   @enduml
   \`\`\`

2. bar
   \`\`\`\`md magic-move {prop:1,lines:true}
   \`\`\`ts
   a = 1
   \`\`\`
   \`\`\`ts {1}
   b = 2
   \`\`\`
   \`\`\`\`

> [!NOTE]
> Highlights information that users should take into account, even when skimming.

> [!TIP]
> Optional information to help a user be more successful.

> [!IMPORTANT]
> Crucial information necessary for users to succeed.

> [!WARNING]
> Critical content demanding immediate user attention due to potential risks.

> [!CAUTION]
> Negative potential consequences of an action.


`

it('compiles the copied Slidev deck fixture through the Bun and STX integration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-syntax-integration-'))
  try {
    await mkdir(join(root, 'snippets'))
    await copyFile(new URL('../../test/fixtures/snippets/snippet.ts', import.meta.url), join(root, 'snippets/snippet.ts'))
    const entry = join(root, 'slides.md')
    await Bun.write(entry, markdown)
    const { html } = await createDeckCompiler(entry, { liveCompile: true })()

    expect(html).toContain('class="two-cols-header"')
    expect(html).toContain('data-slide-link="1">internal link')
    expect(html).toContain('href="https://example.com" target="_blank"')
    expect(html).toContain('<code>{{ code }}</code>')
    expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
    expect(html).toContain('data-presentation-drag="box"')
    expect(html).toContain('data-equation-steps="1"')
    expect(html).toContain('.custom:where(#slide-1, #slide-1 *)')
    expect(html).toMatch(/<textarea[^>]*>\nfunction _foo\(\)/)
    expect(html).toContain('<figcaption>filename.ts</figcaption>')
    expect(html).toContain('data-code-ranges="1,2|3"')
    expect(html).toContain('style="max-height:200px"')
    const literal = html.match(/<figure[^>]*>[\s\S]*?<figcaption>filename\.ts<\/figcaption>[\s\S]*?<\/figure>/)?.[0].replace(/<\/?span\b[^>]*>/g, '')
    expect(literal).toContain('::slot:: markers')
    expect(literal).toContain('&lt;&lt;&lt; snippets')
    expect(html).toMatch(/class="col-bottom">[\s\S]*<p>text2<\/p>/)
    expect(html).toContain('aria-label="Flowchart"')
    expect(html).toContain('>Alice</tspan>')
    expect(html).toContain('>Hello</tspan>')
    expect(html).toContain('data-code-motion="true"')
    for (const title of ['Note', 'Tip', 'Important', 'Warning', 'Caution']) {
      expect(html).toContain(`class="markdown-alert markdown-alert-${title.toLowerCase()}"`)
      expect(html).toContain(`class="markdown-alert-title">${title}</p>`)
    }
    expect(html).not.toContain('language-plantuml')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('uses local PlantUML sequence layouts and retains unsupported grammars as source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-plantuml-'))
  try {
    const entry = join(root, 'slides.md')
    await Bun.write(entry, [
      '# Diagrams', '', '```plantuml {scale:0.5,title:"Sequence"}', '@startuml',
      'actor "Reviewer" as R', 'participant Approval', 'autonumber',
      'R -> Approval: Submit', 'R <-- Approval: Accepted',
      'note over R, Approval: Review complete', '@enduml', '```', '',
      '```plantuml', '@startuml', '!include external-resource', '@enduml', '```',
    ].join('\n'))
    const { html } = await createDeckCompiler(entry)()
    expect(html).toContain('>Reviewer</tspan>')
    expect(html).toContain('>Review complete</tspan>')
    expect(html).toContain('stroke-dasharray=')
    expect(html).toContain('>2. Accepted</tspan>')
    expect(html).toMatch(/<svg[^>]+aria-label="Sequence"[^>]+height="/)
    expect(html).toContain('<code class="language-plantuml">@startuml')
    expect(html).toContain('!include external-resource')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
