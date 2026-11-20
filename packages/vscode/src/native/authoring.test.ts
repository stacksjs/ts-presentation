import { expect, test } from 'bun:test'
import { inspectDeckSource, parseDeck, slideSourceOf } from '../../../parser/src/deck.ts'
import { frontmatterCompletions, frontmatterHelp, readAuthoringDocument } from './authoring.ts'

test('uses the native parser boundaries for outlines and folds in a CRLF deck', () => {
  const source = [
    '\uFEFF---',
    "title: 'Planning #1'",
    'theme: paper',
    '---',
    '',
    '~~~md',
    '## Fenced heading',
    '---',
    '~~~',
    '',
    '# Opening ##',
    '<!--',
    '## Speaker notes',
    '---',
    '-->',
    '',
    '---',
    '',
    '```yaml',
    'layout: two-cols',
    '```',
    '',
    '## Walkthrough',
    '',
    '---',
    'src: "./review.md"',
    '---',
    '',
  ].join('\r\n')
  const ranges = inspectDeckSource(source)
  expect(ranges.map(slide => slide.endLine)).toEqual(parseDeck(source).slides.map(slide => slideSourceOf(slide)!.endLine))
  expect(ranges[0].heading).toEqual({ line: 10, title: 'Opening' })
  expect(readAuthoringDocument(source).slides).toEqual([
    { index: 0, title: 'Planning #1', start: 0, end: 14, selection: 1, frontmatter: { start: 0, end: 3 } },
    { index: 1, title: 'Walkthrough', start: 18, end: 22, selection: 22, frontmatter: { start: 18, end: 20 } },
    { index: 2, title: 'Include ./review.md', start: 24, end: 26, selection: 25, frontmatter: { start: 24, end: 26 } },
  ])
})

test('offers deck and slide fields only inside the matching frontmatter', () => {
  const doc = readAuthoringDocument(['---', 'title: Outline', '', '---', '# First', 'theme: plain', '---', 'layout: cover', '', '---', '# Second'].join('\n'))
  const deckKeys = frontmatterCompletions(doc, 2, 0).map(item => item.label)
  const slideKeys = frontmatterCompletions(doc, 8, 0).map(item => item.label)
  expect(deckKeys).toContain('theme')
  expect(deckKeys).not.toContain('title')
  expect(slideKeys).toContain('routeAlias')
  expect(slideKeys).not.toContain('theme')
  expect(slideKeys).not.toContain('layout')
  expect(frontmatterCompletions(doc, 5, 7)).toEqual([])
  expect(frontmatterHelp(doc, 1, 2)).toEqual({ description: 'Override the title of this slide.', end: 5 })
  expect(frontmatterHelp(doc, 1, 8)).toBeUndefined()
  expect(frontmatterHelp(doc, 5, 0)).toBeUndefined()
})

test('replaces partial keys and values and keeps inline comments', () => {
  const initial = readAuthoringDocument('---\nlay\n---\n# Cover')
  expect(frontmatterCompletions(initial, 1, 3)).toEqual([{
    label: 'layout', description: 'Choose a built-in or custom slide layout.', insert: 'layout: ', start: 0, end: 3, isKey: true,
  }])
  const invalid = readAuthoringDocument('---\nlayout: tw # keep this note\nmath: [\n')
  expect(() => parseDeck(invalid.lines.join('\n'))).toThrow('Unclosed slide frontmatter')
  expect(frontmatterCompletions(invalid, 1, 10).map(({ insert, start, end }) => [insert, start, end]))
    .toEqual([['two-cols', 8, 10], ['two-cols-header', 8, 10]])
  const emptyValue = readAuthoringDocument('---\ncolorSchema:\n---')
  expect(frontmatterCompletions(emptyValue, 1, 12).map(item => item.insert)).toEqual([' auto', ' light', ' dark'])
})

test('gives ordinary prose and nested YAML no frontmatter field suggestions', () => {
  const doc = readAuthoringDocument('---\nmath:\n  trust: \n---\n# Topic\n\nlayout: two\n')
  expect(frontmatterCompletions(doc, 2, 9)).toEqual([])
  expect(frontmatterCompletions(doc, 6, 11)).toEqual([])
  expect(frontmatterHelp(doc, 2, 4)).toBeUndefined()
  expect(readAuthoringDocument('\n\n').slides).toEqual([])
})
