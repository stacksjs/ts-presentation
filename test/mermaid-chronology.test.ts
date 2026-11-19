import { expect, test } from 'bun:test'
import { mermaid, renderMermaid } from '../src/diagram.ts'
import { parseDeck, renderDeck } from '../src/index.ts'

const timeline = `timeline TD
  title A new feature
  accTitle: Release chronology
  accDescr {
    From exploration
    through general availability.
  }
  section Explore
    Research : Interview customers : Map alternatives
             : Record recurring themes
    Decision
  section Deliver
    Preview : Invite testers<br>and reviewers
    Launch : Publish the notes
`

const journey = `journey
  title Submitting a proposal
  section Draft
    Start a draft: 5: Author
    Request feedback: 2: Author, Reviewer, Author
  section Submit
    Address comments: 4: Author, Reviewer
    File proposal: 5
`

test('renders timeline sections and events in authored order with accessible metadata', () => {
  const svg = mermaid(timeline, 'release')
  expect(svg).toContain('data-direction="TD"')
  expect(svg).toContain('aria-labelledby="release-title"')
  expect(svg).toContain('aria-describedby="release-description"')
  expect(svg).toContain('<title id="release-title">Release chronology</title>')
  expect(svg).toContain('<desc id="release-description">From exploration through general availability.</desc>')
  expect(svg).toContain('aria-label="Release chronology"')
  expect(svg?.match(/class="diagram-timeline-section"/g)).toHaveLength(2)
  expect(svg?.match(/class="diagram-timeline-period"/g)).toHaveLength(4)
  expect(svg?.match(/class="diagram-timeline-event"/g)).toHaveLength(5)
  expect(svg!.indexOf('Interview customers')).toBeLessThan(svg!.indexOf('Record recurring'))
  expect(svg).toContain('>Invite testers</tspan>')
  expect(svg).toContain('>and reviewers</tspan>')
})

test('supports left-to-right timelines, config direction, and custom period colors', async () => {
  const input = 'timeline\nFirst : Design proposal\nSecond : Build the proposal\n'
  const settings = {
    timeline: { direction: 'TD', disableMulticolor: true },
    themeVariables: { cScale0: '#334455', cScaleLabel0: '#eeeeee', cScale1: '#884422' },
  }
  const svg = await renderMermaid(input, 'colors', settings, { theme: 'neutral', title: 'Roadmap' })
  expect(svg).toContain('aria-label="Roadmap"')
  expect(svg).toContain('data-direction="TD"')
  expect(svg).toContain('data-diagram-theme="neutral"')
  expect(svg?.match(/--chronology-fill:#334455;--chronology-ink:#eeeeee/g)).toHaveLength(4)
  expect(svg).not.toContain('#884422')
  const horizontal = mermaid(input.replace('timeline', 'timeline LR'), 'horizontal', settings)
  expect(horizontal).toContain('data-direction="LR"')
})

test('plots scores and lists actor assignments for Mermaid journeys', () => {
  const svg = mermaid(journey, 'proposal', { journey: { actorColours: ['#004488', '#ee7733'], sectionFills: ['#e6f1f2'] } })
  expect(svg).toContain('aria-label="Submitting a proposal"')
  expect(svg?.match(/class="diagram-journey-section"/g)).toHaveLength(2)
  expect([...svg!.matchAll(/data-score="(\d)"/g)].map(match => match[1])).toEqual(['5', '2', '4', '5'])
  expect(svg?.match(/<title>Author<\/title>/g)).toHaveLength(3)
  expect(svg?.match(/<title>Reviewer<\/title>/g)).toHaveLength(2)
  expect(svg).toContain('Request feedback, 2 out of 5, Author, Reviewer')
  expect(svg).toMatch(/class="diagram-journey-trajectory"[^>]* d="M[^"]+L[^"]+"/)
  expect(svg).toContain('fill="#004488"')
  expect(svg).toContain('fill="#ee7733"')
})

test('retains unsupported or invalid syntax as code and escapes diagram labels', async () => {
  const calendar = 'timeline\n: Orphaned entry'
  const html = await renderDeck(parseDeck(['# Details', '', '~~~mermaid', calendar, '~~~'].join('\n')))
  expect(html).toContain('class="language-mermaid"')
  expect(html).not.toContain('data-diagram-kind')
  expect(mermaid('journey\nRate this: 6: Author', 'invalid')).toBeUndefined()
  expect(mermaid('journey\nRate this: 2.5: Author', 'invalid')).toBeUndefined()
  expect(mermaid('timeline\naccDescr {\nUnclosed\nFirst : Thing', 'invalid')).toBeUndefined()
  const escaped = mermaid('timeline\naccTitle: <Title>\nFirst : <em>not markup</em>', 'clean')
  expect(escaped).toContain('&lt;Title&gt;')
  expect(escaped).toContain('&lt;em&gt;not')
  expect(escaped).not.toContain('<em>')
})

test('uses the custom Mermaid renderer before built-in diagram dispatch', async () => {
  const html = await renderMermaid(timeline, 'custom', { timeline: { direction: 'TD' } }, { theme: 'dark' },
    (code, options) => {
      expect(code).toBe(timeline.trim())
      expect(options).toEqual({ timeline: { direction: 'TD' }, theme: 'dark' })
      return '<svg role="img" aria-label="Custom road map" viewBox="0 0 40 40"></svg>'
    })
  expect(html).toContain('aria-label="Custom road map"')
  expect(html).toContain('data-diagram-theme="dark"')
})
